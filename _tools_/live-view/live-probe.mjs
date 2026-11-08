#!/usr/bin/env node
/**
 * The live probe (Linear CU-12): checks the live view of a LIVE desktop run the way a person's two links use it,
 * reading the watch page from headless Chrome (no window on the owner's screen), and prints one JSON line per check
 * with its evidence, then one summary line. Exit 0 only if every check passes; 3 when it refused before starting
 * anything; 64 on a usage error; 1 otherwise.
 *
 *   node _tools_/live-view/live-probe.mjs --announced yes --out /tmp/<dir> [--seat cu-<seat>]
 *
 * **Why it owns the run it probes.** A person's control link must never reach an agent through a tool or a pipe
 * (consent-authority.md, run-tokens.md). So the probe never takes a link from a running run. It starts its own scripted
 * desktop run on CU Fixture as a child `cli.mjs run`, inside the desktop suite's attempt (`runDesktopAttempt`), which
 * launches the fixture and opens its screen. The run lives in a private CU_HOME it creates under --out. desktop-proof.mjs's
 * `prepareDesktop` (copyOwnerApprovals, linkInstalledHelper) copies the owner's tty 'always' record for CU Fixture
 * verbatim and symlinks the installed helper into it. The watch URL is the CLI's own `live view (watch):` line on its
 * stderr. The CLI's `live view (control):` line is dropped as it arrives and never kept. The control link is read from
 * that run's own control file, `<private CU_HOME>/control/<run-id>` (mode 600, written by the live view). The probe
 * refuses to start when its CU_HOME would be the default ~/.computer-use or any CU_HOME it did not create under --out,
 * so it can never touch a person's run. Every line it prints is scrubbed of both tokens.
 *
 * **The checks.** (1) `screen`: no frame reaches /screen before the first approved app joins. After that, every frame
 * comes while the run's scope is non-empty and holds only the approved app. Each desktop part's `x-cu-frame-at` and
 * `x-cu-scope` are matched to the event stream's scope, which the server sends before the frame. (2) `watch-link`:
 * POST /control with the watch token is 403 for every command only the control link may send, and the state does not
 * move. The watch page shows no control-token button and no consent answer. Pause and Stop do show: run-tokens.md
 * lets a watcher send both. (3) `control-link`: pause gives paused. Resume gives running, and the next input follows
 * it. take_over gives taken_over, and remote input is refused by name. hand_back gives running, and stop ends the run.
 * What a check cannot observe is said plainly in its `unobservable` list. The probe keeps sizes, states and times;
 * it stores no frame.
 *
 * The pure parts and the check runners are exported for the unit suite, which drives them against an in-process live
 * view on the fake helper. It runs without CUHelper.app, the fixture, Chrome or the screen. Only `main` with
 * `--announced yes` starts anything.
 */
import { spawn } from 'node:child_process'
import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { homedir } from 'node:os'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { runDesktopAttempt, scriptedPlan } from '../../_evaluators_/desktop-suite/lib.mjs'
import { verifySeat } from '../verify-kit/seat.mjs'
import { parseResult, redactTokens } from '../../_evaluators_/task-suite/run.mjs'
import { openPage } from '../../_vendor_/browser-use/lib.mjs'
import { isEntryPoint } from '../agent-core/cli.mjs'
import { resourceGate } from '../agent-core/resource-gate.mjs'
import { cuHome } from '../agent-core/trajectory.mjs'
import { prepareDesktop, privateCuHome, sessionEnv } from '../computer-use-mcp/desktop-proof.mjs'
import { BUNDLE_ID, buildFixtureApp } from '../desktop-fixture/build.mjs'
import { DESKTOP_INPUT_REFUSAL, SENDER_REFUSALS } from './server.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const CLI = resolve(HERE, '..', 'agent-core', 'cli.mjs')

export const PROBE = 'cu-live-probe'
/** The file the probe writes into a CU_HOME it created; a CU_HOME without it was made by someone else. */
export const MARKER = '.cu-live-probe'
/** badge-form uses CU Fixture alone, so exactly one owner record is copied; its `name` field takes the one click. */
export const TASK_ID = 'badge-form'
export const CLICK_TARGET = 'name'
export const APPROVED = Object.freeze([BUNDLE_ID])
export const CHECK_NAMES = Object.freeze(['screen', 'watch-link', 'control-link'])
/** The run's caps: a probe run is four scripted turns, all of them waits but one click. */
export const CAPS = Object.freeze({ maxSteps: 6, maxMinutes: 3, maxCostUsd: 0.01 })
/**
 * The run's pace and the probe's patience. The lead waits give checks 1 and 2 time before the probe pauses the run.
 * Their real need is a few seconds, so 15 s is ample. If the probe were slower anyway, the click would come before
 * the pause, and check 3 would fail, saying so. The tail waits hold the run for take over, hand back and stop.
 */
export const TIMING = Object.freeze({
  leadWaitsMs: [10_000, 5_000], tailWaitsMs: [10_000, 10_000], frames: 3, scopeTimeoutMs: 30_000, linkTimeoutMs: 60_000,
  holdMs: 1_000, stateTimeoutMs: 5_000, inputTimeoutMs: 30_000, endTimeoutMs: 30_000, domTimeoutMs: 8_000, hardCapMs: 170_000,
})
export const TASK_TEXT = 'Live-view probe: hold still, click the name field in CU Fixture once, then wait for the probe to stop the run.'
/** The buttons run-tokens.md lets the watch token use: pause and stop only reduce what the agent does. */
export const WATCH_ALLOWED = Object.freeze(['pause', 'stop'])
/** Every command only the control link may send, as the watch page would send it. None may pass with the watch token. */
export const WATCH_REFUSED = Object.freeze([
  { command: 'take_over' }, { command: 'resume' }, { command: 'hand_back', note: 'live probe' },
  { command: 'guide', text: 'live probe: the watch link may not guide' }, { command: 'consent', id: 'live-probe', approved: true, lifetime: 'once' },
])
/** Actions that post nothing (the driver plans them locally); every other action is one input request to the helper. */
const LOCAL_ACTIONS = Object.freeze(['wait', 'screenshot', 'zoom', 'cursor_position'])
const SEAT_PATTERN = /^cu-[a-z0-9]+(-[a-z0-9]+){0,3}$/
const NOTHING = 'nothing was started'

/** What the checks cannot see on a live run, stated as evidence rather than left out. */
export const UNOBSERVABLE = Object.freeze({
  windows: "which windows a frame shows: the helper's watch frame carries only png, widthPx, heightPx and at (Dispatcher.swift doWatch), the driver passes on no window list (environment.mjs #onFrame), so the live view has none to send; the driver's capture_leak check covers capture replies, not watch frames",
  pixels: "what a frame depicts: the probe keeps each frame's type, size and time, and stores no image",
  noMetadata: "per-frame scope: the server sent no frame metadata, so frames were matched to the stream's scope by arrival time, which can trail a scope change by up to 500 ms",
  settle: "the settleMs of the first input after the resume: no input was recorded after it. On a live run it is read from that input's trajectory effect (effect.settleMs, CU-28); in the unit suite from the fake helper's request log",
  consentPending: 'consent answers with a question pending: this run asks none (CU Fixture is covered by the copied always record), so #consents held no question when read; the unit suite renders a pending question for the watch token',
  watchPauseStop: 'pause and stop with the watch link: run-tokens.md allows both, so their buttons show and the probe does not send them (stop would end the run before check 3)',
})

export const USAGE = 'usage: node _tools_/live-view/live-probe.mjs --announced yes --out /tmp/<dir> [--seat cu-<seat>]'

export class UsageError extends Error {}

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms))

/** Resolve `promise`, or null once `ms` pass; a probe step that never ends must not hold the probe. */
export function withTimeout(promise, ms) {
  let timer
  return Promise.race([Promise.resolve(promise), new Promise((resolvePromise) => { timer = setTimeout(() => resolvePromise(null), ms) })]).finally(() => clearTimeout(timer))
}

/** Poll `check` until it returns something truthy; rejects naming `what` after `timeoutMs`. */
export async function until(check, timeoutMs, what = 'a condition', everyMs = 25) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await check()
    if (value) return value
    if (Date.now() > deadline) throw new Error(`timed out after ${timeoutMs} ms waiting for ${what}`)
    await sleep(everyMs)
  }
}

/**
 * The probe's flags, `--name value` or `--name=value`. Unknown flags are refused rather than ignored: a mistyped
 * `--announced` must not quietly read as "not announced", and one that slipped through must not start a run.
 */
export function parseProbeArgs(argv) {
  const known = new Set(['announced', 'out', 'seat'])
  const values = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg.startsWith('--')) throw new UsageError(`unexpected argument '${arg}'`)
    const eq = arg.indexOf('=')
    const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq)
    if (name === 'help') {
      values.help = true
      continue
    }
    if (!known.has(name)) throw new UsageError(`unknown option --${name}`)
    const value = eq === -1 ? argv[i + 1] : arg.slice(eq + 1)
    if (value === undefined || value.startsWith('--')) throw new UsageError(`--${name} needs a value`)
    if (eq === -1) i += 1
    values[name] = value
  }
  if (values.announced !== undefined && values.announced !== 'yes' && values.announced !== 'no') throw new UsageError(`--announced is yes or no, not '${values.announced}'`)
  if (values.seat !== undefined && !SEAT_PATTERN.test(values.seat)) throw new UsageError(`--seat '${values.seat}' is not a [cu] seat key`)
  if (values.help !== true && (values.out === undefined || values.out === '')) throw new UsageError('--out <dir under /tmp> is required: the private CU_HOME and the run live there')
  return { announced: values.announced === 'yes', out: values.out ? resolve(values.out) : null, seat: values.seat ?? verifySeat(), help: values.help === true }
}

/**
 * A desktop run shares the owner's one display, keyboard and pointer (D-024): the operator announces it in the inbox
 * first and says so with `--announced yes`, as the desktop suite asks. Returns null when the probe may go on.
 */
export function announcedRefusal(options) {
  if (options.announced === true) return null
  return `a live desktop run shares the owner's display: announce it in the inbox first, then pass --announced yes (D-024); ${NOTHING}`
}

/** The one warning line before anything visible happens. */
export function probeWarning() {
  return 'live-probe: a visible CU Fixture window will appear and take focus for about a minute while a scripted desktop run clicks once in it; headless Chrome (no window) reads the live view; keep your hands off the keyboard and mouse - your own input pauses the run'
}

/** The real path of `path`: its deepest existing ancestor through links, then the rest as written. */
export function realish(path) {
  const rest = []
  let head = resolve(path)
  for (;;) {
    try {
      return join(realpathSync(head), ...rest)
    } catch {
      // Not there yet (or a dangling link): resolve the parent.
    }
    const parent = dirname(head)
    if (parent === head) return resolve(path)
    rest.unshift(basename(head))
    head = parent
  }
}

/**
 * Why `home` must not be the probe's CU_HOME, or null. The default home is compared by path alone, before anything
 * is touched: the probe never even stats a person's ~/.computer-use. After that the home must lie under --out, --out
 * must resolve inside /tmp, and no link may sit between --out and the home that could carry it elsewhere. An existing
 * home must carry the probe's marker. A home without one belongs to a person or another tool, and the probe refuses it.
 */
export function homeRefusal({ home, out, defaultHome = join(homedir(), '.computer-use'), tmpRoot = '/tmp' }) {
  const target = resolve(home)
  const root = resolve(out)
  if (target === resolve(defaultHome)) return `CU_HOME ${target} is the default ~/.computer-use, a person's own; the probe runs only in a CU_HOME it creates under --out; ${NOTHING}`
  if (!target.startsWith(root + sep)) return `CU_HOME ${target} is not under --out ${root}; the probe runs only in a CU_HOME it creates there; ${NOTHING}`
  const realRoot = realish(root)
  if (!realRoot.startsWith(realish(tmpRoot) + sep)) return `--out ${root} resolves to ${realRoot}, outside ${tmpRoot}; ${NOTHING}`
  let at = root
  for (const part of relative(root, target).split(sep)) {
    at = join(at, part)
    let stat
    try {
      stat = lstatSync(at)
    } catch {
      break
    }
    if (stat.isSymbolicLink()) return `${at} is a symbolic link, so the CU_HOME under it could be another home; ${NOTHING}`
    if (!stat.isDirectory()) return `${at} exists and is not a directory; ${NOTHING}`
  }
  if (realish(target) === resolve(defaultHome)) return `CU_HOME ${target} resolves to the default ~/.computer-use; ${NOTHING}`
  if (existsSync(target) && !existsSync(join(target, MARKER))) return `CU_HOME ${target} exists and this probe did not create it (no ${MARKER}); it may be a person's or another tool's; ${NOTHING}`
  return null
}

/** Create the private CU_HOME (mode 700) and mark it as the probe's own, so a later probe on the same --out may reuse it. */
export function createPrivateHome(home) {
  mkdirSync(home, { recursive: true, mode: 0o700 })
  chmodSync(home, 0o700)
  const marker = join(home, MARKER)
  if (!existsSync(marker)) writeFileSync(marker, `${JSON.stringify({ createdBy: PROBE, at: new Date().toISOString() })}\n`, { mode: 0o600 })
  return marker
}

/** `value` with every token string and every `token=` query value replaced, in strings at any depth. */
export function redactDeep(value, tokens = []) {
  if (typeof value === 'string') {
    let out = value
    for (const token of tokens) if (typeof token === 'string' && token.length > 0) out = out.split(token).join('[redacted]')
    return redactTokens(out)
  }
  if (Array.isArray(value)) return value.map((item) => redactDeep(item, tokens))
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactDeep(item, tokens)]))
  return value
}

/** One check's line: `{ probe, check, name, ok, evidence, unobservable }`, one line of JSON, tokens scrubbed. */
export function checkLine({ check, name, ok, evidence = {}, unobservable = [] }, tokens = []) {
  return JSON.stringify(redactDeep({ probe: PROBE, check, name, ok: ok === true, evidence, unobservable }, tokens))
}

/** The last line: ok only when all three checks ran and passed. `extra` adds the run's facts or a refusal. */
export function summaryLine(results, extra = {}, tokens = []) {
  const passed = results.filter((result) => result.ok === true).length
  const ok = results.length === CHECK_NAMES.length && passed === results.length
  return JSON.stringify(redactDeep({ probe: PROBE, summary: true, ok, passed, failed: results.length - passed, checks: results.length, ...extra }, tokens))
}

/** A check that never ran, failed, with the reason. */
export function notReached(check, why) {
  return { check, name: CHECK_NAMES[check - 1], ok: false, evidence: { notReached: why }, unobservable: [] }
}

/**
 * The run's scripted plan: the lead waits, the oracle's one click (the desktop suite's `scriptedPlan` of a single
 * press, so the point is the fixture's own target, in frame pixels), the tail waits, and a final message. One click is
 * the only synthetic input. It comes after the probe has paused and resumed the run, so it is the input the driver
 * gives settleMs.
 */
export function probePlan(base, { leadWaitsMs = TIMING.leadWaitsMs, tailWaitsMs = TIMING.tailWaitsMs } = {}) {
  const click = base?.turns?.[0]
  if (!Array.isArray(click?.actions) || click.actions.length !== 1 || click.actions[0].type !== 'click') throw new Error('the base plan is not one click (the scripted plan of a single press)')
  const waits = (list) => ({ actions: list.map((ms) => ({ type: 'wait', duration_ms: ms })) })
  return { ...(base.frame ? { frame: base.frame } : {}), turns: [waits(leadWaitsMs), { actions: [click.actions[0]] }, waits(tailWaitsMs), { final: 'live probe: one click, then the probe stopped the run' }] }
}

/** The child's `cli.mjs run` arguments: unattended, scripted, its runs in the private CU_HOME, the live view on. */
export function cliArgs({ cli = CLI, apps = APPROVED, seat = verifySeat(), planPath, runsDir, caps = CAPS }) {
  return [cli, 'run', '--env', 'macos-desktop', ...apps.flatMap((app) => ['--app', app]), '--seat', seat, '--task', TASK_TEXT, '--model', 'scripted', '--plan', planPath,
    '--consent', 'unattended', '--runs-dir', runsDir, '--max-steps', String(caps.maxSteps), '--max-minutes', String(caps.maxMinutes), '--max-cost', String(caps.maxCostUsd)]
}

/**
 * The child CLI's stderr, line by line: the watch line goes to `onWatch`, as the CLI prints it to its person. The
 * control line is dropped as it arrives, counted and never kept. The probe takes the control link from the run's file
 * alone. Other lines are kept, scrubbed, as a short tail for a failure's evidence.
 */
export function cliStderrSink({ onWatch = () => {} } = {}) {
  let buffer = ''
  let tail = ''
  let dropped = 0
  return {
    push(chunk) {
      buffer += String(chunk)
      for (let at = buffer.indexOf('\n'); at !== -1; at = buffer.indexOf('\n')) {
        const line = buffer.slice(0, at)
        buffer = buffer.slice(at + 1)
        const watch = /^live view \(watch\): (\S+)\s*$/.exec(line)
        if (watch !== null) {
          onWatch(watch[1])
          continue
        }
        if (line.startsWith('live view (control):')) {
          dropped += 1
          continue
        }
        tail = `${tail}${redactTokens(line)}\n`.slice(-2000)
      }
    },
    tail: () => tail,
    get controlLinesDropped() { return dropped },
  }
}

/**
 * The run's control link from its own file, `<home>/control/<run-id>`, or null while there is none yet. The private
 * home holds only this probe's run, so exactly one file is expected. It must be a regular file of mode 600 inside the
 * home, holding a 127.0.0.1 link with a token. Anything else throws, and the probe stops rather than guess.
 */
export function controlLinkFile(home) {
  const dir = join(home, 'control')
  let names
  try {
    names = readdirSync(dir)
  } catch {
    return null
  }
  if (names.length === 0) return null
  if (names.length > 1) throw new Error(`${dir} holds ${names.length} control links; the probe's private CU_HOME holds only its own run's`)
  const path = join(dir, names[0])
  const stat = lstatSync(path)
  if (!stat.isFile()) throw new Error(`${path} is not a regular file`)
  const mode = stat.mode & 0o777
  if (mode !== 0o600) throw new Error(`${path} has mode ${mode.toString(8)}, not 600`)
  if (!realpathSync(path).startsWith(realpathSync(home) + sep)) throw new Error(`${path} resolves outside the private CU_HOME`)
  const text = readFileSync(path, 'utf8').trim()
  if (text === '') return null
  let url
  try {
    url = new URL(text)
  } catch {
    throw new Error(`${path} does not hold a URL`)
  }
  if (url.hostname !== '127.0.0.1' || !url.searchParams.get('token')) throw new Error(`${path} does not hold a live view link on 127.0.0.1`)
  return { runId: names[0], path, mode: '600', url: url.href }
}

/** Wait for the run's control file; rejects when `exited` resolves first (the run never served a live view). */
export async function waitForControlLink(home, { timeoutMs = TIMING.linkTimeoutMs, exited = null } = {}) {
  let gone = false
  void exited?.then(() => { gone = true })
  return until(() => {
    const link = controlLinkFile(home)
    if (link === null && gone) throw new Error('the run ended before its live view wrote a control link')
    return link
  }, timeoutMs, 'the run\'s control file', 25)
}

/** The bearer header for a link's token: the page sends its token the same way, and no token rides a request URL. */
function authHeaders(link) {
  return { authorization: `Bearer ${link.searchParams.get('token') ?? ''}` }
}

/** POST JSON to the live view as its page does; resolves `{ status, body }`, or `{ status: null, error }` without an answer. */
export async function postJson(link, path, body) {
  try {
    const response = await fetch(new URL(path, link), { method: 'POST', headers: { ...authHeaders(link), 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return { status: response.status, body: await response.json().catch(() => null) }
  } catch (error) {
    return { status: null, body: null, error: String(error?.message ?? error) }
  }
}

/** Follow `/events`: `seen` fills with every event plus `receivedAt` (this clock); `ended` resolves when the stream does. */
export function watchEvents(link) {
  const seen = []
  let finish
  const ended = new Promise((resolvePromise) => { finish = resolvePromise })
  const req = http.get(new URL('/events', link), { headers: authHeaders(link) }, (res) => {
    let buffer = ''
    res.setEncoding('utf8')
    res.on('data', (chunk) => {
      buffer += chunk
      for (let at = buffer.indexOf('\n\n'); at !== -1; at = buffer.indexOf('\n\n')) {
        const block = buffer.slice(0, at)
        buffer = buffer.slice(at + 2)
        for (const line of block.split('\n')) {
          if (!line.startsWith('data: ')) continue
          try {
            seen.push({ ...JSON.parse(line.slice(6)), receivedAt: Date.now() })
          } catch {
            // A line that is not JSON is not an event.
          }
        }
      }
    })
    res.on('end', () => finish(Date.now()))
    res.on('close', () => finish(Date.now()))
  })
  req.on('error', () => finish(Date.now()))
  return {
    seen,
    ended,
    /** The first event from index `from` on that matches; rejects naming `what` after `timeoutMs`. */
    next: (predicate, { from = 0, timeoutMs = TIMING.stateTimeoutMs, what = 'an event' } = {}) => until(() => seen.slice(from).find(predicate), timeoutMs, what, 10),
    close: () => req.destroy(),
  }
}

/** Width and height from a PNG's IHDR, or null when `body` is not a PNG. */
export function pngSize(body) {
  if (!Buffer.isBuffer(body) || body.length < 24 || body.readUInt32BE(0) !== 0x89504e47 || body.toString('latin1', 12, 16) !== 'IHDR') return null
  return { width: body.readUInt32BE(16), height: body.readUInt32BE(20) }
}

/** What the probe keeps of one frame part: its time, type, size and metadata, never its pixels. */
export function frameRecord(headers, body, receivedAt = Date.now()) {
  const size = pngSize(body)
  let scope = null
  if (typeof headers['x-cu-scope'] === 'string') {
    try {
      scope = headers['x-cu-scope'] === '' ? [] : headers['x-cu-scope'].split(',').map(decodeURIComponent)
    } catch {
      scope = ['(undecodable)']
    }
  }
  const at = headers['x-cu-frame-at'] === undefined ? Number.NaN : Number(headers['x-cu-frame-at'])
  return { receivedAt, type: headers['content-type'] ?? null, bytes: body.length, at: Number.isFinite(at) ? at : null, scope, width: size?.width ?? null, height: size?.height ?? null }
}

/** Split a multipart stream into parts: `push(chunk)` calls `onPart(headers, body)` for each whole part. */
export function partParser(boundary, onPart) {
  const marker = Buffer.from(`--${boundary}\r\n`, 'latin1')
  let buffer = Buffer.alloc(0)
  return (chunk) => {
    buffer = Buffer.concat([buffer, chunk])
    for (;;) {
      const start = buffer.indexOf(marker)
      if (start < 0) return
      const headEnd = buffer.indexOf('\r\n\r\n', start)
      if (headEnd < 0) return
      const headers = {}
      for (const line of buffer.toString('latin1', start + marker.length, headEnd).split('\r\n')) {
        const colon = line.indexOf(':')
        if (colon > 0) headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim()
      }
      const length = Number(headers['content-length'])
      if (!Number.isInteger(length) || length < 0) {
        buffer = buffer.subarray(headEnd + 4)
        continue
      }
      if (buffer.length < headEnd + 4 + length) return
      onPart(headers, buffer.subarray(headEnd + 4, headEnd + 4 + length))
      buffer = buffer.subarray(headEnd + 4 + length)
    }
  }
}

/** Watch `/screen` with one link: `openedAt` when the stream opened (this clock), `frames` as `frameRecord`s. */
export function watchScreen(link, name) {
  const watcher = { name, openedAt: null, status: null, contentType: null, frames: [], ended: null, close: null }
  let finish
  watcher.ended = new Promise((resolvePromise) => { finish = resolvePromise })
  const req = http.get(new URL('/screen', link), { headers: authHeaders(link) }, (res) => {
    watcher.openedAt = Date.now()
    watcher.status = res.statusCode
    watcher.contentType = res.headers['content-type'] ?? null
    const boundary = /boundary=([^;\s]+)/.exec(watcher.contentType ?? '')?.[1] ?? null
    const push = boundary === null ? () => {} : partParser(boundary, (headers, body) => watcher.frames.push(frameRecord(headers, body)))
    res.on('data', push)
    res.on('end', () => finish(Date.now()))
    res.on('close', () => finish(Date.now()))
  })
  req.on('error', () => finish(Date.now()))
  watcher.close = () => req.destroy()
  return watcher
}

/** The scope the event stream reported over time: `[{ at, receivedAt, scope }]` from hello, attached and environment_state. */
export function scopeTimeline(events) {
  const timeline = []
  for (const event of events) {
    let scope
    if (event.type === 'hello') scope = event.environmentKind === 'desktop' ? event.environmentState?.scope : []
    else if (event.type === 'attached' || event.type === 'environment_state') scope = event.environmentState?.scope
    else continue
    timeline.push({ at: event.at ?? null, receivedAt: event.receivedAt ?? null, scope: Array.isArray(scope) ? scope : [] })
  }
  return timeline
}

/**
 * Check 1. The probe watched /screen before the first approved app joined. No frame came before that, every frame
 * came while the stream's scope was non-empty, and every frame was of approved apps only. With the server's metadata
 * the frame's own `x-cu-scope` must agree too, and its time is the server's, the clock the stream's `at` is on.
 * Without it, frames are judged by arrival. Frames are PNG and no larger than the run's frame (run.json).
 */
export function judgeScreen({ events, screens, approved = APPROVED, frameSize = null }) {
  const timeline = scopeTimeline(events)
  const firstIndex = timeline.findIndex((entry) => entry.scope.length > 0)
  const first = firstIndex === -1 ? null : timeline[firstIndex]
  const allowed = approved.map((id) => id.toLowerCase())
  const inScope = (scope) => scope.length > 0 && scope.every((id) => allowed.includes(String(id).toLowerCase()))
  const scopeBy = (key, t) => {
    let scope = []
    for (const entry of timeline) if (entry[key] !== null && entry[key] <= t) scope = entry.scope
    return scope
  }
  const frames = screens.flatMap((screen) => screen.frames.map((frame) => ({ ...frame, stream: screen.name })))
  const timed = (frame) => Number.isFinite(frame.at)
  const metadata = frames.length > 0 && frames.every((frame) => timed(frame) && Array.isArray(frame.scope))
  const streamScope = (frame) => (timed(frame) ? scopeBy('at', frame.at) : scopeBy('receivedAt', frame.receivedAt))
  const beforeScope = frames.filter((frame) => first === null || (timed(frame) ? frame.at < first.at : frame.receivedAt < first.receivedAt))
  const outside = frames.filter((frame) => !inScope(streamScope(frame)) || (Array.isArray(frame.scope) && !inScope(frame.scope)))
  const watchedBefore = first === null ? [] : screens.filter((screen) => screen.openedAt !== null && screen.openedAt < first.receivedAt).map((screen) => screen.name)
  const wrongType = frames.filter((frame) => frame.type !== 'image/png')
  const oversize = frameSize === null ? [] : frames.filter((frame) => frame.width === null || frame.width > frameSize.width || frame.height > frameSize.height)
  const ok = first !== null && firstIndex > 0 && watchedBefore.length > 0 && frames.length > 0 && beforeScope.length === 0 && outside.length === 0 && wrongType.length === 0 && oversize.length === 0
  const times = frames.map((frame) => (timed(frame) ? frame.at : frame.receivedAt))
  return {
    check: 1,
    name: 'screen',
    ok,
    evidence: {
      emptyScopeFirst: firstIndex > 0,
      firstApprovedApp: first && { at: first.at, scope: first.scope },
      scopeTimeline: timeline.slice(0, 12).map(({ at, scope }) => ({ at, scope })),
      watchedBeforeScope: watchedBefore,
      frames: Object.fromEntries(screens.map((screen) => [screen.name, screen.frames.length])),
      framesBeforeScope: beforeScope.length,
      framesOutsideScope: outside.length,
      outsideExamples: outside.slice(0, 3).map(({ stream, at, receivedAt, scope }) => ({ stream, at, receivedAt, scope })),
      frameMetadata: metadata ? 'x-cu-frame-at and x-cu-scope on every part' : 'none',
      frameTypes: [...new Set(frames.map((frame) => frame.type))],
      frameSizes: [...new Set(frames.map((frame) => `${frame.width}x${frame.height}`))],
      runFrame: frameSize,
      firstFrameAt: times.length > 0 ? Math.min(...times) : null,
      lastFrameAt: times.length > 0 ? Math.max(...times) : null,
    },
    unobservable: [UNOBSERVABLE.windows, UNOBSERVABLE.pixels, ...(metadata ? [] : [UNOBSERVABLE.noMetadata])],
  }
}

/**
 * Read in the watch page (as a string for Runtime.evaluate): every control, whether a person could see it (the
 * browser's own `checkVisibility`, so CSS and hidden ancestors count), whether it is disabled, and whether it answers
 * a consent question. Also the page's state, environment and sender, and the size of the frame its screen shows: the
 * browser decoded the scoped parts, metadata and all. No location: the URL holds the token.
 */
export const DOM_SNAPSHOT = `(() => {
  const shown = (el) => typeof el.checkVisibility === 'function' ? el.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true }) : el.getClientRects().length > 0
  const controls = [...document.querySelectorAll('button, input, select, textarea, a[href], [role="button"]')].map((el) => ({
    id: el.id || null, tag: el.tagName.toLowerCase(), text: String(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 60),
    visible: shown(el), disabled: el.disabled === true, inConsents: el.closest('#consents') !== null,
  }))
  const img = document.getElementById('screen')
  const screen = img === null ? null : { naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight }
  return JSON.stringify({ state: document.body.dataset.state || null, kind: document.body.dataset.kind || null, who: document.getElementById('who')?.textContent ?? null, title: document.title, controls, consentRows: document.querySelectorAll('#consents .consent').length, screen })
})()`

/**
 * One watch-page snapshot judged: the expected state, a desktop run, the watcher's view, no control-token control
 * shown, and, where a browser read it, a frame on the screen.
 */
export function judgeSnapshot(snapshot) {
  const visible = (snapshot.controls ?? []).filter((control) => control.visible === true)
  const forbidden = visible.filter((control) => control.inConsents || !WATCH_ALLOWED.includes(control.id))
  const screenShown = snapshot.screen === undefined ? null : (snapshot.screen?.naturalWidth ?? 0) > 0
  return {
    expected: snapshot.expected ?? null,
    state: snapshot.state ?? null,
    kind: snapshot.kind ?? null,
    who: snapshot.who ?? null,
    ok: snapshot.state === snapshot.expected && snapshot.kind === 'desktop' && snapshot.who === '(watching)' && forbidden.length === 0 && screenShown !== false,
    screen: snapshot.screen === undefined ? 'not read (no browser)' : snapshot.screen,
    designPermitted: visible.filter((control) => !control.inConsents && WATCH_ALLOWED.includes(control.id)).map(({ id, disabled }) => ({ id, disabled })),
    forbiddenVisible: forbidden.map(({ id, tag, text }) => ({ id, tag, text })),
    consentRows: snapshot.consentRows ?? 0,
    consentControls: visible.filter((control) => control.inConsents).length,
  }
}

/**
 * Check 2's HTTP half with the watch link: every control-only command is sent once and must be refused 403 by sender,
 * with the run's state unchanged. Pause and stop are allowed and are not sent. Remote input is tried too and must be
 * 403. Then the page is opened with `openDom(watchUrl)` and read once while running. `readDom` is returned for the
 * later states.
 */
export async function runWatchChecks({ watch, events, openDom = null }) {
  const evidence = { replies: [], input: null, stateEventsDuring: [], snapshots: [], domError: null }
  const from = events.seen.length
  for (const body of WATCH_REFUSED) {
    const reply = await postJson(watch, '/control', body)
    evidence.replies.push({ command: body.command, status: reply.status, error: reply.body?.error ?? reply.error ?? null, state: reply.body?.state ?? null })
  }
  const input = await postJson(watch, '/input', { type: 'mouse', action: 'down', fx: 0.5, fy: 0.5, button: 'left' })
  evidence.input = { status: input.status, error: input.body?.error ?? input.error ?? null }
  await sleep(100)
  evidence.stateEventsDuring = events.seen.slice(from).filter((event) => event.type === 'state').map(({ prior, state, source, at }) => ({ prior, state, source, at }))
  let readDom = null
  if (openDom !== null) {
    try {
      readDom = await openDom(watch.href)
      evidence.snapshots.push({ expected: 'running', ...(await readDom('running')) })
    } catch (error) {
      evidence.domError = String(error?.message ?? error)
    }
  } else {
    evidence.domError = 'no page reader was given'
  }
  return { evidence, readDom }
}

/** Check 2 judged from its evidence. */
export function judgeWatch(evidence) {
  const refused = evidence.replies.length === WATCH_REFUSED.length && evidence.replies.every((reply) => reply.status === 403 && SENDER_REFUSALS.includes(reply.error))
  const unchanged = evidence.replies.length > 0 && evidence.replies.every((reply) => reply.state === evidence.replies[0].state) && evidence.stateEventsDuring.length === 0
  const dom = evidence.snapshots.map(judgeSnapshot)
  const parts = {
    controlRefused403: refused,
    stateUnchanged: unchanged,
    inputRefused403: evidence.input?.status === 403,
    pageRead: dom.some((snapshot) => snapshot.expected === 'running') && evidence.domError === null,
    pageShowsNoControl: dom.length > 0 && dom.every((snapshot) => snapshot.ok),
    sameRun: evidence.link?.sameOriginAsControl !== false,
  }
  const consentSeen = dom.some((snapshot) => snapshot.consentRows > 0)
  return {
    check: 2,
    name: 'watch-link',
    ok: Object.values(parts).every((value) => value === true),
    evidence: { ...evidence, snapshots: dom, parts },
    unobservable: [UNOBSERVABLE.watchPauseStop, ...(consentSeen ? [] : [UNOBSERVABLE.consentPending])],
  }
}

/** The run's input actions from its trajectory events: each attempted non-local action, its time and its outcome. */
export function inputActions(events) {
  const ending = (e) => events.find((d) => d.kind === 'action' && d.step === e.step && d.index === e.index && d.status !== 'attempted') ?? null
  return events
    .filter((e) => e.kind === 'action' && e.status === 'attempted' && !LOCAL_ACTIONS.includes(e.action?.type))
    .map((e) => {
      const end = ending(e)
      // Since CU-28 the driver names a settled input's settleMs on its effect, which agent core logs whole.
      const settleMs = Number.isInteger(end?.effect?.settleMs) ? end.effect.settleMs : null
      return { step: e.step, index: e.index, type: e.action?.type ?? null, at: Date.parse(e.t), done: end?.status ?? null, settleMs }
    })
}

/** How many input actions the trajectory shows attempted from `from` to before `to` (server clock, epoch ms), or null. */
export function inputsBetween(events, from, to) {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null
  return inputActions(events).filter((action) => action.at >= from && action.at < to).length
}

/** Read a run's events.jsonl, skipping a line still being written. */
export function readEvents(runDir) {
  const path = join(runDir, 'events.jsonl')
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8').split('\n').flatMap((line) => {
    try {
      return line.trim() === '' ? [] : [JSON.parse(line)]
    } catch {
      return []
    }
  })
}

/** The run's frame size from its run.json header, or null. */
export function readFrame(runDir) {
  try {
    const frame = JSON.parse(readFileSync(join(runDir, 'run.json'), 'utf8')).frame
    return Number.isFinite(frame?.width) && Number.isFinite(frame?.height) ? { width: frame.width, height: frame.height } : null
  } catch {
    return null
  }
}

/**
 * The control link's sequence, as a person at the page would press it: pause, resume, take over, remote input, hand
 * back, stop. Each command's reply and the state event it caused are recorded. So are the trajectory's inputs in each
 * window: none while paused or taken over, one click after the resume. Given `inputRequests` (the fake helper's request
 * log, in the unit suite), the click's `settleMs` is read off the request itself. `onState(state)` lets check 2 read the
 * watch page in each held state.
 */
export async function runControlSequence({ control, events, actions = () => [], inputRequests = null, ended = async () => null, linkPath = null, onState = null, timing = TIMING }) {
  const evidence = { steps: {}, error: null }
  const step = async (name, body, expectState) => {
    const from = events.seen.length
    const reply = await postJson(control, '/control', body)
    const event = await events.next((e) => e.type === 'state' && e.state === expectState, { from, timeoutMs: timing.stateTimeoutMs, what: `the ${expectState} state` }).catch(() => null)
    const record = { status: reply.status, state: reply.body?.state ?? null, error: reply.body?.error ?? reply.error ?? null, event: event && { prior: event.prior, state: event.state, source: event.source, at: event.at } }
    evidence.steps[name] = record
    return record
  }
  try {
    const paused = await step('pause', { command: 'pause' }, 'paused')
    if (onState !== null) await onState('paused')
    await sleep(timing.holdMs)
    const resumed = await step('resume', { command: 'resume' }, 'running')
    const resumeAt = resumed.event?.at ?? null
    evidence.inputsWhilePaused = inputsBetween(actions(), paused.event?.at, resumeAt)
    const before = Number.isFinite(resumeAt) ? inputActions(actions()).filter((action) => action.at < resumeAt).length : null
    evidence.firstInputAfterResume = Number.isFinite(resumeAt)
      ? await until(() => inputActions(actions()).find((action) => action.at >= resumeAt && action.done !== null), timing.inputTimeoutMs, 'the first input after the resume', 100).catch(() => null)
      : null
    evidence.inputsBeforeResume = before
    if (inputRequests !== null && before !== null) {
      // The fake helper logs a request on its stderr, a pipe apart from its reply: give the log line its moment.
      await until(() => inputRequests().length > before, 2_000, 'the helper\'s log of the input').catch(() => {})
      const requests = inputRequests()
      evidence.settle = { source: 'helper request log', inputRequests: requests.length, firstAfterResume: requests[before]?.settleMs ?? null, laterWithSettle: requests.slice(before + 1).filter((r) => r.settleMs !== undefined).length }
    } else if (evidence.firstInputAfterResume) {
      // A live run: the trajectory's own record of that input (effect.settleMs, CU-28); later inputs are counted at the end.
      evidence.settle = { source: 'trajectory effect.settleMs', firstAfterResume: evidence.firstInputAfterResume.settleMs, laterWithSettle: null }
    }
    const taken = await step('take_over', { command: 'take_over' }, 'taken_over')
    if (onState !== null) await onState('taken_over')
    const requestsAtTakeOver = inputRequests?.().length ?? null
    const remote = await postJson(control, '/input', { type: 'mouse', action: 'down', fx: 0.5, fy: 0.5, button: 'left' })
    evidence.remoteInput = { status: remote.status, error: remote.body?.error ?? remote.error ?? null, state: remote.body?.state ?? null, namedRefusal: remote.body?.message === DESKTOP_INPUT_REFUSAL }
    await sleep(timing.holdMs)
    if (requestsAtTakeOver !== null) evidence.helperInputsWhileTakenOver = inputRequests().length - requestsAtTakeOver
    const back = await step('hand_back', { command: 'hand_back', note: 'live probe: nothing was changed' }, 'running')
    evidence.inputsWhileTakenOver = inputsBetween(actions(), taken.event?.at, back.event?.at)
    await step('stop', { command: 'stop', reason: 'the live probe ends its run' }, 'finished')
    if (evidence.settle?.laterWithSettle === null) {
      const first = evidence.firstInputAfterResume
      evidence.settle.laterWithSettle = inputActions(actions()).filter((action) => action.at > first.at && action.settleMs !== null).length
    }
    const end = await withTimeout(ended(), timing.endTimeoutMs)
    const streamClosed = await withTimeout(events.ended, 5_000)
    evidence.end = { runId: end?.runId ?? null, status: end?.status ?? null, exitCode: end?.exitCode ?? null, controlLinkRemoved: linkPath === null ? null : !existsSync(linkPath), eventStreamClosed: streamClosed !== null }
  } catch (error) {
    evidence.error = String(error?.message ?? error)
  }
  return evidence
}

/** Check 3 judged from its evidence; the settle is judged only where it was observed. */
export function judgeControl(evidence) {
  const s = evidence.steps ?? {}
  const moved = (name, state, prior) => s[name]?.status === 200 && s[name]?.state === state && s[name]?.event?.state === state && s[name]?.event?.source === 'control' && (prior === undefined || s[name]?.event?.prior === prior)
  const parts = {
    pausePaused: moved('pause', 'paused', 'running'),
    heldWhilePaused: evidence.inputsWhilePaused === 0,
    resumeRunning: moved('resume', 'running', 'paused'),
    inputAfterResume: evidence.firstInputAfterResume?.done === 'done',
    settleMsOnThatInput: evidence.settle === undefined ? null : Number.isInteger(evidence.settle.firstAfterResume) && evidence.settle.firstAfterResume > 0 && evidence.settle.laterWithSettle === 0,
    takeOverTakenOver: moved('take_over', 'taken_over'),
    remoteInputRefusedByName: evidence.remoteInput?.status === 409 && evidence.remoteInput?.error === 'unsupported_on_desktop' && evidence.remoteInput?.namedRefusal === true,
    heldWhileTakenOver: evidence.inputsWhileTakenOver === 0 && (evidence.helperInputsWhileTakenOver ?? 0) === 0,
    handBackRunning: moved('hand_back', 'running', 'taken_over'),
    stopFinished: moved('stop', 'finished'),
    runEnded: evidence.end?.status === 'cancelled' && evidence.end?.controlLinkRemoved !== false && evidence.end?.eventStreamClosed === true,
    sameRun: evidence.link?.sameOriginAsWatch !== false && (evidence.end?.runId == null || evidence.link?.runId == null || evidence.end.runId === evidence.link.runId),
  }
  return {
    check: 3,
    name: 'control-link',
    ok: evidence.error === null && Object.values(parts).every((value) => value === true || value === null),
    evidence: { ...evidence, parts },
    unobservable: evidence.settle === undefined ? [UNOBSERVABLE.settle] : [],
  }
}

/**
 * Remove the probe's own Chrome profile without ever throwing: the results are written after cleanup, so a throw here
 * would lose them (cu-verifier saw ENOTEMPTY on the helper 0.2.16 gate - Chrome's helpers still writing). It waits for
 * Chrome to exit (killing it after waitMs), retries the removal, and returns what happened for the summary. A path
 * outside --out is never touched.
 */
export async function removeProfile(profile, { chrome = null, out, waitMs = 5_000 } = {}) {
  if (typeof out !== 'string' || !resolve(profile).startsWith(resolve(out) + sep)) return 'skipped: not under --out'
  const running = () => chrome !== null && chrome.exitCode === null && chrome.signalCode === null
  const exited = () => new Promise((done) => chrome.once('exit', () => done(true)))
  if (running()) {
    await withTimeout(exited(), waitMs)
    if (running()) {
      try { chrome.kill('SIGKILL') } catch { /* already gone */ }
      await withTimeout(exited(), 2_000)
    }
  }
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    return 'removed'
  } catch (error) {
    return `left in place: ${error?.code ?? error?.message ?? 'error'}`
  }
}

/**
 * All three checks against one live view. `link` is the run's control file (`controlLinkFile`). `watchUrl` resolves
 * to the watch URL as the run hands it out (the CLI's stderr line, or startRun's handle in the unit suite).
 * `openDom(url)` resolves a `readDom(expectedState)` that reads the watch page. `actions()` is the trajectory's
 * events. `ended()` resolves the run's result once it ends, `frameSize()` the run's frame. /events and /screen are
 * opened with the control link at once, before the run's environment is attached, so the time before the first
 * approved app is watched. The watch link's /screen joins as soon as its URL is known. A run still live when the
 * probe is done is stopped. Resolves `{ results, tokens }`; the tokens are for scrubbing what is printed.
 */
export async function probeLiveView({ link, watchUrl, watchSource = 'the run', openDom = null, actions = () => [], inputRequests = null, ended = async () => null, frameSize = () => null, approved = APPROVED, timing = TIMING }) {
  const control = new URL(link.url)
  const tokens = [control.searchParams.get('token')]
  const events = watchEvents(control)
  const screens = [watchScreen(control, 'control-link')]
  let watchEvidence = null
  let controlEvidence = null
  let failure = null
  try {
    const url = await withTimeout(watchUrl, timing.linkTimeoutMs)
    if (url === null) throw new Error('the run handed out no watch URL in time')
    const watch = new URL(url)
    tokens.push(watch.searchParams.get('token'))
    const sameOrigin = watch.origin === control.origin && watch.searchParams.get('token') !== control.searchParams.get('token')
    screens.push(watchScreen(watch, 'watch-link'))
    await until(() => scopeTimeline(events.seen).some((entry) => entry.scope.length > 0) && screens.every((screen) => screen.frames.length >= timing.frames), timing.scopeTimeoutMs, 'the first approved app and its frames').catch(() => {})
    const watchRun = await runWatchChecks({ watch, events, openDom })
    watchEvidence = { link: { source: watchSource, origin: watch.origin, sameOriginAsControl: sameOrigin }, ...watchRun.evidence }
    const onState = watchRun.readDom === null ? null : async (state) => {
      try {
        watchEvidence.snapshots.push({ expected: state, ...(await watchRun.readDom(state)) })
      } catch (error) {
        watchEvidence.domError ??= String(error?.message ?? error)
      }
    }
    controlEvidence = await runControlSequence({ control, events, actions, inputRequests, ended, linkPath: link.path, onState, timing })
    controlEvidence.link = { source: 'the run\'s control file', path: link.path, mode: link.mode, runId: link.runId, sameOriginAsWatch: sameOrigin }
  } catch (error) {
    failure = String(error?.message ?? error)
  } finally {
    if (controlEvidence?.steps?.stop?.status !== 200) await postJson(control, '/control', { command: 'stop', reason: 'the live probe ends its run' })
    await withTimeout(Promise.all([events.ended, ...screens.map((screen) => screen.ended)]), 5_000)
    events.close()
    for (const screen of screens) screen.close()
  }
  const results = [
    judgeScreen({ events: events.seen, screens, approved, frameSize: frameSize() }),
    watchEvidence === null ? notReached(2, failure ?? 'not reached') : judgeWatch(watchEvidence),
    controlEvidence === null ? notReached(3, failure ?? 'not reached') : judgeControl(controlEvidence),
  ]
  return { results, tokens }
}

/**
 * The watch page in headless Chrome: navigate once (without waiting long for `load`: the page's screen is an endless
 * stream), then each read waits for the page to show the expected state on a desktop run, with a frame on its screen,
 * and snapshots its controls.
 */
export function chromeDom(handle, timing = TIMING) {
  return async (url) => {
    await handle.page.navigate({ url, timeoutMs: 3_000 })
    return async (expected) => {
      const condition = `document.body && document.body.dataset.state === ${JSON.stringify(expected)} && document.body.dataset.kind === 'desktop' && (document.getElementById('screen')?.naturalWidth ?? 0) > 0`
      try {
        await handle.waitFor(condition, timing.domTimeoutMs)
      } catch {
        // Judged from the snapshot, which records the state the page did show.
      }
      return JSON.parse(await handle.evaluate(DOM_SNAPSHOT))
    }
  }
}

/**
 * The live run: prepare the private CU_HOME, pass the browser gate and start headless Chrome. Then the desktop
 * suite's attempt launches CU Fixture and calls the runner, which starts `cli.mjs run` and probes it.
 */
async function runLive({ options, home, write, warn }) {
  const refuse = (why) => {
    warn(`live-probe: ${why}`)
    write(summaryLine([], { refused: why }))
    return 3
  }
  createPrivateHome(home)
  let prepared
  try {
    // The operator's own CU_HOME is only read here: the installed helper the link names and the owner's tty records.
    prepared = prepareDesktop({ out: options.out, taskId: TASK_ID, sourceHome: cuHome() })
  } catch (error) {
    return refuse(`${error.message}; ${NOTHING}`)
  }
  if (prepared.refusal !== null) return refuse(prepared.refusal)
  warn(prepared.note.replace(/^desktop proof:/, 'live-probe:'))
  const profile = join(options.out, 'chrome-profile')
  let slot
  try {
    slot = await resourceGate({ seat: options.seat, profile })
  } catch (error) {
    return refuse(`the browser gate refused headless Chrome (${error.reason ?? error.code ?? 'error'}): ${error.message}; ${NOTHING}`)
  }
  let page
  try {
    page = await openPage({ profile })
    slot.setChromePid(page.browser.running.child.pid)
  } catch (error) {
    slot.release()
    return refuse(`headless Chrome did not start: ${error.message}; ${NOTHING}`)
  }
  const state = { results: null, tokens: [], link: null, result: null, sink: null, child: null, error: null, row: null }
  const stopChild = () => { if (state.child !== null && state.child.exitCode === null) state.child.kill('SIGTERM') }
  // The CLI ends its run on SIGTERM (a stop); Chrome is closed so no headless browser outlives the probe.
  const cap = setTimeout(() => {
    warn(`live-probe: the hard cap of ${TIMING.hardCapMs / 1000} s was reached; stopping the run`)
    stopChild()
    void Promise.resolve(page.close()).catch(() => {}).finally(() => {
      slot.release()
      write(summaryLine(state.results ?? [], { error: 'hard cap reached', runId: state.link?.runId ?? null }, state.tokens))
      process.exit(1)
    })
  }, TIMING.hardCapMs)
  process.once('SIGINT', stopChild)
  process.once('SIGTERM', stopChild)
  try {
    const built = buildFixtureApp()
    const runner = async ({ fixture }) => {
      const base = scriptedPlan([{ press: CLICK_TARGET }], await fixture.targets(), await fixture.call('windows', {}), await fixture.call('screen', {}))
      if (base === null) throw new Error(`the fixture's '${CLICK_TARGET}' target could not be placed on the screen`)
      const planPath = join(home, 'live-probe-plan.json')
      writeFileSync(planPath, JSON.stringify(probePlan(base)), { mode: 0o600 })
      const runsDir = join(home, 'runs')
      let gotWatch
      const watchUrl = new Promise((resolvePromise) => { gotWatch = resolvePromise })
      const sink = cliStderrSink({ onWatch: gotWatch })
      state.sink = sink
      // From a clean environment with the private CU_HOME, as the desktop suite starts its CLI (no loader variables).
      const child = spawn(process.execPath, cliArgs({ seat: options.seat, planPath, runsDir }), { stdio: ['ignore', 'pipe', 'pipe'], env: sessionEnv(process.env, { cuHome: home }) })
      state.child = child
      let stdout = ''
      child.stdout.on('data', (chunk) => { stdout += chunk })
      child.stderr.on('data', (chunk) => sink.push(chunk))
      const exited = new Promise((resolvePromise) => child.once('exit', (code) => resolvePromise(code)))
      const result = async () => ({ ...parseResult({ code: await exited, stdout, stderr: sink.tail() }), exitCode: await exited })
      try {
        const link = await waitForControlLink(home, { exited })
        state.link = link
        const runDir = join(runsDir, link.runId)
        const probed = await probeLiveView({
          link, watchUrl: Promise.race([watchUrl, exited.then(() => null)]), watchSource: "the CLI's stderr line 'live view (watch):'",
          openDom: chromeDom(page), actions: () => readEvents(runDir), ended: result, frameSize: () => readFrame(runDir),
        })
        state.results = probed.results
        state.tokens = probed.tokens
      } catch (error) {
        state.error = String(error?.message ?? error)
      } finally {
        if (await withTimeout(exited, TIMING.endTimeoutMs) === null) {
          stopChild()
          if (await withTimeout(exited, 10_000) === null) child.kill('SIGKILL')
        }
      }
      state.result = await result()
      return state.result
    }
    state.row = await runDesktopAttempt({ id: TASK_ID, seed: 'live-probe', built, runner, model: 'scripted', bounds: CAPS, visible: true })
  } catch (error) {
    state.error ??= String(error?.message ?? error)
  } finally {
    clearTimeout(cap)
    process.removeListener('SIGINT', stopChild)
    process.removeListener('SIGTERM', stopChild)
    stopChild()
    const chrome = page.browser?.running?.child ?? null
    await page.close().catch(() => {})
    slot.release()
    // Never let cleanup cost the evidence: Chrome's helpers may still be writing the profile (ENOTEMPTY seen live).
    state.cleanup = await removeProfile(profile, { chrome, out: options.out })
  }
  const results = state.results ?? [1, 2, 3].map((check) => notReached(check, state.error ?? 'the run did not start'))
  for (const result of results) write(checkLine(result, state.tokens))
  write(summaryLine(results, {
    runId: state.link?.runId ?? null,
    runStatus: state.result?.status ?? null,
    out: options.out,
    links: {
      watch: "the CLI's stderr line 'live view (watch):'",
      control: state.link === null ? null : `${state.link.path} (mode ${state.link.mode})`,
      controlLinesDroppedFromStderr: state.sink?.controlLinesDropped ?? 0,
    },
    fixtureInput: state.row?.input ?? null,
    profileCleanup: state.cleanup ?? null,
    ...(state.error ? { error: state.error } : {}),
  }, state.tokens))
  return results.length === CHECK_NAMES.length && results.every((result) => result.ok === true) ? 0 : 1
}

/**
 * The command line. Everything that can refuse runs before anything is started: the flags, `--announced yes`, the
 * private CU_HOME's place (desktop-proof.mjs `privateCuHome`: under /tmp, its helper socket within the kernel's
 * limit) and `homeRefusal`. Resolves the exit code; `write` takes the stdout lines, `warn` the stderr ones. `start` is a
 * seam for the unit suite only, so its refusal tests can prove nothing past them would have started.
 */
export async function main(argv, { write = (line) => process.stdout.write(`${line}\n`), warn = (line) => process.stderr.write(`${line}\n`), start = runLive } = {}) {
  let options
  try {
    options = parseProbeArgs(argv)
  } catch (error) {
    if (!(error instanceof UsageError)) throw error
    warn(`live-probe: ${error.message}\n${USAGE}`)
    write(summaryLine([], { refused: `usage: ${error.message}` }))
    return 64
  }
  if (options.help) {
    warn(USAGE)
    return 0
  }
  const refuse = (why) => {
    warn(`live-probe: ${why}`)
    write(summaryLine([], { refused: why }))
    return 3
  }
  const announced = announcedRefusal(options)
  if (announced !== null) return refuse(announced)
  let home
  try {
    home = privateCuHome(options.out)
  } catch (error) {
    return refuse(`${error.message}; ${NOTHING}`)
  }
  const why = homeRefusal({ home, out: options.out })
  if (why !== null) return refuse(why)
  warn(probeWarning())
  return start({ options, home, write, warn })
}

if (isEntryPoint(process.argv[1], import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => { process.exitCode = code },
    (error) => {
      process.stderr.write(`live-probe: ${error?.stack ?? error}\n`)
      process.stdout.write(`${summaryLine([], { error: redactTokens(String(error?.message ?? error)) })}\n`)
      process.exitCode = 1
    },
  )
}
