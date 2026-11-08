import { execFile, spawn as nodeSpawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'

import { EnvironmentError } from './errors.mjs'

/**
 * Starting and stopping the agent's Chrome.
 *
 * What makes this browser the *agent's* rather than anyone's (R1, D-005, D-012):
 * - a fresh profile `/tmp/<seat>-chrome-XXXXXX`, removed on stop, and only a path of that exact shape is ever removed;
 * - a child environment of `PATH`, `HOME`, `TMPDIR` and `LANG` only, with `HOME` and `TMPDIR` inside the profile, so
 *   no host variable (an API key, a token) reaches the browser;
 * - `--use-mock-keychain`, so Chrome never asks the macOS Keychain for its storage key (no prompt on the owner's Mac);
 * - extensions, sync, background networking and component updates off; headless (`--headless=new`), which also
 *   keeps Chrome's clipboard in-process (D-011);
 * - Chrome's own sandbox kept: `--no-sandbox` is never passed, and a browser that reports it cannot sandbox is
 *   stopped and refused with `sandbox_unavailable`, unlike browser-use's `launchChrome`, which retries without it.
 *
 * The viewport is declared later through `Emulation.setDeviceMetricsOverride` (measured: `--window-size` alone gives a
 * shorter inner height); `--window-size` here only sizes the headless window to match.
 */

export const CHROME_CANDIDATES = Object.freeze([
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
])

/** Seat keys of the [cu] roster: `cu-` and up to four kebab words. */
export const SEAT_PATTERN = /^cu-[a-z0-9]+(-[a-z0-9]+){0,3}$/

/** Chrome's stderr when the outer environment refuses its sandbox (wording seen across platforms). */
export const SANDBOX_FAILURE = /sandbox initialization failed|failed to initialize sandbox|SUID sandbox helper|no usable sandbox/i

const STDERR_KEEP_CHARS = 64 * 1024

/** The Chrome binary: `CU_CHROME` if it names an existing file, else the first installed candidate. */
export function findChrome({ env = process.env, exists = existsSync } = {}) {
  const override = env.CU_CHROME
  if (override !== undefined && override.length > 0) {
    if (!exists(override)) throw new EnvironmentError('resource_refused', 'CU_CHROME does not name an existing browser')
    return override
  }
  const found = CHROME_CANDIDATES.find((candidate) => exists(candidate))
  if (found === undefined) throw new EnvironmentError('resource_refused', 'no Google Chrome installation was found')
  return found
}

function checkSeat(seat) {
  if (typeof seat !== 'string' || !SEAT_PATTERN.test(seat)) throw new EnvironmentError('invalid_argument', 'seat must be a [cu] seat key such as cu-developer-two')
}

/** The prefix `mkdtemp` completes into this seat's throwaway profile. */
export function profilePrefix(seat) {
  checkSeat(seat)
  return `/tmp/${seat}-chrome-`
}

/** Whether a path is one of this seat's throwaway profiles, the only kind of path `removeProfile` deletes. */
export function isOwnProfile(path, seat) {
  checkSeat(seat)
  return typeof path === 'string' && new RegExp(`^/tmp/${seat}-chrome-[A-Za-z0-9]{6}$`).test(path)
}

/**
 * Remove a throwaway profile; refuses any other path.
 *
 * Seen by cu-developer-one in one run of six: Chrome's helper processes can still write for a moment after the
 * browser process exits and recreate the folder (an empty `Default/`) after a removal that succeeded. So a removal
 * counts only when the folder is still gone `settleMs` later; otherwise it is removed again, up to `attempts` times.
 * Resolves true when the folder is gone, false when it kept coming back.
 */
export async function removeProfile(path, seat, { remove = rmSync, exists = existsSync, attempts = 20, pauseMs = 100, settleMs = 250 } = {}) {
  if (!isOwnProfile(path, seat)) throw new EnvironmentError('invalid_argument', 'refusing to remove a path that is not this seat\'s throwaway profile')
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      remove(path, { recursive: true, force: true })
    } catch (error) {
      if (attempt === attempts) throw error
      await pause(pauseMs)
      continue
    }
    await pause(settleMs)
    if (!exists(path)) return true
  }
  return false
}

/** Chrome's command line. Never contains `--no-sandbox`. */
export function chromeArgs({ profile, viewport, proxyServer } = {}) {
  if (typeof profile !== 'string' || profile.length === 0) throw new EnvironmentError('invalid_argument', 'chromeArgs needs a profile')
  const width = viewport?.width ?? 1440
  const height = viewport?.height ?? 900
  return [
    '--headless=new',
    '--use-mock-keychain',
    '--disable-extensions',
    '--disable-sync',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-features=Translate,MediaRouter,OptimizationHints,AutofillServerCommunication',
    '--no-first-run',
    '--no-default-browser-check',
    '--deny-permission-prompts',
    '--force-device-scale-factor=1',
    '--mute-audio',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    ...(proxyServer !== undefined ? [`--proxy-server=${proxyServer}`, '--proxy-bypass-list=<-loopback>', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'] : []),
    'about:blank',
  ]
}

/** The child environment: nothing inherited from the host but a minimal `PATH`. */
export function childEnv(profile) {
  return { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: profile, TMPDIR: `${profile}/`, LANG: 'en_US.UTF-8' }
}

/** The DevTools endpoint Chrome prints on stderr, or null. */
export function parseEndpoint(stderr) {
  const match = /DevTools listening on (ws:\/\/\S+)/.exec(stderr)
  return match === null ? null : match[1]
}

/** Why Chrome is not sandboxed, or null: `--no-sandbox` on its real command line, or a sandbox failure on stderr. */
export function sandboxProblem({ commandLine = [], stderr = '' } = {}) {
  if (commandLine.some((arg) => arg === '--no-sandbox' || arg.startsWith('--no-sandbox='))) return 'Chrome is running with --no-sandbox'
  if (commandLine.some((arg) => arg === '--disable-setuid-sandbox')) return 'Chrome is running with its setuid sandbox disabled'
  if (SANDBOX_FAILURE.test(stderr)) return 'Chrome reported that it cannot initialise its sandbox'
  return null
}

/**
 * Chrome's real command line from the process table, as flags (`--name` or `--name=value`); an empty list when the
 * process is gone. Independent of what Chrome reports about itself over CDP.
 */
export function processCommandLine(pid, { run = execFile } = {}) {
  return new Promise((resolve) => {
    if (!Number.isInteger(pid) || pid <= 0) return resolve([])
    run('ps', ['-ww', '-o', 'command=', '-p', String(pid)], { timeout: 5000 }, (error, stdout) => {
      if (error) return resolve([])
      resolve(String(stdout).split(/\s+/).filter((token) => token.startsWith('--')))
    })
  })
}

/**
 * Start Chrome on a fresh profile and resolve when its DevTools endpoint is printed.
 *
 * Returns `{ child, wsUrl, profile, binary, stderr(), stop() }`. `stop()` is idempotent: SIGTERM, then SIGKILL after
 * two seconds, then the profile is removed. An exit hook kills the child and removes the profile if Node exits first.
 */
export async function startChrome({ seat, viewport, proxyServer, binary, timeoutMs = 15_000, spawn = nodeSpawn, mkdtemp = mkdtempSync } = {}) {
  const executable = binary ?? findChrome()
  const profile = mkdtemp(profilePrefix(seat))
  const child = spawn(executable, chromeArgs({ profile, viewport, proxyServer }), { stdio: ['ignore', 'ignore', 'pipe'], env: childEnv(profile) })
  let stderr = ''
  child.stderr.on('data', (chunk) => {
    stderr = (stderr + chunk.toString()).slice(-STDERR_KEEP_CHARS)
  })
  let stopped = false
  // At process exit only synchronous work runs: kill Chrome, then retry the removal briefly while its helpers stop.
  const exitHook = () => {
    try { child.kill('SIGKILL') } catch { /* already gone */ }
    const pause = new Int32Array(new SharedArrayBuffer(4))
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        rmSync(profile, { recursive: true, force: true })
        if (!existsSync(profile)) return
      } catch { /* Chrome's helpers may still be writing */ }
      Atomics.wait(pause, 0, 0, 100)
    }
  }
  process.once('exit', exitHook)
  const stop = async () => {
    if (stopped) return
    stopped = true
    process.removeListener('exit', exitHook)
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise((resolve) => child.once('exit', resolve))
      child.kill('SIGTERM')
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2_000))])
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL')
        await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2_000))])
      }
    }
    await removeProfile(profile, seat)
  }
  try {
    const wsUrl = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new EnvironmentError('timeout', `Chrome printed no DevTools endpoint within ${timeoutMs} ms`)), timeoutMs)
      const check = () => {
        const url = parseEndpoint(stderr)
        if (url !== null) {
          clearTimeout(timer)
          resolve(url)
        }
      }
      child.stderr.on('data', check)
      child.once('error', (error) => {
        clearTimeout(timer)
        reject(new EnvironmentError('browser_crashed', `Chrome could not be started: ${error.code ?? 'spawn error'}`))
      })
      child.once('exit', (code, signal) => {
        clearTimeout(timer)
        reject(new EnvironmentError(SANDBOX_FAILURE.test(stderr) ? 'sandbox_unavailable' : 'browser_crashed',
          `Chrome exited before it was ready (code ${String(code)}, signal ${String(signal)})`))
      })
      check()
    })
    return { child, wsUrl, profile, binary: executable, stderr: () => stderr, stop }
  } catch (error) {
    await stop()
    throw error
  }
}
