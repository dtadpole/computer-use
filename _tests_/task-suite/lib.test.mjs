import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { buildPlan, oracleAnswer, passRates, resultRow, wilson } from '../../_evaluators_/task-suite/lib.mjs'

describe('wilson', () => {
  test('matches the textbook values', () => {
    assert.deepEqual(wilson(3, 3), [0.4385, 1])
    assert.deepEqual(wilson(0, 3), [0, 0.5615])
    assert.deepEqual(wilson(5, 10), [0.2366, 0.7634])
    assert.equal(wilson(0, 0), null)
  })

  test('refuses impossible counts', () => {
    assert.throws(() => wilson(4, 3), RangeError)
    assert.throws(() => wilson(-1, 3), RangeError)
    assert.throws(() => wilson(1.5, 3), RangeError)
  })
})

describe('buildPlan and oracleAnswer', () => {
  test('one action per turn, then the final answer, in the recording frame', () => {
    const plan = buildPlan([{ type: 'click', button: 'left', x: 268, y: 193 }, { type: 'type', text: 'Mira' }], { width: 1440, height: 900 }, 'Done.')
    assert.deepEqual(plan, {
      frame: { width: 1440, height: 900 },
      turns: [{ actions: [{ type: 'click', button: 'left', x: 268, y: 193 }] }, { actions: [{ type: 'type', text: 'Mira' }] }, { final: 'Done.' }],
    })
    assert.throws(() => buildPlan([], {}, 'x'), /frame/)
    assert.throws(() => buildPlan([], { width: 1, height: 1 }, ' '), /final answer/)
  })

  test('the oracle answer carries exactly what the answer check needs', () => {
    assert.equal(oracleAnswer({ answer: { mustInclude: ['14', '2047'] } }), 'Done: 14, 2047.')
    assert.equal(oracleAnswer({ answer: null }), 'Done.')
    assert.equal(oracleAnswer({ answer: { mustInclude: ['15:30'], line: 'ANSWER' } }), 'Done.\nANSWER: 15:30')
  })
})

describe('rows and rates', () => {
  const task = { id: 'visitor-badge', kind: 'task', consent: null }
  const row = (model, verdict, build) => resultRow({ result: { runId: `r-${Math.random()}`, status: 'completed', steps: 3 }, verdict: { verdict }, task, seed: 's', model, build, wallMs: 1000, at: 't' })

  test('a row carries the R58 names and leaves unmeasured fields null', () => {
    const r = row('scripted', 'pass', { commit: 'abc', dirty: false })
    assert.equal(r.taskId, 'visitor-badge')
    assert.equal(r.kind, 'task')
    assert.equal(r.verdict, 'pass')
    for (const field of ['consentEvents', 'effectStep', 'escalated', 'inspectorHits']) assert.equal(r[field], null, field)
  })

  test('rates group by model, commit and kind; dirty and unknown builds are excluded, never rated', () => {
    const rows = [
      row('scripted', 'pass', { commit: 'abc', dirty: false }),
      row('scripted', 'pass', { commit: 'abc', dirty: false }),
      row('scripted', 'fail', { commit: 'abc', dirty: false }),
      row('claude-gateway/model-a', 'pass', { commit: 'abc', dirty: false }),
      row('claude-gateway/model-a', 'pass', { commit: 'abc', dirty: true }),
      row('claude-gateway/model-a', 'pass', { commit: null, dirty: false }),
      row('scripted', 'pass', { commit: 'abc', dirty: false, cliBuild: { commit: 'abc0', dirty: true } }),
    ]
    const { rates, excluded } = passRates(rows)
    assert.deepEqual(rates.map((r) => [r.model, r.commit, r.kind, r.k, r.n]), [['claude-gateway/model-a', 'abc', 'task', 1, 1], ['scripted', 'abc', 'task', 2, 3]])
    assert.deepEqual(rates[1].interval, wilson(2, 3))
    assert.deepEqual(excluded.map((e) => e.why), ['dirty build', 'no build commit', 'dirty build'])
  })

  test('a launch the resource gate refused is listed, never rated', () => {
    const refused = { ...row('scripted', 'fail', { commit: 'abc', dirty: false }), status: 'error', error: 'resource_refused: the team already runs 2 browsers' }
    const { rates, excluded } = passRates([refused])
    assert.deepEqual(rates, [])
    assert.deepEqual(excluded.map((e) => e.why), ['not started (resource refused)'])
  })
})

test('passRates: a skipped row is listed, never rated (CU-62); a simulated scale never shares a rate with scale 1 (CU-61)', async () => {
  const { passRates } = await import('../../_evaluators_/task-suite/lib.mjs')
  const build = { commit: 'abc', dirty: false, helper: '0.2.25' }
  const rows = [
    { runId: 'a', taskId: 't1', model: 'm', kind: 'task', build, verdict: 'pass', status: 'completed' },
    { runId: 'b', taskId: 't2', model: 'm', kind: 'task', build: { ...build, simulateScale: 2 }, verdict: 'fail', status: 'completed' },
    { runId: null, taskId: 't3', model: 'm', kind: 'task', build, verdict: 'skipped', status: 'skipped', reason: 'skipped: concealed clipboard' },
  ]
  const { rates, excluded } = passRates(rows)
  assert.equal(rates.length, 2, 'scale 1 and scale 2 are two groups')
  assert.deepEqual(rates.map((r) => [r.simulateScale ?? 1, r.k, r.n]).sort(), [[1, 1, 1], [2, 0, 1]])
  assert.deepEqual(excluded, [{ runId: null, taskId: 't3', model: 'm', why: 'skipped: concealed clipboard' }])
})

test('passRates: a simulated display is its own group (CU-70)', async () => {
  const { passRates } = await import('../../_evaluators_/task-suite/lib.mjs')
  const build = { commit: 'abc', dirty: false, helper: '0.2.25', simulateScale: 2 }
  const rows = [
    { runId: 'a', taskId: 't1', model: 'm', kind: 'task', build, verdict: 'pass', status: 'completed' },
    { runId: 'b', taskId: 't1', model: 'm', kind: 'task', build: { ...build, simulateDisplay: '1512x982' }, verdict: 'pass', status: 'completed' },
  ]
  assert.deepEqual(passRates(rows).rates.map((r) => r.simulateDisplay ?? 'full').sort(), ['1512x982', 'full'])
})

test('exclusions: readAllResults marks rows listed in results/exclusions.json; passRates lists them apart, never rated', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs')
  const { join } = await import('node:path')
  const { readAllResults } = await import('../../_evaluators_/task-suite/run.mjs')
  const dir = mkdtempSync('/tmp/cu-researcher-excl-')
  try {
    mkdirSync(join(dir, 'results'))
    const build = { commit: 'abc', dirty: false }
    const row = (runId, verdict) => JSON.stringify({ runId, taskId: 't', model: 'm', kind: 'task', build, verdict, status: 'completed' })
    writeFileSync(join(dir, 'results', 'a.jsonl'), [row('r1', 'pass'), row('r2', 'fail'), row('r3', 'fail')].join('\n') + '\n')
    writeFileSync(join(dir, 'results', 'exclusions.json'), JSON.stringify({ runs: { r2: 'overlay-affected: test', r3: 'invalid: test' } }))
    const rows = readAllResults(dir)
    assert.deepEqual(rows.map((r) => r.excluded ?? null), [null, 'overlay-affected: test', 'invalid: test'])
    const { rates, excluded } = passRates(rows)
    assert.deepEqual(rates.map((r) => [r.k, r.n]), [[1, 1]])
    assert.deepEqual(excluded.map((e) => [e.runId, e.why]), [['r2', 'overlay-affected: test'], ['r3', 'invalid: test']])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the committed exclusions list names only rows that exist in the results', async () => {
  const { readFileSync } = await import('node:fs')
  const { readAllResults } = await import('../../_evaluators_/task-suite/run.mjs')
  const listed = Object.keys(JSON.parse(readFileSync(new URL('../../_evaluators_/task-suite/results/exclusions.json', import.meta.url), 'utf8')).runs)
  const marked = new Set(readAllResults().filter((r) => r.excluded).map((r) => r.runId))
  assert.deepEqual(listed.filter((id) => !marked.has(id)), [], 'every listed runId matches a row')
})

test('passRates: pruneWithThinking allow is its own group (CU-84)', async () => {
  const { passRates } = await import('../../_evaluators_/task-suite/lib.mjs')
  const build = { commit: 'abc', dirty: false, helper: '0.2.28' }
  const rows = [
    { runId: 'a', taskId: 't1', model: 'm', kind: 'task', build, verdict: 'pass', status: 'completed' },
    { runId: 'b', taskId: 't1', model: 'm', kind: 'task', build: { ...build, pruneWithThinking: 'allow' }, verdict: 'fail', status: 'completed' },
  ]
  const rates = passRates(rows).rates
  assert.equal(rates.length, 2)
  assert.deepEqual(rates.map((r) => `${r.pruneWithThinking ?? 'skip'}:${r.k}/${r.n}`).sort(), ['allow:0/1', 'skip:1/1'])
})

test('D-057: rows of two answer rules never share a rate', () => {
  const row = (answerRule) => ({ model: 'm', kind: 'task', verdict: 'pass', build: { commit: 'c', dirty: false, ...(answerRule ? { answerRule } : {}) } })
  const { rates } = passRates([row(null), row('answer-line-1'), row('answer-line-1')])
  assert.equal(rates.length, 2)
  assert.deepEqual(rates.map((r) => [r.answerRule ?? null, r.n]).sort(), [['answer-line-1', 2], [null, 1]].sort())
})

