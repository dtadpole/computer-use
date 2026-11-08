/**
 * Shared HTML for the fixture pages: escaping, the document layout, the in-page reporter, the index and the
 * error page. Each task family module renders its own pages with these. Nothing is read from disk, so the
 * server cannot be made to serve a file it was not written to serve.
 *
 * The reporter posts the page's observable state to `/__fixture/report` on load and on every change,
 * together with the viewport boxes of every `[data-target]` element. The agent cannot call it: it acts
 * only through screenshots, mouse and keyboard, and the endpoint accepts only POSTed JSON, which a
 * navigation cannot produce. Target boxes are for the verifier's harness (oracle plans), never for the
 * agent's model.
 */

/** Escape text for an HTML text node or a quoted attribute. */
export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** JSON that is safe inside an inline `<script>`: no `<`, and no line separators that end a string. */
export function jsonForScript(value) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')
}

const STYLE = `
*{box-sizing:border-box}
html{background:#f5f5f7}
body{margin:0;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;color:#1d1d1f}
main{max-width:720px;margin:48px auto;padding:32px;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.15)}
h1{margin:0 0 16px;font-size:28px;line-height:1.2}
h2{margin:0 0 8px;font-size:18px}
button,.button{font:inherit;padding:8px 16px;border-radius:8px;border:1px solid #005bb5;background:#0071e3;color:#fff;cursor:pointer;display:inline-block;text-decoration:none}
button.secondary,.button.secondary{background:#fff;color:#0071e3}
button.danger{background:#d70015;border-color:#a3000f}
input[type=text],input[type=search],input[type=email],input[type=password],input:not([type]),select,textarea{font:inherit;padding:8px 12px;border:1px solid #c7c7cc;border-radius:8px;min-width:260px;background:#fff}
textarea{min-height:96px;width:100%}
label{display:inline-flex;gap:8px;align-items:center}
.field{display:block;margin:0 0 12px}
.field>span{display:block;font-weight:600;margin-bottom:4px}
summary{cursor:pointer;font-weight:600;padding:8px 0;color:#0071e3}
output{display:block;margin-top:16px;font-weight:600;min-height:24px}
.toolbar{display:flex;gap:12px;align-items:center;margin-bottom:16px}
.panel{border:1px solid #d2d2d7;border-radius:8px;padding:16px;margin-bottom:16px;background:#fafafa}
.panel fieldset{border:0;padding:0;margin:0;display:flex;gap:16px}
ul.results{list-style:none;padding:0;margin:0}
ul.results li{padding:6px 0;border-bottom:1px solid #eee}
table{border-collapse:collapse;width:100%}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #eee}
.muted{color:#6e6e73}
a{color:#0071e3}
`

/** A whole document. `script` and `head` are trusted code written in this package. */
export function layout({ title, body, script = '', head = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
${head}</head>
<body>
${body}
${script ? `<script>\n${script}\n</script>` : ''}
</body>
</html>
`
}

/**
 * The reporter a task page carries. Defines `report(facts)`: with facts it replaces the page's state, without
 * them it resends the last state with fresh target boxes (on scroll and resize, once per frame). Inside a
 * same-origin iframe, boxes are shifted into the top page's viewport.
 */
export function reporterScript(taskId) {
  return `const TASK = ${jsonForScript(taskId)}
const loadId = (self.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)
const origin = performance.timeOrigin
let seq = 0
let lastFacts = {}
const round1 = (value) => Math.round(value * 10) / 10
function measureTargets() {
  const frame = window.frameElement
  const box = frame ? frame.getBoundingClientRect() : null
  const dx = frame ? box.x + frame.clientLeft : 0
  const dy = frame ? box.y + frame.clientTop : 0
  const out = {}
  for (const element of document.querySelectorAll('[data-target]')) {
    // A wrapped inline element's bounding box can have its centre between the lines; its first line box cannot.
    const lines = element.getClientRects ? element.getClientRects() : []
    const rect = lines.length > 1 ? lines[0] : element.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) continue
    out[element.dataset.target] = [round1(rect.x + dx), round1(rect.y + dy), round1(rect.width), round1(rect.height)]
  }
  return out
}
function report(facts) {
  if (facts !== undefined) lastFacts = facts
  seq += 1
  const top = window.top
  const body = JSON.stringify({ task: TASK, loadId, origin, seq, facts: lastFacts, targets: measureTargets(),
    viewport: [top.innerWidth, top.innerHeight, top.scrollX, top.scrollY, top.devicePixelRatio] })
  return fetch('/__fixture/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {})
}
let layoutQueued = false
function reportLayout() {
  if (layoutQueued) return
  layoutQueued = true
  requestAnimationFrame(() => { layoutQueued = false; report() })
}
addEventListener('scroll', reportLayout, { passive: true })
addEventListener('resize', reportLayout)
if (window.top !== window) window.top.addEventListener('scroll', reportLayout, { passive: true })`
}

/** A task page: the layout plus the reporter and the page's own script. */
export function taskPage(taskId, { title, body, script = '', head = '' }) {
  return layout({ title, body, head, script: `${reporterScript(taskId)}\n${script}` })
}

/** The index a person sees at `/`: the tasks and their start pages, no expected values. */
export function renderIndex(descriptions) {
  const rows = descriptions
    .map((task) => `<li><a href="${escapeHtml(new URL(task.url).pathname)}">${escapeHtml(task.title)}</a> <span class="muted">${escapeHtml(task.id)} - ${escapeHtml(task.kind)}</span></li>`)
    .join('\n')
  return layout({
    title: 'Computer-use fixture site',
    body: `<main>
<h1>Computer-use fixture site</h1>
<p class="muted">Local tasks with machine-checkable outcomes.</p>
<ul class="results">
${rows}
</ul>
</main>`,
  })
}

/** A plain error page. */
export function renderError(status, message) {
  return layout({ title: `${status}`, body: `<main><h1>${escapeHtml(status)}</h1><p>${escapeHtml(message)}</p></main>` })
}
