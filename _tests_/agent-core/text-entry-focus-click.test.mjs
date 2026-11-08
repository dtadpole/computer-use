import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'
import { composePresses } from '../../_tools_/agent-core/press.mjs'
import { createSitePolicy } from '../../_tools_/agent-core/sites.mjs'

// CU-170 (text-entry-focus-click.md 0.2.0): a click into a plain text entry takes no purchase, delete or permission
// class from the entry's own name; comboboxes, controls, read-only entries, a Return and submit are unchanged.

const START = 'https://form.example/x'
const policy = createPolicy({ sitePolicy: createSitePolicy({ startUrl: START }) })
const judge = (action, target) => {
  const v = policy.classify(action, { url: START, task: 'fill the form', target: { origin: 'https://form.example', fingerprint: 'f', ...target } })
  return v.decision === 'allow' ? 'allow' : v.class
}
const click = (type = 'click') => ({ type, x: 1, y: 1 })
const entry = (name, extra = {}) => ({ tag: 'input', role: 'textbox', name, editable: true, inputType: 'text', ...extra })
const NAMES = [['Social Security number', 'permission'], ['Security code', 'permission'], ['Delete note', 'delete'], ['Buy now coupon', 'purchase']]

test('a click, double or triple click into a plain text entry takes no class from its name; the same name on a button still asks', () => {
  for (const [name, cls] of NAMES) {
    for (const type of ['click', 'double_click', 'triple_click']) assert.equal(judge(click(type), entry(name)), 'allow', `${type} ${name}`)
    assert.equal(judge(click(), { tag: 'textarea', role: 'textbox', name, editable: true }), 'allow', `textarea ${name}`)
    assert.equal(judge(click(), { role: 'AXTextField', name }), 'allow', `desktop ${name}`)
    assert.equal(judge(click(), { tag: 'button', role: 'button', name, editable: false }), cls, `button ${name}`)
    assert.equal(judge(click(), { role: 'AXButton', name }), cls, `desktop button ${name}`)
  }
})

test('kept: a combobox or pop-up, a control inside a rich editor, a read-only entry', () => {
  assert.equal(judge(click(), { tag: 'input', role: 'combobox', name: 'Permission level', editable: true }), 'permission', 'an input with role combobox')
  assert.equal(judge(click(), { role: 'AXComboBox', name: 'Permission level' }), 'permission')
  assert.equal(judge(click(), { role: 'AXPopUpButton', name: 'Permission level' }), 'permission')
  assert.equal(judge(click(), { tag: 'button', role: 'button', name: 'Delete', editable: true }), 'delete', 'a button that inherited editable (pre-#411) still asks')
  assert.equal(judge(click(), entry('Delete', { editable: false })), 'delete', 'a read-only input styled as a button')
  assert.equal(judge(click(), { role: 'AXTextField', name: 'Delete', editable: false }), 'delete', 'a read-only desktop field')
  assert.equal(judge(click(), { tag: 'div', role: 'generic', name: 'Delete', editable: true }), 'delete', 'editable alone is not a plain entry')
})

test('unchanged: a Return in the entry, submit from its name, and a composed press (cu-researcher)', () => {
  assert.equal(judge({ type: 'keypress', keys: ['ENTER'] }, entry('Security code')), 'permission', 'a Return commits the form')
  assert.equal(judge(click(), { role: 'AXTextField', name: 'Send a message' }), 'submit', 'click-submit-field-name stays')
  const [press] = composePresses([{ type: 'mouse_down' }, { type: 'mouse_up' }], { lastPointer: { x: 5, y: 5 } }).actions
  assert.equal(judge(press, entry('Social Security number')), 'allow', 'a composed press on an entry was already not judged by name')
  assert.equal(judge(press, { tag: 'button', role: 'button', name: 'Delete account', editable: false }), 'delete', 'a composed press on a button still asks')
})
