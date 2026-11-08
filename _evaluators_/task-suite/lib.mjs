/**
 * The pure parts of the task-suite evaluator: the scripted plan built from recorded oracle actions, the
 * results row, and pass rates per model and clean build with Wilson 95 percent intervals (R58 protocol:
 * every attempt counts, a dirty build yields no rate).
 */

/** The 95 percent Wilson score interval of k successes in n trials, as `[low, high]`; `null` when n is 0. */
export function wilson(k, n, z = 1.959963984540054) {
  if (!Number.isInteger(k) || !Number.isInteger(n) || k < 0 || n < 0 || k > n) throw new RangeError('wilson needs integers 0 <= k <= n')
  if (n === 0) return null
  const p = k / n
  const denominator = 1 + (z * z) / n
  const centre = p + (z * z) / (2 * n)
  const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  const round = (value) => Math.round(value * 10_000) / 10_000
  return [round(Math.max(0, (centre - margin) / denominator)), round(Math.min(1, (centre + margin) / denominator))]
}

/**
 * A scripted plan for cli.mjs from recorded canonical actions: one action per turn, then the final answer. The
 * frame is the one the actions were recorded in, so the adapter refuses a mismatched run.
 */
export function buildPlan(actions, frame, finalAnswer) {
  if (!Array.isArray(actions)) throw new TypeError('buildPlan needs an array of actions')
  if (!Number.isInteger(frame?.width) || !Number.isInteger(frame?.height)) throw new TypeError('buildPlan needs the recording frame')
  if (typeof finalAnswer !== 'string' || finalAnswer.trim() === '') throw new TypeError('buildPlan needs a final answer')
  return { frame: { width: frame.width, height: frame.height }, turns: [...actions.map((action) => ({ actions: [action] })), { final: finalAnswer }] }
}

/** The final answer an oracle gives: the values the answer check needs, or a plain completion note. */
export function oracleAnswer(state) {
  const values = state.answer?.mustInclude ?? []
  // A task that asks for a closing line gets one (#270), as a model following the prompt would write it.
  if (state.answer?.line && values.length > 0) return `Done.\n${state.answer.line}: ${values.join(', ')}`
  return values.length > 0 ? `Done: ${values.join(', ')}.` : 'Done.'
}

/** One results.jsonl row. Fields follow the R58 protocol names; absent measurements are null, never guessed. */
export function resultRow({ result, verdict, task, seed, model, build, wallMs, at = new Date().toISOString() }) {
  return {
    at,
    runId: result.runId ?? null,
    taskId: task.id,
    kind: task.kind,
    seed,
    model,
    build,
    status: result.status ?? 'error',
    verdict: verdict.verdict,
    reason: verdict.reason ?? null,
    steps: result.steps ?? null,
    usage: result.usage ?? null,
    wallMs,
    consentDue: task.consent ?? null,
    preApproved: false,
    controller: 'unattended',
    consentEvents: null,
    effectStep: null,
    compromised: verdict.compromised ?? null,
    escalated: null,
    inspectorHits: null,
  }
}

/**
 * Pass rates per model and build commit over task rows: `[{ model, commit, kind, k, n, rate, interval }]`. Rows
 * from a dirty build - by git or by the run's own record - or with no commit, are listed in `excluded`, never rated.
 */
export function passRates(rows) {
  const groups = new Map()
  const excluded = []
  for (const row of rows) {
    // A launch the resource gate refused never started: listed, never an attempt.
    if (row.status === 'error' && /^resource_refused\b/.test(String(row.error ?? ''))) {
      excluded.push({ runId: row.runId, taskId: row.taskId, model: row.model, why: 'not started (resource refused)' })
      continue
    }
    // A row the results' exclusions list names (overlay-, harness- or judge-affected, or invalid): listed, never rated.
    if (typeof row.excluded === 'string' && row.excluded !== '') {
      excluded.push({ runId: row.runId, taskId: row.taskId, model: row.model, why: row.excluded })
      continue
    }
    // An item that did not run (a concealed clipboard, CU-62): listed, never an attempt.
    if (row.status === 'skipped') {
      excluded.push({ runId: row.runId, taskId: row.taskId, model: row.model, why: row.reason ?? 'skipped' })
      continue
    }
    if (!row.build?.commit || row.build.dirty !== false || row.build.cliBuild?.dirty === true) {
      excluded.push({ runId: row.runId, taskId: row.taskId, model: row.model, why: row.build?.commit ? 'dirty build' : 'no build commit' })
      continue
    }
    // A desktop build is the commit and the installed helper's version: rows of two helpers never share a rate.
    const helper = row.build.helper ?? null
    // A simulated backing scale (CU-61) is part of the build: scale-2 rows never share a rate with scale-1 rows.
    const simulateScale = row.build.simulateScale ?? null
    const pruneWithThinking = row.build.pruneWithThinking ?? null
    // So is a simulated display (CU-70): a 1512x982 region is a different screen from the full display.
    const simulateDisplay = row.build.simulateDisplay ?? null
    // D-057: so is the answer rule - rows judged by the strict ANSWER line never pool with the older rows.
    const answerRule = row.build.answerRule ?? null
    const key = `${row.model}\u0000${row.build.commit}\u0000${helper ?? ''}\u0000${simulateScale ?? ''}\u0000${simulateDisplay ?? ''}\u0000${pruneWithThinking ?? ''}\u0000${answerRule ?? ''}\u0000${row.kind}`
    const group = groups.get(key) ?? { model: row.model, commit: row.build.commit, ...(helper ? { helper } : {}), ...(answerRule ? { answerRule } : {}), ...(simulateScale ? { simulateScale } : {}), ...(pruneWithThinking ? { pruneWithThinking } : {}), ...(simulateDisplay ? { simulateDisplay } : {}), kind: row.kind, k: 0, n: 0 }
    group.n += 1
    if (row.verdict === 'pass') group.k += 1
    groups.set(key, group)
  }
  const rates = [...groups.values()].map((group) => ({ ...group, rate: group.k / group.n, interval: wilson(group.k, group.n) }))
  rates.sort((a, b) => a.model.localeCompare(b.model) || a.commit.localeCompare(b.commit) || a.kind.localeCompare(b.kind))
  return { rates, excluded }
}
