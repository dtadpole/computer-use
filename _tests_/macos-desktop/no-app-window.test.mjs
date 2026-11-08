import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { launchDesktopEnvironment } from '../../_environments_/macos-desktop/environment.mjs'
import { EnvironmentError } from '../../_environments_/macos-desktop/errors.mjs'
import { fakeLauncher, scratchLocks, stopFake } from './harness.mjs'

/**
 * CU-100 (CU-98, design no-app-window.md): with no window of an approved app on screen, helper 0.2.32 replies a blank
 * frame with `windows: []` and `noAppWindow: true`. Until a capture in the run has shown a window, the driver re-takes
 * it for up to the start wait, then ends the run `no_app_window` naming the apps - never helper_lost, and the link
 * stays usable. Once a window has been seen, a blank frame is passed on marked `noAppWindow` (agent core's time bound
 * decides: one counter).
 */

const FIXTURE = 'com.example.fixture'
const locks = scratchLocks()
after(() => locks.remove())
const launchOnFake = fakeLauncher(locks, { apps: [FIXTURE], appWindowWaitMs: 300, appWindowPollMs: 20 })
// The fake's config crosses to its process as JSON, where Infinity would become null: a large count stands for always.
const ALWAYS = 1_000_000
const code = (expected) => (error) => error instanceof EnvironmentError && error.code === expected
const MAIN = { id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 1920, height: 1080 }, scale: 1 }
const world = (extra = {}) => ({ displays: [MAIN], apps: [{ bundleId: FIXTURE, pid: 501, rect: { x: 0, y: 0, width: 1512, height: 982 } }], ...extra })

/**
 * The fake's capture requests so far, once its log has settled: it logs each request on stderr, which can trail the
 * reply on stdout under load, so the count is read when it has not changed for 100 ms (at most 2 s).
 */
async function settledCaptures(child) {
  const count = () => child.requests.filter((r) => r.type === 'capture').length
  let last = count()
  for (const deadline = Date.now() + 2000; Date.now() < deadline;) {
    await new Promise((done) => setTimeout(done, 100))
    if (count() === last) return last
    last = count()
  }
  return last
}

test('no approved window through the start wait: the run ends no_app_window naming the app and the causes - never helper_lost', async () => {
  // The app joins (a blank frame still confirms the frame's geometry); the first screenshot waits, then names the stop.
  const { env, child } = await launchOnFake(world({ quirks: { noAppWindow: ALWAYS } }))
  try {
    const started = Date.now()
    await assert.rejects(env.screenshot(), (error) => {
      assert.ok(code('no_app_window')(error), `${error.code}: ${error.message}`)
      assert.deepEqual(error.details.apps, [FIXTURE])
      assert.match(error.message, /no window of com\.example\.fixture is on screen \(not running, every window closed, minimized or hidden, or on another Space or display\); open it and run again/)
      return true
    })
    assert.ok(Date.now() - started >= 250, 'it waited out the start wait before naming the stop')
    assert.equal(env.link.lost, false, 'the link stays usable')
    // The wait runs once per run: agent core's final screenshot (or any later capture) fails at once, not after another
    // wait - proven by what the driver sends, not by time (CU-229: one capture took 166 ms under load). The second
    // screenshot sends exactly one capture; another wait would re-take it every 20 ms for 300 ms.
    const captures = await settledCaptures(child)
    await assert.rejects(env.screenshot(), (error) => error.code === 'no_app_window')
    assert.equal(await settledCaptures(child), captures + 1, 'the second capture failed after one capture, without waiting again')
  } finally {
    // In finally, so a failing assertion cannot leave the fake helper running (a hung test, not a failed one).
    await env.close()
    await stopFake(child)
  }
})

test('a window that appears within the start wait: the run goes on normally (an app the run just launched)', async () => {
  // CU-290: four captures must fit in the wait; under gate load 300 ms did not hold them. The wait ends at the first
  // window, so a long bound costs nothing when the code is right.
  const { env, child } = await launchOnFake(world({ quirks: { noAppWindow: 3 } }), { appWindowWaitMs: 10_000 })
  try {
    assert.equal(env.link.lost, false)
    const shot = await env.screenshot()
    assert.equal(shot.noAppWindow, undefined, 'a capture with a window carries no flag')
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('after a window was seen, a blank capture is passed on marked noAppWindow: no stop from the driver, the link fine', async () => {
  const { env, child } = await launchOnFake(world({ quirks: { noAppWindowFrom: 3 } }))
  try {
    const first = await env.screenshot()
    assert.equal(first.noAppWindow, undefined)
    const blank = await env.screenshot()
    assert.equal(blank.noAppWindow, true)
    assert.equal(blank.mimeType, 'image/png')
    assert.equal(env.link.lost, false)
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('appWindowWaitMs and appWindowPollMs are whole milliseconds from 1 to 60000', async () => {
  for (const bad of [{ appWindowWaitMs: 0 }, { appWindowWaitMs: 1.5 }, { appWindowPollMs: 60_001 }, { appWindowPollMs: '20' }]) {
    await assert.rejects(launchDesktopEnvironment({ apps: [FIXTURE], seat: 'cu-developer-two', connect: async () => { throw new Error('not reached') }, runLock: locks.next(), ...bad }), code('invalid_argument'), JSON.stringify(bad))
  }
})

test('an older helper\'s exact empty-filter refusal maps to no_app_window only with the scope reply\'s evidence of no window', async () => {
  const lostOrNamed = async (config) => {
    try {
      const { env, child } = await launchOnFake(config)
      await env.close()
      await stopFake(child)
      return 'launched'
    } catch (error) {
      return error.code
    }
  }
  // No approved app running (scope reply running: []): mapped.
  assert.equal(await lostOrNamed({ displays: [MAIN], apps: [], quirks: { captureNoImage: 1 } }), 'no_app_window')
  // Running, but no focused window (display null) while the helper has Accessibility: mapped.
  assert.equal(await lostOrNamed(world({ quirks: { captureNoImage: 1 } })), 'no_app_window')
  // Running with a window on a display: the same words are some other capture failure, so it stays helper_lost.
  assert.equal(await lostOrNamed(world({ scopeDisplay: 1, quirks: { captureNoImage: 1 } })), 'helper_lost')
  // display null without the Accessibility grant says nothing about windows: no evidence, helper_lost. (false, not
  // null: a hello without a boolean accessibility grant is refused outright, which would test nothing here.)
  assert.equal(await lostOrNamed(world({ grants: { accessibility: false }, quirks: { captureNoImage: 1 } })), 'helper_lost')
  // Another capture failure at a first capture with nothing running stays helper_lost with its own words: a real
  // encoding failure is never reported as 'open the app' (cu-verifier: evidence alone must not map).
  await assert.rejects(launchOnFake({ displays: [MAIN], apps: [], quirks: { captureNoImage: 1, captureFailMessage: 'the capture could not be encoded' } }),
    (error) => code('helper_lost')(error) && /\(failed: the capture could not be encoded\)/.test(error.message))
  // Without the grant, an empty running list alone is the evidence: mapped.
  assert.equal(await lostOrNamed({ displays: [MAIN], apps: [], grants: { accessibility: false }, quirks: { captureNoImage: 1 } }), 'no_app_window')
})

test('the same refusal after a window was seen in the run stays helper_lost (no first-capture context)', async () => {
  const { env, child } = await launchOnFake(world({ quirks: { captureNoImage: 3 } }))
  try {
    await env.screenshot()
    await assert.rejects(env.screenshot(), code('helper_lost'))
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('the driver\'s state says noAppWindow for the live view: false after a window, true after a blank capture', async () => {
  const { env, child } = await launchOnFake(world({ quirks: { noAppWindowFrom: 3 } }))
  try {
    await env.screenshot()
    assert.equal(env.state().noAppWindow, false)
    await env.screenshot()
    assert.equal(env.state().noAppWindow, true)
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('watch frames keep the state current between captures: a blank frame sets noAppWindow, a later frame with a window clears it', async () => {
  // Between captures (a run waiting on the model) only watch frames can turn the live view's notice on or off.
  const { env, child } = await launchOnFake(world({ quirks: { frameNoAppWindowFor: 10 } }))
  try {
    const until = async (want) => {
      const started = Date.now()
      while (Date.now() - started < 3000) {
        if (env.state().noAppWindow === want) return true
        await new Promise((done) => setTimeout(done, 5))
      }
      return false
    }
    const stop = await env.startScreencast({ onFrame: () => {} })
    assert.equal(await until(true), true, 'a blank watch frame set the flag')
    assert.equal(await until(false), true, 'a later frame with a window cleared it')
    if (typeof stop === 'function') await stop()
  } finally {
    await env.close()
    await stopFake(child)
  }
})
