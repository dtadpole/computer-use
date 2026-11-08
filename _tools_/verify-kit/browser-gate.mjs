/**
 * The Mac's limits for a check that starts Chrome (decision D-005): start only when `memory_pressure`
 * reports at least 25 percent free, use a throwaway profile under `/tmp/<seat>-chrome-*` (seat keys begin
 * `cu-`, so every profile sits under D-005's `/tmp/cu-*`; path from the M1 layout 0.2), and remove it
 * after the run. A check that cannot pass the gate is unjudged (exit 3), never a pass.
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

import { stopChrome } from '../../_vendor_/browser-use/chrome.mjs'

/** The free-memory floor, in percent, below which no [cu] seat starts a browser. */
export const MIN_FREE_PERCENT = 25

/** The prefix every [cu] throwaway browser profile carries: seat keys begin `cu-`. */
export const PROFILE_PREFIX = '/tmp/cu-'

/**
 * The floor to use: `CU_MIN_FREE_PERCENT` may raise it (to prove a check reports unjudged when the gate
 * is closed) but never lower it below D-005's 25 percent.
 */
export function floorFromEnv(env = process.env) {
  const asked = Number(env.CU_MIN_FREE_PERCENT)
  return Number.isFinite(asked) && asked > MIN_FREE_PERCENT ? asked : MIN_FREE_PERCENT
}

/** The free percentage in `memory_pressure` output, or `null` when the line is absent. */
export function parseMemoryFree(text) {
  const match = /System-wide memory free percentage:\s*(\d{1,3})%/.exec(String(text ?? ''))
  if (!match) return null
  const value = Number(match[1])
  return value >= 0 && value <= 100 ? value : null
}

/** Run macOS `memory_pressure` and return its output. */
export function readMemoryPressure() {
  return execFileSync('memory_pressure', [], { encoding: 'utf8', timeout: 15_000 })
}

/**
 * Whether a browser may start now: `{ ok, freePercent, reason }`. An unreadable reading is not ok,
 * because the gate exists to protect a shared machine.
 */
export function memoryGate({ minFreePercent = floorFromEnv(), read = readMemoryPressure } = {}) {
  let text
  try {
    text = read()
  } catch (error) {
    return { ok: false, freePercent: null, reason: `memory_pressure could not run: ${error.message}` }
  }
  const freePercent = parseMemoryFree(text)
  if (freePercent === null) return { ok: false, freePercent, reason: 'memory_pressure printed no free percentage' }
  if (freePercent < minFreePercent) return { ok: false, freePercent, reason: `memory ${freePercent}% free, below the ${minFreePercent}% floor (D-005)` }
  return { ok: true, freePercent, reason: `memory ${freePercent}% free` }
}

/** Whether `path` is a [cu] throwaway profile this kit may delete. */
export function isThrowawayProfile(path) {
  if (typeof path !== 'string') return false
  const absolute = resolve(path)
  return absolute === path && absolute.startsWith(PROFILE_PREFIX) && /^\/tmp\/cu-[a-z0-9-]+-chrome-[A-Za-z0-9]{6}$/.test(absolute)
}

/** Make a fresh throwaway profile directory for `seat`, for example `/tmp/cu-verifier-chrome-AbC123`. */
export function throwawayProfile(seat, make = mkdtempSync) {
  if (!/^cu-[a-z0-9-]+$/.test(seat)) throw new Error(`bad seat name ${JSON.stringify(seat)}`)
  return make(`/tmp/${seat}-chrome-`)
}

/** Remove a throwaway profile; refuses any path that is not one, so a bad variable cannot delete elsewhere. */
export function removeThrowawayProfile(path, remove = rmSync) {
  if (!isThrowawayProfile(path)) throw new Error(`refusing to remove ${JSON.stringify(path)}: not a /tmp/<seat>-chrome-XXXXXX profile`)
  remove(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
}

/**
 * Close a browser-use page handle within `timeoutMs`, else stop its Chrome by signal. browser-use's
 * `close()` first awaits every page's setup, which measured 2026-11-01 once held a check's teardown for about
 * 100 s after a tab had gone away; a check must end in bounded time and leave no Chrome behind (D-005).
 * Returns `closed` or `forced`.
 */
export async function closeBrowser(handle, { timeoutMs = 15_000, stop = stopChrome } = {}) {
  if (!handle) return 'closed'
  let timer
  const closed = await Promise.race([
    handle.close().then(() => true, () => false),
    new Promise((resolveTimeout) => {
      timer = setTimeout(() => resolveTimeout(false), timeoutMs)
    }),
  ])
  clearTimeout(timer)
  if (closed) return 'closed'
  await stop(handle.browser?.running)
  return 'forced'
}

