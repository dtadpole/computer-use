import { EnvironmentError, invalid } from './errors.mjs'

/**
 * The key table: the names models emit, the canonical names this environment speaks, and the CDP key events
 * each canonical key becomes.
 *
 * - **Dialects.** OpenAI's computer tool emits upper-case names (`CTRL`, `ARROWLEFT`, `ENTER`); Anthropic's
 *   tool emits xdotool keysyms (`ctrl+shift+t`, `Return`, `Page_Down`). Both normalise to one canonical form.
 * - **Canonical names** are W3C `KeyboardEvent.key` values: `Control`, `Enter`, `ArrowLeft`, `F5`, ` ` for the
 *   space bar, and one lower-case character for a printable key. Lookup of named keys is case-insensitive.
 * - **macOS.** Measured on this Mac (headless Chrome 156): `Control+A` and `Meta+A` do nothing in a text field
 *   unless the key event carries `commands: ['selectAll']`, so the editing chords carry their command.
 * - **No `nativeVirtualKeyCode`.** Measured: a modifier key event carrying `nativeVirtualKeyCode` (the Windows code
 *   16 or even the macOS code 56 for Shift) stops the page's animation frames for good, after which every
 *   `mouseMoved` goes unanswered. Descriptors therefore carry `windowsVirtualKeyCode` only, as Puppeteer does.
 * - **Clipboard.** Copy, cut and paste chords are emulated on a per-run buffer, never the owner's pasteboard
 *   (D-011).
 * - **Unknown is refused.** A name this table does not know throws `invalid_argument`; nothing is guessed.
 */

/** Protocol modifier bits. */
export const MODIFIER_BITS = Object.freeze({ Alt: 1, Control: 2, Meta: 4, Shift: 8 })

/** Canonical named keys and their protocol fields. */
const NAMED = {
  Enter: { code: 'Enter', keyCode: 13, text: '\r' },
  Tab: { code: 'Tab', keyCode: 9 },
  Backspace: { code: 'Backspace', keyCode: 8 },
  Delete: { code: 'Delete', keyCode: 46 },
  Escape: { code: 'Escape', keyCode: 27 },
  ' ': { code: 'Space', keyCode: 32, text: ' ' },
  ArrowUp: { code: 'ArrowUp', keyCode: 38 },
  ArrowDown: { code: 'ArrowDown', keyCode: 40 },
  ArrowLeft: { code: 'ArrowLeft', keyCode: 37 },
  ArrowRight: { code: 'ArrowRight', keyCode: 39 },
  Home: { code: 'Home', keyCode: 36 },
  End: { code: 'End', keyCode: 35 },
  PageUp: { code: 'PageUp', keyCode: 33 },
  PageDown: { code: 'PageDown', keyCode: 34 },
  Insert: { code: 'Insert', keyCode: 45 },
  CapsLock: { code: 'CapsLock', keyCode: 20 },
  Shift: { code: 'ShiftLeft', keyCode: 16, location: 1 },
  Control: { code: 'ControlLeft', keyCode: 17, location: 1 },
  Alt: { code: 'AltLeft', keyCode: 18, location: 1 },
  Meta: { code: 'MetaLeft', keyCode: 91, location: 1 },
}
for (let n = 1; n <= 12; n += 1) NAMED[`F${n}`] = { code: `F${n}`, keyCode: 111 + n }

/** US-layout printable keys: unshifted character -> [code, keyCode, shifted character]. */
const PRINTABLE = {
  '`': ['Backquote', 192, '~'], '-': ['Minus', 189, '_'], '=': ['Equal', 187, '+'],
  '[': ['BracketLeft', 219, '{'], ']': ['BracketRight', 221, '}'], '\\': ['Backslash', 220, '|'],
  ';': ['Semicolon', 186, ':'], "'": ['Quote', 222, '"'], ',': ['Comma', 188, '<'],
  '.': ['Period', 190, '>'], '/': ['Slash', 191, '?'],
}
const DIGIT_SHIFTED = ')!@#$%^&*('
for (let d = 0; d <= 9; d += 1) PRINTABLE[String(d)] = [`Digit${d}`, 48 + d, DIGIT_SHIFTED[d]]
for (let c = 97; c <= 122; c += 1) {
  const ch = String.fromCharCode(c)
  PRINTABLE[ch] = [`Key${ch.toUpperCase()}`, c - 32, ch.toUpperCase()]
}
/** Shifted character -> its unshifted key. */
const UNSHIFT = Object.fromEntries(Object.entries(PRINTABLE).map(([base, [, , shifted]]) => [shifted, base]))

/** Aliases from both dialects, keyed upper case; a canonical named key is also its own alias. */
const ALIASES = {
  RETURN: 'Enter', KP_ENTER: 'Enter', ESC: 'Escape', SPACE: ' ', SPACEBAR: ' ', BACK_SPACE: 'Backspace',
  DEL: 'Delete', KP_DELETE: 'Delete', INS: 'Insert', PGUP: 'PageUp', PAGE_UP: 'PageUp', PRIOR: 'PageUp',
  PGDN: 'PageDown', PAGE_DOWN: 'PageDown', NEXT: 'PageDown', UP: 'ArrowUp', DOWN: 'ArrowDown', LEFT: 'ArrowLeft',
  RIGHT: 'ArrowRight', KP_UP: 'ArrowUp', KP_DOWN: 'ArrowDown', KP_LEFT: 'ArrowLeft', KP_RIGHT: 'ArrowRight',
  KP_HOME: 'Home', KP_END: 'End', CAPS_LOCK: 'CapsLock',
  CTRL: 'Control', CONTROL_L: 'Control', CONTROL_R: 'Control', SHIFT_L: 'Shift', SHIFT_R: 'Shift',
  OPTION: 'Alt', ALT_L: 'Alt', ALT_R: 'Alt', CMD: 'Meta', COMMAND: 'Meta', SUPER: 'Meta', SUPER_L: 'Meta',
  SUPER_R: 'Meta', META_L: 'Meta', META_R: 'Meta', WIN: 'Meta', WINDOWS: 'Meta', OS: 'Meta',
  // xdotool punctuation keysyms
  MINUS: '-', EQUAL: '=', BRACKETLEFT: '[', BRACKETRIGHT: ']', BACKSLASH: '\\', SEMICOLON: ';',
  APOSTROPHE: "'", COMMA: ',', PERIOD: '.', SLASH: '/', GRAVE: '`', EXCLAM: '!', AT: '@', NUMBERSIGN: '#',
  DOLLAR: '$', PERCENT: '%', ASCIICIRCUM: '^', AMPERSAND: '&', ASTERISK: '*', PARENLEFT: '(', PARENRIGHT: ')',
  UNDERSCORE: '_', PLUS: '+', BRACELEFT: '{', BRACERIGHT: '}', BAR: '|', COLON: ':', QUOTEDBL: '"',
  LESS: '<', GREATER: '>', QUESTION: '?', ASCIITILDE: '~',
}
for (const name of Object.keys(NAMED)) if (name !== ' ') ALIASES[name.toUpperCase()] = name

/** Normalise one key name from either dialect to its canonical name, or throw `invalid_argument`. */
export function normalizeKey(name) {
  if (typeof name !== 'string' || name.length === 0) throw invalid('a key name must be a non-empty string')
  if (name.length === 1) {
    const lower = name.toLowerCase()
    if (PRINTABLE[lower] !== undefined) return lower
    if (UNSHIFT[name] !== undefined || name === ' ') return name
    throw invalid(`the key '${name}' is not on the keyboard; use the type action for this character`)
  }
  const canonical = ALIASES[name.toUpperCase()]
  if (canonical === undefined) throw invalid(`unknown key name '${name}'`)
  return canonical
}

/** Split an xdotool combination such as `ctrl+shift+t` (or `ctrl+plus`, `ctrl++`) into canonical names. */
export function parseKeyCombo(text) {
  if (typeof text !== 'string' || text.trim().length === 0) throw invalid('a key combination must be a non-empty string')
  const trimmed = text.trim()
  const parts = trimmed.endsWith('++') ? [...trimmed.slice(0, -2).split('+').filter(Boolean), '+'] : trimmed.split('+')
  if (parts.some((part) => part.length === 0)) throw invalid(`malformed key combination '${text}'`)
  return parts.map((part) => normalizeKey(part.trim()))
}

export function isModifier(canonical) {
  return MODIFIER_BITS[canonical] !== undefined
}

/**
 * The protocol fields of one canonical key, as `Input.dispatchKeyEvent` wants them.
 *
 * With `shift`, a printable key reports its shifted character (`a` -> `A`, `1` -> `!`). A shifted character
 * given directly (`!`) is reported as itself on its base key's code.
 */
export function keyDescriptor(canonical, { shift = false } = {}) {
  const named = NAMED[canonical]
  if (named !== undefined) {
    return {
      key: canonical,
      code: named.code,
      windowsVirtualKeyCode: named.keyCode,
      ...(named.text !== undefined ? { text: named.text } : {}),
      ...(named.location !== undefined ? { location: named.location } : {}),
    }
  }
  const base = PRINTABLE[canonical] !== undefined ? canonical : UNSHIFT[canonical]
  if (base === undefined) throw invalid(`unknown canonical key '${canonical}'`)
  const [code, keyCode, shifted] = PRINTABLE[base]
  const key = canonical !== base ? canonical : shift ? shifted : base
  return { key, code, windowsVirtualKeyCode: keyCode, text: key }
}

/**
 * How one character is typed: a key descriptor for a US-keyboard character, `Enter` for a newline, `Tab` for
 * a tab, or `null` when it must go through `Input.insertText`.
 */
export function charDescriptor(char) {
  if (char === '\n' || char === '\r') return keyDescriptor('Enter')
  if (char === '\t') return keyDescriptor('Tab')
  if (char === ' ') return keyDescriptor(' ')
  if (PRINTABLE[char] !== undefined || UNSHIFT[char] !== undefined) return keyDescriptor(char)
  return null
}

/** The bitmask of a list of canonical keys' modifiers. */
export function modifierMask(canonicalKeys) {
  return canonicalKeys.reduce((mask, key) => mask | (MODIFIER_BITS[key] ?? 0), 0)
}

/**
 * What a chord means beyond its key events.
 *
 * - `{ command }`: an editing command the macOS renderer needs on the key event (`selectAll`, `undo`, `redo`).
 * - `{ clipboard }`: copy, cut or paste, performed on the per-run clipboard (`clipboard.mjs`, D-011).
 * - `{ browser }`: a browser-UI shortcut a headless page never sees (`back`, `forward`, `reload`), performed
 *   as a navigation instead.
 * - `{ refuse }`: a browser-UI shortcut with no headless equivalent (new tab, address bar, close tab).
 * - `null`: an ordinary key event.
 */
export function chordMeaning(mask, key) {
  const accel = (mask & (MODIFIER_BITS.Control | MODIFIER_BITS.Meta)) !== 0
  const alt = (mask & MODIFIER_BITS.Alt) !== 0
  const shift = (mask & MODIFIER_BITS.Shift) !== 0
  if (key === 'F5' && !alt) return { browser: 'reload' }
  if (alt && !accel && !shift && key === 'ArrowLeft') return { browser: 'back' }
  if (alt && !accel && !shift && key === 'ArrowRight') return { browser: 'forward' }
  // CU-230: Command or Control with V pastes the run clipboard whatever else is held, Option included, so no raw
  // Paste and Match Style chord reaches the page or Chrome's own paste; agent core judges every such chord as a paste.
  if (accel && key === 'v') return { clipboard: 'paste' }
  if (!accel || alt) return null
  switch (key) {
    case 'a': return shift ? null : { command: 'selectAll' }
    case 'z': return { command: shift ? 'redo' : 'undo' }
    case 'y': return shift ? null : { command: 'redo' }
    case 'c': return { clipboard: 'copy' }
    case 'x': return { clipboard: 'cut' }
    case 'v': return { clipboard: 'paste' }
    case 'r': return { browser: 'reload' }
    case '[': return { browser: 'back' }
    case ']': return { browser: 'forward' }
    case 'l': case 't': case 'n': case 'w': case 'q':
      return { refuse: 'browser window shortcuts (address bar, new or closed tabs and windows) are not available; use the navigate tool' }
    default: return null
  }
}

/** Throw the refusal a chord meaning carries, if any. */
export function refuseChord(meaning) {
  if (meaning?.refuse !== undefined) throw new EnvironmentError('unsupported_action', meaning.refuse)
}
