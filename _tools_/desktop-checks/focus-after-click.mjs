#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { fitFactor, sizeAt } from '../../_environments_/macos-desktop/coords.mjs'
import { LAST_INPUT_NAME, OWN_ACTIVITY_SLACK_SECONDS, RUN_LOCK_DIR } from '../../_environments_/macos-desktop/run-lock.mjs'
import { BUNDLE_ID, buildFixtureApp } from '../desktop-fixture/build.mjs'
import { launchFixture } from '../desktop-fixture/client.mjs'
import { cleanEnvironment } from '../verify-kit/sut.mjs'
import { hidIdleSeconds } from './probes.mjs'

/**
 * CU-226, live: is a key or typed string right after a click judged on the focus from before the click took effect?
 * The loop judges a key with one focusedElement() read taken right after the helper answered the click, and nothing
 * waits for the app to move its focus. Each attempt is one `cli.mjs run --env macos-desktop --model scripted` on CU
 * Fixture, ending in one batch [click an entry, then a key]. Two routes (the plan is focus-after-click.md):
 *
 * - `type` (consent-cells, `copyRow`): [click the plain entry 'Password', type x]. Starts `none` (nothing focused) and
 *   `entry` (a first batch clicks the unnamed paste entry and types q - itself a click+type measurement).
 * - `return` (consent-keys, cu-verifier's submit route): [click Message, press Return], from focus in Notes (a first
 *   batch clicks Notes and types n). Message's window has the default button Send.
 *
 * The verdict is the fixture's own record (D-012): stale when x reached an entry, or when Send recorded 'sent'. The judged
 * target of the key's event is the diagnosis: fresh when it is the clicked entry. A disagreement is its own finding.
 *
 * Guards before any input: the seat holds the desktop (run-lock.mjs hold), no run is active, the owner has been idle
 * for at least 300 s (D-066); every input goes through CUHelper by the CLI (D-056) into CU Fixture only; a failed or
 * paused run stops the series. `--load N` runs N agent-core test suites in a loop beside the series (cu-researcher's
 * loaded series).
 *
 *   node _tools_/desktop-checks/focus-after-click.mjs --seat cu-<seat> [--route type|return] [--runs N]
 *     [--starts none,entry] [--load 0..4] [--runs-dir DIR]
 *
 * One JSON line per attempt, then a summary; exit 0 when every attempt ran, 1 when the series stopped, 2 when a guard
 * refused before any input.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const CLI = join(HERE, '..', 'agent-core', 'cli.mjs')
const RUN_LOCK = join(ROOT, '_environments_', 'macos-desktop', 'run-lock.mjs')
export const MIN_IDLE_SECONDS = 300
export const MEASURED_TEXT = 'x'

/** Each route: its screen, its starts, the entry clicked first per start, the measured click and key, and the read. */
export const ROUTES = Object.freeze({
  type: Object.freeze({ screen: 'consent-cells', params: { title: 'Import', copyRow: true }, starts: ['none', 'entry'], first: { entry: { target: 'paste-target', text: 'q' } }, click: 'password', key: { type: 'type', text: MEASURED_TEXT }, expected: 'Password' }),
  return: Object.freeze({ screen: 'consent-keys', params: { title: 'Messages' }, starts: ['notes'], first: { notes: { target: 'notes', text: 'n' } }, click: 'message', key: { type: 'keypress', keys: ['ENTER'] }, expected: 'Message' }),
})

/** The frame the scripted model's run gets (the primary display at its backing scale, no image limits) and its factor. */
export function frameOf(screen) {
  if (!(screen?.width > 0) || !(screen?.height > 0) || !(screen?.scale > 0)) return null
  const sizePt = { width: screen.width, height: screen.height }
  const factor = fitFactor(sizePt, screen.scale, {})
  return { frame: sizeAt(sizePt, factor), factor }
}

/** A target's centre in frame pixels: its window's content origin plus its centre, at the frame's factor. */
export function framePoint(name, targets, windows, factor) {
  const target = targets?.[name]
  const window = windows?.[target?.window]
  if (!target || !window || !Number.isFinite(window.x) || !Number.isFinite(target.cx)) return null
  return { x: Math.round((window.x + target.cx) * factor), y: Math.round((window.y + target.cy) * factor) }
}

/** The scripted plan of one attempt on `route` from `start`, or null when a target or the screen is missing. */
export function attemptPlan(route, start, targets, windows, screen) {
  const spec = ROUTES[route]
  if (!spec || !spec.starts.includes(start)) throw new Error(`route ${route} has the starts ${spec?.starts?.join(', ') ?? 'none'}`)
  const sized = frameOf(screen)
  if (sized === null) return null
  const at = framePoint(spec.click, targets, windows, sized.factor)
  const first = spec.first[start] ?? null
  const firstAt = first ? framePoint(first.target, targets, windows, sized.factor) : null
  if (at === null || (first && firstAt === null)) return null
  const turns = []
  if (first) turns.push({ actions: [{ type: 'click', button: 'left', ...firstAt }, { type: 'type', text: first.text }] })
  turns.push({ actions: [{ type: 'click', button: 'left', ...at }, { ...spec.key }] })
  turns.push({ final: 'measured' })
  return { frame: sized.frame, turns }
}

/**
 * What a run's events say about each key after a click: its judged target and verdict, in order (a performed action
 * logs a decision and an outcome; the first per step and index is kept). `afterClickMs` (cu-developer-one): from the
 * click's last record in the same step - written once the helper answered it - to the key's decision record, written
 * just after its focus read: an upper bound on how long the loop waited before that read.
 */
export function keyJudgements(eventsText) {
  const seen = new Set()
  const out = []
  const clickDone = new Map()
  for (const line of String(eventsText).split('\n')) {
    let event
    try { event = JSON.parse(line) } catch { continue }
    if (event?.kind !== 'action') continue
    if (event.action?.type === 'click') { clickDone.set(event.step, event.t); continue }
    if (event.action?.type !== 'type' && event.action?.type !== 'keypress') continue
    const key = `${event.step}:${event.index}`
    if (seen.has(key)) continue
    seen.add(key)
    const gap = Date.parse(event.t) - Date.parse(clickDone.get(event.step))
    out.push({ step: event.step ?? null, type: event.action.type, target: event.target ? { role: event.target.role ?? null, name: event.target.name ?? null } : null, decision: event.decision ?? null, rule: event.rule ?? null, class: event.class ?? null, afterClickMs: Number.isFinite(gap) ? gap : null })
  }
  return out
}

/** The diagnosis: fresh when the judged target is the entry the click aimed at; stale otherwise; missing with no event. */
export function readOf(judged, expected) {
  if (!judged) return 'missing'
  if (!/^AXText(Field|Area)$/.test(String(judged.target?.role ?? ''))) return 'stale'
  return judged.target?.name === expected ? 'fresh' : 'stale'
}

/** The verdict from the fixture's own record: did the key reach the clicked entry unasked? */
export function fixtureVerdict(route, facts) {
  if (route === 'return') {
    const events = Array.isArray(facts?.events) ? facts.events : null
    return events === null ? 'unknown' : events.some((event) => event?.type === 'sent') ? 'stale' : 'fresh'
  }
  const fields = facts?.fields
  if (typeof fields?.passwordText !== 'string') return 'unknown'
  return fields.passwordText.includes(MEASURED_TEXT) || String(fields.pasteTargetText ?? '').includes(MEASURED_TEXT) ? 'stale' : 'fresh'
}

/** One attempt's row: the fixture's verdict, the loop's diagnosis, and whether they disagree. */
export function attemptRow({ route, start, index, result, judgements, facts, label = 'quiet' }) {
  const spec = ROUTES[route]
  const measured = judgements[judgements.length - 1] ?? null
  const first = spec.first[start] ? (judgements.length > 1 ? judgements[0] : null) : null
  const verdict = fixtureVerdict(route, facts)
  const read = readOf(measured, spec.expected)
  return {
    route, start, index, label,
    runId: result?.runId ?? null,
    status: result?.status ?? null,
    verdict,
    measured: { read, ...(measured ?? {}) },
    disagree: verdict !== 'unknown' && read !== 'missing' && verdict !== read,
    ...(first || spec.first[start] ? { firstPair: { read: readOf(first, start === 'entry' ? '' : 'Notes'), ...(first ?? {}) } } : {}),
  }
}

/**
 * The upper end of a one-sided 95% interval for a rate seen `k` times in `n` (Clopper-Pearson, by bisection on the
 * binomial tail): 0 in 60 is about 0.049 - cu-verifier's detection bound, never 'no race'.
 */
export function upper95(k, n) {
  if (!Number.isInteger(n) || n < 1 || !Number.isInteger(k) || k < 0 || k > n) return null
  if (k === n) return 1
  const atMost = (p) => {
    let term = (1 - p) ** n
    let sum = term
    for (let i = 1; i <= k; i += 1) { term *= ((n - i + 1) / i) * (p / (1 - p)); sum += term }
    return sum
  }
  let lo = k / n
  let hi = 1
  for (let i = 0; i < 60; i += 1) { const mid = (lo + hi) / 2; if (atMost(mid) > 0.05) lo = mid; else hi = mid }
  return Math.round(hi * 1000) / 1000
}

/** The summary: verdicts and diagnoses per route, start and label, the stale and disagreeing runs, margins and bounds. */
export function summarize(rows) {
  const summary = { attempts: rows.length, groups: {}, staleRuns: [], disagreements: [], afterClickMs: null, bound: {} }
  const gaps = rows.map((row) => row.measured.afterClickMs).filter(Number.isFinite).sort((a, b) => a - b)
  for (const row of rows) {
    const g = (summary.groups[`${row.route}/${row.start}/${row.label}`] ??= { verdict: { fresh: 0, stale: 0, unknown: 0 }, read: { fresh: 0, stale: 0, missing: 0 } })
    g.verdict[row.verdict] += 1
    g.read[row.measured.read] += 1
    if (row.verdict === 'stale' || row.measured.read === 'stale') summary.staleRuns.push(row.runId)
    if (row.disagree) summary.disagreements.push(row.runId)
  }
  if (gaps.length > 0) summary.afterClickMs = { min: gaps[0], median: gaps[Math.floor(gaps.length / 2)], max: gaps[gaps.length - 1] }
  for (const route of new Set(rows.map((row) => row.route))) {
    const of = rows.filter((row) => row.route === route && row.verdict !== 'unknown')
    const stale = of.filter((row) => row.verdict === 'stale' || row.measured.read === 'stale').length
    summary.bound[route] = { stale, of: of.length, staleRateUpper95: upper95(stale, of.length) }
  }
  return summary
}

/**
 * A guard's refusal, or null: the seat must hold the desktop, and the owner must not have used the Mac - by the run
 * lock's own rule for a run inside its seat's hold (CU-204, CU-208): the idle time passes 300 s, or it reaches back to
 * the seat's own last activity (the hold's idle-checked start or the last input its runs posted; `sinceOwnSeconds`),
 * within the lock's slack. Our own runs post input too, so a second series in the same hold starts on that rule; each
 * run is checked by the lock the same way.
 */
export function guardRefusal({ seat, status, idleSeconds, sinceOwnSeconds = null }) {
  if (typeof seat !== 'string' || !/^cu-[a-z0-9-]+$/.test(seat)) return '--seat is required (the seat holding the desktop)'
  if (status?.hold?.seat !== seat) return `the desktop is not held by ${seat}: take the hold first (run-lock.mjs hold --seat ${seat} --minutes N)`
  if (status?.run) return `a run is active on the desktop (${status.run.seat}); wait for it`
  if (!Number.isFinite(idleSeconds)) return 'the idle time could not be read'
  const ownCovers = Number.isFinite(sinceOwnSeconds) && sinceOwnSeconds >= 0 && idleSeconds + OWN_ACTIVITY_SLACK_SECONDS >= sinceOwnSeconds
  if (idleSeconds < MIN_IDLE_SECONDS && !ownCovers) return `the Mac had local input ${Math.round(idleSeconds)} s ago, after this seat's own last activity; the owner may be at it (D-066 needs ${MIN_IDLE_SECONDS} s)`
  return null
}

/** Run the CLI once with the plan; resolves to the parsed result (or an error row). */
function cliRun({ seat, planPath, runsDir, spawnProcess = spawn }) {
  return new Promise((resolve) => {
    const args = [CLI, 'run', '--env', 'macos-desktop', '--app', BUNDLE_ID, '--seat', seat, '--task', 'CU-226 focus-after-click measurement (scripted)',
      '--model', 'scripted', '--plan', planPath, '--consent', 'unattended', '--runs-dir', runsDir, '--max-steps', '6', '--max-minutes', '2', '--max-cost', '0.01', '--no-live']
    const child = spawnProcess(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'], env: cleanEnvironment() })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr = (stderr + chunk).slice(-2000)))
    const timer = setTimeout(() => child.kill('SIGTERM'), 120_000)
    child.once('exit', (code) => {
      clearTimeout(timer)
      const text = stdout.trim()
      try { resolve(JSON.parse(text.slice(text.indexOf('{')))) } catch { resolve({ status: 'error', error: `no result JSON (exit ${code}): ${stderr.slice(-300)}` }) }
    })
  })
}

/** N looping agent-core suites as load beside the series; returns a stop function. */
function startLoad(count) {
  if (!(count > 0)) return () => {}
  const dir = join(ROOT, '_tests_', 'agent-core')
  const files = readdirSync(dir).filter((name) => name.endsWith('.test.mjs')).map((name) => join(dir, name))
  let stopped = false
  const children = new Set()
  const loop = () => {
    if (stopped) return
    const child = spawn(process.execPath, ['--test', ...files], { stdio: 'ignore' })
    children.add(child)
    child.once('exit', () => { children.delete(child); loop() })
  }
  for (let i = 0; i < count; i += 1) loop()
  return () => { stopped = true; for (const child of children) child.kill('SIGTERM') }
}

const lockStatus = () => JSON.parse(execFileSync(process.execPath, [RUN_LOCK, 'status'], { encoding: 'utf8' }))

/** Seconds since the seat's own last activity: its hold's start or its runs' last posted input, whichever is later. */
function sinceOwnActivity(seat, status, now = Date.now()) {
  let posted = NaN
  try {
    const last = JSON.parse(readFileSync(join(RUN_LOCK_DIR, LAST_INPUT_NAME), 'utf8'))
    if (last?.seat === seat) posted = Date.parse(last.at)
  } catch { /* no record: the hold's start alone */ }
  const started = Date.parse(status?.hold?.heldAt ?? status?.hold?.since)
  const own = Math.max(Number.isFinite(started) ? started : -Infinity, Number.isFinite(posted) ? posted : -Infinity)
  return Number.isFinite(own) ? (now - own) / 1000 : null
}

export async function main(argv = process.argv.slice(2), { write = (line) => process.stdout.write(`${line}\n`) } = {}) {
  const options = {}
  for (let i = 0; i < argv.length; i += 2) options[String(argv[i]).replace(/^--/, '')] = argv[i + 1]
  const seat = options.seat
  const route = options.route ?? 'type'
  const runs = Number(options.runs ?? 30)
  const load = Number(options.load ?? 0)
  const spec = ROUTES[route]
  const starts = spec ? String(options.starts ?? spec.starts.join(',')).split(',') : []
  if (!spec || !Number.isInteger(runs) || runs < 1 || runs > 60 || !Number.isInteger(load) || load < 0 || load > 4 || !starts.every((s) => spec.starts.includes(s))) {
    write(JSON.stringify({ refused: 'usage: --seat cu-<seat> [--route type|return] [--runs 1..60] [--starts ...] [--load 0..4] [--runs-dir DIR]' }))
    return 2
  }
  const status = lockStatus()
  const refused = guardRefusal({ seat, status, idleSeconds: await hidIdleSeconds(), sinceOwnSeconds: sinceOwnActivity(seat, status) })
  if (refused) { write(JSON.stringify({ refused })); return 2 }
  const runsDir = options['runs-dir'] ?? mkdtempSync('/tmp/cu-226-runs-')
  const label = load > 0 ? `loaded-${load}` : 'quiet'
  const built = buildFixtureApp()
  const rows = []
  const stopLoad = startLoad(load)
  const finish = (code, extra = {}) => { stopLoad(); write(JSON.stringify({ ...extra, summary: summarize(rows), runsDir })); return code }
  try {
    for (const start of starts) {
      for (let index = 0; index < runs; index += 1) {
        // Recorded, not judged: our own runs post input too; the run lock's own-activity rule (CU-204) and each run's
        // local-input pause decide whether the owner came back.
        const idle = await hidIdleSeconds()
        if (lockStatus()?.hold?.seat !== seat) return finish(1, { stopped: 'the hold ended', at: { start, index } })
        const fixture = await launchFixture(built.executable, { offscreen: false })
        try {
          await fixture.open(spec.screen, spec.params)
          await new Promise((done) => setTimeout(done, 400))
          const plan = attemptPlan(route, start, await fixture.targets(), await fixture.call('windows', {}), await fixture.call('screen', {}))
          if (plan === null) return finish(1, { stopped: 'a target or the screen could not be read', at: { start, index } })
          const planPath = join(runsDir, `plan-${route}-${start}-${label}-${index}.json`)
          writeFileSync(planPath, JSON.stringify(plan))
          const result = await cliRun({ seat, planPath, runsDir })
          let events = ''
          try { events = readFileSync(join(runsDir, String(result.runId), 'events.jsonl'), 'utf8') } catch { /* no run directory: the row says missing */ }
          const row = attemptRow({ route, start, index, result, judgements: keyJudgements(events), facts: await fixture.state(), label })
          row.idleBefore = Math.round(idle)
          rows.push(row)
          write(JSON.stringify(row))
          if (result.status === 'error' || /local input|owner_active|paused/i.test(JSON.stringify(result.error ?? ''))) {
            return finish(1, { stopped: 'the run failed or met local input', at: { start, index }, error: result.error ?? null })
          }
        } finally {
          await fixture.close()
        }
      }
    }
  } finally {
    stopLoad()
  }
  return finish(0)
}

// Real paths on both sides: through a symlink (/tmp is /private/tmp) argv[1] keeps the link (CU-79, entry-guards.test.mjs).
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) process.exitCode = await main()
