import { execFileSync, spawn } from 'node:child_process'
import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { pidAlive } from '../../_tools_/agent-core/resource-gate.mjs'
import { EnvironmentError, invalid } from './errors.mjs'

/**
 * The desktop-run lock: one desktop run at a time team-wide on this shared Mac (D-024; R90/R91 in D-028).
 *
 * The display, keyboard and pointer are one per Mac, so two desktop runs - by two seats, or twice by one seat - would
 * click into each other's apps. The lock is shaped like agent core's browser registry (`resource-gate.mjs`, D-014) so
 * the team reads one protocol, with a cap of one instead of two:
 *
 * - take the mutex by `mkdir <dir>/.lock` (atomic on one filesystem; retried for at most 10 s, then refused; a mutex
 *   older than 60 s is stale and removed, because only a crashed process holds it that long);
 * - read the one entry file `<dir>/run.json`; an entry whose pid is dead, or that does not parse, is removed;
 * - a live entry refuses the run `resource_refused` with `details.reason` `desktop_run_active` and
 *   `details.holder { seat, runId, startedAt }`; the pid stays in the file only, never in the message or details,
 *   because the message reaches the model and the trajectory;
 * - else write `{ seat, runId, pid, startedAt }` (exclusive create), release the mutex, and return the slot.
 *
 * The entry is removed by `release()` (idempotent) and by a process `exit` hook; a process killed by a signal leaves
 * it behind, and the next acquire reclaims it once that pid is dead. Every dependency is injectable for tests, which
 * use a directory under `os.tmpdir()` so they never touch the team's real lock.
 *
 * **The hold (CU-75).** A check or step 4 is often several runs in a row, and each run takes and frees the lock on its
 * own, so between two of them another seat's run could take the Mac (twice in one evening: a gate inside a probe set,
 * a guard test inside a CU-74 check). A seat that announces a hold also writes it: `<dir>/hold.json`
 * `{ seat, until, reason }`, at most `MAX_HOLD_MINUTES`, through `holdDesktop` or this file's CLI
 * (`node run-lock.mjs hold --seat S --minutes N --reason R`, `release --seat S`, `status`). While it is live,
 * `acquireDesktopRun` refuses every other seat `resource_refused`, `details.reason` `desktop_held`, `details.holder
 * { seat, until, reason }`, and lets the holder's own runs take the lock as usual. An expired or unreadable hold is
 * ignored. It replaces step 4's ad-hoc yield flag: the nightly's lock wait sees `desktop_held` and waits.
 *
 * A seat's holds form a chain (`since`, its start): extending, or holding again within `HOLD_CHAIN_GAP_MINUTES` of the
 * last one ending (a release leaves the ended hold behind, `released: true`, to remember it), continues the chain, and
 * no chain reaches past `since` + `MAX_HOLD_CHAIN_MINUTES` - refused `desktop_hold_cap` - so a forgotten loop cannot
 * keep the Mac; a gap of that length, when others may take it, starts a new chain. Every hold, extension and release
 * is one line of `<dir>/hold.log`, the record of who held the shared Mac and why. Each hold also records `heldAt`, its
 * own start (CU-120): a re-hold within the gap keeps the chain's `since` and starts a fresh `heldAt`, an extension
 * keeps both, so a fresh hold never reads as an old one; a hold written by an older checkout has none.
 *
 * **The sentinel (CU-106, D-053).** Code older than 010dd7b52 never reads hold.json, so a hold bound only the seats
 * whose checkouts had it (08:04 UTC, 6 Nov). Older code does honour `run.json` with a live pid. So a hold taken through
 * this file's CLI starts a keeper (`run-lock.mjs keep`, detached, its pid in hold.json as `keeperPid`) that keeps a
 * sentinel entry `{ seat, runId: 'hold', pid: keeper, sentinel: true }` in run.json while the hold is live: older
 * code then refuses every run as `desktop_run_active`, the holder's own included (documented, D-053). The keeper looks
 * every KEEPER_POLL_MS under the mutex: it (re)writes the sentinel when run.json is missing, unreadable or names a dead
 * pid (a holder's run killed by a signal), and removes it and exits when the hold ends, is released, names another
 * keeper, or its directory is gone. New code swaps the holder's sentinel for the run's entry and back by one rename each,
 * so run.json never lacks a live entry while the hold lasts; a sentinel whose hold is no longer live is treated as
 * free, and `waitForFree` counts a sentinel as free. hold.log records the sentinel's install, swaps and removal.
 */

export const RUN_LOCK_DIR = '/tmp/cu-desktop-run'
export const ENTRY_NAME = 'run.json'
export const HOLD_NAME = 'hold.json'
/** CU-204: the holder seat's last posted input, `{ seat, at }`, written by its run's driver after each input request. */
export const LAST_INPUT_NAME = 'last-input.json'
/** CU-204: how much younger than the seat's own last activity the idle time may read before it counts as someone else's. */
export const OWN_ACTIVITY_SLACK_SECONDS = 2
/** The longest hold: a check or a step-4 window, not a standing reservation of the shared Mac. */
export const MAX_HOLD_MINUTES = 30
/** The longest chain of one seat's holds (extensions, or holds again soon after one ends): an hour. */
export const MAX_HOLD_CHAIN_MINUTES = 60
/** A gap at least this long between one seat's holds ends its chain - time when another seat could take the Mac. */
export const HOLD_CHAIN_GAP_MINUTES = 10
export const HOLD_LOG_NAME = 'hold.log'
/** Past this size the hold log keeps its newer half (thousands of lines either way), so it never grows without bound. */
export const HOLD_LOG_MAX_BYTES = 256 * 1024
export const LOCK_TIMEOUT_MS = 10_000
export const STALE_LOCK_MS = 60_000
/** How often a hold's keeper looks at run.json (CU-106): a killed holder's run leaves older code a gap of about this. */
export const KEEPER_POLL_MS = 250
/** The run id of a hold's sentinel entry in run.json (CU-106). */
export const SENTINEL_RUN_ID = 'hold'
/** The seat keys of the [cu] team, as in resource-gate.mjs and chrome-browser/launch.mjs. */
export const SEAT_PATTERN = /^cu-[a-z0-9]+(-[a-z0-9]+){0,3}$/
/** Agent core's run ids (`20261102T090122Z-ab12cd`) and test ids; no path separators, no spaces. */
export const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
/** CU-191: seconds without any local input before a fresh hold may take the Mac - the owner may be at it otherwise. */
export const OWNER_IDLE_SECONDS = 300

const sleepMs = (ms) => new Promise((done) => setTimeout(done, ms))

/** A holder field as safe text for a message: a short string or null, whatever the file held. */
function safeText(value, max = 128) {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, max).replace(/[^\x20-\x7e]/g, '?') : null
}

/**
 * The lock directory as a real directory owned by this user. `/tmp` is shared with every local account, so a symlink
 * or someone else's directory there could redirect or hold our lock; it is refused rather than followed.
 */
function prepareDir(dir) {
  mkdirSync(dir, { recursive: true })
  const stat = lstatSync(dir)
  const ours = typeof process.getuid !== 'function' || stat.uid === process.getuid()
  if (!stat.isDirectory() || stat.isSymbolicLink() || !ours) {
    throw new EnvironmentError('resource_refused', 'the desktop-run lock directory is not a plain directory owned by this user', { reason: 'run_lock_unsafe' })
  }
}

/** The file inside the `.lock` mutex that names its holder's pid (CU-117). */
const MUTEX_OWNER = 'owner'

/** Release the `.lock` mutex: its owner file, then the directory (old code's mutex has no owner file). */
function dropMutex(lock) {
  try { unlinkSync(join(lock, MUTEX_OWNER)) } catch { /* none */ }
  try { rmdirSync(lock) } catch { /* nothing to release, or someone else removed it */ }
}

/** How old a `.lock.break` (a breaker killed mid-break) must be before another breaker removes it. */
const BREAK_STALE_MS = 5_000

/**
 * Break a stale mutex under a second one, `<lock>.break`, re-checking under it that it is still the same stale mutex
 * (CU-117, cu-verifier): without that, a waiter that read 'holder dead' could drop the fresh mutex another waiter had
 * just taken after breaking the old one - two holders. Only breakers remove a mutex they do not hold, and they take
 * turns here, so the mutex a breaker re-checks cannot change under it except by a new taker's first steps (no owner
 * yet, so not the same stale one). A busy break mutex is left alone this round; one older than BREAK_STALE_MS was left
 * by a breaker that died, and is removed.
 */
function breakMutex(lock, stillStale, now) {
  const breaker = `${lock}.break`
  try {
    mkdirSync(breaker)
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    try { if (now() - statSync(breaker).mtimeMs > BREAK_STALE_MS) rmdirSync(breaker) } catch { /* gone meanwhile */ }
    return false
  }
  try {
    if (!stillStale()) return false
    dropMutex(lock)
    return true
  } finally {
    try { rmdirSync(breaker) } catch { /* nothing to release */ }
  }
}

/** The pid the mutex names as its holder, or null (no file yet, an old checkout's mutex, unreadable). */
function mutexOwner(lock) {
  try {
    const pid = Number.parseInt(readFileSync(join(lock, MUTEX_OWNER), 'utf8'), 10)
    return Number.isInteger(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}

/**
 * Take the `.lock` mutex, removing a stale one; refuses `run_lock_busy` after `lockTimeoutMs`. The taker writes its pid
 * inside (CU-117): a holder killed by a signal - a hold's keeper takes the mutex every KEEPER_POLL_MS - left the
 * directory behind, and every lock call waited out its 10 s timeout for up to STALE_LOCK_MS (a gate failure at 22:05Z).
 * A mutex whose named holder is dead is stale at once; one without a name (just taken, or an older checkout's) keeps
 * the age rule.
 */
async function takeMutex(lock, { now, sleep, lockTimeoutMs, staleLockMs, isAlive = pidAlive, beforeBreak = null }) {
  const started = now()
  for (;;) {
    try {
      mkdirSync(lock)
      try { writeFileSync(join(lock, MUTEX_OWNER), `${process.pid}\n`, { mode: 0o600 }) } catch { /* the age rule still covers it */ }
      return
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      let age = 0
      try {
        age = now() - statSync(lock).mtimeMs
      } catch {
        continue // released meanwhile
      }
      const owner = mutexOwner(lock)
      let dropped = false
      if (owner !== null && owner !== process.pid && !isAlive(owner)) {
        if (beforeBreak !== null) await beforeBreak() // a test's pause between the decision and the break
        dropped = breakMutex(lock, () => mutexOwner(lock) === owner, now)
      } else if (age > staleLockMs) {
        dropped = breakMutex(lock, () => { try { return now() - statSync(lock).mtimeMs > staleLockMs } catch { return false } }, now)
      }
      // CU-131: only a drop retries at once. A break that did not drop - another breaker holds the break mutex, or the
      // re-check found a new owner - waits like any busy mutex: a bare retry spun a core and skipped lockTimeoutMs.
      if (dropped) continue
      if (now() - started >= lockTimeoutMs) {
        throw new EnvironmentError('resource_refused', 'the desktop-run lock stayed busy; try again shortly', { reason: 'run_lock_busy' })
      }
      await sleep(100)
    }
  }
}

/** The entry at `path`: the parsed object, `null` when absent, `undefined` when it does not parse. */
function readEntry(path) {
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
  try {
    const entry = JSON.parse(text)
    return entry !== null && typeof entry === 'object' && !Array.isArray(entry) ? entry : undefined
  } catch {
    return undefined
  }
}

/** The refusal naming who holds the Mac: seat, run id and start time from the entry, never its pid. */
function activeRunError(current) {
  const holder = { seat: safeText(current?.seat), runId: safeText(current?.runId), startedAt: safeText(current?.startedAt, 40) }
  return new EnvironmentError('resource_refused',
    `another desktop run holds this Mac (seat ${holder.seat ?? 'unknown'}, run ${holder.runId ?? 'unknown'}, since ${holder.startedAt ?? 'unknown'}); one desktop run at a time team-wide (D-024)`,
    { reason: 'desktop_run_active', holder })
}

/** The hold in `parsed` if it is live at `at` - a seat key and an `until` still ahead - else null (expired, unreadable). */
function liveHold(parsed, at) {
  if (parsed === null || parsed === undefined || typeof parsed.seat !== 'string' || !SEAT_PATTERN.test(parsed.seat)) return null
  const until = Date.parse(parsed.until)
  if (!Number.isFinite(until) || until <= at) return null
  // CU-120: since is the chain's start (CU-75's hour cap), heldAt this hold's own; an older checkout's hold has no heldAt.
  return { seat: parsed.seat, until: new Date(until).toISOString(), reason: safeText(parsed.reason, 200), since: isoOrNull(parsed.since), heldAt: isoOrNull(parsed.heldAt) }
}

/** A time from a hold file as ISO text, or null when it is missing or not a time. */
function isoOrNull(value) {
  const t = typeof value === 'string' ? Date.parse(value) : Number.NaN
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

/** The refusal naming the hold: seat, until and reason, as safe text; the message reaches the model and trajectory. */
function heldError(hold) {
  return new EnvironmentError('resource_refused',
    `seat ${hold.seat} holds this Mac until ${hold.until}${hold.reason ? ` (${hold.reason})` : ''}; only its runs may start until then (CU-75)`,
    { reason: 'desktop_held', holder: { seat: hold.seat, until: hold.until, reason: hold.reason } })
}

/** The start of `seat`'s chain if a hold at `at` continues it (its own hold, live or ended less than the gap ago), else `at`. */
function chainSince(parsed, seat, at) {
  if (parsed === null || parsed === undefined || parsed.seat !== seat) return at
  const since = Date.parse(parsed.since)
  const until = Date.parse(parsed.until)
  if (!Number.isFinite(until) || at - until >= HOLD_CHAIN_GAP_MINUTES * 60_000) return at
  return Number.isFinite(since) && since <= at ? since : at
}

/** One line of the hold log; a log that cannot be written never blocks the hold itself. */
function logHold(root, line, maxBytes = HOLD_LOG_MAX_BYTES) {
  const path = join(root, HOLD_LOG_NAME)
  try { appendFileSync(path, `${JSON.stringify(line)}\n`, { mode: 0o644 }) } catch { return /* the hold stands */ }
  // CU-80: every desktop run holds first, so the log gains lines with every run; past the cap it keeps its newer half,
  // in bytes, cut at a line boundary. The kept half goes to a temp file renamed over the log, so a crash mid-trim
  // leaves the old log or the new one, never a torn one. Callers hold the lock's mutex, so no other writer interleaves;
  // a failed trim changes nothing.
  const temp = `${path}.trim-${process.pid}`
  try {
    if (statSync(path).size <= maxBytes) return
    const bytes = readFileSync(path)
    const from = bytes.indexOf(0x0a, bytes.length - Math.floor(maxBytes / 2))
    if (from === -1) return
    writeFileSync(temp, bytes.subarray(from + 1), { mode: 0o644 })
    renameSync(temp, path)
  } catch {
    try { unlinkSync(temp) } catch { /* nothing was written */ }
  }
}

/** Whether `entry` is a hold's sentinel (CU-106): the keeper's stand-in that keeps older checkouts out. */
const isSentinel = (entry) => entry !== null && entry !== undefined && entry.sentinel === true && entry.runId === SENTINEL_RUN_ID

/** Write `entry` to `path` by rename (CU-106), so a reader never finds the file missing or torn between two entries. */
function replaceEntry(path, entry) {
  const temp = `${path}.${process.pid}.tmp`
  writeFileSync(temp, `${JSON.stringify(entry)}\n`, { mode: 0o644 })
  renameSync(temp, path)
}

/** The live hold's keeper as a sentinel entry for `seat`, or null: the hold must be `seat`'s and its keeper alive. */
function keeperSentinel(parsed, seat, at, isAlive) {
  const hold = liveHold(parsed, at)
  if (hold === null || hold.seat !== seat || !Number.isInteger(parsed?.keeperPid) || !isAlive(parsed.keeperPid)) return null
  return { seat, runId: SENTINEL_RUN_ID, pid: parsed.keeperPid, startedAt: new Date(at).toISOString(), sentinel: true }
}

/**
 * The commit of the code taking the lock (CU-106, D-053): every run's entry records it, so `status` and anyone reading
 * run.json see which checkout holds the Mac - an entry without it came from code older than this. Read once per
 * process; null when git cannot tell (no repository, git missing).
 */
let checkoutCommitCache
export function checkoutCommit({ cwd = resolve(fileURLToPath(new URL('../..', import.meta.url))), run = execFileSync } = {}) {
  if (checkoutCommitCache !== undefined && run === execFileSync) return checkoutCommitCache
  let commit = null
  try {
    const text = run('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    commit = /^[0-9a-f]{40}$/.test(text) ? text : null
  } catch { /* not a checkout: null */ }
  if (run === execFileSync) checkoutCommitCache = commit
  return commit
}

/**
 * CU-191 / D-066: refuse unless this Mac has been idle `minIdleSeconds` - local input that recent means the owner may be
 * at it, and an idle time that cannot be read is no proof he is not. The refusal is logged in hold.log. `subject`,
 * `advice`, `notDone` and `tag` word the message for a fresh hold or for a run. Returns the whole idle seconds it read, so
 * a fresh hold's log line can prove it was taken idle (cu-verifier).
 */
function refuseUnlessIdle(root, { at, seat, runId = null, idleSeconds, minIdleSeconds, subject, advice, notDone, tag }) {
  const idle = idleSeconds()
  const known = typeof idle === 'number' && Number.isFinite(idle) && idle >= 0
  if (known && idle >= minIdleSeconds) return Math.floor(idle)
  const reasonCode = known ? 'owner_active' : 'owner_idle_unknown'
  logHold(root, { at: new Date(at).toISOString(), action: 'refused', reason: reasonCode, seat, ...(runId !== null ? { runId } : {}), ...(known ? { idleSeconds: Math.floor(idle) } : {}) })
  throw new EnvironmentError('resource_refused', known
    ? `this Mac had local input ${Math.floor(idle)} s ago; ${subject} needs ${minIdleSeconds} s without any, since the owner may be at it - ${advice} (${tag})`
    : `this Mac's idle time could not be read, so ${subject} cannot tell whether the owner is at it - ${notDone} (${tag})`,
  { reason: reasonCode, ...(known ? { idleSeconds: Math.floor(idle) } : {}), minIdleSeconds })
}

/**
 * CU-204 (cu-researcher): a run inside its seat's own live hold skips the fresh-hold wait, but the idle time must still
 * be older than the seat's own last activity - the hold's idle-checked start (`heldAt`; an extension keeps it) or the
 * last input the seat's runs posted, whichever is later. Our input and the owner's reset the same counter, so a counter
 * younger than our last activity means someone else used the Mac after it: refused, logged, as a fresh hold would be.
 * An unreadable idle time, or no known start, refuses too; so does a wall clock now behind our own last stamp (a
 * backward step past it would otherwise make the gap negative and admit anything - cu-researcher). A smaller step only
 * shrinks the gap by its size, mostly inside the slack. It also admits when the idle time alone passes the fresh-hold
 * test (`minIdleSeconds`): that grants nothing a release and a fresh hold would not, and without it any input inside
 * the hold would refuse every later run in it for good, since idle then counts from that later input (CU-208,
 * cu-researcher). Returns the whole idle seconds it read.
 */
function refuseUnlessOwnActivity(root, { at, seat, runId, hold, idleSeconds, minIdleSeconds }) {
  const idle = idleSeconds()
  const known = typeof idle === 'number' && Number.isFinite(idle) && idle >= 0
  const last = readEntry(join(root, LAST_INPUT_NAME))
  const posted = last !== null && last !== undefined && last.seat === seat ? Date.parse(last.at) : NaN
  const started = Date.parse(hold.heldAt ?? hold.since)
  const own = Math.max(Number.isFinite(started) ? started : -Infinity, Number.isFinite(posted) ? posted : -Infinity)
  const sinceOwn = (at - own) / 1000
  const clockBehind = Number.isFinite(sinceOwn) && sinceOwn < 0
  if (known && ((Number.isFinite(sinceOwn) && !clockBehind && idle + OWN_ACTIVITY_SLACK_SECONDS >= sinceOwn) || idle >= minIdleSeconds)) return Math.floor(idle)
  const reasonCode = known && !clockBehind ? 'owner_active' : 'owner_idle_unknown'
  const sinceOwnSeconds = Number.isFinite(sinceOwn) ? Math.floor(sinceOwn) : null
  logHold(root, { at: new Date(at).toISOString(), action: 'refused', reason: reasonCode, seat, runId, rule: 'own_hold', ...(known ? { idleSeconds: Math.floor(idle) } : {}), sinceOwnSeconds })
  throw new EnvironmentError('resource_refused', clockBehind
    ? `this Mac's clock is behind this seat's own last input or hold start, so a run inside its hold cannot tell whether someone else is at it - not started (CU-204)`
    : known
      ? `this Mac had local input ${Math.floor(idle)} s ago, after this seat's own last input or hold start${sinceOwnSeconds !== null ? ` ${sinceOwnSeconds} s ago` : ''} - someone else may be at it; not started - it starts once the Mac has had no input for ${minIdleSeconds} s (CU-204, CU-208)`
      : `this Mac's idle time could not be read, so a run inside this seat's hold cannot tell whether someone else is at it - not started (CU-204)`,
  { reason: reasonCode, ...(known ? { idleSeconds: Math.floor(idle) } : {}), sinceOwnSeconds })
}

const sameEntry = (a, b) => a !== null && a !== undefined && a.seat === b.seat && a.runId === b.runId && a.pid === b.pid && a.startedAt === b.startedAt

/**
 * Acquire the desktop run for `seat` and `runId`. Resolves to `{ entry, entryPath, release() }`; rejects with an
 * EnvironmentError: `invalid_argument` for a bad seat, run id or dir, `resource_refused` with `details.reason`
 * `desktop_held` (another seat's live hold), `desktop_run_active` (another run holds the Mac), `owner_active` or
 * `owner_idle_unknown` (D-066, below), `run_lock_busy` or `run_lock_unsafe`.
 *
 * D-066: the owner-idle rule follows input. A run that can post synthetic input waits for an idle Mac exactly as a
 * fresh hold does (CU-191), unless it declares `noInput` (it posts nothing; the entry records it and the desktop
 * environment then refuses every input action) or its seat already holds the Mac (that hold was idle-checked). There
 * is no other exemption, the owner's own run included (D-068: a terminal or an environment flag is reachable by a pty
 * wrapper or env -i; only a physical confirmation, still to come, may pass it). Every run the check applies to logs
 * `run_admitted` with the rule that let it start - its idle seconds, no_input or own_hold. Only this Mac's own lock
 * reads the idle time (`ownerIdleReader`), so scratch locks stay hermetic.
 */
export async function acquireDesktopRun(options = {}) {
  const { confirmWith, task = '', ...admission } = options ?? {}
  if (confirmWith !== undefined && typeof confirmWith !== 'function') throw invalid('confirmWith is a function that sends one request over the helper link', { field: 'confirmWith' })
  try {
    return await admitDesktopRun(admission)
  } catch (error) {
    // CU-203 (physical-confirmation.md, Flow 1-4): only an owner_active refusal, and only with a channel to ask over.
    if (typeof confirmWith !== 'function' || error?.code !== 'resource_refused' || error?.details?.reason !== 'owner_active') throw error
    const confirmation = await confirmPhysically({ ...admission, confirmWith, task })
    return await admitDesktopRun(admission, confirmation)
  }
}

/** CU-203: how long the owner has to answer the prompt (the design's cap), and a seat's wait after a refusal (Flow 5). */
export const CONFIRM_WAIT_MS = 60_000
export const CONFIRM_BACKOFF_MS = 5 * 60_000
/** CU-203: the one prompt on screen - `{ seat, runId, startedAt, expiresAt }` - while a confirmation is asked. */
export const CONFIRMING_NAME = 'confirming.json'
const CONFIRM_GRACE_MS = 5_000
const OUTCOME_PATTERN = /^[a-z_]{1,32}$/

/** CU-203: the helper's event source, numbers and booleans only - never a position or a key. */
function sourceOf(value) {
  if (value === null || typeof value !== 'object') return null
  return { pid: Number.isInteger(value.pid) ? value.pid : null, state: Number.isInteger(value.state) ? value.state : null, tagged: value.tagged === true, hardware: value.hardware === true }
}

/** CU-203: when this seat's last prompt was refused (Cancel, timeout, any failure), from hold.log's tail, else null. */
function lastConfirmRefusal(root, seat) {
  let text
  try { text = readFileSync(join(root, HOLD_LOG_NAME), 'utf8') } catch { return null }
  const lines = text.slice(-262_144).trim().split('\n').reverse()
  for (const line of lines) {
    let parsed
    try { parsed = JSON.parse(line) } catch { continue }
    if (parsed?.action === 'confirm_refused' && parsed.seat === seat) { const at = Date.parse(parsed.at); return Number.isFinite(at) ? at : null }
  }
  return null
}

/**
 * CU-203 (physical-confirmation.md): ask the owner's hardware click for this one run, over the channel the environment
 * built from a helper it launched unscoped - the lock asks and reads the answer itself; no caller can hand it one.
 * Under the mutex: a seat refused in the last 5 minutes is refused confirm_backoff, and a prompt already on screen
 * refuses confirm_busy, both without asking; otherwise the marker goes up. The wait holds no mutex. Admits only on
 * confirmed === true, a hardware source and a non-empty id; anything else (Cancel, timeout, a helper refusal, no
 * answer) is logged confirm_refused, which starts the backoff. The helper's reply (cu-developer-three, agreed):
 * `{ ok, confirmed, outcome: confirmed|cancelled|timeout, source: { pid, state, tagged, hardware } | null, confirmationId }`.
 * Returns `{ id, source }`, id being the helper's confirmationId, which the helper logs too.
 */
async function confirmPhysically({ seat, runId, dir = RUN_LOCK_DIR, now = Date.now, sleep = sleepMs, lockTimeoutMs = LOCK_TIMEOUT_MS, staleLockMs = STALE_LOCK_MS, isAlive = pidAlive, confirmWith, task = '', confirmWaitMs = CONFIRM_WAIT_MS }) {
  if (!Number.isInteger(confirmWaitMs) || confirmWaitMs < 1 || confirmWaitMs > CONFIRM_WAIT_MS) throw invalid(`confirmWaitMs is 1 to ${CONFIRM_WAIT_MS} ms`, { field: 'confirmWaitMs' })
  const root = resolve(dir)
  const lock = join(root, '.lock')
  const markerPath = join(root, CONFIRMING_NAME)
  const iso = (t) => new Date(t).toISOString()
  const grace = Math.min(CONFIRM_GRACE_MS, confirmWaitMs)
  let marker
  await takeMutex(lock, { now, sleep, lockTimeoutMs, staleLockMs, isAlive })
  try {
    const at = now()
    const refusedAt = lastConfirmRefusal(root, seat)
    if (refusedAt !== null && at - refusedAt < CONFIRM_BACKOFF_MS) {
      const retryInSeconds = Math.ceil((CONFIRM_BACKOFF_MS - (at - refusedAt)) / 1000)
      logHold(root, { at: iso(at), action: 'refused', reason: 'confirm_backoff', seat, runId, retryInSeconds })
      throw new EnvironmentError('resource_refused', `this seat's last confirmation prompt was not confirmed; the next may show in ${retryInSeconds} s - not started (CU-203)`, { reason: 'confirm_backoff', retryInSeconds })
    }
    const current = readEntry(markerPath)
    if (current !== null && current !== undefined && Date.parse(current.expiresAt) > at) {
      logHold(root, { at: iso(at), action: 'refused', reason: 'confirm_busy', seat, runId })
      throw new EnvironmentError('resource_refused', 'a confirmation prompt is already on screen - not started (CU-203)', { reason: 'confirm_busy' })
    }
    marker = { seat, runId, startedAt: iso(at), expiresAt: iso(at + confirmWaitMs + grace) }
    replaceEntry(markerPath, marker)
    logHold(root, { at: iso(at), action: 'confirm_requested', seat, runId })
  } finally {
    dropMutex(lock)
  }
  let reply = null
  let failure = null
  let timer
  try {
    const answer = Promise.resolve().then(() => confirmWith({ seat, task: String(task).replace(/\s+/g, ' ').trim().slice(0, 80), timeoutMs: confirmWaitMs }))
    const late = new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('no answer'), { code: 'no_answer' })), confirmWaitMs + grace) })
    reply = await Promise.race([answer, late])
  } catch (error) {
    failure = typeof error?.code === 'string' && OUTCOME_PATTERN.test(error.code) ? error.code : 'error'
  } finally {
    clearTimeout(timer)
  }
  await takeMutex(lock, { now, sleep, lockTimeoutMs, staleLockMs, isAlive })
  try {
    const current = readEntry(markerPath)
    if (current !== null && current !== undefined && current.seat === marker.seat && current.runId === marker.runId && current.startedAt === marker.startedAt) {
      try { unlinkSync(markerPath) } catch { /* already gone */ }
    }
    const source = sourceOf(reply?.source)
    const id = typeof reply?.confirmationId === 'string' && reply.confirmationId.length > 0 && reply.confirmationId.length <= 128 ? reply.confirmationId : null
    const at = iso(now())
    if (reply?.confirmed === true && source?.hardware === true && id !== null) {
      logHold(root, { at, action: 'confirmed', seat, runId, confirmationId: id, source })
      return { id, source }
    }
    const outcome = failure ?? (reply?.confirmed === true ? (source?.hardware === true ? 'no_id' : 'not_hardware') : typeof reply?.outcome === 'string' && OUTCOME_PATTERN.test(reply.outcome) ? reply.outcome : 'not_confirmed')
    logHold(root, { at, action: 'confirm_refused', seat, runId, outcome, ...(source !== null ? { source } : {}) })
    throw new EnvironmentError('resource_refused', `the owner's hardware click did not confirm this run (${outcome}) - not started (CU-203)`, { reason: 'not_confirmed', outcome })
  } finally {
    dropMutex(lock)
  }
}

/** The admission itself; `confirmation` comes only from confirmPhysically, never from a caller's options. */
async function admitDesktopRun({
  seat,
  runId,
  dir = RUN_LOCK_DIR,
  pid = process.pid,
  isAlive = pidAlive,
  now = Date.now,
  sleep = sleepMs,
  lockTimeoutMs = LOCK_TIMEOUT_MS,
  staleLockMs = STALE_LOCK_MS,
  onExit = (fn) => process.once('exit', fn),
  offExit = (fn) => process.removeListener('exit', fn),
  commit = checkoutCommit(),
  noInput = false,
  idleSeconds,
  minIdleSeconds = OWNER_IDLE_SECONDS,
} = {}, confirmation = null) {
  if (typeof seat !== 'string' || !SEAT_PATTERN.test(seat)) throw invalid('the desktop run needs a [cu] seat key such as cu-developer-two')
  if (typeof noInput !== 'boolean') throw invalid('noInput is true or false', { field: 'noInput' })
  if (typeof runId !== 'string' || !RUN_ID_PATTERN.test(runId)) throw invalid('the desktop run needs a run id of letters, digits and . _ : -')
  if (typeof dir !== 'string' || !isAbsolute(dir)) throw invalid('the desktop-run lock needs an absolute dir')
  const root = resolve(dir)
  const readIdle = idleSeconds === undefined ? ownerIdleReader(root) : idleSeconds
  prepareDir(root)
  const lock = join(root, '.lock')
  const entryPath = join(root, ENTRY_NAME)
  await takeMutex(lock, { now, sleep, lockTimeoutMs, staleLockMs, isAlive })
  let entry
  try {
    const hold = liveHold(readEntry(join(root, HOLD_NAME)), now())
    if (hold !== null && hold.seat !== seat) throw heldError(hold)
    if (typeof readIdle === 'function') {
      const at = now()
      const exempt = noInput ? 'no_input' : confirmation !== null ? 'confirmed' : hold !== null ? 'own_hold' : null
      const idle = exempt === 'own_hold' ? refuseUnlessOwnActivity(root, { at, seat, runId, hold, idleSeconds: readIdle, minIdleSeconds })
        : exempt !== null ? null : refuseUnlessIdle(root, { at, seat, runId, idleSeconds: readIdle, minIdleSeconds,
          subject: 'a desktop run that can post input', advice: 'try again once it has been left alone that long', notDone: 'not started', tag: 'D-066' })
      logHold(root, { at: new Date(at).toISOString(), action: 'run_admitted', seat, runId, rule: exempt ?? 'idle', ...(idle !== null ? { idleSeconds: idle } : {}), ...(confirmation !== null ? { confirmationId: confirmation.id, source: confirmation.source } : {}) })
    }
    const current = readEntry(entryPath)
    // CU-106: the holder's own live sentinel is swapped for this run's entry in one rename; a sentinel whose hold is no
    // longer this seat's live hold is stale (its keeper is about to leave) and counts as free.
    const swap = isSentinel(current) && isAlive(current.pid) && hold !== null && hold.seat === seat && current.seat === seat
    if (!swap && current !== null && (current === undefined || !isAlive(current.pid) || isSentinel(current))) {
      try { unlinkSync(entryPath) } catch { /* already gone */ }
    } else if (!swap && current !== null) {
      throw activeRunError(current)
    }
    entry = Object.freeze({ seat, runId, pid, startedAt: new Date(now()).toISOString(), commit: typeof commit === 'string' ? commit : null, ...(noInput ? { noInput: true } : {}) })
    if (swap) {
      replaceEntry(entryPath, entry)
      logHold(root, { at: entry.startedAt, action: 'sentinel_out', seat, runId })
    } else {
      try {
        writeFileSync(entryPath, `${JSON.stringify(entry)}\n`, { flag: 'wx', mode: 0o644 })
      } catch (error) {
        // Only a writer that ignored the mutex can get here; its entry wins and this run is refused.
        if (error.code === 'EEXIST') throw activeRunError(readEntry(entryPath))
        throw error
      }
    }
  } finally {
    dropMutex(lock)
  }

  // Removes the file only while it is still this run's entry: a later run's entry is never deleted by a late release.
  // CU-106: while this seat's hold is live and its keeper alive, the sentinel goes back in the same rename instead, so
  // older checkouts never find the Mac free between the holder's runs. Synchronous: it also runs in the exit hook.
  const removeEntry = () => {
    try {
      if (!sameEntry(readEntry(entryPath), entry)) return
      const sentinel = keeperSentinel(readEntry(join(root, HOLD_NAME)), seat, now(), isAlive)
      if (sentinel !== null) {
        replaceEntry(entryPath, sentinel)
        logHold(root, { at: sentinel.startedAt, action: 'sentinel_back', seat, runId })
      } else {
        unlinkSync(entryPath)
      }
    } catch { /* already gone */ }
  }
  onExit(removeEntry)
  let released = false
  return {
    entry,
    entryPath,
    get released() { return released },
    release() {
      if (released) return
      released = true
      removeEntry()
      offExit(removeEntry)
    },
    // CU-204: the driver calls this after each input request (posted or refused part-way), so a later run inside this
    // seat's hold can tell our input from someone else's. Not at release: a run's end would hide input made during it.
    noteInput() {
      if (released) return
      replaceEntry(join(root, LAST_INPUT_NAME), { seat, at: new Date(now()).toISOString() })
    },
  }
}

/** Validate the seat and dir shared by the hold's three calls; returns the prepared root. */
function holdRoot(seat, dir) {
  if (typeof seat !== 'string' || !SEAT_PATTERN.test(seat)) throw invalid('a hold needs a [cu] seat key such as cu-developer-two', { field: 'seat' })
  if (typeof dir !== 'string' || !isAbsolute(dir)) throw invalid('the desktop-run lock needs an absolute dir')
  const root = resolve(dir)
  prepareDir(root)
  return root
}

/**
 * Hold the Mac for `seat` for `minutes` (1 to MAX_HOLD_MINUTES), under the lock's mutex: refuses `desktop_held` when
 * another seat's hold is live (a hold is never taken over); the same seat's hold is replaced, so a holder can extend
 * it. A run already active continues - the hold only decides who may start the next one. Resolves to the hold.
 */
export async function holdDesktop({ seat, minutes, reason = '', dir = RUN_LOCK_DIR, now = Date.now, sleep = sleepMs, lockTimeoutMs = LOCK_TIMEOUT_MS, staleLockMs = STALE_LOCK_MS, startKeeper = null, isAlive = pidAlive, idleSeconds = null, minIdleSeconds = OWNER_IDLE_SECONDS } = {}) {
  const root = holdRoot(seat, dir)
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0 || minutes > MAX_HOLD_MINUTES) {
    throw invalid(`a hold lasts more than 0 and at most ${MAX_HOLD_MINUTES} minutes`, { field: 'minutes' })
  }
  if (typeof reason !== 'string' || reason.length > 200) throw invalid('a hold\'s reason is text of at most 200 characters', { field: 'reason' })
  const lock = join(root, '.lock')
  await takeMutex(lock, { now, sleep, lockTimeoutMs, staleLockMs, isAlive })
  try {
    const path = join(root, HOLD_NAME)
    const parsed = readEntry(path)
    const at = now()
    const current = liveHold(parsed, at)
    if (current !== null && current.seat !== seat) throw heldError(current)
    // CU-191: a fresh hold waits for an idle Mac - local input in the last minIdleSeconds means the owner may be at it
    // (cu-coordinator), and an idle time that cannot be read is no proof he is not. Extending one's own live hold is
    // not checked: the helper's posted input resets the same counter, so mid-hold it no longer tells the owner apart.
    let idleAtHold = null
    if (current === null && typeof idleSeconds === 'function') {
      idleAtHold = refuseUnlessIdle(root, { at, seat, idleSeconds, minIdleSeconds, subject: 'a fresh hold', advice: 'try again later', notDone: 'not held', tag: 'CU-191' })
    }
    const since = chainSince(parsed, seat, at)
    const until = at + minutes * 60_000
    const capUntil = since + MAX_HOLD_CHAIN_MINUTES * 60_000
    if (until > capUntil) {
      throw new EnvironmentError('resource_refused',
        `seat ${seat} has held this Mac since ${new Date(since).toISOString()}; its holds may not reach past ${new Date(capUntil).toISOString()} (${MAX_HOLD_CHAIN_MINUTES} minutes) - release it and leave the Mac to others for ${HOLD_CHAIN_GAP_MINUTES} minutes (CU-75)`,
        { reason: 'desktop_hold_cap', since: new Date(since).toISOString(), capUntil: new Date(capUntil).toISOString() })
    }
    // CU-106: one keeper per hold - an extension keeps the live one; started inside the mutex, so the keeper's first
    // look (under the same mutex) already finds its pid in hold.json.
    const kept = current !== null && Number.isInteger(parsed?.keeperPid) && isAlive(parsed.keeperPid) ? parsed.keeperPid : null
    const keeperPid = kept ?? (typeof startKeeper === 'function' ? startKeeper({ seat, dir: root }) : null)
    // CU-120: heldAt is this hold's own start, beside since (the chain's): a re-hold within the gap keeps since and
    // starts a fresh heldAt; an extension of the live hold keeps its heldAt (an older checkout's hold: its since).
    const heldAt = current !== null ? (isoOrNull(parsed?.heldAt) ?? isoOrNull(parsed?.since) ?? new Date(at).toISOString()) : new Date(at).toISOString()
    const hold = Object.freeze({ seat, since: new Date(since).toISOString(), heldAt, until: new Date(until).toISOString(), reason: safeText(reason, 200), ...(Number.isInteger(keeperPid) ? { keeperPid } : {}) })
    writeFileSync(path, `${JSON.stringify(hold)}\n`, { mode: 0o644 })
    logHold(root, { at: new Date(at).toISOString(), action: current !== null ? 'extend' : 'hold', ...hold, ...(idleAtHold !== null ? { idleSeconds: idleAtHold } : {}) })
    return hold
  } finally {
    dropMutex(lock)
  }
}

/**
 * End `seat`'s hold, under the mutex. Removes the file when it is this seat's hold or no live hold at all (expired,
 * unreadable); another seat's live hold is left alone. Resolves to whether this seat's hold was ended.
 */
export async function releaseHold({ seat, dir = RUN_LOCK_DIR, now = Date.now, sleep = sleepMs, lockTimeoutMs = LOCK_TIMEOUT_MS, staleLockMs = STALE_LOCK_MS } = {}) {
  const root = holdRoot(seat, dir)
  const lock = join(root, '.lock')
  await takeMutex(lock, { now, sleep, lockTimeoutMs, staleLockMs })
  try {
    const path = join(root, HOLD_NAME)
    const parsed = readEntry(path)
    if (parsed === null) return false
    const at = now()
    const current = liveHold(parsed, at)
    if (current !== null && current.seat !== seat) return false
    if (current !== null) {
      // Ended, not forgotten: the chain's start stays for HOLD_CHAIN_GAP_MINUTES, so releasing and holding again at
      // once continues the chain instead of starting a fresh hour.
      const heldAt = isoOrNull(parsed.heldAt)
      const ended = { seat, since: safeText(parsed.since, 40) ?? new Date(at).toISOString(), ...(heldAt !== null ? { heldAt } : {}), until: new Date(at).toISOString(), reason: current.reason, released: true }
      writeFileSync(path, `${JSON.stringify(ended)}\n`, { mode: 0o644 })
      logHold(root, { at: new Date(at).toISOString(), action: 'release', seat })
      // CU-106: the Mac is free at once, not at the keeper's next look (it sees the ended hold and exits).
      const entryPath = join(root, ENTRY_NAME)
      const entry = readEntry(entryPath)
      if (isSentinel(entry) && entry.seat === seat) {
        try { unlinkSync(entryPath) } catch { /* already gone */ }
        logHold(root, { at: new Date(at).toISOString(), action: 'sentinel_removed', seat })
      }
      return true
    }
    // Not live: the seat's own ended hold is left as the chain's memory; anything else (unreadable, seatless, another
    // seat's expired hold) is cleared.
    if (!(parsed?.seat === seat && Number.isFinite(Date.parse(parsed?.until)))) {
      try { unlinkSync(path) } catch { /* already gone */ }
    }
    return false
  } finally {
    dropMutex(lock)
  }
}

/**
 * Wait until no live run holds the Mac (the entry is absent, unreadable or its pid dead), up to `timeoutMs`; resolves to
 * true when free, false on timeout. With a hold taken first it is the race-free order (cu-verifier, CU-75): a hold
 * refuses other seats' new runs but never ends an active one, so a seat holds, then waits here, then runs - checking
 * 'free' first and holding after lets another seat's run in between (twice in one evening, at 80 and 22 ms).
 */
export async function waitForFree({ dir = RUN_LOCK_DIR, timeoutMs = 0, isAlive = pidAlive, now = Date.now, sleep = sleepMs, pollMs = 500 } = {}) {
  if (typeof dir !== 'string' || !isAbsolute(dir)) throw invalid('the desktop-run lock needs an absolute dir')
  const entryPath = join(resolve(dir), ENTRY_NAME)
  const deadline = now() + timeoutMs
  for (;;) {
    const current = readEntry(entryPath)
    // A hold's sentinel is not a run (CU-106): the holder waits only for real runs to end.
    if (current === null || current === undefined || !isAlive(current.pid) || isSentinel(current)) return true
    if (now() >= deadline) return false
    await sleep(Math.min(pollMs, Math.max(1, deadline - now())))
  }
}

/**
 * The hold's keeper (CU-106): every `pollMs`, under the mutex, it writes the sentinel when run.json is missing,
 * unreadable or names a dead pid, and leaves a live entry (a run) alone; when the hold is no longer `seat`'s live hold
 * with this keeper's pid, or the lock directory is gone, it removes its own sentinel and returns. A busy mutex skips a
 * look rather than waiting.
 */
export async function keepHold({ seat, dir = RUN_LOCK_DIR, pid = process.pid, isAlive = pidAlive, now = Date.now, sleep = sleepMs, pollMs = KEEPER_POLL_MS, lockTimeoutMs = 1000, staleLockMs = STALE_LOCK_MS } = {}) {
  const root = holdRoot(seat, dir)
  const lock = join(root, '.lock')
  const entryPath = join(root, ENTRY_NAME)
  for (;;) {
    if (!existsSync(root)) return
    try {
      await takeMutex(lock, { now, sleep, lockTimeoutMs, staleLockMs, isAlive })
    } catch {
      await sleep(pollMs)
      continue
    }
    let done = false
    try {
      const parsed = readEntry(join(root, HOLD_NAME))
      const at = now()
      const hold = liveHold(parsed, at)
      const current = readEntry(entryPath)
      if (hold === null || hold.seat !== seat || parsed?.keeperPid !== pid) {
        if (isSentinel(current) && current.pid === pid) {
          try { unlinkSync(entryPath) } catch { /* already gone */ }
          logHold(root, { at: new Date(at).toISOString(), action: 'sentinel_removed', seat })
        }
        done = true
      } else if (current === null || current === undefined || !isAlive(current.pid)) {
        replaceEntry(entryPath, { seat, runId: SENTINEL_RUN_ID, pid, startedAt: new Date(at).toISOString(), sentinel: true })
        logHold(root, { at: new Date(at).toISOString(), action: current === null ? 'sentinel_on' : 'sentinel_restored', seat })
      }
    } finally {
      dropMutex(lock)
    }
    if (done) return
    await sleep(pollMs)
  }
}

/** Start a detached keeper for `seat`'s hold under `dir` (CU-106); returns its pid. The CLI's `hold` uses it. */
export function spawnKeeper({ seat, dir }) {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'keep', '--seat', seat, '--dir', dir], { detached: true, stdio: 'ignore' })
  child.unref()
  return child.pid
}

/**
 * CU-191: seconds since the last input event on this Mac - keyboard, pointer or trackpad, the owner's or one posted -
 * from IOHIDSystem's HIDIdleTime (nanoseconds); null when it cannot be read. Read-only: one number, no setting touched.
 */
export function systemIdleSeconds({ run = execFileSync } = {}) {
  try {
    const out = String(run('/usr/sbin/ioreg', ['-c', 'IOHIDSystem', '-r', '-d', '1', '-k', 'HIDIdleTime'], { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] }))
    const match = /"HIDIdleTime" = (\d+)/.exec(out)
    return match === null ? null : Number(match[1]) / 1e9
  } catch {
    return null
  }
}

/**
 * CU-191: the idle reader a hold on `dir` is checked with - the system's for this Mac's own lock, none for any other
 * directory. A scratch lock holds no Mac (tests stay hermetic, CU-117), and holding one is no way around the check:
 * runs consult only the real lock. There is no switch to turn it off.
 */
export function ownerIdleReader(dir) {
  return typeof dir === 'string' && isAbsolute(dir) && resolve(dir) === resolve(RUN_LOCK_DIR) ? systemIdleSeconds : null
}

/** The lock's mutex for the run-lock tests only (CU-117: taking turns under contention is tested across processes). */
export { takeMutex as takeLockMutex, dropMutex as dropLockMutex }

/** The live hold, or null: for a status line and for callers that would rather wait than be refused. */
export function readHold({ dir = RUN_LOCK_DIR, now = Date.now } = {}) {
  if (typeof dir !== 'string' || !isAbsolute(dir)) throw invalid('the desktop-run lock needs an absolute dir')
  return liveHold(readEntry(join(resolve(dir), HOLD_NAME)), now())
}

/**
 * The CLI: `hold --seat S --minutes N [--reason R] [--wait-free SECONDS]`, `release --seat S`, `status`, each with an
 * optional `--dir`. `--wait-free` holds first, then waits up to that long for an active run to end (`waitForFree`), so
 * one command gives the race-free order; it reports `free` and exits 3 when the run outlasted the wait. On exit 3 the
 * hold stays, so a caller may keep waiting - one that gives up must release it (an EXIT trap: `release --seat S`), or
 * the Mac stays held until its minutes run out.
 * Prints one JSON line; exit 0 done, 1 refused (another seat's hold, the chain cap, or - for a fresh hold on this Mac's
 * lock - local input in the last OWNER_IDLE_SECONDS, CU-191), 2 usage, 3 held but not free.
 */
export async function main(argv, { write = (line) => process.stdout.write(`${line}\n`), waitSeams = {}, seams = {} } = {}) {
  const [command, ...rest] = argv
  const options = {}
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i]
    if (!['--seat', '--minutes', '--reason', '--dir', '--wait-free'].includes(key) || rest[i + 1] === undefined) {
      write(JSON.stringify({ error: `usage: run-lock.mjs hold --seat S --minutes N [--reason R] [--wait-free SECONDS] | release --seat S | status [--dir D] (exit 3 = held, a run still active: release it if you give up); bad '${String(key)}'` }))
      return 2
    }
    options[key.slice(2)] = rest[i + 1]
  }
  const dir = options.dir ?? RUN_LOCK_DIR
  try {
    if (command === 'hold') {
      const waitFree = options['wait-free'] === undefined ? null : Number(options['wait-free'])
      if (waitFree !== null && !(Number.isFinite(waitFree) && waitFree >= 0 && waitFree <= 3600)) throw invalid('--wait-free is seconds from 0 to 3600', { field: 'wait-free' })
      const held = await holdDesktop({ seat: options.seat, minutes: Number(options.minutes), reason: options.reason ?? '', dir, startKeeper: seams.startKeeper ?? spawnKeeper, idleSeconds: seams.idleSeconds ?? ownerIdleReader(dir) })
      if (waitFree === null) {
        write(JSON.stringify({ held }))
      } else {
        const free = await waitForFree({ dir, timeoutMs: waitFree * 1000, ...waitSeams })
        write(JSON.stringify({ held, free }))
        if (!free) return 3
      }
    } else if (command === 'keep') {
      await keepHold({ seat: options.seat, dir })
    } else if (command === 'release') {
      write(JSON.stringify({ released: await releaseHold({ seat: options.seat, dir }) }))
    } else if (command === 'status') {
      const current = readEntry(join(resolve(dir), ENTRY_NAME)) ?? undefined
      const run = isSentinel(current) ? null : (({ seat, runId, startedAt, commit } = {}) => (seat ? { seat, runId, startedAt, commit: commit ?? null } : null))(current)
      write(JSON.stringify({ hold: readHold({ dir }), run, sentinel: isSentinel(current) }))
    } else {
      write(JSON.stringify({ error: 'usage: run-lock.mjs hold --seat S --minutes N [--reason R] [--wait-free SECONDS] | release --seat S | status [--dir D] (exit 3 = held, a run still active: release it if you give up)' }))
      return 2
    }
    return 0
  } catch (error) {
    write(JSON.stringify({ error: error.message, code: error.code ?? null, reason: error.details?.reason ?? null }))
    return error.code === 'invalid_argument' ? 2 : 1
  }
}

/**
 * Whether this file is the script node was started with. Compared as real paths: called through a symlink (on macOS
 * /tmp is /private/tmp) process.argv[1] keeps the link while import.meta.url is the real file, and a guard comparing
 * them as given did nothing at all - a 'hold' that silently took no hold (cu-developer-three).
 */
function isMain(argv1 = process.argv[1]) {
  if (!argv1) return false
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isMain()) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code })
}
