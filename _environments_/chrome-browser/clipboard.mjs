import { invalid } from './errors.mjs'

/**
 * The per-run clipboard (D-011).
 *
 * Nobody touches the owner's macOS pasteboard, so copy, cut and paste are emulated: copy reads the page's
 * selection into a buffer the driver holds for one run; cut also deletes the selection with Backspace; paste
 * types the buffer with `Input.insertText`. Chrome's own copy, cut and paste commands are never dispatched.
 * The trajectory records the operation and the length, never the content (R44).
 */

export const CLIPBOARD_MAX_CHARS = 100_000

/** A buffer that lives as long as one environment. */
export function createRunClipboard({ maxChars = CLIPBOARD_MAX_CHARS } = {}) {
  let text = ''
  return {
    /** Store text; longer text is refused rather than silently cut. */
    set(value) {
      if (typeof value !== 'string') throw invalid('clipboard text must be a string')
      if (value.length > maxChars) throw invalid(`the selection is longer than the ${maxChars}-character clipboard`)
      text = value
      return text.length
    },
    get() {
      return text
    },
    get length() {
      return text.length
    },
    clear() {
      text = ''
    },
  }
}

/**
 * Read what a person would copy: the selected part of the focused text field, else the document selection.
 *
 * Runs **in the page** (an isolated world), so it receives the page's `document` and `window`; it is defined here so
 * it has unit tests. Same-origin frames are descended into; a cross-origin frame or a password field copies nothing,
 * as a browser does. Returns `{ text, editable, reason? }`.
 */
export function readSelection(doc, win) {
  let active = doc.activeElement
  for (let depth = 0; depth < 10 && active && (active.tagName === 'IFRAME' || active.tagName === 'FRAME'); depth += 1) {
    let inner = null
    try {
      inner = active.contentDocument
    } catch {
      inner = null
    }
    if (!inner) return { text: '', editable: false, reason: 'cross-origin frame' }
    doc = inner
    win = inner.defaultView
    active = inner.activeElement
  }
  const tag = active ? active.tagName : undefined
  if (tag === 'INPUT' && String(active.type).toLowerCase() === 'password') {
    return { text: '', editable: false, reason: 'password field' }
  }
  if ((tag === 'INPUT' || tag === 'TEXTAREA') && typeof active.selectionStart === 'number') {
    return {
      text: String(active.value).slice(active.selectionStart, active.selectionEnd),
      editable: !active.readOnly && !active.disabled,
    }
  }
  const selection = win && typeof win.getSelection === 'function' ? win.getSelection() : null
  return { text: selection ? String(selection) : '', editable: Boolean(active && active.isContentEditable) }
}

/** The expression the executor evaluates in an isolated world to read the selection. */
export const READ_SELECTION_EXPRESSION = `(${readSelection.toString()})(document, window)`
