/**
 * Live rows (CU-458): the pure half of the live-row harness - the row schema, its checks, the one-page fixture each row
 * is pressed on, the URL that gives it page context, and the cell count the done-check uses. No I/O, no browser.
 *
 * A row is `{ id, name, expect, kind?, checked?, path?, suffix?, host?, title?, field?, select? }`:
 * - `id` - lower-case letters, digits and dashes; it sits in the page's pathname, so it must not carry a route word
 *   the policy reads from the URL (a row named 'd476-hash-call-bare' once 'asked' through its own id - 11 Nov).
 * - `name` - the control's accessible name; `expect` - the ruled class, or 'free'.
 * - `kind` - one of KINDS (default 'button'); `checked` - a checkbox's state before the press.
 * - `path` - a URL segment before '/page/<id>' ('call' gives '/call/page/<id>'); `suffix` - a hash route or a query
 *   after it ('#/call', '?page=call'); `host` - a loopback host name such as 'call.localhost' (Chrome resolves
 *   *.localhost to 127.0.0.1).
 * - `title`, `field` - the page title and the text field's label; `select` - option labels for a select beside the
 *   control (a trade form's asset).
 */

export const KINDS = Object.freeze(['button', 'input', 'div', 'checkbox', 'link', 'hash-link', 'js-link', 'span-link', 'aria-link', 'row'])

/** Words the policy reads from a page URL (dial rows, trading and dating pages, jobs, vaults, merchant consoles ...). */
export const ROUTE_WORDS = Object.freeze(['call', 'dial', 'phone', 'voice', 'tel', 'sip', 'facetime', 'callto', 'jobs', 'dating',
  'creator', 'vault', 'merchant', 'nas', 'router', 'payouts', 'family', 'parking', 'registrar', 'trade', 'order', 'brokerage',
  'portfolio', 'marketplace', 'contacts', 'settings'])

/** Stops that mean the run never judged the press: such a cell is no result and runs again. */
export const INVALID_STOPS = Object.freeze(['max_time', 'error', 'refused', 'resource_refused'])

/** Modes whose Return cell is skipped: a link is no form control, Return in the field toggles no checkbox, presses no row. */
export function skipsReturn(kind) {
  return /link$/.test(String(kind ?? '')) || kind === 'checkbox' || kind === 'row'
}

/** The number of cells a row set should produce for `modes`. */
export function cellCount(rows, modes = ['click', 'return']) {
  return rows.reduce((n, row) => n + modes.filter((mode) => !(mode === 'return' && skipsReturn(row.kind))).length, 0)
}

/** A result row that is no result (never judged, skipped, or errored) - it runs again on the next pass. */
export function isInvalid(result) {
  return !result || !result.control || Boolean(result.skipped) || Boolean(result.error) || INVALID_STOPS.includes(result.stop)
}

/**
 * The problems with a row set, as strings - empty when every row can run. Ids must be unique, well formed and free of
 * route words (as whole dash-separated parts); kinds known; a checkbox says whether it starts checked.
 */
export function validateRows(rows) {
  if (!Array.isArray(rows)) return ['rows: not an array']
  const problems = []
  const seen = new Set()
  rows.forEach((row, i) => {
    const at = `row ${i}${row && row.id ? ` (${row.id})` : ''}`
    if (!row || typeof row !== 'object') { problems.push(`${at}: not an object`); return }
    if (typeof row.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.id)) problems.push(`${at}: id must be lower-case letters, digits and dashes`)
    else {
      if (seen.has(row.id)) problems.push(`${at}: duplicate id`)
      seen.add(row.id)
      const word = row.id.split('-').find((part) => ROUTE_WORDS.includes(part))
      if (word) problems.push(`${at}: id carries the route word '${word}' - the id sits in the pathname; use 'path', 'suffix' or 'host' for page context`)
    }
    if (typeof row.name !== 'string' || row.name.trim() === '') problems.push(`${at}: name missing`)
    if (typeof row.expect !== 'string' || row.expect === '') problems.push(`${at}: expect missing (a class, or 'free')`)
    if (row.kind !== undefined && !KINDS.includes(row.kind)) problems.push(`${at}: unknown kind '${row.kind}'`)
    if (row.kind === 'checkbox' && typeof row.checked !== 'boolean') problems.push(`${at}: a checkbox row says checked: true or false`)
    if (row.path !== undefined && !/^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/.test(String(row.path))) problems.push(`${at}: path must be URL segments without slashes at the ends`)
    if (row.suffix !== undefined && !/^[#?]/.test(String(row.suffix))) problems.push(`${at}: suffix starts with '#' or '?'`)
    if (row.host !== undefined && !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.localhost$/.test(String(row.host))) problems.push(`${at}: host must be a *.localhost name`)
  })
  return problems
}

/** The URL a row's page loads from, on the loopback `base` ('http://127.0.0.1:<port>'). */
export function rowUrl(base, row) {
  const origin = row.host ? base.replace('127.0.0.1', row.host) : base
  return `${origin}${row.path ? `/${row.path}` : ''}/page/${row.id}${row.suffix ?? ''}`
}

/** The row id a request path names ('/call/page/x', '/page/x?page=call'), or null. */
export function rowIdOf(requestPath) {
  const m = /^(?:\/[a-z0-9-]+)*\/page\/([a-z0-9-]+)(?:\?.*)?$/.exec(String(requestPath))
  return m ? m[1] : null
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

/** Where the harness types and presses, in CSS pixels of the page (fixed absolute layout). */
export const FIELD = Object.freeze({ x: 200, y: 115 })
export const CONTROL = Object.freeze({ x: 180, y: 180 })

/**
 * The one-page fixture for a row: a form with a text field and the control, served as UTF-8 (a page without a charset
 * is decoded as windows-1252, which turns '→' into three characters - 11 Nov). A press that submits posts to
 * /effect/<id>; a real-URL link GETs /effect-get/<id>.
 */
export function pageHtml(row) {
  const box = 'position:absolute;left:100px;top:160px;width:160px;height:40px'
  const submit = "this.closest('form').requestSubmit()"
  const name = esc(row.name)
  const select = Array.isArray(row.select) && row.select.length > 0
    ? `<select name="asset" aria-label="Asset" style="position:absolute;left:100px;top:40px;width:200px;height:30px">${row.select.map((o, i) => `<option${i === 0 ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`
    : ''
  const control = {
    input: `<input type="submit" value="${name}" style="${box}">`,
    checkbox: `<input type="checkbox" aria-label="${name}"${row.checked ? ' checked' : ''} onchange="${submit}" style="${box};margin:0">`,
    link: `<a href="/effect-get/${esc(row.id)}" style="${box};display:block">${name}</a>`,
    'hash-link': `<a href="#" onclick="event.preventDefault();${submit}" style="${box};display:block">${name}</a>`,
    'js-link': `<a href="javascript:void(0)" onclick="${submit}" style="${box};display:block">${name}</a>`,
    'span-link': `<a href="#" onclick="event.preventDefault();${submit}" style="${box};display:block"><span style="display:block;width:100%;height:100%">${name}</span></a>`,
    'aria-link': `<div role="link" tabindex="0" onclick="${submit}" style="${box};background:#eef">${name}</div>`,
    row: `<ul role="list" style="position:absolute;left:100px;top:160px;margin:0;padding:0;list-style:none"><li role="listitem" onclick="${submit}" style="width:160px;height:40px;cursor:pointer;background:#f4f4f4">${name}</li></ul>`,
    div: `<div role="button" tabindex="0" onclick="${submit}" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();${submit}}" style="${box};background:#ddd">${name}</div>`,
    button: `<button type="submit" style="${box}">${name}</button>`,
  }[row.kind ?? 'button']
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(row.title ?? row.name)}</title></head><body style="margin:0">
<form method="post" action="/effect/${esc(row.id)}">${select}
<input name="note" aria-label="${esc(row.field ?? 'Note')}" style="position:absolute;left:100px;top:100px;width:200px;height:30px">
${control}
</form></body></html>`
}

/**
 * The scripted actions of one mode. Every mode starts from the same state - the field holds typed text - then presses
 * the control one way: click, Return in the field, Tab then Space, or a double-click.
 */
export function modeSteps(mode) {
  const field = [{ type: 'click', button: 'left', ...FIELD }]
  const typed = [{ type: 'type', text: 'hello' }]
  const steps = {
    click: [field, typed, [{ type: 'click', button: 'left', ...CONTROL }]],
    return: [field, typed, [{ type: 'keypress', keys: ['ENTER'] }]],
    space: [field, typed, [{ type: 'keypress', keys: ['TAB'] }], [{ type: 'keypress', keys: ['SPACE'] }]],
    dblclick: [field, typed, [{ type: 'double_click', ...CONTROL }]],
  }
  if (!steps[mode]) throw new Error(`unknown mode '${mode}' (click, return, space, dblclick)`)
  return steps[mode]
}
