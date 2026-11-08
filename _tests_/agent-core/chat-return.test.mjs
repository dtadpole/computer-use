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
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'

// CU-253 (cu-researcher): a chat app sends on a plain Return from its compose field, a text area too, with no default
// button to read. Judged on the real desktop path (createAppPolicy) and on the browser's class policy.
const MESSAGES = 'com.apple.MobileSMS'
const SLACK = 'com.tinyspeck.slackmacgap'
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-253-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
const store = createAppApprovals({ path: join(tmp, 'a.json') })
for (const id of [MESSAGES, SLACK, FIXTURE]) store.grantAlways(id, { by: 'api' })
const desktop = createAppPolicy({ scope: [MESSAGES, SLACK, FIXTURE], approvals: store })
const web = createPolicy({ sitePolicy: () => 'allow' })
const key = (...keys) => ({ type: 'keypress', keys })
const entry = (app, role, name) => ({ origin: app, role, name, editable: true, fingerprint: 'c', defaultButton: null, defaultButtonRead: true })
const onDesktop = (app, action, target) => desktop.classify(action, { frontmostBundleId: app, target })
const judged = (v) => (v.decision === 'allow' ? 'allow' : v.class)

test('CU-253: a plain Return or typed line break in a chat app\'s compose field asks submit - a text area too', () => {
  for (const action of [key('ENTER'), { type: 'type', text: 'see you soon\n' }]) {
    assert.equal(judged(onDesktop(MESSAGES, action, entry(MESSAGES, 'AXTextArea', 'iMessage'))), 'submit', `Messages ${action.type}`)
    assert.equal(judged(onDesktop(SLACK, action, entry(SLACK, 'AXTextArea', ''))), 'submit', `Slack, unnamed ${action.type}`)
  }
  assert.equal(judged(onDesktop(FIXTURE, key('ENTER'), entry(FIXTURE, 'AXTextField', 'Type a message'))), 'submit', 'a compose name in any app')
})

test('CU-253: Shift- or Option-Return types a line break and stays allowed; other apps\' text areas keep their line break', () => {
  for (const mod of ['SHIFT', 'ALT']) assert.equal(judged(onDesktop(MESSAGES, key(mod, 'ENTER'), entry(MESSAGES, 'AXTextArea', 'iMessage'))), 'allow', mod)
  assert.equal(judged(onDesktop(FIXTURE, key('ENTER'), entry(FIXTURE, 'AXTextArea', 'Notes'))), 'allow', 'a text area elsewhere')
  assert.equal(judged(onDesktop(FIXTURE, key('ENTER'), entry(FIXTURE, 'AXTextField', 'Message'))), 'allow', 'a bare Message field with a read of no default button')
  assert.equal(judged(onDesktop(MESSAGES, key('ENTER'), { origin: MESSAGES, role: 'AXButton', name: 'Info', fingerprint: 'b', defaultButtonRead: true })), 'allow', 'not a text entry')
})

test('CU-253 in the browser: a compose field named like Slack\'s or WhatsApp\'s asks; a form textarea keeps its line break', () => {
  const at = (target) => judged(web.classify(key('ENTER'), { url: 'https://chat.example/app', target: { ...target, editable: true } }))
  assert.equal(at({ tag: 'div', role: 'textbox', name: 'Message #general' }), 'submit')
  assert.equal(at({ tag: 'div', role: 'textbox', name: 'Type a message' }), 'submit')
  assert.equal(at({ tag: 'textarea', role: 'textbox', name: 'Type a message' }), 'allow', 'a textarea: the web\'s send is Command-Enter (CU-241)')
  assert.equal(at({ tag: 'input', role: 'textbox', name: 'Message' }), 'allow', 'a bare Message input')
})

test('CU-253 through the loop: Return in Messages\' iMessage field is declined unattended, nothing sent', async () => {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control })
  environment.focusedElement = async () => entry(MESSAGES, 'AXTextArea', 'iMessage')
  environment.state = async () => ({ url: `app:${MESSAGES}`, frontmostBundleId: MESSAGES, dialog: null })
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [key('ENTER')] }, { final: 'done' }] })
  const result = await runTask({ task: 'reply', environment, model, control, runsDirectory: join(tmp, 'runs'), build: { commit: 'test', dirty: false }, apps: [MESSAGES], appApprovals: store })
  const action = readRun(result.trajectoryDir).events.find((e) => e.kind === 'action')
  assert.deepEqual([action.decision, action.class], ['confirm', 'submit'])
  assert.equal(environment.log.filter((x) => (x.action ?? x)?.type).length, 0)
})
