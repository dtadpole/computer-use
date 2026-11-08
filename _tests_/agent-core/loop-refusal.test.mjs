import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { refusalOf, runTask } from '../../_tools_/agent-core/loop.mjs'

// CU-199: a refused desktop action's record names the refusing check by words and ids only (reason, check, bundleId).
const FIXTURE = 'ai.reflection.cu.fixture'

async function failedEvent(details) {
  const dir = mkdtempSync(join(tmpdir(), 'cu-199-'))
  try {
    const control = createRunControl()
    const environment = createFakeEnvironment({ kind: 'desktop', control })
    const store = createAppApprovals({ path: join(dir, 'a.json') }); store.grantAlways(FIXTURE, { by: 'api' })
    const messages = []
    const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'click', button: 'left', x: 100, y: 100 }] }, { final: 'done' }] })
    const spy = { ...model, async open(o) { const s = await model.open(o); return { ...s, async next(input = {}, opts = {}) { for (const r of input.results ?? []) messages.push(r.message ?? ''); return s.next(input, opts) } } } }
    environment.perform = async () => { throw Object.assign(new Error('the action was stopped mid-gesture'), { code: 'out_of_scope', details }) }
    const result = await runTask({ task: 'press it', environment, model: spy, control, runsDirectory: join(dir, 'runs'), build: { commit: 't', dirty: false }, apps: [FIXTURE], appApprovals: store })
    const events = readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
    return { event: events.find((e) => e.kind === 'action' && e.status === 'failed'), messages }
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

test('CU-199: a mid-gesture refusal records its reason, the refusing check and the app beneath', async () => {
  const { event, messages } = await failedEvent({ reason: 'out_of_scope', check: 'gesture', bundleId: FIXTURE })
  assert.deepEqual(event.refusal, { reason: 'out_of_scope', check: 'gesture', bundleId: FIXTURE })
  assert.ok(messages.every((m) => !m.includes('gesture')), "the model's text is unchanged - the check name stays in the trajectory")
})

test('CU-199: anything that is not a short lowercase word or a bundle-id-shaped id is dropped', async () => {
  const { event } = await failedEvent({ reason: 'X1234567', check: 'Gesture Check!', bundleId: 'My Secret Window' })
  assert.equal(event.refusal, undefined)
  assert.deepEqual(refusalOf({ details: { reason: 'out_of_scope', check: 'a'.repeat(41) } }), { reason: 'out_of_scope' }, 'an over-long word is dropped')
  assert.equal(refusalOf({ details: null }), null)
})
