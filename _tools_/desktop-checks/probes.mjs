import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { promisify } from 'node:util'

/**
 * Read-only probes for the desktop live checks (CU-94). None posts input, captures the screen or needs a grant: each
 * reads one fact the check must know before or after it acts, and each takes an `exec` seam so the check's logic is
 * tested without a Mac.
 */

const execFileP = promisify(execFile)

/** kCGEventFlagMaskShift: the Shift bit of a CGEventFlags value. */
export const SHIFT_MASK = 0x0002_0000

/** kCGEventSourceStateCombinedSessionState: the modifier state of the whole login session, the owner's included. */
const COMBINED_SESSION_STATE = 0

/**
 * The session's modifier flags (CGEventSourceFlagsState), read through JXA: osascript -l JavaScript bridges the
 * CoreGraphics call with no input posted and nothing captured. Shift held by a dead helper shows here, which is
 * what the G1 check must prove before and after the next helper's release.
 */
export async function sessionFlags({ exec = execFileP } = {}) {
  const script = `ObjC.import('CoreGraphics'); $.CGEventSourceFlagsState(${COMBINED_SESSION_STATE})`
  const { stdout } = await exec('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script], { timeout: 5000 })
  const flags = Number(String(stdout).trim())
  if (!Number.isFinite(flags) || flags < 0) throw new Error(`the modifier-flags probe answered ${JSON.stringify(String(stdout).trim())}`)
  return flags
}

/** Whether a CGEventFlags value has Shift down. */
export function shiftDown(flags) {
  return (Number(flags) & SHIFT_MASK) !== 0
}

/**
 * Seconds since the last HID event (keyboard, pointer), from IOHIDSystem's HIDIdleTime (nanoseconds). The owner-away
 * guard: the check holds the session's Shift, so it starts only when nobody has touched the Mac for a while.
 */
export async function hidIdleSeconds({ exec = execFileP } = {}) {
  const { stdout } = await exec('/usr/sbin/ioreg', ['-c', 'IOHIDSystem', '-d', '4'], { timeout: 5000, maxBuffer: 4 * 1024 * 1024 })
  const match = /"HIDIdleTime"\s*=\s*(\d+)/.exec(String(stdout))
  if (match === null) throw new Error('the idle probe found no HIDIdleTime')
  return Number(match[1]) / 1e9
}

/**
 * `{ pid, comm, args }` for a process, or null when there is none: three separate ps reads of the same pid (comm is
 * the executable's full path on macOS; args the whole command line, wide). The G1 kill compares comm whole and takes
 * the value after `--socket` as a whole argument, never a substring of args (cu-verifier's conditions).
 */
export async function processInfo(pid, { exec = execFileP } = {}) {
  if (!Number.isInteger(pid) || pid <= 1) return null
  const read = async (field) => String((await exec('/bin/ps', ['-ww', '-o', `${field}=`, '-p', String(pid)], { timeout: 5000 })).stdout).trim()
  try {
    const [shown, comm, args] = [await read('pid'), await read('comm'), await read('args')]
    if (shown === '' || comm === '') return null
    return { pid: Number(shown), comm, args }
  } catch {
    return null
  }
}

/** The CFBundleShortVersionString of an installed bundle (plutil, read only), or null. */
export async function bundleVersion(bundlePath, { exec = execFileP } = {}) {
  try {
    const { stdout } = await exec('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', `${bundlePath}/Contents/Info.plist`], { timeout: 5000 })
    const version = String(stdout).trim()
    return version === '' ? null : version
  } catch {
    return null
  }
}

/**
 * How many normal-layer windows a process has on screen (CGWindowListCopyWindowInfo through JXA: owner pids and
 * layers only, no titles, nothing captured). A desktop run captures only its apps' windows, so a check refuses before
 * any input when CU Fixture shows none (cu-verifier: a capture with nothing to include fails at once).
 */
export async function onScreenWindows(pid, { exec = execFileP } = {}) {
  if (!Number.isInteger(pid) || pid <= 1) return 0
  const script = `ObjC.import('CoreGraphics'); const list = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo(1 | 16, 0))); JSON.stringify(list.filter((w) => w.kCGWindowOwnerPID === ${pid} && w.kCGWindowLayer === 0).length)`
  const { stdout } = await exec('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script], { timeout: 5000 })
  const count = Number(String(stdout).trim())
  return Number.isInteger(count) && count >= 0 ? count : 0
}

/** The held-keys marker under the check's private CU_HOME (never the owner's): its parsed JSON, or null when absent. */
export function readMarker(path, { read = readFileSync } = {}) {
  try {
    return JSON.parse(read(path, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    return { unreadable: String(error?.message ?? error).slice(0, 200) }
  }
}
