import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'
import { createSitePolicy } from '../../_tools_/agent-core/sites.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'

// CU-241 (D-072, keyboard-activation.md): on a web page, Command- or Control-Enter in a multi-line editable - a textarea
// or a contenteditable - is the web's universal send (webmail, chat, comment boxes). The page reports no default button
// to judge, so it asks submit. Named over-ask: code editors. The desktop keeps its default-button reading (CU-142).

const policy = createPolicy({ sitePolicy: () => 'allow' })
const key = (...keys) => ({ type: 'keypress', keys })
const web = (target, action) => policy.classify(action, { url: 'https://mail.example/compose', target })
const verdict = (v) => (v.decision === 'allow' ? 'allow' : v.class)
const textarea = { tag: 'textarea', role: 'textbox', name: 'Message', editable: true }
const rich = { tag: 'div', role: 'textbox', name: 'Message body', editable: true }

test('CU-241: Command- or Control-Enter in a textarea or a contenteditable asks submit', () => {
  for (const target of [textarea, rich]) {
    for (const mod of ['META', 'CTRL']) assert.equal(verdict(web(target, key(mod, 'ENTER'))), 'submit', `${mod}-Enter in ${target.tag}`)
    assert.equal(verdict(web(target, { type: 'hold_key', keys: ['META', 'ENTER'] })), 'submit', `a hold in ${target.tag}`)
  }
})

test('CU-241: a plain Enter there is a new line; a single-line input keeps its rule; a read-only textarea takes no text', () => {
  assert.equal(verdict(web(textarea, key('ENTER'))), 'allow', 'Enter in a textarea is text')
  assert.equal(verdict(web(rich, key('SHIFT', 'ENTER'))), 'allow', 'Shift-Enter in a rich editor is text')
  assert.equal(verdict(web({ tag: 'input', role: 'searchbox', name: 'Search mail', editable: true }, key('META', 'ENTER'))), 'allow', 'a single-line search input: its name decides, as before')
  assert.equal(verdict(web({ ...textarea, editable: false }, key('META', 'ENTER'))), 'allow', 'a read-only textarea')
  assert.equal(verdict(web({ tag: 'button', role: 'button', name: 'Archive' }, key('META', 'ENTER'))), 'allow', 'a control keeps its own rules')
})

test('CU-241: the desktop is unchanged - Command-Return in a text area is judged by the read default button (CU-142)', () => {
  for (const url of ['app://ai.reflection.cu.fixture', 'desktop://']) {
    const area = { role: 'AXTextArea', name: 'Body', editable: true, defaultButton: null, defaultButtonRead: true }
    assert.equal(verdict(policy.classify(key('META', 'ENTER'), { url, target: area })), 'allow', `${url}: read, no default button`)
    assert.equal(verdict(policy.classify(key('META', 'ENTER'), { url, target: { ...area, tag: 'textarea' } })), 'allow', `${url}: a stray tag field does not make it web`)
  }
})

// CU-241 (cu-researcher, 12:47Z): an iframe-body editor (TinyMCE, CKEditor 4, webmail composers) keeps the caret in a
// same-origin frame's <body>, which the driver does not describe (focus null); a cross-origin frame stops the read at the
// <iframe> element. The chord lands in content the gate cannot read, so on a web page it asks submit as in an editor.
const crossOriginFrame = { tag: 'iframe', role: 'Iframe', name: 'Rich Text Area', editable: false }

test('CU-241: Command- or Control-Enter with no described focus (an iframe-body editor) or a frame focus asks submit', () => {
  for (const target of [null, undefined, crossOriginFrame, { ...crossOriginFrame, tag: 'frame', name: '' }]) {
    for (const mod of ['META', 'CTRL']) assert.equal(verdict(web(target, key(mod, 'ENTER'))), 'submit', `${mod}-Enter, focus ${target?.tag ?? target}`)
    assert.equal(verdict(web(target, { type: 'hold_key', keys: ['CTRL', 'ENTER'] })), 'submit', `a hold, focus ${target?.tag ?? target}`)
  }
})

test('CU-241 round 2: extra modifiers, the keypad Enter and every frame host ask too (cu-researcher\'s amendments)', () => {
  const hosts = ['object', 'embed', 'fencedframe', 'IFRAME'].map((tag) => ({ tag, role: null, name: '', editable: false }))
  const byRole = { tag: '', role: 'IframePresentational', name: 'Editor', editable: false }
  for (const target of [null, crossOriginFrame, ...hosts, byRole]) {
    for (const keys of [['META', 'SHIFT', 'ENTER'], ['CTRL', 'ALT', 'ENTER'], ['META', 'KP_ENTER']]) {
      assert.equal(verdict(web(target, key(...keys))), 'submit', `${keys.join('+')}, focus ${target?.tag || target?.role || target}`)
    }
  }
  assert.equal(verdict(web({ tag: 'button', role: 'button', name: 'Archive', editable: false }, key('META', 'SHIFT', 'ENTER'))), 'allow', 'a control, no frame: its own rules')
})

test('CU-241: with no described focus a plain or Shift-Enter, typed text and other chords stay as judged', () => {
  for (const target of [null, crossOriginFrame]) {
    assert.equal(verdict(web(target, key('ENTER'))), 'allow', `Enter, focus ${target?.tag ?? target}: a new line in an editor`)
    assert.equal(verdict(web(target, key('SHIFT', 'ENTER'))), 'allow', `Shift-Enter, focus ${target?.tag ?? target}`)
    assert.equal(verdict(web(target, { type: 'type', text: 'Thanks, see you then' })), 'allow', `typing, focus ${target?.tag ?? target}`)
    assert.equal(verdict(web(target, key('META', 'B'))), 'allow', `Command-B, focus ${target?.tag ?? target}`)
  }
  // A held confirm reads no focus by design (dialog_open): the chord answers the dialog and is judged as that alone.
  const held = policy.classify(key('META', 'ENTER'), { url: 'https://mail.example/compose', target: null, dialog: { type: 'confirm', message: 'Leave this page?' } })
  assert.deepEqual(held.classes, ['page_dialog'], 'a held dialog keeps its own class')
})

test('CU-241: the desktop keeps its reading - no focus there is the driver\'s good read of nothing focused (CU-190)', () => {
  for (const url of ['app://ai.reflection.cu.fixture', 'desktop://']) {
    assert.equal(verdict(policy.classify(key('META', 'ENTER'), { url, target: null })), 'allow', `${url}: no focus`)
  }
})

test('CU-241 in the loop: a browser Command-Enter in an iframe-body editor (focus null) is declined unattended, nothing sent', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cu-241-frame-'))
  try {
    const START = 'http://127.0.0.1:43117/tasks/demo/'
    const control = createRunControl()
    const environment = createFakeEnvironment({ url: START, control })
    environment.focusedElement = async () => null
    const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [key('CTRL', 'ENTER')] }, { final: 'done' }] })
    const result = await runTask({ task: 'draft a reply', environment, model, sitePolicy: createSitePolicy({ startUrl: START }), control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false } })
    const event = readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action').pop()
    assert.deepEqual([event.decision, event.class], ['confirm', 'submit'])
    assert.equal(environment.log.length, 0, 'unattended, the key never reached the page')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('CU-241 in the loop: a focus read that fails never sends the chord - the loop refuses it as target_unknown (cu-verifier)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cu-241-error-'))
  try {
    const START = 'http://127.0.0.1:43117/tasks/demo/'
    const control = createRunControl()
    const environment = createFakeEnvironment({ url: START, control })
    environment.focusedElement = async () => { throw new Error('Execution context was destroyed') }
    const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [key('META', 'ENTER')] }, { final: 'done' }] })
    const result = await runTask({ task: 'draft a reply', environment, model, sitePolicy: createSitePolicy({ startUrl: START }), control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false } })
    const event = readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action').pop()
    assert.deepEqual([event.status, event.code, event.attempted], ['failed', 'target_unknown', false])
    assert.equal(environment.log.length, 0, 'the key never reached the page')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('CU-241 in the loop: a browser Command-Enter in the compose box is declined unattended, nothing sent', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cu-241-'))
  try {
    const START = 'http://127.0.0.1:43117/tasks/demo/'
    const control = createRunControl()
    const environment = createFakeEnvironment({ url: START, control })
    environment.focusedElement = async () => ({ ...textarea, origin: 'http://127.0.0.1:43117', fingerprint: 'm' })
    const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [key('META', 'ENTER')] }, { final: 'done' }] })
    const result = await runTask({ task: 'draft a reply', environment, model, sitePolicy: createSitePolicy({ startUrl: START }), control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false } })
    const event = readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action').pop()
    assert.deepEqual([event.decision, event.class], ['confirm', 'submit'])
    assert.equal(environment.log.length, 0, 'unattended, the key never reached the page')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
