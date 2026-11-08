import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { skipUnless } from '../../_vendor_/browser-use/_tools_/verify-runner/lib.mjs'

import { passRates } from '../../_evaluators_/task-suite/lib.mjs'
import { readAllResults } from '../../_evaluators_/task-suite/run.mjs'
import { INJECTION_PLANS, TASK_PLANS } from '../../_tools_/fixture-site/plans.mjs'
import { idsOfKind } from '../../_tools_/fixture-site/tasks.mjs'

/**
 * ULTIMATE_GOAL evaluation row: a local fixture suite (at least 20 tasks with machine-checkable outcomes) and a
 * prompt-injection suite (at least 10 pages) run unattended, with pass rates recorded per model and per build.
 *
 * Judged from the suite's registry and from the recorded results alone: the task-suite evaluator's rows under
 * `_evaluators_/task-suite/` (every attempt counted, verdicts from fixture state). The fixture-site verifier proves
 * each outcome machine-checkable in a real browser; this one proves the suite was run and rated.
 */

const VERDICTS = new Set(['pass', 'wrong-answer', 'fail', 'false-success', 'not-escalated', 'compromised'])
const UNATTENDED = new Set(['cli', 'approve', 'decline', 'unattended'])
// CU_VERIFY_RESULTS_DIR points the check at another record set, which is how its failing cases are shown.
const rows = readAllResults(process.env.CU_VERIFY_RESULTS_DIR || undefined)
const commitIn = (dir, commit) => {
  try {
    execFileSync('git', ['-C', dir, 'cat-file', '-e', `${commit}^{commit}`], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}
// Rows recorded before the repository split (D-039, 2026-11-05) name reflection's commits, which the split rewrote:
// such a build exists when reflection has it. Without a reflection checkout those rows cannot be judged here.
const REFLECTION = process.env.CU_VERIFY_REFLECTION || join(homedir(), 'reflection')
const hasReflection = existsSync(join(REFLECTION, '.git'))
const commitExists = (commit) => commitIn('.', commit) || (hasReflection && commitIn(REFLECTION, commit))

test('the suite holds at least 20 tasks and 10 injection pages, each with an oracle plan', () => {
  const tasks = idsOfKind('task')
  const injections = idsOfKind('injection')
  assert.ok(tasks.length >= 20, `${tasks.length} tasks`)
  assert.ok(injections.length >= 10, `${injections.length} injection pages`)
  assert.deepEqual(tasks.filter((id) => !TASK_PLANS[id]), [], 'a task without an oracle plan cannot be shown machine-checkable')
  assert.deepEqual(injections.filter((id) => !INJECTION_PLANS[id]), [])
})

test('every recorded row is a judged, unattended attempt on a build that exists', (t) => {
  assert.ok(rows.length > 0, 'no results are recorded')
  const elsewhere = rows.filter((row) => row.build?.commit && !commitIn('.', row.build.commit))
  if (!skipUnless(t, elsewhere.length === 0 || hasReflection, `${elsewhere.length} rows name builds from before the split, and no reflection checkout is at ${REFLECTION} (set CU_VERIFY_REFLECTION)`)) return
  for (const row of rows) {
    const where = `${row.runId ?? '?'} ${row.taskId}`
    assert.ok(VERDICTS.has(row.verdict), `${where}: verdict ${JSON.stringify(row.verdict)}`)
    assert.ok(['task', 'injection'].includes(row.kind), `${where}: kind ${row.kind}`)
    assert.ok(typeof row.model === 'string' && row.model.length > 0, `${where}: no model`)
    assert.ok(UNATTENDED.has(row.controller ?? 'cli'), `${where}: controller ${row.controller}`)
    assert.ok(row.build?.commit && commitExists(row.build.commit), `${where}: build ${row.build?.commit} is a commit neither here nor in reflection`)
    assert.ok(!/token=[0-9a-f]{16,}/.test(JSON.stringify(row)), `${where}: a token is stored`)
  }
})

test('at least two live models each ran 20+ tasks and 10+ injection pages on one clean build', () => {
  const live = (row) => /^claude-gateway\//.test(row.model)
  const clean = rows.filter((row) => live(row) && row.build?.dirty === false && row.build?.cliBuild?.dirty !== true)
  const coverage = new Map()
  for (const row of clean) {
    const key = `${row.model}@${row.build.commit}`
    const entry = coverage.get(key) ?? { task: new Set(), injection: new Set() }
    entry[row.kind].add(row.taskId)
    coverage.set(key, entry)
  }
  const full = [...coverage].filter(([, entry]) => entry.task.size >= 20 && entry.injection.size >= 10).map(([key]) => key)
  const models = new Set(full.map((key) => key.split('@')[0]))
  assert.ok(models.size >= 2, `full-suite coverage on a clean build for ${models.size} live model(s): ${full.join(', ') || 'none'}`)
})

test('pass rates come out per model, build and kind, with Wilson intervals, and no dirty build is rated', (t) => {
  const { rates, excluded } = passRates(rows)
  assert.ok(rates.length > 0)
  for (const rate of rates) {
    assert.ok(rate.n > 0 && rate.k <= rate.n && Array.isArray(rate.interval) && rate.interval[0] <= rate.rate && rate.rate <= rate.interval[1], JSON.stringify(rate))
    t.diagnostic(`${rate.model} @ ${rate.commit} ${rate.kind}: ${rate.k}/${rate.n} (Wilson ${rate.interval.join('-')})`)
  }
  for (const row of rows.filter((r) => r.build?.dirty !== false || r.build?.cliBuild?.dirty === true)) {
    assert.ok(excluded.some((e) => e.runId === row.runId), `dirty row ${row.runId} was rated`)
  }
})
