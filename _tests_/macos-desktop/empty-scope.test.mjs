import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { createExclusions } from '../../_tools_/agent-core/exclusions.mjs'
import { launchDesktopEnvironment, noScopeRefusal } from '../../_environments_/macos-desktop/environment.mjs'
import { EnvironmentError } from '../../_environments_/macos-desktop/errors.mjs'
import { approveApps, logged, pause, quiet, scratchLocks, stdioLink, stopFake } from './harness.mjs'

/**
 * P11, design 0.3.4 (app-policy.md): the helper launches with an empty scope. The caller's `apps` are candidates
 * only; nothing is put in scope and nothing is captured until a person approves an app and agent core adds it with
 * `addApp`, the first one confirming the frame known since launch (`frame-at-launch.test.mjs`). Before that every
 * member that would capture, inspect or post is refused by name - `out_of_scope`, reason `no_scope`, the helper's own
 * code - and sends nothing. All on the fake helper.
 */

const code = (expected) => (error) => error instanceof EnvironmentError && error.code === expected
const noScope = (error) => code('out_of_scope')(error) && error.details?.reason === 'no_scope'
const FIXTURE = 'com.example.fixture'
const SEAT = 'cu-developer-two'
const locks = scratchLocks()
after(() => locks.remove())

/** Launch on a fake without approving anything; `child` is the fake, with its request log. */
async function launchEmpty(config = {}, options = {}) {
  let child = null
  const connect = async () => {
    const started = await stdioLink(config)
    child = started.child
    return started.link
  }
  try {
    const env = await launchDesktopEnvironment({ seat: SEAT, runLock: locks.next(), connect, ...options })
    return { env, child }
  } catch (error) {
    if (child !== null) await stopFake(child)
    throw error
  }
}

const types = (child) => child.requests.map((r) => r.type)

test('launch with apps: [] or with candidates sends no scope and captures nothing; only the local-input pause is armed', async () => {
  for (const options of [{ apps: [] }, {}, { apps: [FIXTURE, 'com.example.other'] }]) {
    const { env, child } = await launchEmpty({}, options)
    try {
      await logged(child, 1)
      await pause(20)
      assert.deepEqual(types(child), ['pauseOnLocalInput'], JSON.stringify(options))
      // The frame is known from the hello alone (the fake's one 800x600 display at scale 1), with nothing captured.
      assert.deepEqual([env.frame.width, env.frame.height, env.frame.display], [800, 600, 1], 'the frame from the hello, no capture')
      assert.equal(env.pauseArmed, true)
      assert.deepEqual(env.candidates, options.apps ?? [])
      assert.deepEqual(env.apps, [], 'nothing asked of the helper yet')
      const state = env.state()
      assert.deepEqual([state.scope, state.url, state.frontmostBundleId, state.pauseArmed], [[], 'app:', null, true])
    } finally {
      await env.close()
      await stopFake(child)
    }
  }
})

test('before any addApp every member that captures, inspects or posts is refused no_scope, and nothing reaches the helper', async () => {
  const { env, child } = await launchEmpty({ screenText: 'secret text' }, { apps: [FIXTURE] })
  try {
    await logged(child, 1)
    const refusal = noScopeRefusal()
    assert.deepEqual([refusal.code, refusal.details], ['out_of_scope', { reason: 'no_scope' }])
    assert.match(refusal.message, /approves an app/)
    await assert.rejects(env.screenshot(), noScope)
    await assert.rejects(env.screenshot({ region: [0, 0, 10, 10] }), noScope)
    for (const action of [
      { type: 'click', x: 1, y: 1, button: 'left' }, { type: 'move', x: 1, y: 1 }, { type: 'keypress', keys: ['ENTER'] },
      { type: 'type', text: 'x' }, { type: 'wait', duration_ms: 1 }, { type: 'screenshot' }, { type: 'cursor_position' },
    ]) {
      await assert.rejects(env.perform(action), noScope, action.type)
    }
    assert.throws(() => env.planBatch([{ type: 'click', x: 1, y: 1, button: 'left' }]), noScope)
    await assert.rejects(env.inspectPoint({ x: 1, y: 1 }), noScope)
    await assert.rejects(env.focusedElement(), noScope)
    await assert.rejects(env.menuItemForChord({ type: 'keypress', keys: ['META', 'SHIFT', 'D'] }), noScope)
    await assert.rejects(env.selectedItems(), noScope)
    await assert.rejects(env.pageText(), noScope)
    await pause(20)
    assert.deepEqual(types(child), ['pauseOnLocalInput'], 'not one request: no capture, hit test, text or input')
    // Run-state refusals keep their own codes: a closed environment is closed, whatever its scope.
    await env.close()
    await assert.rejects(env.screenshot(), code('closed'))
    assert.throws(() => env.planBatch([{ type: 'move', x: 1, y: 1 }]), code('closed'))
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('the first addApp sends the scope and confirms the frame with the first capture; then the run works as before', async () => {
  const config = { displays: [{ id: 9, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 400, height: 300 }, scale: 2 }], scopeDisplay: 9 }
  const { env, child } = await launchEmpty({ ...config, apps: [{ bundleId: FIXTURE, pid: 501, rect: { x: 0, y: 0, width: 400, height: 300 } }] }, { apps: [FIXTURE], frame: { maxLongEdge: 2576 } })
  try {
    assert.deepEqual(await env.addApp(FIXTURE), [FIXTURE])
    await logged(child, 3)
    assert.deepEqual(types(child), ['pauseOnLocalInput', 'scope', 'capture'])
    assert.deepEqual(child.requests[1].bundleIds, [FIXTURE])
    assert.deepEqual([child.requests[2].display, child.requests[2].maxSize], [9, { width: 800, height: 600 }], 'the display the scope reply named')
    assert.deepEqual([env.frame.width, env.frame.height, env.frame.display], [800, 600, 9])
    assert.deepEqual([env.state().scope, env.apps, env.state().frontmostBundleId], [[FIXTURE], [FIXTURE], FIXTURE])
    const shot = await env.screenshot()
    assert.deepEqual([shot.width, shot.height], [800, 600])
    await env.perform({ type: 'click', x: 10, y: 10, button: 'left' })
    assert.deepEqual(env.planBatch([{ type: 'move', x: 1, y: 1 }]), { ok: true, steps: [1] })
    // An app already in scope sends nothing more, and the frame is not taken twice. The fake's request log can lag
    // the click's reply under load (flake reported by cu-integrator), so let it settle before taking the count.
    await quiet(child)
    assert.ok(types(child).includes('input'), 'the click reached the helper')
    const count = child.requests.length
    assert.deepEqual(await env.addApp(FIXTURE), [FIXTURE])
    await pause(20)
    assert.equal(child.requests.length, count)
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('candidates are not refused at launch, even excluded ones - none is sent; addApp refuses an excluded one by name', async () => {
  const { env, child } = await launchEmpty({}, { apps: [FIXTURE, 'com.1password.1password', 'com.apple.Terminal'], exclusions: createExclusions() })
  try {
    assert.deepEqual(env.candidates, [FIXTURE, 'com.1password.1password', 'com.apple.Terminal'])
    await assert.rejects(env.addApp('com.1password.1password'), (e) => code('blocked_by_policy')(e) && e.details.reason === 'excluded' && e.details.kind === 'password_manager')
    await pause(20)
    assert.deepEqual(types(child), ['pauseOnLocalInput'], 'an excluded candidate never reaches the helper')
    await approveApps(env, [FIXTURE])
    assert.deepEqual(env.state().scope, [FIXTURE])
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('without Screen Recording the launch stops at the hello: nothing scoped, captured or armed, the grant named', async () => {
  let child = null
  const connect = async () => {
    const started = await stdioLink({ grants: { screen: false, accessibility: true } })
    child = started.child
    return started.link
  }
  try {
    await assert.rejects(launchDesktopEnvironment({ apps: [FIXTURE], seat: SEAT, runLock: locks.next(), connect }), (e) => code('not_granted')(e) && e.details.grant === 'screen')
    await child.exited
    assert.deepEqual(types(child), ['bye'], 'the only request is the goodbye')
  } finally {
    if (child !== null) await stopFake(child)
  }
})

test('a first capture that fails leaves the scope empty, so no scope is ever in effect without a frame; addApp may try again', async () => {
  // A helper that puts the app on another display than the frame's: refused before any capture, but the link stands.
  const displays = [
    { id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 800, height: 600 }, scale: 1 },
    { id: 2, main: false, originPt: { x: 800, y: 0 }, sizePt: { width: 1024, height: 768 }, scale: 1 },
  ]
  const { env, child } = await launchEmpty({ displays, scopeDisplay: 2 }, { apps: [FIXTURE] })
  try {
    const frame = env.frame
    await assert.rejects(env.addApp(FIXTURE), code('display_changed'))
    assert.deepEqual([env.state().scope, env.apps, env.frame], [[], [], frame])
    await assert.rejects(env.screenshot(), noScope)
    await assert.rejects(env.addApp(FIXTURE), code('display_changed'))
    await logged(child, 3)
    assert.deepEqual(types(child), ['pauseOnLocalInput', 'scope', 'scope'], 'each try asks the helper again; nothing was captured')
  } finally {
    await env.close()
    await stopFake(child)
  }
  // A capture the driver must refuse ends the link: addApp rejects helper_lost and the scope stays empty here too.
  const broken = await launchEmpty({ quirks: { ignoreSimulateScale: true } }, { simulateScale: 2 })
  try {
    await assert.rejects(broken.env.addApp(FIXTURE), (e) => code('helper_lost')(e) && /simulateScale/.test(e.details.refused))
    assert.deepEqual(broken.env.state().scope, [])
  } finally {
    await broken.env.close()
    await stopFake(broken.child)
  }
})

test('a live viewer registered before any approval gets no frames and sends no watch until the first app joins', async () => {
  const { env, child } = await launchEmpty({}, { apps: [FIXTURE] })
  try {
    const frames = []
    const stop = await env.startScreencast({ onFrame: (frame) => frames.push(frame), fps: 2 })
    await pause(60)
    assert.deepEqual([types(child), frames.length], [['pauseOnLocalInput'], 0], 'watch frames are captures: none before approval')
    await env.addApp(FIXTURE)
    // Poll for the first frame with a bound instead of a fixed pause: under a loaded parallel run the fake's first
    // watch frame (fps 2) can take longer than any short fixed wait (flake reported by cu-integrator).
    for (const deadline = Date.now() + 2_000; frames.length === 0 && Date.now() < deadline;) await pause(20)
    await logged(child, 4)
    assert.deepEqual(types(child).slice(0, 4), ['pauseOnLocalInput', 'scope', 'capture', 'watch'])
    assert.equal(frames.length > 0, true, 'a frame arrives within 2 s of the first approved app')
    await stop()
    await logged(child, 5)
    assert.equal(types(child).at(-1), 'unwatch')
    // A viewer that stops before any approval never watches at all.
    const early = await launchEmpty({}, { apps: [FIXTURE] })
    try {
      const stopEarly = await early.env.startScreencast({ onFrame: () => {}, fps: 1 })
      await stopEarly()
      await early.env.addApp(FIXTURE)
      await pause(20)
      assert.deepEqual(types(early.child), ['pauseOnLocalInput', 'scope', 'capture'])
    } finally {
      await early.env.close()
      await stopFake(early.child)
    }
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('the fake helper has no empty scope request either: bundleIds takes 1 to 32 bundle ids; without a scope, pause and bye still work', async () => {
  const { child, link } = await stdioLink({})
  try {
    for (const bundleIds of [[], ['not a bundle id'], Array.from({ length: 33 }, (_, i) => `com.example.a${i}`), 'com.example.fixture']) {
      await assert.rejects(link.request('scope', { bundleIds }), (e) => code('invalid_argument')(e) && e.details.field === 'bundleIds', JSON.stringify(bundleIds).slice(0, 40))
    }
    assert.deepEqual(await link.request('pauseOnLocalInput', { on: true }), { armed: true, via: ['idleCounter', 'eventTap'] })
    for (const [type, fields] of [['capture', { maxSize: { width: 8, height: 6 } }], ['hitTest', { xPt: 1, yPt: 1 }], ['focused', {}], ['screenText', { maxChars: 5 }], ['watch', { fps: 1 }]]) {
      await assert.rejects(link.request(type, fields), noScope, type)
    }
    await assert.rejects(link.request('input', { events: [{ kind: 'move', x: 1, y: 1, flags: 0 }], mode: 'global' }), noScope)
    // The helper's exclusions match an entry's children in any case, trimmed of nothing it would accept.
    await assert.rejects(link.request('scope', { bundleIds: ['COM.apple.terminal.helper'] }), (e) => code('blocked_by_policy')(e) && e.details.reason === 'excluded')
    assert.deepEqual((await link.request('scope', { bundleIds: [FIXTURE, FIXTURE] })).bundleIds, [FIXTURE], 'deduplicated, as the Swift helper does')
    await link.request('bye', {})
    assert.equal(await child.exited, 0)
  } finally {
    link.close()
    await stopFake(child)
  }
})

test('capture_leak: a capture naming a window of an app outside the scope is dropped before the model sees it (D-035)', async () => {
  // Later captures leak, as helper 0.2.10 did live (step 5): the first, at addApp, is clean.
  const leaky = await launchEmpty({ quirks: { leakWindowOf: { bundleId: 'ai.reflection.cu.ledger', fromCapture: 1 } } }, { apps: [FIXTURE] })
  try {
    await leaky.env.addApp(FIXTURE)
    await assert.rejects(leaky.env.screenshot(), (e) => e.code === 'out_of_scope' && e.details.reason === 'capture_leak' && e.details.bundleId === 'ai.reflection.cu.ledger')
    await assert.rejects(leaky.env.screenshot(), (e) => e.details?.reason === 'capture_leak', 'every leaking capture is dropped, not only the first')
  } finally {
    await leaky.env.close()
    await stopFake(leaky.child)
  }
  // A window with no owner to attribute is a leak too; it even fails the joining capture.
  const ownerless = await launchEmpty({ quirks: { leakWindowOf: { bundleId: null } } }, { apps: [FIXTURE] })
  try {
    await assert.rejects(ownerless.env.addApp(FIXTURE), (e) => e.code === 'out_of_scope' && e.details.reason === 'capture_leak' && e.details.bundleId === null)
  } finally {
    await ownerless.env.close()
    await stopFake(ownerless.child)
  }
  // A clean helper is unaffected: in-scope windows only.
  const clean = await launchEmpty({}, { apps: [FIXTURE] })
  try {
    await clean.env.addApp(FIXTURE)
    const shot = await clean.env.screenshot()
    assert.equal(shot.width > 0 && shot.height > 0, true, 'in-scope windows only: the frame reaches the caller')
  } finally {
    await clean.env.close()
    await stopFake(clean.child)
  }
})

test('watch frames naming a window outside the scope never reach the viewer; frames from an older helper pass (CU-12)', async () => {
  const watchFrames = async (quirks) => {
    const { env, child } = await launchEmpty({ quirks }, { apps: [FIXTURE] })
    try {
      await env.addApp(FIXTURE)
      const frames = []
      const stop = await env.startScreencast({ onFrame: (frame) => frames.push(frame), fps: 2 })
      for (const deadline = Date.now() + 1_500; frames.length === 0 && env.leakedFrames === 0 && Date.now() < deadline;) await pause(20)
      await pause(100)
      await stop()
      return { frames: frames.length, leaked: env.leakedFrames }
    } finally {
      await env.close()
      await stopFake(child)
    }
  }
  const clean = await watchFrames({})
  assert.equal(clean.frames > 0 && clean.leaked === 0, true, 'frames whose windows are all in scope reach the viewer')
  const leaky = await watchFrames({ leakWindowInFrames: { bundleId: 'ai.reflection.cu.ledger' } })
  assert.equal(leaky.frames, 0, 'no leaking frame reaches the viewer')
  assert.equal(leaky.leaked > 0, true)
  const unowned = await watchFrames({ leakWindowInFrames: { bundleId: null } })
  assert.equal([unowned.frames, unowned.leaked > 0].join(), '0,true', 'an unowned window is a leak too')
  const older = await watchFrames({ frameWithoutWindows: true })
  assert.equal(older.frames > 0 && older.leaked === 0, true, 'a helper before 0.2.15 sends no windows; its frames pass')
})
