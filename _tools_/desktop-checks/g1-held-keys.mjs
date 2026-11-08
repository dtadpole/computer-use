#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { bundleVersion, hidIdleSeconds, onScreenWindows, processInfo, readMarker, sessionFlags, shiftDown } from './probes.mjs'

/**
 * CU-64 G1, live: a helper killed in the middle of a hold leaves Shift down in the owner's session, and the next
 * helper's start releases it (CU-94; the plan and its review are in g1-held-keys.md). The check holds the owner's
 * Shift on purpose, so it is guarded before it acts and never leaves without trying to put Shift back up.
 *
 * Every run - A (the hold), B (the release), the fallback press - is `cli.mjs run --env macos-desktop --model
 * scripted` in a child process: the helper's peer check accepts only the compiled entry points (PeerCheck.swift, D-029
 * a, design 0.3.3), so a run started from this script's own process would be refused before its hello. The children run
 * with CU_HOME set to the private home and `--held-marker` under it.
 *
 * - preconditions, all before any input: no step 4 within 30 minutes (an argument, or it refuses), 300 s of no local
 *   input (HID idle time), Shift up, a private CU_HOME (absolute, no whitespace, not the owner's, no stale marker), an
 *   alert route to a person, the installed helper (0.2.31+) linked into the private home, copies of the owner's own
 *   tty 'always' record for CU Fixture (nothing granted: D-033, D-038), and hold_key in the driver's action list;
 * - run A holds SHIFT for 5 s on CU Fixture; about 1 s in, its helper is killed only when, re-read right before the
 *   kill: the marker names a pid, ps shows that pid, its comm is the installed CUHelper's real path (whole), the value
 *   after `--socket` is under realpath(cu-home)/run/, and run A has neither ended nor reported local input;
 * - right after the kill Shift must read DOWN, else the result is inconclusive (the hazard was not reproduced);
 * - run B (waits only) must release it: its helper rewrites the marker at start, then Shift is up;
 * - a fallback (a run that presses Shift once; its helper's start also releases what the marker names) comes 5 s
 *   after the kill or 3 s after run B's helper, and if Shift is still down the alert names the human fix;
 * - `--rehearse` stops at the kill decision, reports it and kills nothing; the hold ends by itself.
 *
 * Every effect goes through `deps`, so the logic is tested on fakes; the defaults are the real ones.
 */

export const FIXTURE_BUNDLE_ID = 'ai.reflection.cu.fixture'
export const MIN_HELPER_VERSION = '0.2.31'
export const IDLE_MIN_SECONDS = 300
export const STEP4_MARGIN_MS = 30 * 60 * 1000
export const HOLD_MS = 5000
export const KILL_AFTER_MS = 1000
/** A CLI run starts node, the helper and a first capture before its hold: the marker may take this long to appear. */
export const HOLD_SEEN_WITHIN_MS = 20_000
export const RELEASE_WAIT_MS = 3000
/** From the kill: past this the fallback puts Shift back up whatever run B is doing. */
export const FALLBACK_AFTER_KILL_MS = 5000
export const NORMAL_RELEASE_MS = 4000
/** Run B needs the run lock run A holds until it exits; run A is ended for it after this (Shift is down meanwhile). */
export const A_END_WAIT_MS = 2000
/** How long the check looks for CU Fixture's window after opening its screen, and how often. */
export const FIXTURE_WINDOW_WAIT_MS = 3000
export const FIXTURE_WINDOW_POLL_MS = 100
/** The fallback run's whole life: its helper's start releases the marker's keys, then it presses Shift once. */
export const FALLBACK_RUN_MS = 8000
export const HUMAN_FIX = 'press and release Shift once on the Mac'
/** Who an alert goes to: a person must hear of a Shift left down, not only a terminal nobody watches (cu-verifier). */
export const ALERT_TO = 'cu-coordinator'
export const DEFAULT_INBOX = join(homedir(), 'reflection', 'shared', '_tools_', 'session-inbox', 'session-inbox.py')
const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'agent-core', 'cli.mjs')

/** Whether `version` (a.b.c) is at least `min`. */
export function versionAtLeast(version, min) {
  const parts = (v) => String(v ?? '').split(/[^0-9]+/).filter(Boolean).map(Number)
  const [a, b] = [parts(version), parts(min)]
  if (a.length === 0) return false
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const [x, y] = [a[i] ?? 0, b[i] ?? 0]
    if (x !== y) return x > y
  }
  return true
}

/** Why a booked step 4 forbids the run now, or null: the booking is required (or an explicit 'none booked'). */
export function step4Refusal({ step4At, noStep4Booked, now }) {
  if (step4At === undefined) return noStep4Booked === true ? null : 'no step-4 booking given: pass --step4-at <ISO time> or --no-step4-booked'
  const at = Date.parse(step4At)
  if (!Number.isFinite(at)) return `--step4-at is not a time: ${step4At}`
  if (Math.abs(at - now) < STEP4_MARGIN_MS) return `a step 4 is booked within 30 minutes (${step4At})`
  return null
}

/** Why the owner may be at the Mac, or null: the check needs IDLE_MIN_SECONDS of no local input. */
export function idleRefusal(seconds) {
  if (!Number.isFinite(seconds)) return 'the idle time could not be read'
  return seconds >= IDLE_MIN_SECONDS ? null : `the Mac was used ${Math.round(seconds)} s ago; the check needs ${IDLE_MIN_SECONDS} s with no local input`
}

/**
 * Why `cuHome` may not be used, or null: absolute, free of whitespace (so the `--socket` value in ps's command line
 * is one whole argument), and not the owner's ~/.computer-use.
 */
export function cuHomeRefusal(cuHome, home = homedir()) {
  if (typeof cuHome !== 'string' || !cuHome.startsWith('/')) return '--cu-home must be an absolute private directory'
  if (/\s/.test(cuHome)) return '--cu-home must contain no whitespace'
  const owner = resolve(home, '.computer-use')
  if (resolve(cuHome) === owner) return '--cu-home must not be the owner\'s ~/.computer-use: the check keeps its marker privately'
  return null
}

/** The value right after `--socket` in a command line, as a whole argument (the private home has no whitespace). */
export function socketArgument(args) {
  const words = String(args ?? '').split(/\s+/)
  const at = words.indexOf('--socket')
  return at === -1 ? null : (words[at + 1] ?? null)
}

/**
 * Why the process the marker names must not be killed, or null (cu-verifier's conditions): run A neither ended nor
 * reported local input; the marker names a pid; ps shows that very pid; its comm is the installed CUHelper's real path,
 * compared whole; and its `--socket` argument lies under the check's own run directory.
 */
export function killRefusal({ marker, info, executable, runDir, ended, localInput }) {
  if (ended) return 'run A has ended'
  if (localInput) return 'run A reported local input'
  if (!Number.isInteger(marker?.pid)) return 'the held-keys marker names no pid'
  if (info === null || info === undefined) return `no process ${marker.pid}`
  if (info.pid !== marker.pid) return `ps answered for pid ${info.pid}, not the marker's ${marker.pid}`
  if (info.comm !== executable) return `pid ${marker.pid} is ${info.comm}, not the installed helper ${executable}`
  const socket = socketArgument(info.args)
  if (socket === null || !socket.startsWith(`${runDir}/`)) return `pid ${marker.pid}'s socket ${socket} is not under ${runDir}/`
  return null
}

/** The agent-core checks cu-developer-one specified for #222 (names only, never key codes); returns failures. */
export function trajectoryFailures({ eventsA, eventsB, noticesA, noticesB }) {
  const failures = []
  const lost = eventsA.find((e) => e?.kind === 'action' && e?.action?.type === 'hold_key' && e?.status === 'failed')
  if (!lost) failures.push('run A has no failed hold_key action event')
  else {
    if (lost.code !== 'helper_lost') failures.push(`run A's hold_key failed with ${lost.code}, not helper_lost`)
    if (JSON.stringify(lost.heldAtLoss) !== JSON.stringify({ keys: ['SHIFT'], buttons: [] })) failures.push(`run A's heldAtLoss is ${JSON.stringify(lost.heldAtLoss)}`)
    if (!/SHIFT; it may still be down/.test(String(lost.notice ?? ''))) failures.push('run A\'s action event carries no held_at_loss notice')
  }
  if (!noticesA.some((n) => /held SHIFT; it may still be down/.test(n))) failures.push('run A printed no held_at_loss notice')
  const released = eventsB.find((e) => e?.kind === 'released_stale')
  if (!released) failures.push('run B has no released_stale event')
  else {
    if (JSON.stringify(released.keys) !== JSON.stringify(['SHIFT']) || JSON.stringify(released.buttons) !== JSON.stringify([])) failures.push(`run B released ${JSON.stringify({ keys: released.keys, buttons: released.buttons })}`)
    if (released.posted !== 1 && released.posted !== 0) failures.push(`run B's released_stale posted ${released.posted}`)
  }
  if (!noticesB.some((n) => /Released before this run's input: SHIFT/.test(n))) failures.push('run B printed no released_stale notice')
  return failures
}

/** The environment a CLI run gets: this one without what loads code into node (the helper refuses it) plus CU_HOME. */
export function childEnv(env, cuHome) {
  const loadsCode = (name) => name.startsWith('DYLD_') || name.startsWith('LD_') || ['NODE_OPTIONS', 'NODE_PATH', 'NODE_REPL_EXTERNAL_MODULE', 'NODE_ICU_DATA'].includes(name)
  return { ...Object.fromEntries(Object.entries(env).filter(([name]) => !loadsCode(name))), CU_HOME: cuHome }
}

/** The CLI command line of one scripted desktop run of the check. */
export function cliArgs({ cli = CLI, task, fixture, seat, planPath, runsDirectory, heldMarkerPath }) {
  return [cli, 'run', '--env', 'macos-desktop', '--task', task, '--app', fixture, '--seat', seat, '--model', 'scripted', '--plan', planPath,
    '--consent', 'unattended', '--runs-dir', runsDirectory, '--no-live', '--held-marker', heldMarkerPath]
}

/**
 * Start one CLI run as a child. The handle: `ended` (the child exited), `done` (resolves `{ code }`), `notices` (the
 * `notice:` lines of its stderr), `runDir()` (its run directory once it exists) and `end()` (SIGTERM: the CLI aborts
 * its run and releases the run lock).
 */
export function startCliRun({ label, turns, cuHome, seat, fixture, runsDirectory, heldMarkerPath }) {
  const planPath = join(cuHome, `plan-${label}.json`)
  writeFileSync(planPath, `${JSON.stringify({ turns })}\n`, { mode: 0o600 })
  const before = new Set(existsSync(runsDirectory) ? readdirSync(runsDirectory) : [])
  const child = spawn(process.execPath, cliArgs({ task: `G1 check run ${label}`, fixture, seat, planPath, runsDirectory, heldMarkerPath }), {
    stdio: ['ignore', 'ignore', 'pipe'], env: childEnv(process.env, cuHome),
  })
  const handle = { ended: false, notices: [], stderr: [] }
  let rest = ''
  child.stderr.on('data', (chunk) => {
    const lines = (rest + chunk).split('\n')
    rest = lines.pop()
    for (const line of lines) {
      handle.stderr.push(line)
      const notice = /^notice: (.*)$/.exec(line)
      if (notice) handle.notices.push(notice[1])
    }
  })
  handle.done = new Promise((done) => child.once('exit', (code) => { handle.ended = true; done({ code }) }))
  handle.end = () => { try { child.kill('SIGTERM') } catch { /* already gone */ } }
  handle.runDir = runDirFinder({ runsDirectory, before, task: `G1 check run ${label}` })
  return handle
}

/**
 * The run directory of one CLI run: the directory that was not there when it started and whose header (run.json)
 * names its task - each G1 run has its own ('G1 check run A', 'B', 'fallback') - found once and kept. Not 'the newest
 * new directory': read after run B started, that was run B's, so run A's events came from run B (cu-verifier, the real
 * check at 17:35Z: the behaviour passed, the tool said fail).
 */
export function runDirFinder({ runsDirectory, before, task }) {
  let found = null
  return () => {
    if (found !== null) return found
    for (const name of existsSync(runsDirectory) ? readdirSync(runsDirectory) : []) {
      if (before.has(name)) continue
      let header = null
      try { header = JSON.parse(readFileSync(join(runsDirectory, name, 'run.json'), 'utf8')) } catch { continue }
      if (header?.task?.text === task) {
        found = join(runsDirectory, name)
        return found
      }
    }
    return null
  }
}

/** The default effects: real probes, real kill, real CLI runs (loaded lazily, so tests never load them). */
export function realDeps() {
  return {
    now: () => Date.now(),
    sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
    sessionFlags: () => sessionFlags(),
    hidIdleSeconds: () => hidIdleSeconds(),
    processInfo: (pid) => processInfo(pid),
    readMarker: (path) => readMarker(path),
    kill: (pid) => process.kill(pid, 'SIGKILL'),
    realpath: (path) => realpathSync(path),
    runCli: (spec) => startCliRun(spec),
    readEvents: (path) => {
      try {
        return readFileSync(path, 'utf8').split('\n').filter(Boolean).flatMap((line) => { try { return [JSON.parse(line)] } catch { return [] } })
      } catch {
        return []
      }
    },
    ownerHome: async () => (await import('../agent-core/trajectory.mjs')).cuHome(),
    helperVersion: async (ownerHome) => {
      const { defaultBundlePath } = await import('../../_environments_/macos-desktop/launch.mjs')
      return bundleVersion(defaultBundlePath(ownerHome))
    },
    offersHoldKey: async () => (await import('../../_environments_/macos-desktop/input-plan.mjs')).ACTION_TYPES.includes('hold_key'),
    /** The installed, signed helper linked into the private home (a symlink: a copy would hold no grant). */
    linkHelper: async ({ cuHome, ownerHome }) => {
      const { linkInstalledHelper } = await import('../computer-use-mcp/desktop-proof.mjs')
      const { defaultBundlePath } = await import('../../_environments_/macos-desktop/launch.mjs')
      return linkInstalledHelper({ cuHome, source: defaultBundlePath(ownerHome) })
    },
    /** Copies of the owner's own tty 'always' record for CU Fixture, read only from their store (D-033, D-038). */
    copyApprovals: async ({ cuHome, ownerHome }) => {
      const { approvalRefusal, copyOwnerApprovals } = await import('../computer-use-mcp/desktop-proof.mjs')
      const copied = copyOwnerApprovals({ task: {}, sourceHome: ownerHome, home: cuHome })
      if (copied.missing.length > 0) return { refusal: approvalRefusal(copied) }
      return { copiedFrom: copied.copiedFrom }
    },
    /** CU Fixture built, launched visible and showing its input recorder (the driver launches no app). */
    startFixture: async () => {
      const { buildFixtureApp } = await import('../desktop-fixture/build.mjs')
      const { launchFixture } = await import('../desktop-fixture/client.mjs')
      const fixture = await launchFixture(buildFixtureApp().executable, { offscreen: false })
      await fixture.open('input-recorder', { title: 'Input recorder' })
      return { pid: fixture.child.pid, close: () => fixture.close() }
    },
    windowsOnScreen: (pid) => onScreenWindows(pid),
    alertRoute: (route) => alertRouteProblem(route),
    alert: (message, route) => sendAlert(message, route),
    log: (line) => process.stderr.write(`g1: ${line}\n`),
  }
}

/** Why an alert could not reach a person, or null: the inbox tool and the sender's roster must both be there. */
export function alertRouteProblem(route, exists = existsSync) {
  if (!route || typeof route.roster !== 'string' || typeof route.inbox !== 'string') return 'no alert route: pass --alert-roster <TEAM.yaml> (and --inbox if session-inbox.py is elsewhere)'
  if (!exists(route.inbox)) return `no inbox tool at ${route.inbox}`
  if (!exists(route.roster)) return `no roster at ${route.roster}`
  return null
}

/** The alert: on stderr, and as an urgent inbox message from the running seat to ALERT_TO naming the human fix. */
export function sendAlert(message, route, { run = execFileSync, write = (text) => process.stderr.write(text) } = {}) {
  write(`\nALERT (G1 check): ${message}\n`)
  try {
    run('python3', [route.inbox, 'send', '--roster', route.roster, '--from', route.seat, '--to', ALERT_TO, '--kind', 'alert',
      '--subject', `URGENT: Shift may be held down on the Mac - ${HUMAN_FIX}`, '--body', message], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 20_000 })
    return true
  } catch (error) {
    write(`ALERT not delivered to ${ALERT_TO}: ${error?.message ?? error} - tell a person now: ${HUMAN_FIX}\n`)
    return false
  }
}

/**
 * `{ value }` or `{ error }` once `promise` settles, or null after `ms`: polled in 50 ms steps, so it returns as soon
 * as the run ends and leaves no long timer behind (a run that does not end is reported, never waited on forever).
 */
async function within(promise, ms, sleep) {
  let settled = null
  promise.then((value) => { settled = { value } }, (error) => { settled = { error } })
  for (let waited = 0; settled === null && waited < ms; waited += 50) await sleep(50)
  return settled
}

/**
 * Run the G1 check. Returns the report (also the CLI's JSON): `verdict` is pass, rehearsed, inconclusive, fail,
 * refused or aborted; `shiftLeftDown` is true only if even the fallback failed, the case the alert is for.
 */
export async function runG1(options, deps = realDeps()) {
  const { seat, cuHome } = options
  const fixture = options.fixture ?? FIXTURE_BUNDLE_ID
  let markerPath = join(cuHome ?? '/nonexistent', 'helper', 'held-keys.json')
  const report = { check: 'CU-64 G1 (CU-94)', seat, cuHome, markerPath, startedAt: new Date(deps.now()).toISOString(), verdict: null, reasons: [], flags: [], marker: [], runs: {}, timings: {}, shiftLeftDown: false }
  const t0 = deps.now()
  const at = () => deps.now() - t0
  const note = (line) => { report.reasons.push(line); deps.log(line) }
  const readFlags = async (label) => {
    const flags = await deps.sessionFlags()
    report.flags.push({ at: at(), label, flags, shift: shiftDown(flags) })
    return shiftDown(flags)
  }
  const sampleMarker = (label) => {
    const marker = deps.readMarker(markerPath)
    report.marker.push({ at: at(), label, marker })
    return marker
  }
  const refuse = (reason) => { report.verdict = 'refused'; note(reason); return report }

  // 0. Preconditions, all before any input.
  const homeProblem = cuHomeRefusal(cuHome, options.home)
  if (homeProblem) return refuse(homeProblem)
  if (typeof seat !== 'string' || seat === '') return refuse('--seat is required (the seat holding the desktop)')
  const booking = step4Refusal({ step4At: options.step4At, noStep4Booked: options.noStep4Booked, now: deps.now() })
  if (booking) return refuse(booking)
  const idle = idleRefusal(await deps.hidIdleSeconds())
  if (idle) return refuse(idle)
  if (await readFlags('before')) return refuse('Shift is already down in the session; nothing is started')
  // One canonical home for everything (cu-verifier): the children's CU_HOME, the marker and the socket directory the
  // kill compares. /tmp is /private/tmp: a home passed as given while the comparison used its real path never matched.
  mkdirSync(join(cuHome, 'helper'), { recursive: true, mode: 0o700 })
  const home = deps.realpath(cuHome)
  markerPath = join(home, 'helper', 'held-keys.json')
  Object.assign(report, { cuHome: home, markerPath })
  if (deps.readMarker(markerPath) !== null) return refuse(`a held-keys marker is already at ${markerPath}; start from an empty private CU_HOME`)
  const route = { roster: options.alertRoster, inbox: options.inbox ?? DEFAULT_INBOX, seat }
  const unrouted = deps.alertRoute(route)
  if (unrouted) return refuse(`an alert could not reach a person: ${unrouted}`)
  const ownerHome = options.ownerHome ?? await deps.ownerHome()
  if (resolve(ownerHome) === resolve(cuHome) || resolve(ownerHome) === home) return refuse('--cu-home is the owner\'s CU home; the check needs a private one')
  const version = await deps.helperVersion(ownerHome)
  if (!versionAtLeast(version, MIN_HELPER_VERSION)) return refuse(`the installed helper is ${version ?? 'unknown'}, older than ${MIN_HELPER_VERSION}`)
  if (!(await deps.offersHoldKey())) return refuse('the driver does not offer hold_key (needs #206 on main)')

  // The private home gets the installed helper (linked) and copies of the owner's own consent - nothing granted here.
  try {
    await deps.linkHelper({ cuHome: home, ownerHome })
  } catch (error) {
    return refuse(`the installed helper could not be linked into the private home: ${error?.message ?? error}`)
  }
  const consent = await deps.copyApprovals({ cuHome: home, ownerHome })
  if (consent.refusal) return refuse(consent.refusal)
  report.approvalsCopiedFrom = consent.copiedFrom ?? null
  // CU Fixture, visible, before run A and through run B and the fallback; closed on every way out (cu-verifier: a run
  // captures only its apps' windows, so with no fixture window run A failed at its first capture).
  let fixtureApp
  try {
    fixtureApp = await deps.startFixture()
  } catch (error) {
    return refuse(`CU Fixture could not be launched: ${error?.message ?? error}`)
  }
  try {
    // The window reaches the window server a moment after open() returns (cu-verifier, 16:30:08Z): look again every
    // FIXTURE_WINDOW_POLL_MS for up to FIXTURE_WINDOW_WAIT_MS before refusing.
    const windowDeadline = deps.now() + FIXTURE_WINDOW_WAIT_MS
    let windows = await deps.windowsOnScreen(fixtureApp.pid)
    while (windows < 1 && deps.now() < windowDeadline) {
      await deps.sleep(FIXTURE_WINDOW_POLL_MS)
      windows = await deps.windowsOnScreen(fixtureApp.pid)
    }
    if (windows < 1) return refuse(`CU Fixture has no window on screen after ${FIXTURE_WINDOW_WAIT_MS / 1000} s; nothing is started`)
    const runsDirectory = options.runsDirectory ?? join(home, 'runs')
    mkdirSync(runsDirectory, { recursive: true, mode: 0o700 })
    // What the kill compares: the installed helper's real executable, and the check's own socket directory, both real paths.
    const executable = deps.realpath(join(home, 'helper', 'CUHelper.app', 'Contents', 'MacOS', 'CUHelper'))
    const runDir = join(home, 'run')
    report.identity = { executable, runDir }
    const cli = (label, turns) => deps.runCli({ label, turns, cuHome: home, seat, fixture, runsDirectory, heldMarkerPath: markerPath })
    const eventsOf = (handle) => { const dir = handle?.runDir() ?? null; return dir === null ? [] : deps.readEvents(join(dir, 'events.jsonl')) }
    const localInputIn = (handle) => eventsOf(handle).some((event) => event?.kind === 'local_input')

    /** Shift back up through a helper run, or the alert naming the human fix; returns true if Shift is up after it. */
    const fallback = async (why, running = []) => {
      note(`fallback: ${why}`)
      for (const handle of running) if (handle && !handle.ended) handle.end()
      for (const handle of running) if (handle) await within(handle.done, 1000, deps.sleep)
      let press = null
      try {
        press = cli('fallback', [{ actions: [{ type: 'keypress', keys: ['SHIFT'] }] }, { final: 'done' }])
      } catch (error) {
        note(`the fallback run did not start: ${error?.message ?? error}`)
      }
      if (press) {
        for (let waited = 0; waited < FALLBACK_RUN_MS && !press.ended; waited += 100) {
          if (!(await readFlags('during fallback'))) break
          await deps.sleep(100)
        }
        if (!press.ended) press.end()
      }
      if (!(await readFlags('after fallback'))) return true
      report.shiftLeftDown = true
      deps.alert(`Shift may still be held down on the Mac after the G1 check - ${HUMAN_FIX}. (fallback failed; see ${report.check} report)`, route)
      return false
    }

    // 1. Run A: hold Shift; find the hold through the marker.
    let runA
    try {
      runA = cli('A', [{ actions: [{ type: 'hold_key', keys: ['SHIFT'], duration_ms: HOLD_MS }] }, { final: 'done' }])
    } catch (error) {
      return refuse(`run A did not start: ${error?.message ?? error}`)
    }
    let marker = null
    let localInput = false
    for (let waited = 0; waited < HOLD_SEEN_WITHIN_MS && !runA.ended; waited += 50) {
      marker = deps.readMarker(markerPath)
      if (Number.isInteger(marker?.pid)) break
      await deps.sleep(50)
    }
    report.marker.push({ at: at(), label: 'hold seen', marker })
    report.timings.holdSeen = at()
    report.runs.A = { runDir: runA.runDir() }

    // Local input, a run A that ended, or no hold at all: no kill, no second run; whatever is down comes up.
    const abortA = async (why) => {
      note(why)
      await within(runA.done, HOLD_MS + 5000, deps.sleep)
      if (await readFlags('after abort')) await fallback('Shift down after the aborted run A', [runA])
      report.verdict = report.shiftLeftDown ? 'fail' : (localInput ? 'aborted' : 'inconclusive')
      return report
    }
    localInput = localInputIn(runA)
    if (localInput) return abortA('local input before the kill: no kill, no second run')
    if (!Number.isInteger(marker?.pid)) return abortA(runA.ended ? 'run A ended before its hold: nothing killed' : 'the hold never wrote its marker: nothing killed')
    await deps.sleep(KILL_AFTER_MS)

    // 2. The kill decision, every fact re-read now; the only await between the reads and the kill is the ps call.
    marker = deps.readMarker(markerPath)
    const info = Number.isInteger(marker?.pid) ? await deps.processInfo(marker.pid) : null
    localInput = localInputIn(runA)
    const refusal = killRefusal({ marker, info, executable, runDir, ended: runA.ended, localInput })
    report.marker.push({ at: at(), label: 'before kill', marker })
    report.pids = { marker: marker?.pid ?? null, ps: info?.pid ?? null, comm: info?.comm ?? null, socket: socketArgument(info?.args) }
    if (refusal === null && options.rehearse !== true) deps.kill(marker.pid)
    if (options.rehearse === true) {
      // --rehearse: everything up to the kill decision, then no kill; the 5 s hold ends by itself and Shift comes up.
      report.rehearsal = { wouldKill: refusal === null, refusal }
      // As read, so the live rehearsal shows whether ps names the installed real path or the private link's path.
      const seen = `comm ${info?.comm ?? 'none'}, socket ${socketArgument(info?.args) ?? 'none'}; expected ${executable} and ${runDir}/`
      note(refusal === null ? `rehearsal: would kill ${marker.pid} (${seen}); not killed` : `rehearsal: would not kill: ${refusal} (${seen})`)
      await within(runA.done, HOLD_MS + 5000, deps.sleep)
      if (await readFlags('after the rehearsal hold')) await fallback('Shift down after the rehearsal hold ended', [runA])
      report.verdict = report.shiftLeftDown ? 'fail' : (refusal === null && !localInput ? 'rehearsed' : (localInput ? 'aborted' : 'inconclusive'))
      return report
    }
    if (refusal) return abortA(`not killed: ${refusal}`)
    report.timings.kill = at()
    const killedAt = deps.now()
    await deps.sleep(150)
    // 3. The hazard must be real: Shift DOWN right after the kill, else the check proves nothing.
    const reproduced = await readFlags('after kill')
    if (!reproduced) note('Shift was not down after the kill: the hazard was not reproduced (inconclusive)')
    // Run B needs the run lock run A holds until its CLI exits (at once on helper_lost); ended for it if it lingers.
    if ((await within(runA.done, A_END_WAIT_MS, deps.sleep)) === null) {
      note(`run A had not ended ${A_END_WAIT_MS} ms after the kill: ended for run B`)
      runA.end()
      await within(runA.done, 1000, deps.sleep)
    }
    report.runs.A.ended = runA.ended

    // 4. Run B releases: its helper rewrites the marker at start (the moment of the release), then Shift is up.
    let runB = null
    try {
      runB = cli('B', [{ actions: [{ type: 'wait', duration_ms: 1000 }] }, { final: 'done' }])
    } catch (error) {
      note(`run B did not start: ${error?.message ?? error}`)
    }
    let up = false
    for (;;) {
      // Run B's helper has started once it rewrote the marker as released (or already removed it after a request).
      const current = deps.readMarker(markerPath)
      if (report.timings.bHelper === undefined && runB !== null && (current === null || current?.released === true)) {
        report.timings.bHelper = at()
        report.marker.push({ at: at(), label: 'run B helper started', marker: current })
      }
      up = !(await readFlags('waiting for release'))
      if (up) break
      const sinceKill = deps.now() - killedAt
      const sinceHelper = report.timings.bHelper === undefined ? null : at() - report.timings.bHelper
      if (runB === null || runB.ended || sinceKill >= FALLBACK_AFTER_KILL_MS || (sinceHelper !== null && sinceHelper >= RELEASE_WAIT_MS)) break
      await deps.sleep(100)
    }
    if (up) report.timings.shiftUp = at()
    else await fallback(runB === null ? 'run B did not start' : `Shift still down ${deps.now() - killedAt} ms after the kill`, [runB])
    if (runB) {
      const endB = await within(runB.done, 15000, deps.sleep)
      report.runs.B = { runDir: runB.runDir(), ended: endB !== null }
      if (endB === null) runB.end()
    }
    sampleMarker('after run B')

    // 5. The verdict.
    const failures = []
    if (report.shiftLeftDown) failures.push('Shift left down (alert sent)')
    if (!up) failures.push('the next helper did not release Shift (the fallback did)')
    if (up && report.timings.shiftUp - report.timings.kill > NORMAL_RELEASE_MS) failures.push(`release took ${report.timings.shiftUp - report.timings.kill} ms after the kill (bound ${NORMAL_RELEASE_MS})`)
    if (deps.readMarker(markerPath) !== null) failures.push('the marker is still there after run B')
    failures.push(...trajectoryFailures({ eventsA: eventsOf(runA), eventsB: runB ? eventsOf(runB) : [], noticesA: runA.notices, noticesB: runB?.notices ?? [] }))
    for (const failure of failures) note(failure)
    report.verdict = report.shiftLeftDown || failures.length > 0 ? 'fail' : (reproduced ? 'pass' : 'inconclusive')
    if (localInputIn(runB) && report.verdict === 'pass') report.verdict = 'aborted'
    return report
  } finally {
    await fixtureApp.close()
  }
}

/** `--seat S --cu-home DIR --alert-roster TEAM.yaml (--step4-at ISO | --no-step4-booked) [--rehearse] [--inbox PATH] [--report PATH]` */
export function parseArgs(argv) {
  const options = {}
  for (let i = 0; i < argv.length; i += 1) {
    const [flag, value] = [argv[i], argv[i + 1]]
    if (flag === '--seat') { options.seat = value; i += 1 } else if (flag === '--cu-home') { options.cuHome = value; i += 1 } else if (flag === '--step4-at') { options.step4At = value; i += 1 } else if (flag === '--no-step4-booked') options.noStep4Booked = true
    else if (flag === '--report') { options.report = value; i += 1 } else if (flag === '--alert-roster') { options.alertRoster = value; i += 1 } else if (flag === '--inbox') { options.inbox = value; i += 1 } else if (flag === '--rehearse') options.rehearse = true
    else throw new Error(`unknown argument ${flag}`)
  }
  return options
}

const EXIT = { pass: 0, rehearsed: 0, inconclusive: 3, aborted: 3, refused: 2, fail: 1 }

/** Run as a program only when this file is the entry (real paths on both sides, as the other entry guards). */
function startedAsProgram() {
  try {
    return realpathSync(process.argv[1] ?? '') === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (startedAsProgram()) {
  let options
  try {
    options = parseArgs(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exit(2)
  }
  const report = await runG1(options)
  const out = options.report ?? join(options.cuHome ?? '.', 'g1-report.json')
  try { writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 }) } catch { /* the report is also printed */ }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  process.exit(report.shiftLeftDown ? 4 : (EXIT[report.verdict] ?? 1))
}
