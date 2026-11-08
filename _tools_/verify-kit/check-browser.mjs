/**
 * The one way a [cu] check starts and stops its Chrome, in the order D-014 sets: Chrome present, a throwaway
 * profile, a registry slot (two browsers for the team, one per seat), the memory floor (D-005), then the
 * launch; downloads are denied. Any refusal returns `ready: false` with the reason, so the check reports
 * unjudged (exit 3) - never a pass - and whatever was taken is given back.
 */

import { browserAvailable, openPage } from '../../_vendor_/browser-use/lib.mjs'
import { closeBrowser, memoryGate, removeThrowawayProfile, throwawayProfile } from './browser-gate.mjs'
import { registerBrowser } from './browser-registry.mjs'
import { denyDownloads } from './plan-runner.mjs'
import { verifySeat } from './seat.mjs'

/**
 * Start a check browser. Resolves to `{ ready: true, handle, profile, slot }` or `{ ready: false, reason }`.
 * Dependencies are injectable for tests.
 */
export async function startCheckBrowser({
  seat = verifySeat(),
  width = 1024,
  height = 768,
  available = browserAvailable,
  makeProfile = throwawayProfile,
  removeProfile = removeThrowawayProfile,
  register = registerBrowser,
  gate = memoryGate,
  open = openPage,
  deny = denyDownloads,
} = {}) {
  if (!available()) return { ready: false, reason: 'no Chrome or Chromium on this machine' }
  const profile = makeProfile(seat)
  const registered = await register({ seat, profile })
  if (!registered.ok) {
    removeProfile(profile)
    return { ready: false, reason: `browser registry refused (${registered.reason}): ${registered.message}` }
  }
  const memory = gate()
  if (!memory.ok) {
    registered.slot.release()
    removeProfile(profile)
    return { ready: false, reason: memory.reason }
  }
  let handle
  try {
    handle = await open({ profile, width, height })
    const chromePid = handle.browser?.running?.child?.pid
    if (chromePid) registered.slot.setChromePid(chromePid)
    await deny(handle)
  } catch (error) {
    if (handle) await closeBrowser(handle)
    registered.slot.release()
    removeProfile(profile)
    throw error
  }
  return { ready: true, handle, profile, slot: registered.slot }
}

/** Stop what `startCheckBrowser` started: close (bounded), remove the profile, release the slot. */
export async function stopCheckBrowser(started, { close = closeBrowser, removeProfile = removeThrowawayProfile } = {}) {
  if (!started?.ready) return
  try {
    await close(started.handle)
  } finally {
    try {
      removeProfile(started.profile)
    } finally {
      started.slot.release()
    }
  }
}
