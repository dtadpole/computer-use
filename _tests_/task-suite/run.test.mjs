import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { buildOf, chooseTasks, classesOf, decide, parseResult, readAllResults, redactTokens } from '../../_evaluators_/task-suite/run.mjs'

describe('task-suite harness parts', () => {
  test('the CLI result is parsed whole, pretty-printed or not', () => {
    const result = { runId: 'r1', status: 'completed', finalMessage: 'Done.' }
    assert.deepEqual(parseResult({ code: 0, stdout: JSON.stringify(result, null, 2), stderr: '' }), result)
    assert.deepEqual(parseResult({ code: 0, stdout: JSON.stringify(result), stderr: '' }), result)
  })

  test('without a result, the error keeps stderr with every token redacted', () => {
    const parsed = parseResult({ code: 1, stdout: '', stderr: 'live view (control): http://127.0.0.1:5/?token=04498e65498085f3\nboom' })
    assert.equal(parsed.status, 'error')
    assert.ok(!parsed.error.includes('04498e65498085f3'))
    assert.match(parsed.error, /token=\[redacted\]/)
    assert.equal(redactTokens('a?token=abc&b=1 token=x.y'), 'a?token=[redacted]&b=1 token=[redacted]')
  })

  test('buildOf reads a commit and a dirty flag from git, or nulls outside a repository', () => {
    const build = buildOf(new URL('../../', import.meta.url).pathname)
    assert.match(build.commit, /^[0-9a-f]{9}$/)
    assert.equal(typeof build.dirty, 'boolean')
    assert.deepEqual(buildOf('/tmp'), { commit: null, dirty: null })
  })
})

describe('task choice, the person\'s answers and results files', () => {
  const catalogue = [{ id: 'a', kind: 'task' }, { id: 'b', kind: 'task' }, { id: 'inj-x', kind: 'injection' }, { id: 'p', kind: 'probe' }]

  test('chooseTasks: default, all, tasks, injections, or a list', () => {
    assert.deepEqual(chooseTasks(undefined, catalogue), ['pickup-details', 'visitor-badge', 'filters-search'])
    assert.deepEqual(chooseTasks('all', catalogue), ['a', 'b', 'inj-x'])
    assert.deepEqual(chooseTasks('tasks', catalogue), ['a', 'b'])
    assert.deepEqual(chooseTasks('injections', catalogue), ['inj-x'])
    assert.deepEqual(chooseTasks('b,a', catalogue), ['b', 'a'])
  })

  test('decide approves only the classes the task itself needs, and only in approve mode', () => {
    const task = { consent: { classes: ['purchase'] } }
    assert.equal(decide('approve', task, { class: 'purchase' }), true)
    assert.equal(decide('approve', task, { class: 'escalation' }), false)
    assert.equal(decide('approve', { consent: null }, { class: 'purchase' }), false)
    assert.equal(decide('decline', task, { class: 'purchase' }), false)
  })

  test('#270: readAllResults applies a verdict correction from exclusions.json, keeping the original as rescoredFrom', () => {
    const dir = mkdtempSync('/tmp/cu-researcher-rescore-test-')
    try {
      mkdirSync(join(dir, 'results'))
      writeFileSync(join(dir, 'results', 'a.jsonl'), '{"runId":"r1","verdict":"pass"}\n{"runId":"r2","verdict":"pass"}\n')
      writeFileSync(join(dir, 'results', 'exclusions.json'), JSON.stringify({ runs: {}, verdicts: { r1: { verdict: 'wrong-answer', reason: 'hedged answer' } } }))
      const [r1, r2] = readAllResults(dir)
      assert.deepEqual([r1.verdict, r1.rescoredFrom, r1.rescoreReason], ['wrong-answer', 'pass', 'hedged answer'])
      assert.equal(r2.verdict, 'pass')
      assert.equal(r2.rescoredFrom, undefined)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
  test('readAllResults reads results.jsonl and every file under results/', () => {
    const dir = mkdtempSync('/tmp/cu-verifier-results-test-')
    try {
      writeFileSync(join(dir, 'results.jsonl'), '{"n":1}\n')
      mkdirSync(join(dir, 'results'))
      writeFileSync(join(dir, 'results', '2026-11-01-cu-researcher-full.jsonl'), '{"n":2}\n{"n":3}\n')
      writeFileSync(join(dir, 'results', 'notes.txt'), 'ignored')
      assert.deepEqual(readAllResults(dir).map((r) => r.n), [1, 2, 3])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('a request naming several classes is approved when any of them is the task\'s', () => {
    assert.deepEqual(classesOf({ class: 'delete', classes: ['delete', 'page_dialog'] }), ['delete', 'page_dialog'])
    assert.deepEqual(classesOf({ class: 'purchase' }), ['purchase'])
    assert.deepEqual(classesOf({}), [])
    assert.equal(decide('approve', { consent: { classes: ['page_dialog'] } }, { class: 'delete', classes: ['delete', 'page_dialog'] }), true)
  })
})
