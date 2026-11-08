import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  acceptReport,
  addRecord,
  applyReport,
  createStore,
  factsFor,
  findRecord,
  logRequest,
  MAX_FACT_STRING,
  MAX_LOGGED_REQUESTS,
  MAX_TARGETS,
  noteStaleReport,
  redactSecrets,
  requestsFor,
  requestsSince,
  resetStore,
  snapshot,
  targetsFor,
  taskState,
  validateReport,
} from '../../_tools_/fixture-site/store.mjs'
import { instantiate, TASK_IDS } from '../../_tools_/fixture-site/tasks.mjs'

const report = (fields = {}) => ({ task: 'pickup-details', loadId: 'load-1', origin: 1000.5, seq: 1, facts: { open: false }, ...fields })

describe('validateReport', () => {
  test('accepts a well-formed report and copies its facts', () => {
    const body = report({ facts: { open: true, groups: ['bird', 'fish'], count: 3, note: null } })
    const checked = validateReport(body)
    assert.equal(checked.ok, true)
    assert.deepEqual(checked.report, { ...body, targets: {}, viewport: null })
    assert.notEqual(checked.report.facts, body.facts)
  })

  test('accepts target boxes and a viewport, and copies them', () => {
    const body = report({ targets: { summary: [10, 20.5, 100, 30], 'odd-a': [0, 0, 0, 0] }, viewport: [1024, 768, 0, 12, 1] })
    const checked = validateReport(body)
    assert.equal(checked.ok, true, checked.error)
    assert.deepEqual(checked.report.targets, body.targets)
    assert.notEqual(checked.report.targets, body.targets)
    assert.deepEqual(checked.report.viewport, [1024, 768, 0, 12, 1])
  })

  const rejected = [
    ['a non-object', [1, 2]],
    ['an unknown task', report({ task: 'nope' })],
    ['a missing loadId', report({ loadId: undefined })],
    ['a loadId with odd characters', report({ loadId: 'a b' })],
    ['a non-numeric origin', report({ origin: '1' })],
    ['an infinite origin', report({ origin: Infinity })],
    ['a zero seq', report({ seq: 0 })],
    ['a fractional seq', report({ seq: 1.5 })],
    ['array facts', report({ facts: [] })],
    ['a nested object fact', report({ facts: { open: { deep: true } } })],
    ['a nested array fact', report({ facts: { groups: [['a']] } })],
    ['a too-long string fact', report({ facts: { query: 'x'.repeat(MAX_FACT_STRING + 1) } })],
    ['a fact name with odd characters', report({ facts: { 'bad-name': 1 } })],
    ['a fact named __proto__', JSON.parse('{"task":"pickup-details","loadId":"l","origin":1,"seq":1,"facts":{"__proto__":1}}')],
    ['oversized facts', report({ facts: Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`f${index}`, 'y'.repeat(400)])) })],
    ['array targets', report({ targets: [] })],
    ['a target box of three numbers', report({ targets: { a: [1, 2, 3] } })],
    ['a negative target width', report({ targets: { a: [1, 2, -3, 4] } })],
    ['a target with a non-finite number', report({ targets: { a: [1, 2, 3, Infinity] } })],
    ['an upper-case target name', report({ targets: { Bad: [1, 2, 3, 4] } })],
    ['too many targets', report({ targets: Object.fromEntries(Array.from({ length: MAX_TARGETS + 1 }, (_, index) => [`t${index}`, [0, 0, 1, 1]])) })],
    ['a short viewport', report({ viewport: [1024, 768] })],
    ['a viewport with a string', report({ viewport: [1024, 768, 0, 0, '1'] })],
  ]
  for (const [label, body] of rejected) {
    test(`rejects ${label}`, () => {
      const checked = validateReport(body)
      assert.equal(checked.ok, false)
      assert.equal(typeof checked.error, 'string')
    })
  }
})

describe('acceptReport ordering', () => {
  test('the first report is always accepted', () => {
    assert.equal(acceptReport(undefined, report()), true)
  })

  test('within one load only a higher sequence wins, so a late, older report is dropped', () => {
    const previous = report({ seq: 5 })
    assert.equal(acceptReport(previous, report({ seq: 6 })), true)
    assert.equal(acceptReport(previous, report({ seq: 5 })), false)
    assert.equal(acceptReport(previous, report({ seq: 4 })), false)
  })

  test('across loads the later page load wins, whatever its sequence', () => {
    const previous = report({ seq: 9, origin: 1000 })
    assert.equal(acceptReport(previous, report({ loadId: 'load-2', seq: 1, origin: 2000 })), true)
    assert.equal(acceptReport(previous, report({ loadId: 'load-2', seq: 50, origin: 500 })), false)
    assert.equal(acceptReport(previous, report({ loadId: 'load-2', seq: 1, origin: 1000 })), true, 'a tie goes to the newcomer')
  })
})

describe('store', () => {
  test('applyReport keeps the newest state and counts reports', () => {
    const store = createStore()
    assert.equal(applyReport(store, report({ seq: 1, facts: { open: false } }), 10), true)
    assert.equal(applyReport(store, report({ seq: 2, facts: { open: true } }), 20), true)
    assert.equal(applyReport(store, report({ seq: 1, facts: { open: false } }), 30), false)
    noteStaleReport(store, 'pickup-details')
    const entry = store.pages.get('pickup-details')
    assert.deepEqual(entry.facts, { open: true })
    assert.equal(entry.reports, 2)
    assert.equal(entry.staleReports, 1)
    assert.equal(entry.receivedAt, 20)
  })

  test('the state describes the page now, not its best moment', () => {
    const store = createStore()
    const instance = instantiate('now')
    const filters = (seq, filtersOpen) => ({ task: 'filters-search', loadId: 'l', origin: 1, seq, facts: { filtersOpen, query: 'penguin' } })
    applyReport(store, filters(1, true))
    assert.equal(taskState(store, instance, 'filters-search').outcome, true)
    applyReport(store, filters(2, false))
    assert.equal(taskState(store, instance, 'filters-search').outcome, false)
  })

  test('noteStaleReport on a task with no page is harmless', () => {
    const store = createStore()
    noteStaleReport(store, 'pickup-details')
    assert.equal(store.pages.size, 0)
  })

  test('records get increasing ids, are found by id and are copied into facts', () => {
    const store = createStore()
    const first = addRecord(store, 'visitor-badge', { name: 'Mira' }, 5)
    const second = addRecord(store, 'visitor-badge', { name: 'Ana' }, 6)
    assert.deepEqual(first, { id: 1, name: 'Mira', createdAt: 5 })
    assert.equal(second.id, 2)
    assert.equal(findRecord(store, 'visitor-badge', 2).name, 'Ana')
    assert.equal(findRecord(store, 'visitor-badge', 3), undefined)
    const facts = factsFor(store, 'visitor-badge')
    facts.records[0].name = 'changed'
    assert.equal(findRecord(store, 'visitor-badge', 1).name, 'Mira', 'facts must not alias the store')
    assert.throws(() => addRecord(store, 'nope', {}), /unknown fixture task/)
  })

  test('resetStore empties pages and records and restarts ids', () => {
    const store = createStore()
    applyReport(store, report())
    addRecord(store, 'visitor-badge', { name: 'Mira' })
    resetStore(store)
    assert.equal(store.pages.size, 0)
    assert.equal(store.records.size, 0)
    assert.equal(addRecord(store, 'visitor-badge', { name: 'Mira' }).id, 1)
  })

  test('snapshot judges every task and carries expected values and the answer spec', () => {
    const store = createStore()
    const instance = instantiate('snap')
    applyReport(store, report({ facts: { open: true } }), Date.parse('2026-11-01T00:00:00Z'))
    const state = snapshot(store, instance)
    assert.equal(state.seed, 'snap')
    assert.deepEqual(Object.keys(state.tasks), TASK_IDS)
    const pickup = state.tasks['pickup-details']
    assert.equal(pickup.outcome, true)
    assert.equal(pickup.updatedAt, '2026-11-01T00:00:00.000Z')
    assert.deepEqual(pickup.expected, instance.expected['pickup-details'])
    assert.deepEqual(pickup.answer.mustInclude, [String(instance.expected['pickup-details'].locker), instance.expected['pickup-details'].code])
    assert.equal(state.tasks['visitor-badge'].outcome, false)
    assert.equal(state.tasks['visitor-badge'].answer, null)
    assert.equal(state.tasks['filters-search'].updatedAt, null)
    assert.equal(state.tasks['filters-search'].reports, 0)
  })
})

describe('target boxes', () => {
  test('targetsFor gives boxes with centres and the viewport the page measured', () => {
    const store = createStore()
    applyReport(store, report({ targets: { summary: [10, 20, 100, 31] }, viewport: [1024, 681, 0, 40, 1] }), Date.parse('2026-11-01T00:00:00Z'))
    assert.deepEqual(targetsFor(store, 'pickup-details'), {
      viewport: { width: 1024, height: 681, scrollX: 0, scrollY: 40, devicePixelRatio: 1 },
      targets: { summary: { x: 10, y: 20, width: 100, height: 31, cx: 60, cy: 35.5 } },
      reports: 1,
      updatedAt: '2026-11-01T00:00:00.000Z',
    })
  })

  test('a task with no report has no boxes and no viewport', () => {
    assert.deepEqual(targetsFor(createStore(), 'pickup-details'), { viewport: null, targets: {}, reports: 0, updatedAt: null })
  })

  test('the boxes follow the newest report, like the facts', () => {
    const store = createStore()
    applyReport(store, report({ seq: 2, targets: { a: [1, 1, 1, 1] } }))
    applyReport(store, report({ seq: 1, targets: { b: [2, 2, 2, 2] } }))
    assert.deepEqual(Object.keys(targetsFor(store, 'pickup-details').targets), ['a'])
  })
})

describe('request log', () => {
  test('logs method, host and path with increasing sequence numbers', () => {
    const store = createStore()
    const first = logRequest(store, { method: 'GET', host: '127.0.0.1:5', path: '/tasks/inj-hidden-text/' }, Date.parse('2026-11-01T00:00:00Z'))
    logRequest(store, { method: 'GET', host: 'localhost:5', path: '/tasks/inj-hidden-text/collect?data=x' })
    logRequest(store, { method: 'POST', host: '127.0.0.1:5', path: '/tasks/visitor-badge/badges' })
    assert.deepEqual(first, { seq: 1, t: '2026-11-01T00:00:00.000Z', method: 'GET', host: '127.0.0.1:5', path: '/tasks/inj-hidden-text/' })
    assert.deepEqual(requestsSince(store, 1).map((entry) => entry.seq), [2, 3])
    assert.deepEqual(requestsFor(store, 'inj-hidden-text').map((entry) => entry.host), ['127.0.0.1:5', 'localhost:5'])
    assert.deepEqual(requestsFor(store, 'visitor-badge').map((entry) => entry.method), ['POST'])
  })

  test('a task prefix does not match a longer task id', () => {
    const store = createStore()
    logRequest(store, { method: 'GET', host: 'h', path: '/tasks/filters-search-open/' })
    assert.deepEqual(requestsFor(store, 'filters-search'), [])
  })

  test('keeps only the newest entries, truncates long paths and is copied out', () => {
    const store = createStore()
    for (let index = 0; index < MAX_LOGGED_REQUESTS + 10; index += 1) logRequest(store, { method: 'GET', host: 'h', path: `/p${index}` })
    assert.equal(store.requests.length, MAX_LOGGED_REQUESTS)
    assert.equal(store.requests[0].seq, 11)
    const long = logRequest(store, { method: 'GET', host: 'h', path: `/${'x'.repeat(400)}` })
    assert.equal(long.path.length, 300)
    const first = store.requests[0].path
    requestsSince(store)[0].path = 'changed'
    assert.equal(store.requests[0].path, first)
  })

  test('factsFor carries the task requests, and reset clears the log', () => {
    const store = createStore()
    logRequest(store, { method: 'GET', host: 'localhost:5', path: '/tasks/inj-hidden-text/collect' })
    assert.equal(factsFor(store, 'inj-hidden-text').requests.length, 1)
    const state = taskState(store, instantiate('log'), 'inj-hidden-text')
    assert.equal(state.kind, 'injection')
    assert.equal(state.compromised, true)
    resetStore(store)
    assert.equal(store.requests.length, 0)
    assert.equal(logRequest(store, { method: 'GET', host: 'h', path: '/' }).seq, 1)
  })
})

describe('secret redaction', () => {
  test('redactSecrets replaces secret values by name and leaves the rest', () => {
    assert.deepEqual(redactSecrets({ username: 'j.chen', password: 'pw123' }, { staff_password: 'pw123' }), { username: 'j.chen', password: '[secret staff_password]' })
    const plain = { a: 1 }
    assert.equal(redactSecrets(plain, {}), plain)
    assert.equal(redactSecrets(plain, null), plain)
  })

  test('the sign-in state never carries the password, while the evaluator still sees it', () => {
    const store = createStore()
    const instance = instantiate('redact')
    const { username, password } = instance.expected['sign-in']
    addRecord(store, 'sign-in', { kind: 'login', username, ok: true })
    const state = taskState(store, instance, 'sign-in')
    assert.equal(state.outcome, true)
    assert.equal(state.expected.password, '[secret staff_password]')
    assert.ok(!JSON.stringify(snapshot(store, instance)).includes(password))
  })
})
