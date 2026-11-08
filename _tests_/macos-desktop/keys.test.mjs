import assert from 'node:assert/strict'
import { test } from 'node:test'

import { CANONICAL_KEYS, MODIFIER_KEYS, normalizeKey as coreNormalizeKey } from '../../_tools_/agent-core/lib.mjs'
import { EnvironmentError } from '../../_environments_/macos-desktop/errors.mjs'
import * as keys from '../../_environments_/macos-desktop/keys.mjs'
import { flagsFor, isModifier, keyStroke, MODIFIER_FLAGS, NAMED_KEY_CODES, normalizeKey } from '../../_environments_/macos-desktop/keys.mjs'

const refusedWith = (code) => (error) => error instanceof EnvironmentError && error.code === code

test('every agent-core canonical named key has a macOS key code, and nothing else is named', () => {
  for (const key of CANONICAL_KEYS) {
    const stroke = keyStroke(key)
    assert.equal(Number.isInteger(stroke.keyCode) && stroke.keyCode >= 0 && stroke.keyCode <= 0x7f, true, key)
    assert.equal(stroke.shift, false, key)
  }
  assert.deepEqual(Object.keys(NAMED_KEY_CODES).sort(), [...CANONICAL_KEYS].sort())
})

test('every printable ASCII character agent core accepts maps to a US-ANSI key, shifted where needed', () => {
  for (let code = 0x21; code <= 0x7e; code += 1) {
    const canonical = coreNormalizeKey(String.fromCharCode(code))
    const stroke = keyStroke(canonical)
    assert.equal(Number.isInteger(stroke.keyCode), true, canonical)
  }
  assert.deepEqual(keyStroke('A'), { keyCode: 0x00, shift: false })
  assert.deepEqual(keyStroke('1'), { keyCode: 0x12, shift: false })
  assert.deepEqual(keyStroke('!'), { keyCode: 0x12, shift: true })
  assert.deepEqual(keyStroke('?'), { keyCode: 0x2c, shift: true })
  assert.deepEqual(keyStroke('`'), { keyCode: 0x32, shift: false })
  assert.deepEqual(keyStroke('~'), { keyCode: 0x32, shift: true })
})

test('the codes are the kVK_* constants of the keys they name', () => {
  const expected = {
    ENTER: 0x24, TAB: 0x30, SPACE: 0x31, BACKSPACE: 0x33, ESCAPE: 0x35, META: 0x37, SHIFT: 0x38, ALT: 0x3a, CTRL: 0x3b,
    DELETE: 0x75, HOME: 0x73, END: 0x77, PAGEUP: 0x74, PAGEDOWN: 0x79, ARROWLEFT: 0x7b, ARROWRIGHT: 0x7c,
    ARROWDOWN: 0x7d, ARROWUP: 0x7e, F1: 0x7a, F5: 0x60, F12: 0x6f, INSERT: 0x72,
  }
  for (const [key, code] of Object.entries(expected)) assert.equal(NAMED_KEY_CODES[key], code, key)
  const letters = { Q: 0x0c, W: 0x0d, Z: 0x06, M: 0x2e, C: 0x08, V: 0x09, X: 0x07 }
  for (const [key, code] of Object.entries(letters)) assert.equal(keyStroke(key).keyCode, code, key)
})

test("names normalise with agent core's own rules, both dialects; unknown names are refused", () => {
  assert.equal(normalizeKey('cmd'), 'META')
  assert.equal(normalizeKey('Control_L'), 'CTRL')
  assert.equal(normalizeKey('option'), 'ALT')
  assert.equal(normalizeKey('Return'), 'ENTER')
  assert.equal(normalizeKey('a'), 'A')
  assert.equal(normalizeKey(' '), 'SPACE')
  assert.throws(() => normalizeKey('Hyper'), refusedWith('invalid_argument'))
  assert.throws(() => normalizeKey('é'), refusedWith('invalid_argument'))
  assert.throws(() => normalizeKey(''), refusedWith('invalid_argument'))
  assert.throws(() => keyStroke('NOPE'), refusedWith('invalid_argument'))
})

test('modifiers carry the CGEventFlags bits of Control, Shift, Option and Command', () => {
  assert.deepEqual(MODIFIER_FLAGS, { SHIFT: 0x20000, CTRL: 0x40000, ALT: 0x80000, META: 0x100000 })
  for (const key of MODIFIER_KEYS) assert.equal(isModifier(key), true, key)
  assert.equal(isModifier('A'), false)
  assert.equal(flagsFor(['META', 'SHIFT']), 0x120000)
  assert.equal(flagsFor([]), 0)
})

test('D-031: C, X and V are ordinary keys with Command or Control, and the module keeps no pasteboard refusal', () => {
  const ansi = { C: 0x08, X: 0x07, V: 0x09 } // kVK_ANSI_C, kVK_ANSI_X, kVK_ANSI_V
  for (const [key, keyCode] of Object.entries(ansi)) {
    assert.deepEqual(keyStroke(normalizeKey(key.toLowerCase())), { keyCode, shift: false }, key)
  }
  assert.equal(flagsFor(['META']), 0x100000, 'Command')
  assert.equal(flagsFor(['CTRL']), 0x40000, 'Control')
  assert.equal(flagsFor(['META', 'SHIFT']), 0x120000, 'Cmd+Shift (paste and match style)')
  for (const gone of ['refusePasteboardChord', 'PASTEBOARD_REFUSAL', 'PASTEBOARD_KEYS']) {
    assert.equal(Object.hasOwn(keys, gone), false, `${gone} is gone with D-025's refusal`)
  }
})
