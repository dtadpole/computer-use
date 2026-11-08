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
import { RETRY } from '../../_tools_/agent-core/retry.mjs'

// CU-56: only errors that are transient and guarantee nothing reached the screen are retried - a pre-post
// target_unverified refusal once, a capture dropped for a leak a bounded number of times - and every retry is recorded.

const FIXTURE = 'ai.reflection.cu.fixture'
let dir
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cu-retry-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

const refusal = (reason, extra = {}) => Object.assign(new Error(`refused (${reason}); nothing was posted`), { code: 'out_of_scope', details: { reason, bundleId: null, point: { x: 1, y: 1 }, ...extra } })

async function run({ perform: failures = [], captures = [], beforeRetry = null } = {}) {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control })
  const store = createAppApprovals({ path: join(dir, 'app-approvals.json') })
  store.grantAlways(FIXTURE, { by: 'api' })
  environment.inspectPoint = async () => ({ origin: FIXTURE, role: 'AXButton', name: 'OK', fingerprint: 'ok' })
  const shoot = environment.screenshot.bind(environment)
  let shots = 0
  environment.screenshot = async (...args) => { shots += 1; const next = captures.shift(); if (next) throw next; return shoot(...args) }
  const perform = environment.perform.bind(environment)
  let performs = 0
  environment.perform = async (...args) => { performs += 1; const next = failures.shift(); if (next) { if (performs === 1 && beforeRetry) beforeRetry(control); throw next } return perform(...args) }
  const sleeps = []
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'click', button: 'left', x: 10, y: 10 }] }, { final: 'done' }] })
  const result = await runTask({ task: 'press OK', environment, model, control, sleep: async (ms) => { sleeps.push(ms) }, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
  const events = readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  const click = events.filter((e) => e.kind === 'action' && e.action?.type === 'click' && e.status !== 'attempted').pop()
  return { result, events, click, performs, shots, sleeps }
}

test('a transient unverified refusal is retried once after the policy delay; the first culprit stays in the record', async () => {
  const r = await run({ perform: [refusal('target_unverified', { ownerPid: 4242, ownerExecutable: 'SomeAgent', elementOwner: null })] })
  assert.equal(r.performs, 2)
  assert.equal(r.click.status, 'done')
  assert.deepEqual(r.click.retry, { reason: 'target_unverified', delayMs: RETRY.inputDelayMs, first: { ownerPid: 4242, ownerExecutable: 'SomeAgent', elementOwner: null } })
  assert.ok(r.sleeps.includes(RETRY.inputDelayMs))
})

test('it is retried at most once: a second refusal fails the action as before, with the retry recorded', async () => {
  const r = await run({ perform: [refusal('target_unverified'), refusal('target_unverified')] })
  assert.equal(r.performs, 2)
  assert.equal(r.click.status, 'failed')
  assert.equal(r.click.retry?.reason, 'target_unverified')
})

test('a covered point and a lost helper are never retried', async () => {
  const covered = await run({ perform: [refusal('target_out_of_scope', { bundleId: 'com.example.overlay' })] })
  assert.equal(covered.performs, 1)
  assert.equal(covered.click.retry, undefined)
  const lost = await run({ perform: [Object.assign(new Error('the helper is gone'), { code: 'helper_lost' })] })
  assert.equal(lost.performs, 1)
})

test('a stop before the retry means no second attempt', async () => {
  const r = await run({ perform: [refusal('target_unverified')], beforeRetry: (control) => control.send('stop', { source: 'api' }) })
  assert.equal(r.performs, 1)
})

test('a capture dropped for a transient leak is retried and recorded; the run goes on', async () => {
  const r = await run({ captures: [refusal('capture_leak', { bundleId: 'com.example.banner' })] })
  const first = r.events.find((e) => e.kind === 'observation')
  assert.deepEqual(first.captureRetries, [{ reason: 'capture_leak', bundleId: 'com.example.banner', delayMs: RETRY.captureDelaysMs[0] }])
  assert.equal(r.click.status, 'done')
})

test('a persistent capture leak is retried a bounded number of times, then fails as before', async () => {
  const leaks = Array.from({ length: RETRY.captureDelaysMs.length + 3 }, () => refusal('capture_leak'))
  const r = await run({ captures: leaks })
  // The observation tries 1 + captureDelaysMs.length times; the one more capture is the run's final best-effort
  // screenshot after the failure, not a retry.
  assert.deepEqual(r.sleeps.filter((ms) => RETRY.captureDelaysMs.includes(ms)), [...RETRY.captureDelaysMs])
  assert.equal(r.shots, RETRY.captureDelaysMs.length + 2)
  assert.equal(r.result.status, 'error')
})
