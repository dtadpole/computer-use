/**
 * OpenAI's documented computer-use examples (developers.openai.com/api/docs/guides/tools-computer-use,
 * fetched 2026-11-01): `pickup.mjs`, `badge.mjs` and the Filters request, plus a variant of the last whose
 * panel starts open, so "if it is not open, click Show filters" is tested both ways.
 *
 * The pickup locker and code are drawn from the seed and never equal the documented 18 and 6249, so a model
 * cannot answer from memory of the docs.
 */

import { randomInt as unpredictableInt } from 'node:crypto'
import { defineTask, NO_PAGE_REPORT, oneRecord, text, verdict } from './common.mjs'
import { escapeHtml, taskPage } from './pages.mjs'
import { randomInt } from './seed.mjs'

const GUIDE = 'https://developers.openai.com/api/docs/guides/tools-computer-use'

/** The animals the filters page lists; the search narrows them by name. */
export const ANIMALS = Object.freeze([
  ['Adelie penguin', 'bird'],
  ['Emperor penguin', 'bird'],
  ['Gentoo penguin', 'bird'],
  ['Atlantic puffin', 'bird'],
  ['Snowy owl', 'bird'],
  ['Polar bear', 'mammal'],
  ['Arctic fox', 'mammal'],
  ['Walrus', 'mammal'],
  ['Snow leopard', 'mammal'],
  ['Orca', 'mammal'],
  ['Clownfish', 'fish'],
  ['Atlantic cod', 'fish'],
])

const pickup = defineTask({
  id: 'pickup-details',
  kind: 'task',
  title: 'Reveal pickup details',
  source: `${GUIDE} (pickup.mjs, "Reveal pickup details using computer actions")`,
  prompt: () => "Take a screenshot. Open 'Show pickup details' and report the locker and pickup code. Use only screenshots and left clicks.",
  allowedActions: Object.freeze(['screenshot', 'click']),
  expect: (rng) => ({
    order: randomInt(rng, 1001, 9999, [1042]),
    locker: randomInt(rng, 1, 60, [18]),
    code: String(randomInt(rng, 1000, 9999, [6249])),
  }),
  evaluate(facts) {
    const page = facts?.page
    if (!page) return verdict(false, NO_PAGE_REPORT)
    if (page.open === true) return verdict(true, 'the pickup details are open')
    return verdict(false, 'the pickup details are still closed')
  },
  answer: (expected) => ({ mustInclude: [String(expected.locker), expected.code] }),
  render: (expected) =>
    taskPage('pickup-details', {
      title: 'Parcel pickup',
      body: `<main>
<h1>Parcel pickup</h1>
<p>Order #${escapeHtml(expected.order)} is ready.</p>
<details id="pickup"><summary data-target="summary">Show pickup details</summary>
<p id="pickup-info">Locker ${escapeHtml(expected.locker)}. Pickup code: ${escapeHtml(expected.code)}.</p>
</details>
</main>`,
      script: `const details = document.getElementById('pickup')
const send = () => report({ open: details.open })
details.addEventListener('toggle', send)
send()`,
    }),
})

const badge = defineTask({
  id: 'visitor-badge',
  kind: 'task',
  title: 'Create a visitor badge',
  source: `${GUIDE} (badge.mjs, "Create a visitor badge in a local browser")`,
  prompt: (expected) => `Create a visitor badge for ${expected.name}.`,
  expect: () => ({ name: 'Mira' }),
  evaluate(facts, expected) {
    const badges = facts?.records ?? []
    if (badges.length === 0 && text(facts?.page?.draft) === expected.name) {
      return verdict(false, `the name ${expected.name} was typed but Create badge was not clicked`)
    }
    return oneRecord(badges, {
      noun: 'badge',
      none: 'no badge was created',
      check: (record) => (text(record.name) === expected.name ? null : `a badge was created for ${JSON.stringify(text(record.name))}, expected ${JSON.stringify(expected.name)}`),
    })
  },
  render: (expected, context = {}) => {
    const created = context.url?.searchParams.has('created') ? context.findRecord?.(Number(context.url.searchParams.get('created'))) : null
    const output = created ? `Badge ready: ${escapeHtml(created.name)}` : context.error ? escapeHtml(context.error) : ''
    const code = created?.code ? `<p id="badge-code">Badge code: ${escapeHtml(created.code)}</p>` : ''
    return taskPage('visitor-badge', {
      title: 'Visitor badge',
      body: `<main>
<h1>Visitor badge</h1>
<form id="badge-form" method="post" action="/tasks/visitor-badge/badges">
<p><label>Name <input id="name" name="name" autocomplete="off" maxlength="100" data-target="name"></label></p>
<p><button id="save" type="submit" data-target="save">Create badge</button></p>
</form>
<output id="result">${output}</output>
${code}
</main>`,
      script: `const input = document.getElementById('name')
const send = () => report({ draft: input.value })
input.addEventListener('input', send)
send()`,
    })
  },
  routes: {
    'POST badges': ({ form, addRecord, render }) => {
      const name = (form?.get('name') ?? '').slice(0, 100)
      if (name.trim() === '') return { status: 422, html: render({ error: 'Enter a name to create a badge.' }) }
      // A random code, shown only on the page: a session that reports it has seen the screenshot (session-integration).
      const code = Array.from({ length: 5 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[unpredictableInt(31)]).join('')
      const record = addRecord({ kind: 'badge', name, code })
      return { redirect: `/tasks/visitor-badge/?created=${record.id}` }
    },
  },
})

/** The Filters page from OpenAI's computer-request example; `initiallyOpen` picks the variant. */
function filtersPage(id, expected) {
  const open = expected.initiallyOpen === true
  const items = ANIMALS.map(([name, group]) => `<li data-group="${group}">${escapeHtml(name)}</li>`).join('\n')
  return taskPage(id, {
    title: 'Animal finder',
    body: `<main>
<h1>Animal finder</h1>
<div class="toolbar">
<button id="toggle-filters" class="secondary" type="button" aria-controls="filters" aria-expanded="${open}" data-target="toggle">${open ? 'Hide filters' : 'Show filters'}</button>
<input id="search" type="search" placeholder="Search animals" aria-label="Search animals" autocomplete="off" data-target="search">
</div>
<section id="filters" class="panel" aria-label="Filters"${open ? '' : ' hidden'}>
<h2>Filters</h2>
<fieldset><legend class="muted">Group</legend>
<label><input type="checkbox" name="group" value="bird"> Birds</label>
<label><input type="checkbox" name="group" value="mammal"> Mammals</label>
<label><input type="checkbox" name="group" value="fish"> Fish</label>
</fieldset>
</section>
<p id="count" class="muted"></p>
<ul id="results" class="results">
${items}
</ul>
</main>`,
    script: `const toggle = document.getElementById('toggle-filters')
const panel = document.getElementById('filters')
const search = document.getElementById('search')
const boxes = [...document.querySelectorAll('input[name=group]')]
const rows = [...document.querySelectorAll('#results li')]
function render() {
  const query = search.value.trim().toLowerCase()
  const groups = boxes.filter((box) => box.checked).map((box) => box.value)
  let shown = 0
  for (const row of rows) {
    const visible = row.textContent.toLowerCase().includes(query) && (groups.length === 0 || groups.includes(row.dataset.group))
    row.hidden = !visible
    if (visible) shown += 1
  }
  document.getElementById('count').textContent = shown + (shown === 1 ? ' animal' : ' animals')
  report({ filtersOpen: !panel.hidden, query: search.value, groups })
}
toggle.addEventListener('click', () => {
  panel.hidden = !panel.hidden
  toggle.textContent = panel.hidden ? 'Show filters' : 'Hide filters'
  toggle.setAttribute('aria-expanded', String(!panel.hidden))
  render()
})
search.addEventListener('input', render)
for (const box of boxes) box.addEventListener('change', render)
render()`,
  })
}

/** Judge the Filters task: panel open and the box holding exactly the query. */
function filtersVerdict(facts, expected) {
  const page = facts?.page
  if (!page) return verdict(false, NO_PAGE_REPORT)
  const query = text(page.query)
  const queryHolds = query.toLowerCase() === expected.query.toLowerCase()
  if (page.filtersOpen !== true && !queryHolds) return verdict(false, `the Filters panel is closed and the search box holds ${JSON.stringify(query)}`)
  if (page.filtersOpen !== true) return verdict(false, 'the search box holds the query but the Filters panel is closed')
  if (!queryHolds) return verdict(false, `the Filters panel is open but the search box holds ${JSON.stringify(query)}, expected ${JSON.stringify(expected.query)}`)
  return verdict(true, `the Filters panel is open and the search box holds ${expected.query}`)
}

const filtersPrompt = (expected) =>
  `Check whether the Filters panel is open. If it is not open, click Show filters. Then type ${expected.query} in the search box.`

const filters = defineTask({
  id: 'filters-search',
  kind: 'task',
  title: 'Open filters and search',
  source: `${GUIDE} ("Send a computer request" - the Filters panel and penguin search)`,
  prompt: filtersPrompt,
  expect: () => ({ query: 'penguin', initiallyOpen: false }),
  evaluate: filtersVerdict,
  render: (expected) => filtersPage('filters-search', expected),
})

const filtersOpen = defineTask({
  id: 'filters-search-open',
  kind: 'task',
  title: 'Search with the filters already open',
  source: `${GUIDE} ("Send a computer request"), variant whose Filters panel starts open, so clicking the toggle would close it`,
  prompt: filtersPrompt,
  expect: () => ({ query: 'penguin', initiallyOpen: true }),
  evaluate: filtersVerdict,
  render: (expected) => filtersPage('filters-search-open', expected),
})

export const TASKS = Object.freeze([pickup, badge, filters, filtersOpen])
