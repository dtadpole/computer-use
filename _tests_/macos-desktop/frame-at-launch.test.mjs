import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { displayFrame } from '../../_environments_/macos-desktop/coords.mjs'
import { launchDesktopEnvironment } from '../../_environments_/macos-desktop/environment.mjs'
import { EnvironmentError } from '../../_environments_/macos-desktop/errors.mjs'
import { logged, pause, scratchLocks, stdioLink, stopFake } from './harness.mjs'

/**
 * The frame is known at launch, with nothing captured: agent core writes `environment.frame` into run.json's header,
 * and the run's first `addApp` (P11) is still to come. The launch fits the hello's main display to the adapter's
 * limits as a capture would be fitted; the first app's join confirms it - the display the scope reply names and the
 * first capture must match it - or refuses `display_changed` with the scope left empty (capture-and-scaling.md: one
 * display per run, the frame fixed for the run). All on the fake helper.
 */

const code = (expected) => (error) => error instanceof EnvironmentError && error.code === expected
const noScope = (error) => code('out_of_scope')(error) && error.details?.reason === 'no_scope'
const FIXTURE = 'com.example.fixture'
const SEAT = 'cu-developer-two'
const locks = scratchLocks()
after(() => locks.remove())

/** Launch on a fake without approving anything; `child` is the fake, with its request log. */
async function launchBare(config = {}, options = {}) {
  let child = null
  const connect = async () => {
    const started = await stdioLink(config)
    child = started.child
    return started.link
  }
  try {
    const env = await launchDesktopEnvironment({ apps: [FIXTURE], seat: SEAT, runLock: locks.next(), connect, ...options })
    return { env, child }
  } catch (error) {
    if (child !== null) await stopFake(child)
    throw error
  }
}

const types = (child) => child.requests.map((r) => r.type)
const geometry = (frame) => ({
  width: frame.width, height: frame.height, scale: frame.scale, scaleX: frame.scaleX, scaleY: frame.scaleY,
  originPt: { ...frame.originPt }, sizePt: { ...frame.sizePt }, devicePixelRatio: frame.devicePixelRatio, display: frame.display,
})

/** A side display listed first, and the main one: a Retina 1440x900 at origin 0,0. */
const SIDE = { id: 3, main: false, originPt: { x: -1280, y: 0 }, sizePt: { width: 1280, height: 1024 }, scale: 1 }
const MAIN = { id: 5, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 1440, height: 900 }, scale: 2 }
const ON_MAIN = [{ bundleId: FIXTURE, pid: 501, rect: { x: 0, y: 0, width: 1440, height: 900 } }]

test('right after launch the frame is the main display fitted to the limits, and no capture was sent; the first addApp keeps it unchanged', async () => {
  const limits = { maxLongEdge: 1280 }
  const { env, child } = await launchBare({ displays: [SIDE, MAIN], apps: ON_MAIN, scopeDisplay: 5 }, { frame: limits })
  try {
    // 1440 points at most 1280 pixels wide: 8/9 of a pixel per point, below the display's own 2.
    assert.deepEqual(geometry(env.frame), {
      width: 1280, height: 800, scale: 1280 / 1440, scaleX: 1280 / 1440, scaleY: 800 / 900,
      originPt: { x: 0, y: 0 }, sizePt: { width: 1440, height: 900 }, devicePixelRatio: 2, display: 5,
    })
    assert.deepEqual(env.frame, displayFrame(MAIN, limits), 'the fit coords.mjs gives a capture of that display')
    assert.equal(Object.isFrozen(env.frame), true)
    await logged(child, 1)
    await pause(20)
    assert.deepEqual(types(child), ['pauseOnLocalInput'], 'no scope and no capture before an approved app joins')
    // Known is not confirmed: the members that capture, inspect or post still wait for the first addApp (P11).
    await assert.rejects(env.screenshot(), noScope)
    assert.throws(() => env.planBatch([{ type: 'move', x: 1, y: 1 }]), noScope)

    const frame = env.frame
    assert.deepEqual(await env.addApp(FIXTURE), [FIXTURE])
    assert.equal(env.frame, frame, 'the same frame object: confirmed, not replaced')
    await logged(child, 3)
    assert.deepEqual(types(child), ['pauseOnLocalInput', 'scope', 'capture'])
    assert.deepEqual([child.requests[2].display, child.requests[2].maxSize], [5, { width: 1280, height: 800 }], 'the first capture asks for the frame itself')
    const shot = await env.screenshot()
    assert.deepEqual([shot.width, shot.height], [1280, 800])
    assert.equal(env.frame, frame)
    // A click at frame (640, 400) lands at the display's centre point.
    const effect = await env.perform({ type: 'click', x: 640, y: 400, button: 'left' })
    assert.deepEqual(effect.mapping, { frameScaleX: 1280 / 1440, frameScaleY: 800 / 900, originPt: { x: 0, y: 0 }, display: 5 })
    await logged(child, 6) // the click's hitTest (D-036), then its input
    assert.deepEqual(child.requests.at(-1).events[0], { kind: 'move', x: 720, y: 450, flags: 0 })
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('opted in, the first app\'s display fixes the frame: a reported display other than the main one re-fits it once, and it then holds (CU-68)', async () => {
  const main = { id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 800, height: 600 }, scale: 1 }
  const side = { id: 2, main: false, originPt: { x: -1024, y: 0 }, sizePt: { width: 1024, height: 768 }, scale: 2 }
  const limits = { maxLongEdge: 1024 }
  const { env, child } = await launchBare({ displays: [main, side], scopeDisplay: 2, apps: [{ bundleId: FIXTURE, pid: 501, rect: { x: -1024, y: 0, width: 1024, height: 768 } }] }, { frame: limits, refitFrameAtFirstApp: true })
  try {
    const guess = env.frame
    assert.deepEqual([guess.display, guess.width, guess.height], [1, 800, 600], 'at launch, the main display: what agent core writes first')
    assert.deepEqual(await env.addApp(FIXTURE), [FIXTURE])
    assert.deepEqual(env.frame, displayFrame(side, limits), 'the frame of the display the scope named')
    assert.deepEqual([env.frame.display, env.frame.originPt, env.frame.devicePixelRatio], [2, { x: -1024, y: 0 }, 2])
    assert.equal(Object.isFrozen(env.frame), true)
    await logged(child, 3)
    assert.deepEqual([child.requests[2].display, child.requests[2].maxSize], [2, { width: env.frame.width, height: env.frame.height }], 'the first capture asks for that display')
    const fixed = env.frame
    const effect = await env.perform({ type: 'click', x: 0, y: 0, button: 'left' })
    assert.equal(effect.mapping.display, 2)
    await logged(child, 5)
    assert.deepEqual(child.requests.at(-1).events[0], { kind: 'move', x: -1024, y: 0, flags: 0 }, 'frame (0, 0) is display 2\'s top-left, left of the main one')
    await env.screenshot()
    assert.equal(env.frame, fixed, 'confirmed once; it never changes after the first capture')
    assert.equal(env.lockFrame(), fixed, 'lockFrame returns the frame to record')
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('another display refuses display_changed when not opted in, after lockFrame() (a model session may hold the launch frame), for a display never listed, or under simulateDisplay (CU-68)', async () => {
  const main = { id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 1920, height: 1080 }, scale: 1 }
  const side = { id: 2, main: false, originPt: { x: 1920, y: 0 }, sizePt: { width: 1024, height: 768 }, scale: 1 }
  const notFixed = /not on the 1920x1080 frame of display 1 this run is fixed to/
  for (const [config, options, why, fixFirst] of [
    [{ displays: [main, side], scopeDisplay: 2 }, {}, notFixed, false], // not opted in: as before CU-68
    [{ displays: [main, side], scopeDisplay: 2 }, { refitFrameAtFirstApp: true }, notFixed, true], // a model may hold the launch frame
    [{ displays: [main, side], scopeDisplay: 7 }, { refitFrameAtFirstApp: true }, /a display the helper never reported/, false],
    [{ displays: [main, side], scopeDisplay: 2 }, { refitFrameAtFirstApp: true, simulateDisplay: { width: 1512, height: 982 } }, /not the display the simulateDisplay region is on/, false],
  ]) {
    const { env, child } = await launchBare(config, options)
    try {
      if (fixFirst) assert.equal(env.lockFrame(), env.frame, 'the launch frame, fixed before any app joined')
      const frame = env.frame
      await assert.rejects(env.addApp(FIXTURE), (e) => code('display_changed')(e) && why.test(e.message) && e.details.frameDisplay === 1)
      assert.deepEqual([env.state().scope, env.apps], [[], []], 'the scope stays unset')
      assert.equal(env.frame, frame, 'the launch frame stands')
      await pause(20)
      assert.deepEqual(types(child), ['pauseOnLocalInput', 'scope'], 'refused on the scope reply, before any capture')
    } finally {
      await env.close()
      await stopFake(child)
    }
  }
})

test('a first capture whose display mode changed since the hello also refuses display_changed, and the scope stays unset', async () => {
  // The fake's quirk widens the display by 100 points from the first capture on.
  const { env, child } = await launchBare({ quirks: { displayChangeAfter: 0 } })
  try {
    const frame = env.frame
    await assert.rejects(env.addApp(FIXTURE), (e) => code('display_changed')(e) && e.details.frameDisplay === 1)
    assert.deepEqual([env.state().scope, env.apps, env.frame], [[], [], frame])
    await assert.rejects(env.focusedElement(), noScope)
    await logged(child, 3)
    assert.deepEqual(types(child), ['pauseOnLocalInput', 'scope', 'capture'])
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('simulateScale 2 fits at the simulated scale at launch, per axis on a fractional fit, and the first capture confirms it', async () => {
  // Without limits: a 400x300 scale-1 display renders at 2, so the frame is 800x600 at two pixels per point.
  const plain = await launchBare({ displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 400, height: 300 }, scale: 1 }] }, { simulateScale: 2 })
  try {
    assert.deepEqual([plain.env.frame.width, plain.env.frame.height, plain.env.frame.scaleX, plain.env.frame.devicePixelRatio], [800, 600, 2, 2])
    await logged(plain.child, 1)
    assert.deepEqual(types(plain.child), ['pauseOnLocalInput'])
  } finally {
    await plain.env.close()
    await stopFake(plain.child)
  }
  // 1000x777 points at 2, capped at a 1500 pixel long edge: 1.5 per point, and the floored height skews the y axis.
  const config = {
    displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 1000, height: 777 }, scale: 1 }],
    apps: [{ bundleId: FIXTURE, pid: 501, rect: { x: 0, y: 0, width: 1000, height: 777 } }],
  }
  const { env, child } = await launchBare(config, { simulateScale: 2, frame: { maxLongEdge: 1500 } })
  try {
    const frame = env.frame
    assert.deepEqual([frame.width, frame.height, frame.scaleX, frame.scaleY, frame.devicePixelRatio], [1500, 1165, 1.5, 1165 / 777, 2])
    await logged(child, 1)
    assert.deepEqual(types(child), ['pauseOnLocalInput'])
    await env.addApp(FIXTURE)
    assert.equal(env.frame, frame)
    await logged(child, 3)
    assert.deepEqual([child.requests[2].simulateScale, child.requests[2].maxSize], [2, { width: 1500, height: 1165 }])
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('a helper that reports no display is refused at launch, resource_refused no_display: nothing armed, scoped or captured', async () => {
  let child = null
  const connect = async () => {
    const started = await stdioLink({ displays: [] })
    child = started.child
    return started.link
  }
  try {
    await assert.rejects(launchDesktopEnvironment({ apps: [FIXTURE], seat: SEAT, runLock: locks.next(), connect }), (e) => code('resource_refused')(e) && e.details.reason === 'no_display')
    await child.exited
    assert.deepEqual(types(child), ['bye'], 'the only request is the goodbye')
  } finally {
    if (child !== null) await stopFake(child)
  }
})

test('simulateDisplay: a laptop-sized region of the main display is the run\'s whole display - frame, captures, mapping, the edge refused (CU-70)', async () => {
  // A 1920x1080 scale-1 display; the run takes its top-left 1512x982 points at scale 2, a 14-inch Retina laptop.
  const main = { id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 1920, height: 1080 }, scale: 1 }
  const limits = { maxLongEdge: 2000 }
  const config = { displays: [main], apps: [{ bundleId: FIXTURE, pid: 501, rect: { x: 0, y: 0, width: 1512, height: 982 } }] }
  const { env, child } = await launchBare(config, { simulateScale: 2, simulateDisplay: { width: 1512, height: 982 }, frame: limits })
  try {
    const frame = env.frame
    assert.deepEqual(frame, displayFrame({ ...main, sizePt: { width: 1512, height: 982 } }, limits, 2), 'the region fitted at the simulated scale')
    assert.deepEqual([frame.width, frame.devicePixelRatio, frame.sizePt, frame.originPt], [2000, 2, { width: 1512, height: 982 }, { x: 0, y: 0 }])
    await env.addApp(FIXTURE)
    assert.equal(env.frame, frame, 'the region capture confirms the frame')
    await logged(child, 3)
    const region = { x: 0, y: 0, width: 1512, height: 982 }
    assert.deepEqual([child.requests[2].region, child.requests[2].simulateScale, child.requests[2].maxSize], [region, 2, { width: frame.width, height: frame.height }])
    const shot = await env.screenshot()
    assert.deepEqual([shot.width, shot.height], [frame.width, frame.height])
    assert.deepEqual(child.requests.at(-1).region, region, 'every full capture asks for the region')
    const inside = await env.perform({ type: 'click', x: frame.width - 1, y: frame.height - 1, button: 'left' })
    assert.equal(inside.mapping.display, 1)
    await logged(child, 6)
    const move = child.requests.at(-1).events[0]
    assert.ok(move.x < 1512 && move.y < 982, `the frame's last pixel lands inside the region (${move.x}, ${move.y})`)
    const posted = child.requests.filter((r) => r.type === 'input').length
    await assert.rejects(env.perform({ type: 'click', x: frame.width, y: 10, button: 'left' }), code('invalid_argument'))
    assert.equal(child.requests.filter((r) => r.type === 'input').length, posted, 'a point past the region posts nothing')
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('refitFrameAtFirstApp must be a boolean (CU-68)', async () => {
  await assert.rejects(launchDesktopEnvironment({ apps: [FIXTURE], seat: SEAT, runLock: locks.next(), connect: async () => assert.fail('nothing connects'), refitFrameAtFirstApp: 'yes' }),
    (e) => code('invalid_argument')(e) && e.details?.field === 'refitFrameAtFirstApp')
})

test('simulateDisplay: refused when malformed, and at launch when larger than the display (CU-70)', async () => {
  for (const simulateDisplay of [null, { width: 1512 }, { width: '1512', height: 982 }, { width: 100, height: 900 }, { width: 1512.5, height: 982 }]) {
    await assert.rejects(launchDesktopEnvironment({ apps: [FIXTURE], seat: SEAT, runLock: locks.next(), connect: async () => assert.fail('nothing connects'), simulateDisplay }),
      (e) => code('invalid_argument')(e) && e.details?.field === 'simulateDisplay', JSON.stringify(simulateDisplay))
  }
  let child = null
  const connect = async () => {
    const started = await stdioLink({ displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 1440, height: 900 }, scale: 2 }] })
    child = started.child
    return started.link
  }
  try {
    await assert.rejects(launchDesktopEnvironment({ apps: [FIXTURE], seat: SEAT, runLock: locks.next(), connect, simulateDisplay: { width: 1512, height: 982 } }),
      (e) => code('invalid_argument')(e) && e.details?.field === 'simulateDisplay' && /does not fit display 1 \(1440x900 points\)/.test(e.message))
    await child.exited
    assert.deepEqual(types(child), ['bye'], 'nothing armed, scoped or captured')
  } finally {
    if (child !== null) await stopFake(child)
  }
})

test('simulateDisplay: the live view watches the run\'s region as captures do; an older helper without watch.region falls back to the whole display (CU-83)', async () => {
  const main = { id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 1920, height: 1080 }, scale: 1 }
  const config = { displays: [main], apps: [{ bundleId: FIXTURE, pid: 501, rect: { x: 0, y: 0, width: 1512, height: 982 } }] }
  const region = { x: 0, y: 0, width: 1512, height: 982 }
  const watched = async (quirks, options) => {
    const { env, child } = await launchBare({ ...config, quirks }, options)
    try {
      await env.addApp(FIXTURE)
      const frames = []
      const stop = await env.startScreencast({ onFrame: (frame) => frames.push(frame), fps: 5 })
      for (const deadline = Date.now() + 2000; frames.length === 0 && Date.now() < deadline;) await pause(10)
      await stop()
      return { watches: child.requests.filter((r) => r.type === 'watch'), frames: frames.length, lost: env.link.lost }
    } finally {
      await env.close()
      await stopFake(child)
    }
  }
  const seam = { simulateScale: 2, simulateDisplay: { width: 1512, height: 982 }, frame: { maxLongEdge: 2000 } }
  const current = await watched({}, seam)
  assert.deepEqual(current.watches.map((w) => w.region ?? null), [region], 'one watch, asking for the region')
  assert.ok(current.frames > 0, 'frames reach the viewer')
  const older = await watched({ watchNoRegion: true }, seam)
  assert.deepEqual(older.watches.map((w) => w.region ?? null), [region, null], 'refused unknown_field region, then today\'s watch')
  assert.ok(older.frames > 0, 'the live view still works on an older helper')
  assert.equal(older.lost, false, 'an unknown field ends nothing')
  // A helper that knows region and refuses the value is an error to see, never a silent whole-display watch.
  const refused = await launchBare({ ...config, quirks: { watchRegionRefused: true } }, seam)
  try {
    await refused.env.addApp(FIXTURE)
    await assert.rejects(refused.env.startScreencast({ onFrame: () => {}, fps: 5 }), (e) => code('invalid_argument')(e) && e.details?.field === 'region' && e.details?.reason === 'invalid_argument')
    assert.equal(refused.child.requests.filter((r) => r.type === 'watch').length, 1, 'no fallback for a refused value')
  } finally {
    await refused.env.close()
    await stopFake(refused.child)
  }
  const plain = await watched({}, {})
  assert.deepEqual(plain.watches.map((w) => Object.hasOwn(w, 'region')), [false], 'without the seam the watch is as before')
})

test('CU-133: the cursor answer under a simulated region and scale - inside is the frame pixel the screenshot shows, the last point column stays inside the frame, past the region or on another display is offFrame', async () => {
  // CU-70's laptop region: the top-left 1512x982 points of a 1920x1080 display at a simulated scale 2 (frame 2000 px wide).
  const main = { id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 1920, height: 1080 }, scale: 1 }
  const side = { id: 2, main: false, originPt: { x: 1920, y: 0 }, sizePt: { width: 1280, height: 800 }, scale: 1 }
  const ask = async (cursor) => {
    const config = { displays: [main, side], cursor, apps: [{ bundleId: FIXTURE, pid: 501, rect: { x: 0, y: 0, width: 1512, height: 982 } }] }
    const { env, child } = await launchBare(config, { simulateScale: 2, simulateDisplay: { width: 1512, height: 982 }, frame: { maxLongEdge: 2000 } })
    try {
      await env.addApp(FIXTURE)
      const effect = await env.perform({ type: 'cursor_position' })
      return { effect, frame: env.frame }
    } finally {
      await env.close()
      await stopFake(child)
    }
  }
  // Inside: the point scaled into frame pixels, as the screenshot shows it.
  const { effect: inside, frame } = await ask({ xPt: 756, yPt: 491, display: 1 })
  assert.equal(frame.width, 2000)
  assert.deepEqual(inside.cursor, { x: Math.round(756 * frame.width / 1512), y: Math.round(491 * frame.height / 982) })
  assert.equal(inside.source, 'helper')
  // The region's last point column and row: still a pixel of the frame (never frame.width, which a click refuses).
  const { effect: edge } = await ask({ xPt: 1511.9, yPt: 981.9, display: 1 })
  assert.deepEqual(edge.cursor, { x: frame.width - 1, y: frame.height - 1 }, `the last pixel, not past it: ${JSON.stringify(edge.cursor)}`)
  // Just past the region (on the same display) and on another display: off the frame, no coordinates.
  // The last one names another display for points inside the region (a mirrored display shares them): not the
  // screenshot's display, so no coordinates either.
  for (const cursor of [{ xPt: 1512, yPt: 500, display: 1 }, { xPt: 700, yPt: 982, display: 1 }, { xPt: 2000, yPt: 100, display: 2 }, { xPt: 700, yPt: 500, display: 2 }]) {
    const { effect } = await ask(cursor)
    assert.deepEqual([effect.cursor, effect.offFrame], [null, true], JSON.stringify(cursor))
  }
})
