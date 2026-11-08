import { BIP39_ENGLISH } from './bip39-english.mjs'
import { normalizeKey } from './keys.mjs'
import { originPattern } from './sites.mjs'

/**
 * The action policy (design: action-policy.md, consent-gate.md). `classify` runs in the dispatcher for every action,
 * inside every batch (R27), and answers `{ decision, class, rule, reason }` with `decision` one of `allow`,
 * `confirm`, `block`, `handoff`; the most restrictive rule wins. Only the caller grants pre-approvals, never the model
 * or the page; `purchase`, `delete` and `permission` always confirm at action time.
 */

export const CLASSES = Object.freeze(['submit', 'purchase', 'delete', 'permission', 'credential', 'sensitive_data', 'new_site', 'page_dialog', 'install', 'file_choice'])
export const NEVER_PRE_APPROVED = Object.freeze(['purchase', 'delete', 'permission', 'file_choice'])

/** Word lists matched on a target's accessible name, case-insensitively, at word boundaries; they err toward confirm. */
const WORDS = Object.freeze({
  purchase: ['buy', 'pay', 'order', 'place order', 'checkout', 'check out', 'subscribe', 'donate', 'purchase', 'transfer', 'withdraw', 'wire', 'send money'],
  // CU-135: replace and overwrite (a save panel's 'already exists' sheet), don't save (a close sheet discards work).
  delete: ['delete', 'remove', 'discard', 'erase', 'empty trash', 'cancel subscription', 'replace', 'overwrite', "don't save", 'don\u2019t save',
    // CU-146 (the CU-145 audit): destructive labels the list missed.
    'move to trash', 'move to bin', 'empty bin', 'clear history', 'clear all', 'reset all', 'reset settings', 'reset to defaults', 'uninstall', 'wipe', 'purge',
    'deactivate', 'close account', 'forget', 'factory reset'],
  permission: ['share', 'invite', 'permission', 'permissions', 'api key', 'grant access', 'make public', 'security', 'revoke'],
  submit: ['send', 'post', 'submit', 'publish', 'reply', 'sign up', 'register'],
})
const PRECEDENCE = ['purchase', 'delete', 'permission', 'page_dialog', 'credential', 'sensitive_data', 'submit', 'new_site', 'install']
const POINTER = new Set(['click', 'double_click', 'triple_click'])
// CU-135 (keyboard-activation.md): a focused button; any control a click activates (Space presses or toggles it); and a
// text input, as the environments name their roles.
const BUTTON_ROLE = /^(ax)?(button|defaultbutton|menubutton|popupbutton)$/i
const CONTROL_ROLE = /^(ax)?(button|defaultbutton|menubutton|popupbutton|checkbox|radiobutton|radio|switch|menuitem|menuitemcheckbox|menuitemradio|link|disclosuretriangle)$/i
// CU-147: a focused collection, where a plain Backspace or Delete removes the selection.
const COLLECTION_ROLE = /^(ax)?(table|outline|list|browser|row|cell|grid|listbox|treegrid|tree|gridcell|option|listitem)$/i
// CU-146: delete words that delete only on a button or menu item - a sidebar row or a link named Trash opens the folder.
const CONTROL_DELETE = ['trash', 'bin']
const TRASH_ROLE = /^(ax)?(button|defaultbutton|menubutton|menuitem)$/i
// CU-142: a multi-line text input, where a Return is text and does not press the default button.
const TEXT_AREA_ROLE = /^(ax)?textarea$/i
// CU-140: a drop zone that deletes - the delete words, and a trash or bin.
const DROP_DELETE = [...WORDS.delete, 'trash', 'bin']
const TEXT_ROLE = /^(ax)?(textfield|textarea|searchfield|combobox|textbox|searchbox)$/i

/**
 * The keys of a keypress or a key hold, canonical ('META', 'SPACE', 'BACKSPACE', 'RETURN' as 'ENTER'), or an empty set
 * for any other action. A hold is judged as the same chord pressed (CU-64 H3): its release presses a focused control.
 */
function keysOf(action) {
  return new Set((action.type === 'keypress' || action.type === 'hold_key') && Array.isArray(action.keys) ? action.keys.map((key) => normalizeKey(String(key))) : [])
}

/**
 * CU-135: a keypress that activates a control is judged like a click on it - Space alone presses or toggles the focused
 * button, checkbox, radio, pop-up, menu item, link or disclosure on a Mac (in a text input it types a space). Command-
 * Backspace or Command-Delete, Option too, deletes - Move to Trash, delete immediately, a dialog's Delete - except in a
 * text input, where it deletes text; Command-D with a button focused presses a focused sheet's Don't Save or Delete.
 */
function keyboardActivation(action, target, context = {}) {
  // A typed space or newline on a focused control (not a text input) presses it as Space or Return would (cu-researcher).
  if (action.type === 'type') return { activates: CONTROL_ROLE.test(String(target?.role ?? '')) && /[ \r\n]/.test(String(action.text ?? '')), deletes: false }
  const keys = keysOf(action)
  if (keys.size === 0) return { activates: false, deletes: false }
  const button = BUTTON_ROLE.test(String(target?.role ?? ''))
  // CU-234 (keyboard-activation.md): a variant is recognised generously - a miss is an under-ask, a recognised no-op only
  // over-asks. Space with any of Shift, Option or Control presses a focused control (an app that handles Space itself,
  // as CU Fixture's buttons do, presses on them); Command-Space is the system's.
  const onlyWith = (main, allowed) => [...keys].every((key) => key === main || allowed.includes(key))
  const activates = keys.has('SPACE') && onlyWith('SPACE', ['SHIFT', 'ALT', 'CTRL']) && CONTROL_ROLE.test(String(target?.role ?? ''))
  // CU-143 (live, 0.2.34): AppKit sends a key equivalent to the menu before the field editor, so even a plain
  // Command-Backspace in a focused text field fires the app's menu item bound to it (Finder's Move to Trash, Mail's
  // Delete) - Command-Backspace and Command-Delete, with any modifiers, are judged delete on every target.
  // CU-148: with a sheet or alert up, Command-D and Command-Delete press its Don't Save whatever holds the focus - with
  // keyboard navigation off (a default Mac) the focus is the sheet or its window, never the button. The helper reports
  // it (sheet); a Command-D right after Command-W or Command-Q in the batch is aimed at the sheet that close raises.
  const sheetUp = target?.sheet === true || context.afterClose === true
  // CU-234: Command-D with Shift, Option or Control too presses the sheet's Don't Save.
  const deletes = keys.has('META') && ((keys.has('BACKSPACE') || keys.has('DELETE')) || (keys.has('D') && onlyWith('D', ['META', 'SHIFT', 'ALT', 'CTRL']) && (button || sheetUp)))
  // CU-147: exactly Backspace or Delete on a focused collection - a list, table, outline, row or cell, not a text input
  // (a cell being edited is a text field) - removes the selection: Mail moves messages to the Trash with no dialog.
  // CU-234: with Shift, Option or Control too (Shift-Backspace is deleteBackward: in the standard key bindings); with
  // Command it is CU-143's delete above.
  const deleteKey = keys.has('BACKSPACE') ? 'BACKSPACE' : keys.has('DELETE') ? 'DELETE' : null
  const removesSelection = deleteKey !== null && onlyWith(deleteKey, ['SHIFT', 'ALT', 'CTRL']) && COLLECTION_ROLE.test(String(target?.role ?? '')) && !TEXT_ROLE.test(String(target?.role ?? ''))
  return { activates, deletes: deletes || removesSelection }
}
const SECRET = /\{\{secret:[a-z0-9_-]+\}\}/i

/**
 * A reference to an existing order ('Order #4344', 'Order 4344' with three or more digits, 'Order details') names a record;
 * it is dropped before the purchase words are matched, so the verb ('Order', 'Order now', 'Place order') still confirms
 * and any other purchase word in the same name still counts (CU-8: a double-click on a list cell 'Order #4344').
 */
const ORDER_REFERENCE = /(^|[^a-z])order\s*(?:#|no\.|number\b|id\b)\s*#?[\w-]*\d[\w-]*|(^|[^a-z])order\s+\d{3,}[\w-]*|(^|[^a-z])order\s+(?:details|history|status|summary|tracking|lookup)([^a-z]|$)/gi

function withoutOrderReferences(name) {
  return String(name ?? '').replace(ORDER_REFERENCE, ' ')
}

/**
 * Typed text minus the values the person wrote in the task itself: an address or number the task names is what the
 * person asked to have typed, not data the agent leaks (CU-8 send-message: typing the task's own address asked
 * sensitive_data). Tokens are compared case-insensitively with punctuation trimmed at their ends; anything left that
 * still looks sensitive - a value the task does not name - still asks.
 */
const TOKEN_EDGES = /^[^\w+@]+|[^\w]+$/g
function withoutTaskValues(text, task) {
  const given = new Set(String(task ?? '').toLowerCase().split(/\s+/).map((t) => t.replace(TOKEN_EDGES, '')).filter(Boolean))
  if (given.size === 0) return String(text ?? '')
  return String(text ?? '').split(/(\s+)/).map((t) => (given.has(t.toLowerCase().replace(TOKEN_EDGES, '')) ? ' ' : t)).join('')
}

// CU-178: a name and a list entry are compared normalised - lower case, a curly apostrophe straight, licence spelled
// license, '#' read as 'number', dots dropped (D.O.B., Exp. date, Tax no.) - so one canonical list covers the spellings.
// An entry then matches whole, its regex specials literally, a space in it as any run of spaces or hyphens (Sort-code).
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const normaliseName = (text) => String(text ?? '').toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/licence/g, 'license')
  .replace(/#/g, ' number ').replace(/\./g, '').replace(/\s+/g, ' ').trim()
function namesWord(name, words) {
  const text = normaliseName(name)
  return words.some((word) => new RegExp(`(^|[^a-z])${escapeRegExp(normaliseName(word)).replace(/ /g, '[\\s-]+')}([^a-z]|$)`).test(text))
}

// CU-157 (reply-text-entered.md): a control whose only submit word is 'reply' submits typed text only when some text
// entry on its page or window holds text. The environment reports that as target.textEntered, read at each action's
// own judgement; only a strict false - every entry read and empty - lets it run. True, null or absent asks, as before.
const SUBMIT_BUT_REPLY = Object.freeze(WORDS.submit.filter((word) => word !== 'reply'))
function judgesSubmit(name, target) {
  if (!namesWord(name, WORDS.submit)) return false
  return !(target?.textEntered === false && !namesWord(name, SUBMIT_BUT_REPLY))
}

function luhn(digits) {
  let sum = 0
  for (let i = 0; i < digits.length; i += 1) {
    let d = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return sum % 10 === 0
}

// CU-163: an IBAN counts only with a registered country code, that country's exact length (ISO 13616 registry) and a
// passing mod-97 check - so a random token (a temp folder's name, a hash) does not match, and an IBAN followed by a word
// is still found at its known length.
const IBAN_LENGTH = Object.freeze({ AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BR: 29, BY: 28,
  CH: 21, CR: 22, CY: 28, CZ: 24, DE: 22, DK: 18, DO: 28, EE: 20, EG: 29, ES: 24, FI: 18, FO: 18, FR: 27, GB: 22, GE: 22,
  GI: 23, GL: 18, GR: 27, GT: 28, HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26, IT: 27, JO: 30, KW: 30, KZ: 20, LB: 28,
  LC: 32, LI: 21, LT: 20, LU: 20, LV: 21, LY: 25, MC: 27, MD: 24, ME: 22, MK: 19, MR: 27, MT: 31, MU: 30, NL: 18, NO: 15,
  PK: 24, PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22, SA: 24, SC: 31, SD: 18, SE: 24, SI: 19, SK: 24, SM: 27, ST: 25,
  SV: 28, TL: 23, TN: 24, TR: 26, UA: 29, VA: 22, VG: 24, XK: 20 })
function ibanValid(candidate) {
  const iban = candidate.replace(/\s+/g, '').toUpperCase()
  if (IBAN_LENGTH[iban.slice(0, 2)] !== iban.length || !/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return false
  const digits = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55))
  let rest = 0
  for (const d of digits) rest = (rest * 10 + Number(d)) % 97
  return rest === 1
}

// CU-163: a US routing number (ABA: weights 3-7-1 sum to a multiple of 10) counts only beside an account number - a bare
// nine-digit number passes the check one time in ten, too often alone.
function abaValid(digits) {
  const w = [3, 7, 1, 3, 7, 1, 3, 7, 1]
  return digits.length === 9 && [...digits].reduce((sum, d, i) => sum + Number(d) * w[i], 0) % 10 === 0
}

// CU-172 (cu-researcher measured 0 of 474 typed actions): an Indian Aadhaar number passes Verhoeff, an Australian TFN
// the weights 1-4-3-7-5-8-6-9-10 mod 11 - random digits pass about one time in ten, so each counts only in its
// canonical spacing (dddd dddd dddd with a first digit 2-9; ddd ddd ddd) and never as part of a longer run of groups.
const VERHOEFF_D = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]]
const VERHOEFF_P = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 7, 8, 0, 6], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]]
const verhoeffValid = (digits) => [...digits].reverse().reduce((c, d, i) => VERHOEFF_D[c][VERHOEFF_P[i % 8][Number(d)]], 0) === 0
const tfnValid = (digits) => [1, 4, 3, 7, 5, 8, 6, 9, 10].reduce((sum, w, i) => sum + w * Number(digits[i]), 0) % 11 === 0

// CU-163: a field for a bank account or a tax id asks whatever is typed into it, as a payment form's most consequential
// value is the account a payout or a direct debit goes to.
const BANK_OR_TAX_FIELD = Object.freeze(['iban', 'account number', 'account no', 'routing', 'routing number', 'sort code', 'tax id', 'tax number', 'tax file number', 'ein',
  // CU-178: spellings and abbreviations of the same fields.
  'acct number', 'acct no', 'bsb', 'tax identification', 'tax no',
  // CU-245 (cu-researcher's D-061 red team): a field named only 'Bank account'.
  'bank account'])
function bankOrTaxField(target) {
  return namesWord(target?.name, BANK_OR_TAX_FIELD)
}

// CU-164: a text entry - the browser's editable flag, or a desktop text role - named for a password asks credential, and
// one named for a recovery phrase, a private key, a one-time code or an identity document asks sensitive_data, whatever
// is typed. A show-password toggle turns type=password into type=text, so the name is the only signal left.
const TEXT_ENTRY_ROLES = new Set(['AXTextField', 'AXSecureTextField', 'AXTextArea', 'AXSearchField', 'AXComboBox', 'textbox', 'searchbox', 'combobox'])
// CU-187 (copy-caption.md): a source named by its own words - static text, a generic element, a cell - whose name is the
// value itself; it takes no class from that name, and the loop does not keep it (D-060).
const TEXT_NAMED_ROLES = new Set(['StaticText', 'text', 'generic', 'none', 'cell', 'gridcell', 'paragraph', 'AXStaticText', 'AXCell'])
// Controls a caption may label that are not shown text: a drag pressed on one does not carry its caption (CU-195).
const INTERACTIVE_ROLES = new Set(['button', 'link', 'checkbox', 'radio', 'switch', 'slider', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
  'treeitem', 'option', 'combobox', 'listbox',
  'spinbutton', 'ToggleButton', 'PopUpButton', 'DisclosureTriangle', 'AXButton', 'AXLink', 'AXCheckBox', 'AXRadioButton', 'AXPopUpButton', 'AXMenuButton', 'AXMenuItem', 'AXSlider', 'AXTab', 'AXDisclosureTriangle', 'AXIncrementor', 'AXColorWell'])
// CU-195 reopen (cu-verifier, 20261108T004357Z-30bbf7): an element the driver captioned that is neither an entry nor a
// control is captioned shown text, whatever role the page gives it - a <dd> is Chrome's 'definition', a <dt> 'term', an
// <li> 'listitem', none of them in the list above - so no text role can skip the caption rule by being unlisted.
const captionedShownText = (t) => !!t && typeof t === 'object' && typeof t.caption === 'string' && t.caption.trim() !== '' &&
  !isTextEntry(t) && !INTERACTIVE_ROLES.has(t.role)
export function textNamedSource(target) {
  if (!target || typeof target !== 'object') return false
  if (TEXT_NAMED_ROLES.has(target.role)) return true
  return !target.role && typeof target.tag === 'string' && !['input', 'textarea', 'select'].includes(target.tag.toLowerCase())
}

export function isTextEntry(target) {
  if (!target || target.editable === false) return false
  return target.editable === true || TEXT_ENTRY_ROLES.has(target.role)
}
const PASSWORD_NAMES = Object.freeze(['password', 'passcode', 'passphrase', 'pin', 'pin code'])
// CU-167 (cu-researcher's probe): a social security number, a card's CVV, a bare Passport field, a driving licence, a
// birthday and a security question too - typed unasked before; the apostrophe in either form (' and ’).
const SECRET_NAMES = Object.freeze(['recovery phrase', 'seed phrase', 'secret phrase', 'mnemonic', 'private key', 'secret key',
  'one-time code', 'one time code', 'verification code', 'security code', 'passport', 'national insurance',
  'ni number', 'date of birth', 'birth date', 'dob', 'birthday', 'ssn', 'social security', 'social insurance', 'national id', 'cvv', 'cvv2', 'cvc', 'csc',
  "driver's license", 'drivers license', 'driver license', 'driving license',
  "mother's maiden name", 'maiden name', 'security question', 'security answer',
  // CU-172 (the D-061 table, sensitive-classes.md): the rest of government ids, payment, auth secrets and health.
  'national identity', 'aadhaar', 'card number', 'credit card', 'expiry', 'expiration date', 'mm/yy', 'vat number', 'vat id',
  '2fa', 'authenticator code', 'api key', 'access token', 'secret', 'medicare', 'health insurance', 'policy number',
  'medical record',
  // D-062 (cu-coordinator): an e-mail or phone field, and a street-level address, ask by name; a city, postcode or ZIP
  // alone does not, and neither does an IP or web address.
  'email', 'e-mail', 'phone', 'mobile number', 'telephone', 'street', 'address line', 'home address', 'shipping address',
  'billing address', 'mailing address', 'postal address',
  // CU-178 (both sweeps; scope by the table owner): further labels of decided classes - spellings are left to normaliseName.
  'dl number', 'license number', 'birthdate', 'birth day', 'exp date', 'expiration', 'valid thru', 'valid through', 'otp',
  'card no', 'cell number', 'mobile', 'tel',
  // CU-245 (cu-researcher's D-061 red team): a debit card, an account recovery key and two-factor backup codes.
  'debit card', 'recovery key', 'backup code', 'backup codes'])
// CU-172: acronyms match case-sensitively as whole tokens, so 'PAN' asks and 'Pan size' or 'Panel' does not.
const SECRET_ACRONYMS = Object.freeze(['SIN', 'TFN', 'PAN', 'NHS', 'MRN', 'TIN', 'CPF', 'NRIC'])
const namesAcronym = (name) => SECRET_ACRONYMS.some((word) => new RegExp(`(^|[^A-Za-z])${word}([^A-Za-z]|$)`).test(String(name ?? '')))

// CU-170 (text-entry-focus-click.md): a pointer press on a plain text entry only places the cursor, so the entry's own
// name gives it no purchase, delete or permission class. Plain: a desktop AX text role not reported read-only, or in a
// browser an editable <input>/<textarea> or textbox/searchbox (editable alone is inherited inside a rich editor). A
// combobox, list or pop-up is never plain - a choice there can grant access.
const DESKTOP_ENTRY_ROLES = new Set(['AXTextField', 'AXSecureTextField', 'AXTextArea', 'AXSearchField'])
const CHOOSER_ROLE = /^(ax)?(combobox|popupbutton|listbox|menubutton)$/i
function plainTextEntry(target) {
  if (!target || target.editable === false || CHOOSER_ROLE.test(String(target.role ?? ''))) return false
  if (DESKTOP_ENTRY_ROLES.has(target.role)) return true
  return target.editable === true && (['input', 'textarea'].includes(String(target.tag ?? '').toLowerCase()) || ['textbox', 'searchbox'].includes(target.role))
}

const passwordNamedEntry = (target) => isTextEntry(target) && namesWord(target.name, PASSWORD_NAMES)
// CU-184 (desktop-rules.md): a text entry named for a password - shown or not, it holds one - unless its name says it is
// a hint; the desktop hands a key action into it to the person, as it does a secure field (R83).
export const namesPasswordField = (target) => passwordNamedEntry(target) && !namesWord(target.name, ['hint'])
const secretNamedEntry = (target) => isTextEntry(target) && (namesWord(target.name, SECRET_NAMES) || namesAcronym(target.name))

// CU-164: a wallet recovery phrase - twelve or more words in a row, every one on the BIP39 list; ordinary prose breaks
// the run with words the list does not hold (the, is, to, of, a).
function hasSeedPhrase(value) {
  let run = 0
  for (const token of String(value).toLowerCase().match(/[a-z]+/g) ?? []) {
    run = BIP39_ENGLISH.has(token) ? run + 1 : 0
    if (run >= 12) return true
  }
  return false
}

// CU-185: a national number without a country code - a leading 0, digit groups joined by one space, dot or dash, 10 or
// 11 digits in all (020 7946 0958, (020) 7946 0958, 07700 900123, 01 23 45 67 89, 030 1234567). Grouped only: an
// unbroken run (07700900123), a date - also with a time after it (07.11.2026 10:30, cu-researcher's red team) - a version
// or a time does not match; a grouped reference (01-2345-6789) asks, an accepted over-ask. The 00 international prefix is
// not covered here.
const DATE_LEAD = /^(\d{2})([ .-])(\d{2})\2((?:19|20)\d{2})(?!\d)/
const datedLead = (text) => {
  const d = DATE_LEAD.exec(text)
  return d !== null && Number(d[1]) >= 1 && Number(d[1]) <= 31 && Number(d[3]) >= 1 && Number(d[3]) <= 12
}
function nationalPhone(value) {
  for (const m of value.matchAll(/(^|[^\d+(])((?:0\d{1,4}|\(0\d{1,4}\))(?:[ .-]\d{2,8}){1,4})(?!\d)/g)) {
    const digits = m[2].replace(/\D/g, '').length
    if ((digits === 10 || digits === 11) && !datedLead(m[2])) return true
  }
  return false
}

/** Whether text looks like sensitive data being transmitted (R29): card, IBAN, routing + account, national id, tax id, phone, e-mail, key, recovery phrase. */
export function looksSensitive(text) {
  const value = String(text ?? '')
  for (const match of value.matchAll(/(?:\d[ -]?){13,19}/g)) {
    const digits = match[0].replace(/\D/g, '')
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) return 'card'
  }
  // The match is greedy (an IBAN followed by a word runs on into it), so it is cut at its country's length.
  for (const match of value.matchAll(/\b[A-Za-z]{2}\d{2}(?:\s?[A-Za-z0-9]){11,30}\b/g)) {
    const compact = match[0].replace(/\s+/g, '')
    const length = IBAN_LENGTH[compact.slice(0, 2).toUpperCase()]
    if (length !== undefined && compact.length >= length && ibanValid(compact.slice(0, length))) return 'iban'
  }
  for (const match of value.matchAll(/(?:^|[^\d])(\d{9})\s*(?:[/,:;|-]|\s)\s*(?:acct\.?|account)?\s*#?\s*(\d{4,17})(?=[^\d]|$)/gi)) {
    if (abaValid(match[1])) return 'bank_account'
  }
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(value)) return 'national_id'
  // CU-245: an SSN in spaced 3-2-4 groups, held to the issuing rules (no area 000 or 666, no group 00, no serial 0000)
  // so most spaced references do not fit; an area 9xx is an ITIN only with its group in 50-65, 70-88, 90-92 or 94-99
  // (cu-researcher: the dashed form asks for both). Named over-ask: a spaced nine-digit reference that fits.
  const itinGroup = (g) => (g >= 50 && g <= 65) || (g >= 70 && g <= 88) || (g >= 90 && g <= 92) || (g >= 94 && g <= 99)
  for (const m of value.matchAll(/(?<!\d)(?<!\d[ -])(\d{3}) (\d{2}) (\d{4})(?![ -]?\d)/g)) {
    const areaOk = m[1][0] === '9' ? itinGroup(Number(m[2])) : m[1] !== '000' && m[1] !== '666'
    if (areaOk && m[2] !== '00' && m[3] !== '0000') return 'national_id'
  }
  // CU-172: a UK National Insurance number (HMRC's letter rules, not BG/GB/KN/NK/NT/TN/ZZ, a final A-D) and an Indian PAN
  // (five letters, the fourth a holder type, four digits, a letter) - upper case, as issued.
  for (const m of value.matchAll(/\b([A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z]) ?\d{2} ?\d{2} ?\d{2} ?[A-D]\b/g)) {
    if (!['BG', 'GB', 'KN', 'NK', 'NT', 'TN', 'ZZ'].includes(m[1])) return 'national_id'
  }
  if (/\b[A-Z]{3}[ABCFGHLJPT][A-Z]\d{4}[A-Z]\b/.test(value)) return 'national_id'
  for (const m of value.matchAll(/(?<!\d)(?<!\d[ -])([2-9]\d{3}) (\d{4}) (\d{4})(?![ -]?\d)/g)) {
    if (verhoeffValid(m[1] + m[2] + m[3])) return 'national_id'
  }
  for (const m of value.matchAll(/(?<!\d)(?<!\d[ -])(\d{3}) (\d{3}) (\d{3})(?![ -]?\d)/g)) {
    if (tfnValid(m[1] + m[2] + m[3])) return 'tax_id'
  }
  if (/(^|[^\d-])\d{2}-\d{7}([^\d-]|$)/.test(value)) return 'tax_id'
  if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(value)) return 'email'
  if (/\+\d(?:[\s().-]{0,2}\d){8,}/.test(value) || /(^|[^\d])\(?\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}([^\d]|$)/.test(value)) return 'phone'
  if (nationalPhone(value)) return 'phone'
  if (/\b(?:sk|pk|ghp|xox[bp]|AKIA)[-_A-Za-z0-9]{16,}\b/.test(value) || /\b[A-Fa-f0-9]{40,}\b/.test(value)) return 'key'
  // CU-164: a 0x-prefixed 64-hex private key (the word boundary after 'x' kept the rule above from seeing it); a 0x + 40
  // hex wallet address is public and stays allowed.
  if (/\b0x[0-9a-fA-F]{64}\b/.test(value)) return 'key'
  // CU-245: a PEM or PGP armour block naming a private key (RSA, EC, OPENSSH, ENCRYPTED, bare, or PGP's '... BLOCK'),
  // and a JWT - three dot-joined base64url parts whose first decodes to a JSON header naming its 'alg'; an unsigned
  // one (alg none) has an empty third part and still carries the session's claims (cu-verifier).
  if (/-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/.test(value)) return 'key'
  for (const m of value.matchAll(/(?<![A-Za-z0-9_-])(eyJ[A-Za-z0-9_-]{5,})\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g)) {
    try {
      const header = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'))
      if (header && typeof header === 'object' && typeof header.alg === 'string') return 'key'
    } catch { /* not a JSON header */ }
  }
  if (hasSeedPhrase(value)) return 'recovery_phrase'
  return null
}

// CU-186: menu roles as the desktop driver reports them (a pop-up's own AXMenuButton is not a menu).
const MENU_ROLE = /^AXMenu(Item|BarItem|Bar)?$/

// CU-183: a drag travels when its path has two or more points and its ends differ.
function travels(action) {
  const path = Array.isArray(action?.path) ? action.path : []
  if (path.length < 2) return false
  const [first, last] = [path[0], path[path.length - 1]]
  return first?.x !== last?.x || first?.y !== last?.y
}

// CU-183: the drop lands back in the entry it was pressed on - the same fingerprint, or with none the same role and a
// non-empty name.
function sameEntry(pressed, dropped) {
  if (!pressed || !dropped) return false
  if (pressed.fingerprint && dropped.fingerprint) return pressed.fingerprint === dropped.fingerprint
  const name = String(pressed.name ?? '')
  return name !== '' && String(dropped.name ?? '') === name && String(dropped.role ?? '') === String(pressed.role ?? '')
}

// CU-179: the class of text put into a target, typed or pasted - by the field (a credential field, a password-named entry;
// a bank, tax, secret or identity name) and, when the text is known, by the value. null text: names only.
function insertedClass(text, target, context) {
  if (credentialField(target) || passwordNamedEntry(target) || (text !== null && SECRET.test(text))) return 'credential'
  if (bankOrTaxField(target) || secretNamedEntry(target) || (text !== null && looksSensitive(withoutTaskValues(text, context.task)))) return 'sensitive_data'
  return null
}

// CU-187: the class a copy's source lends its paste - the stronger of its own name (none for a text-named source; a form
// control's label counts, editable or not) and its caption, both through the entry name rules.
const asNamedEntry = (name) => ({ role: 'textbox', editable: true, name })
function sourceClass(source, context) {
  if (!source || typeof source !== 'object') return null
  // CU-196: a copy whose source could not be read (a menu copy with a menu, role-less or unreadable focus) fails closed.
  if (source.unknown === true) return 'sensitive_data'
  const own = textNamedSource(source) ? { ...source, name: '' } : (TEXT_ENTRY_ROLES.has(source.role) ? { ...source, editable: true } : source)
  const caption = typeof source.caption === 'string' && source.caption.trim() !== '' ? insertedClass(null, asNamedEntry(source.caption), context) : null
  const mine = insertedClass(null, own, context)
  return mine === 'credential' || caption === 'credential' ? 'credential' : mine ?? caption
}

// CU-194 (password-memory.md rule 5): an unnamed entry takes its structural caption as its name for every name rule -
// read only when its own accessible name is empty; a named entry's caption is ignored.
const captionNamed = (target) => (isTextEntry(target) && !String(target.name ?? '').trim() && typeof target.caption === 'string' && target.caption.trim()
  ? { ...target, name: target.caption.trim() } : target)
function withCaptionNames(context) {
  const target = captionNamed(context.target)
  const dropTarget = captionNamed(context.dropTarget)
  if (target === context.target && dropTarget === context.dropTarget) return context
  return { ...context, ...(context.target !== undefined ? { target } : {}), ...(context.dropTarget !== undefined ? { dropTarget } : {}) }
}

function credentialField(target) {
  if (!target) return false
  // CU-194 (password-memory.md): an entry the run saw as a password field stays one when shown in plain text.
  if (target.seenAsPassword === true) return true
  const auto = String(target.autocomplete ?? '').toLowerCase()
  return target.isPassword === true || target.inputType === 'password' || auto === 'one-time-code' ||
    auto.startsWith('cc-') || auto === 'current-password' || auto === 'new-password'
}

/**
 * Create the policy. `sitePolicy` is the run's site filter; `preApprovals` are `[{ class, origin }]` from the caller,
 * with `origin` an origin pattern such as `http://127.0.0.1:43117` (default: any origin the site filter allows).
 */
export function createPolicy({ sitePolicy, preApprovals = [] } = {}) {
  if (typeof sitePolicy !== 'function') throw new TypeError('the policy needs the run site policy')
  const granted = preApprovals
    .filter((p) => CLASSES.includes(p?.class) && !NEVER_PRE_APPROVED.includes(p.class))
    .map((p) => ({ class: p.class, origin: p.origin ? originPattern(p.origin) : null }))

  const preApproved = (cls, url) => granted.some((p) => p.class === cls && (p.origin === null || p.origin === originPattern(url)))

  /**
   * `context`: `{ url, target, dialog, task }`, where `target` is `inspectPoint` for pointer actions or
   * `focusedElement()` for `type` and `keypress`, and `dialog` the held dialog from `state()`.
   */
  function classify(action, context = {}) {
    context = withCaptionNames(context)
    const url = context.url ?? ''
    const verdict = sitePolicy(url)
    if (verdict !== 'allow' && verdict.block !== 'not_allowed') {
      return { decision: 'block', class: null, rule: `site:${verdict.block}`, reason: `the page ${url} is refused by the site filter (${verdict.block})` }
    }
    if (action.type === 'navigate') {
      const next = sitePolicy(action.url)
      if (next === 'allow') return { decision: 'allow', class: null, rule: 'site:allowed', reason: '' }
      if (next.block === 'not_allowed') {
        if (preApproved('new_site', action.url)) return { decision: 'allow', class: 'new_site', rule: 'pre_approved', reason: '' }
        return { decision: 'confirm', class: 'new_site', rule: 'site:not_allowed', reason: `open ${originPattern(action.url)}, a site the task did not name` }
      }
      return { decision: 'block', class: null, rule: `site:${next.block}`, reason: `${action.url} is refused by the site filter (${next.block})` }
    }
    if (url.startsWith('chrome-error:') || context.interstitial === true) {
      return { decision: 'handoff', class: null, rule: 'interstitial', reason: 'a browser safety warning needs the person' }
    }

    const target = context.target ?? null
    const name = target?.name ?? ''
    const classes = []
    const held = context.dialog && ['confirm', 'prompt', 'beforeunload'].includes(context.dialog.type)
    // Canonical keys (cu-researcher): 'RETURN', 'Return', 'enter' are ENTER too, whoever the caller is; a hold of it too.
    // CU-142: a typed newline presses the same Return as ENTER, so it is judged as ENTER on the focused element - in a
    // text input too ('hi\n' into a 'Send a message' field asks submit, as ENTER there does).
    const pressesEnter = keysOf(action).has('ENTER') || (action.type === 'type' && /[\r\n]/.test(String(action.text ?? '')))
    if (held && (pressesEnter || action.type === 'type')) {
      classes.push('page_dialog')
      for (const cls of ['purchase', 'delete', 'permission']) if (namesWord(context.dialog.message, WORDS[cls])) classes.push(cls)
    }
    const keyboard = keyboardActivation(action, target, context)
    if (keyboard.deletes) classes.push('delete')
    // CU-140 (press-and-drop.md): a drag pressed on a control - a long press, or any drag starting there - is judged like
    // a click on it; a file, row, cell or image at the press point is not judged by its name (dragging it moves it).
    const pressesTarget = POINTER.has(action.type) || (action.type === 'drag' && CONTROL_ROLE.test(String(target?.role ?? '')))
    // ... and the drop point of a drag that travels: a drop onto a Trash, Delete or Remove zone deletes.
    if (action.type === 'drag' && context.dropTarget && namesWord(String(context.dropTarget.name ?? ''), DROP_DELETE)) classes.push('delete')
    if (pressesTarget || pressesEnter || keyboard.activates) {
      if (POINTER.has(action.type) && /change\s+password|update\s+password/i.test(name)) {
        return { decision: 'handoff', class: null, rule: 'password_change', reason: 'the final step of a password change is the person\'s' }
      }
      const focusesEntry = POINTER.has(action.type) && plainTextEntry(target)
      for (const cls of ['purchase', 'delete', 'permission']) {
        if (focusesEntry) break
        if (namesWord(cls === 'purchase' ? withoutOrderReferences(name) : name, WORDS[cls])) classes.push(cls)
      }
      if (judgesSubmit(name, target)) classes.push('submit')
      // CU-146: 'Trash' or 'Bin' alone deletes on a control (a toolbar button, a menu item); a sidebar row of that name
      // only opens the folder.
      if (TRASH_ROLE.test(String(target?.role ?? '')) && namesWord(name, CONTROL_DELETE)) classes.push('delete')
    }
    // CU-232 (menu-key.md): a desktop chord that is a menu item's key equivalent fires that item, so the item's name is
    // judged as a click on it would be, beside the keys - Shift-Command-D bound to Send asks submit. Every matching item
    // counts (one or a list); a menu bar the loop could not read is app-policy's to ask.
    const bound = context.boundMenuItem
    const boundNames = bound && typeof bound === 'object' ? (Array.isArray(bound.items) ? bound.items : [bound]).map((one) => one?.name).filter((n) => typeof n === 'string' && n.trim() !== '') : []
    for (const boundName of boundNames) {
      for (const cls of ['purchase', 'delete', 'permission']) {
        if (namesWord(cls === 'purchase' ? withoutOrderReferences(boundName) : boundName, WORDS[cls])) classes.push(cls)
      }
      // A bound Reply follows CU-157 on the focused window's entries, as the focused target reports them.
      if (judgesSubmit(boundName, target)) classes.push('submit')
      if (namesWord(boundName, CONTROL_DELETE)) classes.push('delete')
    }
    // CU-142 (keyboard-activation.md): a Return presses the window's default button, so its name - where the environment
    // reports it - is judged as a second name, from a single-line input or non-text focus; in a text area a Return is
    // text (the area's own name still applies above) and only Command-Return presses the default button.
    const defaultName = typeof target?.defaultButton?.name === 'string' ? target.defaultButton.name : ''
    const inTextArea = TEXT_AREA_ROLE.test(String(target?.role ?? ''))
    const commandReturn = keysOf(action).has('META') && keysOf(action).has('ENTER')
    if (defaultName !== '' && pressesEnter && (!inTextArea || commandReturn)) {
      for (const cls of ['purchase', 'delete', 'permission']) {
        if (namesWord(cls === 'purchase' ? withoutOrderReferences(defaultName) : defaultName, WORDS[cls])) classes.push(cls)
      }
      if (judgesSubmit(defaultName, target)) classes.push('submit')
    }
    // CU-190 (keyboard-activation.md): a default button the helper could not read may well be there, so the Return asks
    // submit - focused or not; only a read with none (true) keeps the rule above. D-069: on the desktop (url app:...) no
    // read state at all asks too - the helper link refuses a helper too old to send it, so absence is never a pass. No
    // target at all is the driver's good read of nothing focused and no default button (cu-verifier): it keeps the rule.
    // CU-243: app-policy calls this with url 'desktop://' on every real desktop run; 'app:' is the tests' and the matrix's.
    const desktopUrl = /^(app|desktop):/.test(String(context.url ?? ''))
    const unreadDefault = target?.defaultButtonRead === false || (desktopUrl && target != null && target.defaultButtonRead !== true)
    if (unreadDefault && defaultName === '' && pressesEnter && (!inTextArea || commandReturn)) classes.push('submit')
    // CU-241 (keyboard-activation.md): on a web page, Command- or Control-Enter in a multi-line editable - a textarea or a
    // contenteditable - is the web's universal send (webmail, chat, comment boxes), and the page reports no default button
    // to judge, so it asks submit. Named over-ask: code editors. The desktop keeps its default-button reading (CU-142).
    const webTag = /^(app|desktop):/.test(String(context.url ?? '')) ? '' : String(target?.tag ?? '').toLowerCase()
    const multiLineWeb = target?.editable === true && webTag !== '' && webTag !== 'input'
    if (multiLineWeb && keysOf(action).has('ENTER') && (keysOf(action).has('META') || keysOf(action).has('CTRL'))) classes.push('submit')
    // CU-153: reloading, or stepping back or forward, onto a page that was the direct answer to a form POST sends it again.
    if (typeof context.resubmits === 'string') classes.push('submit')
    // CU-151 (paste-consent.md): a paste inserts text no check saw - the owner's pasteboard on the desktop (unread), the
    // run's own clipboard text in a browser. CU-179: typed and pasted text go through the same name and value rules
    // (insertedClass), so a paste into a field named IBAN, Password or Passport asks as typing there does - also a desktop
    // paste of the run's own copy, whose text the run does not read (the name rules need none).
    if (context.paste?.fromOwner === true) classes.push('sensitive_data')
    if (context.paste) {
      // CU-186: a menu paste is judged at the field it lands in; one that could not be read, or a menu, is unknown and asks.
      // Only a menu paste carries a destination; a keystroke paste is judged at its target as before (a null target there
      // is not 'unknown' - cu-verifier's desktop-consent S4b caught that over-ask).
      const viaMenu = Object.prototype.hasOwnProperty.call(context.paste, 'destination')
      const into = viaMenu ? context.paste.destination : target
      // The driver's no-focus placeholder (role and name null) is no field either (cu-developer-two).
      if (viaMenu && (into === null || !into?.role || MENU_ROLE.test(String(into.role)))) classes.push('sensitive_data')
      else {
        const inserted = insertedClass(typeof context.paste.text === 'string' && context.paste.text !== '' ? context.paste.text : null, into, context)
        if (inserted) classes.push(inserted)
      }
      // CU-183 (copy-source.md): the field the run copied from - one descriptor, or several when the desktop has no
      // count to prove which copy wrote - lends its name class to the paste, whatever the destination is named.
      for (const source of [].concat(context.paste.source ?? [])) {
        const carried = sourceClass(source, context)
        if (carried) classes.push(carried)
      }
    }
    // CU-183: a drag pressed on a text entry carries that entry's class to any drop off it (an entry, a contenteditable,
    // a drop zone, a canvas can each take the text); only a drop back inside the same entry - reordering - is exempt.
    // A press that does not travel (a composed mouse_down/up at one point) moves no text, so it carries nothing.
    if (action.type === 'drag' && travels(action) && isTextEntry(target) && !sameEntry(target, context.dropTarget)) {
      const carried = insertedClass(null, target, context)
      if (carried) classes.push(carried)
    }
    // CU-195 (copy-caption rule 4): a travelling drag pressed on shown text named by its own words carries its caption's
    // class to a drop that can take text - a text entry or an editable area. Anywhere else a drag over shown text selects
    // it rather than moving it, so it carries nothing (the over-ask guard).
    if (action.type === 'drag' && travels(action) && (textNamedSource(target) || captionedShownText(target)) && isTextEntry(context.dropTarget)) {
      const carried = sourceClass(target, context)
      if (carried) classes.push(carried)
    }
    // CU-198 (drag-text.md): a drag that moves text and drops on a text entry or an editable area is judged as a paste
    // there - the dragged text's value rules and the drop target's name rules. Text moves when the browser read some (or
    // could not read: unknown asks), or - with no read, the desktop - when the press is on a text entry or shown text.
    // Any other drag (a slider, a window) adds nothing here; a drop back inside the pressed entry is a reorder.
    const read = context.dragText
    const movesText = read === undefined ? (isTextEntry(target) || textNamedSource(target)) : (typeof read === 'string' || read?.unknown === true)
    if (action.type === 'drag' && travels(action) && movesText && isTextEntry(context.dropTarget) && !sameEntry(target, context.dropTarget)) {
      if (read?.unknown === true) classes.push('sensitive_data')
      const inserted = insertedClass(typeof read === 'string' ? read : null, context.dropTarget, context)
      if (inserted) classes.push(inserted)
    }
    if (action.type === 'type') {
      const inserted = insertedClass(String(action.text ?? ''), target, context)
      if (inserted) classes.push(inserted)
    }
    const unique = [...new Set(classes)].sort((a, b) => PRECEDENCE.indexOf(a) - PRECEDENCE.indexOf(b))
    const needed = unique.filter((cls) => !preApproved(cls, url) || NEVER_PRE_APPROVED.includes(cls))
    if (needed.length === 0) {
      return { decision: 'allow', class: unique[0] ?? null, rule: unique.length > 0 ? 'pre_approved' : 'default', reason: '' }
    }
    const cls = needed[0]
    // `class` is the one that ranks first; `classes` lists every class that applied, for the evaluator's records.
    return { decision: 'confirm', class: cls, classes: needed, rule: `class:${cls}`, reason: describe(cls, action, target, url, context?.frontmostBundleId) }
  }

  return { classify, preApprovals: granted }
}

function describe(cls, action, target, url, front) {
  const origin = placeOf(url, target, front)
  const what = action.type === 'type'
    ? `type ${action.text.length} characters into ${target?.name || 'the focused field'}`
    : `${action.type.replace('_', ' ')} ${target?.name ? `"${target.name}"` : 'here'}`
  const unread = cls === 'submit' && target?.defaultButtonRead === false && !target?.defaultButton?.name ? '; the default button could not be read' : ''
  return `${what} on ${origin} (${cls.replace('_', ' ')})${unread}`
}

/**
 * Where the action happens, for the question (CU-160): the page's host in a browser; on the desktop, where there is no
 * URL, the app the target belongs to (its bundle id - the name app-policy's own questions use), else the app in front
 * for an action with no target - never an empty place.
 */
function placeOf(url, target, front) {
  let host = ''
  try { host = new URL(url).host } catch { host = typeof url === 'string' ? url : '' }
  if (host) return host
  if (typeof target?.origin === 'string' && target.origin !== '' && target.origin !== 'null') return target.origin
  if (typeof front === 'string' && front !== '') return front
  return typeof url === 'string' && url !== '' ? url : 'this app'
}

/**
 * Task classes refused before any action (R56), as Operator and ChatGPT agent refuse them: moving money between
 * accounts, trading, and high-stakes medical or legal decisions. Matched on the task text at word boundaries.
 */
export const REFUSED_TASK_CLASSES = Object.freeze({
  money_transfer: /\b(wire|transfer|send)\s+(money|funds|\$\s?\d|\d+\s*(usd|dollars|eur|euros))|\bbank\s+transfer\b|\bwire\s+transfer\b/i,
  trading: /\b(buy|sell|short|trade)\s+(\d+\s+)?(shares?|stocks?|options|crypto|bitcoin|btc|eth)\b|\bplace\s+a\s+(trade|stock\s+order)\b/i,
  medical_decision: /\b(prescribe|change\s+(my|the)\s+(dose|dosage|medication)|stop\s+taking\s+(my\s+)?medication)\b/i,
  legal_decision: /\b(sign|file)\s+(the|a|my)\s+(lawsuit|legal\s+complaint|plea|divorce\s+papers)\b/i,
})

/** Screen a task before the first action: `{ refused: false }` or `{ refused: true, class, reason }`. */
export function screenTask(text) {
  for (const [cls, re] of Object.entries(REFUSED_TASK_CLASSES)) {
    if (re.test(String(text ?? ''))) return { refused: true, class: cls, reason: `tasks of the class ${cls.replace('_', ' ')} are refused before acting` }
  }
  return { refused: false }
}

/**
 * Approvals given at consent time, by `{ class, origin, fingerprint }` and lifetime (R31): `once` is used up by the
 * action it approved, `batch` lasts until `endBatch()`, `run` until the run ends.
 */
export function createApprovalStore() {
  const entries = []
  return {
    grant({ cls, origin, lifetime }) {
      if (lifetime === 'batch' || lifetime === 'run') entries.push({ cls, origin, lifetime })
    },
    covers(cls, origin) {
      return entries.some((e) => e.cls === cls && e.origin === origin)
    },
    endBatch() {
      for (let i = entries.length - 1; i >= 0; i -= 1) if (entries[i].lifetime === 'batch') entries.splice(i, 1)
    },
    get size() { return entries.length },
  }
}
