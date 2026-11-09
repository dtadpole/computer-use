/**
 * The harness side of CU Fixture's control channel: launch the app as a child process and speak JSON lines on its
 * stdin and stdout. Only the process that launched the app holds this channel, so an agent driving the screen cannot
 * read the facts it returns (D-012).
 */

import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { ENTRY_NAME, readHold, RUN_LOCK_DIR, SEAT_PATTERN } from '../../_environments_/macos-desktop/run-lock.mjs'
import { pidAlive } from '../agent-core/resource-gate.mjs'

/** Split a stream into whole JSON lines; returns `push(chunk) -> messages`. */
export function jsonLines() {
  let buffer = ''
  return (chunk) => {
    buffer += chunk
    const lines = buffer.split('\n')
    buffer = lines.pop()
    return lines.filter((line) => line.trim() !== '').map((line) => JSON.parse(line))
  }
}

/** The parent of `pid` by `ps`, or null when it cannot be read (a gone process, no ps). */
function psParent(pid) {
  try {
    const parent = Number(execFileSync('ps', ['-o', 'ppid=', '-p', String(pid)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim())
    return Number.isInteger(parent) && parent > 0 ? parent : null
  } catch {
    return null
  }
}

/** `pid` and its ancestors, at most `limit` of them, nearest first. */
export function ancestorsOf(pid, { parentOf = psParent, limit = 32 } = {}) {
  const chain = []
  let current = pid
  while (Number.isInteger(current) && current > 1 && chain.length < limit && !chain.includes(current)) {
    chain.push(current)
    current = parentOf(current)
  }
  return chain
}

/**
 * CU-305 (fixture-launch-lock.md): may this process start CU Fixture now? Yes inside a run - run.json holds a live,
 * non-sentinel run whose pid is this process or an ancestor (the nightly's and the gate's phase 2, an agent run) - or
 * under the caller's own hold: hold.json holds a live hold of the seat it declares (`seat`, else CU_DESKTOP_SEAT; the
 * holder exports it to its series, since the hold's keeper is detached and never an ancestor). Read-only, no mutex:
 * launching is not admission. Resolves to `{ ok: true, via }` or `{ ok: false, message }`.
 */
export function fixtureLaunchAllowed({ seat = process.env.CU_DESKTOP_SEAT, lockDir = RUN_LOCK_DIR, pid = process.pid, now = Date.now, isAlive = pidAlive, parentOf = psParent } = {}) {
  let entry = null
  try {
    entry = JSON.parse(readFileSync(join(lockDir, ENTRY_NAME), 'utf8'))
  } catch {
    // No run, or an unreadable entry: no run to be inside.
  }
  if (entry !== null && typeof entry === 'object' && entry.sentinel !== true && Number.isInteger(entry.pid) && isAlive(entry.pid)
    && ancestorsOf(pid, { parentOf }).includes(entry.pid)) {
    return { ok: true, via: `run ${entry.runId ?? '?'} of ${entry.seat ?? '?'}` }
  }
  const hold = readHold({ dir: lockDir, now })
  const declared = typeof seat === 'string' && SEAT_PATTERN.test(seat) ? seat : null
  if (hold !== null && declared !== null && hold.seat === declared) return { ok: true, via: `hold of ${declared}` }
  const held = hold !== null ? `the Mac is held by ${hold.seat} until ${hold.until}` : 'no seat holds the Mac'
  return {
    ok: false,
    message: `CU Fixture launches only under the desktop-run lock (CU-305, D-053, D-066): ${held}${declared !== null ? ` and this process declares ${declared}` : ' and this process declares no seat'}. ` +
      'Hold the Mac (run-lock.mjs hold --seat S --minutes N) and export CU_DESKTOP_SEAT=S to the series, or run inside a process that holds the run (the nightly and gate phase 2).',
  }
}

/**
 * Launch the fixture, only under the desktop-run lock (fixtureLaunchAllowed: `seat` declares the caller's hold,
 * `lockDir` names a scratch lock in tests). `offscreen` keeps every window unshown (self-tests); `sandbox` is the run's
 * file area (made under /tmp when omitted). Resolves to `{ call(method, params), open, state, act, targets, render, close, sandbox,
 * child }`.
 */
export async function launchFixture(executable, { offscreen = true, sandbox, role = 'fixture', timeoutMs = 10_000, seat, lockDir, lockCheck = fixtureLaunchAllowed } = {}) {
  // CU-305: the lock is checked before anything is made or started.
  const allowed = lockCheck({ ...(seat !== undefined ? { seat } : {}), ...(lockDir !== undefined ? { lockDir } : {}) })
  if (allowed?.ok !== true) throw Object.assign(new Error(allowed?.message ?? 'CU Fixture launches only under the desktop-run lock (CU-305)'), { code: 'fixture_unlocked' })
  sandbox ??= mkdtempSync('/tmp/cu-fixture-sandbox-')
  const args = ['--sandbox', sandbox, '--role', role, ...(offscreen ? ['--offscreen'] : [])]
  const child = spawn(executable, args, { stdio: ['pipe', 'pipe', 'pipe'] })
  const pending = new Map()
  let nextId = 1
  let stderr = ''
  const read = jsonLines()
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    for (const message of read(chunk)) {
      const waiter = pending.get(message.id)
      if (!waiter) continue
      pending.delete(message.id)
      clearTimeout(waiter.timer)
      if (message.error) waiter.reject(Object.assign(new Error(message.error), { code: 'fixture_error' }))
      else waiter.resolve(message.result)
    }
  })
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk) => (stderr = (stderr + chunk).slice(-4000)))
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })))
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      if (child.exitCode !== null) return reject(new Error(`the fixture has exited: ${stderr.slice(-300)}`))
      const id = nextId++
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`fixture ${method} got no answer within ${timeoutMs} ms`))
      }, timeoutMs)
      pending.set(id, { resolve, reject, timer })
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`)
    })
  const hello = await call('hello')
  return {
    child,
    sandbox,
    hello,
    exited,
    stderr: () => stderr,
    call,
    reset: () => call('reset'),
    open: (task, params) => call('open', { task, params }),
    state: () => call('state'),
    act: (step) => call('act', step),
    targets: () => call('targets'),
    /** What Accessibility reports at each target's centre: role, name and the element's class (CU-137). */
    axAudit: () => call('axAudit'),
    render: (window, path) => call('render', { window, path }),
    /** Quit, then make sure: SIGTERM after 3 s, SIGKILL after 6 s. */
    async close() {
      if (child.exitCode !== null) return exited
      call('quit').catch(() => {})
      child.stdin.end()
      const timers = [setTimeout(() => child.kill('SIGTERM'), 3000), setTimeout(() => child.kill('SIGKILL'), 6000)]
      const result = await exited
      timers.forEach(clearTimeout)
      return result
    },
  }
}
