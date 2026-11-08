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

// CU-54: each model call, each performed action and each observation records its wall-clock time, and the result
// totals them beside the existing token usage - numbers only, no prompt text or screenshot content.

const FIXTURE = 'ai.reflection.cu.fixture'
let dir
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cu-timing-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

async function timedRun({ failPerform = false } = {}) {
  let t = 1_000_000
  const now = () => t
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control })
  const store = createAppApprovals({ path: join(dir, 'app-approvals.json') })
  store.grantAlways(FIXTURE, { by: 'api' })
  environment.inspectPoint = async () => ({ origin: FIXTURE, role: 'AXButton', name: 'OK', fingerprint: 'ok' })
  const shoot = environment.screenshot.bind(environment)
  environment.screenshot = async (...args) => { t += 10; return shoot(...args) }
  const perform = environment.perform.bind(environment)
  environment.perform = async (...args) => {
    if (failPerform) { t += 25; throw Object.assign(new Error('the helper refused the point'), { code: 'out_of_scope', details: { reason: 'target_out_of_scope', bundleId: null, point: { x: 1, y: 1 } } }) }
    t += 40
    return perform(...args)
  }
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'click', button: 'left', x: 10, y: 10 }], usage: { inputTokens: 1200, outputTokens: 80 } }, { final: 'done', usage: { inputTokens: 1300, outputTokens: 20 } }] })
  const timed = { ...model, async open(options) { const session = await model.open(options); return { ...session, async next(input = {}, opts = {}) { t += 300; return session.next(input, opts) } } } }
  const result = await runTask({ task: 'press OK', environment, model: timed, control, now, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
  const events = readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  return { result, events }
}

test('model turns, performed actions and observations record their latency; the result totals it beside token usage', async () => {
  const { result, events } = await timedRun()
  const turns = events.filter((e) => e.kind === 'model_turn')
  assert.deepEqual(turns.map((e) => e.latencyMs), [300, 300], 'each model call')
  assert.deepEqual(turns.map((e) => e.usage?.inputTokens), [1200, 1300], 'token use per step stays recorded')
  const done = events.find((e) => e.kind === 'action' && e.status === 'done' && e.action?.type === 'click')
  assert.equal(done.ms, 40, 'the perform')
  const observations = events.filter((e) => e.kind === 'observation')
  assert.ok(observations.length >= 2 && observations.every((e) => Number.isFinite(e.ms) && e.ms >= 10), 'each observation')
  assert.equal(result.timing.modelMs, 600)
  assert.equal(result.timing.performMs, 40)
  assert.equal(result.timing.observeMs, observations.reduce((sum, e) => sum + e.ms, 0))
  assert.ok(Number.isFinite(result.timing.activeMs) && result.timing.activeMs >= 640)
  assert.equal(result.usage.inputTokens, 2500)
})

test('a failed perform records its latency too', async () => {
  const { result, events } = await timedRun({ failPerform: true })
  const failed = events.find((e) => e.kind === 'action' && e.status === 'failed')
  assert.equal(failed.ms, 25)
  assert.equal(result.timing.performMs, 25)
})
