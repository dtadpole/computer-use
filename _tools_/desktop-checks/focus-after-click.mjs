#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { fitFactor, sizeAt } from '../../_environments_/macos-desktop/coords.mjs'
import { BUNDLE_ID, buildFixtureApp } from '../desktop-fixture/build.mjs'
import { launchFixture } from '../desktop-fixture/client.mjs'
import { cleanEnvironment } from '../verify-kit/sut.mjs'
import { hidIdleSeconds } from './probes.mjs'

/**
 * CU-226, live: is a key or typed string right after a click judged on the focus from before the click took effect?
 * The loop judges a `type` with one focusedElement() read taken right after the helper answered the click, and nothing
 * waits for the app to move its focus. Each attempt is one `cli.mjs run --env macos-desktop --model scripted` on CU
 * Fixture's consent-cells screen, with a batch [click the plain entry 'Password', type a letter]. The type event's
 * judged target says which read the loop used. 'Password' is fresh (the agent's own hand-off: password_field, declined
 * unattended, nothing typed). Anything else is stale: no target, or the entry that had the focus before.
 *
 * Starts: 'none' (nothing focused: the screen's default) and 'entry' (a first batch clicks the unnamed paste entry and
 * types a letter there, so focus starts in another entry; that first pair is recorded as a measurement too).
 *
 * Guards before any input (the plan is focus-after-click.md): the seat holds the desktop (run-lock.mjs hold), the owner
 * has been idle for at least 300 s (D-066), and every input goes through CUHelper by the CLI (D-056) into CU Fixture
 * only. The idle time is read again before every attempt; local input stops the series.
 *
 *   node _tools_/desktop-checks/focus-after-click.mjs --seat cu-<seat> [--runs N] [--starts none,entry] [--runs-dir DIR]
 *
 * It prints one JSON line per attempt and a summary line, and exits 0 when every attempt ran (fresh or stale), 1 when
 * the series stopped, 2 when a guard refused before any input.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const CLI = join(HERE, '..', 'agent-core', 'cli.mjs')
const RUN_LOCK = join(HERE, '..', '..', '_environments_', 'macos-desktop', 'run-lock.mjs')
export const STARTS = Object.freeze(['none', 'entry'])
export const MIN_IDLE_SECONDS = 300
export const MEASURED_TEXT = 'x'
const FIRST_TEXT = 'q'

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

/** The scripted plan of one attempt, or null when a target is missing. */
export function attemptPlan(start, targets, windows, screen) {
  if (!STARTS.includes(start)) throw new Error(`start is one of ${STARTS.join(', ')}`)
  const sized = frameOf(screen)
  if (sized === null) return null
  const password = framePoint('password', targets, windows, sized.factor)
  const entry = framePoint('paste-target', targets, windows, sized.factor)
  if (password === null || (start === 'entry' && entry === null)) return null
  const turns = []
  if (start === 'entry') turns.push({ actions: [{ type: 'click', button: 'left', ...entry }, { type: 'type', text: FIRST_TEXT }] })
  turns.push({ actions: [{ type: 'click', button: 'left', ...password }, { type: 'type', text: MEASURED_TEXT }] })
  turns.push({ final: 'measured' })
  return { frame: sized.frame, turns }
}

/**
 * What a run's events say: each `type` action's judged target and verdict, in order (a performed action logs two
 * events - its decision and its outcome - so the first per step and index is kept). `afterClickMs` (cu-developer-one):
 * from the last record of the click before it in the same step - written once the helper answered the click - to the
 * type's decision record, written just after its focus read; an upper bound on how long the loop waited before that read.
 */
export function typeJudgements(eventsText) {
  const seen = new Set()
  const out = []
  const clickDone = new Map()
  for (const line of String(eventsText).split('\n')) {
    let event
    try { event = JSON.parse(line) } catch { continue }
    if (event?.kind !== 'action') continue
    if (event.action?.type === 'click') { clickDone.set(event.step, event.t); continue }
    if (event.action?.type !== 'type') continue
    const key = `${event.step}:${event.index}`
    if (seen.has(key)) continue
    seen.add(key)
    const gap = Date.parse(event.t) - Date.parse(clickDone.get(event.step))
    out.push({ step: event.step ?? null, target: event.target ? { role: event.target.role ?? null, name: event.target.name ?? null } : null, decision: event.decision ?? null, rule: event.rule ?? null, class: event.class ?? null, afterClickMs: Number.isFinite(gap) ? gap : null })
  }
  return out
}

/** Fresh when the judged target is the entry the click aimed at; stale otherwise (no target, or another entry). */
export function readOf(judged, expected) {
  if (!judged) return 'missing'
  const name = judged.target?.name
  if (judged.target?.role !== 'AXTextField') return 'stale'
  return name === expected ? 'fresh' : 'stale'
}

/** One attempt's row from the run's result, its type judgements and the fixture's facts after it. */
export function attemptRow({ start, index, result, judgements, facts }) {
  const measured = judgements[judgements.length - 1] ?? null
  const first = start === 'entry' ? (judgements.length > 1 ? judgements[0] : null) : null
  return {
    start,
    index,
    runId: result?.runId ?? null,
    status: result?.status ?? null,
    measured: { read: readOf(measured, 'Password'), ...(measured ?? {}) },
    ...(start === 'entry' ? { firstPair: { read: readOf(first, ''), ...(first ?? {}) } } : {}),
    // Whether the letter reached the entry - only a stale read lets it through (a fresh read hands off).
    typedIntoPassword: typeof facts?.fields?.passwordText === 'string' ? facts.fields.passwordText.includes(MEASURED_TEXT) : null,
  }
}

/** The summary: fresh and stale reads per start, the stale run ids, and the first pairs of the 'entry' start. */
export function summarize(rows) {
  const summary = { attempts: rows.length, byStart: {}, staleRuns: [], firstPairs: { fresh: 0, stale: 0, missing: 0 }, afterClickMs: null }
  const gaps = rows.map((row) => row.measured.afterClickMs).filter(Number.isFinite).sort((a, b) => a - b)
  for (const row of rows) {
    const s = (summary.byStart[row.start] ??= { fresh: 0, stale: 0, missing: 0 })
    s[row.measured.read] += 1
    if (row.measured.read === 'stale') summary.staleRuns.push(row.runId)
    if (row.firstPair) summary.firstPairs[row.firstPair.read] += 1
  }
  if (gaps.length > 0) summary.afterClickMs = { min: gaps[0], median: gaps[Math.floor(gaps.length / 2)], max: gaps[gaps.length - 1] }
  return summary
}

/** A guard's refusal, or null: the seat must hold the desktop and the owner must have been idle long enough. */
export function guardRefusal({ seat, status, idleSeconds }) {
  if (typeof seat !== 'string' || !/^cu-[a-z0-9-]+$/.test(seat)) return '--seat is required (the seat holding the desktop)'
  if (status?.hold?.seat !== seat) return `the desktop is not held by ${seat}: take the hold first (run-lock.mjs hold --seat ${seat} --minutes N)`
  if (status?.run) return `a run is active on the desktop (${status.run.seat}); wait for it`
  if (!Number.isFinite(idleSeconds)) return 'the idle time could not be read'
  if (idleSeconds < MIN_IDLE_SECONDS) return `the Mac had local input ${Math.round(idleSeconds)} s ago; the owner may be at it (D-066 needs ${MIN_IDLE_SECONDS} s)`
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

const lockStatus = () => JSON.parse(execFileSync(process.execPath, [RUN_LOCK, 'status'], { encoding: 'utf8' }))

export async function main(argv = process.argv.slice(2), { write = (line) => process.stdout.write(`${line}\n`) } = {}) {
  const options = {}
  for (let i = 0; i < argv.length; i += 2) options[String(argv[i]).replace(/^--/, '')] = argv[i + 1]
  const seat = options.seat
  const runs = Number(options.runs ?? 30)
  const starts = String(options.starts ?? STARTS.join(',')).split(',')
  if (!Number.isInteger(runs) || runs < 1 || runs > 60 || !starts.every((s) => STARTS.includes(s))) {
    write(JSON.stringify({ refused: 'usage: --seat cu-<seat> [--runs 1..60] [--starts none,entry] [--runs-dir DIR]' }))
    return 2
  }
  const refused = guardRefusal({ seat, status: lockStatus(), idleSeconds: await hidIdleSeconds() })
  if (refused) { write(JSON.stringify({ refused })); return 2 }
  const runsDir = options['runs-dir'] ?? mkdtempSync('/tmp/cu-226-runs-')
  const built = buildFixtureApp()
  const rows = []
  for (const start of starts) {
    for (let index = 0; index < runs; index += 1) {
      // Recorded, not judged: our own runs post input too; the run lock's own-activity rule (CU-204) and each run's
      // local-input pause decide whether the owner came back.
      const idle = await hidIdleSeconds()
      const status = lockStatus()
      if (status?.hold?.seat !== seat) { write(JSON.stringify({ stopped: 'the hold ended', at: { start, index } })); write(JSON.stringify({ summary: summarize(rows), runsDir })); return 1 }
      const fixture = await launchFixture(built.executable, { offscreen: false })
      try {
        await fixture.open('consent-cells', { title: 'Import', copyRow: true })
        await new Promise((done) => setTimeout(done, 400))
        const plan = attemptPlan(start, await fixture.targets(), await fixture.call('windows', {}), await fixture.call('screen', {}))
        if (plan === null) { write(JSON.stringify({ stopped: 'a target or the screen could not be read', at: { start, index } })); return 1 }
        const planPath = join(runsDir, `plan-${start}-${index}.json`)
        writeFileSync(planPath, JSON.stringify(plan))
        const result = await cliRun({ seat, planPath, runsDir })
        let events = ''
        try { events = readFileSync(join(runsDir, String(result.runId), 'events.jsonl'), 'utf8') } catch { /* no run directory: the row says missing */ }
        const row = attemptRow({ start, index, result, judgements: typeJudgements(events), facts: await fixture.state() })
        row.idleBefore = Math.round(idle)
        rows.push(row)
        write(JSON.stringify(row))
        if (result.status === 'error' || /local input|owner_active|paused/i.test(JSON.stringify(result.error ?? ''))) {
          write(JSON.stringify({ stopped: 'the run failed or met local input', at: { start, index }, error: result.error ?? null }))
          write(JSON.stringify({ summary: summarize(rows), runsDir }))
          return 1
        }
      } finally {
        await fixture.close()
      }
    }
  }
  write(JSON.stringify({ summary: summarize(rows), runsDir }))
  return 0
}

// Real paths on both sides: through a symlink (/tmp is /private/tmp) argv[1] keeps the link (CU-79, entry-guards.test.mjs).
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) process.exitCode = await main()
