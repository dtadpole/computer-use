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
