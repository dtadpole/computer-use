import assert from 'node:assert/strict'
import { test } from 'node:test'

import { CANONICAL_KEYS, KeyError, isCanonicalKey, normalizeKey, parseKeyCombo } from '../../_tools_/agent-core/keys.mjs'

test('canonical named keys normalise to themselves, case-insensitively', () => {
  for (const key of CANONICAL_KEYS) {
    assert.equal(normalizeKey(key), key)
    assert.equal(normalizeKey(key.toLowerCase()), key)
  }
  assert.equal(CANONICAL_KEYS.length, 31)
})

test('OpenAI and xdotool aliases map to one canonical name', () => {
  const cases = {
    RETURN: 'ENTER', Return: 'ENTER', ESC: 'ESCAPE', Escape: 'ESCAPE', DEL: 'DELETE', BackSpace: 'BACKSPACE',
    Page_Up: 'PAGEUP', Page_Down: 'PAGEDOWN', Prior: 'PAGEUP', UP: 'ARROWUP', left: 'ARROWLEFT',
    CONTROL: 'CTRL', ctrl: 'CTRL', Control_L: 'CTRL', OPTION: 'ALT', alt: 'ALT', CMD: 'META', COMMAND: 'META',
    super: 'META', WIN: 'META', space: 'SPACE', ' ': 'SPACE', minus: '-', bracketleft: '[', plus: '+',
  }
  for (const [given, expected] of Object.entries(cases)) assert.equal(normalizeKey(given), expected, given)
})

test('printable characters are canonical, letters upper case', () => {
  assert.equal(normalizeKey('a'), 'A')
  assert.equal(normalizeKey('A'), 'A')
  assert.equal(normalizeKey('1'), '1')
  assert.equal(normalizeKey('/'), '/')
  assert.equal(normalizeKey('['), '[')
  assert.ok(isCanonicalKey('A'))
  assert.ok(!isCanonicalKey('a'))
  assert.ok(isCanonicalKey('ENTER'))
  assert.ok(!isCanonicalKey('RETURN'))
})

test('unknown names are refused by name with unsupported_key, never dropped', () => {
  for (const bad of ['HYPER', 'é', '', 'F13', 'CTRLL', 'Kanji']) {
    assert.throws(() => normalizeKey(bad), (error) => error instanceof KeyError && error.code === 'unsupported_key', JSON.stringify(bad))
  }
  assert.throws(() => normalizeKey(42), KeyError)
})

test('xdotool chords split in order, including a literal plus', () => {
  assert.deepEqual(parseKeyCombo('ctrl+shift+t'), ['CTRL', 'SHIFT', 'T'])
  assert.deepEqual(parseKeyCombo('ctrl+s'), ['CTRL', 'S'])
  assert.deepEqual(parseKeyCombo('Return'), ['ENTER'])
  assert.deepEqual(parseKeyCombo('ctrl++'), ['CTRL', '+'])
  assert.deepEqual(parseKeyCombo('ctrl+plus'), ['CTRL', '+'])
  assert.deepEqual(parseKeyCombo('+'), ['+'])
  assert.deepEqual(parseKeyCombo(' super+bracketleft '), ['META', '['])
  for (const bad of ['', 'ctrl+', '+ctrl', 'ctrl++shift', 'ctrl+hyper']) {
    assert.throws(() => parseKeyCombo(bad), KeyError, bad)
  }
})
