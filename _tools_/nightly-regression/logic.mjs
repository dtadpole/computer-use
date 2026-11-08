// The nightly regression's pure parts (CU-59): arguments, the step plan, reading node --test and verifier output,
// classifying a step from its first run and its one retry, the persistent flake list, and the report.
// nightly.mjs does the side effects (git worktree, child processes, the desktop-run lock, files).

/** Verifiers that run on the fake helper: no CUHelper, no fixture app, so no lock. */
export const PHASE1_VERIFIERS = Object.freeze([
  'evaluation-suite', 'desktop-perception', 'desktop-action-contract', 'desktop-consent',
  'desktop-agent-loop', 'desktop-trajectory', 'desktop-integration', 'desktop-human-control',
])
/** Verifiers that start CU Fixture or the ad-hoc CUHelper: phase 2, under the desktop-run lock. */
export const PHASE2_VERIFIERS = Object.freeze(['desktop-fixture', 'desktop-helper-protocol', 'desktop-helper-dryrun'])
/** node --test suites that start CUHelper or CU Fixture: phase 2. */
export const LOCKED_SUITES = Object.freeze(['macos-helper', 'desktop-suite'])

/** Seconds per attempt before the step's process group is killed. */
export const TIMEOUTS = Object.freeze({
  'node-tests': 300,
  'node-tests-helper': 300,
  'node-tests-fixture': 180,
  verifier: 120,
  'verifier:desktop-fixture': 300,
})

const DEFAULTS = Object.freeze({
  repo: null, ref: 'origin/main', out: '/tmp/cu-nightly', fetch: true, nodeOnly: false, lockWait: 900,
  yieldFlag: null, onLock: null, onRelease: null, keepWorktree: false, seat: 'cu-integrator', lockDir: null, help: false,
})
const VALUE_FLAGS = Object.freeze({
  '--repo': 'repo', '--ref': 'ref', '--out': 'out', '--lock-wait': 'lockWait', '--yield-flag': 'yieldFlag',
  '--on-lock': 'onLock', '--on-release': 'onRelease', '--seat': 'seat', '--lock-dir': 'lockDir',
})
const BOOL_FLAGS = Object.freeze({
  '--no-fetch': ['fetch', false], '--node-only': ['nodeOnly', true], '--keep-worktree': ['keepWorktree', true], '--help': ['help', true],
})
const PATH_OPTIONS = Object.freeze({ repo: '--repo', out: '--out', yieldFlag: '--yield-flag', lockDir: '--lock-dir' })

/** Parse the command line; throws an Error with a one-line message on a bad argument. */
export function parseArgs(argv) {
  const opts = { ...DEFAULTS }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (Object.hasOwn(BOOL_FLAGS, arg)) {
      const [key, value] = BOOL_FLAGS[arg]
      opts[key] = value
      continue
    }
    if (Object.hasOwn(VALUE_FLAGS, arg)) {
      const value = argv[i + 1]
      if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`)
      opts[VALUE_FLAGS[arg]] = value
      i++
      continue
    }
    throw new Error(`unknown argument ${arg}`)
  }
  const wait = Number(opts.lockWait)
  if (!Number.isInteger(wait) || wait < 0) throw new Error('--lock-wait needs whole seconds')
  opts.lockWait = wait
  for (const [key, flag] of Object.entries(PATH_OPTIONS)) {
    if (opts[key] !== null && !opts[key].startsWith('/')) throw new Error(`${flag} needs an absolute path`)
  }
  return opts
}

const suiteOf = (file) => file.split('/')[1]

/**
 * The run's steps from the files on the tested head: `testFiles` are paths like `_tests_/agent-core/x.test.mjs`,
 * `verifiers` the names of `_verifiers_/<name>/` folders that hold a verify.sh. Phase 1 needs no lock.
 */
export function buildSteps({ testFiles, verifiers }) {
  const present = new Set(verifiers)
  const tests = [...testFiles].sort()
  const steps = []
  const unlocked = tests.filter((f) => !LOCKED_SUITES.includes(suiteOf(f)))
  if (unlocked.length) steps.push({ name: 'node-tests', phase: 1, kind: 'node', files: unlocked, timeout: TIMEOUTS['node-tests'] })
  for (const v of PHASE1_VERIFIERS) {
    if (present.has(v)) steps.push({ name: `verifier:${v}`, phase: 1, kind: 'verifier', verifier: v, timeout: TIMEOUTS.verifier })
  }
  const helper = tests.filter((f) => suiteOf(f) === 'macos-helper')
  if (helper.length) steps.push({ name: 'node-tests-helper', phase: 2, kind: 'node', files: helper, timeout: TIMEOUTS['node-tests-helper'] })
  const fixture = tests.filter((f) => suiteOf(f) === 'desktop-suite')
  if (fixture.length) steps.push({ name: 'node-tests-fixture', phase: 2, kind: 'node', files: fixture, timeout: TIMEOUTS['node-tests-fixture'] })
  for (const v of PHASE2_VERIFIERS) {
    if (present.has(v)) {
      steps.push({ name: `verifier:${v}`, phase: 2, kind: 'verifier', verifier: v, timeout: TIMEOUTS[`verifier:${v}`] ?? TIMEOUTS.verifier })
    }
  }
  return steps
}

const FAIL_LINE = /^\s*✖\s+(.+?)\s+\(\d+(?:\.\d+)?m?s\)\s*$/

/** The names of failed tests and suites in node --test's spec output, first occurrence order, without repeats. */
export function failingTests(text) {
  const names = []
  for (const line of String(text).split('\n')) {
    const m = FAIL_LINE.exec(line)
    if (m && !names.includes(m[1])) names.push(m[1])
  }
  return names
}

/** node --test's closing counts: `{ tests, suites, pass, fail, cancelled, skipped, todo }` (those printed). */
export function nodeCounts(text) {
  const counts = {}
  for (const m of String(text).matchAll(/^ℹ (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)\s*$/gm)) counts[m[1]] = Number(m[2])
  return counts
}

/** A verifier's last `verdict ...` line, or null. */
export function verdictOf(text) {
  const lines = String(text).split('\n').filter((l) => /^verdict\b/.test(l))
  return lines.length ? lines.at(-1).trim() : null
}

/** pass: the first run passed; flake: it failed and the one retry passed; fail: both failed; skipped: never ran. */
export function classify(first, retry) {
  if (!first) return 'skipped'
  if (first.exit === 0) return 'pass'
  if (retry && retry.exit === 0) return 'flake'
  return 'fail'
}

/** One step's detail for the report: counts for node steps, the verdict for verifiers, the reason when skipped. */
export function detailOf(result) {
  if (result.status === 'skipped') return result.reason ?? 'skipped'
  const last = result.attempts.at(-1)
  const timedOut = last.timedOut ? ' (timed out)' : ''
  if (result.kind === 'node') {
    const c = last.counts ?? {}
    return c.tests !== undefined ? `${c.pass ?? 0}/${c.tests}${timedOut}` : `exit ${last.exit}${timedOut}`
  }
  return `${last.verdict ? last.verdict.slice(0, 90) : `exit ${last.exit}`}${timedOut}`
}

/**
 * The flake list after this run: one entry per `step :: test` that failed on the first run of a step that then
 * passed on its retry (the whole step when no test name was printed). Returns a new object; `list` is unchanged.
 */
export function mergeFlakes(list, { results, head, at }) {
  const next = structuredClone(list ?? {})
  for (const r of results) {
    if (r.status !== 'flake') continue
    const failing = r.attempts[0].failing ?? []
    for (const test of failing.length ? failing : ['(whole step)']) {
      const key = `${r.name} :: ${test}`
      const entry = next[key] ?? { step: r.name, test, count: 0, firstSeen: at, lastSeen: at, heads: [] }
      entry.count += 1
      entry.lastSeen = at
      entry.heads = [...entry.heads.filter((h) => h !== head), head].slice(-5)
      next[key] = entry
    }
  }
  return next
}

/** RED (exit 1) on any failure; PARTIAL (exit 3) when a step was skipped; else GREEN (exit 0), flaky or not. */
export function overall(results) {
  if (results.some((r) => r.status === 'fail')) return { verdict: 'RED', exit: 1 }
  if (results.some((r) => r.status === 'skipped')) return { verdict: 'PARTIAL', exit: 3 }
  return { verdict: results.some((r) => r.status === 'flake') ? 'GREEN (flaky)' : 'GREEN', exit: 0 }
}

/** The one line that goes to cu-coordinator. */
export function summaryLine(run) {
  const byName = new Map(run.results.map((r) => [r.name, r]))
  const part = (name, label) => (byName.has(name) ? `${label} ${detailOf(byName.get(name))}` : null)
  const verifiers = run.results.filter((r) => r.kind === 'verifier')
  const ran = verifiers.filter((r) => r.status !== 'skipped')
  const ok = ran.filter((r) => r.status === 'pass' || r.status === 'flake')
  const skipped = verifiers.length - ran.length
  const flaky = run.results.filter((r) => r.status === 'flake').length
  const bits = [
    part('node-tests', 'node'),
    part('node-tests-helper', 'macos-helper'),
    part('node-tests-fixture', 'desktop-suite'),
    verifiers.length ? `verifiers ${ok.length}/${verifiers.length}${skipped ? ` (${skipped} skipped)` : ''}` : null,
    `flaky steps ${flaky}`,
  ].filter(Boolean)
  return `nightly ${run.head.slice(0, 9)} ${run.verdict}: ${bits.join(', ')}`
}

const seconds = (r) => (r.attempts ?? []).reduce((sum, a) => sum + (a.seconds ?? 0), 0).toFixed(1)
const cell = (s) => String(s).replace(/\|/g, '\\|')

/** The short markdown report: header, one row per step, this run's flakes and the flake list. */
export function renderReport(run, flakes) {
  const lines = [
    `# Nightly regression - ${run.ref} ${run.head.slice(0, 9)} - ${run.verdict}`,
    '',
    `${run.startedAt} to ${run.finishedAt}. No model, no Chrome, a private CU_HOME; phase 2 under the desktop-run lock as ${run.seat} (${run.lockNote}).`,
    '',
    summaryLine(run),
    '',
    '| Step | Phase | Result | Detail | Seconds |',
    '|---|---|---|---|---|',
    ...run.results.map((r) => `| ${r.name} | ${r.phase} | ${r.status} | ${cell(detailOf(r))} | ${seconds(r)} |`),
    '',
  ]
  const thisRun = run.results.filter((r) => r.status === 'flake')
  lines.push(thisRun.length
    ? `Flaky steps this run: ${thisRun.map((r) => `${r.name} (${(r.attempts[0].failing ?? []).join('; ') || 'whole step'})`).join(', ')}.`
    : 'Flaky steps this run: none.')
  const all = Object.values(flakes ?? {}).sort((a, b) => b.count - a.count || b.lastSeen.localeCompare(a.lastSeen))
  if (all.length) {
    lines.push('', 'Flake list, all runs, most frequent first:', '')
    for (const f of all.slice(0, 10)) lines.push(`- ${f.step} :: ${f.test} - ${f.count}x, last ${f.lastSeen} on ${f.heads.at(-1)?.slice(0, 9) ?? '?'}`)
    if (all.length > 10) lines.push(`- and ${all.length - 10} more in flakes.json`)
  } else {
    lines.push('Flake list, all runs: empty.')
  }
  if (run.killed?.length) lines.push('', `Killed leftover processes: ${run.killed.join(' ')}.`)
  return `${lines.join('\n')}\n`
}

const MODEL_ENV = /^(ANTHROPIC|OPENAI|DEEPSEEK|GEMINI|GOOGLE|MISTRAL|OPENROUTER|XAI|GROQ|AZURE_OPENAI|COHERE)_|(^|_)API_KEY$/
// Set by node --test in its children; inherited, it turns a step's own node --test into a silent child run.
const RUNNER_ENV = new Set(['NODE_TEST_CONTEXT'])

/** The children's environment: the parent's without model keys or a test runner's context, plus `extra`. */
export function strippedEnv(env, extra = {}) {
  const out = {}
  for (const [k, v] of Object.entries(env)) if (!MODEL_ENV.test(k) && !RUNNER_ENV.has(k)) out[k] = v
  return { ...out, ...extra }
}
