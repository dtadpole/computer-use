import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { apiController } from '../../_tools_/agent-core/consent.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { createSitePolicy } from '../../_tools_/agent-core/sites.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'

// CU-182: a browser action event records the target it was judged on, as desktop events do - the frame origin and the
// role always, the accessible name only when the site filter allowed that origin when the action was judged (the
// browser's scope), never a value.

const START = 'http://127.0.0.1:43117/tasks/demo/'
const OTHER = 'http://other.example'
const frame = { width: 1440, height: 900 }
let runsDirectory
beforeEach(() => { runsDirectory = mkdtempSync(join(tmpdir(), 'cu-web-target-')) })
afterEach(() => { rmSync(runsDirectory, { recursive: true, force: true }) })

const target = (name, origin, fingerprint) => ({ tag: 'button', role: 'button', name, origin, fingerprint })

function run({ turns, targets, controller }) {
  const control = createRunControl()
  const environment = createFakeEnvironment({ url: START, control, targets })
  const model = createScriptedAdapter({ frame, turns })
  const sitePolicy = createSitePolicy({ startUrl: START })
  return runTask({ task: 'demo task', environment, model, sitePolicy, control, runsDirectory, build: { commit: 'test', dirty: false }, ...(controller ? { controller } : {}) })
}

// Each action logs an 'attempted' and a 'done' event; the 'done' one is the action's record.
const clicks = (dir) => readRun(dir).events.filter((e) => e.kind === 'action' && e.action?.type === 'click' && e.status === 'done')

test('CU-182: a browser action event records the judged target - origin and role always, the name only on an allowed site', async () => {
  const result = await run({
    turns: [{ actions: [{ type: 'click', button: 'left', x: 10, y: 10 }, { type: 'click', button: 'left', x: 20, y: 20 }] }, { final: 'done' }],
    targets: { '10,10': target('Search', 'http://127.0.0.1:43117', 'fp-search'), '20,20': target('Open widget', OTHER, 'fp-widget') },
  })
  assert.equal(result.status, 'completed')
  const [onPage, inFrame] = clicks(result.trajectoryDir)
  assert.deepEqual(onPage.target, { origin: 'http://127.0.0.1:43117', role: 'button', name: 'Search' }, 'the run\'s own site: named')
  assert.deepEqual(inFrame.target, { origin: OTHER, role: 'button' }, 'an unlisted cross-origin frame: origin and role, no name')
  assert.equal('name' in inFrame.target, false)
})

test('CU-182: a target on an origin approved only later in the run keeps no name for the actions before the approval', async () => {
  const api = apiController()
  const answered = api.waitForRequest(4000).then((request) => {
    assert.equal(request.class, 'new_site')
    return api.respond({ id: request.id, approved: true })
  })
  const result = await run({
    turns: [
      { actions: [{ type: 'click', button: 'left', x: 20, y: 20 }] },
      { actions: [{ type: 'navigate', url: `${OTHER}/` }] },
      { actions: [{ type: 'click', button: 'left', x: 20, y: 20 }] },
      { final: 'done' },
    ],
    targets: { '20,20': target('Open widget', OTHER, 'fp-widget') },
    controller: api,
  })
  await answered
  assert.equal(result.status, 'completed')
  const [before, after] = clicks(result.trajectoryDir)
  assert.deepEqual(before.target, { origin: OTHER, role: 'button' }, 'judged before the approval: no name, even though the origin is allowed by the end of the run')
  assert.deepEqual(after.target, { origin: OTHER, role: 'button', name: 'Open widget' }, 'judged after the approval: named')
})
