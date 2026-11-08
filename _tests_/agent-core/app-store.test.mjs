import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'

// CU-254 (cu-researcher): the App Store installs or updates software from buttons no consent word names.
const STORE = 'com.apple.AppStore'
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-254-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
const store = createAppApprovals({ path: join(tmp, 'a.json') })
for (const id of [STORE, FIXTURE]) store.grantAlways(id, { by: 'api' })
const policy = createAppPolicy({ scope: [STORE, FIXTURE], approvals: store })
const click = { type: 'click', x: 1, y: 1, button: 'left' }
const button = (app, name) => ({ origin: app, role: 'AXButton', name, fingerprint: name, defaultButtonRead: true })
const at = (app, action, target) => policy.classify(action, { frontmostBundleId: app, target })

test('CU-254: the App Store\'s Get, Install, Update and Download ask install - clicked, or Space or Return on one focused', () => {
  for (const name of ['Get', 'Install', 'Update', 'Update All', 'Download', 'Reinstall', 'Get, Slack']) {
    const v = at(STORE, click, button(STORE, name))
    assert.deepEqual([v.decision, v.class, v.rule], ['confirm', 'install', 'target:install'], name)
  }
  for (const keys of [['SPACE'], ['ENTER']]) assert.equal(at(STORE, { type: 'keypress', keys }, button(STORE, 'Get')).class, 'install', keys.join('+'))
  assert.equal(at(STORE, click, button(STORE, 'Buy')).class, 'purchase', 'Buy keeps purchase')
  // cu-verifier on #58: a price button starts a purchase.
  for (const name of ['$4.99', '¥30', '4,99 €', 'Price, 4.99 dollars', '£ 2.49']) {
    const v = at(STORE, click, button(STORE, name))
    assert.deepEqual([v.decision, v.class, v.rule], ['confirm', 'purchase', 'target:purchase'], name)
  }
})

test('CU-254: browsing stays free, the same names elsewhere keep their judgement, and install is never pre-approved on the desktop', () => {
  for (const name of ['See All', 'Discover', 'Getting Started', 'Updates', 'Top 100', 'Priceless Apps']) assert.equal(at(STORE, click, button(STORE, name)).decision, 'allow', name)
  assert.equal(at(FIXTURE, click, button(FIXTURE, 'Get')).decision, 'allow', 'Get in another app')
  const pre = createAppPolicy({ scope: [STORE], approvals: store, preApprovals: [{ class: 'install' }] })
  assert.equal(pre.classify(click, { frontmostBundleId: STORE, target: button(STORE, 'Get') }).decision, 'confirm', 'a pre-approval does not cover it')
})

test('CU-280: a free trial (a renewing subscription) and a price written with its currency code ask purchase in the App Store', () => {
  for (const name of ['Try Free', 'Try It Free', 'Start Free Trial', 'Start Your Free Trial', 'Free Trial', 'USD 4.99', '4,99 EUR', 'GBP 2.49', 'JPY 300']) {
    const v = at(STORE, click, button(STORE, name))
    // CU-288 made a free trial a purchase in any app (class:purchase); a price stays the App Store's own (target:purchase).
    assert.deepEqual([v.decision, v.class], ['confirm', 'purchase'], name)
  }
  for (const name of ['Free Apps', 'Free', 'USB Tools', 'Trials and Tips']) assert.equal(at(STORE, click, button(STORE, name)).decision, 'allow', name)
  assert.equal(at(FIXTURE, click, button(FIXTURE, 'USD 4.99')).decision, 'allow', 'a code price outside the App Store, as before')
  assert.equal(at(FIXTURE, click, button(FIXTURE, 'Try Free')).class, 'purchase', 'CU-288: a trial asks in any app')
})

test('CU-254 through the loop: a click on Get in the App Store is declined unattended, nothing posted', async () => {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control })
  environment.inspectPoint = async () => button(STORE, 'Get')
  environment.state = async () => ({ url: `app:${STORE}`, frontmostBundleId: STORE, dialog: null })
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [click] }, { final: 'done' }] })
  const result = await runTask({ task: 'find an app', environment, model, control, runsDirectory: join(tmp, 'runs'), build: { commit: 'test', dirty: false }, apps: [STORE], appApprovals: store })
  const action = readRun(result.trajectoryDir).events.find((e) => e.kind === 'action')
  assert.deepEqual([action.decision, action.class], ['confirm', 'install'])
  assert.equal(environment.log.filter((x) => (x.action ?? x)?.type).length, 0)
})
