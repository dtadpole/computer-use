import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { notGranted } from '../../_environments_/macos-desktop/errors.mjs'
import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'

/**
 * CU-240 in the loop: a capture refused not_granted with wasGranted (a grant re-read false under load after reading true
 * this run) is retried once; a second refusal ends the run as before, worded as a grant read true earlier. Input is never
 * retried on it - a grant revoked mid-run is when the agent must stop. A plain not_granted is not retried.
 */

const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-240-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
const store = createAppApprovals({ path: join(tmp, 'a.json') })
store.grantAlways(FIXTURE, { by: 'api' })
let runs = 0
const reread = () => notGranted('screen', { wasGranted: true, rechecks: 3 })

async function run({ captureFailures = [], performFailure = null, actions = [{ type: 'wait', duration_ms: 10 }] }) {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control })
  const screenshot = environment.screenshot.bind(environment)
  let shots = 0
  environment.screenshot = async (...args) => {
    shots += 1
    const failure = captureFailures.shift()
    if (failure) throw failure()
    return screenshot(...args)
  }
  let performs = 0
  const perform = environment.perform.bind(environment)
  environment.perform = async (action) => {
    performs += 1
    if (performFailure && action.type === 'click') throw performFailure()
    return perform(action)
  }
  environment.inspectPoint = async () => ({ origin: FIXTURE, role: 'AXButton', name: 'Refresh', fingerprint: 'r', defaultButtonRead: true })
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions }, { final: 'done' }] })
  const result = await runTask({ task: 'refresh the list', environment, model, control, runsDirectory: join(tmp, `runs-${runs += 1}`), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
  return { result, shots, performs, events: readRun(result.trajectoryDir).events }
}

test('CU-240: one capture refused with wasGranted is retried once and the run goes on; the retry is on the observation', async () => {
  const { result, events } = await run({ captureFailures: [reread] })
  assert.equal(result.status, 'completed', JSON.stringify(result.error ?? null))
  const observation = events.find((e) => e.kind === 'observation' && e.captureRetries)
  assert.deepEqual(observation.captureRetries.map((r) => [r.reason, r.grant]), [['grant_reread', 'screen']])
})

test('CU-240: a second refusal in a row ends the run as not_granted, worded as a grant read true earlier - not as one to give', async () => {
  const { result } = await run({ captureFailures: [reread, reread] })
  assert.notEqual(result.status, 'completed')
  const said = JSON.stringify(result)
  assert.match(said, /not_granted/)
  assert.match(said, /read true earlier in this run/)
})

test('CU-240: a plain not_granted is never retried; input refused with wasGranted is not retried either', async () => {
  const plain = await run({ captureFailures: [() => notGranted('screen')] })
  assert.notEqual(plain.result.status, 'completed')
  assert.equal(plain.events.some((e) => Array.isArray(e.captureRetries)), false, 'no capture retry recorded')
  assert.match(JSON.stringify(plain.result), /only the owner can grant it/, 'worded as a missing grant')
  const input = await run({ performFailure: () => notGranted('accessibility', { wasGranted: true, rechecks: 3 }), actions: [{ type: 'click', x: 10, y: 10, button: 'left' }] })
  assert.equal(input.performs, 1, 'the click was tried once')
  const action = input.events.find((e) => e.kind === 'action' && e.status !== 'attempted' && e.action?.type === 'click')
  assert.equal(action?.status, 'failed')
  assert.equal(action?.code, 'not_granted')
})
