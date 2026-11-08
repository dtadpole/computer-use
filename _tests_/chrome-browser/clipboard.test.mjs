import assert from 'node:assert/strict'
import { test } from 'node:test'
import vm from 'node:vm'

import { CLIPBOARD_MAX_CHARS, createRunClipboard, READ_SELECTION_EXPRESSION, readSelection } from '../../_environments_/chrome-browser/clipboard.mjs'
import { EnvironmentError } from '../../_environments_/chrome-browser/errors.mjs'

const refused = (error) => error instanceof EnvironmentError && error.code === 'invalid_argument'

/** A minimal stand-in for a page: a document with a focused element and a window selection. */
function page({ active, selection = '' }) {
  const win = { getSelection: () => ({ toString: () => selection }) }
  const doc = { activeElement: active, defaultView: win }
  return { doc, win }
}

test('the run clipboard holds one string and refuses oversized or non-string text', () => {
  const clipboard = createRunClipboard({ maxChars: 5 })
  assert.equal(clipboard.get(), '')
  assert.equal(clipboard.set('hello'), 5)
  assert.equal(clipboard.get(), 'hello')
  assert.equal(clipboard.length, 5)
  assert.throws(() => clipboard.set('too long'), refused)
  assert.equal(clipboard.get(), 'hello', 'a refused set keeps the previous content')
  assert.throws(() => clipboard.set(42), refused)
  clipboard.clear()
  assert.equal(clipboard.length, 0)
  assert.equal(CLIPBOARD_MAX_CHARS, 100_000)
})

test('two environments never share a clipboard', () => {
  const one = createRunClipboard()
  const two = createRunClipboard()
  one.set('secret')
  assert.equal(two.get(), '')
})

test('copy from a text field takes its selected range and reports it editable', () => {
  const input = { tagName: 'INPUT', type: 'text', value: 'hello world', selectionStart: 6, selectionEnd: 11, readOnly: false, disabled: false }
  const { doc, win } = page({ active: input })
  assert.deepEqual(readSelection(doc, win), { text: 'world', editable: true })
  const readonly = { ...input, readOnly: true }
  assert.equal(readSelection(page({ active: readonly }).doc, page({ active: readonly }).win).editable, false)
})

test('copy from a password field yields nothing, as a browser does', () => {
  const password = { tagName: 'INPUT', type: 'PASSWORD', value: 'hunter2', selectionStart: 0, selectionEnd: 7 }
  const { doc, win } = page({ active: password })
  assert.deepEqual(readSelection(doc, win), { text: '', editable: false, reason: 'password field' })
})

test('without a text field, copy takes the document selection; contenteditable is editable', () => {
  const body = { tagName: 'BODY', isContentEditable: false }
  assert.deepEqual(readSelection(page({ active: body, selection: 'Order #123' }).doc, page({ active: body, selection: 'Order #123' }).win),
    { text: 'Order #123', editable: false })
  const editor = { tagName: 'DIV', isContentEditable: true }
  const { doc, win } = page({ active: editor, selection: 'draft' })
  assert.deepEqual(readSelection(doc, win), { text: 'draft', editable: true })
})

test('an email or number input (selectionStart null) falls back to the document selection', () => {
  const email = { tagName: 'INPUT', type: 'email', value: 'a@b.c', selectionStart: null, selectionEnd: null }
  const { doc, win } = page({ active: email, selection: '' })
  assert.deepEqual(readSelection(doc, win), { text: '', editable: false })
})

test('same-origin frames are descended into; a cross-origin frame copies nothing', () => {
  const innerInput = { tagName: 'TEXTAREA', value: 'inside frame', selectionStart: 0, selectionEnd: 6, readOnly: false, disabled: false }
  const inner = page({ active: innerInput })
  const frame = { tagName: 'IFRAME', contentDocument: inner.doc }
  const outer = page({ active: frame })
  assert.deepEqual(readSelection(outer.doc, outer.win), { text: 'inside', editable: true })
  const crossOrigin = { tagName: 'IFRAME', get contentDocument() { return null } }
  const blocked = page({ active: crossOrigin })
  assert.deepEqual(readSelection(blocked.doc, blocked.win), { text: '', editable: false, reason: 'cross-origin frame' })
})

test('the page expression evaluates to the same reading in a fresh context', () => {
  const input = { tagName: 'INPUT', type: 'search', value: 'penguin facts', selectionStart: 0, selectionEnd: 7, readOnly: false, disabled: false }
  const { doc, win } = page({ active: input })
  const result = vm.runInNewContext(READ_SELECTION_EXPRESSION, { document: doc, window: win })
  assert.deepEqual({ ...result }, { text: 'penguin', editable: true })
})
