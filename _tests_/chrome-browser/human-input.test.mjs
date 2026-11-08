import assert from 'node:assert/strict'
import { test } from 'node:test'

import { EnvironmentError } from '../../_environments_/chrome-browser/errors.mjs'
import { planHumanInput } from '../../_environments_/chrome-browser/human-input.mjs'

const viewport = { width: 1280, height: 800 }
const code = (expected) => (error) => error instanceof EnvironmentError && error.code === expected
const one = (event) => planHumanInput(event, viewport)[0]

test('mouse events map to CDP with button bits only while pressed', () => {
  assert.deepEqual(one({ type: 'mouse', action: 'move', x: 10.5, y: 20 }).params,
    { type: 'mouseMoved', x: 10.5, y: 20, button: 'none', buttons: 0, clickCount: 0, modifiers: 0 })
  assert.deepEqual(one({ type: 'mouse', action: 'down', x: 1, y: 2, button: 'right', clickCount: 2, modifiers: { shift: true } }).params,
    { type: 'mousePressed', x: 1, y: 2, button: 'right', buttons: 2, clickCount: 2, modifiers: 8 })
  assert.equal(one({ type: 'mouse', action: 'up', x: 1, y: 2 }).params.buttons, 0)
  assert.throws(() => one({ type: 'mouse', action: 'down', x: 1280, y: 2 }), code('invalid_argument'))
  assert.throws(() => one({ type: 'mouse', action: 'hover', x: 1, y: 2 }), code('invalid_argument'))
  assert.throws(() => one({ type: 'mouse', action: 'down', x: 1, y: 2, button: 'thumb' }), code('invalid_argument'))
})

test('wheel and text', () => {
  assert.deepEqual(one({ type: 'wheel', x: 5, y: 5, deltaY: 120 }).params,
    { type: 'mouseWheel', x: 5, y: 5, button: 'none', buttons: 0, clickCount: 0, deltaX: 0, deltaY: 120, modifiers: 0 })
  assert.deepEqual(one({ type: 'text', text: 'pasted text' }), { method: 'Input.insertText', params: { text: 'pasted text' } })
  assert.throws(() => one({ type: 'text', text: '' }), code('invalid_argument'))
})

test('keys: printable keys type text, shifted letters are upper case, chords carry no text', () => {
  const a = one({ type: 'key', action: 'down', key: 'a' }).params
  assert.deepEqual([a.type, a.key, a.text], ['keyDown', 'a', 'a'])
  const shiftA = one({ type: 'key', action: 'down', key: 'A', modifiers: { shift: true } }).params
  assert.deepEqual([shiftA.key, shiftA.text, shiftA.modifiers], ['A', 'A', 8])
  const enter = one({ type: 'key', action: 'down', key: 'Enter' }).params
  assert.equal(enter.text, '\r')
  const up = one({ type: 'key', action: 'up', key: 'a' }).params
  assert.deepEqual([up.type, up.text], ['keyUp', undefined])
  const shift = one({ type: 'key', action: 'down', key: 'Shift', modifiers: { shift: true } }).params
  assert.equal('nativeVirtualKeyCode' in shift, false, 'never sent: it stalls headless Chrome on macOS')
})

test('keys: editing chords, browser chords and clipboard chords behave as for the agent; window chords are refused', () => {
  assert.deepEqual(one({ type: 'key', action: 'down', key: 'a', modifiers: { meta: true } }).params.commands, ['selectAll'])
  assert.deepEqual(one({ type: 'key', action: 'down', key: 'ArrowLeft', modifiers: { alt: true } }), { kind: 'navigate', direction: 'back' })
  assert.deepEqual(one({ type: 'key', action: 'down', key: 'v', modifiers: { ctrl: true } }), { kind: 'clipboard', op: 'paste' })
  assert.throws(() => one({ type: 'key', action: 'down', key: 't', modifiers: { meta: true } }), code('unsupported_action'))
})

test('keys without a descriptor are dropped; malformed events are refused', () => {
  assert.deepEqual(planHumanInput({ type: 'key', action: 'down', key: 'Dead' }, viewport), [])
  assert.deepEqual(planHumanInput({ type: 'key', action: 'down', key: 'Unidentified' }, viewport), [])
  assert.throws(() => one({ type: 'key', action: 'press', key: 'a' }), code('invalid_argument'))
  assert.throws(() => one({ type: 'gesture' }), code('invalid_argument'))
  assert.throws(() => one(null), code('invalid_argument'))
})
