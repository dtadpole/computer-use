import { lstatSync, mkdirSync, readFileSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

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
 */

export const RUN_LOCK_DIR = '/tmp/cu-desktop-run'
export const ENTRY_NAME = 'run.json'
export const LOCK_TIMEOUT_MS = 10_000
export const STALE_LOCK_MS = 60_000
/** The seat keys of the [cu] team, as in resource-gate.mjs and chrome-browser/launch.mjs. */
export const SEAT_PATTERN = /^cu-[a-z0-9]+(-[a-z0-9]+){0,3}$/
/** Agent core's run ids (`20261102T090122Z-ab12cd`) and test ids; no path separators, no spaces. */
export const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

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

/** Take the `.lock` mutex, removing a stale one; refuses `run_lock_busy` after `lockTimeoutMs`. */
async function takeMutex(lock, { now, sleep, lockTimeoutMs, staleLockMs }) {
  const started = now()
  for (;;) {
    try {
      mkdirSync(lock)
      return
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      let age = 0
      try {
        age = now() - statSync(lock).mtimeMs
      } catch {
        continue // released meanwhile
      }
      if (age > staleLockMs) {
        try { rmdirSync(lock) } catch { /* someone else removed it */ }
        continue
      }
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

const sameEntry = (a, b) => a !== null && a !== undefined && a.seat === b.seat && a.runId === b.runId && a.pid === b.pid && a.startedAt === b.startedAt

/**
 * Acquire the desktop run for `seat` and `runId`. Resolves to `{ entry, entryPath, release() }`; rejects with an
 * EnvironmentError: `invalid_argument` for a bad seat, run id or dir, `resource_refused` with `details.reason`
 * `desktop_run_active` (another run holds the Mac), `run_lock_busy` or `run_lock_unsafe`.
 */
export async function acquireDesktopRun({
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
} = {}) {
  if (typeof seat !== 'string' || !SEAT_PATTERN.test(seat)) throw invalid('the desktop run needs a [cu] seat key such as cu-developer-two')
  if (typeof runId !== 'string' || !RUN_ID_PATTERN.test(runId)) throw invalid('the desktop run needs a run id of letters, digits and . _ : -')
  if (typeof dir !== 'string' || !isAbsolute(dir)) throw invalid('the desktop-run lock needs an absolute dir')
  const root = resolve(dir)
  prepareDir(root)
  const lock = join(root, '.lock')
  const entryPath = join(root, ENTRY_NAME)
  await takeMutex(lock, { now, sleep, lockTimeoutMs, staleLockMs })
  let entry
  try {
    const current = readEntry(entryPath)
    if (current !== null && (current === undefined || !isAlive(current.pid))) {
      try { unlinkSync(entryPath) } catch { /* already gone */ }
    } else if (current !== null) {
      throw activeRunError(current)
    }
    entry = Object.freeze({ seat, runId, pid, startedAt: new Date(now()).toISOString() })
    try {
      writeFileSync(entryPath, `${JSON.stringify(entry)}\n`, { flag: 'wx', mode: 0o644 })
    } catch (error) {
      // Only a writer that ignored the mutex can get here; its entry wins and this run is refused.
      if (error.code === 'EEXIST') throw activeRunError(readEntry(entryPath))
      throw error
    }
  } finally {
    try { rmdirSync(lock) } catch { /* nothing to release */ }
  }

  // Removes the file only while it is still this run's entry: a later run's entry is never deleted by a late release.
  const removeEntry = () => {
    try {
      if (sameEntry(readEntry(entryPath), entry)) unlinkSync(entryPath)
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
  }
}
