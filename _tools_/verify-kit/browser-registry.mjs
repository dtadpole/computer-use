/**
 * verify-kit's own side of the team-wide browser registry (D-014): every [cu] Chrome launch registers in one
 * directory so the team never runs more than two browsers and a seat never more than one (D-005).
 *
 * The protocol is shared on disk, not in code (D-012): agent-core's resourceGate implements the same files
 * independently. Take the lock by `mkdir <dir>/.lock` (retry for at most 10 s, then refuse; a lock older than
 * 60 s is stale and removed); drop entries whose pid is dead; refuse if this seat already runs a browser or two
 * remain; else write `<seat>-<pid>.json` `{ seat, pid, profile, startedAt }`, release the lock. The caller then
 * checks the memory floor and launches; the Chrome pid is added after launch; the entry goes on release and at
 * process exit.
 */

import { mkdirSync, readdirSync, readFileSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** The registry every [cu] launch honours. */
export const REGISTRY_DIR = '/tmp/cu-browsers'

/** At most this many browsers for the whole team (D-005). */
export const TEAM_CAP = 2

const SEAT = /^cu-[a-z0-9]+(-[a-z0-9]+){0,3}$/

/** Whether a pid names a live process; EPERM means alive but owned by someone else. */
export function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

/**
 * Decide from the registry's live entries whether `seat` may launch: `null` when it may, else the refusal
 * reason (`seat_has_browser` or `team_cap`). Pure.
 */
export function refusal(entries, seat, cap = TEAM_CAP) {
  if (entries.some((entry) => entry.seat === seat)) return 'seat_has_browser'
  if (entries.length >= cap) return 'team_cap'
  return null
}

/**
 * Register a browser launch. Resolves to `{ ok: true, slot }` with `slot.setChromePid(pid)` and
 * `slot.release()`, or `{ ok: false, reason, message }` (`registry_busy`, `seat_has_browser`, `team_cap`).
 * Every dependency is injectable so tests never touch the real registry.
 */
export async function registerBrowser({
  seat,
  profile = null,
  dir = REGISTRY_DIR,
  pid = process.pid,
  now = Date.now,
  isAlive = pidAlive,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  lockTimeoutMs = 10_000,
  staleLockMs = 60_000,
  cap = TEAM_CAP,
  onExit = (fn) => process.once('exit', fn),
  offExit = (fn) => process.removeListener('exit', fn),
} = {}) {
  if (typeof seat !== 'string' || !SEAT.test(seat)) throw new TypeError(`${JSON.stringify(seat)} is not a [cu] seat key`)
  mkdirSync(dir, { recursive: true })
  const lock = join(dir, '.lock')
  const started = now()
  for (;;) {
    try {
      mkdirSync(lock)
      break
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      let age
      try {
        age = now() - statSync(lock).mtimeMs
      } catch {
        continue
      }
      if (age > staleLockMs) {
        try {
          rmdirSync(lock)
        } catch {
          // another process removed it first
        }
        continue
      }
      if (now() - started >= lockTimeoutMs) return { ok: false, reason: 'registry_busy', message: 'the browser registry stayed locked for 10 s' }
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
      if (!entry || !isAlive(entry.pid)) {
        try {
          unlinkSync(path)
        } catch {
          // already gone
        }
        continue
      }
      live.push(entry)
    }
    const reason = refusal(live, seat, cap)
    if (reason) {
      const message = reason === 'seat_has_browser' ? `seat ${seat} already runs a browser (D-005)` : `the team already runs ${live.length} browsers (D-005, D-014)`
      return { ok: false, reason, message }
    }
    writeFileSync(entryPath, `${JSON.stringify({ seat, pid, profile, startedAt: new Date(now()).toISOString() })}\n`)
  } finally {
    try {
      rmdirSync(lock)
    } catch {
      // nothing to release
    }
  }

  const remove = () => {
    try {
      unlinkSync(entryPath)
    } catch {
      // already gone
    }
  }
  onExit(remove)
  let released = false
  return {
    ok: true,
    slot: {
      entryPath,
      setChromePid(chromePid) {
        if (released) return
        const entry = JSON.parse(readFileSync(entryPath, 'utf8'))
        writeFileSync(entryPath, `${JSON.stringify({ ...entry, chromePid })}\n`)
      },
      release() {
        if (released) return
        released = true
        remove()
        offExit(remove)
      },
    },
  }
}
