import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { launchDesktopEnvironment } from '../../_environments_/macos-desktop/environment.mjs'
import { connectStdio } from '../../_environments_/macos-desktop/helper-link.mjs'
import { acquireDesktopRun } from '../../_environments_/macos-desktop/run-lock.mjs'

/**
 * Shared test plumbing: start the fake helper (a Node child, never CUHelper.app) over stdio or against a socket, and
 * collect the requests it logs on stderr, so a test can check exactly what the driver sent.
 */

export const FAKE_HELPER = fileURLToPath(new URL('./fake-helper.mjs', import.meta.url))

/**
 * Spawn the fake helper; `child.requests` fills with every request it receives and `child.log` with its other stderr
 * lines - the peer-boundary steps (`peer ok pid=<n>`, `peer refused pid=<n>`, `token read`, `no driver accepted ...`),
 * so a test can prove the order: peer check, then token, then hello.
 */
export function spawnFake(config = {}, { token = 'test-token', socketPath, tokenPath, args: extra = [] } = {}) {
  const args = [FAKE_HELPER, ...(socketPath !== undefined ? ['--socket', socketPath, '--token-file', tokenPath] : []), ...extra]
  const child = spawn(process.execPath, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin', FAKE_HELPER_CONFIG: JSON.stringify(config), FAKE_HELPER_TOKEN: token },
  })
  child.requests = []
  child.log = []
  let buffer = ''
  child.stderr.on('data', (chunk) => {
    buffer += chunk.toString()
    for (let at = buffer.indexOf('\n'); at !== -1; at = buffer.indexOf('\n')) {
      const line = buffer.slice(0, at)
      buffer = buffer.slice(at + 1)
      if (line.startsWith('REQ ')) child.requests.push(JSON.parse(line.slice(4)))
      else if (line.length > 0) child.log.push(line)
    }
  })
  // Resolves once the process has exited and its stderr is drained, so `child.log` is complete.
  child.closed = false
  child.exited = new Promise((resolve) => child.once('close', (code) => { child.closed = true; resolve(code) }))
  return child
}

/**
 * Make each request the link sends resolve or reject only once the fake's `REQ` line for it (by id) is in
 * `child.requests`. The fake writes that line on stderr before its reply on stdout, but the two pipes are read in any
 * order, so under load a test that reads `child.requests` right after an awaited call could miss it - the race behind
 * CU-73 and the transient panel-marker and panelSelection failures. A request the link refused locally allocates no id
 * and waits for nothing; a fake that closed stops the wait; otherwise at most 2 s.
 */
function syncedWithLog(link, child) {
  const request = link.request.bind(link)
  link.request = async (...args) => {
    const id = link.nextId
    const sending = request(...args)
    const sent = link.nextId !== id
    try {
      return await sending
    } finally {
      if (sent) {
        const deadline = Date.now() + 2000
        while (!child.requests.some((r) => r.id === id) && !child.closed && Date.now() < deadline) await pause(2)
      }
    }
  }
  return link
}

/** A stdio link to a fresh fake helper; its requests settle only once the fake has logged them (`syncedWithLog`). */
export async function stdioLink(config = {}, { token = 'test-token', helloToken = token, requestTimeoutMs } = {}) {
  const child = spawnFake(config, { token })
  try {
    const link = syncedWithLog(await connectStdio(child, { token: helloToken, helloTimeoutMs: 5000, ...(requestTimeoutMs !== undefined ? { requestTimeoutMs } : {}) }), child)
    return { child, link }
  } catch (error) {
    child.kill()
    throw error
  }
}

/** Stop a fake helper if it still runs. */
export async function stopFake(child) {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill()
    await child.exited
  }
}

/** A throwaway directory under the OS temp dir, short enough for a Unix socket path; `remove()` deletes it. A process
 * that is still exiting (a fake helper, a hold keeper) can write one last file while the tree is removed, which fails
 * ENOTEMPTY (cu-integrator, #420's gate, 10 Nov); Node retries that, EBUSY and EPERM with a short back-off. */
export function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'cu-desktop-'))
  return { dir, remove: () => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) }
}

/**
 * Desktop-run locks for tests, each in its own directory under one throwaway parent, so no test ever takes the team's
 * real `/tmp/cu-desktop-run` and no test's lock outlives it into the next. `next()` returns a fresh `runLock` seam;
 * `remove()` deletes every directory.
 */
export function scratchLocks(options = {}) {
  const parent = scratch()
  let count = 0
  return {
    dir: parent.dir,
    next() {
      count += 1
      const dir = join(parent.dir, `lock-${count}`)
      return (args) => acquireDesktopRun({ ...args, dir, ...options })
    },
    remove: parent.remove,
  }
}

/**
 * Approve `apps` the one way the design allows (app-policy.md 0.3.4, P11): the driver launches with an empty scope,
 * and each approved app joins through `addApp`, the first one confirming the frame. Tests that stand in for agent core's
 * consent gate call this right after the launch. A refused add closes the environment before it rethrows.
 */
export async function approveApps(env, apps) {
  try {
    for (const app of apps) await env.addApp(app)
  } catch (error) {
    await env.close()
    throw error
  }
  return env
}

/**
 * Launch on a fake and approve its candidates, as agent core does for start apps it is allowed to admit: `options`
 * go to `launchDesktopEnvironment`, except `approve` (default: the candidates `apps`), the apps then added in order.
 * `approve: []` leaves the scope empty, as the launch itself does. `child` is set even when the launch fails, so the
 * caller can stop it.
 */
export async function launchApproved(connectFake, options) {
  const { approve = options.apps ?? [], ...rest } = options
  const env = await launchDesktopEnvironment({ ...rest, connect: connectFake })
  return approveApps(env, approve)
}

/**
 * `launchOnFake(config, options)` for one test file: the driver on a fresh fake helper over stdio, each launch with
 * its own lock from `locks` (a `scratchLocks()`), its candidates approved through `addApp` unless `options.approve`
 * says otherwise (see `launchApproved`). Resolves `{ env, child }`; a failed launch stops its fake first.
 */
export function fakeLauncher(locks, defaults = {}) {
  return async function launchOnFake(config = {}, options = {}) {
    const started = { child: null }
    const connect = async () => {
      const { child, link } = await stdioLink(config)
      started.child = child
      return link
    }
    try {
      const env = await launchApproved(connect, { apps: ['com.example.fixture'], seat: 'cu-developer-two', runLock: locks.next(), ...defaults, ...options })
      return { env, child: started.child }
    } catch (error) {
      if (started.child !== null) await stopFake(started.child)
      throw error
    }
  }
}

/**
 * Socket peer-check options under which every peer counts as the helper (B5): for tests of the helper's own side of
 * the boundary, so the driver's check stays on (`require`) without deciding them. The driver's check itself is judged
 * in `peer-check.test.mjs`. The executable need not exist.
 */
export function anyPeerIsHelper() {
  const helperExecutable = '/nonexistent/CUHelper.app/Contents/MacOS/CUHelper'
  return { helperExecutable, identifyPeer: async () => ({ pid: process.pid, path: helperExecutable }), verifyPeer: async () => true, peerLog: () => {} }
}

/** Resolve after `ms`. */
export const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Wait until the fake has logged at least `count` requests. Its log arrives on stderr, a different pipe from the
 * replies, so a reply can be read before the log line of its own request.
 */
/**
 * Wait until the fake's request log stops growing for `stillMs`: its REQ lines come over stderr and can lag the
 * replies under load, so a count taken right after an action may miss the action's own request (two flakes seen
 * in cu-integrator's parallel gate). Use before snapshotting `child.requests.length`.
 */
export async function quiet(child, stillMs = 60, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs
  let seen = -1
  while (child.requests.length !== seen && Date.now() < deadline) {
    seen = child.requests.length
    await pause(stillMs)
  }
  return child.requests
}

export async function logged(child, count, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs
  while (child.requests.length < count && Date.now() < deadline) await pause(5)
  return child.requests
}
