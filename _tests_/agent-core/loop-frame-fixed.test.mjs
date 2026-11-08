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

// CU-68: the desktop driver may re-fit the run's frame once, at the first app's join, to that app's display. The run
// header then records the frame the run actually used, and one note says it moved; an unchanged frame adds nothing.

const FIXTURE = 'ai.reflection.cu.fixture'
const DISPLAY_2 = Object.freeze({ width: 1920, height: 1080, scale: 1, display: 2, originPt: Object.freeze({ x: -1920, y: 0 }), viewport: Object.freeze({ width: 1920, height: 1080 }), devicePixelRatio: 1 })
let dir
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cu-frame-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

async function run({ refit }) {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control })
  const launch = environment.frame
  environment.addApp = async () => { if (refit) environment.frame = DISPLAY_2 }
  const store = createAppApprovals({ path: join(dir, 'app-approvals.json') })
  store.grantAlways(FIXTURE, { by: 'api' })
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ final: 'done' }] })
  const result = await runTask({ task: 'look', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
  const header = JSON.parse(readFileSync(join(result.trajectoryDir, 'run.json'), 'utf8'))
  const events = readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  return { launch, header, notes: events.filter((e) => e.kind === 'note' && e.frameFixed) }
}

test('a frame re-fitted at the first app\'s join is what the header records, with one frameFixed note', async () => {
  const { header, notes } = await run({ refit: true })
  assert.equal(header.frame.display, 2)
  assert.deepEqual(header.frame.originPt, { x: -1920, y: 0 })
  assert.equal(notes.length, 1)
  assert.deepEqual(notes[0].frameFixed, { display: 2, width: 1920, height: 1080, originPt: { x: -1920, y: 0 } })
})

test('an unchanged frame leaves the header as written and adds no note', async () => {
  const { launch, header, notes } = await run({ refit: false })
  assert.deepEqual(header.frame, JSON.parse(JSON.stringify(launch)))
  assert.equal(notes.length, 0)
})

test('agent core locks the frame right before the model is told its display', async () => {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control })
  const order = []
  environment.lockFrame = () => { order.push('lockFrame') }
  const store = createAppApprovals({ path: join(dir, 'app-approvals.json') })
  store.grantAlways(FIXTURE, { by: 'api' })
  const scripted = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ final: 'done' }] })
  const model = { ...scripted, async open(options) { order.push('open'); return scripted.open(options) } }
  await runTask({ task: 'look', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
  assert.deepEqual(order, ['lockFrame', 'open'])
})

test('a frame that moves after the model was told its display ends the run (display_changed), nothing performed', async () => {
  const OTHER = 'com.example.other'
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control })
  // The start app joins without a re-fit; a later app joining mid-run would re-fit - the case #145's review found.
  environment.addApp = async (id) => { if (id === OTHER) environment.frame = DISPLAY_2 }
  environment.inspectPoint = async () => ({ origin: OTHER, role: 'AXButton', name: 'OK', fingerprint: 'ok' })
  let performed = 0
  const perform = environment.perform.bind(environment)
  environment.perform = async (...args) => { performed += 1; return perform(...args) }
  const store = createAppApprovals({ path: join(dir, 'app-approvals.json') })
  store.grantAlways(FIXTURE, { by: 'api' })
  store.grantAlways(OTHER, { by: 'api' })
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'click', button: 'left', x: 10, y: 10 }] }, { final: 'done' }] })
  const result = await runTask({ task: 'press OK', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
  assert.equal(result.status, 'error')
  assert.match(result.error, /display_changed/)
  assert.equal(performed, 0)
  assert.equal(result.steps, 1, 'no model turn after the move')
})

