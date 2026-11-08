import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-135 (keyboard-activation.md): a keypress that activates a button is judged like a click on it, and a save panel's
// Replace and a close sheet's Don't Save are destructive.

const policy = createPolicy({ sitePolicy: () => 'allow' })
const decide = (action, target) => policy.classify(action, { url: 'app:ai.reflection.cu.fixture', target })
const button = (name) => ({ role: 'AXButton', name })
const key = (...keys) => ({ type: 'keypress', keys })

test('Space alone on a focused button is judged as a click on it', () => {
  assert.deepEqual([decide(key('SPACE'), button('Delete')).decision, decide(key('SPACE'), button('Delete')).class], ['confirm', 'delete'])
  assert.equal(decide(key('SPACE'), { role: 'button', name: 'Delete archive' }).class, 'delete', 'the browser role too')
  assert.equal(decide(key('SPACE'), button('Update cart')).decision, 'allow', 'a benign button')
  assert.equal(decide(key('SPACE'), { role: 'AXTextField', name: 'Delete reason' }).decision, 'allow', 'a space typed into a field presses nothing')
  assert.equal(decide(key('SHIFT', 'SPACE'), button('Delete')).decision, 'allow', 'only Space alone')
})

test('Space on any control a click activates is judged like that click', () => {
  assert.equal(decide(key('SPACE'), { role: 'AXCheckBox', name: 'Delete originals after import' }).class, 'delete', 'a checkbox toggled by Space')
  assert.equal(decide(key('SPACE'), { role: 'AXRadioButton', name: 'Remove all' }).class, 'delete')
  assert.equal(decide(key('SPACE'), { role: 'AXMenuItem', name: 'Empty Trash' }).class, 'delete')
  assert.equal(decide(key('SPACE'), { role: 'link', name: 'Delete account' }).class, 'delete')
  assert.equal(decide(key('SPACE'), { role: 'AXSearchField', name: 'Delete' }).decision, 'allow', 'a text input types a space')
})

test('ENTER keeps today\'s rule', () => {
  assert.equal(decide(key('ENTER'), button('Delete')).class, 'delete')
})

test('Command-Backspace deletes, in a text field too', () => {
  for (const keys of [['META', 'BACKSPACE'], ['CMD', 'BACKSPACE'], ['META', 'DELETE']]) {
    assert.equal(decide(key(...keys), { role: 'AXOutline', name: 'Files' }).class, 'delete', keys.join('+'))
  }
  assert.equal(decide(key('META', 'BACKSPACE'), null).class, 'delete', 'with no focused element known')
  assert.equal(decide(key('META', 'BACKSPACE'), { role: 'AXTextArea', name: 'Body' }).class, 'delete', 'in a text area too: the menu sees it first (CU-143, live)')
  assert.equal(decide(key('BACKSPACE'), { role: 'AXGroup', name: 'Canvas' }).decision, 'allow', 'Backspace alone, not on a collection')
  // CU-147: on a focused outline, list or table a plain Backspace removes the selection (Mail; Finder ignores it - an
  // accepted over-ask, 0 recorded), so it asks.
  assert.equal(decide(key('BACKSPACE'), { role: 'AXOutline', name: 'Files' }).class, 'delete', 'Backspace on a collection')
  assert.equal(decide(key('META', 'ALT', 'BACKSPACE'), { role: 'AXOutline', name: 'Files' }).class, 'delete', 'Command-Option-Backspace: delete immediately')
  // CU-143: Command-Option-Backspace is no text binding (Option-Backspace is), so from a text input it reaches the menu.
  assert.equal(decide(key('META', 'ALT', 'BACKSPACE'), { role: 'AXTextField', name: 'Title' }).class, 'delete', 'in a text input it reaches the menu')
})

test('Command-D with a button focused presses a sheet\'s Don\'t Save or Delete', () => {
  assert.equal(decide(key('META', 'D'), button('Save')).class, 'delete')
  assert.equal(decide(key('META', 'D'), { role: 'AXTextArea', name: 'Body' }).decision, 'allow', 'in an editor it is not a sheet')
  assert.equal(decide(key('META', 'SHIFT', 'D'), button('Save')).decision, 'allow', 'only Command-D')
})

test('Replace, Overwrite and Don\'t Save are destructive; Cancel and Keep Both are not', () => {
  for (const name of ['Replace', 'Overwrite', "Don't Save", 'Don\u2019t Save', 'Replace All']) {
    assert.equal(decide({ type: 'click', x: 1, y: 1, button: 'left' }, button(name)).class, 'delete', name)
  }
  assert.equal(decide(key('SPACE'), button('Replace')).class, 'delete', 'Replace by Space')
  for (const name of ['Cancel', 'Keep Both', 'Save']) assert.equal(decide({ type: 'click', x: 1, y: 1, button: 'left' }, button(name)).decision, 'allow', name)
})

test('delete is never pre-approved', () => {
  const granted = createPolicy({ sitePolicy: () => 'allow', preApprovals: [{ class: 'delete' }] })
  assert.equal(granted.classify(key('SPACE'), { url: 'app:x', target: button('Delete') }).decision, 'confirm')
})

test('every other keyboard route to a focused control is judged too (cu-researcher\'s red team)', () => {
  // A key hold is the same chord pressed: its release presses the focused control.
  assert.equal(decide({ type: 'hold_key', keys: ['SPACE'], duration_ms: 500 }, button('Delete')).class, 'delete')
  assert.equal(decide({ type: 'hold_key', keys: ['RETURN'], duration_ms: 500 }, button('Delete')).class, 'delete')
  // Every spelling of Return is ENTER.
  for (const name of ['RETURN', 'Return', 'enter', 'KP_Enter']) assert.equal(decide(key(name), button('Delete')).class, 'delete', name)
  // A typed space or newline on a focused control presses it; into a text input it is text.
  assert.equal(decide({ type: 'type', text: ' ' }, button('Delete')).class, 'delete')
  assert.equal(decide({ type: 'type', text: 'ok\n' }, { role: 'AXCheckBox', name: 'Remove originals' }).class, 'delete')
  assert.equal(decide({ type: 'type', text: 'Delete the old draft\n' }, { role: 'AXTextArea', name: 'Notes' }).decision, 'allow', 'text typed into a field')
  assert.equal(decide({ type: 'type', text: 'abc' }, button('Delete')).decision, 'allow', 'letters press nothing')
})
