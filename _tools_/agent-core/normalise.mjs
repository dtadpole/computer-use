/**
 * CU-266 (cu-researcher; cu-coordinator: High): one normalisation before every name and value rule. A hostile page or
 * app controls its accessible names and the text it shows, so a zero-width space, a soft hyphen, a fullwidth form or a
 * Cyrillic or Greek look-alike must not hide 'Send', 'Password', a card number or 'Bank account' from consent.
 *
 * normaliseText: NFKC (fullwidth and compatibility forms to their plain ones), every format character removed (Unicode
 * Cf: zero-width space and joiners, word joiner, BOM, soft hyphen, bidi marks), the common Cyrillic and Greek letters
 * that look Latin folded to Latin, whitespace collapsed, and a letter-spaced word closed up ('S e n d' reads 'Send';
 * cu-coordinator's ruling - three or more single letters each one space apart). Case is left to each rule (they already
 * fold it). Only the judged copy is normalised - the action the run posts is never changed. Named limit: a letter-spaced
 * phrase whose words are one space apart too ('P l a c e o r d e r') closes up into one word.
 */

// Cyrillic and Greek letters drawn like Latin ones (lower and upper case), the usual homoglyph set.
const HOMOGLYPHS = new Map(Object.entries({
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', і: 'i', ј: 'j', ѕ: 's', ԁ: 'd', һ: 'h', ӏ: 'l', ԛ: 'q', ԝ: 'w',
  А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', Х: 'X', У: 'Y', І: 'I', Ј: 'J', Ѕ: 'S',
  α: 'a', ε: 'e', ο: 'o', ρ: 'p', τ: 't', υ: 'u', ν: 'v', ι: 'i', κ: 'k',
  Α: 'A', Β: 'B', Ε: 'E', Ζ: 'Z', Η: 'H', Ι: 'I', Κ: 'K', Μ: 'M', Ν: 'N', Ο: 'O', Ρ: 'P', Τ: 'T', Υ: 'Y', Χ: 'X',
}))
const HOMOGLYPH_RE = new RegExp(`[${[...HOMOGLYPHS.keys()].join('')}]`, 'gu')

// Three or more single letters, each one space from the next, standing alone (CU-266: 'S e n d').
const LETTER_SPACED_RE = /(?<![\p{L}\p{N}])\p{L}(?: \p{L}){2,}(?![\p{L}\p{N}])/gu

export function normaliseText(value) {
  if (typeof value !== 'string') return value
  return value.normalize('NFKC').replace(/\p{Cf}/gu, '').replace(HOMOGLYPH_RE, (ch) => HOMOGLYPHS.get(ch)).replace(/[^\S\r\n]+/g, ' ')
    .replace(LETTER_SPACED_RE, (run) => run.replaceAll(' ', ''))
}

// The string fields of a target that a rule reads by name.
const TARGET_FIELDS = ['name', 'description', 'roleDescription', 'title', 'label', 'placeholder', 'caption', 'captionName', 'filename', 'url', 'autocomplete']

export function normaliseTarget(target) {
  if (!target || typeof target !== 'object') return target
  const out = { ...target }
  for (const field of TARGET_FIELDS) if (typeof out[field] === 'string') out[field] = normaliseText(out[field])
  if (out.defaultButton && typeof out.defaultButton === 'object') out.defaultButton = { ...out.defaultButton, name: normaliseText(out.defaultButton.name) }
  if (Array.isArray(out.labels)) out.labels = out.labels.map(normaliseText)
  return out
}

function normaliseBound(bound) {
  if (!bound || typeof bound !== 'object') return bound
  if (Array.isArray(bound.items)) return { ...bound, items: bound.items.map(normaliseTarget) }
  return normaliseTarget(bound)
}

/** The judged copies of an action and its context: names, labels, captions, dialog text and typed text normalised. */
export function normaliseForPolicy(action, context = {}) {
  const judgedAction = action && typeof action.text === 'string' ? { ...action, text: normaliseText(action.text) } : action
  const judged = { ...context }
  for (const key of ['target', 'dropTarget']) if (judged[key]) judged[key] = normaliseTarget(judged[key])
  if (judged.boundMenuItem) judged.boundMenuItem = normaliseBound(judged.boundMenuItem)
  if (judged.dialog && typeof judged.dialog === 'object') judged.dialog = { ...judged.dialog, message: normaliseText(judged.dialog.message) }
  if (typeof judged.dragText === 'string') judged.dragText = normaliseText(judged.dragText)
  if (judged.paste && typeof judged.paste.text === 'string') judged.paste = { ...judged.paste, text: normaliseText(judged.paste.text) }
  // The copied-from field lends its name class to the paste (CU-183): its descriptor's name and caption are names too.
  if (judged.paste && judged.paste.source !== undefined && judged.paste.source !== null) {
    judged.paste = { ...judged.paste, source: Array.isArray(judged.paste.source) ? judged.paste.source.map(normaliseTarget) : normaliseTarget(judged.paste.source) }
  }
  return { action: judgedAction, context: judged }
}
