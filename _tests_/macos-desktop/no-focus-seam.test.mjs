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
 * CU-148's no-focus case through the real path (cu-verifier's ask): agent core's loop, app-policy included, over the
 * real driver and the fake helper. With keyboard navigation off nothing holds the focus, so the helper answers
 * 'focused' with element null and the window's facts; the driver's placeholder target must name the app whose window
 * was read, or app-policy blocks it (fail closed). Earlier header, kept for the shared setup: CU-142 across the real seam: agent core's loop over the real driver and the fake helper, so the default button a
 * Return presses reaches agent core through the helper's 'focused' reply and the driver's focusedElement() (#323) -
 * not through agent core's stand-in. A Return in an unnamed message field whose window's default button is 'Send' is a
 * submit, asked (and, unattended, declined: nothing posted); with no default button reported it is judged by the
 * field's own name only; an unnamed default button stays allowed but is marked defaultButtonUnnamed.
 */

const FIXTURE = 'ai.reflection.cu.fixture'
const locks = scratchLocks()
const dir = mkdtempSync(join(tmpdir(), 'cu-nofocus-seam-'))
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
const summary = (e) => JSON.stringify({ decision: e?.decision, rule: e?.rule, class: e?.class, status: e?.status, targetUnnamed: e?.targetUnnamed })
const noFocus = (extra) => world({ focused: null, ...extra })
const APP = { bundleId: FIXTURE, pid: 601 }

test('CU-148 no focus: the placeholder names the app whose window was read - Return with a default button Send is asked submit, nothing posted', async () => {
  const { event, posted } = await runOnFake(noFocus({ defaultButton: SEND, focusedApp: APP }), RETURN)
  assert.equal(event?.decision, 'confirm', summary(event))
  assert.equal(posted, 0, 'declined unattended: the Return never reached the helper')
})

test('CU-148 no focus: a placeholder that names no app is blocked by app-policy (fail closed), never allowed, nothing posted', async () => {
  const { event, posted } = await runOnFake(noFocus({ defaultButton: SEND }), RETURN)
  assert.notEqual(event?.decision, 'allow', summary(event))
  assert.equal(posted, 0, summary(event))
})

test('CU-148 no focus and nothing read: no placeholder, today\'s verdict - the Return is allowed and posted', async () => {
  const { event, posted } = await runOnFake(noFocus({ focusedApp: APP }), RETURN)
  assert.equal(event?.decision, 'allow', summary(event))
  assert.equal(posted, 1)
})

// CU-148's own case (cu-verifier: not reachable live on a Mac with keyboard navigation on, where the alert's Cancel
// always holds the focus): nothing focused, a sheet up - Command-D presses its Don't Save, so it is asked as delete.
const COMMAND_D = { type: 'keypress', keys: ['META', 'D'] }

test('CU-148 no focus, a sheet up: Command-D is asked as delete (the placeholder carries sheet), nothing pressed', async () => {
  const { event, posted } = await runOnFake(noFocus({ sheet: true, focusedApp: APP }), COMMAND_D)
  assert.deepEqual([event?.decision, event?.class], ['confirm', 'delete'], summary(event))
  assert.equal(posted, 0, 'declined unattended: Command-D never reached the helper')
})

test('CU-148 no focus, a sheet up: Escape stays allowed (it cancels), and is posted', async () => {
  const { event, posted } = await runOnFake(noFocus({ sheet: true, focusedApp: APP }), { type: 'keypress', keys: ['ESCAPE'] })
  assert.equal(event?.decision, 'allow', summary(event))
  assert.equal(posted, 1)
})
