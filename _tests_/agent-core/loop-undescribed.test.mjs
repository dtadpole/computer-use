import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'

// CU-39 live: an open/save panel's sheet window is the app's own, but its content belongs to the panel service, so the
// helper reports an owner-only target (no role or title). Agent core asks about it each time, 'once' only - an earlier
// answer never covers the next one - so a panel's Save never passes as a plain click.

const FIXTURE = 'ai.reflection.cu.fixture'
const frame = { width: 1440, height: 900 }
const click = (x = 100, y = 100) => ({ type: 'click', button: 'left', x, y })
let dir
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cu-loop-undescribed-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

test('two clicks on an undescribed target are two questions, each offering once only', async () => {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control })
  const store = createAppApprovals({ path: join(dir, 'app-approvals.json') })
  store.grantAlways(FIXTURE, { by: 'api' })
  const requests = []
  control.subscribe((event) => { if (event.type === 'consent_request' && event.request.class === 'unknown_target') requests.push(event.request) })
  environment.inspectPoint = async () => ({ origin: FIXTURE, role: null, name: null, pid: 1, opaque: false, fingerprint: 'panel' })
  const model = createScriptedAdapter({ frame, turns: [{ actions: [click()] }, { actions: [click()] }, { final: 'done' }] })
  await runTask({ task: 'export the report', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
  assert.equal(requests.length, 2, 'no answer covers the next click')
  for (const r of requests) {
    assert.equal(r.rule, 'target:undescribed')
    assert.deepEqual(r.lifetimes, ['once'])
  }
})
