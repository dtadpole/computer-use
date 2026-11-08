import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'

// CU-272 (cu-researcher measured; cu-coordinator: High): a Stop sent while a slow judgement blocks the event loop must
// be honoured before the action posts.
const START = 'http://127.0.0.1:43117/tasks/demo/'
const tmp = mkdtempSync(join(tmpdir(), 'cu-272-'))
after(() => rmSync(tmp, { recursive: true, force: true }))

function slowPolicy(inner, onJudge) {
  return { ...inner, classify(action, context) {
    onJudge()
    const until = Date.now() + 150
    while (Date.now() < until) { /* a synchronous judgement that takes a while */ }
    return inner.classify(action, context)
  } }
}

for (const [label, send] of [['stop', { command: 'stop', reason: 'enough' }], ['pause then stop', null]]) {
  test(`CU-272: a ${label} sent during a slow classify - nothing posts`, async () => {
    const control = createRunControl()
    const environment = createFakeEnvironment({ url: START, control })
    const inner = createPolicy({ sitePolicy: () => 'allow' })
    const policy = slowPolicy(inner, () => setTimeout(() => {
      if (send) control.send(send, { source: 'view' })
      else { control.send({ command: 'pause' }, { source: 'view' }); setTimeout(() => control.send({ command: 'stop' }, { source: 'view' }), 20) }
    }, 0))
    const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'type', text: 'hello' }] }, { final: 'done' }] })
    const result = await runTask({ task: 'say hello', environment, model, control, policy, sitePolicy: () => 'allow', runsDirectory: join(tmp, label.replace(/ /g, '-')), build: { commit: 'test', dirty: false } })
    assert.equal(environment.log.filter((x) => (x.action ?? x)?.type === 'type').length, 0, 'the type never reached the environment')
    const events = readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action')
    assert.ok(events.some((e) => e.status === 'skipped' && e.reason === 'stopped_before_perform'), JSON.stringify(events.map((e) => e.status)))
  })
}

test('CU-272: without a Stop the slow classify still performs (the re-check costs one turn of the event loop)', async () => {
  const control = createRunControl()
  const environment = createFakeEnvironment({ url: START, control })
  const policy = slowPolicy(createPolicy({ sitePolicy: () => 'allow' }), () => {})
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'type', text: 'hello' }] }, { final: 'done' }] })
  await runTask({ task: 'say hello', environment, model, control, policy, sitePolicy: () => 'allow', runsDirectory: join(tmp, 'plain'), build: { commit: 'test', dirty: false } })
  assert.equal(environment.log.filter((x) => (x.action ?? x)?.type === 'type').length, 1)
})

test('CU-272 on the desktop path: a Stop sent during a slow app-policy judgement - nothing posts', async () => {
  const { createAppApprovals } = await import('../../_tools_/agent-core/app-approvals.mjs')
  const { createAppPolicy } = await import('../../_tools_/agent-core/app-policy.mjs')
  const FIXTURE = 'ai.reflection.cu.fixture'
  const store = createAppApprovals({ path: join(tmp, 'approvals.json') })
  store.grantAlways(FIXTURE, { by: 'api' })
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control })
  const inner = createAppPolicy({ scope: [FIXTURE], approvals: store })
  const policy = slowPolicy(inner, () => setTimeout(() => control.send({ command: 'stop', reason: 'enough' }, { source: 'view' }), 0))
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'type', text: 'hello' }] }, { final: 'done' }] })
  const result = await runTask({ task: 'say hello', environment, model, control, policy, apps: [FIXTURE], appApprovals: store, runsDirectory: join(tmp, 'desktop'), build: { commit: 'test', dirty: false } })
  assert.equal(environment.log.filter((x) => (x.action ?? x)?.type === 'type').length, 0)
  assert.ok(readRun(result.trajectoryDir).events.some((e) => e.kind === 'action' && e.reason === 'stopped_before_perform'))
})

test('CU-274: a pause during a slow classify, then resume - the stale action does not post; the next turn plans again', { timeout: 15_000 }, async () => {
  const control = createRunControl()
  const environment = createFakeEnvironment({ url: START, control })
  let judged = 0
  const policy = slowPolicy(createPolicy({ sitePolicy: () => 'allow' }), () => {
    judged += 1
    if (judged === 1) setTimeout(() => { control.send({ command: 'pause' }, { source: 'control' }); setTimeout(() => control.send({ command: 'resume' }, { source: 'control' }), 20) }, 0)
  })
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'type', text: 'stale' }, { type: 'type', text: 'second' }] }, { actions: [{ type: 'type', text: 'fresh' }] }, { final: 'done' }] })
  const result = await runTask({ task: 'say hello', environment, model, control, policy, sitePolicy: () => 'allow', runsDirectory: join(tmp, 'resume'), build: { commit: 'test', dirty: false } })
  const typed = environment.log.map((x) => x.action ?? x).filter((a) => a?.type === 'type').map((a) => a.text)
  assert.deepEqual(typed, ['fresh'], 'neither the stale action nor the rest of its batch posted')
  assert.ok(readRun(result.trajectoryDir).events.some((e) => e.kind === 'action' && e.reason === 'paused_before_perform'))
})

test('CU-274: a take-over during a slow classify that changes the page, then hand back - the stale action does not post', { timeout: 15_000 }, async () => {
  const control = createRunControl()
  const environment = createFakeEnvironment({ url: START, control })
  let judged = 0
  const policy = slowPolicy(createPolicy({ sitePolicy: () => 'allow' }), () => {
    judged += 1
    if (judged === 1) {
      setTimeout(() => {
        control.send({ command: 'take_over' }, { source: 'control' })
        setTimeout(() => control.send({ command: 'hand_back', note: 'I opened another page' }, { source: 'control' }), 20)
      }, 0)
    }
  })
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'type', text: 'stale' }] }, { actions: [{ type: 'type', text: 'fresh' }] }, { final: 'done' }] })
  const result = await runTask({ task: 'say hello', environment, model, control, policy, sitePolicy: () => 'allow', runsDirectory: join(tmp, 'takeover'), build: { commit: 'test', dirty: false } })
  const typed = environment.log.map((x) => x.action ?? x).filter((a) => a?.type === 'type').map((a) => a.text)
  assert.deepEqual(typed, ['fresh'])
  assert.ok(readRun(result.trajectoryDir).events.some((e) => e.kind === 'action' && e.reason === 'paused_before_perform'))
})
