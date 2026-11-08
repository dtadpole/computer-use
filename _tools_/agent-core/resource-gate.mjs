import { execFile } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { freemem, totalmem } from 'node:os'
import { join } from 'node:path'

/**
 * The launch gate every agent Chrome passes (D-005, D-014): the team-wide browser registry under
 * `/tmp/cu-browsers/` and the memory floor. It never imports verify-kit, whose own gate stays separate (D-012).
 *
 * D-014 protocol: take the lock by `mkdir <dir>/.lock` (atomic; retry for at most 10 s, then refuse; a lock older
 * than 60 s is stale and removed); drop entries whose owner pid is dead; refuse if this seat already has a browser
 * or two remain; else write `<seat>-<pid>.json`, release the lock, then check the memory floor. The entry is removed
 * on `release()` and when the process exits; the Chrome pid is added after launch.
 */

export const REGISTRY_DIR = '/tmp/cu-browsers'
export const MIN_FREE_PERCENT = 25
export const TEAM_BROWSER_CAP = 2
const SEAT_PATTERN = /^cu-[a-z0-9]+(-[a-z0-9]+){0,3}$/

/** A refused launch. `reason` is `seat_has_browser`, `team_cap`, `memory_floor`, `memory_unknown` or `registry_busy`. */
export class ResourceRefusedError extends Error {
  constructor(reason, message) {
    super(message)
    this.name = 'ResourceRefusedError'
    this.code = 'resource_refused'
    this.reason = reason
  }
}

/** The floor in percent: 25, raised (never lowered) by `CU_MIN_FREE_PERCENT`. */
export function memoryFloor(env = process.env) {
  const raised = Number(env.CU_MIN_FREE_PERCENT)
  return Number.isFinite(raised) && raised > MIN_FREE_PERCENT ? Math.min(raised, 100) : MIN_FREE_PERCENT
}

/** Parse `memory_pressure`'s last line, `System-wide memory free percentage: 63%`, or null. */
export function parseMemoryPressure(output) {
  const match = /free percentage:\s*(\d+(?:\.\d+)?)%/i.exec(String(output ?? ''))
  return match === null ? null : Number(match[1])
}

/** Free memory in percent: macOS `memory_pressure`, else the OS counters. */
export function readFreeMemoryPercent() {
  return new Promise((resolve) => {
    execFile('memory_pressure', [], { timeout: 10_000 }, (error, stdout) => {
      if (!error) return resolve(parseMemoryPressure(stdout))
      if (error.code === 'ENOENT') return resolve((freemem() / totalmem()) * 100)
      resolve(null)
    })
  })
}

/** Whether a pid names a live process (EPERM means alive but not ours). */
export function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Pass the gate before launching Chrome. Resolves to a slot `{ entryPath, setChromePid(pid), release() }`, or
 * rejects with `ResourceRefusedError`. Every dependency is injectable for tests.
 */
export async function resourceGate({
  seat,
  profile = null,
  dir = REGISTRY_DIR,
  env = process.env,
  pid = process.pid,
  now = Date.now,
  isAlive = pidAlive,
  freeMemoryPercent = readFreeMemoryPercent,
  sleep = sleepMs,
  lockTimeoutMs = 10_000,
  staleLockMs = 60_000,
  cap = TEAM_BROWSER_CAP,
  onExit = (fn) => process.once('exit', fn),
  offExit = (fn) => process.removeListener('exit', fn),
} = {}) {
  if (typeof seat !== 'string' || !SEAT_PATTERN.test(seat)) throw new TypeError(`'${seat}' is not a [cu] seat key`)
  mkdirSync(dir, { recursive: true })
  const lock = join(dir, '.lock')
  const started = now()
  for (;;) {
    try {
      mkdirSync(lock)
      break
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
        throw new ResourceRefusedError('registry_busy', 'the browser registry stayed locked; try again shortly')
      }
      await sleep(100)
    }
  }

  const entryPath = join(dir, `${seat}-${pid}.json`)
  try {
    const live = []
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.json')) continue
      const path = join(dir, name)
      let entry = null
      try {
        entry = JSON.parse(readFileSync(path, 'utf8'))
      } catch {
        entry = null
      }
      if (entry === null || !isAlive(entry.pid)) {
        try { unlinkSync(path) } catch { /* already gone */ }
        continue
      }
      live.push(entry)
    }
    if (live.some((entry) => entry.seat === seat)) {
      throw new ResourceRefusedError('seat_has_browser', `seat ${seat} already runs a browser (D-005)`)
    }
    if (live.length >= cap) {
      throw new ResourceRefusedError('team_cap', `the team already runs ${live.length} browsers (D-005, D-014)`)
    }
    writeFileSync(entryPath, JSON.stringify({ seat, pid, profile, startedAt: new Date(now()).toISOString() }) + '\n')
  } finally {
    try { rmdirSync(lock) } catch { /* nothing to release */ }
  }

  const removeEntry = () => {
    try { unlinkSync(entryPath) } catch { /* already gone */ }
  }
  const floor = memoryFloor(env)
  let free = null
  try {
    free = await freeMemoryPercent()
  } catch {
    free = null
  }
  if (free === null || !Number.isFinite(free)) {
    removeEntry()
    throw new ResourceRefusedError('memory_unknown', 'free memory could not be read, so no browser starts (D-005)')
  }
  if (free < floor) {
    removeEntry()
    throw new ResourceRefusedError('memory_floor', `free memory ${Math.round(free)}% is under the ${floor}% floor (D-005)`)
  }

  onExit(removeEntry)
  let released = false
  return {
    entryPath,
    freePercent: free,
    setChromePid(chromePid) {
      if (released) return
      const entry = JSON.parse(readFileSync(entryPath, 'utf8'))
      writeFileSync(entryPath, JSON.stringify({ ...entry, chromePid }) + '\n')
    },
    release() {
      if (released) return
      released = true
      removeEntry()
      offExit(removeEntry)
    },
  }
}
