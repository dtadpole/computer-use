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
import { isMessagingApp, MESSAGING_APPS } from '../../_tools_/agent-core/app-kinds.mjs'
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

test('CU-287: a messaging app is known by kind - Return in any of its editable text targets asks send, whatever the field is called; its search fields stay free', () => {
  for (const name of ['Message Ann Smith', 'Write a message to Ann', 'Reply in thread', '']) {
    for (const role of ['AXTextArea', 'AXTextField']) assert.equal(judged(onDesktop(SLACK, key('ENTER'), entry(SLACK, role, name))), 'submit', `Slack ${role} '${name}'`)
  }
  assert.equal(judged(onDesktop(SLACK, key('META', 'ENTER'), entry(SLACK, 'AXTextArea', 'Message Ann Smith'))), 'submit', 'Command-Return')
  for (const target of [entry(SLACK, 'AXTextField', 'Search Acme'), entry(SLACK, 'AXTextField', 'Find in conversation'), entry(SLACK, 'AXSearchField', ''), { ...entry(SLACK, 'AXTextField', ''), subrole: 'AXSearchField' }]) {
    assert.equal(judged(onDesktop(SLACK, key('ENTER'), target)), 'allow', `a search field: ${target.role} ${target.subrole ?? ''} '${target.name}'`)
  }
})

test('CU-287: every listed id is a messaging app - the new ids too; a look-alike or a debug build is not, and another app falls back to names (named limit)', () => {
  const ids = MESSAGING_APPS.flatMap((entry) => entry.ids)
  assert.equal(new Set(ids).size, ids.length, 'no id listed twice')
  for (const entry of MESSAGING_APPS) assert.ok(entry.app && entry.ids.length > 0 && entry.source.length > 0, `${entry.app} has ids and a source`)
  for (const id of ['com.apple.MobileSMS', 'com.tinyspeck.slackmacgap', 'com.microsoft.teams2', 'com.microsoft.teams', 'net.whatsapp.WhatsApp', 'ru.keepcoder.Telegram', 'com.tdesktop.Telegram', 'com.hnc.Discord', 'org.whispersystems.signal-desktop']) {
    assert.equal(isMessagingApp(id), true, id)
    const local = createAppPolicy({ scope: [id], approvals: (() => { const a = createAppApprovals({ path: join(tmp, `${id}.json`) }); a.grantAlways(id, { by: 'api' }); return a })() })
    assert.equal(judged(local.classify(key('ENTER'), { frontmostBundleId: id, target: entry(id, 'AXTextArea', 'Message Ann Smith') })), 'submit', `${id} 'Message Ann Smith'`)
  }
  for (const id of ['com.tdesktop.TelegramDebug', 'com.tinyspeck.slackmacgap.helper', 'com.example.slack', '']) assert.equal(isMessagingApp(id), false, `'${id}'`)
  assert.equal(judged(onDesktop(FIXTURE, key('ENTER'), entry(FIXTURE, 'AXTextArea', 'Message Ann Smith'))), 'allow', 'another app: the name rules decide, and this name is not one (named limit)')
})

test('CU-253 (cu-coordinator): a bare Message, Reply or Chat field asks too, in any app - the named over-ask is a form\'s multi-line Message box', () => {
  for (const name of ['Message', 'Reply', 'Chat']) assert.equal(judged(onDesktop(FIXTURE, key('ENTER'), entry(FIXTURE, 'AXTextField', name))), 'submit', name)
  assert.equal(judged(onDesktop(FIXTURE, key('ENTER'), entry(FIXTURE, 'AXTextArea', 'Message'))), 'submit', 'the named over-ask')
  assert.equal(judged(onDesktop(FIXTURE, key('ENTER'), entry(FIXTURE, 'AXTextField', 'Message subject'))), 'allow', 'whole name only')
})

test('CU-253 (cu-researcher): a compose field in its own words - Teams\' \'Type a new message\' and its kin - asks, on the desktop and the web; search fields stay free', () => {
  for (const name of ['Type a new message', 'Write a new message', 'Send a new message', 'Type a message', 'Write a message', 'Write a message\u2026', 'Write a message...', 'Type a new message\u2026', 'Type a message here', 'Type a message here...', 'Message #general\u2026']) {
    for (const role of ['AXTextArea', 'AXTextField']) assert.equal(judged(onDesktop(FIXTURE, key('ENTER'), entry(FIXTURE, role, name))), 'submit', `${role} '${name}'`)
    assert.equal(judged(web.classify(key('ENTER'), { url: 'https://chat.example/', target: { tag: 'div', role: 'textbox', name, editable: true } })), 'submit', `web '${name}'`)
  }
  for (const name of ['Search messages', 'Search messages\u2026', 'Search new messages', 'Find in conversation', 'New message', 'New message subject', 'Type a new message here and more', 'Type a message there']) {
    assert.equal(judged(onDesktop(FIXTURE, key('ENTER'), entry(FIXTURE, 'AXTextField', name))), 'allow', `'${name}' is no compose field`)
    assert.equal(judged(web.classify(key('ENTER'), { url: 'https://chat.example/', target: { tag: 'input', role: 'searchbox', name, editable: true } })), 'allow', `web '${name}'`)
  }
})

test('CU-253 (cu-coordinator): in a chat app Command- or Control-Return asks too; Shift- and Option-Return stay line breaks', () => {
  for (const mod of ['META', 'CTRL']) assert.equal(judged(onDesktop(SLACK, key(mod, 'ENTER'), entry(SLACK, 'AXTextArea', ''))), 'submit', mod)
  assert.equal(judged(onDesktop(FIXTURE, key('CTRL', 'ENTER'), entry(FIXTURE, 'AXTextArea', 'Notes'))), 'allow', 'Control-Return in another app\'s text area')
})

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
  assert.equal(judged(onDesktop(FIXTURE, key('ENTER'), entry(FIXTURE, 'AXTextField', 'Subject'))), 'allow', 'another field with a read of no default button')
  assert.equal(judged(onDesktop(MESSAGES, key('ENTER'), { origin: MESSAGES, role: 'AXButton', name: 'Info', fingerprint: 'b', defaultButtonRead: true })), 'allow', 'not a text entry')
})

test('CU-253 in the browser: a compose field named like Slack\'s or WhatsApp\'s asks; a form textarea keeps its line break', () => {
  const at = (target) => judged(web.classify(key('ENTER'), { url: 'https://chat.example/app', target: { ...target, editable: true } }))
  assert.equal(at({ tag: 'div', role: 'textbox', name: 'Message #general' }), 'submit')
  assert.equal(at({ tag: 'div', role: 'textbox', name: 'Type a message' }), 'submit')
  assert.equal(at({ tag: 'textarea', role: 'textbox', name: 'Type a message' }), 'allow', 'a textarea: the web\'s send is Command-Enter (CU-241)')
  assert.equal(at({ tag: 'input', role: 'textbox', name: 'Message' }), 'submit', 'a bare Message input (cu-coordinator)')
  assert.equal(at({ tag: 'textarea', role: 'textbox', name: 'Message' }), 'allow', 'a contact form\'s Message textarea keeps its line break')
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
