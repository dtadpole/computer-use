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

// CU-357: the browser driver's effect carries the session notices (a refused download, an accepted alert, ...); the
// loop logs the effect whole, so the trajectory's action event shows them - nothing in agent core picks them out.
const START = 'http://127.0.0.1:43117/tasks/demo/'

test('CU-357: an effect\'s notices are in the trajectory\'s action event', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cu-357-'))
  try {
    const control = createRunControl()
    const environment = createFakeEnvironment({ url: START, control })
    const perform = environment.perform.bind(environment)
    const notice = { kind: 'download_refused', at: 1, url: 'https://files.example/app.dmg' }
    environment.perform = async (action) => ({ ...(await perform(action)), notices: [notice] })
    const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'click', x: 100, y: 100, button: 'left' }] }, { final: 'done' }] })
    const result = await runTask({ task: 'download the app', environment, model, sitePolicy: createSitePolicy({ startUrl: START }), control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false } })
    const done = readRun(result.trajectoryDir).events.find((e) => e.kind === 'action' && e.status === 'done')
    assert.deepEqual(done.effect.notices, [notice])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
