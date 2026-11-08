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

// CU-61 follow-up: the run header names the driver seams that change frames or input - the input mode and a
// simulated backing scale - so a trajectory read on its own says when its frames were simulated.

const FIXTURE = 'ai.reflection.cu.fixture'
let dir
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cu-header-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

async function header(seams) {
  const control = createRunControl()
  const environment = Object.assign(createFakeEnvironment({ kind: 'desktop', control }), seams)
  const store = createAppApprovals({ path: join(dir, 'app-approvals.json') })
  store.grantAlways(FIXTURE, { by: 'api' })
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ final: 'done' }] })
  const result = await runTask({ task: 'look', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
  return JSON.parse(readFileSync(join(result.trajectoryDir, 'run.json'), 'utf8')).environment
}

test('a simulated scale and the input mode are recorded in the run header', async () => {
  const env = await header({ mode: 'global', simulateScale: 2 })
  assert.equal(env.mode, 'global')
  assert.equal(env.simulateScale, 2)
})

test('a simulated display region is recorded as width and height only (CU-70)', async () => {
  const env = await header({ mode: 'global', simulateScale: 2, simulateDisplay: { width: 1512, height: 982, note: 'not copied' } })
  assert.deepEqual(env.simulateDisplay, { width: 1512, height: 982 })
})

test('without the seam, no simulateScale appears; nothing else from the driver is copied', async () => {
  const env = await header({ mode: 'pid', simulateScale: null, simulateDisplay: null, captureDir: '/tmp/x', runLockDir: '/tmp/y' })
  assert.equal(env.mode, 'pid')
  assert.equal('simulateScale' in env, false)
  assert.deepEqual(Object.keys(env).sort(), ['kind', 'mode', 'site'])
})
