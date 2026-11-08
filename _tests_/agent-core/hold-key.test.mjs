import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'

import { validateBatch } from '../../_tools_/agent-core/actions.mjs'
import { createClaudeGatewayAdapter, memberToAction } from '../../_tools_/agent-core/adapter-claude.mjs'
import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'

// CU-64 hold_key (input-vocabulary.md, acceptance H2/H3): keys held for 1 to 10,000 ms, offered only where the
// environment can hold, judged exactly as the same chord pressed; and a stopped long press is effect-uncertain.

const FIXTURE = 'ai.reflection.cu.fixture'
const frame = { width: 1440, height: 900 }
/** A toolset model by local-config alias (local-config.mjs), so no real model id is named here. */
const LOCAL = { models: { 'model-a': { id: 'claude-test-model', toolset: true } } }
let dir
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cu-hold-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

test('schema: hold_key {keys, duration_ms 1..10000} where enabled; otherwise unknown', () => {
  const ok = validateBatch([{ type: 'hold_key', keys: ['SHIFT'], duration_ms: 1000 }], { frame, extensions: ['hold_key'] })
  assert.deepEqual(ok.actions, [{ type: 'hold_key', keys: ['SHIFT'], duration_ms: 1000 }])
  for (const duration_ms of [0, 10_001, undefined, 1.5]) {
    assert.equal(validateBatch([{ type: 'hold_key', keys: ['SHIFT'], duration_ms }], { frame, extensions: ['hold_key'] }).results[0].code, 'malformed', String(duration_ms))
  }
  assert.equal(validateBatch([{ type: 'hold_key', keys: ['SHIFT'], duration_ms: 1000 }], { frame }).results[0].code, 'unsupported_action')
})

test('adapter: hold_key maps text and duration; without a duration it stays bare; offered only with tools.holdKey', async () => {
  assert.deepEqual(memberToAction('hold_key', { text: 'shift', duration: 1.5 }), { type: 'hold_key', keys: ['SHIFT'], duration_ms: 1500 })
  assert.deepEqual(memberToAction('hold_key', { text: 'a' }), { type: 'hold_key' })
  const configs = async (tools) => {
    const calls = []
    const adapter = createClaudeGatewayAdapter({ model: 'model-a', config: LOCAL, fetch: async (url, init) => { calls.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 1, output_tokens: 1 } }) } }, readKey: () => 'k', retryDelays: [] })
    const session = await adapter.open({ instructions: 'x', task: 'y', tools })
    await session.next({ task: 'y', screenshot: { data: Buffer.from('p'), mimeType: 'image/png', width: 1440, height: 900 } })
    return calls[0].tools.find((t) => t.type === 'computer_toolset_20260801').configs
  }
  assert.equal((await configs({ navigate: false, press: true, holdKey: true })).hold_key, undefined)
  assert.deepEqual((await configs({ navigate: false, press: true })).hold_key, { enabled: false })
})

async function run(actions, { actionTypes, secureInput = false, focused = null, fail } = {}) {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control, secureInput, ...(focused ? { focused } : {}), ...(fail ? { fail } : {}) })
  if (actionTypes) environment.actionTypes = actionTypes
  const store = createAppApprovals({ path: join(dir, 'app-approvals.json') })
  store.grantAlways(FIXTURE, { by: 'api' })
  const seen = []
  const model = createScriptedAdapter((input, { index }) => { seen.push(input); return index === 0 ? { actions } : { final: 'done' } })
  const result = await runTask({ task: 'hold', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store, controller: { canHandOff: false } })
  const events = readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  return { results: seen[1]?.results ?? [], events, inputs: environment.log.map((e) => e.action ?? e).filter((a) => a?.type) }
}

test('loop: a hold is sent only where the environment lists hold_key; elsewhere it is refused and nothing is sent', async () => {
  const held = await run([{ type: 'hold_key', keys: ['SHIFT'], duration_ms: 500 }], { actionTypes: ['hold_key'] })
  assert.deepEqual(held.inputs.filter((a) => a.type === 'hold_key'), [{ type: 'hold_key', keys: ['SHIFT'], duration_ms: 500 }])
  const none = await run([{ type: 'hold_key', keys: ['SHIFT'], duration_ms: 500 }])
  assert.equal(none.inputs.length, 0)
  assert.equal(none.results[0].code, 'unsupported_action')
})

test('loop: a held chord gets the decision of the same chord pressed (H3), secure input included', async () => {
  // In a save panel a Command-Delete is a file operation and refused; held, it must be refused just the same.
  const panelField = { role: 'AXTextField', name: 'Save As:', panel: 'save', bundleId: FIXTURE, origin: FIXTURE }
  for (const keys of [['META', 'BACKSPACE'], ['SPACE'], ['SHIFT', 'A']]) {
    const hold = await run([{ type: 'hold_key', keys, duration_ms: 300 }], { actionTypes: ['hold_key'], focused: panelField })
    const press = await run([{ type: 'keypress', keys }], { actionTypes: ['hold_key'], focused: panelField })
    const decided = (r) => { const e = r.events.find((x) => x.kind === 'action'); return [e.decision, e.class, e.rule] }
    assert.deepEqual(decided(hold), decided(press), keys.join('+'))
  }
  const blocked = await run([{ type: 'hold_key', keys: ['META', 'BACKSPACE'], duration_ms: 300 }], { actionTypes: ['hold_key'], focused: panelField })
  assert.equal(blocked.events.find((x) => x.kind === 'action').rule, 'panel:file_operation')
  assert.equal(blocked.inputs.length, 0)
  const secureHold = await run([{ type: 'hold_key', keys: ['SHIFT'], duration_ms: 300 }], { actionTypes: ['hold_key'], secureInput: true })
  const securePress = await run([{ type: 'keypress', keys: ['SHIFT'] }], { actionTypes: ['hold_key'], secureInput: true })
  assert.deepEqual([secureHold.results[0].status, secureHold.results[0].code], [securePress.results[0].status, securePress.results[0].code])
  assert.equal(secureHold.inputs.length, securePress.inputs.length, 'secure input: held exactly when pressed would be')
})

test('a stopped long press released where it went down is still effect-uncertain; a plain press there is not', async () => {
  const stop = (action) => (action.type === 'drag' ? { code: 'taken_over', message: 'stopped', details: { releasedAt: { x: 40, y: 40 }, releasedAtPress: true } } : null)
  const longPress = await run([{ type: 'move', x: 40, y: 40 }, { type: 'mouse_down' }, { type: 'wait', duration_ms: 1500 }, { type: 'mouse_up' }], { actionTypes: ['press_hold'], fail: stop })
  assert.equal(longPress.results[1].effectUncertain, true)
  const plain = await run([{ type: 'move', x: 40, y: 40 }, { type: 'mouse_down' }, { type: 'mouse_up' }], { fail: stop })
  assert.equal(plain.results[1].effectUncertain, undefined)
})

test('R3: a held letter or Backspace is one press and the step says so; a held modifier just says how long', async () => {
  const back = await run([{ type: 'hold_key', keys: ['BACKSPACE'], duration_ms: 2000 }], { actionTypes: ['hold_key'] })
  assert.equal(back.results[0].message, 'Held BACKSPACE for 2 s as one press: a held key does not repeat, so BACKSPACE acted once.')
  const shift = await run([{ type: 'hold_key', keys: ['SHIFT'], duration_ms: 500 }], { actionTypes: ['hold_key'] })
  assert.equal(shift.results[0].message, 'Held SHIFT for 0.5 s.')
})

test('R7: a malformed or missing duration is refused in the model\'s units, before anything else', () => {
  for (const action of [{ type: 'hold_key', keys: ['SHIFT'], duration_ms: 0 }, { type: 'hold_key', keys: ['SHIFT'], duration_ms: 10_001 }, { type: 'hold_key' }]) {
    const r = validateBatch([action], { frame, extensions: ['hold_key'] })
    assert.equal(r.results[0].code, 'malformed', JSON.stringify(action))
    assert.match(r.results[0].message, /duration from 0\.001 to 10 seconds/, JSON.stringify(action))
  }
})

test('a local-input stop mid-hold names the held keys through the held-key notice (G2)', async () => {
  const stop = (action) => (action.type === 'hold_key' ? { code: 'taken_over', message: 'stopped by local input', details: { reason: 'local_input', failedAt: 1, heldKeys: ['SHIFT'] } } : null)
  const { events } = await run([{ type: 'hold_key', keys: ['SHIFT'], duration_ms: 3000 }], { actionTypes: ['hold_key'], fail: stop })
  const failed = events.find((e) => e.kind === 'action' && e.action?.type === 'hold_key' && e.status === 'failed')
  assert.deepEqual(failed.heldKeys, ['SHIFT'])
  assert.match(failed.notice, /first keystroke may have carried SHIFT/)
})


test('CU-244: through the loop a held system chord is refused like the pressed one - log out, lock screen, the app switcher, Spotlight - and nothing is sent', async () => {
  for (const keys of [['META', 'ALT', 'SHIFT', 'Q'], ['CTRL', 'META', 'Q'], ['META', 'TAB'], ['META', 'SPACE'], ['CTRL', 'ARROWLEFT']]) {
    const { events, inputs } = await run([{ type: 'hold_key', keys, duration_ms: 300 }], { actionTypes: ['hold_key'] })
    const action = events.find((e) => e.kind === 'action')
    assert.deepEqual([action.decision, action.rule], ['block', 'system_shortcut'], keys.join('+'))
    assert.deepEqual(inputs, [], `${keys.join('+')}: nothing sent`)
  }
})
