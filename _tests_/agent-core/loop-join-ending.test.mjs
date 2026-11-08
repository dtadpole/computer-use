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

// CU-105: adding a start app to the helper's scope can fail with a code that ends the run (no window on screen, the
// helper gone, the display changed). Such a code ends the run with the environment's own code - never later as an
// empty scope; a plain refusal still leaves the app out (its first action fails closed).

const FIXTURE = 'ai.reflection.cu.fixture'
let dir
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cu-join-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

async function run(code) {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control })
  const message = {
    no_app_window: `no window of ${FIXTURE} is on screen; open it and run again`,
    not_granted: 'the helper is not granted Screen Recording; grant it in System Settings, then run again',
  }[code] ?? `refused: ${code}`
  environment.addApp = async () => { throw Object.assign(new Error(message), { code, ...(code === 'not_granted' ? { details: { grant: 'screen' } } : {}) }) }
  const model = createScriptedAdapter(() => ({ final: 'done' }))
  const store = createAppApprovals({ path: join(dir, 'app-approvals.json') })
  store.grantAlways(FIXTURE, { by: 'api' })
  const result = await runTask({ task: 'look', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store, consent: { mode: 'unattended' } })
  const events = readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  return { result, events, environment }
}

for (const code of ['no_app_window', 'helper_lost', 'display_changed', 'not_granted']) {
  test(`a start app's add failing ${code} ends the run with that code, before any capture`, async () => {
    const { result, events, environment } = await run(code)
    assert.equal(result.status, 'error')
    assert.match(result.error, new RegExp(`^${code}: `))
    assert.doesNotMatch(result.error, /scope/)
    assert.ok(events.some((e) => e.kind === 'note' && e.startAppNotAdded?.code === code), 'the refused add is still recorded')
    assert.equal(environment.screenshotCount, 0)
    // The environment's own words reach the person - for not_granted, which grant to give.
    if (code === 'not_granted') assert.match(result.error, /^not_granted: the helper is not granted Screen Recording/)
  })
}

test('a plain refusal (out_of_scope) still leaves the app out and the run goes on', async () => {
  const { result, events } = await run('out_of_scope')
  assert.notEqual(result.status, 'error')
  assert.ok(events.some((e) => e.kind === 'note' && e.startAppNotAdded?.code === 'out_of_scope'))
})
