import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { fakeLauncher, logged, pause, scratchLocks, stopFake } from './harness.mjs'

/**
 * CU-76 end to end on the fake helper: agent core's loop over the real driver. A click on a marked prompt's button,
 * and a key while the helper reports a prompt shown (focus in the app's own text area), are both handed off by agent
 * core's policy (rule system_prompt) - and the helper never receives an input request.
 */

const FIXTURE = 'ai.reflection.cu.fixture'
const locks = scratchLocks()
const dir = mkdtempSync(join(tmpdir(), 'cu-sp-e2e-'))
after(() => { locks.remove(); rmSync(dir, { recursive: true, force: true }) })
const launchOnFake = fakeLauncher(locks, { apps: [FIXTURE] })
const inputs = (child) => child.requests.filter((r) => r.type === 'input').length

const ALLOW = { role: 'AXButton', subrole: null, title: 'Allow Paste', frame: { x: 300, y: 200, width: 100, height: 30 }, secure: false }
const NOTE = { role: 'AXTextArea', subrole: null, title: 'Note', frame: { x: 20, y: 400, width: 200, height: 100 }, secure: false, editable: true }
const world = (extra = {}) => ({
  displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 800, height: 600 }, scale: 1 }],
  apps: [{ bundleId: FIXTURE, pid: 601, title: 'Fixture', rect: { x: 0, y: 0, width: 800, height: 600 } }],
  frontmost: FIXTURE,
  elements: [
    { rect: ALLOW.frame, element: { bundleId: FIXTURE, pid: 601, ...ALLOW, systemPrompt: true } },
    { rect: NOTE.frame, element: { bundleId: FIXTURE, pid: 601, ...NOTE } },
  ],
  focused: { bundleId: FIXTURE, pid: 601, ...NOTE },
  ...extra,
})

let runs = 0
async function runOnFake(config, action) {
  const control = createRunControl()
  const { env, child } = await launchOnFake(config, { control })
  await logged(child, 3)
  try {
    const store = createAppApprovals({ path: join(dir, `approvals-${runs += 1}.json`) })
    store.grantAlways(FIXTURE, { by: 'api' })
    const model = createScriptedAdapter({ frame: { width: env.frame.width, height: env.frame.height }, turns: [{ actions: [action] }, { final: 'done' }] })
    const result = await runTask({ task: 'answer nothing', environment: env, model, control, controller: { canHandOff: false }, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
    const events = readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
    await pause(30) // a request the driver sent would be logged by now
    return { event: events.filter((e) => e.kind === 'action' && e.action?.type === action.type && e.status !== 'attempted').pop(), posted: inputs(child) }
  } finally {
    await env.close()
    await stopFake(child)
  }
}

test('a click on a marked prompt\'s button is handed off by agent core; nothing reaches the helper', async () => {
  const sx = (x) => x // the fake display is 800x600 at scale 1, so frame pixels are points
  const { event, posted } = await runOnFake(world(), { type: 'click', button: 'left', x: sx(320), y: sx(210) })
  assert.deepEqual([event.decision, event.rule, event.attempted], ['handoff', 'system_prompt', false])
  assert.equal(posted, 0)
})

test('a key while the helper reports a prompt shown is handed off, with focus in the app\'s own text area', async () => {
  const { event, posted } = await runOnFake(world({ systemPrompt: true }), { type: 'keypress', keys: ['RETURN'] })
  assert.deepEqual([event.decision, event.rule, event.attempted], ['handoff', 'system_prompt', false])
  assert.equal(event.target?.name, 'Note', 'focus was not on the prompt')
  assert.equal(posted, 0)
})
