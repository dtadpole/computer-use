import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { createSitePolicy } from '../../_tools_/agent-core/sites.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'

// CU-155 (cu-developer-two's probe): a certificate warning commits chrome-error://chromewebdata/, but the driver's url
// stays the attempted address, so the url check never fired; the environment reports state.interstitial instead.

const START = 'http://127.0.0.1:43117/tasks/demo/'

async function clickProceed(interstitial) {
  const dir = mkdtempSync(join(tmpdir(), 'cu-interstitial-'))
  try {
    const control = createRunControl()
    const environment = createFakeEnvironment({ url: START, control })
    const baseState = environment.state.bind(environment)
    environment.state = async () => ({ ...(await baseState()), ...(interstitial === undefined ? {} : { interstitial }) })
    environment.inspectPoint = async () => ({ tag: 'a', role: 'link', name: 'Proceed to 127.0.0.1 (unsafe)', origin: 'http://127.0.0.1:43117', fingerprint: 'p' })
    const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'click', x: 100, y: 200, button: 'left' }] }, { final: 'done' }] })
    const result = await runTask({ task: 'open the report', environment, model, sitePolicy: createSitePolicy({ startUrl: START }), control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false } })
    const event = readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action').pop()
    return { event, performed: environment.log.length }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('on a browser warning page (state.interstitial) a click is handed to the person, never performed', async () => {
  const { event, performed } = await clickProceed(true)
  assert.deepEqual([event.decision, event.rule], ['handoff', 'interstitial'])
  assert.equal(performed, 0)
})

test('no warning reported (false, or an older driver): judged as today', async () => {
  for (const interstitial of [false, undefined]) {
    const { event } = await clickProceed(interstitial)
    assert.notEqual(event.rule, 'interstitial', String(interstitial))
  }
})
