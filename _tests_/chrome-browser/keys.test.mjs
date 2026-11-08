import assert from 'node:assert/strict'
import { test } from 'node:test'

import { CANONICAL_KEYS, normalizeKey as coreNormalizeKey } from '../../_tools_/agent-core/lib.mjs'
import { EnvironmentError } from '../../_environments_/chrome-browser/errors.mjs'
import {
  charDescriptor, chordMeaning, keyDescriptor, modifierMask, MODIFIER_BITS, normalizeKey, parseKeyCombo, refuseChord,
} from '../../_environments_/chrome-browser/keys.mjs'

const refusedWith = (code) => (error) => error instanceof EnvironmentError && error.code === code

test('OpenAI upper-case names normalise to W3C key values', () => {
  const cases = {
    ENTER: 'Enter', RETURN: 'Enter', ESC: 'Escape', ESCAPE: 'Escape', TAB: 'Tab', SPACE: ' ', BACKSPACE: 'Backspace',
    DELETE: 'Delete', DEL: 'Delete', HOME: 'Home', END: 'End', PAGEUP: 'PageUp', PAGEDOWN: 'PageDown',
    UP: 'ArrowUp', ARROWUP: 'ArrowUp', DOWN: 'ArrowDown', LEFT: 'ArrowLeft', ARROWLEFT: 'ArrowLeft',
    RIGHT: 'ArrowRight', ARROWRIGHT: 'ArrowRight', CTRL: 'Control', CONTROL: 'Control', SHIFT: 'Shift',
    OPTION: 'Alt', ALT: 'Alt', META: 'Meta', CMD: 'Meta', COMMAND: 'Meta', SUPER: 'Meta', F5: 'F5', F12: 'F12',
  }
  for (const [emitted, canonical] of Object.entries(cases)) assert.equal(normalizeKey(emitted), canonical, emitted)
})

test('xdotool keysyms normalise to the same canonical names', () => {
  const cases = {
    Return: 'Enter', KP_Enter: 'Enter', BackSpace: 'Backspace', Page_Up: 'PageUp', Prior: 'PageUp',
    Page_Down: 'PageDown', Next: 'PageDown', Left: 'ArrowLeft', space: ' ', ctrl: 'Control', Control_L: 'Control',
    shift: 'Shift', Shift_R: 'Shift', alt: 'Alt', super: 'Meta', Super_L: 'Meta', minus: '-', equal: '=',
    plus: '+', bracketleft: '[', apostrophe: "'", grave: '`', exclam: '!', question: '?',
  }
  for (const [emitted, canonical] of Object.entries(cases)) assert.equal(normalizeKey(emitted), canonical, emitted)
})

test('letters are case-insensitive and canonical lower case; symbols stay themselves', () => {
  assert.equal(normalizeKey('A'), 'a')
  assert.equal(normalizeKey('a'), 'a')
  assert.equal(normalizeKey('7'), '7')
  assert.equal(normalizeKey('!'), '!')
  assert.equal(normalizeKey(' '), ' ')
})

test('unknown or off-keyboard names are refused, never guessed', () => {
  for (const bad of ['', 'Hyper', 'F13', 'é', 'ENTERR', 42, null, undefined]) {
    assert.throws(() => normalizeKey(bad), refusedWith('invalid_argument'), String(bad))
  }
})

test('xdotool combinations split on plus, including a literal plus key', () => {
  assert.deepEqual(parseKeyCombo('ctrl+shift+t'), ['Control', 'Shift', 't'])
  assert.deepEqual(parseKeyCombo('Return'), ['Enter'])
  assert.deepEqual(parseKeyCombo('ctrl+plus'), ['Control', '+'])
  assert.deepEqual(parseKeyCombo('ctrl++'), ['Control', '+'])
  assert.throws(() => parseKeyCombo('ctrl+'), refusedWith('invalid_argument'))
  assert.throws(() => parseKeyCombo('+a+'), refusedWith('invalid_argument'))
})

test('key descriptors carry protocol code, key code and text', () => {
  assert.deepEqual(keyDescriptor('Enter'), { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' })
  assert.deepEqual(keyDescriptor('Control'), { key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, location: 1 })
  assert.deepEqual(keyDescriptor('a'), { key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, text: 'a' })
  assert.equal(keyDescriptor('a', { shift: true }).key, 'A')
  assert.equal(keyDescriptor('1', { shift: true }).text, '!')
  assert.deepEqual(keyDescriptor('!'), { key: '!', code: 'Digit1', windowsVirtualKeyCode: 49, text: '!' })
  assert.equal(keyDescriptor('?').code, 'Slash')
  assert.equal(keyDescriptor('F1').windowsVirtualKeyCode, 112)
  assert.equal(keyDescriptor(' ').code, 'Space')
  assert.throws(() => keyDescriptor('é'), refusedWith('invalid_argument'))
})

test('typing characters: keyboard characters, newline as Enter, others via insertText', () => {
  assert.equal(charDescriptor('Q').code, 'KeyQ')
  assert.equal(charDescriptor('Q').text, 'Q')
  assert.equal(charDescriptor('\n').key, 'Enter')
  assert.equal(charDescriptor('\t').key, 'Tab')
  assert.equal(charDescriptor('~').code, 'Backquote')
  assert.equal(charDescriptor('é'), null)
  assert.equal(charDescriptor('中'), null)
})

test('modifier mask uses the protocol bits', () => {
  assert.equal(modifierMask(['Shift', 'Control']), MODIFIER_BITS.Shift | MODIFIER_BITS.Control)
  assert.equal(modifierMask(['a']), 0)
})

test('editing chords carry the macOS command for Control and Meta alike', () => {
  const ctrl = MODIFIER_BITS.Control
  const meta = MODIFIER_BITS.Meta
  const shift = MODIFIER_BITS.Shift
  assert.deepEqual(chordMeaning(ctrl, 'a'), { command: 'selectAll' })
  assert.deepEqual(chordMeaning(meta, 'a'), { command: 'selectAll' })
  assert.deepEqual(chordMeaning(ctrl, 'z'), { command: 'undo' })
  assert.deepEqual(chordMeaning(meta | shift, 'z'), { command: 'redo' })
  assert.deepEqual(chordMeaning(ctrl, 'y'), { command: 'redo' })
  assert.equal(chordMeaning(0, 'a'), null)
  assert.equal(chordMeaning(ctrl | MODIFIER_BITS.Alt, 'a'), null)
})

test('browser shortcuts become navigations; clipboard chords are marked; window shortcuts are refused', () => {
  assert.deepEqual(chordMeaning(0, 'F5'), { browser: 'reload' })
  assert.deepEqual(chordMeaning(MODIFIER_BITS.Control, 'r'), { browser: 'reload' })
  assert.deepEqual(chordMeaning(MODIFIER_BITS.Alt, 'ArrowLeft'), { browser: 'back' })
  assert.deepEqual(chordMeaning(MODIFIER_BITS.Meta, ']'), { browser: 'forward' })
  assert.throws(() => refuseChord(chordMeaning(MODIFIER_BITS.Meta, 't')), refusedWith('unsupported_action'))
  assert.deepEqual(chordMeaning(MODIFIER_BITS.Control, 'c'), { clipboard: 'copy' })
  assert.deepEqual(chordMeaning(MODIFIER_BITS.Meta, 'x'), { clipboard: 'cut' })
  assert.deepEqual(chordMeaning(MODIFIER_BITS.Control | MODIFIER_BITS.Shift, 'v'), { clipboard: 'paste' })
  // CU-230: Paste and Match Style (Command-Option-Shift-V) and Command-Option-V paste the run clipboard too - never a raw
  // key Chrome could answer from the system clipboard; Option with C or X stays an ordinary key (no copy).
  assert.deepEqual(chordMeaning(MODIFIER_BITS.Meta | MODIFIER_BITS.Alt | MODIFIER_BITS.Shift, 'v'), { clipboard: 'paste' })
  assert.deepEqual(chordMeaning(MODIFIER_BITS.Meta | MODIFIER_BITS.Alt, 'v'), { clipboard: 'paste' })
  assert.equal(chordMeaning(MODIFIER_BITS.Meta | MODIFIER_BITS.Alt, 'c'), null)
  assert.equal(chordMeaning(MODIFIER_BITS.Alt, 'v'), null, 'Option-V alone types a character')
  assert.doesNotThrow(() => refuseChord(chordMeaning(MODIFIER_BITS.Control, 'c')))
  assert.doesNotThrow(() => refuseChord(null))
})

test('no descriptor carries nativeVirtualKeyCode (it stalls headless Chrome on macOS after a modifier)', () => {
  const names = ['Shift', 'Control', 'Alt', 'Meta', 'Enter', 'Tab', 'Backspace', 'ArrowLeft', 'F5', ' ', 'a', '1', '!', '?']
  for (const name of names) assert.equal('nativeVirtualKeyCode' in keyDescriptor(name), false, name)
  for (const char of ['A', 'z', '\n', '\t', '~']) assert.equal('nativeVirtualKeyCode' in charDescriptor(char), false, JSON.stringify(char))
})

test("the table covers every canonical name agent-core can send, and every printable ASCII character (R15)", () => {
  const printable = Array.from({ length: 0x7e - 0x21 + 1 }, (_, i) => String.fromCharCode(0x21 + i))
  for (const name of [...CANONICAL_KEYS, ...printable, 'SPACE']) {
    const canonical = coreNormalizeKey(name)
    const ours = normalizeKey(canonical)
    assert.doesNotThrow(() => keyDescriptor(ours), `${name} -> ${canonical} -> ${JSON.stringify(ours)}`)
  }
  assert.ok(CANONICAL_KEYS.length >= 31)
})
