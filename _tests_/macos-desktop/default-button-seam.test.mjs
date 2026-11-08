import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { fakeLauncher, logged, scratchLocks, stopFake } from './harness.mjs'

/**
 * CU-142 across the real seam: agent core's loop over the real driver and the fake helper, so the default button a
 * Return presses reaches agent core through the helper's 'focused' reply and the driver's focusedElement() (#323) -
 * not through agent core's stand-in. A Return in an unnamed message field whose window's default button is 'Send' is a
 * submit, asked (and, unattended, declined: nothing posted); with no default button reported it is judged by the
 * field's own name only; an unnamed default button stays allowed but is marked defaultButtonUnnamed.
 */

const FIXTURE = 'ai.reflection.cu.fixture'
const locks = scratchLocks()
const dir = mkdtempSync(join(tmpdir(), 'cu-db-seam-'))
after(() => { locks.remove(); rmSync(dir, { recursive: true, force: true }) })
const launchOnFake = fakeLauncher(locks, { apps: [FIXTURE] })
const inputs = (child) => child.requests.filter((r) => r.type === 'input').length

const FIELD = { bundleId: FIXTURE, pid: 601, role: 'AXTextField', subrole: null, title: null, frame: { x: 20, y: 400, width: 300, height: 24 }, secure: false, editable: true }
const AREA = { ...FIELD, role: 'AXTextArea', frame: { x: 20, y: 300, width: 300, height: 90 } }
const SEND = { bundleId: FIXTURE, pid: 601, role: 'AXButton', subrole: null, title: 'Send', frame: { x: 340, y: 400, width: 60, height: 24 }, secure: false }
const world = (extra) => ({
  displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 800, height: 600 }, scale: 1 }],
  apps: [{ bundleId: FIXTURE, pid: 601, title: 'Fixture', rect: { x: 0, y: 0, width: 800, height: 600 } }],
  frontmost: FIXTURE,
  elements: [{ rect: FIELD.frame, element: FIELD }, { rect: SEND.frame, element: SEND }],
  focused: FIELD,
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
    const result = await runTask({ task: 'reply to the message', environment: env, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
    const events = readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
    const event = events.filter((e) => e.kind === 'action' && e.action?.type === action.type && e.status !== 'attempted').pop()
    return { event, posted: inputs(child) }
  } finally {
    await env.close()
    await stopFake(child)
  }
}

const RETURN = { type: 'keypress', keys: ['RETURN'] }
const summary = (e) => JSON.stringify({ decision: e?.decision, rule: e?.rule, class: e?.class, classes: e?.classes, defaultButtonUnnamed: e?.defaultButtonUnnamed, status: e?.status })

test('CU-142 seam: Return in an unnamed field whose default button is Send is a submit - asked, declined unattended, nothing posted', async () => {
  const { event, posted } = await runOnFake(world({ defaultButton: SEND }), RETURN)
  assert.equal(event?.decision, 'confirm', summary(event))
  assert.equal(posted, 0, 'declined unattended: the Return never reached the helper')
})

test('CU-142 seam: no default button reported - judged by the field\'s own name only (allowed, posted)', async () => {
  const { event, posted } = await runOnFake(world({}), RETURN)
  assert.equal(event?.decision, 'allow', summary(event))
  assert.equal(posted, 1)
})

test('CU-142 seam: an unnamed default button - allowed, and the event is marked defaultButtonUnnamed', async () => {
  const { event } = await runOnFake(world({ defaultButton: { ...SEND, title: '' } }), RETURN)
  assert.deepEqual([event?.decision, event?.defaultButtonUnnamed], ['allow', true], summary(event))
})

test('CU-142 seam: in a text area a Return is text - the default button Send does not make it a submit', async () => {
  const { event } = await runOnFake(world({ focused: AREA, defaultButton: SEND }), RETURN)
  assert.equal(event?.decision, 'allow', summary(event))
})
