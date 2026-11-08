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

// CU-76: the driver's state().systemPrompt reaches the policy - while a system prompt is present, a key is never
// sent; with no person to take it, the model is told it needs the user.

const FIXTURE = 'ai.reflection.cu.fixture'
let dir
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cu-sysprompt-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

test('a key while the driver reports a system prompt is handed off and never performed', async () => {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control })
  const state = environment.state.bind(environment)
  environment.state = async (...args) => ({ ...(await state(...args)), systemPrompt: true })
  environment.focusedElement = async () => ({ origin: FIXTURE, role: 'AXTextField', name: 'Notes', fingerprint: 'notes' })
  let performed = 0
  const perform = environment.perform.bind(environment)
  environment.perform = async (...args) => { performed += 1; return perform(...args) }
  const store = createAppApprovals({ path: join(dir, 'app-approvals.json') })
  store.grantAlways(FIXTURE, { by: 'api' })
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'keypress', keys: ['RETURN'] }] }, { final: 'done' }] })
  const result = await runTask({ task: 'press Return', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
  const events = readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  const key = events.filter((e) => e.kind === 'action' && e.action?.type === 'keypress').pop()
  assert.equal(performed, 0)
  assert.equal(key.attempted, false)
  assert.equal(key.decision, 'handoff')
  assert.equal(key.rule, 'system_prompt')
})
