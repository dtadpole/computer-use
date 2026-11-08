import { spawn as nodeSpawn } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { basename, isAbsolute, join, resolve } from 'node:path'

import { EnvironmentError, invalid } from './errors.mjs'

/**
 * Launching the helper so that its TCC grants are its own (design: desktop-extension/helper-and-protocol.md 0.3.3,
 * helper-boundary.md 0.3.4; the Swift side is Arguments.swift and PeerCheck.swift).
 *
 * macOS charges a child process's TCC checks to its *responsible* process: a helper spawned by node inside a terminal
 * would ask for, and use, the terminal's grants. So the driver never spawns the helper binary. It asks LaunchServices
 * to start the bundle, `open -g -n -a <bundle> --args --socket <path> --token-file <path> --driver-node <path>
 * --driver-entry <path>`: `-g` keeps the person's frontmost app in front, `-n` starts a fresh instance per run even if
 * an old one lingers, and the helper becomes its own responsible process (measured: macos-helper-measurements.md,
 * launch path). It then connects back to the socket.
 *
 * **The driver names itself (D-029 a).** A helper that holds a grant checks the process at the other end of the socket
 * before it says hello: genuine node, exactly the binary `--driver-node` names, running as its first argument exactly
 * the script `--driver-entry` names - one of a compiled list of entry points (agent core's `cli.mjs`, the MCP
 * `server.mjs`, the desktop suite's `run.mjs`; design 0.3.5 adds cu-verifier's stand-in driver) in an owner
 * checkout. Both are real paths here because the helper compares real paths. The arguments can never widen that list;
 * they only say which entry this run is. So a driver that should reach a granted helper must be started as plain
 * `node <entry>.mjs`:
 *
 * - with no node option before the script (`node --import x entry.mjs`, `node --test`, even a harmless flag): the
 *   helper reads the script as the peer's first argument and refuses an option there;
 * - with none of `DYLD_*`, `LD_*`, `NODE_OPTIONS`, `NODE_PATH`, `NODE_REPL_EXTERNAL_MODULE` or `NODE_ICU_DATA` in its
 *   environment at exec time (this Mac's node allows DYLD injection). Deleting one from `process.env` later does not
 *   help: the helper reads the environment the kernel recorded at exec.
 *
 * A refused driver sees the helper close before any hello (`helper_lost`, `details.reason: 'no_hello'`);
 * `driverLaunchProblems()` names which of these this process breaks, so the refusal can say why. An ungranted helper
 * skips the check (nothing can act), which is why unit tests on the fake helper pass under `node --test`.
 *
 * **Pre-grant boundary checks.** `enforceBoundary` adds `--enforce-boundary`: the helper applies the peer check, the
 * one-helper lock and the indicator even with no grant (cu-verifier's pre-grant check of the boundary). `lockPath`
 * adds `--lock-path <abs path>`, a private one-helper lock for such a test; the helper honours it only with
 * `--enforce-boundary` (so it is refused here without it) and refuses it outright once any grant is held.
 *
 * `spawn` is a seam: the unit tests pass a fake and check the arguments; they never run `open`.
 */

export const OPEN_BINARY = '/usr/bin/open'
export const BUNDLE_NAME = 'CUHelper.app'
/** The helper's bundle id; `helper/build.sh` writes the same value into Info.plist. */
export const BUNDLE_ID = 'com.reflection.cu-helper'
export const OPEN_TIMEOUT_MS = 15_000

/** The executable inside the bundle; `helper/build.sh` names it so (`CFBundleExecutable`). */
export const EXECUTABLE_NAME = 'CUHelper'

/**
 * Environment variables that make node load other code; the helper refuses a driver whose exec-time environment holds
 * any (PeerCheck.swift `loadsCode`). A prefix ends in `_`.
 */
export const CODE_LOADING_ENV = Object.freeze(['DYLD_', 'LD_', 'NODE_OPTIONS', 'NODE_PATH', 'NODE_REPL_EXTERNAL_MODULE', 'NODE_ICU_DATA'])

/** The fixed bundle location `$CU_HOME/helper/CUHelper.app`; the owner grants that one bundle, nothing else. */
export function defaultBundlePath(cuHomeDir) {
  if (typeof cuHomeDir !== 'string' || !isAbsolute(cuHomeDir)) throw invalid('the helper bundle path needs an absolute CU_HOME')
  return join(cuHomeDir, 'helper', BUNDLE_NAME)
}

/** The helper's own rule for a path argument: absolute, one line, no NUL (Arguments.swift `path`). */
function checkPath(value, name) {
  if (typeof value !== 'string' || !isAbsolute(value) || /[\n\r\0]/.test(value)) throw invalid(`${name} must be an absolute path`)
}

/**
 * The executable a launched bundle runs, `<bundle>/Contents/MacOS/CUHelper`: the only program the helper socket's
 * peer check accepts on the other end (B5), derived from the same bundle path `open` is given.
 */
export function helperExecutablePath(bundlePath) {
  checkPath(bundlePath, 'bundlePath')
  if (basename(bundlePath) !== BUNDLE_NAME) throw invalid(`the helper bundle must be ${BUNDLE_NAME}`)
  return join(bundlePath, 'Contents', 'MacOS', EXECUTABLE_NAME)
}

/**
 * This driver as the helper's peer check sees it: `driverNode`, the real path of the node binary running it
 * (`process.execPath`), and `driverEntry`, the real path of the script node was started with (`process.argv[1]`). The
 * helper resolves both sides before comparing, but a real path here also keeps a symlinked checkout from being named
 * by a path the helper's list does not hold. A process with no script (`node -e`, a REPL) cannot be a driver.
 */
export function driverIdentity({ execPath = process.execPath, argv = process.argv, realpath = realpathSync } = {}) {
  const entry = argv?.[1]
  if (typeof entry !== 'string' || entry.length === 0 || entry.startsWith('-')) {
    throw invalid('this process runs no entry script, so it cannot name one to the helper; start the driver as node <entry>.mjs')
  }
  let driverNode
  let driverEntry
  try {
    driverNode = realpath(execPath)
  } catch {
    throw invalid('the node binary running this driver cannot be resolved')
  }
  try {
    driverEntry = realpath(resolve(entry))
  } catch {
    throw invalid('the entry script running this driver cannot be resolved')
  }
  return { driverNode, driverEntry }
}

/**
 * What about this process a helper that checks its peer would refuse (see the header): `environment`, the names of
 * code-loading variables set now, and `nodeOptions`, how many node options came before the script. Names and a
 * count only - never a value, which could hold a path or a secret. Both empty means nothing here is the reason.
 */
export function driverLaunchProblems({ env = process.env, execArgv = process.execArgv } = {}) {
  const environment = Object.keys(env ?? {}).filter((name) => CODE_LOADING_ENV.some((entry) => (entry.endsWith('_') ? name.startsWith(entry) : name === entry))).sort()
  return { environment, nodeOptions: Array.isArray(execArgv) ? execArgv.length : 0 }
}

/**
 * The exact `open` arguments, in the design's order; refuses anything but absolute paths and a bundle named
 * `CUHelper.app`. `driverNode` and `driverEntry` are required (the helper requires them whenever it checks its peer);
 * `enforceBoundary` (boolean) and `lockPath` (only with `enforceBoundary`) add the pre-grant boundary flags.
 * `heldMarkerPath` adds `--held-marker <abs path>`: where the helper keeps its held-keys marker (CU-64 G1). A live helper
 * defaults to the owner's `~/.computer-use/helper/held-keys.json`; a check under a private CU_HOME names its own, so
 * it never reads or writes the owner's directory, and its next run finds the marker the killed one left (CU-94).
 */
export function helperOpenArgs({ bundlePath, socketPath, tokenPath, driverNode, driverEntry, enforceBoundary = false, lockPath, heldMarkerPath } = {}) {
  checkPath(bundlePath, 'bundlePath')
  checkPath(socketPath, 'socketPath')
  checkPath(tokenPath, 'tokenPath')
  checkPath(driverNode, 'driverNode')
  checkPath(driverEntry, 'driverEntry')
  if (basename(bundlePath) !== BUNDLE_NAME) throw invalid(`the helper bundle must be ${BUNDLE_NAME}`)
  if (typeof enforceBoundary !== 'boolean') throw invalid('enforceBoundary is true or false')
  if (lockPath !== undefined) {
    if (!enforceBoundary) throw invalid('lockPath goes with enforceBoundary: the helper honours --lock-path only for an enforced boundary')
    checkPath(lockPath, 'lockPath')
  }
  if (heldMarkerPath !== undefined) checkPath(heldMarkerPath, 'heldMarkerPath')
  return [
    '-g', '-n', '-a', bundlePath, '--args', '--socket', socketPath, '--token-file', tokenPath, '--driver-node', driverNode, '--driver-entry', driverEntry,
    ...(enforceBoundary ? ['--enforce-boundary', ...(lockPath !== undefined ? ['--lock-path', lockPath] : [])] : []),
    ...(heldMarkerPath !== undefined ? ['--held-marker', heldMarkerPath] : []),
  ]
}

/**
 * The environment `open` runs with: a minimal `PATH` plus `HOME` and `LANG`. LaunchServices gives the helper its own
 * environment anyway; this only keeps host variables (keys, tokens) away from `open` itself. It has nothing to do with
 * the driver's own environment, which the helper reads from the driver process (see the header).
 */
export function openEnv(env = process.env) {
  return { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', ...(env.HOME ? { HOME: env.HOME } : {}), LANG: env.LANG ?? 'en_US.UTF-8' }
}

/**
 * Ask LaunchServices to start the helper. Resolves `{ command, args }` once `open` exits 0; rejects `helper_lost`
 * when it fails or does not finish within `timeoutMs`. The helper's own connection is awaited by the caller.
 * `driverNode` and `driverEntry` default to `driverIdentity()`, this process.
 */
export function launchHelper({ bundlePath, socketPath, tokenPath, driverNode, driverEntry, enforceBoundary, lockPath, heldMarkerPath, spawn = nodeSpawn, timeoutMs = OPEN_TIMEOUT_MS, env = process.env } = {}) {
  let args
  try {
    const self = driverNode === undefined || driverEntry === undefined ? driverIdentity() : null
    args = helperOpenArgs({
      bundlePath, socketPath, tokenPath, driverNode: driverNode ?? self.driverNode, driverEntry: driverEntry ?? self.driverEntry,
      ...(enforceBoundary !== undefined ? { enforceBoundary } : {}), ...(lockPath !== undefined ? { lockPath } : {}),
      ...(heldMarkerPath !== undefined ? { heldMarkerPath } : {}),
    })
  } catch (error) {
    // Always a promise, so a caller handles a refused argument the way it handles a failed open.
    return Promise.reject(error)
  }
  return new Promise((resolve, reject) => {
    let child
    try {
      child = spawn(OPEN_BINARY, args, { stdio: ['ignore', 'ignore', 'pipe'], env: openEnv(env) })
    } catch (error) {
      reject(new EnvironmentError('helper_lost', `the helper could not be launched: ${error?.code ?? 'spawn error'}`))
      return
    }
    let stderr = ''
    child.stderr?.on('data', (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-2000)
    })
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL') } catch { /* already gone */ }
      reject(new EnvironmentError('helper_lost', `open did not launch the helper within ${timeoutMs} ms`))
    }, timeoutMs)
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(new EnvironmentError('helper_lost', `the helper could not be launched: ${error?.code ?? 'spawn error'}`))
    })
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      if (code === 0) resolve({ command: OPEN_BINARY, args })
      // `open` names a missing bundle on stderr; only its first line is kept, without the path.
      else reject(new EnvironmentError('helper_lost', `open could not launch the helper (code ${String(code)}, signal ${String(signal)})`, { stderr: stderr.split('\n')[0].replace(/\/\S+/g, '<path>') }))
    })
  })
}
