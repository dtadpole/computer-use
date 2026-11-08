import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import vm from 'node:vm'

import { escapeHtml, jsonForScript, layout, renderError, renderIndex, reporterScript, taskPage } from '../../_tools_/fixture-site/pages.mjs'
import { validateReport } from '../../_tools_/fixture-site/store.mjs'
import { describeTask, instantiate, renderTask, TASK_IDS } from '../../_tools_/fixture-site/tasks.mjs'

const { expected } = instantiate('pages')

/** The inline scripts of a rendered page. */
function scriptsOf(html) {
  return [...html.matchAll(/<script>\n([\s\S]*?)\n<\/script>/g)].map((match) => match[1])
}

/** A fake element: listeners, a box and a dataset. */
function element(id, { box = [0, 0, 0, 0], target, ...fields } = {}) {
  const listeners = {}
  return {
    id,
    dataset: target ? { target } : {},
    ...fields,
    getBoundingClientRect: () => ({ x: box[0], y: box[1], width: box[2], height: box[3] }),
    getClientRects: () => (fields.lines ?? [{ x: box[0], y: box[1], width: box[2], height: box[3] }]),
    addEventListener(type, handler) {
      ;(listeners[type] ??= []).push(handler)
    },
    fire(type) {
      for (const handler of listeners[type] ?? []) handler({ type })
    },
  }
}

/**
 * Run page scripts against a minimal fake browser. Returns the bodies posted to the report endpoint, the
 * elements, a way to fire window events, and a way to run queued animation frames.
 */
function runScripts(scripts, { elements = {}, frame = null, top = null } = {}) {
  const posted = []
  const windowListeners = {}
  const frames = []
  const nodes = Object.fromEntries(Object.entries(elements).map(([id, fields]) => [id, element(id, fields)]))
  const context = {
    self: {},
    crypto: undefined,
    performance: { timeOrigin: 1730450000000.25 },
    innerWidth: 1024,
    innerHeight: 681,
    scrollX: 0,
    scrollY: 0,
    devicePixelRatio: 1,
    frameElement: frame,
    document: {
      getElementById: (id) => nodes[id] ?? null,
      querySelectorAll: (selector) => (selector === '[data-target]' ? Object.values(nodes).filter((node) => node.dataset.target) : []),
    },
    addEventListener(type, handler) {
      ;(windowListeners[type] ??= []).push(handler)
    },
    requestAnimationFrame: (callback) => frames.push(callback),
    fetch: (url, init) => {
      posted.push({ url, init, body: JSON.parse(init.body) })
      return Promise.resolve({})
    },
    Date,
    Math,
    JSON,
    String,
    Number,
    Object,
  }
  vm.createContext(context)
  context.window = context
  context.top = top ?? context
  for (const script of scripts) vm.runInContext(script, context)
  return {
    posted,
    nodes,
    fireWindow: (type) => (windowListeners[type] ?? []).forEach((handler) => handler({ type })),
    runFrames: () => frames.splice(0).forEach((callback) => callback()),
  }
}

describe('escaping', () => {
  test('escapeHtml neutralises markup and quotes', () => {
    assert.equal(escapeHtml(`<a href="x" onclick='y'>&</a>`), '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;')
    assert.equal(escapeHtml(42), '42')
  })

  test('jsonForScript cannot close the script element or break a string', () => {
    const text = jsonForScript('</script><b>&\u2028\u2029')
    assert.ok(!text.includes('<') && !text.includes('>') && !text.includes('&'))
    assert.ok(!text.includes('\u2028') && !text.includes('\u2029'))
    assert.equal(JSON.parse(text), '</script><b>&\u2028\u2029')
  })
})

describe('layout and task pages', () => {
  test('layout escapes the title and places head content and the script', () => {
    const html = layout({ title: '<T>', body: '<p>b</p>', head: '<style>x{}</style>', script: 'let a = 1' })
    assert.match(html, /<title>&lt;T&gt;<\/title>/)
    assert.match(html, /<style>x\{\}<\/style><\/head>/)
    assert.deepEqual(scriptsOf(html), ['let a = 1'])
    assert.deepEqual(scriptsOf(layout({ title: 't', body: '' })), [])
  })

  test('taskPage puts the reporter before the page script', () => {
    const [script] = scriptsOf(taskPage('pickup-details', { title: 't', body: '', script: 'report({ x: 1 })' }))
    assert.ok(script.startsWith(reporterScript('pickup-details')))
    assert.ok(script.endsWith('report({ x: 1 })'))
  })

  test('every task page script is valid JavaScript', () => {
    const context = { url: new URL('http://127.0.0.1:1/'), origins: { primary: 'http://127.0.0.1:1', secondary: 'http://localhost:1' }, records: [] }
    for (const id of TASK_IDS) for (const script of scriptsOf(renderTask(id, expected[id], context))) assert.doesNotThrow(() => new vm.Script(script), id)
  })

  test('reporterScript embeds the task id safely', () => {
    assert.match(reporterScript('pickup-details'), /^const TASK = "pickup-details"$/m)
  })
})

describe('the reporter', () => {
  test('a report carries facts, the visible target boxes and the viewport, in a shape the server accepts', () => {
    const { posted } = runScripts([`${reporterScript('pickup-details')}\nreport({ open: false })`], {
      elements: { a: { target: 'summary', box: [184, 180, 168.4, 24] }, b: { target: 'hidden-one', box: [0, 0, 0, 0] }, c: { box: [1, 1, 1, 1] } },
    })
    assert.equal(posted.length, 1)
    assert.equal(posted[0].url, '/__fixture/report')
    assert.equal(posted[0].init.method, 'POST')
    assert.equal(posted[0].init.headers['content-type'], 'application/json')
    const { body } = posted[0]
    assert.deepEqual(body.facts, { open: false })
    assert.deepEqual(body.targets, { summary: [184, 180, 168.4, 24] }, 'a zero-size (hidden) element has no box, an unmarked one is ignored')
    assert.deepEqual(body.viewport, [1024, 681, 0, 0, 1])
    assert.equal(validateReport(body).ok, true, validateReport(body).error)
  })

  test('a wrapped inline target reports its first line box, not the bounding box', () => {
    const lines = [{ x: 600, y: 100, width: 120, height: 20 }, { x: 40, y: 122, width: 60, height: 20 }]
    const { posted } = runScripts([`${reporterScript('inj-phishing-signin')}\nreport({})`], { elements: { a: { target: 'honeypot', box: [40, 100, 680, 42], lines } } })
    assert.deepEqual(posted[0].body.targets, { honeypot: [600, 100, 120, 20] })
  })

  test('report() without facts resends the last facts with a higher sequence', () => {
    const { posted } = runScripts([`${reporterScript('pickup-details')}\nreport({ open: true })\nreport()`])
    assert.deepEqual(posted.map(({ body }) => [body.seq, body.facts]), [[1, { open: true }], [2, { open: true }]])
    assert.equal(posted[0].body.loadId, posted[1].body.loadId)
  })

  test('scrolls are batched into one report per animation frame', () => {
    const { posted, fireWindow, runFrames } = runScripts([`${reporterScript('pickup-details')}\nreport({})`])
    fireWindow('scroll')
    fireWindow('scroll')
    fireWindow('resize')
    assert.equal(posted.length, 1)
    runFrames()
    assert.equal(posted.length, 2)
    fireWindow('scroll')
    runFrames()
    assert.equal(posted.length, 3)
  })

  test('inside an iframe the boxes are shifted into the top page, and the top page scroll is followed', () => {
    const topListeners = {}
    const top = { innerWidth: 1280, innerHeight: 800, scrollX: 0, scrollY: 25, devicePixelRatio: 1, addEventListener: (type, handler) => ((topListeners[type] ??= []).push(handler)) }
    const frame = { getBoundingClientRect: () => ({ x: 100, y: 50, width: 600, height: 150 }), clientLeft: 1, clientTop: 1 }
    const { posted, runFrames } = runScripts([`${reporterScript('iframe-promo')}\nreport({ applied: '' })`], { elements: { p: { target: 'promo', box: [16, 16, 200, 38] } }, frame, top })
    assert.deepEqual(posted[0].body.targets, { promo: [117, 67, 200, 38] })
    assert.deepEqual(posted[0].body.viewport, [1280, 800, 0, 25, 1])
    assert.equal(topListeners.scroll.length, 1)
    topListeners.scroll[0]()
    runFrames()
    assert.equal(posted.length, 2)
  })

  test('the pickup page reports on load and on toggle', () => {
    const { posted, nodes } = runScripts(scriptsOf(renderTask('pickup-details', expected['pickup-details'])), { elements: { pickup: { open: false } } })
    nodes.pickup.open = true
    nodes.pickup.fire('toggle')
    assert.deepEqual(posted.map(({ body }) => body.facts), [{ open: false }, { open: true }])
    for (const { body } of posted) assert.equal(validateReport(body).ok, true)
  })

  test('the badge page reports the draft name as it is typed', () => {
    const { posted, nodes } = runScripts(scriptsOf(renderTask('visitor-badge', expected['visitor-badge'])), { elements: { name: { value: '', target: 'name', box: [250, 120, 260, 40] } } })
    nodes.name.value = 'Mira'
    nodes.name.fire('input')
    assert.deepEqual(posted.map(({ body }) => body.facts), [{ draft: '' }, { draft: 'Mira' }])
    assert.deepEqual(posted[1].body.targets, { name: [250, 120, 260, 40] })
  })
})

describe('index and errors', () => {
  test('the index links every page with its kind and shows no expected values', () => {
    const descriptions = TASK_IDS.map((id) => describeTask(id, expected[id], 'http://127.0.0.1:5000/'))
    const html = renderIndex(descriptions)
    for (const id of TASK_IDS) assert.ok(html.includes(`href="/tasks/${id}/"`), id)
    assert.ok(html.includes('inj-pixel-only - injection'))
    assert.ok(!html.includes(expected['pickup-details'].code))
  })

  test('the error page escapes its message', () => {
    assert.ok(renderError(404, 'Nothing at /<x>').includes('Nothing at /&lt;x&gt;'))
  })
})
