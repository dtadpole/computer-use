#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { closeSync, openSync, readFileSync, realpathSync, symlinkSync, unlinkSync, writeFileSync, writeSync } from 'node:fs'
import net from 'node:net'
import { dirname, join } from 'node:path'

import { makePng } from './png.mjs'

/**
 * A fake desktop helper: a Node script that speaks the helper's line protocol (helper-and-protocol.md) over stdio or,
 * given `--socket` and `--token-file`, over the driver's Unix socket - so the driver, the link and the protocol are
 * tested end to end without CUHelper.app, without a grant and without touching the screen. It is the protocol
 * reference the desktop verifiers drive, kept at parity with the Swift helper 0.2.2 (cu-developer-three).
 *
 * It mirrors the Swift helper's rules: unknown requests and fields are refused by name; a capability whose grant is
 * missing answers `not_granted` naming it; `scope` takes 1 to 32 valid bundle ids (there is no empty scope request:
 * a run's empty scope is no `scope` at all, and everything that needs one is refused `no_scope`), replaces the whole
 * scope (so a grown scope must name every app) and refuses an excluded id - an entry, its children, any case, trimmed -
 * without changing it; input needs a scope, the local-input pause (global mode), its target app (`bundleId`), every
 * point and the frontmost app in scope; out-of-scope elements are reported by bundle id only.
 *
 * **`hitTest` names the app at the point (D-036).** A configured element there is answered (one without a `bundleId`
 * takes that of the app whose window holds the point, `appAt`); else an out-of-scope app's window answers its bundle
 * id and pid only - as helper 0.2.10 named CU Ledger live while the run's scope was CU Fixture - so the driver's own
 * target check can refuse a click there; else null (empty space, and, unlike the real helper's window owner, an
 * approved app's unconfigured area).
 *
 * **The command line (Arguments.swift).** The serving flags of the real helper, with its value rules: `--socket`,
 * `--stdio`, `--token-file`, `--driver-node`, `--driver-entry`, `--enforce-boundary`, `--lock-path`, `--exclude`,
 * `--simulate-ungranted`, `--dry-run`, `--world`, `--events-out`, `--max-run-seconds`, `--idle-seconds`,
 * `--idle-tolerance-ms`, `--idle-synthetic-resets`, `--inter-event-ms`; paths absolute and on one line; numbers in
 * range; `--lock-path` only with `--enforce-boundary`, and only while no grant is held; `--world` and `--events-out`
 * only with `--dry-run`; `--socket` needs `--token-file`; an explicit `--stdio` needs `--dry-run` or
 * `--simulate-ungranted`. Anything else - an unknown flag first of all - is refused as the real helper refuses it:
 * `args refused: <why>` on stderr and exit 64, before any connection. No arguments at all is the fake's own stdio test
 * transport (token from `FAKE_HELPER_TOKEN`). `--exclude` adds an exclusion and `--simulate-ungranted` forces every
 * grant off, as in the real helper; the dry-run, idle and timing flags are checked and otherwise ignored.
 *
 * Captures come back inline (`png`) or, as the design allows for megabyte images, as a file it writes into the run's
 * private directory (`path` and `sha256`; the file is `capture-<pid>-<n>.png`, mode 600, and the driver deletes it).
 * The run directory is the socket's directory, or `runDir` from the config over stdio; `captureForm` (`png` or
 * `path`) picks the form, by default `path` whenever a run directory is known.
 *
 * The design's two test seams are honoured as the Swift helper honours them: `capture {simulateScale}` renders at
 * that backing scale (above 1, at most 4) and reports it as `scale`; `simulateLocalInput {kind, via}` needs the pause
 * armed, `via: 'tap'` an installed tap and `via: 'untagged'` the accessibility grant (it would post a real event), a
 * scope and an approved app in front, and sends `localInput {at, kind}` before its reply `{detectedBy}`.
 *
 * **The local-input guards (helper 0.2.2, human-control.md 0.3.2).** Arming the pause starts the idle counter and,
 * when a preflight already allows one, the event tap: an active pass-through tap with Accessibility, else a
 * listen-only tap with Input Monitoring (`listenEvents`), else none. The reply's `via` is
 * `['idleCounter', 'eventTap']` with a tap of either kind and `['idleCounter']` without (`[]` disarmed). With no tap,
 * `simulateLocalInput {via: 'tap'}` is refused `not_granted` naming `accessibility`; an untagged event is seen by the
 * tap when there is one, else by the idle counter.
 *
 * **The peer boundary (helper-boundary.md, D-029).** The order is the real helper's: lock (when the boundary is
 * enforced), connect, check the peer, and only then read the token file and send hello. A refused peer gets nothing -
 * the socket is closed without a byte, the token is never read, `peer refused pid=<n>` goes to stderr and the fake
 * exits 3. Node cannot read `LOCAL_PEERPID` or the peer's argv, so the fake names its parent (the driver, in these
 * tests) or `peerPid` from the config, and refuses under the `peerRefused` quirk; with `--enforce-boundary` on the
 * socket (and neither `--dry-run` nor `--simulate-ungranted`) it logs `boundary enforced lock=private|none` and also
 * refuses a launch that does not name both `--driver-node` and `--driver-entry`, or names one that does not resolve -
 * the node signature and the entry-point list are the real helper's alone. `--lock-path` is a private one-helper lock:
 * created exclusively (mode 600) and removed at exit; a second fake on the same path logs `another helper is running`
 * and exits 4 (unlike the real `flock`, a SIGKILLed fake leaves the file behind). Without `--lock-path` the fake takes
 * no lock at all - never the real helper's shared one. The real helper enforces the boundary whenever it holds a grant
 * at its start; the fake only when told, so tests of the protocol need no driver arguments. One run only: it exits 4
 * (`no driver accepted within <n> ms`) when no driver has accepted its hello - by sending a first request - within
 * `connectWindowMs` (default 10 s, the design's window), and exits 0 on `bye`, on socket loss or when stdin ends.
 *
 * **Design 0.3.** Hello grants carry `postEvents`; `input` needs `accessibility` then `postEvents`, and so does
 * `simulateLocalInput {via: 'untagged'}`, which posts. A grant configured as `null` is left out of the hello and gates
 * nothing, as in a helper from before 0.3. Elements carry `opaque` - unnamed `AXUnknown`, `AXGroup`, `AXWindow` or
 * `AXScrollArea` - unless the config's element says otherwise. Under the `secureInput` quirk secure event input is on:
 * an `input` stops before its first key step (`keyDown`, `keyUp`, `text`) with the mid-batch form the Swift helper
 * uses, `{ok: true, done: false, failedAt, code: 'secure_input', message, frontmostBundleId}` - `failedAt: 0` when
 * nothing was posted; the `secureInputRefusal` quirk answers that case as a refusal instead (`{ok: false, code:
 * 'secure_input'}`), the older form the driver still accepts.
 *
 * **The settle after a human resume (helper-protocol-details.md 0.4.1-0.4.2, helper 0.2.8).** `input {settleMs}` (a
 * whole number of ms, 1 to 60000, else `invalid_argument`) asks the helper to wait for the person's hands to leave the
 * Mac before it posts. The fake models the HID idle counter as the time since the last local input it saw: a
 * `simulateLocalInput` of any `via`, the `localInputAfter` quirk's input, and the person of the `personActiveMs`
 * config, who keeps using the Mac for that many ms from the moment a settle begins (the Resume click and the pointer
 * drift after it). It honours `settleMs` only when it has seen local input since its last posted step - a
 * `localInput` it reported or a `local_input` stop it answered; arming the pause forgets both - and otherwise logs
 * `settle ignored` and posts at once, so a driver that sent it on every input could not wear down the idle guard (the
 * fake releases no held input, which in the real helper never counts as a post). Honoured, it waits in real time,
 * polling the counter, until it reads `settleMs`, logs `settle honoured settleMs=<n> waited=<ms> lastInput=<ms>`, takes that moment as
 * its baseline - the settle is spent there: the next `settleMs` is ignored until new local input, whatever the checks
 * then decide - and checks and posts each step as usual (the `localInputAfter` quirk still applies). The fake keeps no
 * stop hold (the real helper's one-second refusal after a report), so there is none to clear. Past `settleCapMs`
 * (config, default 60000, the design's cap) it logs `settle cap reached` and answers `{ok: true, done: false,
 * failedAt: 0, code: 'local_input'}`, posting nothing; the input it saw stays unspent. Nothing posts during a settle -
 * an input that arrives meanwhile waits its turn - but the guards stay armed: a `simulateLocalInput` then sends its
 * `localInput` as ever (stderr `local input during the settle`) and restarts the wait, and the person reports
 * `localInput {kind: 'pointer'}` while active (stderr `person during the settle`), at most twice a second counting
 * every report, as the real guard rate-limits all but the seam's.
 *
 * Its world comes from the `FAKE_HELPER_CONFIG` environment variable (JSON): `grants`, `displays`, `apps`
 * (`[{ bundleId, pid, rect }]`, top-most first), `frontmost`, `elements` (`[{ rect, element }]`), `focused`, `focusedReads`
 * (successive focused answers, the last repeating), `defaultButton` (the button Return presses where focus is; CU-142),
 * `defaultButtonRead` (whether that button could be read, sent as given beside it; true when the world says nothing,
 * as the real helper reads a positive none - it sends the field in every focused reply; quirk omitDefaultButtonRead
 * leaves it out, the deviation CU-215 reads as unreadable; CU-190),
 * `sheet` (a sheet or alert where focus is, sent as given; CU-148),
 * `menuKeys` (`[{ keyCode, flags, reply }]`: menuKey's answer for that exact keyDown) and `menuKeyDefault` (else; default
 * `{ none: true, bundleId: <frontmost> }`, as helper 0.2.52 answers; CU-236),
 * `focusedApp` (sent as the 'focused' reply's `app`: the app whose window was read when no element has focus; CU-148),
 * `changeCount` (the pasteboard change count beside the focused element and the hit-tested one, phased; CU-151),
 * `textEntered` (whether the target's window holds typed text, beside the same two, sent as given and phased; CU-157),
 * `phases` (`[{ afterInputs, ...overrides }]`: once the helper has
 * taken that many input requests, the phase's `focused` and `panelSelection` replace the base world's - an app's own
 * reaction to input, such as a panel moving to another folder; the last phase reached wins),
 * `screenText`, `excluded` (bundle ids, `prefix.` or `prefix.*` entries it refuses to scope), `runDir`,
 * `captureForm`, `connectWindowMs`, `peerPid`, the settle's `personActiveMs` and `settleCapMs`, and `quirks` for
 * broken or refusing behaviour: `peerRefused`, `badToken`, `protocol`, `helloExtra`, `replyUnknownIdOn`, `exitOn`,
 * `garbageOn`, `failOn`, `localInputAfter`, `secureInput`, `secureInputRefusal`, `omitOpaque` (a helper from before
 * design 0.3), `displayChangeAfter`, `silentOn`, `ignoreSimulateScale`, and for capture files `captureBadHash`,
 * `captureBoth`, `captureOutside` (an absolute path to write the file to instead) and `captureSymlinkTo` (an absolute
 * path the reported file links to).
 * Every request it receives is written to stderr as `REQ <json>`; the boundary steps as `peer ok pid=<n>`,
 * `peer refused pid=<n>`, `token read` (never the token) and `no driver accepted within <n> ms`; the settle's
 * decisions as above.
 */

/** One line to stderr, synchronously, so it is in the pipe before the fake replies or exits. */
const log = (line) => writeSync(2, `${line}\n`)

/** Bundle ids as the Swift helper accepts them (`BundleIdentifier.isValid`). */
const BUNDLE_ID = /^[A-Za-z0-9][A-Za-z0-9.-]{0,254}$/
const MAX_SCOPE_APPS = 32

/** The real helper's serving flags (Arguments.swift): a switch, an absolute path, an exclusion, or a number range. */
const FLAGS = {
  '--socket': 'path',
  '--stdio': 'switch',
  '--token-file': 'path',
  '--dry-run': 'switch',
  '--world': 'path',
  '--events-out': 'path',
  '--simulate-ungranted': 'switch',
  '--enforce-boundary': 'switch',
  '--lock-path': 'path',
  '--exclude': 'exclude',
  '--driver-node': 'path',
  '--driver-entry': 'path',
  '--max-run-seconds': [1, 14400],
  '--idle-seconds': [10, 3600],
  '--idle-tolerance-ms': [0, 200],
  '--idle-synthetic-resets': 'switch',
  '--inter-event-ms': [0, 200],
}

const camel = (flag) => flag.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())

/** The command line, parsed and checked as the Swift helper does; throws `Error(why)` on the first problem. */
function parseArguments(raw) {
  const parsed = { excludes: [], transport: null }
  // LaunchServices may add a process serial number argument on older systems; it is not ours to parse.
  const rest = raw.filter((argument) => !argument.startsWith('-psn_'))
  while (rest.length > 0) {
    const flag = rest.shift()
    const kind = Object.hasOwn(FLAGS, flag) ? FLAGS[flag] : undefined
    if (kind === undefined) throw new Error(`unknown argument '${flag}'`)
    if (flag === '--stdio') parsed.transport = 'stdio'
    if (kind === 'switch') {
      parsed[camel(flag)] = true
      continue
    }
    if (rest.length === 0) throw new Error(`${flag} needs a value`)
    const value = rest.shift()
    if (kind === 'path') {
      if (!value.startsWith('/') || value.includes('\0') || value.includes('\n')) throw new Error(`${flag} needs an absolute path`)
      parsed[camel(flag)] = value
      if (flag === '--socket') parsed.transport = 'socket'
    } else if (kind === 'exclude') {
      if (!BUNDLE_ID.test(value.endsWith('.*') ? value.slice(0, -2) : value)) throw new Error('--exclude needs a bundle id or a prefix ending in .*')
      parsed.excludes.push(value)
    } else {
      const number = value.trim() === '' ? Number.NaN : Number(value)
      if (!Number.isFinite(number) || number < kind[0] || number > kind[1]) throw new Error(`${flag} must be a number from ${kind[0]} to ${kind[1]}`)
      parsed[camel(flag)] = number
    }
  }
  if (parsed.transport === 'socket' && parsed.tokenFile === undefined) throw new Error('--token-file <path> is required')
  if (parsed.transport === 'stdio' && !parsed.dryRun && !parsed.simulateUngranted) throw new Error('--stdio needs --dry-run or --simulate-ungranted')
  if (parsed.lockPath !== undefined && !parsed.enforceBoundary) throw new Error('--lock-path belongs to --enforce-boundary')
  if (!parsed.dryRun && (parsed.world !== undefined || parsed.eventsOut !== undefined)) throw new Error('--world and --events-out belong to --dry-run')
  return parsed
}

let options
try {
  options = parseArguments(process.argv.slice(2))
} catch (error) {
  log(`args refused: ${error.message}`)
  process.exit(64)
}

const config = JSON.parse(process.env.FAKE_HELPER_CONFIG ?? '{}')
// config.phases: the world after N input requests. Counted when an input is taken (not refused), before it posts, so
// the reply the driver waits for already reflects the app's reaction; reads count nothing (CU-48's seam test).
let inputsTaken = 0
/** CU-151: the pasteboard change count, only when the world names one (else an older helper); phased, so a copy can raise it. */
function counted() {
  const named = 'changeCount' in config || (config.phases ?? []).some((phase) => 'changeCount' in phase)
  const entered = 'textEntered' in config || (config.phases ?? []).some((phase) => 'textEntered' in phase)
  return { ...(named ? { changeCount: phased('changeCount') } : {}), ...(entered ? { textEntered: phased('textEntered') } : {}) }
}
function phased(key) {
  let value = config[key]
  for (const phase of config.phases ?? []) if (inputsTaken >= phase.afterInputs && key in phase) value = phase[key]
  return value
}
const quirks = config.quirks ?? {}
const grants = { screen: true, accessibility: true, postEvents: true, listenEvents: false, ...(config.grants ?? {}) }
// `--simulate-ungranted`: every grant the helper reports is off, whatever it holds.
if (options.simulateUngranted) for (const name of Object.keys(grants)) if (grants[name] !== null) grants[name] = false
const displays = config.displays ?? [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 800, height: 600 }, scale: 1 }]
const apps = config.apps ?? [{ bundleId: 'com.example.fixture', pid: 501, rect: { x: 0, y: 0, width: 800, height: 600 } }]
const excluded = [...(config.excluded ?? ['com.apple.Terminal', 'com.reflection.cu-helper', 'com.1password.']), ...options.excludes]
let frontmost = config.frontmost ?? apps[0]?.bundleId ?? null
let scope = null
let armed = false
/** The event tap the armed pause installed: `active` (Accessibility), `listen-only` (Input Monitoring) or null. */
let tap = null
let captures = 0
let watching = null

/**
 * The HID idle counter, as the time since `lastLocalAt` (or since the end of the `personActiveMs` person while a settle
 * runs): the last local input the fake saw. None yet reads as idle for ever.
 */
let lastLocalAt = Number.NEGATIVE_INFINITY
/**
 * Whether local input was seen since the last posted step and not yet spent by a settle: the only case in which
 * `settleMs` is honoured.
 */
let sawLocalInput = false
/** While a settle waits: the moment its `personActiveMs` person stops (null without one), and the flag itself. */
let personUntil = null
let settling = false
/** When the last `localInput` event went out: the guards report at most every `REPORT_EVERY_MS`, the seam excepted. */
let lastReportAt = Number.NEGATIVE_INFINITY
/** The settle in progress and the inputs queued behind it, or null: nothing posts while one waits. */
let inputTurn = null
const personActiveMs = config.personActiveMs ?? 0
const settleCapMs = config.settleCapMs ?? 60_000
const SETTLE_LIMIT_MS = 60_000
/** How often a settle reads the idle counter; short, so local input that restarts the wait is seen at once. */
const SETTLE_POLL_MS = 10
/** The real guard's rate limit on `localInput` events (Dispatcher.swift `reportLocalInput`): twice a second. */
const REPORT_EVERY_MS = 500

const REQUESTS = {
  scope: ['bundleIds'],
  capture: ['display', 'maxSize', 'region', 'simulateScale'],
  // `settleMs` since helper 0.2.8 (design 0.4.2), in the driver's REQUEST_FIELDS as in Protocol.swift.
  input: ['events', 'mode', 'bundleId', 'settleMs'],
  hitTest: ['xPt', 'yPt'],
  focused: [],
  // CU-187 (helper 0.2.45); quirk noSelection models an older helper (unknown_request).
  ...(quirks.noSelection ? {} : { selection: [] }),
  // CU-236: the menu item a chord's keyDown would fire; quirk noMenuKey models a helper without it (unknown_request).
  ...(quirks.noMenuKey ? {} : { menuKey: ['keyCode', 'flags'] }),
  panelSelection: [],
  screenText: ['maxChars'],
  watch: quirks.watchNoRegion ? ['fps', 'maxSize'] : ['fps', 'maxSize', 'region'],
  unwatch: [],
  // CU-64 (helper 0.2.30); quirk noCursor models an older helper (unknown_request).
  ...(quirks.noCursor ? {} : { cursor: [] }),
  pauseOnLocalInput: ['on'],
  simulateLocalInput: ['kind', 'via'],
  // CU-203 (helper 0.2.50): the lock's own request; the config's `confirm` is the owner's answer - { outcome, source,
  // confirmationId } or { refuse: code } - and a scoped fake refuses it unsupported, as the helper does.
  ...(quirks.noConfirm ? {} : { confirmPhysical: ['seat', 'task', 'timeoutMs'] }),
  bye: [],
}
/** The grants each request needs, checked in order, so the first missing one is named. */
const GATE = {
  capture: ['screen'], watch: ['screen'], input: ['accessibility', 'postEvents'], hitTest: ['accessibility'], focused: ['accessibility'], screenText: ['accessibility'],
}
const LOCAL_INPUT_VIA = ['tap', 'idle', 'untagged']
const LOCAL_INPUT_KINDS = ['key', 'pointer']
const KEY_STEPS = ['keyDown', 'keyUp', 'text']
/** Generic AX roles that say nothing about what a click does when the element is unnamed (input-and-targets.md). */
const OPAQUE_ROLES = ['AXUnknown', 'AXGroup', 'AXWindow', 'AXScrollArea']

const inside = (rect, x, y) => rect && x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height
const appAt = (x, y) => apps.find((app) => inside(app.rect, x, y)) ?? null
const inScope = (bundleId) => scope !== null && scope.includes(bundleId)

/** The exclusion entry that covers `bundleId`, as the Swift helper matches: the entry and its children, any case, trimmed. */
function exclusionOf(bundleId) {
  const id = bundleId.trim().toLowerCase()
  return excluded.find((entry) => {
    let base = entry.toLowerCase()
    if (base.endsWith('.*')) base = base.slice(0, -2)
    else if (base.endsWith('.')) base = base.slice(0, -1)
    return id === base || id.startsWith(`${base}.`)
  })
}

let output
let lineBuffer = ''

function send(message) {
  output.write(`${JSON.stringify(message)}\n`)
}

function refuse(id, code, message, extra = {}) {
  send({ id, ok: false, code, message, ...extra })
}

/** An input stopped at step `failedAt` (Dispatcher.swift `stopped`): the steps before it were posted. */
function stopped(id, failedAt, code, message, extra = {}) {
  send({ id, ok: true, done: false, failedAt, code, message, frontmostBundleId: frontmost, ...extra })
}

/**
 * Helper 0.2.19 (CU-44): a release while a held move was posted since the button went down sends Escape before the
 * ups, so nothing drops, and the stop reply says `cancelledDrag: true`; a plain press stopped before its up does not.
 */
function cancelledDrag(events, failedAt) {
  let down = false
  let held = false
  for (const event of events.slice(0, failedAt)) {
    if (event.kind === 'down') { down = true; held = false }
    else if (event.kind === 'up') { down = false; held = false }
    else if (down && event.kind === 'drag') held = true
  }
  return down && held
}

/** A person's input reached the Mac now: the idle counter restarts, and the next `settleMs` may be honoured. */
function noteLocalInput() {
  lastLocalAt = Date.now()
  sawLocalInput = true
}

/**
 * A guard saw the person: note it and send `localInput {at, kind}` - time and kind only. `force` is the seam's and the
 * stop's way (always sent); otherwise at most one event per `REPORT_EVERY_MS`, as the real guard reports. True when an
 * event went out.
 */
function reportLocalInput(kind, { force = false } = {}) {
  noteLocalInput()
  const now = Date.now()
  if (!force && now - lastReportAt < REPORT_EVERY_MS) return false
  lastReportAt = now
  send({ event: 'localInput', at: new Date(now).toISOString(), kind })
  return true
}

/** The idle counter at `now`: ms since the last local input, the `personActiveMs` person counted while they last. */
const idleMs = (now) => now - Math.max(lastLocalAt, personUntil === null ? Number.NEGATIVE_INFINITY : Math.min(now, personUntil))

/**
 * Wait until the idle counter reads `settleMs` (true) or the cap passes first (false). Real time, read every few ms,
 * so local input that arrives meanwhile restarts the wait. The guards stay armed throughout (helper 0.2.8): the
 * `personActiveMs` person is reported while active, rate-limited, and it is the driver that pauses nothing meanwhile.
 * Honoured, the settle is spent at once - before the checks and posts that follow, as the real helper latches its
 * baseline and forgets the input it saw there - so the next `settleMs` waits for new local input.
 */
async function settle(settleMs) {
  const started = Date.now()
  personUntil = personActiveMs > 0 ? started + personActiveMs : null
  settling = true
  try {
    for (;;) {
      const now = Date.now()
      if (personUntil !== null && now < personUntil && reportLocalInput('pointer')) log('person during the settle: localInput sent, the wait restarts')
      const idle = idleMs(now)
      if (idle >= settleMs) {
        sawLocalInput = false
        // lastInput: when the last local input came, on this settle's own clock (negative: before it began), so a check
        // can compare the wait with it without mixing this process's start with the test's.
        log(`settle honoured settleMs=${settleMs} waited=${now - started} lastInput=${Number.isFinite(lastLocalAt) ? lastLocalAt - started : 'none'}`)
        return true
      }
      const left = settleCapMs - (now - started)
      if (left <= 0) {
        log(`settle cap reached after ${now - started} ms`)
        return false
      }
      await new Promise((resolve) => setTimeout(resolve, Math.max(1, Math.min(settleMs - idle, left, SETTLE_POLL_MS))))
    }
  } finally {
    settling = false
    personUntil = null
  }
}

/** The run's private directory: the socket's own, or the config's over stdio; null when there is none. */
const runDir = () => (socketPath !== undefined ? dirname(socketPath) : config.runDir ?? null)

/**
 * A capture's image fields: inline `png`, or `path` and `sha256` of a file written into the run directory (or, under a
 * quirk, somewhere the driver must refuse).
 */
function captureImage(png) {
  const dir = runDir()
  const form = config.captureForm ?? (dir !== null ? 'path' : 'png')
  if (form === 'png') return { png: png.toString('base64') }
  const path = quirks.captureOutside ?? join(dir, `capture-${process.pid}-${captures}.png`)
  if (quirks.captureSymlinkTo !== undefined) {
    // The reported name is in the run directory, but it links to a file elsewhere.
    writeFileSync(quirks.captureSymlinkTo, png, { mode: 0o600 })
    symlinkSync(quirks.captureSymlinkTo, path)
  } else {
    writeFileSync(path, png, { mode: 0o600 })
  }
  const sha256 = createHash('sha256').update(quirks.captureBadHash ? Buffer.from('not the image') : png).digest('hex')
  return { path, sha256, ...(quirks.captureBoth ? { png: png.toString('base64') } : {}) }
}

const unnamed = (entry) => !(typeof entry.title === 'string' && entry.title.trim().length > 0)

function elementShape(entry) {
  if (entry === null || entry === undefined) return null
  // Out-of-scope apps are named by bundle id only, never by title (trajectory-privacy.md).
  const shape = inScope(entry.bundleId)
    ? { ...entry, opaque: entry.opaque ?? (OPAQUE_ROLES.includes(entry.role) && unnamed(entry)) }
    : { bundleId: entry.bundleId, pid: entry.pid ?? null, role: null, subrole: null, title: null, frame: null, secure: false, opaque: false,
      // Helper 0.2.24 keeps elementOwner on an owner-only answer (D-045), never a title.
      ...(entry.elementOwner ? { elementOwner: entry.elementOwner } : {}) }
  if (quirks.omitOpaque) delete shape.opaque
  return shape
}

/**
 * A configured element as the real helper would name it: an AX element belongs to the app whose window holds the
 * point, so one configured without a `bundleId` takes that app's bundle id and pid (`appAt`). One that names its app
 * is left as configured; empty space (null) stays null.
 */
function ownedElement(element, app) {
  if (element === null || typeof element !== 'object' || app === null || element.bundleId !== undefined) return element
  return { ...element, bundleId: app.bundleId, pid: element.pid ?? app.pid }
}

/** An `input` the request alone refuses, answered here (true); these never wait for a settle. */
function refusedInput(id, fields) {
  const refused = (code, message, extra) => {
    refuse(id, code, message, extra)
    return true
  }
  if (!Array.isArray(fields.events) || fields.events.length === 0) return refused('invalid_argument', 'events must be a non-empty list', { field: 'events' })
  if (fields.mode !== 'global' && fields.mode !== 'pid') return refused('invalid_argument', 'mode is global or pid', { field: 'mode' })
  // CU-64 (helper 0.2.30): a hold step is 1..10000 ms, and a request's holds total at most 10000, before anything posts.
  const holds = fields.events.filter((event) => event?.kind === 'hold')
  if (holds.some((event) => !(Number.isInteger(event.ms) && event.ms >= 1 && event.ms <= 10_000)) || holds.reduce((sum, event) => sum + event.ms, 0) > 10_000) {
    return refused('invalid_argument', 'a hold is 1 to 10000 ms, and a request holds at most 10000 ms in all', { field: 'events' })
  }
  const { settleMs } = fields
  if (settleMs !== undefined && !(Number.isInteger(settleMs) && settleMs >= 1 && settleMs <= SETTLE_LIMIT_MS)) {
    return refused('invalid_argument', `settleMs must be a whole number of milliseconds from 1 to ${SETTLE_LIMIT_MS}`, { field: 'settleMs' })
  }
  if (scope === null) return refused('no_scope', 'no scope is set; nothing is posted')
  if (fields.mode === 'global' && !armed) return refused('pause_not_armed', 'global input needs the local-input pause armed')
  if (fields.bundleId !== undefined && !inScope(fields.bundleId)) return refused('out_of_scope', `${String(fields.bundleId)} is not in scope`)
  return false
}

/**
 * Settle when the fake may (local input seen since its last posted step, unspent), then post; past the cap nothing is
 * posted and the answer is the design's `local_input` at step 0. Without such input `settleMs` is ignored.
 */
async function settleThenPost(id, fields) {
  if (fields.settleMs === undefined || !sawLocalInput) return postInput(id, fields)
  if (!(await settle(fields.settleMs))) return stopped(id, 0, 'local_input', 'the person kept using the Mac through the settle, so nothing was posted')
  return postInput(id, fields, { settled: true })
}

/**
 * Post an input's steps, each guarded as the Swift helper guards it: the target brought forward, every point and the
 * frontmost app in scope, secure input before a key step, the `localInputAfter` person. A step posted clears
 * `sawLocalInput` - unless the person's input came after it.
 */
function postInput(id, fields, { settled = false } = {}) {
  if (fields.settleMs !== undefined && !settled) log('settle ignored: no unspent local input since the last posted step')
  if (!inScope(frontmost)) {
    if (typeof fields.bundleId === 'string' && inScope(fields.bundleId) && config.activationWorks !== false) frontmost = fields.bundleId
    else return refuse(id, 'out_of_scope', 'the frontmost app is not in scope')
  }
  // Q-D3 (helper 0.2.10 measured that pid delivery drops the pointer's window and location; design 0.4.5): pointer
  // events in a pid input are refused invalid_argument with nothing posted, in the helper as in the driver (defense in
  // depth, cu-developer-one 2026-11-05), so neither a driver bug nor a stale fake can give a silent no-op.
  if (fields.mode === 'pid' && fields.events.some((event) => typeof event.x === 'number')) {
    return refuse(id, 'invalid_argument', 'pointer events cannot go by pid (no window or point reaches the app); use global', { field: 'events' })
  }
  for (const event of fields.events) {
    if (typeof event.x === 'number' && !inScope(appAt(event.x, event.y)?.bundleId)) {
      // As the helper with CU-38's field: the owner (when a window is there) and the point of the refused event.
      const owner = appAt(event.x, event.y)?.bundleId
      return refuse(id, 'out_of_scope', `the point (${event.x}, ${event.y}) is not over an approved app`, { ...(owner ? { bundleId: owner } : {}), point: { x: event.x, y: event.y } })
    }
  }
  if (quirks.secureInput) {
    // IsSecureEventInputEnabled() is checked before every key step; the helper stops there, posting nothing more.
    const at = fields.events.findIndex((event) => KEY_STEPS.includes(event.kind))
    if (at === 0 && quirks.secureInputRefusal) return refuse(id, 'secure_input', 'secure event input is on; no key was posted')
    if (at > 0) sawLocalInput = false
    if (at >= 0) return stopped(id, at, 'secure_input', 'secure event input is on (a password field); typing there is the person\'s')
  }
  // Quirk systemPromptInput (CU-76, helper 0.2.28): the helper refuses input at its first step, mid-batch at 0 or, under
  // systemPromptRefusal, as a refusal - its own defence in depth over a marked prompt.
  if (quirks.systemPromptInput) {
    if (quirks.systemPromptRefusal) return refuse(id, 'system_prompt', 'a system prompt (Allow Paste from com.apple.something) is in the way')
    return stopped(id, 0, 'system_prompt', 'a system prompt (Allow Paste from com.apple.something) is in the way')
  }
  // Quirk stopAfter {at, code}: the helper's own stop at step `at` (CU-45): a cancelled drag returns to its press point
  // before Escape and the up there, and the reply names that point.
  if (quirks.stopAfter !== undefined && quirks.stopAfter.at < fields.events.length) {
    const at = quirks.stopAfter.at
    const press = fields.events.find((event) => event.kind === 'down')
    return stopped(id, at, quirks.stopAfter.code ?? 'timeout', 'the input took longer than allowed',
      cancelledDrag(fields.events, at) && press ? { cancelledDrag: true, releasedAt: { x: press.x, y: press.y } } : {})
  }
  if (quirks.localInputAfter !== undefined && quirks.localInputAfter < fields.events.length) {
    reportLocalInput('key', { force: true })
    // Helper 0.2.30 (CU-64 G2): a person's input during a hold names the keys that were held when it came.
    const at = quirks.localInputAfter
    if (fields.events[at]?.kind === 'hold') {
      const held = new Set()
      for (const event of fields.events.slice(0, at)) {
        if (event.kind === 'keyDown') held.add(event.keyCode)
        if (event.kind === 'keyUp') held.delete(event.keyCode)
      }
      if (held.size > 0) return stopped(id, at, 'local_input', 'the person used the Mac during a hold, so the keys were released', { heldKeys: [...held] })
    }
    return stopped(id, quirks.localInputAfter, 'local_input', 'the person used the Mac, so the action stopped',
      // Helper 0.2.20 (CU-45): the person's takeover never moves their pointer, so the up comes where it is - the last
      // posted point - and the reply names it (an own stop would return to the press point first).
      cancelledDrag(fields.events, quirks.localInputAfter)
        ? { cancelledDrag: true, releasedAt: { x: fields.events[quirks.localInputAfter - 1].x, y: fields.events[quirks.localInputAfter - 1].y } } : {})
  }
  sawLocalInput = false
  // A hold is time the helper spends with keys or the button down; the reply comes after it, as the real helper's does.
  const holding = fields.events.reduce((sum, event) => sum + (event.kind === 'hold' ? event.ms : 0), 0)
  if (holding > 0) return setTimeout(() => send({ id, ok: true, done: true, frontmostBundleId: frontmost }), holding)
  return send({ id, ok: true, done: true, frontmostBundleId: frontmost })
}

/** The tap a preflight already allows (helper 0.2.2): active with Accessibility, else listen-only, else none. */
const tapAllowed = () => (grants.accessibility === true ? 'active' : grants.listenEvents === true ? 'listen-only' : null)

let staleReported = false

function handle(message) {
  const { id, type, ...fields } = message
  // Synchronous, so the log line is in the stderr pipe before the reply is written or the fake exits.
  log(`REQ ${JSON.stringify(message)}`)
  // The driver's first request is its acceptance of the hello (helper-and-protocol.md): the run has begun.
  clearTimeout(connectWindow)
  // Quirk releasedStale {keys, buttons} (helper 0.2.30, CU-64 G1): a dead helper's held keys, released at start and
  // reported once the driver's first request (its acceptance) has arrived, before that request is answered.
  if (quirks.releasedStale !== undefined && !staleReported) {
    staleReported = true
    send({ event: 'releasedStale', ...quirks.releasedStale })
  }
  if (quirks.silentOn === type) return
  if (quirks.exitOn === type) process.exit(3)
  if (quirks.garbageOn === type) return output.write('this is not json\n')
  if (quirks.replyUnknownIdOn === type) return send({ id: 9999, ok: true })
  if (quirks.failOn === type) return refuse(id, 'failed', 'the fake failed on purpose')
  if (!Object.hasOwn(REQUESTS, type)) return refuse(id, 'unknown_request', `unknown request '${String(type)}'`)
  const unknown = Object.keys(fields).find((name) => !REQUESTS[type].includes(name))
  if (unknown !== undefined) return refuse(id, 'unknown_field', `the ${type} request has no field '${unknown}'`, { field: unknown })
  // A grant set to null is one this helper does not know (see `hello`), so it gates nothing.
  const grant = (GATE[type] ?? []).find((name) => grants[name] !== true && grants[name] !== null)
  if (grant !== undefined) return refuse(id, 'not_granted', `the ${grant} grant is missing`, { grant })
  switch (type) {
    case 'confirmPhysical': {
      if (scope !== null) return refuse(id, 'unsupported', 'confirmPhysical runs only on a helper with no scope set')
      const answer = config.confirm ?? { outcome: 'timeout' }
      if (typeof answer.refuse === 'string') return refuse(id, answer.refuse, 'the fake refuses the prompt')
      return send({ id, ok: true, confirmed: answer.outcome === 'confirmed', outcome: answer.outcome, source: answer.source ?? null, confirmationId: answer.confirmationId ?? 'fake-confirm-1' })
    }
    case 'scope': {
      const ids = fields.bundleIds
      if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_SCOPE_APPS) {
        return refuse(id, 'invalid_argument', `scope needs bundleIds, a list of 1 to ${MAX_SCOPE_APPS} bundle ids`, { field: 'bundleIds' })
      }
      if (!ids.every((bundleId) => typeof bundleId === 'string' && BUNDLE_ID.test(bundleId))) {
        return refuse(id, 'invalid_argument', 'scope bundleIds holds something that is not a bundle id', { field: 'bundleIds' })
      }
      const refused = ids.find((bundleId) => exclusionOf(bundleId) !== undefined)
      if (refused !== undefined) return refuse(id, 'excluded', `${refused} is excluded and never in scope`, { bundleId: refused })
      scope = [...new Set(ids)]
      return send({ id, ok: true, bundleIds: scope, running: apps.filter((app) => inScope(app.bundleId)).map(({ bundleId, pid }) => ({ bundleId, pid })), display: config.scopeDisplay ?? null })
    }
    case 'pauseOnLocalInput': {
      if (typeof fields.on !== 'boolean') return refuse(id, 'invalid_argument', 'on must be boolean', { field: 'on' })
      armed = fields.on && config.pauseArms !== false
      tap = armed ? tapAllowed() : null
      // Arming starts the guard afresh (Dispatcher.swift `setPause`): input seen before it earns no settle.
      if (armed) sawLocalInput = false
      return send({ id, ok: true, armed, via: armed ? ['idleCounter', ...(tap !== null ? ['eventTap'] : [])] : [] })
    }
    case 'capture': {
      const simulated = fields.simulateScale
      if (simulated !== undefined && !(typeof simulated === 'number' && simulated > 1 && simulated <= 4)) {
        return refuse(id, 'invalid_argument', 'simulateScale must be a number above 1 and at most 4', { field: 'simulateScale' })
      }
      if (scope === null) return refuse(id, 'no_scope', 'no scope is set; nothing is captured')
      captures += 1
      // CU-100: helper 0.2.31's refusal of an empty window filter (live, 16:14Z) - quirk captureNoImage: from capture k on.
      // Quirk captureFailMessage: some other capture failure's words, from the same capture on.
      if (quirks.captureNoImage !== undefined && captures >= quirks.captureNoImage) return refuse(id, 'failed', quirks.captureFailMessage ?? 'the capture returned no image')
      const display = displays.find((d) => d.id === fields.display) ?? displays[0]
      const changed = quirks.displayChangeAfter !== undefined && captures > quirks.displayChangeAfter
      const sizePt = changed ? { width: display.sizePt.width + 100, height: display.sizePt.height } : display.sizePt
      const area = fields.region ?? { x: display.originPt.x, y: display.originPt.y, ...sizePt }
      // The seam renders as if the display had the simulated backing scale; the points stay the display's own.
      const scale = simulated !== undefined && !quirks.ignoreSimulateScale ? simulated : display.scale
      const nativeW = Math.floor(area.width * scale)
      const nativeH = Math.floor(area.height * scale)
      const widthPx = Math.min(nativeW, fields.maxSize?.width ?? nativeW)
      const heightPx = Math.min(nativeH, fields.maxSize?.height ?? nativeH)
      // CU-100: helper 0.2.32's reply when no approved window is on screen - a blank frame, windows [], noAppWindow.
      // Quirk noAppWindow: the first n captures (a large n for all: the config arrives as JSON, so never Infinity);
      // quirk noAppWindowFrom: capture k on (mid-run).
      const blank = (quirks.noAppWindow !== undefined && captures <= quirks.noAppWindow) || (quirks.noAppWindowFrom !== undefined && captures >= quirks.noAppWindowFrom)
      if (blank) {
        return send({
          id, ok: true, ...captureImage(makePng(widthPx, heightPx)), widthPx, heightPx, scale, display: display.id,
          originPt: { x: area.x, y: area.y }, sizePt: { width: area.width, height: area.height }, frontmostBundleId: frontmost, windows: [], noAppWindow: true,
        })
      }
      return send({
        id, ok: true, ...captureImage(makePng(widthPx, heightPx)), widthPx, heightPx, scale, display: display.id,
        originPt: { x: area.x, y: area.y }, sizePt: { width: area.width, height: area.height }, frontmostBundleId: frontmost,
        // CU-76: config.systemPrompt (a system prompt shown over a scope app) from capture systemPromptFrom on (default 1).
        ...(config.systemPrompt !== undefined ? { systemPrompt: config.systemPrompt === true && captures >= (config.systemPromptFrom ?? 1) } : {}),
        windows: [
          // An app entry with hostedBy is a window the helper attributed to its client app (file-panels.md, Q-D13).
          ...apps.filter((app) => inScope(app.bundleId)).map((app) => ({ bundleId: app.bundleId, pid: app.pid, title: app.title ?? 'Fixture', frame: app.rect, ...(app.hostedBy ? { hostedBy: app.hostedBy } : {}) })),
          // Quirk leakWindowOf {bundleId, fromCapture}: from that capture on, the reply also names an out-of-scope app's
          // window, as helper 0.2.10's later captures did live (step 5); bundleId null models a window with no owner.
          ...(quirks.leakWindowOf !== undefined && captures > (quirks.leakWindowOf.fromCapture ?? 0)
            ? [{ bundleId: quirks.leakWindowOf.bundleId ?? null, pid: 4242, title: 'Leaked', frame: { x: 0, y: 0, width: 10, height: 10 } }] : []),
        ],
      })
    }
    case 'simulateLocalInput': {
      if (!LOCAL_INPUT_VIA.includes(fields.via)) return refuse(id, 'invalid_argument', `via is one of ${LOCAL_INPUT_VIA.join(', ')}`, { field: 'via' })
      if (!LOCAL_INPUT_KINDS.includes(fields.kind)) return refuse(id, 'invalid_argument', `kind is one of ${LOCAL_INPUT_KINDS.join(', ')}`, { field: 'kind' })
      // Without the pause armed no guard is watching, so there is nothing to report through.
      if (!armed) return refuse(id, 'pause_not_armed', 'the local-input pause is not armed')
      if (fields.via === 'tap' && tap === null) return refuse(id, 'not_granted', 'the Accessibility grant is missing, so no event tap is installed', { grant: 'accessibility' })
      if (fields.via === 'untagged') {
        // A real untagged event is synthetic input: only with the grant and an approved app in front (D-024).
        const missing = ['accessibility', 'postEvents'].find((name) => grants[name] !== true && grants[name] !== null)
        if (missing !== undefined) return refuse(id, 'not_granted', `the ${missing} grant is missing, so no event can be posted`, { grant: missing })
        if (scope === null) return refuse(id, 'no_scope', 'no scope is set')
        if (!inScope(frontmost)) return refuse(id, 'out_of_scope', 'the frontmost app is not an approved app of this run', { bundleId: frontmost })
      }
      // An untagged event is seen by the tap when one is installed, else by the idle counter before the next step.
      const detectedBy = fields.via === 'untagged' ? (tap !== null ? 'tap' : 'idle') : fields.via
      // The guards stay armed through a settle (helper 0.2.8): the event goes out and the wait restarts; it is the
      // driver that takes it as the person the settle waits out, not as a pause.
      reportLocalInput(fields.kind, { force: true })
      if (settling) log('local input during the settle: localInput sent, the wait restarts')
      return send({ id, ok: true, detectedBy })
    }
    case 'input': {
      if (refusedInput(id, fields)) return undefined
      inputsTaken += 1
      const honoured = fields.settleMs !== undefined && sawLocalInput
      if (inputTurn === null && !honoured) return postInput(id, fields)
      // A settle waits, or one starts now: this input takes its turn behind it, so nothing posts during a settle.
      const turn = (inputTurn ?? Promise.resolve()).then(() => settleThenPost(id, fields))
      inputTurn = turn
      turn.finally(() => { if (inputTurn === turn) inputTurn = null })
      return undefined
    }
    case 'hitTest': {
      if (typeof fields.xPt !== 'number' || typeof fields.yPt !== 'number') return refuse(id, 'invalid_argument', 'xPt and yPt must be numbers')
      if (scope === null) return refuse(id, 'no_scope', 'no scope is set')
      const hit = (config.elements ?? []).find((entry) => inside(entry.rect, fields.xPt, fields.yPt))
      const app = appAt(fields.xPt, fields.yPt)
      // Quirk hitTestBlind: the window came over the point after the hit test (the helper's per-event check still sees it).
      if (quirks.hitTestBlind) return send({ id, ok: true, element: null })
      // Quirk hitTestRefusesFor: the helper refuses the hit test itself, naming the app (D-045's fail-closed rule: the
      // Accessibility element at the point belongs to another process than the window's owner).
      if (quirks.hitTestRefusesFor !== undefined) return refuse(id, 'out_of_scope', 'the element at the point belongs to another app than its window', { bundleId: quirks.hitTestRefusesFor })
      if (hit !== undefined) return send({ id, ok: true, element: elementShape(ownedElement(hit.element, app)), ...counted() })
      return send({ id, ok: true, element: app !== null && !inScope(app.bundleId) ? elementShape({ bundleId: app.bundleId, pid: app.pid }) : null, ...counted() })
    }
    case 'panelSelection':
      // Quirk noPanelSelection: a helper from before Q-D13. config.panelSelection: the attributed panel's selection.
      if (quirks.noPanelSelection) return refuse(id, 'unknown_request', `unknown request '${String(type)}'`)
      if (scope === null) return refuse(id, 'no_scope', 'no scope is set')
      // CU-48: shownFolderName and nameFieldFocused only when the config gives them, so a world without them is an older helper.
      {
        const selection = phased('panelSelection')
        return send({
          id, ok: true, path: selection?.path ?? null, directory: selection?.directory ?? null, name: selection?.name ?? null,
          ...(selection && 'shownFolderName' in selection ? { shownFolderName: selection.shownFolderName } : {}),
          ...(selection && 'nameFieldFocused' in selection ? { nameFieldFocused: selection.nameFieldFocused } : {}),
        })
      }
    case 'menuKey': {
      // CU-236: config.menuKeys [{ keyCode, flags, reply }] - the reply sent as given for that exact keyDown - else
      // config.menuKeyDefault (default { none: true }); the request is logged like every other.
      if (quirks.noMenuKey) return refuse(id, 'unknown_request', `unknown request '${String(type)}'`)
      if (scope === null) return refuse(id, 'no_scope', 'no scope is set')
      const bound = (config.menuKeys ?? []).find((entry) => entry.keyCode === fields.keyCode && entry.flags === fields.flags)
      return send({ id, ok: true, ...(bound ? bound.reply : (config.menuKeyDefault ?? { none: true, bundleId: config.frontmost ?? null })) })
    }
    case 'selection':
      // CU-187: config.selection {role, caption, bundleId, pid} or null - the element holding the selection.
      if (quirks.noSelection) return refuse(id, 'unknown_request', `unknown request '${String(type)}'`)
      if (scope === null) return refuse(id, 'no_scope', 'no scope is set')
      return send({ id, ok: true, element: config.selection ?? null })
    case 'focused':
      if (scope === null) return refuse(id, 'no_scope', 'no scope is set')
      // config.focusedReads (CU-135's race): successive answers, the last one repeating - a focus the app moves late.
      if (Array.isArray(config.focusedReads) && config.focusedReads.length > 0) return send({ id, ok: true, element: elementShape(config.focusedReads.length > 1 ? config.focusedReads.shift() : config.focusedReads[0]) })
      // CU-142: config.defaultButton, the button Return presses there; absent from the reply when the world has none (an older helper).
      return send({ id, ok: true, element: elementShape(phased('focused') ?? null), ...('defaultButton' in config ? { defaultButton: elementShape(config.defaultButton) } : {}), ...(quirks.omitDefaultButtonRead ? {} : { defaultButtonRead: 'defaultButtonRead' in config ? config.defaultButtonRead : true }), ...('sheet' in config ? { sheet: config.sheet } : {}), ...('focusedApp' in config ? { app: config.focusedApp } : {}), ...counted() })
    case 'screenText': {
      if (!Number.isInteger(fields.maxChars) || fields.maxChars < 1) return refuse(id, 'invalid_argument', 'maxChars must be a positive integer', { field: 'maxChars' })
      if (scope === null) return refuse(id, 'no_scope', 'no scope is set')
      const text = String(config.screenText ?? '')
      return send({ id, ok: true, text: text.slice(0, fields.maxChars), truncated: text.length > fields.maxChars, bundleId: frontmost })
    }
    case 'watch': {
      if (typeof fields.fps !== 'number' || fields.fps <= 0) return refuse(id, 'invalid_argument', 'fps must be positive', { field: 'fps' })
      // Quirk watchRegionRefused: helper 0.2.29 knows watch.region and refuses one off the frames' display.
      if (quirks.watchRegionRefused && fields.region !== undefined) return refuse(id, 'invalid_argument', 'the region is not inside the display', { field: 'region' })
      if (scope === null) return refuse(id, 'no_scope', 'no scope is set')
      clearInterval(watching)
      send({ id, ok: true })
      const width = fields.maxSize?.width ?? 8
      const height = fields.maxSize?.height ?? 6
      // Helper 0.2.15: a watch frame names the windows it shows, as a capture reply does. Quirk frameWithoutWindows
      // models an older helper; quirk leakWindowInFrames {bundleId} adds an out-of-scope (or, null, unowned) window.
      const frameWindows = () => [
        ...apps.filter((app) => inScope(app.bundleId)).map((app) => ({ bundleId: app.bundleId, pid: app.pid, title: app.title ?? 'Fixture', frame: app.rect, ...(app.hostedBy ? { hostedBy: app.hostedBy } : {}) })),
        ...(quirks.leakWindowInFrames !== undefined ? [{ bundleId: quirks.leakWindowInFrames.bundleId ?? null, pid: 4243, title: 'Leaked', frame: { x: 0, y: 0, width: 10, height: 10 } }] : []),
      ]
      // CU-100: helper 0.2.32's watch frames carry noAppWindow on every frame. Quirk frameNoAppWindowFor n: the first n
      // frames are blank (windows [], noAppWindow true), later ones show the windows with noAppWindow false.
      let frames = 0
      watching = setInterval(() => {
        frames += 1
        const blank = quirks.frameNoAppWindowFor !== undefined && frames <= quirks.frameNoAppWindowFor
        send({
          event: 'frame', png: makePng(width, height).toString('base64'), widthPx: width, heightPx: height, at: new Date().toISOString(),
          ...(blank ? { windows: [], noAppWindow: true } : {
            ...(quirks.frameWithoutWindows ? {} : { windows: frameWindows() }),
            ...(quirks.frameNoAppWindowFor !== undefined ? { noAppWindow: false } : {}),
          }),
        })
      }, 20)
      return undefined
    }
    case 'cursor': {
      // config.cursor {xPt, yPt, display}: where the pointer is, in global points (CGEvent location in the helper).
      const at = config.cursor ?? { xPt: 100, yPt: 100, display: displays.find((d) => d.main)?.id ?? null }
      return send({ id, ok: true, xPt: at.xPt, yPt: at.yPt, display: at.display ?? null })
    }
    case 'unwatch':
      clearInterval(watching)
      watching = null
      return send({ id, ok: true })
    case 'bye':
      clearInterval(watching)
      send({ id, ok: true })
      return setTimeout(() => process.exit(0), 10)
    default:
      return refuse(id, 'unknown_request', `unknown request '${String(type)}'`)
  }
}

function onData(chunk) {
  lineBuffer += chunk.toString('utf8')
  for (let at = lineBuffer.indexOf('\n'); at !== -1; at = lineBuffer.indexOf('\n')) {
    const line = lineBuffer.slice(0, at)
    lineBuffer = lineBuffer.slice(at + 1)
    if (line.trim() === '') continue
    let message
    try {
      message = JSON.parse(line)
    } catch {
      send({ ok: false, code: 'invalid_argument', message: 'a line is not JSON' })
      continue
    }
    handle(message)
  }
}

/** The opening line. A grant configured as null is left out, as a helper from before design 0.3 leaves out `postEvents`. */
function hello(token) {
  const reported = Object.fromEntries(Object.entries(grants).filter(([, value]) => value !== null))
  const message = {
    type: 'hello', token: quirks.badToken ? 'not-the-token' : token, protocol: quirks.protocol ?? 1, helperVersion: quirks.helperVersion ?? '0.2.49',
    grants: reported, displays, ...(quirks.helloExtra ?? {}),
  }
  send(message)
}

const socketPath = options.socket !== undefined && options.transport === 'socket' ? options.socket : undefined
/** Whether this run enforces the D-029 boundary: told so, on the socket, and able to hold a grant (Arguments.swift). */
const boundary = socketPath !== undefined && options.enforceBoundary === true && !options.dryRun && !options.simulateUngranted

// The real helper refuses a private lock once it holds any grant: a granted helper always takes the shared lock.
if (options.lockPath !== undefined && Object.values(grants).some((value) => value === true)) {
  log('args refused: --lock-path is only for runs without a grant; a granted helper always takes the shared lock')
  process.exit(64)
}

/**
 * D-029 (b): one helper serves one run. Only a private `--lock-path` is ever taken, by exclusive create; the fake
 * never touches the real helper's shared lock.
 */
if (boundary) {
  log(`boundary enforced lock=${options.lockPath !== undefined ? 'private' : 'none'}`)
  if (options.lockPath !== undefined) {
    let fd
    try {
      fd = openSync(options.lockPath, 'wx', 0o600)
    } catch {
      log('another helper is running; one helper serves one run at a time')
      process.exit(4)
    }
    closeSync(fd)
    const release = () => { try { unlinkSync(options.lockPath) } catch { /* already gone */ } }
    process.on('exit', release)
    for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => process.exit(0))
  }
}

/**
 * D-029 (b): the helper serves one run and never waits around without one. The window runs from launch until the
 * driver's first request; `handle` clears it.
 */
const connectWindowMs = config.connectWindowMs ?? 10_000
const connectWindow = setTimeout(() => {
  log(`no driver accepted within ${connectWindowMs} ms`)
  process.exit(4)
}, connectWindowMs)

/** A launch argument names something that exists: the real helper compares its real path with the peer's. */
const resolves = (path) => {
  try {
    realpathSync(path)
    return true
  } catch {
    return false
  }
}

/**
 * D-029 (a), before the token is read or a byte is sent. The real helper reads the peer's pid, uid, signature, argv
 * and environment from the socket and checks them against `--driver-node` and `--driver-entry`; Node cannot, so the
 * fake names its parent, refuses under the quirk, and with the boundary enforced refuses a launch that does not name
 * a resolvable driver node and entry (the real helper's first refusal, before it looks at the peer's script).
 */
function peerAllowed() {
  const pid = config.peerPid ?? process.ppid
  const named = options.driverNode !== undefined && options.driverEntry !== undefined && resolves(options.driverNode) && resolves(options.driverEntry)
  if (quirks.peerRefused || (boundary && !named)) {
    log(`peer refused pid=${pid}`)
    return false
  }
  log(`peer ok pid=${pid}`)
  return true
}

if (socketPath !== undefined) {
  const socket = net.connect(socketPath)
  output = socket
  socket.on('close', () => process.exit(0))
  socket.on('error', () => process.exit(2))
  socket.once('connect', () => {
    if (!peerAllowed()) {
      // Close without a byte; the exit code is set before the close event could exit 0.
      socket.destroy()
      process.exit(3)
    }
    let token
    try {
      token = readFileSync(options.tokenFile, 'utf8').trim()
    } catch {
      log('token unreadable')
      socket.destroy()
      process.exit(2)
    }
    log('token read')
    socket.on('data', onData)
    hello(token)
  })
} else {
  output = process.stdout
  if (!peerAllowed()) process.exit(3)
  process.stdin.on('data', onData)
  process.stdin.on('end', () => process.exit(0))
  let token = process.env.FAKE_HELPER_TOKEN ?? ''
  if (options.tokenFile !== undefined) {
    try {
      token = readFileSync(options.tokenFile, 'utf8').trim()
    } catch {
      log('token unreadable')
      process.exit(2)
    }
  }
  log('token read')
  hello(token)
}
