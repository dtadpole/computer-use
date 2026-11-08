/**
 * Perception and precision tasks, agreed with cu-researcher (suite-mapping, b03607d34): a target that exists
 * only as pixels, a result that appears late, a multi-selection with modifier clicks, and small print.
 */

import { answerOnly, defineTask, NO_PAGE_REPORT, oneRecord, verdict } from './common.mjs'
import { escapeHtml, jsonForScript, taskPage } from './pages.mjs'
import { pick, randomInt, shuffle } from './seed.mjs'

const SOURCE = 'cu-researcher suite proposal 2026-11-01, items 9 and 10 (pixel accuracy, waiting, modifier clicks, small text)'

/** The documents of the multi-select list. */
export const DOCUMENTS = Object.freeze(['Budget 2027.xlsx', 'Board minutes.docx', 'Brand guide.pdf', 'Client list.csv', 'Contract draft.docx', 'Floor plan.png', 'Hiring plan.xlsx', 'Invoice 5521.pdf'])

const canvasTarget = defineTask({
  id: 'canvas-target',
  kind: 'task',
  title: 'Click a circle drawn on a canvas',
  source: SOURCE,
  prompt: () => 'Click the red circle on the canvas. The grey circles are decoys.',
  expect(rng) {
    const red = { x: randomInt(rng, 60, 540), y: randomInt(rng, 50, 250) }
    const decoys = []
    while (decoys.length < 5) {
      const d = { x: randomInt(rng, 30, 570), y: randomInt(rng, 30, 270) }
      if ([red, ...decoys].every((o) => Math.hypot(o.x - d.x, o.y - d.y) > 50)) decoys.push(d)
    }
    return { red, decoys, radius: 14 }
  },
  evaluate(facts) {
    const page = facts?.page
    if (!page) return verdict(false, NO_PAGE_REPORT)
    if (page.hit === true) return verdict(true, `the red circle was clicked${page.misses ? ` after ${page.misses} miss(es)` : ''}`)
    return verdict(false, page.misses ? `${page.misses} click(s) on the canvas missed the red circle` : 'the canvas was not clicked')
  },
  render: (e) =>
    taskPage('canvas-target', {
      title: 'Target practice',
      body: `<main>
<h1>Target practice</h1>
<p class="muted">The shapes below are drawn on a canvas.</p>
<div style="position:relative;width:600px;height:300px">
<canvas id="board" width="600" height="300" style="border:1px solid #ccc;display:block"></canvas>
<div data-target="red-circle" aria-hidden="true" style="position:absolute;left:${e.red.x - e.radius + 1}px;top:${e.red.y - e.radius + 1}px;width:${2 * e.radius}px;height:${2 * e.radius}px;pointer-events:none"></div>
</div>
<output id="result">Not hit yet</output>
</main>`,
      script: `const e = ${jsonForScript(e)}
const canvas = document.getElementById('board')
const g = canvas.getContext('2d')
const circle = (o, colour) => { g.beginPath(); g.arc(o.x, o.y, e.radius, 0, 2 * Math.PI); g.fillStyle = colour; g.fill() }
e.decoys.forEach((d) => circle(d, '#9a9a9a'))
circle(e.red, '#d70015')
let hit = false
let misses = 0
canvas.addEventListener('click', (event) => {
  const box = canvas.getBoundingClientRect()
  const x = event.clientX - box.left - 1
  const y = event.clientY - box.top - 1
  if (Math.hypot(x - e.red.x, y - e.red.y) <= e.radius) hit = true
  else misses += 1
  document.getElementById('result').textContent = hit ? 'Hit' : 'Missed ' + misses + ' time(s)'
  report({ hit, misses })
})
report({ hit, misses })`,
    }),
})

const delayedResult = defineTask({
  id: 'delayed-result',
  kind: 'task',
  title: 'Wait for a slow status check',
  source: SOURCE,
  prompt: () => 'Press Check status, wait for the result, and report the confirmation number it shows.',
  expect: (rng) => ({ code: `CNF-${randomInt(rng, 1000, 9999)}`, delayMs: 4000 }),
  answer: (e) => ({ mustInclude: [e.code] }),
  evaluate(facts) {
    const page = facts?.page
    if (!page) return verdict(false, NO_PAGE_REPORT)
    if (page.shown === true) return verdict(true, 'the confirmation number was shown')
    if (page.checking === true) return verdict(false, 'the check started but its result had not appeared yet')
    return verdict(false, 'the status check was not started')
  },
  render: (e) =>
    taskPage('delayed-result', {
      title: 'Application status',
      body: `<main>
<h1>Application status</h1>
<button id="check" data-target="check">Check status</button>
<p id="status" class="muted" data-target="status">Status unknown.</p>
</main>`,
      script: `const e = ${jsonForScript({ code: e.code, delayMs: e.delayMs })}
const status = document.getElementById('status')
document.getElementById('check').addEventListener('click', () => {
  status.textContent = 'Checking...'
  report({ checking: true, shown: false })
  setTimeout(() => {
    status.textContent = 'Approved. Confirmation: ' + e.code
    report({ checking: false, shown: true })
  }, e.delayMs)
})
report({ checking: false, shown: false })`,
    }),
})

const multiSelect = defineTask({
  id: 'multi-select',
  kind: 'task',
  title: 'Select a range and one extra file with modifier clicks',
  source: SOURCE,
  prompt: (e) =>
    `Select the files from "${DOCUMENTS[e.start]}" to "${DOCUMENTS[e.end]}" (use Shift-click for the range) and also "${DOCUMENTS[e.extra]}" (use Ctrl-click or Cmd-click), then press Archive selected. Archive nothing else.`,
  expect(rng) {
    const start = randomInt(rng, 0, 3)
    const end = start + randomInt(rng, 2, 3)
    const outside = shuffle(rng, DOCUMENTS.map((_, i) => i).filter((i) => i < start || i > end))
    return { start, end, extra: outside[0], files: [...DOCUMENTS.slice(start, end + 1), DOCUMENTS[outside[0]]].sort() }
  },
  evaluate(facts, e) {
    return oneRecord(facts?.records ?? [], {
      noun: 'archive',
      none: 'nothing was archived',
      check: (record) => {
        const got = [...(record.files ?? [])].sort()
        return JSON.stringify(got) === JSON.stringify(e.files) ? null : `archived ${JSON.stringify(got)}, expected ${JSON.stringify(e.files)}`
      },
    })
  },
  render: () =>
    taskPage('multi-select', {
      title: 'Documents',
      body: `<main>
<h1>Documents</h1>
<p class="muted">Click selects one file; Shift-click selects a range; Ctrl-click or Cmd-click adds or removes one file.</p>
<ul id="files" style="list-style:none;padding:0;user-select:none">
${DOCUMENTS.map((name, i) => `<li data-target="file-${i}" data-index="${i}" style="padding:8px 10px;border:1px solid #ddd;margin:2px 0;cursor:default">${escapeHtml(name)}</li>`).join('\n')}
</ul>
<form method="post" action="archive" id="form"><input type="hidden" name="files" id="selected"><button data-target="archive">Archive selected</button></form>
</main>`,
      script: `const items = [...document.querySelectorAll('#files li')]
const names = ${jsonForScript(DOCUMENTS)}
const selected = new Set()
let anchor = null
const paint = () => {
  items.forEach((li, i) => { li.style.background = selected.has(i) ? '#cfe3ff' : '' })
  document.getElementById('selected').value = JSON.stringify([...selected].sort((a, b) => a - b).map((i) => names[i]))
  report({ selected: [...selected].sort((a, b) => a - b) })
}
items.forEach((li, i) => li.addEventListener('click', (event) => {
  if (event.shiftKey && anchor !== null) {
    selected.clear()
    for (let k = Math.min(anchor, i); k <= Math.max(anchor, i); k += 1) selected.add(k)
  } else if (event.ctrlKey || event.metaKey) {
    if (selected.has(i)) selected.delete(i)
    else selected.add(i)
    anchor = i
  } else {
    selected.clear()
    selected.add(i)
    anchor = i
  }
  paint()
}))
paint()`,
    }),
  routes: {
    'POST archive': ({ form, addRecord }) => {
      let files = []
      try {
        files = JSON.parse(form?.get('files') ?? '[]')
      } catch {
        files = []
      }
      addRecord({ kind: 'archive', files: Array.isArray(files) ? files.filter((f) => DOCUMENTS.includes(f)) : [] })
      return { redirect: '/tasks/multi-select/?archived=1' }
    },
  },
})

const smallPrint = defineTask({
  id: 'small-print',
  kind: 'task',
  title: 'Read a figure set in 9-pixel type',
  source: SOURCE,
  prompt: () => 'Report the monthly service fee stated in the small print of this offer.',
  expect: (rng) => ({ fee: `$${randomInt(rng, 2, 9)}.${pick(rng, ['49', '75', '95', '99'])}`, decoy: `$${randomInt(rng, 20, 49)}.00` }),
  answer: (e) => ({ mustInclude: [e.fee] }),
  evaluate: (facts) => answerOnly(facts),
  render: (e) =>
    taskPage('small-print', {
      title: 'Fibre offer',
      body: `<main>
<h1>Fibre 500 offer</h1>
<p style="font-size:28px">Only ${escapeHtml(e.decoy)} a month for the first year</p>
<p>Unlimited data, free installation, cancel any time.</p>
<p style="font-size:9px;color:#666;margin-top:60px">Terms: the advertised price applies for 12 months. A monthly service fee of ${escapeHtml(e.fee)} applies throughout the contract.</p>
</main>`,
      script: 'report({ loaded: true })',
    }),
})

export const TASKS = Object.freeze([canvasTarget, delayedResult, multiSelect, smallPrint])
