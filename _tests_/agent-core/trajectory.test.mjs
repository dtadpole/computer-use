import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'

import { buildInfo, createRecorder, formatReplay, newRunId, pruneRuns, readRun, redactAction, redactTyped } from '../../_tools_/agent-core/trajectory.mjs'
import { CARD } from '../fixture-shapes/shapes.mjs'

let dir
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cu-traj-test-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

test('run ids are UTC stamps with a random suffix', () => {
  assert.match(newRunId(new Date('2026-11-01T10:20:30.456Z')), /^20261101T102030Z-[0-9a-f]{6}$/)
  assert.notEqual(newRunId(), newRunId())
})

test('the recorder writes run.json, events.jsonl and screenshots with hashes, mode 700', () => {
  const recorder = createRecorder({ dir, runId: '20261101T000000Z-abcdef' })
  assert.equal(statSync(recorder.dir).mode & 0o777, 0o700)
  recorder.writeHeader({ task: { text: 't', meta: { taskId: 'pickup-details', seed: 7 } }, build: { commit: 'abc', dirty: false } })
  const shot = recorder.screenshot(3, Buffer.from('png'))
  assert.deepEqual(shot, { path: join('screenshots', 'step-0003.png'), sha256: createHash('sha256').update('png').digest('hex') })
  assert.deepEqual(readFileSync(join(recorder.dir, shot.path)), Buffer.from('png'))
  assert.equal(recorder.screenshot(3, Buffer.from('z'), { zoom: 1 }).path, join('screenshots', 'zoom-0003-1.png'))
  recorder.event('model_turn', 1, { stop: 'call', message: 'clicking' })
  recorder.event('action', 1, { index: 0, action: { type: 'click' }, status: 'done', completed: true })
  recorder.end({ status: 'completed', finalMessage: 'done' })
  const { header, events } = readRun(recorder.dir)
  assert.equal(header.schema, 'cu-trajectory/v1')
  assert.deepEqual(header.task.meta, { taskId: 'pickup-details', seed: 7 })
  assert.deepEqual(header.build, { commit: 'abc', dirty: false })
  assert.equal(header.result.status, 'completed')
  assert.deepEqual(events.map((e) => [e.seq, e.kind]), [[1, 'model_turn'], [2, 'action']])
  assert.match(formatReplay({ header, events }), /step 1 {2}model call: clicking\n {2}0\. click done\nresult completed: done/)
})

test('typed text into sensitive targets is redacted; placeholders stay', () => {
  assert.deepEqual(redactAction({ type: 'type', text: 'hunter2' }, { sensitive: true }), { type: 'type', text: '[redacted, 7 chars]' })
  assert.deepEqual(redactAction({ type: 'type', text: '{{secret:login}}' }, { sensitive: true }), { type: 'type', text: '{{secret:login}}' })
  assert.deepEqual(redactAction({ type: 'type', text: 'Ada' }), { type: 'type', text: 'Ada' })
  assert.deepEqual(redactAction({ type: 'click', x: 1 }, { sensitive: true }), { type: 'click', x: 1 })
})

test('retention removes only runs both beyond the newest 50 and older than 14 days', () => {
  const now = Date.parse('2026-11-01T00:00:00Z')
  for (let i = 0; i < 53; i += 1) {
    const name = `202610${String(1 + (i % 28)).padStart(2, '0')}T${String(i).padStart(6, '0')}Z-${i.toString(16).padStart(6, '0')}`
    mkdirSync(join(dir, name))
    const age = i < 2 ? 30 : 1 // the two oldest names are also old on disk
    utimesSync(join(dir, name), new Date(now - age * 86_400_000), new Date(now - age * 86_400_000))
  }
  mkdirSync(join(dir, 'not-a-run'))
  const removed = pruneRuns(dir, { now: () => now })
  assert.equal(removed.length, 2)
  assert.equal(pruneRuns(join(dir, 'missing')).length, 0)
})

test('build info reports the commit and a dirty flag, and fails safe', () => {
  const calls = []
  const fake = (cmd, args) => {
    calls.push(args)
    return args[0] === 'rev-parse' ? 'abc123\n' : ' M file.mjs\n'
  }
  assert.deepEqual(buildInfo({ run: fake }), { commit: 'abc123', dirty: true })
  assert.deepEqual(calls[1].slice(0, 2), ['--no-optional-locks', 'status'], 'reading the build never takes index.lock')
  assert.deepEqual(buildInfo({ run: () => { throw new Error('no git') } }), { commit: null, dirty: true })
  const real = buildInfo()
  assert.match(real.commit ?? '', /^[0-9a-f]{40}$/)
  assert.equal(typeof real.dirty, 'boolean')
})

test('replay shows a consent request as a question and only the answer as approved or declined', () => {
  const dir2 = mkdtempSync(join(tmpdir(), 'cu-traj-test-'))
  try {
    const recorder = createRecorder({ dir: dir2, runId: '20261101T000000Z-c0ffee' })
    recorder.writeHeader({ task: { text: 't' } })
    recorder.event('consent', 2, { phase: 'request', request: { id: 'c', kind: 'action', origin: 'policy', class: 'purchase', what: 'click "Pay" on shop (purchase)' } })
    recorder.event('consent', 2, { phase: 'answer', request: { id: 'c', kind: 'action', class: 'purchase' }, answer: { approved: true, lifetime: 'once', answeredBy: 'live' } })
    recorder.end({ status: 'completed' })
    const text = formatReplay(readRun(recorder.dir))
    assert.match(text, /consent asked \(policy\): purchase - click "Pay" on shop \(purchase\)\n {2}consent purchase: approved by live/)
    assert.doesNotMatch(text, /declined by undefined/)
  } finally {
    rmSync(dir2, { recursive: true, force: true })
  }
})

test('redactTyped strips typed text from canonical actions and Claude type calls, keeping placeholders', () => {
  assert.deepEqual(redactTyped([{ type: 'type', text: 'hunter2' }, { type: 'type', text: '{{secret:pw}}' }, { type: 'click', x: 1 }]),
    [{ type: 'type', text: '[typed 7 chars; see the action record]' }, { type: 'type', text: '{{secret:pw}}' }, { type: 'click', x: 1 }])
  const claude = [{ role: 'assistant', content: [{ type: 'tool_use', id: 't', name: 'type', toolset_name: 'computer', input: { text: CARD } }] }]
  assert.equal(redactTyped(claude)[0].content[0].input.text, '[typed 19 chars; see the action record]')
})

test('recorder.event returns the line as written, secret values scrubbed; recorder.scrub scrubs any text the same way', () => {
  const recorder = createRecorder({ dir, runId: '20261101T000000Z-fedcba' })
  recorder.writeHeader({ task: { text: 't', meta: null } })
  const value = 'Hidden "Value" 99'
  recorder.addSecret(value)
  const line = recorder.event('note', 1, { message: `typed ${value}`, url: `http://x/?p=${encodeURIComponent(value)}` })
  assert.deepEqual(line, readRun(recorder.dir).events[0], 'the returned line is the written one')
  assert.equal(line.message, 'typed [secret]')
  assert.equal(line.url, 'http://x/?p=[secret]')
  assert.ok(!JSON.stringify(line).includes('Hidden'))
  assert.equal(recorder.scrub(`a ${value} b`), 'a [secret] b')
  assert.equal(recorder.scrub('nothing secret'), 'nothing secret')
})
