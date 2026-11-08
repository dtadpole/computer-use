/**
 * Canonical key names (design: keys-and-coordinates.md).
 *
 * The canonical action is OpenAI's, so canonical key names are OpenAI's upper-case names: `ENTER`, `CTRL`,
 * `ARROWLEFT`, `F5`, or one printable ASCII character (letters upper case). Both model dialects normalise here,
 * before a batch runs, so a bad key refuses the whole batch by name (R15, R19); drivers receive canonical names
 * only and map them to their input system.
 */

/** Named canonical keys. Printable characters are canonical too but are not listed. */
export const CANONICAL_KEYS = Object.freeze([
  'ENTER', 'ESCAPE', 'TAB', 'SPACE', 'BACKSPACE', 'INSERT', 'DELETE',
  'HOME', 'END', 'PAGEUP', 'PAGEDOWN',
  'ARROWUP', 'ARROWDOWN', 'ARROWLEFT', 'ARROWRIGHT',
  'CTRL', 'SHIFT', 'ALT', 'META',
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
])

/** The modifiers among the canonical keys. */
export const MODIFIER_KEYS = Object.freeze(['CTRL', 'SHIFT', 'ALT', 'META'])

const NAMED = new Set(CANONICAL_KEYS)

/** Aliases from the OpenAI and xdotool dialects, keyed upper case. */
const ALIASES = Object.freeze({
  RETURN: 'ENTER', KP_ENTER: 'ENTER',
  ESC: 'ESCAPE',
  SPACEBAR: 'SPACE', ' ': 'SPACE',
  BACK_SPACE: 'BACKSPACE',
  DEL: 'DELETE', KP_DELETE: 'DELETE',
  INS: 'INSERT',
  PAGE_UP: 'PAGEUP', PGUP: 'PAGEUP', PRIOR: 'PAGEUP',
  PAGE_DOWN: 'PAGEDOWN', PGDN: 'PAGEDOWN', NEXT: 'PAGEDOWN',
  UP: 'ARROWUP', DOWN: 'ARROWDOWN', LEFT: 'ARROWLEFT', RIGHT: 'ARROWRIGHT',
  KP_UP: 'ARROWUP', KP_DOWN: 'ARROWDOWN', KP_LEFT: 'ARROWLEFT', KP_RIGHT: 'ARROWRIGHT',
  KP_HOME: 'HOME', KP_END: 'END',
  CONTROL: 'CTRL', CONTROL_L: 'CTRL', CONTROL_R: 'CTRL',
  SHIFT_L: 'SHIFT', SHIFT_R: 'SHIFT',
  OPTION: 'ALT', ALT_L: 'ALT', ALT_R: 'ALT',
  CMD: 'META', COMMAND: 'META', SUPER: 'META', SUPER_L: 'META', SUPER_R: 'META', META_L: 'META', META_R: 'META',
  WIN: 'META', WINDOWS: 'META',
  // xdotool punctuation keysyms
  MINUS: '-', EQUAL: '=', BRACKETLEFT: '[', BRACKETRIGHT: ']', BACKSLASH: '\\', SEMICOLON: ';',
  APOSTROPHE: "'", COMMA: ',', PERIOD: '.', SLASH: '/', GRAVE: '`', EXCLAM: '!', AT: '@', NUMBERSIGN: '#',
  DOLLAR: '$', PERCENT: '%', ASCIICIRCUM: '^', AMPERSAND: '&', ASTERISK: '*', PARENLEFT: '(', PARENRIGHT: ')',
  UNDERSCORE: '_', PLUS: '+', BRACELEFT: '{', BRACERIGHT: '}', BAR: '|', COLON: ':', QUOTEDBL: '"',
  LESS: '<', GREATER: '>', QUESTION: '?', ASCIITILDE: '~',
})

/** A key name the schema cannot accept. Carries the refusal code the schema reports. */
export class KeyError extends Error {
  constructor(message) {
    super(message)
    this.name = 'KeyError'
    this.code = 'unsupported_key'
  }
}

function isPrintableAscii(ch) {
  const code = ch.codePointAt(0)
  return ch.length === 1 && code >= 0x21 && code <= 0x7e
}

/** Normalise one key name, case-insensitively, to its canonical name, or throw `KeyError`. */
export function normalizeKey(name) {
  if (typeof name !== 'string' || name.length === 0) throw new KeyError('a key name must be a non-empty string')
  if (name.length === 1) {
    if (name === ' ') return 'SPACE'
    if (isPrintableAscii(name)) return name.toUpperCase()
    throw new KeyError(`unsupported key '${name}': use the type action for this character`)
  }
  const upper = name.toUpperCase()
  if (NAMED.has(upper)) return upper
  const alias = ALIASES[upper]
  if (alias !== undefined) return alias
  throw new KeyError(`unsupported key '${name}'`)
}

/** Whether a name is canonical as given (a named key or one printable character, letters upper case). */
export function isCanonicalKey(name) {
  if (typeof name !== 'string') return false
  if (NAMED.has(name)) return true
  return name.length === 1 && isPrintableAscii(name) && name === name.toUpperCase()
}

/**
 * Split an xdotool chord such as `ctrl+shift+t`, `ctrl+plus` or `ctrl++` into canonical names, in order.
 * Used by the Claude adapter before validation.
 */
export function parseKeyCombo(text) {
  if (typeof text !== 'string' || text.trim().length === 0) throw new KeyError('a key combination must be a non-empty string')
  const trimmed = text.trim()
  if (trimmed === '+') return ['+']
  const parts = trimmed.endsWith('++') ? [...trimmed.slice(0, -2).split('+'), '+'] : trimmed.split('+')
  if (parts.some((part) => part.trim().length === 0)) throw new KeyError(`malformed key combination '${text}'`)
  return parts.map((part) => normalizeKey(part.trim()))
}
