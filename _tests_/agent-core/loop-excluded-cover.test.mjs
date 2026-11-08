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


// An excluded app's window at the point (a system alert left on screen): the person is told on run control which window
// to dismiss, the model only that such a window covers the point, and the trajectory keeps the bundle id.

test('an excluded app at the point (a system alert) raises point_covered for the person; the model is not told the app; the trajectory keeps it', async () => {
  const ALERT = 'com.apple.UserNotificationCenter'
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control })
  const store = createAppApprovals({ path: join(dir, 'app-approvals.json') })
  store.grantAlways(FIXTURE, { by: 'api' })
  const notices = []
  control.subscribe((event) => { if (event.type === 'notice' && event.kind === 'point_covered') notices.push(event.app) })
  const inputs = []
  const model = createScriptedAdapter({ frame, turns: [{ actions: [click()] }, { final: 'done' }] })
  const spy = { ...model, async open(options) { const session = await model.open(options); return { ...session, async next(input = {}, opts = {}) { inputs.push(input); return session.next(input, opts) } } } }
  environment.inspectPoint = async () => ({ origin: ALERT, role: null, name: null, fingerprint: 'alert' })
  let performed = 0
  const perform = environment.perform.bind(environment)
  environment.perform = async (...args) => { performed += 1; return perform(...args) }
  const result = await runTask({ task: 'press the button', environment, model: spy, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
  assert.equal(performed, 0, 'nothing is sent')
  assert.equal(notices[0], ALERT, 'the person is told which window covers the point')
  const message = inputs.flatMap((input) => (input.results ?? []).map((r) => r.message ?? '')).find((m) => /Blocked by policy/.test(m))
  assert.ok(message && !message.includes(ALERT), 'the model is not told the app')
  const events = readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  const blocked = events.find((e) => e.kind === 'action' && e.status === 'blocked')
  assert.match(blocked.rule, /^excluded:/)
  assert.equal(blocked.app, ALERT, 'the trajectory keeps the bundle id')
})
