import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { createSitePolicy } from '../../_tools_/agent-core/sites.mjs'

// CU-64 in the loop: a press composed into one drag on the desktop, every original block answered, nothing performed
// for a refused batch, the members unknown elsewhere, long presses only where the environment holds.

const FIXTURE = 'ai.reflection.cu.fixture'
const move = (x, y) => ({ type: 'move', x, y })
const down = { type: 'mouse_down' }
const up = { type: 'mouse_up' }
let dir
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cu-press-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

async function run(actions, { kind = 'desktop', actionTypes, fail } = {}) {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind, control, ...(fail ? { fail } : {}) })
  if (actionTypes) environment.actionTypes = actionTypes
  const store = createAppApprovals({ path: join(dir, 'app-approvals.json') })
  store.grantAlways(FIXTURE, { by: 'api' })
  const seen = []
  const scripted = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions }, { final: 'done' }] })
  const model = { ...scripted, async open(o) { const s = await scripted.open(o); return { ...s, async next(input = {}, opts = {}) { seen.push(input); return s.next(input, opts) } } } }
  const desktop = kind === 'desktop'
  const result = await runTask({ task: 'press', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, ...(desktop ? { apps: [FIXTURE], appApprovals: store } : { sitePolicy: createSitePolicy({ startUrl: 'http://127.0.0.1:43117/' }) }) })
  const events = readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  const inputs = environment.log.map((entry) => entry.action ?? entry).filter((a) => a && typeof a.type === 'string')
  return { results: seen[1]?.results ?? [], events, inputs }
}

test('on the desktop a press becomes one drag; each original block gets a result; the trajectory says what it was made of', async () => {
  const { results, events, inputs } = await run([move(10, 10), down, move(20, 10), up])
  const drags = inputs.filter((a) => a.type === 'drag')
  assert.equal(drags.length, 1)
  assert.deepEqual(drags[0].path, [{ x: 10, y: 10 }, { x: 20, y: 10 }])
  assert.equal(inputs.filter((a) => a.type === 'move').length, 1, 'the move inside the press is part of the drag, not sent alone')
  assert.deepEqual(results.map((r) => [r.index, r.type, r.status]), [[0, 'move', 'done'], [1, 'mouse_down', 'done'], [2, 'move', 'done'], [3, 'mouse_up', 'done']])
  const drag = events.find((e) => e.kind === 'action' && e.action?.type === 'drag')
  assert.deepEqual(drag.composedFrom.map((m) => m.type), ['mouse_down', 'move', 'mouse_up'])
})

test('an unpaired press refuses the whole batch and nothing is performed', async () => {
  const { results, inputs } = await run([move(10, 10), down])
  assert.equal(inputs.length, 0)
  assert.deepEqual(results.map((r) => r.status), ['refused', 'refused'])
  assert.equal(results[1].code, 'unpaired_press')
})

test('a browser run does not compose: mouse_down is refused by name', async () => {
  const { results, inputs } = await run([move(10, 10), down, up], { kind: 'browser' })
  assert.equal(inputs.length, 0)
  assert.equal(results[1].code, 'unsupported_action')
})

test('a long press is sent with holdMs only where the environment holds (actionTypes press_hold)', async () => {
  const held = await run([move(40, 40), down, { type: 'wait', duration_ms: 1500 }, up], { actionTypes: ['press_hold'] })
  assert.deepEqual(held.inputs.find((a) => a.type === 'drag').path, [{ x: 40, y: 40, holdMs: 1500 }, { x: 40, y: 40 }])
  const plain = await run([move(40, 40), down, { type: 'wait', duration_ms: 1500 }, up])
  assert.equal(plain.inputs.length, 0)
  assert.equal(plain.results[2].code, 'unsupported_action')
})

test('a failed press fails its first member; the rest did not run', async () => {
  const { results } = await run([move(10, 10), down, move(20, 10), up], { fail: (a) => (a.type === 'drag' ? { code: 'failed', message: 'the drag stopped' } : null) })
  assert.deepEqual(results.map((r) => r.status), ['done', 'failed', 'skipped', 'skipped'])
})
