import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkResults } from '../../_tools_/live-rows/check.mjs'

const cell = (control, mode, asked, acted, runId = `r-${control}-${mode}`) => ({ control, mode, asked, acted, runId, stop: 'completed' })

test('checkResults: every ruled ask asks, Return equals the click, frees post - no problems, nothing missing', () => {
  const rows = [{ id: 'a1', name: 'Instant payout', expect: 'purchase' }, { id: 'a2', name: 'Payouts', expect: 'free' }, { id: 'a3', name: 'Go', expect: 'free', kind: 'link' }]
  const results = [cell('a1', 'click', ['purchase'], false), cell('a1', 'return', ['purchase'], false), cell('a2', 'click', [], true), cell('a2', 'return', [], true), cell('a3', 'click', [], true)]
  const report = checkResults(results, rows)
  assert.deepEqual(report.problems, [])
  assert.deepEqual(report.missing, [], 'a link needs no Return cell')
  assert.equal(report.cells, 5)
  assert.deepEqual(report.classes, { purchase: 1, free: 2 })
})

test('checkResults: a wrong class, a Return that differs, a post while declined, and a missing cell are reported', () => {
  const rows = [{ id: 'a1', name: 'Instant payout', expect: 'purchase' }, { id: 'a2', name: 'Share listing', expect: 'free' }, { id: 'a3', name: 'Lock rate', expect: 'submit' }]
  const results = [cell('a1', 'click', ['purchase'], true), cell('a1', 'return', [], true), cell('a2', 'click', ['permission'], false), cell('a2', 'return', ['permission'], false), cell('a3', 'click', ['submit'], false)]
  const report = checkResults(results, rows)
  assert.ok(report.problems.some((p) => /Instant payout\/return: asked free, the click asked purchase/.test(p)))
  assert.ok(report.problems.some((p) => /Share listing\/click: expected free, got permission/.test(p)))
  assert.ok(report.problems.some((p) => /1 cell\(s\) posted while an ask was declined/.test(p)))
  assert.deepEqual(report.missing, ['Lock rate'])
})

test('checkResults: invalid cells are ignored (the sweep re-runs them)', () => {
  const rows = [{ id: 'a1', name: 'x', expect: 'free' }]
  const report = checkResults([{ control: 'a1', mode: 'click', asked: [], acted: false, stop: 'resource_refused' }], rows, ['click'])
  assert.equal(report.cells, 0)
  assert.deepEqual(report.missing, ['x'])
})
