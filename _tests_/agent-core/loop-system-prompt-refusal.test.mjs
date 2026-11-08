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

// CU-76: a system_prompt refusal from the driver or helper (a prompt appeared after the policy looked) becomes the
// policy's hand-off: recorded as decision handoff / rule system_prompt, the model told the neutral reason, the
// environment's words kept only in the trajectory's detail.

const FIXTURE = 'ai.reflection.cu.fixture'
const DRIVER_WORDS = 'a system permission prompt is in the way; the person answers it'
let dir
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cu-sp-refusal-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

test('a system_prompt refusal is a hand-off; with no person, the model is told it needs the user', async () => {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control })
  environment.inspectPoint = async () => ({ origin: FIXTURE, role: 'AXButton', name: 'OK', fingerprint: 'ok' })
  environment.perform = async () => { throw Object.assign(new Error(DRIVER_WORDS), { code: 'system_prompt' }) }
  const store = createAppApprovals({ path: join(dir, 'app-approvals.json') })
  store.grantAlways(FIXTURE, { by: 'api' })
  const seen = []
  const scripted = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'click', button: 'left', x: 10, y: 10 }] }, { final: 'done' }] })
  const model = { ...scripted, async open(o) { const s = await scripted.open(o); return { ...s, async next(input = {}, opts = {}) { seen.push(input); return s.next(input, opts) } } } }
  const result = await runTask({ task: 'press OK', environment, model, control, controller: { canHandOff: false }, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
  const events = readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  const click = events.filter((e) => e.kind === 'action' && e.action?.type === 'click' && e.status !== 'attempted').pop()
  assert.equal(click.decision, 'handoff')
  assert.equal(click.rule, 'system_prompt')
  assert.equal(click.status, 'declined')
  assert.equal(click.code, 'handoff_unavailable')
  assert.equal(click.detail, DRIVER_WORDS, 'the environment\'s words stay in the trajectory')
  const told = JSON.stringify(seen[1]?.results ?? [])
  assert.match(told, /system privacy or permission prompt is the person's to answer/)
  assert.equal(told.includes(DRIVER_WORDS), false, 'the model hears the neutral reason, not the driver\'s words')
})
