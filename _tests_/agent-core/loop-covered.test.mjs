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

// CU-38 live: a window of an unapproved app over the point is caught by the hit test as new_app before the helper's
// post-time refusal. The person learns the app on run control in every mode; the model is told only that an unapproved
// app covers the point; the trajectory keeps the bundle id, as trajectory privacy allows.

const FIXTURE = 'ai.reflection.cu.fixture'
const OVERLAY = 'now.typeless.desktop'
const frame = { width: 1440, height: 900 }
const click = (x = 100, y = 100) => ({ type: 'click', button: 'left', x, y })
let dir
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cu-loop-covered-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

async function run({ turns, coverFirst = true, frontmostOnly = false }) {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control })
  const store = createAppApprovals({ path: join(dir, 'app-approvals.json') })
  store.grantAlways(FIXTURE, { by: 'api' })
  const notices = []
  control.subscribe((event) => { if (event.type === 'notice' && event.kind === 'point_covered') notices.push(event.app) })
  const inputs = []
  const model = createScriptedAdapter({ frame, turns })
  const spy = {
    ...model,
    async open(options) {
      const session = await model.open(options)
      return { ...session, async next(input = {}, opts = {}) { inputs.push(input); return session.next(input, opts) } }
    },
  }
  const real = environment.inspectPoint.bind(environment)
  let points = 0
  environment.inspectPoint = async (point) => {
    points += 1
    const base = await real(point)
    return coverFirst && points === 1 && !frontmostOnly ? { ...base, origin: OVERLAY, role: 'AXWindow', name: '' } : base
  }
  if (frontmostOnly) {
    const realState = environment.state.bind(environment)
    let states = 0
    environment.state = async () => {
      const state = await realState()
      states += 1
      return states <= 3 ? { ...state, frontmostBundleId: OVERLAY } : state
    }
  }
  const result = await runTask({ task: 'press the button', environment, model: spy, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
  const events = readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8')
  const messages = inputs.flatMap((input) => (input.results ?? []).map((r) => r.message ?? ''))
  return { notices, messages, events }
}

test('a click under an unapproved overlay raises point_covered with its bundle id, tells the model without it, and clears after the next completed action', async () => {
  const { notices, messages, events } = await run({ turns: [{ actions: [click()] }, { actions: [click(120, 120)] }, { final: 'done' }] })
  assert.deepEqual(notices, [OVERLAY, null], 'the person learns the app on run control; the next completed action clears it')
  const declined = messages.find((m) => m.startsWith('Declined'))
  assert.ok(declined, 'the model is told the click was declined')
  assert.ok(!declined.includes(OVERLAY), 'the model is not told the covering app')
  assert.match(declined, /not approved for/)
  assert.ok(events.includes(OVERLAY), 'the trajectory keeps the bundle id')
})

test('a new_app named by the frontmost app (not the hit test) raises no point_covered and keeps the usual wording', async () => {
  const { notices, messages } = await run({ turns: [{ actions: [click()] }, { final: 'done' }], frontmostOnly: true })
  assert.deepEqual(notices, [])
  const declined = messages.find((m) => m.startsWith('Declined'))
  assert.ok(declined, 'the frontmost new_app is declined unattended')
  assert.match(declined, /did not approve/)
})

test('the helper refusing a covered point mid-action tells the model no bundle id; the trajectory (coveredBy) and the notice keep it (CU-47)', async () => {
  const LEDGER = 'ai.reflection.cu.ledger'
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control })
  const store = createAppApprovals({ path: join(dir, 'app-approvals.json') })
  store.grantAlways(FIXTURE, { by: 'api' })
  const notices = []
  control.subscribe((event) => { if (event.type === 'notice' && event.kind === 'point_covered') notices.push(event.app) })
  const inputs = []
  const model = createScriptedAdapter({ frame, turns: [{ actions: [click()] }, { final: 'done' }] })
  const spy = { ...model, async open(options) { const session = await model.open(options); return { ...session, async next(input = {}, opts = {}) { inputs.push(input); return session.next(input, opts) } } } }
  environment.perform = async () => {
    // As the helper (0.2.22+) and the driver (#81) say it: the message is bundle-free; the bundle id is only in details.
    throw Object.assign(new Error('the point (602, 258) is covered by a window of an app this run is not approved for'), { code: 'out_of_scope', details: { reason: 'target_out_of_scope', bundleId: LEDGER } })
  }
  const result = await runTask({ task: 'press the button', environment, model: spy, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
  const failedMessage = inputs.flatMap((input) => (input.results ?? []).map((r) => r.message ?? '')).find((m) => /stopped there/.test(m))
  assert.ok(failedMessage, 'the model is told the action was stopped')
  assert.ok(!failedMessage.includes(LEDGER), 'the model is not told the covering app')
  const events = readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  const failed = events.find((e) => e.kind === 'action' && e.status === 'failed')
  assert.equal(failed.coveredBy, LEDGER, 'the trajectory records the covering app by bundle id')
  assert.ok(!failed.detail.includes(LEDGER), 'the detail is the bundle-free message')
  assert.equal(notices[0], LEDGER, 'the person is told on run control')
})

async function unverifiedRun(details) {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control })
  const store = createAppApprovals({ path: join(dir, 'app-approvals.json') })
  store.grantAlways(FIXTURE, { by: 'api' })
  const notices = []
  control.subscribe((event) => { if (event.type === 'notice') notices.push(event) })
  const inputs = []
  const model = createScriptedAdapter({ frame, turns: [{ actions: [click()] }, { final: 'done' }] })
  const spy = { ...model, async open(options) { const session = await model.open(options); return { ...session, async next(input = {}, opts = {}) { inputs.push(input); return session.next(input, opts) } } } }
  const said = 'the app under the pointer could not be verified as approved (the element there belongs to no app with a bundle id, so it is not an approved app); nothing was posted'
  environment.perform = async () => { throw Object.assign(new Error(said), { code: 'out_of_scope', details: { reason: 'target_unverified', bundleId: null, point: { x: 1, y: 1 }, ...details } }) }
  const result = await runTask({ task: 'press the button', environment, model: spy, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
  const events = readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  const message = inputs.flatMap((input) => (input.results ?? []).map((r) => r.message ?? '')).find((m) => /could not be verified/.test(m))
  return { failed: events.find((e) => e.kind === 'action' && e.status === 'failed'), message, said, notices }
}

test('target_unverified: the trajectory names the culprit by ownerPid and ownerExecutable, keeps elementOwner beside it, and the model text is unchanged (#104)', async () => {
  // A transient bundle-less window over CU Fixture's element: the reply's own pid is the culprit; elementOwner names CU Fixture.
  const run = await unverifiedRun({ ownerPid: 4242, ownerExecutable: '/System/Library/CoreServices/SomeAgent', elementOwner: { pid: 601, bundleId: FIXTURE, title: 'never kept' } })
  assert.deepEqual(run.failed.unverified, { ownerPid: 4242, ownerExecutable: 'SomeAgent', elementOwner: { pid: 601, bundleId: FIXTURE } })
  assert.equal(run.message, run.said, 'the model reads the driver\'s sentence unchanged')
  assert.equal(run.notices.filter((n) => n.kind === 'point_covered').length, 0, 'no covering notice')
  const bare = await unverifiedRun({ ownerPid: 77, ownerExecutable: null, elementOwner: null })
  assert.deepEqual(bare.failed.unverified, { ownerPid: 77, ownerExecutable: null, elementOwner: null })
})

