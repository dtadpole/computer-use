import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { readStoppedMarker, stoppedText } from '../../_environments_/macos-desktop/helper-link.mjs'
import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { fakeLauncher, logged, scratchLocks, stopFake } from './harness.mjs'

/**
 * CU-227's driver half (helper-boundary 0.3.8, row (b)): a helper whose end watchdog fired writes stopped.json beside
 * the held-keys marker and exits 70. A helper started by LaunchServices is not the driver's child, so the file is how the
 * driver learns it: the link's loss then reads as the helper stopping (helper_lost, details.stopped), never as a plain
 * 'the helper exited'; the file is removed once read, and one left from before the run is removed unread.
 */

const FIXTURE = 'com.example.fixture'
const dir = mkdtempSync(join(tmpdir(), 'cu-227-'))
const locks = scratchLocks()
after(() => { locks.remove(); rmSync(dir, { recursive: true, force: true }) })
const launchOnFake = fakeLauncher(locks, { apps: [FIXTURE] })
let n = 0
const marker = () => join(dir, `stopped-${(n += 1)}.json`)
const world = (extra = {}) => ({
  displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 800, height: 600 }, scale: 1 }],
  apps: [{ bundleId: FIXTURE, pid: 601, title: 'Fixture', rect: { x: 0, y: 0, width: 800, height: 600 } }],
  frontmost: FIXTURE,
  ...extra,
})

test('CU-227 driver: readStoppedMarker reads a fresh, well-formed file once and removes it; stale, malformed or linked files read as null', () => {
  const now = Date.parse('2026-11-08T19:40:00Z')
  const fresh = marker()
  writeFileSync(fresh, JSON.stringify({ reason: 'socket lost', released: 2, at: new Date(now - 1000).toISOString() }))
  assert.deepEqual(readStoppedMarker(fresh, { since: now - 60_000, now }), { reason: 'socket lost', released: 2 })
  assert.equal(existsSync(fresh), false, 'removed once read')
  const stale = marker()
  writeFileSync(stale, JSON.stringify({ reason: 'socket lost', released: 1, at: new Date(now - 3_600_000).toISOString() }))
  assert.equal(readStoppedMarker(stale, { since: now - 60_000, now }), null, 'written before this link')
  assert.equal(existsSync(stale), false, 'a stale file is removed too')
  const odd = marker()
  writeFileSync(odd, JSON.stringify({ reason: 'held\nkeys: Command', released: 'two', at: new Date(now).toISOString() }))
  assert.deepEqual(readStoppedMarker(odd, { since: now - 1000, now }), { reason: 'unknown', released: null }, 'free text and a bad count are not passed on')
  const garbage = marker()
  writeFileSync(garbage, 'not json')
  assert.equal(readStoppedMarker(garbage, { since: 0, now }), null)
  const target = marker()
  writeFileSync(target, JSON.stringify({ reason: 'x', released: 0, at: new Date(now).toISOString() }))
  const link = marker()
  symlinkSync(target, link)
  assert.equal(readStoppedMarker(link, { since: 0, now }), null, 'a symlink is not followed')
  assert.equal(readStoppedMarker(join(dir, 'absent.json'), { since: 0, now }), null)
  assert.match(stoppedText({ reason: 'socket lost', released: 1 }), /the helper stopped: its end watchdog fired \(socket lost\) .* released 1 held input$/)
})

test('CU-227 driver: a helper that exits 70 after writing stopped.json ends the request helper_lost with details.stopped, worded as the helper stopping', async () => {
  const path = marker()
  const { env, child } = await launchOnFake(world({ quirks: { watchdogStopOn: { type: 'input', path, reason: 'end lock held', released: 3 } } }), { stoppedMarkerPath: path })
  await logged(child, 3)
  try {
    const error = await env.perform({ type: 'click', button: 'left', x: 100, y: 100 }).then(() => null, (e) => e)
    assert.equal(error?.code, 'helper_lost', String(error?.message))
    assert.deepEqual(error.details?.stopped, { reason: 'end lock held', released: 3 })
    assert.match(error.message, /the helper stopped: its end watchdog fired \(end lock held\)/)
    assert.equal(existsSync(path), false, 'the driver removed the file')
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('CU-227 driver: without the file a lost helper reads as before; a file left from an earlier helper is removed at launch, unread', async () => {
  const path = marker()
  writeFileSync(path, JSON.stringify({ reason: 'old run', released: 1, at: new Date().toISOString() }))
  const { env, child } = await launchOnFake(world({ quirks: { exitOn: 'input' } }), { stoppedMarkerPath: path })
  await logged(child, 3)
  try {
    assert.equal(existsSync(path), false, 'removed at launch')
    const error = await env.perform({ type: 'click', button: 'left', x: 100, y: 100 }).then(() => null, (e) => e)
    assert.equal(error?.code, 'helper_lost')
    assert.equal(error.details?.stopped, undefined)
    assert.doesNotMatch(error.message, /end watchdog/)
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('CU-227 through runTask: the run ends on the helper stopping, and the run record says so', async () => {
  const path = marker()
  const control = createRunControl()
  const { env, child } = await launchOnFake(world({ quirks: { watchdogStopOn: { type: 'input', path, reason: 'socket lost', released: 1 } } }), { stoppedMarkerPath: path, control })
  await logged(child, 3)
  try {
    const store = createAppApprovals({ path: join(dir, 'approvals.json') })
    store.grantAlways(FIXTURE, { by: 'api' })
    const model = createScriptedAdapter({ frame: { width: env.frame.width, height: env.frame.height }, turns: [{ actions: [{ type: 'click', button: 'left', x: 100, y: 100 }] }, { final: 'done' }] })
    const result = await runTask({ task: 'press the button', environment: env, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
    assert.notEqual(result.status, 'completed')
    const record = readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8')
    assert.match(record, /the helper stopped: its end watchdog fired \(socket lost\)/)
  } finally {
    await env.close()
    await stopFake(child)
  }
})
