/**
 * Interaction tasks: each needs one input skill the computer-use action set offers - closing a modal,
 * scrolling to find, dragging with the pointer, a slider, hovering, double-clicking, a keyboard shortcut and
 * a right-click menu. Drag uses pointer events, which CDP mouse input produces (measured 2026-11-01).
 */

import { defineTask, NO_PAGE_REPORT, text, verdict } from './common.mjs'
import { escapeHtml, jsonForScript, taskPage } from './pages.mjs'
import { pick, randomInt } from './seed.mjs'

const SOURCE = 'cu-verifier fixture suite, responsibilities item 2 (modals, scroll-to-find, drag and drop, keyboard shortcuts)'
const sameList = (a, b) => Array.isArray(a) && a.length === b.length && a.every((item, index) => item === b[index])

export const ARTICLES = Object.freeze(['Winter cycling tips', 'How to repot a fern', 'A guide to sourdough', 'Budgeting for a move', 'Night photography basics'])

const dismissModal = defineTask({
  id: 'dismiss-modal',
  kind: 'task',
  title: 'Close a popup, then open an article',
  source: SOURCE,
  prompt: (e) => `Close the newsletter popup without subscribing, then open the article "${ARTICLES[e.article]}".`,
  expect: (rng) => ({ article: randomInt(rng, 0, ARTICLES.length - 1) }),
  evaluate(facts, e) {
    const records = facts?.records ?? []
    if (records.some((r) => r.kind === 'subscription')) return verdict(false, 'the newsletter was subscribed to')
    const visits = records.filter((r) => r.kind === 'visit')
    if (visits.length === 0) return verdict(false, 'no article was opened')
    const last = visits.at(-1)
    if (last.article !== e.article) return verdict(false, `the article opened was ${JSON.stringify(ARTICLES[last.article] ?? last.article)}`)
    return verdict(true, `the article ${JSON.stringify(ARTICLES[e.article])} was opened without subscribing`)
  },
  render: () =>
    taskPage('dismiss-modal', {
      title: 'The Daily Read',
      head: '<style>.overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:10}.modal{background:#fff;border-radius:12px;padding:28px;width:420px;position:relative}.modal .x{position:absolute;top:8px;right:8px;background:#fff;color:#1d1d1f;border:0;font-size:22px;padding:4px 10px}</style>',
      body: `<main>
<h1>The Daily Read</h1>
<ul class="results">
${ARTICLES.map((title, index) => `<li><a href="/tasks/dismiss-modal/article/${index}" data-target="article-${index}">${escapeHtml(title)}</a></li>`).join('\n')}
</ul>
</main>
<div class="overlay" id="overlay" role="dialog" aria-modal="true" aria-label="Newsletter">
<div class="modal"><button class="x" id="close" aria-label="Close" data-target="close">&times;</button>
<h2>Get our newsletter</h2><p>One email a week with our best stories.</p>
<p><button id="subscribe" type="button" data-target="subscribe">Subscribe</button> <button id="no-thanks" class="secondary" type="button" data-target="no-thanks">No thanks</button></p></div></div>`,
      script: `const overlay = document.getElementById('overlay')
const send = () => report({ modalOpen: !overlay.hidden && overlay.style.display !== 'none' })
const close = () => { overlay.style.display = 'none'; send() }
document.getElementById('close').addEventListener('click', close)
document.getElementById('no-thanks').addEventListener('click', close)
document.getElementById('subscribe').addEventListener('click', () => {
  fetch('/tasks/dismiss-modal/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).finally(close)
})
send()`,
    }),
  routes: {
    'POST subscribe': ({ addRecord }) => {
      addRecord({ kind: 'subscription' })
      return { json: { ok: true } }
    },
    'GET article/:n': ({ params, addRecord }) => {
      const article = Number(params.n)
      if (!Number.isInteger(article) || !ARTICLES[article]) return { status: 404, html: taskPage('dismiss-modal', { title: 'Not found', body: '<main><h1>Not found</h1></main>' }) }
      addRecord({ kind: 'visit', article })
      return { html: taskPage('dismiss-modal', { title: ARTICLES[article], body: `<main><h1>${escapeHtml(ARTICLES[article])}</h1><p>Article text.</p></main>`, script: `report({ article: ${article} })` }) }
    },
  },
})

const COLORS = ['Amber', 'Azure', 'Coral', 'Crimson', 'Indigo', 'Jade', 'Olive', 'Slate']
const ITEMS = ['Backpack', 'Kettle', 'Lamp', 'Notebook', 'Umbrella']
/** Forty distinct product names, in page order. */
export const PRODUCTS = Object.freeze(ITEMS.flatMap((item) => COLORS.map((color) => `${color} ${item}`)))

const scrollToFind = defineTask({
  id: 'scroll-to-find',
  kind: 'task',
  title: 'Find a product far down a long list',
  source: SOURCE,
  prompt: (e) => `Add the "${PRODUCTS[e.product]}" to your wishlist.`,
  expect: (rng) => ({ product: randomInt(rng, 28, PRODUCTS.length - 1) }),
  evaluate(facts, e) {
    const page = facts?.page
    if (!page) return verdict(false, NO_PAGE_REPORT)
    const list = Array.isArray(page.wishlist) ? page.wishlist : []
    if (sameList(list, [e.product])) return verdict(true, `the wishlist holds only ${PRODUCTS[e.product]}`)
    if (list.length === 0) return verdict(false, 'the wishlist is empty')
    return verdict(false, `the wishlist holds ${list.map((index) => PRODUCTS[index] ?? index).join(', ')}`)
  },
  render: () =>
    taskPage('scroll-to-find', {
      title: 'Catalogue',
      head: '<style>.product{display:flex;justify-content:space-between;align-items:center;padding:20px 0;border-bottom:1px solid #eee}</style>',
      body: `<main>
<h1>Catalogue</h1>
<p class="muted">${PRODUCTS.length} products. <span id="count">Wishlist: 0</span></p>
${PRODUCTS.map((name, index) => `<div class="product"><span>${escapeHtml(name)}</span><button type="button" class="secondary wish" data-index="${index}" data-target="wish-${index}">Add to wishlist</button></div>`).join('\n')}
</main>`,
      script: `const wishlist = []
const send = () => report({ wishlist })
for (const button of document.querySelectorAll('.wish')) button.addEventListener('click', () => {
  const index = Number(button.dataset.index)
  const at = wishlist.indexOf(index)
  if (at >= 0) { wishlist.splice(at, 1); button.textContent = 'Add to wishlist' } else { wishlist.push(index); button.textContent = 'In wishlist' }
  document.getElementById('count').textContent = 'Wishlist: ' + wishlist.length
  send()
})
send()`,
    }),
})

export const CARDS = Object.freeze(['Write report', 'Review budget', 'Plan offsite', 'Update roadmap'])
const INITIAL_COLUMNS = Object.freeze({ todo: [0, 1], progress: [2], done: [3] })

const dragCard = defineTask({
  id: 'drag-card',
  kind: 'task',
  title: 'Drag a card to another column',
  source: SOURCE,
  prompt: (e) => `Move the card "${CARDS[e.card]}" to the Done column.`,
  expect: (rng) => ({ card: pick(rng, [0, 1, 2]) }),
  evaluate(facts, e) {
    const page = facts?.page
    if (!page) return verdict(false, NO_PAGE_REPORT)
    const columns = { todo: page.todo ?? [], progress: page.progress ?? [], done: page.done ?? [] }
    if (!columns.done.includes(e.card)) return verdict(false, `${JSON.stringify(CARDS[e.card])} is not in Done`)
    for (const [column, cards] of Object.entries(INITIAL_COLUMNS)) {
      for (const card of cards) {
        if (card !== e.card && !columns[column].includes(card)) return verdict(false, `${JSON.stringify(CARDS[card])} was moved too`)
      }
    }
    return verdict(true, `${JSON.stringify(CARDS[e.card])} is in Done and nothing else moved`)
  },
  render: () => {
    const column = (key, title) => `<section class="column" data-column="${key}" data-target="column-${key}"><h2>${title}</h2>
${INITIAL_COLUMNS[key].map((card) => `<div class="card" data-card="${card}" data-target="card-${card}">${escapeHtml(CARDS[card])}</div>`).join('\n')}
</section>`
    return taskPage('drag-card', {
      title: 'Team board',
      head: '<style>.board{display:flex;gap:12px}.column{flex:1;min-height:260px;background:#f2f2f7;border-radius:8px;padding:8px}.card{background:#fff;border:1px solid #d2d2d7;border-radius:6px;padding:12px;margin:8px 0;cursor:grab;user-select:none;touch-action:none}.card.dragging{position:fixed;pointer-events:none;opacity:.85;z-index:5}</style>',
      body: `<main style="max-width:860px">
<h1>Team board</h1>
<div class="board">${column('todo', 'To do')}${column('progress', 'In progress')}${column('done', 'Done')}</div>
</main>`,
      script: `const columns = () => Object.fromEntries([...document.querySelectorAll('.column')].map((c) => [c.dataset.column, [...c.querySelectorAll('.card')].map((card) => Number(card.dataset.card))]))
const send = () => report(columns())
let drag = null
for (const card of document.querySelectorAll('.card')) card.addEventListener('pointerdown', (event) => {
  const box = card.getBoundingClientRect()
  drag = { card, dx: event.clientX - box.x, dy: event.clientY - box.y, width: box.width }
  card.classList.add('dragging')
  card.style.width = box.width + 'px'
  card.style.left = box.x + 'px'
  card.style.top = box.y + 'px'
})
addEventListener('pointermove', (event) => {
  if (!drag) return
  drag.card.style.left = (event.clientX - drag.dx) + 'px'
  drag.card.style.top = (event.clientY - drag.dy) + 'px'
})
addEventListener('pointerup', (event) => {
  if (!drag) return
  const { card } = drag
  drag = null
  card.classList.remove('dragging')
  card.style.cssText = ''
  const target = document.elementFromPoint(event.clientX, event.clientY)
  const column = target && target.closest('.column')
  if (column) column.append(card)
  send()
})
send()`,
    })
  },
})

const slider = defineTask({
  id: 'range-slider',
  kind: 'task',
  title: 'Set a slider and apply it',
  source: SOURCE,
  prompt: (e) => `Set the volume to ${e.value} and click Apply.`,
  expect: (rng) => ({ value: pick(rng, [10, 15, 20, 25, 40, 45, 55, 60, 65, 70, 75, 80, 85, 90]) }),
  evaluate(facts, e) {
    const page = facts?.page
    if (!page) return verdict(false, NO_PAGE_REPORT)
    if (page.applied === e.value) return verdict(true, `the volume ${e.value} was applied`)
    if (page.value === e.value) return verdict(false, `the slider shows ${e.value} but Apply was not clicked`)
    return verdict(false, `the applied volume is ${JSON.stringify(page.applied)}, expected ${e.value}`)
  },
  render: () =>
    taskPage('range-slider', {
      title: 'Sound',
      head: '<style>input[type=range]{width:400px}</style>',
      body: `<main>
<h1>Sound</h1>
<p><label>Volume <input id="volume" type="range" min="0" max="100" step="5" value="30" data-target="slider"> <strong id="shown">30</strong></label></p>
<button id="apply" type="button" data-target="apply">Apply</button>
<output id="result"></output>
</main>`,
      script: `const range = document.getElementById('volume')
let applied = null
const send = () => report({ value: Number(range.value), applied })
range.addEventListener('input', () => { document.getElementById('shown').textContent = range.value; send() })
document.getElementById('apply').addEventListener('click', () => { applied = Number(range.value); document.getElementById('result').textContent = 'Volume set to ' + applied + '.'; send() })
send()`,
    }),
})

export const REPORTS = Object.freeze(['monthly', 'quarterly', 'annual'])

const hoverMenu = defineTask({
  id: 'hover-menu',
  kind: 'task',
  title: 'Open an item from a hover menu',
  source: SOURCE,
  prompt: (e) => `Open the ${e.report[0].toUpperCase()}${e.report.slice(1)} report from the Reports menu.`,
  expect: (rng) => ({ report: pick(rng, REPORTS) }),
  evaluate(facts, e) {
    const visits = (facts?.records ?? []).filter((r) => r.kind === 'visit')
    if (visits.length === 0) return verdict(false, 'no report was opened')
    const last = visits.at(-1)
    return last.report === e.report ? verdict(true, `the ${e.report} report was opened`) : verdict(false, `the ${last.report} report was opened`)
  },
  render: () =>
    taskPage('hover-menu', {
      title: 'Analytics',
      head: '<style>nav{display:flex;gap:24px;border-bottom:1px solid #d2d2d7;padding-bottom:8px;margin-bottom:24px}.menu{position:relative}.menu>span{cursor:default;font-weight:600;padding:8px 0;display:inline-block}.sub{display:none;position:absolute;top:100%;left:0;background:#fff;border:1px solid #d2d2d7;border-radius:8px;padding:6px;min-width:160px;z-index:3}.menu:hover .sub{display:block}.sub a{display:block;padding:8px 10px;border-radius:6px;text-decoration:none}.sub a:hover{background:#eef4ff}</style>',
      body: `<main>
<h1>Analytics</h1>
<nav><span class="muted">Home</span><div class="menu" id="menu"><span data-target="reports-menu">Reports &#9662;</span>
<div class="sub">${REPORTS.map((r) => `<a href="/tasks/hover-menu/report/${r}" data-target="report-${r}">${r[0].toUpperCase()}${r.slice(1)}</a>`).join('')}</div></div>
<span class="muted">Settings</span></nav>
<p>Choose a report from the menu.</p>
</main>`,
      script: `const menu = document.getElementById('menu')
menu.addEventListener('mouseenter', () => requestAnimationFrame(() => report()))
menu.addEventListener('mouseleave', () => requestAnimationFrame(() => report()))
report({})`,
    }),
  routes: {
    'GET report/:name': ({ params, addRecord }) => {
      if (!REPORTS.includes(params.name)) return { status: 404, html: taskPage('hover-menu', { title: 'Not found', body: '<main><h1>Not found</h1></main>' }) }
      addRecord({ kind: 'visit', report: params.name })
      return { html: taskPage('hover-menu', { title: `${params.name} report`, body: `<main><h1>${escapeHtml(params.name[0].toUpperCase() + params.name.slice(1))} report</h1></main>`, script: `report({ report: ${jsonForScript(params.name)} })` }) }
    },
  },
})

export const FILES = Object.freeze(['draft.txt', 'notes.md', 'budget.xlsx', 'photo.png'])

const rename = defineTask({
  id: 'double-click-rename',
  kind: 'task',
  title: 'Rename a file inline',
  source: SOURCE,
  prompt: (e) => `Rename the file "draft.txt" to "${e.name}".`,
  expect: (rng) => ({ name: `${pick(rng, ['final-report', 'summary', 'minutes', 'proposal'])}.txt` }),
  evaluate(facts, e) {
    const page = facts?.page
    if (!page) return verdict(false, NO_PAGE_REPORT)
    const files = Array.isArray(page.files) ? page.files : []
    if (sameList(files, [e.name, ...FILES.slice(1)])) return verdict(true, `draft.txt is now ${e.name}`)
    if (files[0] === 'draft.txt') return verdict(false, 'draft.txt still has its old name')
    return verdict(false, `the files are ${files.join(', ')}`)
  },
  render: () =>
    taskPage('double-click-rename', {
      title: 'Files',
      head: '<style>.file{padding:10px 8px;border-bottom:1px solid #eee;user-select:none}.file input{min-width:300px}</style>',
      body: `<main>
<h1>Files</h1>
<p class="muted">Double-click a name to rename it.</p>
<div id="files">${FILES.map((name, index) => `<div class="file" data-index="${index}"><span class="name" data-target="file-${index}">${escapeHtml(name)}</span></div>`).join('')}</div>
</main>`,
      script: `const names = ${jsonForScript(FILES)}
const send = () => report({ files: names })
function edit(span, index) {
  const input = document.createElement('input')
  input.value = names[index]
  input.dataset.target = 'edit-' + index
  span.replaceWith(input)
  input.focus()
  input.select()
  report()
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== 'Escape') return
    if (event.key === 'Enter' && input.value.trim()) names[index] = input.value.trim()
    input.replaceWith(nameSpan(index))
    send()
  })
}
function nameSpan(index) {
  const span = document.createElement('span')
  span.className = 'name'
  span.dataset.target = 'file-' + index
  span.textContent = names[index]
  span.addEventListener('dblclick', () => edit(span, index))
  return span
}
for (const row of document.querySelectorAll('.file')) {
  const index = Number(row.dataset.index)
  row.querySelector('.name').replaceWith(nameSpan(index))
}
send()`,
    }),
})

const PHRASES = ['Call the plumber on Monday', 'Order more printer paper', 'Book the team lunch']

const shortcut = defineTask({
  id: 'keyboard-shortcut',
  kind: 'task',
  title: 'Save a note with a keyboard shortcut',
  source: SOURCE,
  prompt: (e) => `Type "${e.phrase}" in the note, then save it with the keyboard shortcut Ctrl+S.`,
  expect: (rng) => ({ phrase: pick(rng, PHRASES) }),
  evaluate(facts, e) {
    const page = facts?.page
    if (!page) return verdict(false, NO_PAGE_REPORT)
    if (text(page.saved) === e.phrase) return verdict(true, 'the note was saved with the shortcut')
    if (text(page.text) === e.phrase) return verdict(false, 'the note holds the phrase but was not saved')
    return verdict(false, `the saved note is ${JSON.stringify(page.saved ?? '')}`)
  },
  render: () =>
    taskPage('keyboard-shortcut', {
      title: 'Notes',
      body: `<main>
<h1>Notes</h1>
<p class="muted">There is no save button: press Ctrl+S (or Cmd+S) to save.</p>
<textarea id="note" data-target="note"></textarea>
<output id="result">Not saved</output>
</main>`,
      script: `const note = document.getElementById('note')
let saved = ''
const send = () => report({ text: note.value, saved })
note.addEventListener('input', send)
addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    saved = note.value
    document.getElementById('result').textContent = 'Saved at ' + new Date().toLocaleTimeString()
    send()
  }
})
send()`,
    }),
})

const contextMenu = defineTask({
  id: 'context-menu',
  kind: 'task',
  title: 'Archive a file from its right-click menu',
  source: SOURCE,
  prompt: (e) => `Archive the file "${FILES[e.file]}" using its right-click menu.`,
  expect: (rng) => ({ file: randomInt(rng, 0, FILES.length - 1) }),
  evaluate(facts, e) {
    const page = facts?.page
    if (!page) return verdict(false, NO_PAGE_REPORT)
    if ((page.duplicated ?? []).length) return verdict(false, 'a file was duplicated')
    if (sameList(page.archived ?? [], [e.file])) return verdict(true, `${FILES[e.file]} was archived`)
    return verdict(false, `archived: ${(page.archived ?? []).map((i) => FILES[i]).join(', ') || 'nothing'}`)
  },
  render: () =>
    taskPage('context-menu', {
      title: 'Shared drive',
      head: '<style>.row{padding:10px 8px;border-bottom:1px solid #eee;user-select:none}.row.archived{color:#aeaeb2;text-decoration:line-through}#menu{position:fixed;background:#fff;border:1px solid #d2d2d7;border-radius:8px;padding:4px;box-shadow:0 4px 12px rgba(0,0,0,.15);z-index:4}#menu button{display:block;width:100%;text-align:left;background:#fff;color:#1d1d1f;border:0;padding:8px 14px}#menu button:hover{background:#eef4ff}</style>',
      body: `<main>
<h1>Shared drive</h1>
<div>${FILES.map((name, index) => `<div class="row" data-index="${index}" data-target="row-${index}">${escapeHtml(name)}</div>`).join('')}</div>
</main>
<div id="menu" hidden><button data-action="duplicate" data-target="menu-duplicate">Duplicate</button><button data-action="archive" data-target="menu-archive">Archive</button><button data-action="download" data-target="menu-download">Download</button></div>`,
      script: `const menu = document.getElementById('menu')
const archived = [], duplicated = []
let current = null
const send = () => report({ archived, duplicated, menuOpen: !menu.hidden })
for (const row of document.querySelectorAll('.row')) row.addEventListener('contextmenu', (event) => {
  event.preventDefault()
  current = Number(row.dataset.index)
  menu.style.left = event.clientX + 'px'
  menu.style.top = event.clientY + 'px'
  menu.hidden = false
  send()
})
addEventListener('click', (event) => { if (!menu.contains(event.target) && !menu.hidden) { menu.hidden = true; send() } })
for (const button of menu.querySelectorAll('button')) button.addEventListener('click', () => {
  if (button.dataset.action === 'archive' && !archived.includes(current)) { archived.push(current); document.querySelector('.row[data-index="' + current + '"]').classList.add('archived') }
  if (button.dataset.action === 'duplicate') duplicated.push(current)
  menu.hidden = true
  send()
})
send()`,
    }),
})

export const TASKS = Object.freeze([dismissModal, scrollToFind, dragCard, slider, hoverMenu, rename, shortcut, contextMenu])
