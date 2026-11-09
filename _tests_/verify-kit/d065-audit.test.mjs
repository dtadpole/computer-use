import assert from 'node:assert/strict'
import { test } from 'node:test'

import { auditCells, failingIds, parseD065Cells } from '../../_tools_/verify-kit/d065-audit.mjs'

const SOURCE = [
  "  ['cell-a', 'click', 'x', 'launch_code', 'note', 'D-065 (asserted, not live): reason; unit row: t.mjs; mutant: kit-a right-mutant', null],",
  "  ['cell-b', 'click', 'x', 'purchase', 'note', 'D-065 (asserted, not live): reason; mutant: kit-a wrong-mutant', null],",
  "  ['cell-c', 'click', 'x', 'delete', 'note', 'D-065 (asserted, not live): reason; mutant: kit-a missing-mutant', null],",
  "  ['cell-d', 'click', 'x', 'delete', 'note', 'D-065 (asserted, not live): a reason with no citation', null],",
  "  ['cell-e', 'click', 'x', 'delete', 'note', 'D-065 (asserted, not live): reason; mutant: table-mutants some-mutant', null],",
  "  ['cell-live', 'click', 'x', 'allow', 'note', 'cu-verifier run 20261109T000000Z-abcdef', null],",
].join('\n')

test('CU-324: only D-065 cells are read, with their cited verifier and mutant', () => {
  const cells = parseD065Cells(SOURCE, 't.mjs')
  assert.deepEqual(cells.map((c) => [c.id, c.verifier, c.mutant]), [
    ['cell-a', 'kit-a', 'right-mutant'], ['cell-b', 'kit-a', 'wrong-mutant'], ['cell-c', 'kit-a', 'missing-mutant'], ['cell-d', null, null],
    ['cell-e', 'table-mutants', 'some-mutant'],
  ])
})

test('CU-324: a citation holds only when the mutant exists and, applied alone, fails that cell (the deliberately wrong one is caught)', async () => {
  const cells = parseD065Cells(SOURCE, 't.mjs').filter((c) => c.id !== 'cell-e')
  const mutants = { 'right-mutant': { mutations: [{ file: 'p', find: 'a', replace: 'b' }] }, 'wrong-mutant': { mutations: [{ file: 'p', find: 'c', replace: 'd' }] } }
  const failsUnder = { 'right-mutant': ['cell-a'], 'wrong-mutant': [] }
  const result = await auditCells(cells, {
    loadMutant: async (_verifier, name) => mutants[name] ?? null,
    runWith: async (mutations) => failsUnder[Object.keys(mutants).find((k) => mutants[k].mutations === mutations)],
  })
  assert.equal(result.ok, false)
  assert.deepEqual(result.findings.map((f) => [f.id, f.problem]), [
    ['cell-c', 'cited mutant does not exist'], ['cell-d', 'no mutant cited'], ['cell-b', 'the mutant leaves this row passing'],
  ])
})

test('CU-324: every cell holding gives ok', async () => {
  const cells = parseD065Cells(SOURCE.split('\n')[0], 't.mjs')
  const result = await auditCells(cells, { loadMutant: async () => ({ mutations: [] }), runWith: async () => ['cell-a'] })
  assert.deepEqual(result, { ok: true, findings: [] })
})

test('CU-324: failing row titles map back to cell ids, never to a cell whose id is a prefix of another', () => {
  const cells = [{ id: 'appstore-get' }, { id: 'appstore-get-free' }]
  assert.deepEqual(failingIds(['appstore-get-free asks purchase'], cells), ['appstore-get-free'])
})

test('CU-324: a table-mutants citation loads from _tests_/agent-core/table-mutants.mjs (TABLE_MUTANTS; a from-reference resolves; absent = missing)', async () => {
  const { repoAdapters } = await import('../../_tools_/verify-kit/d065-audit.mjs')
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  const root = mkdtempSync(join((await import('node:os')).tmpdir(), 'd065-'))
  mkdirSync(join(root, '_tests_', 'agent-core'), { recursive: true })
  writeFileSync(join(root, '_tests_', 'agent-core', 'table-mutants.mjs'),
    "export const TABLE_MUTANTS = [{ name: 'm1', mutations: [{ file: 'a', find: 'x', replace: 'y' }] }, { name: 'm2', from: 'kit-b', rows: ['r'] }]\n")
  mkdirSync(join(root, '_verifiers_', 'kit-b'), { recursive: true })
  writeFileSync(join(root, '_verifiers_', 'kit-b', 'mutants.mjs'), "export const MUTANTS = [{ name: 'm2', mutations: [{ file: 'b', find: 'p', replace: 'q' }] }]\n")
  const { loadMutant } = repoAdapters(root)
  assert.equal((await loadMutant('table-mutants', 'm1'))?.name, 'm1')
  assert.equal(await loadMutant('table-mutants', 'nope'), null)
  assert.equal((await loadMutant('table-mutants', 'm2'))?.mutations?.[0]?.file, 'b', 'a from-reference resolves to the verifier mutant')
  assert.equal(await loadMutant('no-such-verifier', 'm1'), null)
})
