import { KeyError, MODIFIER_KEYS, normalizeKey as coreNormalizeKey } from '../../_tools_/agent-core/lib.mjs'
import { invalid } from './errors.mjs'

/**
 * The key table: agent core's canonical key names and the macOS virtual key codes (`kVK_*`, ANSI layout) each
 * becomes, for the helper's `CGEvent(keyboardEventSource:virtualKey:keyDown:)`.
 *
 * - **Canonical names are agent core's** (`ENTER`, `CTRL`, `ARROWLEFT`, `F5`, one printable ASCII character with
 *   letters upper case). Normalisation is agent core's own `normalizeKey`, imported from its library face, so the
 *   desktop accepts exactly the names the batch validator accepted; nothing is re-spelled here.
 * - **Modifiers** become key events of their own key code plus the matching `CGEventFlags` bit on every event of the
 *   chord: `CTRL` is Control, `ALT` is Option, `META` is Command. A Mac app reads Command shortcuts from the flags.
 * - **`INSERT`** is the Help key (`kVK_Help`), which is what a PC keyboard's Insert sends on macOS. Macs have no
 *   Insert key; refusing it would break chords a model learned elsewhere for no safety gain.
 * - **A printable character** is its US-ANSI key, with Shift added for a shifted character (`!` is Shift+1). The
 *   layout is assumed US; text that must arrive exactly is the `type` action's job (Unicode, layout-free).
 * - **Copy, cut and paste chords are ordinary chords (D-031, replacing D-025's refusal).** Command or Control with C,
 *   X or V becomes key events like any other chord, so the approved app may write the owner's clipboard. The driver
 *   and the helper never read the pasteboard, and nothing here records what it holds. System-wide chords (P9, such as
 *   screenshot-to-clipboard) are refused by agent core's app policy, not here.
 * - **Unknown is refused.** A name agent core does not know throws `invalid_argument`; nothing is guessed.
 */

/** `CGEventFlags` bits of the four canonical modifiers. */
export const MODIFIER_FLAGS = Object.freeze({
  SHIFT: 0x0002_0000, // maskShift
  CTRL: 0x0004_0000, // maskControl
  ALT: 0x0008_0000, // maskAlternate (Option)
  META: 0x0010_0000, // maskCommand
})

/** Named canonical keys -> `kVK_*` codes. */
export const NAMED_KEY_CODES = Object.freeze({
  ENTER: 0x24, // kVK_Return
  ESCAPE: 0x35,
  TAB: 0x30,
  SPACE: 0x31,
  BACKSPACE: 0x33, // kVK_Delete, the key labelled delete on a Mac
  INSERT: 0x72, // kVK_Help, see above
  DELETE: 0x75, // kVK_ForwardDelete
  HOME: 0x73,
  END: 0x77,
  PAGEUP: 0x74,
  PAGEDOWN: 0x79,
  ARROWUP: 0x7e,
  ARROWDOWN: 0x7d,
  ARROWLEFT: 0x7b,
  ARROWRIGHT: 0x7c,
  CTRL: 0x3b, // kVK_Control
  SHIFT: 0x38, // kVK_Shift
  ALT: 0x3a, // kVK_Option
  META: 0x37, // kVK_Command
  F1: 0x7a, F2: 0x78, F3: 0x63, F4: 0x76, F5: 0x60, F6: 0x61,
  F7: 0x62, F8: 0x64, F9: 0x65, F10: 0x6d, F11: 0x67, F12: 0x6f,
})

/** Unshifted US-ANSI characters -> `kVK_ANSI_*` codes; letters are listed upper case, as agent core spells them. */
const BASE_KEY_CODES = Object.freeze({
  A: 0x00, S: 0x01, D: 0x02, F: 0x03, H: 0x04, G: 0x05, Z: 0x06, X: 0x07, C: 0x08, V: 0x09, B: 0x0b, Q: 0x0c,
  W: 0x0d, E: 0x0e, R: 0x0f, Y: 0x10, T: 0x11, O: 0x1f, U: 0x20, I: 0x22, P: 0x23, L: 0x25, J: 0x26, K: 0x28,
  N: 0x2d, M: 0x2e,
  1: 0x12, 2: 0x13, 3: 0x14, 4: 0x15, 6: 0x16, 5: 0x17, 9: 0x19, 7: 0x1a, 8: 0x1c, 0: 0x1d,
  '=': 0x18, '-': 0x1b, ']': 0x1e, '[': 0x21, "'": 0x27, ';': 0x29, '\\': 0x2a, ',': 0x2b, '/': 0x2c, '.': 0x2f,
  '`': 0x32,
})

/** Shifted characters -> the unshifted character of the same key. */
const SHIFTED = Object.freeze({
  '~': '`', '!': '1', '@': '2', '#': '3', $: '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0',
  _: '-', '+': '=', '{': '[', '}': ']', '|': '\\', ':': ';', '"': "'", '<': ',', '>': '.', '?': '/',
})

/** Key codes back to agent core's canonical names (letters upper case, SHIFT, META, ...), for what the driver reports. */
const NAME_OF_CODE = new Map([...Object.entries(BASE_KEY_CODES), ...Object.entries(NAMED_KEY_CODES)].map(([name, code]) => [code, name]))

/**
 * CU-64: a key code's canonical name - how the driver reports keys it held (heldKeys, heldAtLoss, releasedStale), so
 * agent core and the person's notice name them as the model does; a code this table lacks is `KEYCODE_<n>`.
 */
export function keyName(code) {
  return NAME_OF_CODE.get(code) ?? `KEYCODE_${code}`
}

/** Normalise one key name with agent core's rules, or throw `invalid_argument` naming it. */
export function normalizeKey(name) {
  try {
    return coreNormalizeKey(name)
  } catch (error) {
    if (error instanceof KeyError) throw invalid(error.message)
    throw error
  }
}

export function isModifier(canonical) {
  return MODIFIER_KEYS.includes(canonical)
}

/**
 * The key one canonical name presses: `{ keyCode, shift }`, where `shift` says the character needs Shift held (a
 * shifted character such as `!`). Throws `invalid_argument` for a name outside the table.
 */
export function keyStroke(canonical) {
  if (Object.hasOwn(NAMED_KEY_CODES, canonical)) return { keyCode: NAMED_KEY_CODES[canonical], shift: false }
  if (typeof canonical === 'string' && canonical.length === 1) {
    if (Object.hasOwn(BASE_KEY_CODES, canonical)) return { keyCode: BASE_KEY_CODES[canonical], shift: false }
    if (Object.hasOwn(SHIFTED, canonical)) return { keyCode: BASE_KEY_CODES[SHIFTED[canonical]], shift: true }
  }
  throw invalid(`the key '${String(canonical)}' has no macOS key code; use the type action for this character`)
}

/** The `CGEventFlags` mask of a list of canonical modifiers. */
export function flagsFor(modifiers) {
  return modifiers.reduce((flags, key) => flags | (MODIFIER_FLAGS[key] ?? 0), 0)
}
