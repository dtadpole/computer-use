import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { apiController } from '../../_tools_/agent-core/consent.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'

// P11 with an empty helper: the desktop helper launches with no app in its scope, so before the first capture each
// start app is skipped (excluded), added (always-covered) or asked new_app, and added only once approved. With no start
// app approved the run ends declined before any capture or model call (desktop-extension/app-policy.md).
const FIXTURE = 'ai.reflection.cu.fixture'
const TERMINAL = 'com.apple.Terminal'
const frame = { width: 1440, height: 900 }
const click = { type: 'click', button: 'left', x: 100, y: 100 }
let dir
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cu-desktop-start-apps-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

/** A temp always store holding the given apps, granted the way a person does. */
function store(...ids) {
  const approvals = createAppApprovals({ path: join(dir, 'app-approvals.json') })
  for (const id of ids) approvals.grantAlways(id, { by: 'api' })
  return approvals
}

/**
 * A desktop run on the fake whose `order` lists, in sequence, every consent request (`['request', class]`), every
 * `addApp` and every capture, and whose `opened` counts model sessions.
 */
function setup({ apps = [FIXTURE], appApprovals = null, controller, turns = [{ actions: [click] }, { final: 'done' }], ...rest } = {}) {
  const control = createRunControl()
  const order = []
  control.subscribe((event) => { if (event.type === 'consent_request') order.push(['request', event.request.class]) })
  const environment = createFakeEnvironment({ kind: 'desktop', control, targets: () => ({ origin: FIXTURE, role: 'AXButton', name: 'Show', fingerprint: 'show' }) })
  environment.addApp = async (id) => { order.push(['addApp', id]) }
  const screenshot = environment.screenshot.bind(environment)
  environment.screenshot = async (options) => { order.push(['screenshot']); return screenshot(options) }
  const model = createScriptedAdapter({ frame, turns })
  let opened = 0
  const spy = { ...model, async open(options) { opened += 1; return model.open(options) } }
  const run = () => runTask({
    task: 'desktop task', environment, model: spy, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false },
    apps, appApprovals, ...(controller ? { controller } : {}), bounds: { consentTimeoutMs: 5000 }, ...rest,
  })
  return { environment, control, order, run, opened: () => opened }
}

const readEvents = (runDir) => readFileSync(join(runDir, 'events.jsonl'), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
const decisions = (runDir) => readEvents(runDir).filter((e) => e.kind === 'note' && e.startApp).map((e) => e.startApp)
const clicks = (environment) => environment.log.filter((entry) => entry.type === 'click').length

test('an uncovered start app is asked new_app before any capture; once approved it joins the helper before the first screenshot', async () => {
  const controller = apiController()
  const { environment, order, run } = setup({ controller, appApprovals: store() })
  const running = run()
  const request = await controller.waitForRequest(5000)
  assert.equal(environment.screenshotCount, 0, 'nothing was captured before the question')
  assert.deepEqual(
    [request.kind, request.origin, request.class, request.classes, request.rule, request.what, request.target, request.screenshot, request.lifetimes],
    ['action', 'policy', 'new_app', ['new_app'], 'app:start', `use ${FIXTURE} in this run (a start app)`, { origin: FIXTURE, role: null }, null, ['once', 'run', 'always']],
  )
  assert.equal(request.app, FIXTURE, 'the start-app request names its app')
  controller.respond({ id: request.id, approved: true, lifetime: 'run' })
  const result = await running
  assert.equal(result.status, 'completed')
  const firstShot = order.findIndex(([kind]) => kind === 'screenshot')
  assert.deepEqual(order.slice(0, firstShot + 1), [['request', 'new_app'], ['addApp', FIXTURE], ['screenshot']])
  assert.equal(order.filter(([kind]) => kind === 'addApp').length, 1, 'the helper already holds it at the first click')
  assert.equal(order.filter(([kind]) => kind === 'request').length, 1, 'an api answer grew the run scope: the click needed no second question')
  assert.equal(clicks(environment), 1)
  assert.deepEqual(decisions(result.trajectoryDir), [{ bundleId: FIXTURE, decision: 'approved' }])
})

test('a start app the always store covers joins the helper before the first capture, without a question', async () => {
  const controller = apiController()
  const { environment, order, run } = setup({ controller, appApprovals: store(FIXTURE) })
  const result = await run()
  assert.equal(result.status, 'completed')
  assert.deepEqual(order.slice(0, 2), [['addApp', FIXTURE], ['screenshot']])
  assert.equal(order.filter(([kind]) => kind === 'request').length, 0)
  assert.equal(clicks(environment), 1)
  assert.deepEqual(decisions(result.trajectoryDir), [{ bundleId: FIXTURE, decision: 'covered' }])
})

test('unattended, with no start app approved the run ends declined: no screenshot, no input, no model', async () => {
  const { environment, order, run, opened } = setup({ appApprovals: store() })
  const result = await run()
  assert.equal(result.status, 'declined')
  assert.match(result.finalMessage, /no app was approved/)
  assert.deepEqual([environment.screenshotCount, environment.log.length, opened(), environment.closed], [0, 0, 0, true])
  assert.deepEqual(order, [['request', 'new_app']], 'asked, never added nor captured')
  assert.deepEqual([result.steps, result.actions.done, result.usage.costUsd, result.finalScreenshot], [0, 0, 0, null], 'the early-exit shape')
  const events = readEvents(result.trajectoryDir)
  assert.ok(events.some((e) => e.kind === 'consent' && e.phase === 'answer' && e.answer.answeredBy === 'unattended'))
  assert.deepEqual(decisions(result.trajectoryDir), [{ bundleId: FIXTURE, decision: 'declined' }])
  assert.equal(events.filter((e) => e.kind === 'observation').length, 0)
  assert.equal(events.at(-1).kind, 'end')
  assert.equal(events.at(-1).result.status, 'declined')
})

test('an excluded start app is never asked nor added; alone, the run ends declined without a question', async () => {
  const controller = apiController()
  const mixed = setup({ apps: [TERMINAL, FIXTURE], controller, appApprovals: store(FIXTURE) })
  const result = await mixed.run()
  assert.equal(result.status, 'completed')
  assert.deepEqual(mixed.order.filter(([kind]) => kind !== 'screenshot'), [['addApp', FIXTURE]])
  assert.deepEqual(decisions(result.trajectoryDir), [{ bundleId: TERMINAL, decision: 'excluded' }, { bundleId: FIXTURE, decision: 'covered' }])

  const alone = setup({ apps: [TERMINAL], controller: apiController(), appApprovals: store(FIXTURE) })
  const ended = await alone.run()
  assert.equal(ended.status, 'declined')
  assert.deepEqual([alone.order, alone.environment.screenshotCount, alone.opened()], [[], 0, 0])
  assert.deepEqual(decisions(ended.trajectoryDir), [{ bundleId: TERMINAL, decision: 'excluded' }])
})

test('an always answer to a start app lands in the store by bundle id, from the answering channel', async () => {
  const approvals = store()
  const controller = apiController()
  const { environment, run } = setup({ controller, appApprovals: approvals })
  const running = run()
  const request = await controller.waitForRequest(5000)
  assert.equal(request.rule, 'app:start')
  controller.respond({ id: request.id, approved: true, lifetime: 'always' })
  const result = await running
  assert.equal(result.status, 'completed')
  assert.equal(approvals.covers(FIXTURE), true)
  assert.deepEqual(approvals.list().apps.map(({ bundleId, by }) => [bundleId, by]), [[FIXTURE, 'api']])
  assert.equal(clicks(environment), 1)
})
