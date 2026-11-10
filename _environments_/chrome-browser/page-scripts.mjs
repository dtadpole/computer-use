/**
 * Functions that run **inside the page**, in an isolated world (`Page.createIsolatedWorld`), so the page's own
 * scripts cannot replace the DOM methods they call. They are defined here, as plain functions of `document` and
 * `window`, so they have unit tests; the executor evaluates them from their source.
 *
 * Each function must stay self-contained (no imports, no closures over module scope), because only its source text
 * reaches the page.
 */

/**
 * The page's text for the injection inspector: `text` a person can see, `hiddenText` a DOM reader sees but a person
 * does not (the definition proposed in cu-developer-two's M1 driver review):
 * not rendered (no client rects, `visibility: hidden`), opacity 0 on it or an ancestor, at most 1x1 px (the
 * screen-reader-only pattern), wholly above or left of the document, font size under 2 px, or text colour equal to
 * the nearest background colour; plus `alt`, `title`, `aria-label` and `aria-description` values, which no screenshot
 * shows. Script, style, noscript and template content is skipped. Open shadow roots and same-origin frames are read.
 */
export function collectPageText(doc, win, maxChars) {
  const limit = typeof maxChars === 'number' && maxChars > 0 ? maxChars : 20000
  const visible = []
  const hidden = []
  const SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1 }
  const ATTRS = ['alt', 'title', 'aria-label', 'aria-description']
  const clean = (value) => String(value).replace(/\s+/g, ' ').trim()
  const parseColour = (value) => {
    const match = /rgba?\(([^)]+)\)/.exec(String(value || ''))
    if (!match) return null
    const parts = match[1].split(',').map((part) => parseFloat(part))
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 }
  }
  const backgroundOf = (el, view) => {
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      const colour = parseColour(view.getComputedStyle(node).backgroundColor)
      if (colour && colour.a > 0) return colour
    }
    return { r: 255, g: 255, b: 255, a: 1 }
  }
  const isHidden = (el, view) => {
    const style = view.getComputedStyle(el)
    if (!el.getClientRects || el.getClientRects().length === 0) return true
    if (style.visibility === 'hidden' || style.visibility === 'collapse') return true
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      if (parseFloat(view.getComputedStyle(node).opacity) === 0) return true
    }
    const rect = el.getBoundingClientRect()
    if (rect.width <= 1 && rect.height <= 1) return true
    const scrollX = view.scrollX || 0
    const scrollY = view.scrollY || 0
    if (rect.right + scrollX <= 0 || rect.bottom + scrollY <= 0) return true
    if (parseFloat(style.fontSize) < 2) return true
    const colour = parseColour(style.color)
    if (colour && colour.a === 0) return true
    const background = backgroundOf(el, view)
    if (colour && colour.r === background.r && colour.g === background.g && colour.b === background.b) return true
    return false
  }
  let budget = limit * 2 + 1000
  const visit = (el, view, depth) => {
    if (!el || depth > 40 || budget <= 0) return
    if (SKIP[el.tagName]) return
    const hiddenHere = isHidden(el, view)
    for (const name of ATTRS) {
      const value = el.getAttribute ? el.getAttribute(name) : null
      if (value) hidden.push(clean(value))
    }
    for (const child of el.childNodes || []) {
      if (child.nodeType === 3) {
        const value = clean(child.nodeValue)
        if (value) {
          (hiddenHere ? hidden : visible).push(value)
          budget -= value.length
        }
      } else if (child.nodeType === 1) {
        visit(child, view, depth + 1)
      }
    }
    if (el.shadowRoot) for (const child of el.shadowRoot.childNodes || []) if (child.nodeType === 1) visit(child, view, depth + 1)
    if (el.tagName === 'IFRAME' || el.tagName === 'FRAME') {
      let inner = null
      try {
        inner = el.contentDocument
      } catch {
        inner = null
      }
      if (inner && inner.body) visit(inner.body, inner.defaultView, depth + 1)
    }
  }
  if (doc.body) visit(doc.body, win, 0)
  const join = (parts) => {
    const text = parts.join('\n')
    return text.length > limit ? { value: text.slice(0, limit), truncated: true } : { value: text, truncated: false }
  }
  const shown = join(visible)
  const unseen = join(hidden)
  return { text: shown.value, hiddenText: unseen.value, truncated: shown.truncated || unseen.truncated }
}

/**
 * CU-150: the button Return presses from `el` through HTML's implicit submission - its form's default button, the first
 * submit button in tree order (`form.elements` includes buttons tied by `form=`) - or null. Only an <input> whose type
 * takes part in implicit submission counts: a textarea (a Return there is a new line, never a submit), select,
 * contenteditable or button answers null; so does a form with no submit button (HTML submits it only when it holds a
 * single field, and then nothing names it) and a disabled default button (nothing submits). Run in an isolated world,
 * so a page cannot redefine `form.elements` to hide its real button.
 */
/**
 * CU-319 (CU-302's driver half): the fields a submit-like control would send that the browser autofilled - a saved login
 * filled on load, which the run never typed (typing clears the state). `el` is the described target, submit-like when it
 * is a submit control (a button of type submit, the default, or an input of type submit or image), any other control (a
 * button, an input of type button, a [role=button] or a link - a script may submit on its click) or a text entry (its
 * Return may submit). Inside a form it takes that form's fields, plus those in open shadow roots under the form; outside
 * any form (a sign-in built without <form>, cu-researcher's F1/F2) the autofilled fields of its whole document, open
 * shadow roots included (sign-in web components, N1). The walk stops at 2000 elements, and a stopped walk answers
 * `{ truncated: true }` rather than a partial list, so a page padded past the bound fails closed (cu-researcher).
 * Anything else: null. Only :autofill (or Chrome's older :-webkit-autofill) is asked - never a value.
 *
 * Chrome clears :autofill as soon as a field is edited, so 'a saved password plus one typed character' would launder the
 * saved value (cu-verifier). A field once seen autofilled in this document is remembered and stays reported, marked
 * edited, after it stops matching. The memory is a WeakSet on `globalThis` of the world this function runs in: the driver
 * resolves the element into its own isolated world (Page.createIsolatedWorld 'cu-driver') and calls it there, so the
 * page's main-world scripts cannot reach or reset it.
 * Returns `{ fields, edited }` (parallel lists, at most 20), or null. Self-contained: it runs serialized in the page.
 */
export function autofilledFields(el) {
  const NOT_TEXT = ['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'image', 'range', 'color', 'hidden']
  const autofilled = (field) => {
    for (const selector of [':autofill', ':-webkit-autofill']) {
      try {
        if (field && typeof field.matches === 'function' && field.matches(selector)) return true
      } catch {
        // A selector this engine does not know: try the next.
      }
    }
    return false
  }
  if (!el || el.nodeType !== 1) return null
  const tag = String(el.tagName || '').toLowerCase()
  const type = tag === 'input' ? String(el.type || 'text').toLowerCase() : tag === 'button' ? String(el.type || 'submit').toLowerCase() : ''
  const role = String((el.getAttribute && el.getAttribute('role')) || '').toLowerCase()
  const form = el.form || (typeof el.closest === 'function' ? el.closest('form') : null) || null
  const submits = (tag === 'button' && type === 'submit') || (tag === 'input' && (type === 'submit' || type === 'image'))
  const entry = (tag === 'input' && !NOT_TEXT.includes(type)) || tag === 'textarea'
  const control = tag === 'button' || (tag === 'input' && type === 'button') || role === 'button' || (tag === 'a' && el.getAttribute && el.getAttribute('href') !== null)
  if (!(submits || control || entry)) return null
  // The text fields under `root`, descending into open shadow roots; bounded so a huge page cannot stall the read.
  let truncated = false
  const deep = (root) => {
    const found = []
    let walked = 0
    const visit = (node) => {
      if (!node || truncated) return
      const all = typeof node.querySelectorAll === 'function' ? Array.from(node.querySelectorAll('*')) : []
      for (const child of all) {
        walked += 1
        if (walked > 2000) {
          truncated = true
          return
        }
        const name = String(child.tagName || '').toLowerCase()
        if (name === 'input' || name === 'textarea' || name === 'select') found.push(child)
        if (child.shadowRoot) visit(child.shadowRoot)
      }
    }
    visit(root)
    return found
  }
  const owned = form ? Array.from(form.elements || []) : []
  const ownedSet = new Set(owned)
  const scope = form ? [...owned, ...deep(form).filter((field) => !ownedSet.has(field))] : deep(el.ownerDocument)
  if (truncated) return { fields: [], edited: [], truncated: true }
  const seen = globalThis.__cuAutofillSeen instanceof WeakSet ? globalThis.__cuAutofillSeen : (globalThis.__cuAutofillSeen = new WeakSet())
  const fields = []
  const edited = []
  for (const field of scope) {
    if (fields.length >= 20) break
    if (autofilled(field)) {
      seen.add(field)
      fields.push(field)
      edited.push(false)
    } else if (field && typeof field === 'object' && seen.has(field)) {
      fields.push(field)
      edited.push(true)
    }
  }
  return { fields, edited }
}

export function implicitSubmitButton(el) {
  const IMPLICIT = ['text', 'search', 'email', 'url', 'tel', 'password', 'number', 'date', 'datetime-local', 'month', 'time', 'week']
  if (!el || el.tagName !== 'INPUT' || !IMPLICIT.includes(String(el.type).toLowerCase())) return null
  const form = el.form
  if (!form || !form.elements) return null
  for (const candidate of Array.from(form.elements)) {
    const type = String(candidate.type).toLowerCase()
    const submits = (candidate.tagName === 'BUTTON' && type === 'submit') || (candidate.tagName === 'INPUT' && (type === 'submit' || type === 'image'))
    if (submits) return candidate.disabled ? null : candidate
  }
  return null
}

/**
 * CU-157: whether any text entry on the page holds text - true, false, or null when part of the page cannot be read.
 * Agent core lets a bare 'Reply' run only on a strict false (it then opens a composer; it sends nothing). Presence
 * only: run in an isolated world, it returns the boolean and never the text.
 *
 * The page is the control's frame, every frame it can reach upward (same-origin ancestors), and everything below:
 * open shadow roots and same-origin frames. A cross-origin frame or ancestor, or a page past the node cap, is unknown
 * (null), which asks (cu-verifier's option A). So is an editor whose text lives outside a text entry: an explicit
 * role=textbox or aria-multiline=true on anything that is not contenteditable (Monaco and CodeMirror 5 keep their
 * code in divs behind a hidden textarea that carries exactly those attributes; CodeMirror 6's contenteditable is
 * read), and any <canvas>: an editor may draw its text there (charts make it over-ask). #374's rule: false needs every
 * text entry read and empty. A CLOSED shadow root is invisible here (its host's
 * shadowRoot is null); the driver checks those through the protocol (closedRootHoldsEntry) when this says false. Text:
 * a text-like input's or a textarea's value, a contenteditable's or a designMode document's text, once whitespace
 * and zero-width characters are removed - so an empty ProseMirror or Draft composer (<p><br></p>) is empty, and a
 * placeholder (an attribute, not the value) never counts. A file input holding a staged file counts (files.length,
 * never a name). A password with a value counts (asks, the safe side); an
 * input of type hidden (a form's token) is not a text entry. Any filled entry answers true at once.
 */
export function textEntered(el) {
  const MAX_NODES = 50000
  const BLANK = /[\s\u200B-\u200D\uFEFF]/g
  const TEXT_INPUTS = ['text', 'search', 'email', 'url', 'tel', 'password']
  const hasText = (value) => typeof value === 'string' && value.replace(BLANK, '') !== ''
  let doc = el && el.ownerDocument
  if (!doc) return null
  let unknown = false
  for (let depth = 0; depth < 20; depth += 1) {
    const view = doc.defaultView
    if (!view) break
    let host = null
    try {
      host = view.frameElement
    } catch {
      host = null
    }
    if (host) {
      doc = host.ownerDocument
      continue
    }
    try {
      if (view.parent !== view) unknown = true // a cross-origin ancestor: part of the page this world cannot read
    } catch {
      unknown = true
    }
    break
  }
  let seen = 0
  const visit = (root, depth) => {
    if (depth > 10) {
      unknown = true
      return false
    }
    if (root.designMode === 'on' && root.body && hasText(root.body.textContent)) return true
    const all = root.querySelectorAll('*')
    seen += all.length
    if (seen > MAX_NODES) {
      unknown = true
      return false
    }
    for (const node of all) {
      const tag = node.tagName
      if (tag === 'TEXTAREA') {
        if (hasText(node.value)) return true
      } else if (tag === 'INPUT') {
        const inputType = String(node.type).toLowerCase()
        if (TEXT_INPUTS.includes(inputType) && hasText(node.value)) return true
        // A staged attachment is content too (an attachment-only reply): its count, never its names.
        if (inputType === 'file' && node.files && node.files.length > 0) return true
      }
      const editable = node.getAttribute('contenteditable')
      const isEditable = editable !== null && editable.toLowerCase() !== 'false'
      if (isEditable && tag !== 'INPUT' && tag !== 'TEXTAREA' && hasText(node.textContent)) return true
      // An editor whose text is not in its entry (Monaco, CodeMirror 5): unread, so unknown unless text shows elsewhere.
      // A canvas may be an editor that draws its text as pixels (no entry holds it): any canvas is unknown, charts too.
      if (tag === 'CANVAS') unknown = true
      if (!isEditable && (node.getAttribute('role') === 'textbox' || node.getAttribute('aria-multiline') === 'true')) unknown = true
      if (node.shadowRoot && visit(node.shadowRoot, depth + 1)) return true
      if (tag === 'IFRAME' || tag === 'FRAME') {
        let inner = null
        try {
          inner = node.contentDocument
        } catch {
          inner = null
        }
        if (!inner) unknown = true
        else if (visit(inner, depth + 1)) return true
      }
    }
    return false
  }
  if (visit(doc, 0)) return true
  return unknown ? null : false
}

/** The focused element, descending into same-origin frames and open shadow roots; null when nothing is focused. */
export function deepActiveElement(doc) {
  let active = doc.activeElement
  for (let depth = 0; active && depth < 20; depth += 1) {
    if (active.shadowRoot && active.shadowRoot.activeElement) {
      active = active.shadowRoot.activeElement
      continue
    }
    if (active.tagName === 'IFRAME' || active.tagName === 'FRAME') {
      let inner = null
      try {
        inner = active.contentDocument
      } catch {
        inner = null
      }
      if (!inner || !inner.activeElement) return active
      const innerActive = inner.activeElement
      // A same-origin frame editor (TinyMCE, CKEditor classic, webmail composers): its focus is the frame's body, which
      // takes text when contentEditable or in designMode - a text entry, as FRAME_FOCUS_EXPRESSION already answers for
      // a cross-site frame (CU-300). Without this the focus read null, and a null focus makes typed text a page shortcut.
      if ((innerActive.tagName === 'BODY' || innerActive.tagName === 'HTML') && (innerActive.isContentEditable || inner.designMode === 'on')) return inner.body || innerActive
      active = innerActive
      continue
    }
    break
  }
  if (!active || active.tagName === 'BODY' || active.tagName === 'HTML') return null
  return active
}

/**
 * What the consent gate needs to know about one element: tag, input type, password, autocomplete, the link it is in,
 * its document's origin and whether it takes text. Role and accessible name come from the accessibility tree.
 */
export function describeElement(el) {
  const tag = String(el.tagName || '').toLowerCase()
  const type = tag === 'input' ? String(el.type || 'text').toLowerCase() : null
  let link = null
  for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
    if (String(node.tagName).toLowerCase() === 'a' && node.href) {
      link = String(node.href)
      break
    }
  }
  let origin = null
  try {
    origin = el.ownerDocument.defaultView.location.origin
  } catch {
    origin = null
  }
  // CU-300: inside a frame only, the frame document's address - origin and path for http(s), with no query, fragment or
  // credentials (a path may still carry a token: the driver never records it); the scheme alone for any other scheme,
  // so a data: URL never carries its payload. Absent on the top document.
  let frameUrl = null
  try {
    const view = el.ownerDocument.defaultView
    if (view && view.top && view !== view.top) {
      const place = view.location
      frameUrl = place.protocol === 'http:' || place.protocol === 'https:' ? `${place.protocol}//${place.host}${place.pathname}` : String(place.protocol || '') || null
    }
  } catch {
    frameUrl = null
  }
  const autocomplete = el.getAttribute ? el.getAttribute('autocomplete') : null
  // CU-173: editable means it takes text. A read-only or disabled input or textarea takes none, so it is not a text
  // entry - as the desktop's editable (AXValue settable) and this driver's clipboard read already say - and agent core's
  // isTextEntry keeps judging it by its name (a read-only input styled as a button stays a button).
  //
  // isContentEditable is inherited, so a button, link, chip or checkbox inside a rich editor would say true - and its
  // own name (a 'Delete' button) would stop being judged. A control is never editable, wherever it sits; the editing
  // host and its text still are, and a contenteditable=false island already says false.
  // The lists live inside the function: it runs serialized in the page (toString), where module scope does not exist.
  const NOT_TEXT_INPUTS = ['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'image', 'range', 'color', 'hidden']
  const CONTROL_ROLES = ['button', 'link', 'checkbox', 'radio', 'switch', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option',
    'tab', 'combobox', 'listbox', 'slider', 'treeitem']
  const takesText = !el.readOnly && !el.disabled
  const role = String((el.getAttribute && el.getAttribute('role')) || '').toLowerCase()
  const control = ['button', 'select', 'option', 'summary'].includes(tag) || (tag === 'input' && NOT_TEXT_INPUTS.includes(type)) ||
    (tag === 'a' && el.getAttribute && el.getAttribute('href') !== null) || CONTROL_ROLES.includes(role)
  const editable = !control && (Boolean(el.isContentEditable) || (takesText && (tag === 'textarea' || tag === 'input')))
  // CU-187: the caption of a NON-entry element - the label beside the value it shows (a profile page's 'IBAN' beside
  // 'DE89 ...'), read here from the page, never from the element's own words, so a copied value carries its label's
  // class. In order: aria-labelledby on the element or on an ancestor within three levels - not past a dialog, landmark
  // or section, whose label is a heading; a <dd>'s <dt>; a table cell's column header, then its row header. Nothing
  // else (no 'nearest preceding text': a heading or the previous row's value is too easy to take). A form control has
  // none. An entry's is returned apart, as entryCaption (CU-194 rule 5): the driver keeps it only when the entry's
  // accessible name is empty, since a <label>, aria-label or placeholder already names it. At most 80 characters, else
  // null. Built only from tagName, parentElement, childNodes, getAttribute and text nodes, so it runs wherever
  // describeElement does.
  let caption = null
  if (editable || !['input', 'textarea', 'select'].includes(tag)) {
    const tagOf = (node) => String((node && node.tagName) || '').toLowerCase()
    const kids = (node) => Array.from((node && node.childNodes) || []).filter((child) => child && child.nodeType === 1)
    const words = (node) => {
      let out = ''
      const walk = (n, depth) => {
        if (!n || depth > 50) return
        if (n.nodeType === 3) { out += ` ${n.nodeValue || ''}`; return }
        for (const child of Array.from(n.childNodes || [])) walk(child, depth + 1)
      }
      walk(node, 0)
      return out.replace(/\s+/g, ' ').trim()
    }
    const within = (outer, inner) => { for (let n = inner; n; n = n.parentElement) if (n === outer) return true; return false }
    const clip = (text) => (text ? text.slice(0, 80) : null)
    const CONTAINERS = ['dialog', 'section', 'main', 'nav', 'aside', 'article', 'form', 'header', 'footer', 'body', 'html']
    const CONTAINER_ROLES = ['dialog', 'alertdialog', 'region', 'main', 'navigation', 'complementary', 'form', 'banner', 'contentinfo', 'document', 'application']
    let node = el
    for (let depth = 0; node && node.nodeType === 1 && depth <= 3; depth += 1, node = node.parentElement) {
      const nodeRole = String((node.getAttribute && node.getAttribute('role')) || '').toLowerCase()
      if (depth > 0 && (CONTAINERS.includes(tagOf(node)) || CONTAINER_ROLES.includes(nodeRole))) break
      const ids = node.getAttribute ? node.getAttribute('aria-labelledby') : null
      if (!ids) continue
      const doc = el.ownerDocument
      const labels = String(ids).split(/\s+/).filter(Boolean).map((id) => (doc && doc.getElementById ? doc.getElementById(id) : null))
      caption = clip(labels.filter((label) => label && !within(label, el) && !within(el, label)).map(words).filter(Boolean).join(' '))
      break
    }
    if (caption === null) {
      let dd = null
      for (let n = el, depth = 0; n && n.nodeType === 1 && depth <= 4; n = n.parentElement, depth += 1) {
        const t = tagOf(n)
        if (t === 'dd') { dd = n; break }
        if (t === 'dt' || t === 'dl') break
      }
      if (dd && dd.parentElement) {
        const siblings = kids(dd.parentElement)
        for (let i = siblings.indexOf(dd) - 1; i >= 0; i -= 1) {
          const t = tagOf(siblings[i])
          if (t === 'dt') { caption = clip(words(siblings[i])); break }
          if (t !== 'dd') break
        }
      }
    }
    if (caption === null) {
      let cell = null
      for (let n = el, depth = 0; n && n.nodeType === 1 && depth <= 4; n = n.parentElement, depth += 1) {
        const t = tagOf(n)
        if (t === 'td') { cell = n; break }
        if (t === 'th' || t === 'table') break
      }
      const row = cell && tagOf(cell.parentElement) === 'tr' ? cell.parentElement : null
      let table = row
      while (table && tagOf(table) !== 'table') table = table.parentElement
      if (row && table) {
        const span = (c) => { const v = Number(c.getAttribute ? c.getAttribute('colspan') : 1); return Number.isInteger(v) && v > 0 ? v : 1 }
        const cells = (r) => kids(r).filter((c) => ['td', 'th'].includes(tagOf(c)))
        // copy-caption rule 2: a cell's caption is its column header JOINED with its row's key. The key is the row's
        // header, or - in a key | value row (two cells, one column each) - its first cell, <th> or <td>. Joining needs no
        // guess between a key | value table ('Field | Value' / 'IBAN | x' -> 'Value · IBAN') and a two-column data table
        // ('Name | IBAN' / 'Ada | x' -> 'IBAN · Ada'): the class word is in the caption either way. A first-column datum
        // can sit in it; a caption is never recorded and meets only word rules, so the worst case is a rare over-ask.
        const own = cells(row)
        let column = 0
        for (const c of own) { if (c === cell) break; column += span(c) }
        const rows = []
        const collect = (n, depth) => {
          for (const k of kids(n)) {
            const t = tagOf(k)
            if (t === 'tr') rows.push(k)
            else if (['thead', 'tbody', 'tfoot'].includes(t) && depth < 2) collect(k, depth + 1)
          }
        }
        collect(table, 0)
        const head = rows.find((r) => r !== row && cells(r).length > 0 && cells(r).every((c) => tagOf(c) === 'th'))
        let header = null
        if (head) {
          let at = 0
          for (const h of cells(head)) {
            const width = span(h)
            if (column >= at && column < at + width) { header = words(h) || null; break }
            at += width
          }
        }
        const rowHead = own.find((c) => tagOf(c) === 'th' && c !== cell)
        const pair = own.length === 2 && own[1] === cell && own.every((c) => span(c) === 1)
        const key = rowHead ? (words(rowHead) || null) : pair ? (words(own[0]) || null) : null
        const parts = [header, key].filter((part, index, all) => part && all.indexOf(part) === index)
        if (parts.length > 0) caption = clip(parts.join(' · '))
      }
    }
  }
  // CU-271 (cu-coordinator's ruling, cu-researcher's review): where the element sits, from DOM shape alone - never a
  // value. terminal: inside a web terminal (xterm.js and its helper textarea, role=terminal). notebookCell: inside a
  // notebook's code cell (JupyterLab and Notebook 7, the classic Notebook, Colab, VS Code for the Web), editor or
  // container. notebookSurface: the page has such a cell or a Jupyter title. codeSurface: the page has a Monaco or
  // CodeMirror editor (an online IDE or playground).
  const classTokens = (node) => String((node.getAttribute && node.getAttribute('class')) || '').split(/\s+/).filter(Boolean)
  const roleIs = (node, wanted) => String((node.getAttribute && node.getAttribute('role')) || '').toLowerCase() === wanted
  const CELL_CLASSES = ['jp-CodeCell', 'code_cell', 'cell-editor-container', 'code-cell']
  let terminal = false
  let notebookCell = false
  for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
    const tokens = classTokens(node)
    if (roleIs(node, 'terminal') || tokens.includes('xterm') || tokens.includes('xterm-helper-textarea')) terminal = true
    if (tokens.some((token) => CELL_CLASSES.includes(token)) || (tokens.includes('cell') && tokens.includes('code'))
      || String(node.tagName || '').toLowerCase() === 'colab-run-button') notebookCell = true
  }
  let notebookSurface = notebookCell
  let codeSurface = false
  try {
    const doc = el.ownerDocument
    if (doc && typeof doc.querySelector === 'function') {
      notebookSurface = notebookSurface || doc.querySelector('.jp-CodeCell, .jp-Notebook, .code_cell, .cell.code, colab-run-button, .notebook-cell-list') !== null
        || /(^|[\s|-])(JupyterLab|Jupyter Notebook)$/.test(String(doc.title || '').trim())
      codeSurface = doc.querySelector('.monaco-editor, .cm-editor, .CodeMirror') !== null
    }
  } catch {
    // A detached or cross-origin document: no page-level flags.
  }
  // CU-373: a toggle's state - a native checkbox or radio (indeterminate is 'mixed'), else aria-checked on a checkbox,
  // switch, radio or menu item; aria-pressed on a toggle button - so a click on a security switch can be judged by the
  // direction it flips. Absent when the element carries neither.
  const tristate = (value) => (value === 'true' ? true : value === 'false' ? false : value === 'mixed' ? 'mixed' : null)
  const ariaChecked = typeof el.getAttribute === 'function' ? tristate(el.getAttribute('aria-checked')) : null
  const checked = tag === 'input' && (type === 'checkbox' || type === 'radio') ? (el.indeterminate ? 'mixed' : Boolean(el.checked)) : ariaChecked
  const pressed = typeof el.getAttribute === 'function' ? tristate(el.getAttribute('aria-pressed')) : null
  // CU-400: a button that submits a form is judged with the choices beside it - an exchange's bare 'Sell' next to an
  // asset select and an amount field. Bounded: at most 3 selected option or combobox texts of 24 characters each, and
  // whether an amount-shaped entry is present (never its value). Only for button-like elements inside a form (below).
  const formContext = (() => {
    const buttonLike = tag === 'button' || (tag === 'input' && ['submit', 'button', 'image'].includes(type)) || role === 'button'
    // The form the control belongs to (el.form: a <form> ancestor, or one named by its form= attribute when the button
    // sits outside it), else an explicit [role=form]; else (cu-researcher 05:24Z: React forms are divs) the nearest <fieldset>,
    // <dialog> or [role=dialog] that holds exactly this one submit-like control - so a page-wide section never lends
    // its selects (bounded fallback, cu-coordinator 05:26Z).
    let form = buttonLike ? (el.form && el.form.querySelectorAll ? el.form : null) || (el.closest ? el.closest('form') || el.closest('[role="form"]') : null) : null
    if (!form && buttonLike && el.closest) {
      const box = el.closest('fieldset, dialog, [role="dialog"]')
      const SUBMITS = 'button, input[type="submit"], input[type="button"], input[type="image"], [role="button"]'
      // CU-405 (cu-coordinator 06:39Z, 06:43Z): a container also counts when, order-panel helpers ignored (a percentage,
      // Max/Min/Half, Limit/Market/Stop/Stop-limit/OCO, a label of one symbol or arrow - and an unlabelled icon button,
      // the fail-closed reading), every remaining submit-like control is a trade verb. Any other button voids it.
      const TRADE_VERB = /^(?:buy|sell|swap|convert|trade|deposit|withdraw|transfer)(?:\s|$)/i
      const NEUTRAL = /^(?:max|min|half|\d{1,3}\s?%|limit|market|stop(?:[\s-]limit)?|oco)$/i
      const verbOf = (control) => String((control.getAttribute && control.getAttribute('aria-label')) || control.value || control.textContent || '').replace(/\s+/g, ' ').trim()
      const lends = (node) => {
        const submits = [...node.querySelectorAll(SUBMITS)]
        if (submits.length === 1) return true
        const kinds = submits.map((control) => {
          const verb = verbOf(control)
          if (verb.length <= 30 && TRADE_VERB.test(verb)) return 'trade'
          return verb === '' || ([...verb].length <= 2 && !/[\p{L}\p{N}]/u.test(verb)) || NEUTRAL.test(verb) ? 'neutral' : 'other'
        })
        return kinds.includes('trade') && !kinds.includes('other')
      }
      if (box && lends(box)) form = box
      // A div trade panel (cu-coordinator 05:36Z): the button's nearest ancestor within 3 levels that holds exactly
      // this one submit-like control and at least one select or combobox - a page-wide container with two submit
      // buttons never qualifies.
      for (let node = el.parentElement, depth = 0; !form && node && depth < 3; node = node.parentElement, depth += 1) {
        if (node.querySelectorAll && lends(node) && node.querySelectorAll('select, [role="combobox"]').length > 0) form = node
      }
    }
    if (!form) return null
    const short = (text) => String(text || '').replace(/\s+/g, ' ').trim()
    const options = []
    for (const control of form.querySelectorAll('select, [role="combobox"]')) {
      if (options.length >= 3) break
      const text = control.tagName === 'SELECT'
        ? short(control.selectedOptions && control.selectedOptions[0] ? control.selectedOptions[0].textContent : '')
        : short(control.value !== undefined && control.value !== '' ? control.value : control.textContent)
      if (text !== '' && text.length <= 24) options.push(text)
    }
    const AMOUNT = /amount|qty|quantity|price|total|sum/i
    const amountEntry = [...form.querySelectorAll('input')].some((input) => input.type === 'number'
      || ['decimal', 'numeric'].includes(String(input.getAttribute('inputmode') || '').toLowerCase())
      || AMOUNT.test([input.name, input.id, input.getAttribute('aria-label'), input.placeholder].filter(Boolean).join(' ')))
    return options.length > 0 || amountEntry ? { options, amountEntry } : null
  })()
  return { tag, inputType: type, isPassword: type === 'password', autocomplete: autocomplete || null, href: link, origin, editable, caption: editable ? null : caption, entryCaption: editable ? caption : null,
    ...(frameUrl ? { frameUrl } : {}), ...(terminal ? { terminal } : {}), ...(notebookCell ? { notebookCell } : {}), ...(notebookSurface ? { notebookSurface } : {}), ...(codeSurface ? { codeSurface } : {}),
    ...(checked !== null ? { checked } : {}), ...(pressed !== null ? { pressed } : {}),
    ...(formContext !== null ? { formContext } : {}) }
}

/**
 * CU-175: the element a click at `el` activates, in two passes over the flat tree (a slotted node's slot, then its
 * parent, then a shadow root's host), stopping at <body>:
 * 1. the nearest button, link, summary, select, button-like input, element with a control role, or element with an
 *    onclick handler - or, when a <label> comes first, the control it labels (label.control), which the browser
 *    activates for it;
 * 2. else, when `el` shows a pointer cursor, the topmost element of that run of pointer cursors - cursor is inherited, so
 *    the element that set it is the highest one still showing it (a script-wired <div> 'button').
 * Else `el` itself. Hit testing returns the innermost node - a <span> label or an <svg> icon inside a 'Delete' button -
 * whose own role and name are not what the click does. Self-contained: it runs serialized in the page.
 */
export function activatableAncestor(el) {
  const CONTROL_ROLES = ['button', 'link', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'checkbox', 'radio', 'switch',
    'option', 'treeitem']
  const BUTTON_INPUTS = ['button', 'submit', 'reset', 'image', 'checkbox', 'radio', 'file', 'color']
  const next = (node) => {
    const root = node.getRootNode ? node.getRootNode() : null
    return node.assignedSlot || node.parentElement || (root && root !== node && root.host) || null
  }
  const top = (node) => node.nodeType === 1 && ['body', 'html'].includes(String(node.tagName || '').toLowerCase())
  let node = el
  for (let depth = 0; node && depth < 64 && !top(node); depth += 1, node = next(node)) {
    if (node.nodeType !== 1) continue
    const tag = String(node.tagName || '').toLowerCase()
    const attr = (name) => (node.getAttribute ? node.getAttribute(name) : null)
    if (tag === 'button' || tag === 'summary' || tag === 'select' || CONTROL_ROLES.includes(String(attr('role') || '').toLowerCase()) ||
      (tag === 'a' && attr('href') !== null) || attr('onclick') !== null ||
      (tag === 'input' && BUTTON_INPUTS.includes(String(node.type || '').toLowerCase()))) return node
    // A click on a <label>'s text activates its control (the browser forwards it): the control is the target, so the
    // control's own rules judge the click (cu-verifier, 9 Nov: a CAPTCHA box toggled and a Delete button fired through
    // their labels unjudged). A control met first inside the label - a link in its text - was returned above, as the
    // browser activates that one. A label with no control stays a label - so does a label in a shadow root whose for=
    // names a light-DOM control, as label.control is null across trees (a named limit; cu-researcher).
    if (tag === 'label' && node.control && node.control.nodeType === 1) return node.control
  }
  const view = el && el.ownerDocument && el.ownerDocument.defaultView
  const pointer = (candidate) => {
    try {
      return candidate.nodeType === 1 && view.getComputedStyle(candidate).cursor === 'pointer'
    } catch {
      return false
    }
  }
  // A page that sets cursor:pointer on <body> or <html> makes every element inherit it: the signal says nothing then
  // (cu-verifier's CU-176 run: the whole page became one 'pointer run' and a wrapper's text its name).
  const doc = el && el.ownerDocument
  if (!view || !pointer(el) || (doc && ((doc.body && pointer(doc.body)) || (doc.documentElement && pointer(doc.documentElement))))) return el
  let highest = el
  node = next(el)
  for (let depth = 0; node && depth < 64 && !top(node) && pointer(node); depth += 1, node = next(node)) highest = node
  return highest
}

/**
 * CU-336: a name for an <iframe>/<frame> element whose accessibility name could not be read - the words the page gives
 * it, in the order accessible names take them: the text of the elements its aria-labelledby names, its aria-label, then
 * its title. Never its name attribute: that is an id for scripts ('__privateStripeFrame5'), and an id taken as a name
 * would switch off the policy's unnamed-frame rule (cu-researcher's red team). Whitespace collapsed, at most 80
 * characters; null when there is none. Self-contained: it runs serialized in the page.
 */
export function frameLabel(el) {
  if (!el || el.nodeType !== 1) return null
  const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 80)
  const attr = (name) => (el.getAttribute ? el.getAttribute(name) : null)
  const doc = el.ownerDocument
  const ids = String(attr('aria-labelledby') || '').split(/\s+/).filter(Boolean)
  const labelled = clean(ids.map((id) => {
    const node = doc && doc.getElementById ? doc.getElementById(id) : null
    return node ? node.textContent : ''
  }).join(' '))
  return labelled || clean(attr('aria-label')) || clean(attr('title')) || null
}

/**
 * CU-336: the same order from a DOM.describeNode attribute list, for when the page script cannot run (the node does
 * not resolve): aria-label, then title - aria-labelledby needs the document and is skipped; never name. Null when
 * there is none.
 */
export function frameLabelFromAttributes(attributes = []) {
  const map = {}
  for (let index = 0; index + 1 < attributes.length; index += 2) map[attributes[index]] = attributes[index + 1]
  const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 80)
  return clean(map['aria-label']) || clean(map.title) || null
}

/**
 * CU-175: a name for a click target the accessibility tree leaves unnamed (a <div onclick> computes no name from its
 * content), so a target that shows words is never judged as nameless. Only for a target a click activates (a control,
 * an onclick handler or a pointer cursor) - plain reading text is not a control and keeps its own (empty) name. The
 * first aria-label, title or alt from the clicked node up to the target - or the words of the <label> the click came
 * through (CU-351) - else the target's visible text, at most 80 characters (a label is short); null when there is
 * none. Self-contained: it runs serialized in the page.
 */
export function clickLabel(hit, target) {
  const CONTROL_ROLES = ['button', 'link', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'checkbox', 'radio', 'switch',
    'option', 'treeitem']
  if (!target || target.nodeType !== 1) return null
  const attr = (node, name) => (node && node.getAttribute ? node.getAttribute(name) : null)
  const tag = String(target.tagName || '').toLowerCase()
  const view = target.ownerDocument && target.ownerDocument.defaultView
  const pointerOf = (node) => {
    try {
      return Boolean(view) && Boolean(node) && view.getComputedStyle(node).cursor === 'pointer'
    } catch {
      return false
    }
  }
  // As in activatableAncestor: a pointer cursor set on <body> or <html> is inherited by everything and says nothing.
  const doc = target.ownerDocument
  const pagePointer = Boolean(doc) && (pointerOf(doc.body) || pointerOf(doc.documentElement))
  const pointer = !pagePointer && pointerOf(target)
  const clickable = ['button', 'summary', 'select', 'input'].includes(tag) || (tag === 'a' && attr(target, 'href') !== null) ||
    CONTROL_ROLES.includes(String(attr(target, 'role') || '').toLowerCase()) || attr(target, 'onclick') !== null || pointer
  if (!clickable) return null
  const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 80)
  let node = hit
  for (let depth = 0; node && depth < 64; depth += 1) {
    if (node.nodeType === 1) {
      const label = clean(attr(node, 'aria-label') || attr(node, 'title') || (String(node.tagName || '').toLowerCase() === 'img' ? attr(node, 'alt') : ''))
      if (label) return label
      // The click came through a <label> of the target (activatableAncestor's label step): the label's words name it -
      // a display:none check box styled by its label has no accessibility name of its own (CU-351).
      if (String(node.tagName || '').toLowerCase() === 'label' && node.control === target) return clean(node.innerText || node.textContent) || null
    }
    if (node === target) break
    const root = node.getRootNode ? node.getRootNode() : null
    node = node.assignedSlot || node.parentElement || (root && root !== node && root.host) || null
  }
  return clean(target.innerText || target.textContent) || null
}

/**
 * CU-353: the key of an accesskey chord - Control-Option-<key> on a Mac (Shift allowed, never Command) fires the element
 * whose accesskey is that key, not the focused one (cu-researcher's probe, 9 Nov). The key in lower case, or null for any
 * other keypress. Keys arrive canonical (CTRL, ALT, SHIFT, META, a letter or digit); common aliases are accepted.
 */
export function accessKeyOf(action) {
  if (action?.type !== 'keypress' || !Array.isArray(action.keys)) return null
  const alias = { CONTROL: 'CTRL', OPTION: 'ALT', OPT: 'ALT', CMD: 'META', COMMAND: 'META' }
  const keys = action.keys.map((key) => { const upper = String(key).toUpperCase(); return alias[upper] ?? upper })
  if (!keys.includes('CTRL') || !keys.includes('ALT') || keys.includes('META')) return null
  const main = keys.filter((key) => !['CTRL', 'ALT', 'SHIFT'].includes(key))
  return main.length === 1 && /^[A-Z0-9]$/.test(main[0]) ? main[0].toLowerCase() : null
}

/**
 * CU-370: the option one key moves a focused native single <select> to - `{ index }` of that option; `{ unread: true }`
 * for Enter or Space (they open the popup or commit its highlight, which no page script can read, so the policy asks);
 * null for anything else, or when the value would not change. ArrowDown/ArrowUp: the next/previous enabled option;
 * Home/PageUp and End/PageDown: the first/last; a printable character: Chrome's type-ahead from the option after the
 * current one, wrapping. Self-contained: it runs serialized in the page.
 */
export function selectKeyOption(select, key) {
  if (!select || String(select.tagName || '').toUpperCase() !== 'SELECT' || select.multiple || select.disabled) return null
  const options = Array.from(select.options || [])
  const usable = (o) => Boolean(o) && !o.disabled && !(o.parentNode && String(o.parentNode.tagName || '').toUpperCase() === 'OPTGROUP' && o.parentNode.disabled)
  const label = (o) => String(o.label || o.text || '').replace(/\s+/g, ' ').trim().toLowerCase()
  const current = typeof select.selectedIndex === 'number' ? select.selectedIndex : -1
  const pick = (index) => (index >= 0 && index !== current ? { index } : null)
  if (key === 'Enter' || key === ' ') return { unread: true }
  if (key === 'ArrowDown') {
    for (let i = current + 1; i < options.length; i += 1) if (usable(options[i])) return pick(i)
    return null
  }
  if (key === 'ArrowUp') {
    for (let i = current - 1; i >= 0; i -= 1) if (usable(options[i])) return pick(i)
    return null
  }
  if (key === 'Home' || key === 'PageUp') return pick(options.findIndex(usable))
  if (key === 'End' || key === 'PageDown') {
    for (let i = options.length - 1; i >= 0; i -= 1) if (usable(options[i])) return pick(i)
    return null
  }
  if (typeof key === 'string' && key.length === 1) {
    const needle = key.toLowerCase()
    for (let k = 1; k <= options.length; k += 1) {
      const i = (((current + k) % options.length) + options.length) % options.length
      if (usable(options[i]) && label(options[i]).startsWith(needle)) return pick(i)
    }
  }
  return null
}

/**
 * CU-370: every option a typed string moves a focused native single <select> through, in order - Chrome's type-ahead
 * accumulates the prefix ('Del' reaches Delete, not Details by 'D' then 'e'), each step selects (and may fire change),
 * so each step's option counts (cu-researcher). A prefix of one repeated character cycles through that character's
 * options. Indices without repeats; [] when nothing matches; null when the element is no such select. Self-contained.
 */
export function selectTypeOptions(select, text) {
  if (!select || String(select.tagName || '').toUpperCase() !== 'SELECT' || select.multiple || select.disabled) return null
  const options = Array.from(select.options || [])
  const usable = (o) => Boolean(o) && !o.disabled && !(o.parentNode && String(o.parentNode.tagName || '').toUpperCase() === 'OPTGROUP' && o.parentNode.disabled)
  const label = (o) => String(o.label || o.text || '').replace(/\s+/g, ' ').trim().toLowerCase()
  let current = typeof select.selectedIndex === 'number' ? select.selectedIndex : -1
  let prefix = ''
  const landed = []
  for (const ch of String(text ?? '')) {
    prefix += ch.toLowerCase()
    const repeated = prefix.length > 1 && Array.from(prefix).every((c) => c === prefix[0])
    const needle = repeated ? prefix[0] : prefix
    const from = prefix.length === 1 || repeated ? current + 1 : current
    for (let k = 0; k < options.length; k += 1) {
      const i = (((from + k) % options.length) + options.length) % options.length
      if (usable(options[i]) && label(options[i]).startsWith(needle)) {
        current = i
        if (!landed.includes(i)) landed.push(i)
        break
      }
    }
  }
  return landed
}

/**
 * CU-370: what one plain key on the focused element `el` chooses - the element it would select or check (an option of a
 * native select via `selectKeyOption`, which the caller passes in, as this runs serialized; the next or previous radio
 * of the group; the ARIA listbox/combobox option it moves to or commits), the string 'unread' when a choice changes but
 * cannot be read (Enter/Space on a select, PageUp/PageDown, any navigation in a multiple or size>1 select), or null when
 * the key chooses nothing here. ArrowLeft/ArrowRight count as ArrowUp/ArrowDown (a safe over-ask where the platform
 * ignores them; cu-researcher). Radios: one name in one form (or none), wrapping, skipping disabled ones; ARIA radios
 * in their radiogroup, skipping aria-disabled. ARIA listbox: its role=option elements; a combobox's via aria-controls
 * or aria-owns; aria-activedescendant names the current one, else the focused option itself. Self-contained.
 */
export function keyChoice(el, key, selectKeyOptionFn) {
  if (!el || typeof key !== 'string') return null
  const tag = String(el.tagName || '').toUpperCase()
  const attr = (node, name) => (node && typeof node.getAttribute === 'function' ? node.getAttribute(name) : null)
  const role = String(attr(el, 'role') || '').toLowerCase()
  const forward = key === 'ArrowDown' || key === 'ArrowRight'
  const backward = key === 'ArrowUp' || key === 'ArrowLeft'
  const navigation = forward || backward || ['Home', 'End', 'PageUp', 'PageDown'].includes(key)
  const step = (list, current) => {
    if (list.length === 0) return null
    if (key === 'Home') return list[0]
    if (key === 'End') return list[list.length - 1]
    if (current < 0) return forward ? list[0] : backward ? list[list.length - 1] : null
    if (forward) return list[(current + 1) % list.length]
    if (backward) return list[(current - 1 + list.length) % list.length]
    return null
  }
  if (tag === 'SELECT') {
    if (el.disabled) return null
    if (el.multiple || Number(el.size) > 1) return navigation || key === ' ' || key === 'Enter' || key.length === 1 ? 'unread' : null
    if (key === 'PageUp' || key === 'PageDown') return 'unread'
    const moved = selectKeyOptionFn(el, key === 'ArrowRight' ? 'ArrowDown' : key === 'ArrowLeft' ? 'ArrowUp' : key)
    if (moved === null) return null
    return moved.unread ? 'unread' : el.options[moved.index]
  }
  if (tag === 'INPUT' && String(el.type || '').toLowerCase() === 'radio') {
    if (!(forward || backward) || !el.name) return null
    const pool = el.form ? Array.from(el.form.elements || []) : Array.from(el.ownerDocument ? el.ownerDocument.querySelectorAll('input') : [])
    const group = pool.filter((r) => String(r.tagName || '').toUpperCase() === 'INPUT' && String(r.type || '').toLowerCase() === 'radio' && r.name === el.name && (r.form || null) === (el.form || null) && (r === el || !r.disabled))
    const next = step(group, group.indexOf(el))
    return next && next !== el ? next : null
  }
  if (role === 'radio') {
    if (!(forward || backward)) return null
    const box = typeof el.closest === 'function' ? el.closest('[role="radiogroup"]') : null
    if (!box) return null
    const group = Array.from(box.querySelectorAll('[role="radio"]')).filter((r) => r === el || attr(r, 'aria-disabled') !== 'true')
    const next = step(group, group.indexOf(el))
    return next && next !== el ? next : null
  }
  const doc = el.ownerDocument
  const byId = (id) => {
    if (!id) return null
    const root = typeof el.getRootNode === 'function' ? el.getRootNode() : null
    return (root && typeof root.getElementById === 'function' ? root.getElementById(id) : null) || (doc ? doc.getElementById(id) : null)
  }
  let box = null
  let current = null
  if (role === 'listbox') box = el
  else if (role === 'combobox') box = byId(String(attr(el, 'aria-controls') || attr(el, 'aria-owns') || '').split(/\s+/)[0]) || el
  else if (role === 'option') {
    box = typeof el.closest === 'function' ? el.closest('[role="listbox"]') : null
    current = el
  }
  if (!box || typeof box.querySelectorAll !== 'function') return null
  // An aria-multiselectable listbox acts on every selected option at once - the ARIA twin of a multiple select: unread
  // for any key that may change or commit the selection (cu-researcher 22:13Z).
  if (attr(box, 'aria-multiselectable') === 'true') return navigation || key === 'Enter' || key === ' ' || key.length === 1 ? 'unread' : null
  const options = Array.from(box.querySelectorAll('[role="option"]')).filter((o) => attr(o, 'aria-disabled') !== 'true')
  if (current === null) current = byId(attr(el, 'aria-activedescendant'))
  // Pages that mark the active option without aria-activedescendant: the selected one, else a focused option inside.
  if (current === null || !options.includes(current)) current = options.find((o) => attr(o, 'aria-selected') === 'true') || options.find((o) => doc && o === doc.activeElement) || null
  const index = current ? options.indexOf(current) : -1
  if (key === 'Enter') return role === 'option' ? null : index >= 0 ? options[index] : null
  if (!navigation || key === 'PageUp' || key === 'PageDown') return navigation ? 'unread' : null
  const next = step(options, index)
  return next && next !== current ? next : null
}

/**
 * CU-353: the first element whose accesskey names `key` (any of its space-separated keys, any case), or null - the
 * document in order, then each open shadow root (a web component's accesskey button; cu-researcher). Other frames and
 * closed roots are not searched (a named limit). Several elements on one key: Chrome moves the focus among them rather
 * than firing one, so judging the first as pressed only over-asks. Self-contained: it runs serialized in the page.
 */
export function accessKeyElement(doc, key) {
  const want = String(key).toLowerCase()
  const roots = [doc]
  for (let i = 0; i < roots.length && i < 256; i += 1) {
    for (const el of roots[i].querySelectorAll('*')) {
      const keys = String((el.getAttribute && el.getAttribute('accesskey')) || '').trim().toLowerCase().split(/\s+/)
      if (keys.includes(want)) return el
      if (el.shadowRoot) roots.push(el.shadowRoot)
    }
  }
  return null
}

/** Resolves after two animation frames, so a screenshot shows the frame the last input produced. */
/**
 * CU-300: the focus inside a frame document, read through the frame's own session - deepActiveElement's answer, or,
 * when that is nothing, the document's body if it takes text (an iframe editor: contentEditable or designMode).
 * Composed here because a page function runs serialized, without this module.
 */
export const FRAME_FOCUS_EXPRESSION = `(() => { const found = (${deepActiveElement.toString()})(document); if (found) return found; const body = document.body; return body && (body.isContentEditable || document.designMode === 'on') ? body : null })()`

export const TWO_FRAMES_EXPRESSION = 'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))'

/** The expression form of a page function applied to the page's own `document` and `window`. */
/**
 * CU-187: the element holding the page's selection when no text entry has the focus - the copy source of selected static
 * text (a value on a profile page), whose caption names what it is. Through focused same-origin frames, as
 * deepActiveElement. Null when an entry or a rich editor holds the focus or the selection (its text is that entry's,
 * judged by its name as today), when nothing is selected, or when the selection's container is the whole page.
 * Self-contained: it runs serialized in the page.
 */
export function selectionContainer(doc) {
  let d = doc
  for (let depth = 0; d && depth < 20; depth += 1) {
    const active = d.activeElement
    const tag = active ? String(active.tagName || '').toUpperCase() : ''
    if (tag !== 'IFRAME' && tag !== 'FRAME') break
    let inner = null
    try {
      inner = active.contentDocument
    } catch {
      inner = null
    }
    if (!inner) break
    d = inner
  }
  if (!d || typeof d.getSelection !== 'function') return null
  const active = d.activeElement
  if (active && active !== d.body && active !== d.documentElement) {
    const tag = String(active.tagName || '').toLowerCase()
    if (tag === 'input' || tag === 'textarea' || active.isContentEditable) return null
  }
  const selection = d.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null
  let node = selection.getRangeAt(0).commonAncestorContainer
  if (node && node.nodeType !== 1) node = node.parentElement
  if (!node || node === d.body || node === d.documentElement || node.isContentEditable) return null
  for (let n = node; n; n = n.parentElement) {
    const tag = String(n.tagName || '').toLowerCase()
    if (tag === 'input' || tag === 'textarea') return null
  }
  return node
}

/** CU-198: the longest drag text handed to the value rules - the policy's bound for any text it judges (cu-developer-one). */
export const DRAG_TEXT_MAX = 4096

/**
 * CU-198: the text a drag pressed at viewport (x, y) would carry, so a drag of selected text meets the value rules a
 * paste of it does (a card number shown in a paragraph has no caption, and once drags deliver - CU-197 - it would land
 * in a form unasked). Chrome drags a selection only when the press lands on it, so: a focused input's or textarea's
 * selected substring when the point is inside its box (never a password field - browsers do not drag it, and its
 * value is never read here); else the page selection when one of its ranges' client rects holds the point, descending
 * focused same-origin frames with their offsets; else null. Returned to the caller and never recorded.
 */
export function dragTextAt(doc, win, x, y, max) {
  let d = doc
  let ox = 0
  let oy = 0
  for (let depth = 0; d && depth < 20; depth += 1) {
    const active = d.activeElement
    const tag = active ? String(active.tagName || '').toUpperCase() : ''
    if (tag !== 'IFRAME' && tag !== 'FRAME') break
    let inner = null
    try {
      inner = active.contentDocument
    } catch {
      inner = null
    }
    if (!inner) break
    const box = active.getBoundingClientRect()
    ox += box.left + (active.clientLeft || 0)
    oy += box.top + (active.clientTop || 0)
    d = inner
  }
  if (!d) return null
  const px = x - ox
  const py = y - oy
  const holds = (r) => px >= r.left && px <= r.right && py >= r.top && py <= r.bottom
  const active = d.activeElement
  const tag = active ? String(active.tagName || '').toLowerCase() : ''
  if (tag === 'input' || tag === 'textarea') {
    if (String(active.type || '').toLowerCase() === 'password') return null
    let start = null
    let end = null
    try {
      start = active.selectionStart
      end = active.selectionEnd
    } catch {
      return null
    }
    if (typeof start !== 'number' || typeof end !== 'number' || end <= start || !holds(active.getBoundingClientRect())) return null
    return String(active.value).slice(start, end).slice(0, max)
  }
  if (typeof d.getSelection !== 'function') return null
  const selection = d.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null
  for (let i = 0; i < selection.rangeCount; i += 1) {
    for (const r of selection.getRangeAt(i).getClientRects()) {
      if (holds(r)) {
        const text = String(selection)
        return text === '' ? null : text.slice(0, max)
      }
    }
  }
  return null
}

export function pageExpression(fn, ...args) {
  return `(${fn.toString()})(document, window${args.map((arg) => `, ${JSON.stringify(arg)}`).join('')})`
}

const ENTRY_INPUT_TYPES = ['text', 'search', 'email', 'url', 'tel', 'password', 'file']

/**
 * CU-157: whether a CLOSED shadow root in a protocol node tree (DOM.describeNode with pierce) holds a text entry - an
 * input of a text-like type, a textarea, a contenteditable, a role=textbox / aria-multiline element, or a canvas. textEntered
 * cannot see into closed roots; one that holds an entry is a part of the page left unread, so the driver turns a
 * 'false' into unknown. User-agent roots (inside native inputs) are not closed roots. Runs in Node, not the page.
 */
export function closedRootHoldsEntry(tree) {
  const attrsOf = (node) => {
    const attrs = {}
    const list = node.attributes ?? []
    for (let index = 0; index + 1 < list.length; index += 2) attrs[list[index]] = list[index + 1]
    return attrs
  }
  const isEntry = (node) => {
    const name = String(node.nodeName ?? '').toUpperCase()
    const attrs = attrsOf(node)
    if (name === 'TEXTAREA' || name === 'CANVAS') return true
    if (name === 'INPUT') return ENTRY_INPUT_TYPES.includes(String(attrs.type ?? 'text').toLowerCase())
    const editable = attrs.contenteditable
    if (editable !== undefined && String(editable).toLowerCase() !== 'false') return true
    return attrs.role === 'textbox' || attrs['aria-multiline'] === 'true'
  }
  const holdsEntry = (node, depth) => {
    if (!node || depth > 200) return depth > 200
    if (isEntry(node)) return true
    for (const child of node.children ?? []) if (holdsEntry(child, depth + 1)) return true
    for (const root of node.shadowRoots ?? []) if (holdsEntry(root, depth + 1)) return true
    return node.contentDocument ? holdsEntry(node.contentDocument, depth + 1) : false
  }
  const walk = (node, depth) => {
    if (!node || depth > 200) return depth > 200
    for (const root of node.shadowRoots ?? []) {
      if (root.shadowRootType === 'closed' && holdsEntry(root, depth + 1)) return true
      if (walk(root, depth + 1)) return true
    }
    for (const child of node.children ?? []) if (walk(child, depth + 1)) return true
    return node.contentDocument ? walk(node.contentDocument, depth + 1) : false
  }
  return walk(tree, 0)
}
