import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { createRunControl } from '../../_tools_/agent-core/lib.mjs'
import { EnvironmentError, invalid } from '../../_environments_/macos-desktop/errors.mjs'
import { hitTestPoints, planAction } from '../../_environments_/macos-desktop/input-plan.mjs'
import { frameFor } from '../../_environments_/macos-desktop/coords.mjs'
import { fakeLauncher, logged, pause, scratchLocks, stdioLink, stopFake } from './harness.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

/**
 * The driver's own target check (D-036). Live on helper 0.2.10, with the run's scope CU Fixture only, a scripted click
 * on CU Ledger's window (same executable name) passed agent core's policy and was delivered by the helper, although
 * the helper's hit test named CU Ledger. The driver now hit-tests the global points a pointer action acts at - the
 * click, move or scroll point, a drag's start and end - and refuses `out_of_scope` with nothing posted when one is
 * over an app outside the scope (`target_out_of_scope`) or cannot be verified (`target_unverified`). Empty space
 * passes to the helper's per-event check; a planning or gate refusal sends no hit test at all.
 *
 * The world puts the display away from the global origin, so a check that hit-tested frame pixels instead of global
 * points would ask about the wrong place: CU Fixture (approved) on the left, CU Ledger (not approved) in the middle,
 * nothing on the right. Frame x 0-399 is the fixture, 400-699 the ledger, 700-799 empty; global = frame + (100, 50).
 */

const code = (expected) => (error) => error instanceof EnvironmentError && error.code === expected
const FIXTURE = 'ai.reflection.cu.fixture'
const LEDGER = 'ai.reflection.cu.ledger'
const ORIGIN = { x: 100, y: 50 }
const locks = scratchLocks()
after(() => locks.remove())
const launchOnFake = fakeLauncher(locks, { apps: [FIXTURE] })

const WORLD = {
  displays: [{ id: 1, main: true, originPt: ORIGIN, sizePt: { width: 800, height: 600 }, scale: 1 }],
  apps: [
    { bundleId: FIXTURE, pid: 601, title: 'CU Fixture', rect: { x: 100, y: 50, width: 400, height: 600 } },
    { bundleId: LEDGER, pid: 602, title: 'CU Ledger', rect: { x: 500, y: 50, width: 300, height: 600 } },
  ],
  frontmost: FIXTURE,
  elements: [
    { rect: { x: 150, y: 100, width: 100, height: 30 }, element: { bundleId: FIXTURE, pid: 601, role: 'AXButton', subrole: null, title: 'Save', frame: { x: 150, y: 100, width: 100, height: 30 }, secure: false } },
    { rect: { x: 600, y: 100, width: 100, height: 30 }, element: { bundleId: LEDGER, pid: 602, role: 'AXButton', subrole: null, title: 'Post entry', frame: { x: 600, y: 100, width: 100, height: 30 }, secure: false } },
  ],
}

const global = ({ x, y }) => ({ x: x + ORIGIN.x, y: y + ORIGIN.y })
const typed = (child, type) => child.requests.filter((r) => r.type === type)
const hitPoints = (child) => typed(child, 'hitTest').map((r) => ({ x: r.xPt, y: r.yPt }))

/**
 * The logged requests of one type, once at least one is there: the fake logs each request on stderr, which can trail
 * its reply on stdout under load, so a test that reads what was posted right after a reply waits for the log first.
 */
async function loggedOf(child, type, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs
  while (typed(child, type).length === 0 && Date.now() < deadline) await pause(5)
  return typed(child, type)
}

/** The refusal of a target outside the scope, at the global point `point`, naming `bundleId`. */
const outOfScope = (bundleId, point) => (error) => code('out_of_scope')(error) && error.details?.reason === 'target_out_of_scope'
  && error.details.bundleId === bundleId && error.details.point.x === point.x && error.details.point.y === point.y
  && !/ai\.reflection|com\.|now\./.test(error.message) && /an app this run is not approved for; nothing was posted/.test(error.message)
const unverified = (error) => code('out_of_scope')(error) && error.details?.reason === 'target_unverified' && error.details.bundleId === null

/** Launch, then wait for the launch's own requests (pause, scope, capture) so later counts start from them. */
async function launched(config = WORLD, options = {}) {
  const started = await launchOnFake(config, options)
  await logged(started.child, 3)
  return started
}

test('the helper\'s own stop returns a drag to its press point: releasedAtPress true, so agent core need not warn of a drop (CU-45)', async () => {
  const own = await launched({ ...WORLD, quirks: { stopAfter: { at: 3, code: 'timeout' } } })
  try {
    let refusal = null
    await assert.rejects(own.env.perform({ type: 'drag', path: [{ x: 50, y: 300 }, { x: 300, y: 300 }] }),
      (e) => { refusal = e; return e instanceof EnvironmentError && e.details?.cancelledDrag === true })
    const press = (await loggedOf(own.child, 'input'))[0].events.find((event) => event.kind === 'down')
    assert.deepEqual([refusal.details.releasedAt, refusal.details.releasedAtPress], [{ x: press.x, y: press.y }, true])
  } finally {
    await own.env.close()
    await stopFake(own.child)
  }
})

test('panelSelection gives the attributed panel\'s canonical selection, null without one, and throws on an older helper (Q-D13)', async () => {
  const selection = { path: '/Users/x/Documents/report.pdf', directory: '/Users/x/Documents', name: 'report.pdf' }
  const { env, child } = await launched({ ...WORLD, panelSelection: selection })
  try {
    assert.deepEqual(await env.panelSelection(), { ...selection, shownFolderName: null, nameFieldFocused: null }, 'a helper without the CU-48 fields: both null')
    assert.equal(typed(child, 'panelSelection').length, 1)
  } finally {
    await env.close()
    await stopFake(child)
  }
  // Folder unknown, a path typed into the name field: the raw name still reaches agent core, which resolves it.
  const typedPath = await launched({ ...WORLD, panelSelection: { path: null, directory: null, name: '~/Library/LaunchAgents/probe.plist' } })
  try {
    assert.deepEqual(await typedPath.env.panelSelection(), { path: null, directory: null, name: '~/Library/LaunchAgents/probe.plist', shownFolderName: null, nameFieldFocused: null })
  } finally {
    await typedPath.env.close()
    await stopFake(typedPath.child)
  }
  const none = await launched(WORLD)
  try {
    assert.equal(await none.env.panelSelection(), null, 'no attributed panel in front')
  } finally {
    await none.env.close()
    await stopFake(none.child)
  }
  const older = await launched({ ...WORLD, quirks: { noPanelSelection: true } })
  try {
    // Agent core catches this and asks without the path.
    await assert.rejects(older.env.panelSelection(), (e) => e instanceof EnvironmentError)
  } finally {
    await older.env.close()
    await stopFake(older.child)
  }
})

test('a drag stopped during a held move reports cancelledDrag (helper 0.2.19 sent Escape first; nothing dropped); a stopped press does not (CU-44)', async () => {
  const drag = await launched({ ...WORLD, quirks: { localInputAfter: 3 } })
  try {
    // move, down, drag - stopped before the rest: the button was held after a held move.
    let refusal = null
    await assert.rejects(drag.env.perform({ type: 'drag', path: [{ x: 50, y: 300 }, { x: 300, y: 300 }] }),
      (e) => { refusal = e; return e instanceof EnvironmentError && e.details?.cancelledDrag === true && e.details.failedAt === 3 })
    // Helper 0.2.20 (CU-45): where the button came up - for the person's takeover, the last posted point.
    const last = (await loggedOf(drag.child, 'input'))[0].events[2]
    assert.deepEqual(refusal.details.releasedAt, { x: last.x, y: last.y })
    assert.equal(refusal.details.releasedAtPress, false, 'the person took over mid-drag: the up came away from the press point')
    // The person's stop carries the driver's own text; it keeps the helper's warning that the button came up.
    assert.match(refusal.message, /a held button came up after the stop, so the app may have acted on it - check before retrying$/)
  } finally {
    await drag.env.close()
    await stopFake(drag.child)
  }
  const press = await launched({ ...WORLD, quirks: { localInputAfter: 2 } })
  try {
    await assert.rejects(press.env.perform({ type: 'click', x: 100, y: 300, button: 'left' }),
      (e) => e instanceof EnvironmentError && e.details?.failedAt === 2 && !Object.hasOwn(e.details, 'cancelledDrag') && !Object.hasOwn(e.details, 'releasedAt') && !/check before retrying/.test(e.message))
  } finally {
    await press.env.close()
    await stopFake(press.child)
  }
})

test('a click, double click or triple click over an out-of-scope app is refused target_out_of_scope: one hit test, no input', async () => {
  const { env, child } = await launched()
  try {
    // On CU Ledger's button (an element the helper names by bundle id only) and on its bare window.
    for (const at of [{ x: 500, y: 60 }, { x: 550, y: 300 }]) {
      for (const type of ['click', 'double_click', 'triple_click']) {
        const before = child.requests.length
        await assert.rejects(env.perform({ type, x: at.x, y: at.y, button: 'left' }), outOfScope(LEDGER, global(at)), `${type} at ${at.x},${at.y}`)
        await logged(child, before + 1)
        await pause(10)
        assert.deepEqual(child.requests.slice(before).map((r) => [r.type, r.xPt, r.yPt]), [['hitTest', global(at).x, global(at).y]], `${type}: the hit test only`)
      }
    }
    assert.equal(typed(child, 'input').length, 0, 'nothing was posted')
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('a move or a scroll over an out-of-scope app is refused the same way, sending no input', async () => {
  const { env, child } = await launched()
  try {
    await assert.rejects(env.perform({ type: 'move', x: 450, y: 200 }), outOfScope(LEDGER, global({ x: 450, y: 200 })))
    await assert.rejects(env.perform({ type: 'scroll', x: 600, y: 500, scroll_x: 0, scroll_y: 120 }), outOfScope(LEDGER, global({ x: 600, y: 500 })))
    // A held modifier changes nothing: key events carry no point and are not hit-tested.
    await assert.rejects(env.perform({ type: 'scroll', x: 600, y: 500, scroll_y: 50, keys: ['SHIFT'] }), outOfScope(LEDGER, global({ x: 600, y: 500 })))
    await logged(child, 6)
    await pause(10)
    assert.deepEqual(hitPoints(child), [global({ x: 450, y: 200 }), global({ x: 600, y: 500 }), global({ x: 600, y: 500 })])
    assert.equal(typed(child, 'input').length, 0)
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('a drag is hit-tested at its start and its end, not along its path: an end or a start over an out-of-scope app is refused', async () => {
  const { env, child } = await launched()
  try {
    // Ends on the ledger: both points asked, refused at the end.
    await assert.rejects(env.perform({ type: 'drag', path: [{ x: 50, y: 300 }, { x: 550, y: 300 }] }), outOfScope(LEDGER, global({ x: 550, y: 300 })))
    await logged(child, 5)
    assert.deepEqual(hitPoints(child), [global({ x: 50, y: 300 }), global({ x: 550, y: 300 })])
    // Starts on the ledger: refused at the start, so the end is never asked about.
    await assert.rejects(env.perform({ type: 'drag', path: [{ x: 550, y: 300 }, { x: 50, y: 300 }] }), outOfScope(LEDGER, global({ x: 550, y: 300 })))
    await logged(child, 6)
    await pause(10)
    assert.equal(typed(child, 'hitTest').length, 3, 'one hit test for a refused start')
    assert.equal(typed(child, 'input').length, 0, 'neither drag posted anything')
    // Within the fixture, a four-point path: only its first and last points are hit-tested, then it is posted.
    const path = [{ x: 10, y: 10 }, { x: 300, y: 10 }, { x: 300, y: 500 }, { x: 20, y: 500 }]
    await env.perform({ type: 'drag', path })
    await logged(child, 9)
    assert.deepEqual(hitPoints(child).slice(3), [global(path[0]), global(path[3])])
    assert.equal(typed(child, 'input').length, 1)
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('over an approved app the action proceeds - on a named element and on its bare window - and its input is posted', async () => {
  const { env, child } = await launched()
  try {
    const effect = await env.perform({ type: 'click', x: 100, y: 60, button: 'left' })
    assert.deepEqual(effect.mapping, { frameScaleX: 1, frameScaleY: 1, originPt: ORIGIN, display: 1 })
    await env.perform({ type: 'scroll', x: 200, y: 400, scroll_y: 30 })
    await env.perform({ type: 'move', x: 399, y: 599 })
    await logged(child, 9)
    assert.deepEqual(child.requests.slice(3).map((r) => r.type), ['hitTest', 'input', 'hitTest', 'input', 'hitTest', 'input'], 'each input after its hit test')
    assert.deepEqual(hitPoints(child), [global({ x: 100, y: 60 }), global({ x: 200, y: 400 }), global({ x: 399, y: 599 })])
    assert.deepEqual((await loggedOf(child, 'input'))[0].events[1], { kind: 'down', button: 'left', x: 200, y: 110, clickCount: 1, flags: 0 })
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('over empty space (no element) the check passes: the input is sent and the helper\'s own per-event check decides', async () => {
  const { env, child } = await launched()
  try {
    // No window at all at frame (750, 300): the hit test answers null, so the driver posts; the fake, as the helper
    // must, refuses a point over no approved app - with its own reason, not the driver's.
    await assert.rejects(env.perform({ type: 'click', x: 750, y: 300, button: 'left' }), (e) => code('out_of_scope')(e) && e.details.reason === 'out_of_scope')
    await logged(child, 5)
    assert.deepEqual(child.requests.slice(3).map((r) => r.type), ['hitTest', 'input'])
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('planning refusals and run-state gates send nothing at all - no hit test either', async () => {
  const control = createRunControl({ runId: 'target-check' })
  const aborter = new AbortController()
  const { env, child } = await launched(WORLD, { control, signal: aborter.signal })
  try {
    const planning = [
      { type: 'click', x: 800, y: 10, button: 'left' }, // outside the frame
      { type: 'click', x: 500, y: 60, button: 'thumb' }, // over the ledger, but an unknown button
      { type: 'drag', path: [{ x: 500, y: 60 }] },
      { type: 'drag', path: Array.from({ length: 101 }, (_, i) => ({ x: 400 + (i % 50), y: 60 })) },
      { type: 'scroll', x: 500, y: 60, scroll_y: 10, keys: ['A'] },
      { type: 'navigate', url: 'https://example.com/' },
    ]
    for (const action of planning) await assert.rejects(env.perform(action), (e) => code('invalid_argument')(e) || code('unsupported_action')(e), action.type)
    control.send({ command: 'take_over' }, { source: 'control' })
    await assert.rejects(env.perform({ type: 'click', x: 500, y: 60, button: 'left' }), code('taken_over'))
    control.send({ command: 'hand_back' }, { source: 'control' })
    // Local input stops the run (the driver's stop, or run control's pause once it accepts the local_input sender).
    await env.simulateLocalInput({ via: 'idle', kind: 'pointer' })
    await assert.rejects(env.perform({ type: 'click', x: 500, y: 60, button: 'left' }), code('taken_over'))
    aborter.abort()
    await assert.rejects(env.perform({ type: 'click', x: 100, y: 60, button: 'left' }), code('cancelled'))
    await logged(child, 4)
    await pause(20)
    assert.deepEqual(child.requests.slice(3).map((r) => r.type), ['simulateLocalInput'], 'no hit test and no input')
  } finally {
    await env.close()
    await stopFake(child)
  }
  // Pid mode refuses pointer actions at plan time (Q-D3): no hit test there either.
  const pid = await launched(WORLD, { mode: 'pid' })
  try {
    await assert.rejects(pid.env.perform({ type: 'click', x: 500, y: 60, button: 'left' }), code('unsupported_action'))
    await pause(20)
    assert.deepEqual(pid.child.requests.slice(3), [])
  } finally {
    await pid.env.close()
    await stopFake(pid.child)
  }
})

test('a hit test that fails never lets the action through: unverified, or the more exact refusal passed on; nothing is posted', async () => {
  const { env, child } = await launched()
  const original = env.link.request.bind(env.link)
  const sent = []
  let answer = null
  env.link.request = (type, fields, options) => {
    sent.push(type)
    if (type === 'hitTest' && answer !== null) return answer()
    return original(type, fields, options)
  }
  const click = { type: 'click', x: 100, y: 60, button: 'left' }
  const point = global({ x: 100, y: 60 })
  try {
    const cases = [
      ['the helper refuses the hit test out_of_scope', () => Promise.reject(new EnvironmentError('out_of_scope', 'not over an approved app', { reason: 'out_of_scope' })), outOfScope(null, point)],
      ['an AX timeout the helper reports', () => Promise.reject(new EnvironmentError('timeout', 'the app did not answer')), (e) => unverified(e) && e.details.helperCode === 'timeout'],
      ['an argument the helper refuses', () => Promise.reject(invalid('xPt must be a number')), (e) => unverified(e) && e.details.helperCode === 'invalid_argument'],
      ['something that is not an EnvironmentError', () => Promise.reject(new Error('boom')), unverified],
      ['a reply without an element', () => Promise.resolve({}), unverified],
      ['an element that is not an object', () => Promise.resolve({ element: 'AXButton' }), unverified],
      ['an element that names no app', () => Promise.resolve({ element: { bundleId: null, pid: 77, role: null } }), unverified],
      ['an element whose app is unnamed', () => Promise.resolve({ element: { role: 'AXButton', title: 'OK' } }), unverified],
      ['no_scope from the helper', () => Promise.reject(new EnvironmentError('out_of_scope', 'no scope is set', { reason: 'no_scope' })), (e) => code('out_of_scope')(e) && e.details.reason === 'no_scope'],
      ['a missing grant', () => Promise.reject(new EnvironmentError('not_granted', 'no Accessibility', { grant: 'accessibility' })), (e) => code('not_granted')(e) && e.details.grant === 'accessibility'],
    ]
    for (const [label, reply, expected] of cases) {
      answer = reply
      sent.length = 0
      await assert.rejects(env.perform(click), expected, label)
      assert.deepEqual(sent, ['hitTest'], `${label}: no input after it`)
    }
    // A well-formed element of an approved app passes.
    answer = () => Promise.resolve({ element: { bundleId: FIXTURE, pid: 601, role: 'AXButton', title: 'Save' } })
    sent.length = 0
    await env.perform(click)
    assert.deepEqual(sent, ['hitTest', 'input'])
  } finally {
    env.link.request = original
    await env.close()
    await stopFake(child)
  }
})

test('on the fake: without Accessibility the hit test answers not_granted; a helper that fails it is lost - no input either way', async () => {
  const ungranted = await launched({ ...WORLD, grants: { screen: true, accessibility: false } })
  try {
    await assert.rejects(ungranted.env.perform({ type: 'click', x: 100, y: 60, button: 'left' }), (e) => code('not_granted')(e) && e.details.grant === 'accessibility')
    await logged(ungranted.child, 4)
    await pause(10)
    assert.deepEqual(ungranted.child.requests.slice(3).map((r) => r.type), ['hitTest'])
  } finally {
    await ungranted.env.close()
    await stopFake(ungranted.child)
  }
  const failing = await launched({ ...WORLD, quirks: { failOn: 'hitTest' } })
  try {
    await assert.rejects(failing.env.perform({ type: 'click', x: 100, y: 60, button: 'left' }), code('helper_lost'))
    await pause(10)
    assert.equal(typed(failing.child, 'input').length, 0)
  } finally {
    await failing.env.close()
    await stopFake(failing.child)
  }
})

test('a target refusal leaves a pending settle for the next input, and the gates are checked again after the hit test', async () => {
  const control = createRunControl({ runId: 'target-check' })
  const { env, child } = await launched(WORLD, { control, settleMs: 40 })
  try {
    control.send({ command: 'pause' }, { source: 'control' })
    control.send({ command: 'resume' }, { source: 'control' })
    await assert.rejects(env.perform({ type: 'click', x: 500, y: 60, button: 'left' }), outOfScope(LEDGER, global({ x: 500, y: 60 })))
    await env.perform({ type: 'click', x: 100, y: 60, button: 'left' })
    await logged(child, 6)
    assert.equal(typed(child, 'input').length, 1)
    assert.equal(typed(child, 'input')[0].settleMs, 40, 'the refused click formed no input, so the settle rode the next one')

    // A person takes over while the hit test is out: the gate after it refuses, and nothing is posted.
    const original = env.link.request.bind(env.link)
    env.link.request = async (type, fields, options) => {
      const reply = await original(type, fields, options)
      if (type === 'hitTest') control.send({ command: 'take_over' }, { source: 'control' })
      return reply
    }
    await assert.rejects(env.perform({ type: 'click', x: 100, y: 60, button: 'left' }), code('taken_over'))
    env.link.request = original
    await logged(child, 7)
    await pause(10)
    assert.equal(typed(child, 'input').length, 1, 'no input after a take-over during the hit test')
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('hitTestPoints: the click, move or scroll point once; a drag\'s first and last points; nothing for keys and text', () => {
  const frame = frameFor({ originPt: ORIGIN, sizePt: { width: 800, height: 600 }, scale: 1 }, 1)
  const points = (action) => hitTestPoints(planAction(action, frame).input)
  assert.deepEqual(points({ type: 'click', x: 1, y: 2, button: 'right', keys: ['CTRL'] }), [{ x: 101, y: 52 }])
  assert.deepEqual(points({ type: 'triple_click', x: 1, y: 2 }), [{ x: 101, y: 52 }])
  assert.deepEqual(points({ type: 'move', x: 3, y: 4 }), [{ x: 103, y: 54 }])
  assert.deepEqual(points({ type: 'scroll', x: 5, y: 6, scroll_y: 10 }), [{ x: 105, y: 56 }])
  assert.deepEqual(points({ type: 'drag', path: [{ x: 0, y: 0 }, { x: 700, y: 0 }, { x: 700, y: 500 }, { x: 10, y: 20 }] }), [{ x: 100, y: 50 }, { x: 110, y: 70 }])
  assert.deepEqual(points({ type: 'drag', path: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 0, y: 0 }] }), [{ x: 100, y: 50 }], 'a drag back to its start: one point')
  assert.deepEqual(points({ type: 'keypress', keys: ['META', 'A'] }), [])
  assert.deepEqual(points({ type: 'type', text: 'hi' }), [])
  assert.deepEqual(hitTestPoints(null), [])
})

test('the fake helper\'s hitTest names the app at the point, an out-of-scope one included, as helper 0.2.10 did live', async () => {
  const world = { ...WORLD, elements: [...WORLD.elements, { rect: { x: 600, y: 300, width: 50, height: 50 }, element: { role: 'AXButton', title: 'Unowned' } }, { rect: { x: 150, y: 300, width: 50, height: 50 }, element: { role: 'AXButton', title: 'Owned by the window' } }] }
  const { child, link } = await stdioLink(world)
  try {
    await link.request('scope', { bundleIds: [FIXTURE] })
    const at = async (x, y) => (await link.request('hitTest', { xPt: x, yPt: y })).element
    assert.deepEqual(await at(650, 350), { bundleId: LEDGER, pid: 602, role: null, subrole: null, title: null, frame: null, secure: false, opaque: false }, 'CU Ledger\'s bare window: bundle id only')
    assert.equal((await at(610, 110)).bundleId, LEDGER, 'CU Ledger\'s button: bundle id only')
    assert.equal((await at(610, 110)).title, null)
    assert.deepEqual([(await at(610, 310)).bundleId, (await at(610, 310)).title], [LEDGER, null], 'an element configured without an owner takes the app at the point')
    assert.deepEqual([(await at(160, 310)).bundleId, (await at(160, 310)).title], [FIXTURE, 'Owned by the window'])
    assert.equal((await at(160, 110)).title, 'Save')
    assert.equal(await at(850, 350), null, 'no window there')
  } finally {
    link.close()
    await stopFake(child)
  }
})

test('a window that comes over the point after the hit test: the helper refuses at the point, and the driver names its owner and point (CU-38)', async () => {
  const { env, child } = await launched({ ...WORLD, quirks: { hitTestBlind: true } })
  try {
    const at = { x: 550, y: 300 }
    await assert.rejects(env.perform({ type: 'click', x: at.x, y: at.y, button: 'left' }), (e) => code('out_of_scope')(e)
      && e.details.reason === 'target_out_of_scope' && e.details.bundleId === LEDGER
      && e.details.point.x === global(at).x && e.details.point.y === global(at).y
      && !e.message.includes(LEDGER) && /covered by a window of an app this run is not approved for/.test(e.message))
    await logged(child, 5)
    assert.deepEqual(child.requests.slice(3).map((r) => r.type), ['hitTest', 'input'], 'the hit test passed; the helper refused the input')
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('the helper\'s scope refusals map to details that never claim a point the reply did not name', async () => {
  const { replyError } = await import('../../_environments_/macos-desktop/helper-link.mjs')
  const details = (reply) => replyError('input', { message: 'm', ...reply }).details
  // The model's text never names the covering app (CU-47); the helper's own text is not forwarded for a point refusal.
  const named = replyError('input', { code: 'out_of_scope', message: `the point (650, 350) is covered by a window of ${LEDGER}`, bundleId: LEDGER, point: { x: 650, y: 350 } })
  assert.equal(named.message.includes(LEDGER), false)
  assert.deepEqual(details({ code: 'out_of_scope', bundleId: LEDGER, point: { x: 650, y: 350 } }), { reason: 'target_out_of_scope', bundleId: LEDGER, point: { x: 650, y: 350 } })
  // Helper 0.2.16 names the owner of a frontmost refusal and of a point refusal alike, without a point.
  assert.deepEqual(details({ code: 'out_of_scope', bundleId: LEDGER }), { reason: 'out_of_scope', bundleId: LEDGER })
  assert.deepEqual(details({ code: 'out_of_scope', point: { x: 1, y: 2 } }), { reason: 'out_of_scope' }, 'a point over no window names no owner')
  assert.deepEqual(details({ code: 'out_of_scope' }), { reason: 'out_of_scope' })
  assert.deepEqual(details({ code: 'no_scope', bundleId: LEDGER, point: { x: 1, y: 2 } }), { reason: 'no_scope', bundleId: LEDGER })
  // CU-199: the helper names which check refused, so a record can tell its mid-gesture re-check from the frontmost one.
  assert.deepEqual(details({ code: 'out_of_scope', check: 'gesture' }), { reason: 'out_of_scope', check: 'gesture' }, 'no app beneath: the race CU-199 suspects')
  assert.deepEqual(details({ code: 'out_of_scope', bundleId: LEDGER, point: { x: 650, y: 350 }, check: 'gesture' }), { reason: 'target_out_of_scope', bundleId: LEDGER, point: { x: 650, y: 350 }, check: 'gesture' })
  for (const odd of ['Gesture!', 'x'.repeat(40), 42, '']) assert.deepEqual(details({ code: 'out_of_scope', check: odd }), { reason: 'out_of_scope' }, `a malformed check (${JSON.stringify(odd)}) is dropped, never recorded`)
})

test('an element the helper attributes to its client app keeps hostedBy through inspectPoint and focusedElement (Q-D13)', async () => {
  const PANEL = 'com.apple.appkit.xpc.openAndSavePanelService'
  const save = { bundleId: FIXTURE, pid: 601, role: 'AXButton', subrole: null, title: 'Save', frame: { x: 150, y: 100, width: 100, height: 30 }, secure: false }
  const world = { ...WORLD, elements: [{ rect: save.frame, element: { ...save, hostedBy: PANEL } }], focused: { ...save, hostedBy: PANEL } }
  const { env, child } = await launched(world)
  try {
    const hit = await env.inspectPoint({ x: 100, y: 60 })
    assert.deepEqual([hit.origin, hit.hostedBy, hit.name], [FIXTURE, PANEL, 'Save'], 'attributed to the client, naming the service')
    assert.equal((await env.focusedElement()).hostedBy, PANEL)
    // The same-looking button in the app's own window is another target: hostedBy joins the fingerprint.
    const plain = await launched({ ...WORLD, elements: [{ rect: save.frame, element: save }], focused: save })
    try {
      const own = await plain.env.inspectPoint({ x: 100, y: 60 })
      assert.equal(own.hostedBy, null, 'no attribution: null')
      assert.notEqual(own.fingerprint, hit.fingerprint)
    } finally {
      await plain.env.close()
      await stopFake(plain.child)
    }
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('CU-48: panelSelection passes the shown folder name and the name field\'s focus through; malformed values and an older helper read as null; a reply with only those is not null', async () => {
  const cases = [
    [{ path: null, directory: null, name: 'report.pdf', shownFolderName: 'Reports', nameFieldFocused: true }, { path: null, directory: null, name: 'report.pdf', shownFolderName: 'Reports', nameFieldFocused: true }],
    [{ path: null, directory: null, name: 'x', shownFolderName: 'Desktop', nameFieldFocused: false }, { path: null, directory: null, name: 'x', shownFolderName: 'Desktop', nameFieldFocused: false }],
    // At Go to Folder the name field is often empty: the shown name alone still comes back (the arming read).
    [{ path: null, directory: null, name: null, shownFolderName: 'Desktop', nameFieldFocused: false }, { path: null, directory: null, name: null, shownFolderName: 'Desktop', nameFieldFocused: false }],
    // Malformed: an empty name and a non-boolean focus are no check at all.
    [{ path: null, directory: null, name: 'x', shownFolderName: '', nameFieldFocused: 'yes' }, { path: null, directory: null, name: 'x', shownFolderName: null, nameFieldFocused: null }],
    [{ path: null, directory: null, name: 'x', shownFolderName: 42, nameFieldFocused: 1 }, { path: null, directory: null, name: 'x', shownFolderName: null, nameFieldFocused: null }],
  ]
  for (const [selection, expected] of cases) {
    const { env, child } = await launched({ ...WORLD, panelSelection: selection })
    try {
      assert.deepEqual(await env.panelSelection(), expected, JSON.stringify(selection))
    } finally {
      await env.close()
      await stopFake(child)
    }
  }
  // Nothing at all readable: null, as before.
  const { env, child } = await launched({ ...WORLD, panelSelection: { path: null, directory: null, name: null } })
  try {
    assert.equal(await env.panelSelection(), null)
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('CU-142: focusedElement carries the default button Return presses ({ role, name, panel }), null without one or from an older helper, and outside the fingerprint', async () => {
  const FIELD = { bundleId: FIXTURE, pid: 601, role: 'AXTextField', subrole: null, title: null, frame: { x: 20, y: 400, width: 200, height: 24 }, secure: false, editable: true }
  const SEND = { bundleId: FIXTURE, pid: 601, role: 'AXButton', subrole: null, title: 'Send', frame: { x: 240, y: 400, width: 60, height: 24 }, secure: false }
  const read = async (extra) => {
    const { env, child } = await launched({ ...WORLD, focused: FIELD, ...extra })
    try {
      return await env.focusedElement()
    } finally {
      await env.close()
      await stopFake(child)
    }
  }
  const withSend = await read({ defaultButton: SEND })
  assert.deepEqual(withSend.defaultButton, { role: 'AXButton', name: 'Send', panel: null })
  assert.equal(withSend.role, 'AXTextField', 'the target is still the focused element')
  const older = await read({})
  assert.equal(older.defaultButton, null, 'an older helper sends no field: no default button, today\'s verdict')
  assert.equal(older.fingerprint, withSend.fingerprint, 'the default button is context, not identity')
  assert.equal((await read({ defaultButton: null })).defaultButton, null)
  assert.deepEqual((await read({ defaultButton: { ...SEND, title: 'Delete', panel: 'save' } })).defaultButton, { role: 'AXButton', name: 'Delete', panel: 'save' }, 'a sheet\'s default button keeps its panel marker')
  assert.equal((await read({ defaultButton: { ...SEND, role: null } })).defaultButton, null, 'no role: no default button')
  assert.deepEqual((await read({ defaultButton: { ...SEND, title: '' } })).defaultButton, { role: 'AXButton', name: null, panel: null }, 'an unnamed default button is reported unnamed')
  // No focused element but a default button: a placeholder target carries it (CU-148's no-focus case); see the CU-148 placeholder test.
  assert.deepEqual([(await read({ focused: null, defaultButton: SEND }))?.noFocus, (await read({ focused: null })) ], [true, null])
})

test('CU-148: focusedElement passes the helper\'s sheet as a strict boolean, null from an older helper or a malformed value, outside the fingerprint', async () => {
  const FIELD = { bundleId: FIXTURE, pid: 601, role: 'AXWindow', subrole: 'AXStandardWindow', title: 'Untitled', frame: { x: 0, y: 0, width: 800, height: 600 }, secure: false }
  const read = async (extra) => {
    const { env, child } = await launched({ ...WORLD, focused: FIELD, ...extra })
    try {
      return await env.focusedElement()
    } finally {
      await env.close()
      await stopFake(child)
    }
  }
  const onSheet = await read({ sheet: true })
  assert.equal(onSheet.sheet, true, 'a Don\'t Save sheet over the focused window')
  assert.equal(onSheet.role, 'AXWindow', 'the target is still the focused element')
  assert.equal((await read({ sheet: false })).sheet, false)
  const older = await read({})
  assert.equal(older.sheet, null, 'an older helper sends no field: unknown, today\'s verdict')
  assert.equal(older.fingerprint, onSheet.fingerprint, 'the sheet is context, not identity')
  for (const malformed of ['true', 1, null, {}]) assert.equal((await read({ sheet: malformed })).sheet, null, JSON.stringify(malformed))
  assert.equal((await read({ focused: null, sheet: true }))?.noFocus, true, 'no focused element but a sheet: the placeholder (see below)')
})

test('CU-148: no focused element but a sheet or a default button - a placeholder target carries them (noFocus); with neither, or sheet false, null as before', async () => {
  const SEND = { bundleId: FIXTURE, pid: 601, role: 'AXButton', subrole: null, title: 'Send', frame: { x: 240, y: 400, width: 60, height: 24 }, secure: false }
  const read = async (extra) => {
    const { env, child } = await launched({ ...WORLD, focused: null, ...extra })
    try {
      return await env.focusedElement()
    } finally {
      await env.close()
      await stopFake(child)
    }
  }
  const onSheet = await read({ sheet: true })
  assert.deepEqual([onSheet.role, onSheet.name, onSheet.noFocus, onSheet.sheet, onSheet.defaultButton], [null, null, true, true, null])
  assert.equal(typeof onSheet.fingerprint, 'string', 'the shape of any target')
  assert.equal((await read({ sheet: true })).fingerprint, onSheet.fingerprint, 'two placeholders compare equal while the sheet stays')
  const withSend = await read({ defaultButton: SEND })
  assert.deepEqual([withSend.noFocus, withSend.defaultButton], [true, { role: 'AXButton', name: 'Send', panel: null }])
  assert.equal(withSend.origin, null, 'no app reported: no origin (app-policy blocks it - the loop test pins that)')
  const named = await read({ defaultButton: SEND, focusedApp: { bundleId: FIXTURE, pid: 601 } })
  assert.deepEqual([named.origin, named.pid, named.noFocus], [FIXTURE, 601, true], 'the app whose window was read names the placeholder')
  assert.equal((await read({ defaultButton: SEND, focusedApp: { bundleId: '' } })).origin, null, 'an empty bundle id names nothing')
  assert.equal(await read({}), null, 'no focus and nothing read: null, as before')
  assert.equal(await read({ sheet: false }), null, 'sheet false adds nothing: null, as before')
  assert.equal(await read({ sheet: 'true' }), null, 'a malformed sheet is no sheet')
  // Across the seam: agent core's real policy judges Return on the placeholder by its default button (#325).
  const policy = createPolicy({ sitePolicy: () => 'allow' })
  const verdict = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: 'desktop://', target: withSend })
  assert.equal(verdict.decision, 'confirm', JSON.stringify(verdict))
  assert.equal(policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: 'desktop://', target: await read({}) }).decision, 'allow', 'no placeholder: today\'s verdict')
})

test('CU-151: focusedElement and inspectPoint carry the pasteboard change count, read fresh each time (a copy raises it later), null when absent or malformed, outside the fingerprint', async () => {
  const FIELD = { bundleId: FIXTURE, pid: 601, role: 'AXTextField', subrole: null, title: 'Message', frame: { x: 150, y: 450, width: 200, height: 24 }, secure: false, editable: true }
  const world = (extra) => ({ ...WORLD, focused: FIELD, elements: [{ rect: FIELD.frame, element: FIELD }], ...extra })
  const at = { x: 60, y: 405 } // frame point: global (160, 455), inside the field (the display's origin is (100, 50))
  {
    const { env, child } = await launched(world({ changeCount: 41, phases: [{ afterInputs: 1, changeCount: 42 }] }))
    try {
      const before = await env.focusedElement()
      assert.equal(before.pasteboardChangeCount, 41)
      assert.equal((await env.inspectPoint(at)).pasteboardChangeCount, 41, 'the element at a point carries it too (Edit > Paste is a click)')
      await env.perform({ type: 'keypress', keys: ['META', 'C'] })
      const after = await env.focusedElement()
      assert.equal(after.pasteboardChangeCount, 42, 'read fresh: the rise after the copy is seen by the next read')
      assert.equal((await env.inspectPoint(at)).pasteboardChangeCount, 42)
      assert.equal(after.fingerprint, before.fingerprint, 'the count is context, not identity')
    } finally {
      await env.close()
      await stopFake(child)
    }
  }
  const read = async (extra) => {
    const { env, child } = await launched(world(extra))
    try {
      return [await env.focusedElement(), await env.inspectPoint(at)]
    } finally {
      await env.close()
      await stopFake(child)
    }
  }
  assert.deepEqual((await read({})).map((t) => t.pasteboardChangeCount), [null, null], 'an older helper: unknown')
  for (const malformed of [-1, 1.5, '3', null, 2 ** 60]) {
    assert.deepEqual((await read({ changeCount: malformed })).map((t) => t.pasteboardChangeCount), [null, null], JSON.stringify(malformed))
  }
  assert.deepEqual((await read({ changeCount: 0 })).map((t) => t.pasteboardChangeCount), [0, 0], 'zero is a count')
})

test('CU-219: with nothing focused focusedElement stays null (no placeholder) and pasteboardChangeCount reads the count beside it - fresh from a focused read each time, null when absent or malformed', async () => {
  const world = (extra) => ({ ...WORLD, focused: null, ...extra })
  {
    const { env, child } = await launched(world({ changeCount: 41, phases: [{ afterInputs: 1, changeCount: 42 }] }))
    try {
      assert.equal(await env.focusedElement(), null, 'nothing focused and no sheet or default button: null, as before - the count makes no target')
      await loggedOf(child, 'focused')
      const reads = typed(child, 'focused').length
      assert.equal(await env.pasteboardChangeCount(), 41)
      // The fake's stderr log can trail its reply under load: wait for the read to show, then count.
      for (const deadline = Date.now() + 2000; typed(child, 'focused').length <= reads && Date.now() < deadline;) await pause(5)
      assert.equal(typed(child, 'focused').length, reads + 1, 'one focused read of its own, never a cached count')
      await env.perform({ type: 'keypress', keys: ['META', 'C'] })
      assert.equal(await env.pasteboardChangeCount(), 42, 'read fresh: the rise after the copy is seen by the next read')
      assert.equal(await env.focusedElement(), null, 'still no target after the rise')
    } finally {
      await env.close()
      await stopFake(child)
    }
  }
  const count = async (extra) => {
    const { env, child } = await launched(world(extra))
    try {
      return await env.pasteboardChangeCount()
    } finally {
      await env.close()
      await stopFake(child)
    }
  }
  assert.equal(await count({}), null, 'a reply without the count: unknown')
  for (const malformed of [-1, 1.5, '3', null, 2 ** 60, { n: 3 }]) assert.equal(await count({ changeCount: malformed }), null, JSON.stringify(malformed))
  assert.equal(await count({ changeCount: 0 }), 0, 'zero is a count')
  assert.equal(await count({ changeCount: 7, focused: { bundleId: FIXTURE, pid: 601, role: 'AXTextField', subrole: null, title: 'Message', frame: { x: 150, y: 450, width: 200, height: 24 }, secure: false } }), 7, 'with an element focused too')
})

test('CU-157: focusedElement and inspectPoint carry textEntered, read fresh each time (typing makes it true), strictly a boolean else null, outside the fingerprint, on the no-focus placeholder too', async () => {
  const FIELD = { bundleId: FIXTURE, pid: 601, role: 'AXTextField', subrole: null, title: 'Message', frame: { x: 150, y: 450, width: 200, height: 24 }, secure: false, editable: true }
  const SEND = { bundleId: FIXTURE, pid: 601, role: 'AXButton', subrole: null, title: 'Send', frame: { x: 240, y: 400, width: 60, height: 24 }, secure: false }
  const world = (extra) => ({ ...WORLD, focused: FIELD, elements: [{ rect: FIELD.frame, element: FIELD }], ...extra })
  const at = { x: 60, y: 405 } // frame point: global (160, 455), inside the field (the display's origin is (100, 50))
  {
    const { env, child } = await launched(world({ textEntered: false, phases: [{ afterInputs: 1, textEntered: true }] }))
    try {
      const before = await env.focusedElement()
      assert.equal(before.textEntered, false, 'nothing typed in the window')
      assert.equal((await env.inspectPoint(at)).textEntered, false, 'the element at a point carries it too (a Reply is a click)')
      await env.perform({ type: 'type', text: 'hi' })
      const after = await env.focusedElement()
      assert.equal(after.textEntered, true, 'read fresh: the text typed since is seen by the next read')
      assert.equal((await env.inspectPoint(at)).textEntered, true)
      assert.equal(after.fingerprint, before.fingerprint, 'context, not identity')
    } finally {
      await env.close()
      await stopFake(child)
    }
  }
  const read = async (extra) => {
    const { env, child } = await launched(world(extra))
    try {
      return [await env.focusedElement(), await env.inspectPoint(at)]
    } finally {
      await env.close()
      await stopFake(child)
    }
  }
  assert.deepEqual((await read({})).map((t) => t.textEntered), [null, null], 'an older helper: unknown (asks)')
  for (const malformed of ['false', 0, 1, null, {}]) {
    assert.deepEqual((await read({ textEntered: malformed })).map((t) => t.textEntered), [null, null], JSON.stringify(malformed))
  }
  const [placeholder] = await read({ focused: null, defaultButton: SEND, textEntered: false })
  assert.deepEqual([placeholder.noFocus, placeholder.textEntered], [true, false], 'the no-focus placeholder carries it')
})

test('CU-154: a menu item\'s key equivalent passes through inspectPoint, validated part by part, outside the fingerprint; an out-of-scope item names none', async () => {
  const item = (y, extra) => ({ rect: { x: 150, y, width: 100, height: 30 }, element: { bundleId: FIXTURE, pid: 601, role: 'AXMenuItem', subrole: null, title: 'Coller', frame: { x: 150, y, width: 100, height: 30 }, secure: false, ...extra } })
  const world = {
    ...WORLD,
    elements: [
      item(100, { keyEquivalent: { char: 'V', modifiers: 0 } }),
      item(150, { keyEquivalent: { char: '', modifiers: 0 } }),
      item(200, { keyEquivalent: { char: 'V', modifiers: 99 } }),
      item(250, { keyEquivalent: { char: '\u0007', modifiers: 1.5 } }),
      item(300, {}),
      { rect: { x: 600, y: 100, width: 100, height: 30 }, element: { bundleId: LEDGER, pid: 602, role: 'AXMenuItem', subrole: null, title: 'Paste', frame: { x: 600, y: 100, width: 100, height: 30 }, secure: false, keyEquivalent: { char: 'V', modifiers: 0 } } },
    ],
  }
  const { env, child } = await launched(world)
  try {
    const at = async (y) => env.inspectPoint({ x: 100, y: y - 50 + 10 })
    const coller = await at(100)
    assert.deepEqual([coller.role, coller.name, coller.keyEquivalent], ['AXMenuItem', 'Coller', { char: 'V', modifiers: 0 }], 'Command-V, whatever the title says')
    assert.deepEqual((await at(150)).keyEquivalent, { char: null, modifiers: 0 }, 'an empty char is null, the modifiers stand')
    assert.deepEqual((await at(200)).keyEquivalent, { char: 'V', modifiers: null }, 'modifiers outside 0-15 are null')
    assert.equal((await at(250)).keyEquivalent, null, 'a control character and a fraction: nothing usable')
    const plain = await at(300)
    assert.equal(plain.keyEquivalent, null, 'no key equivalent sent (an older helper): null')
    assert.equal(coller.fingerprint === plain.fingerprint, false, 'different rows are different targets')
    const outOfScope = await env.inspectPoint({ x: 550, y: 60 })
    assert.deepEqual([outOfScope.origin, outOfScope.name, outOfScope.keyEquivalent], [LEDGER, null, null], 'an owner-only answer names no title and no key equivalent')
  } finally {
    await env.close()
    await stopFake(child)
  }
  // Outside the fingerprint: the same item with and without a key equivalent is one target.
  const one = await launched({ ...WORLD, elements: [item(100, { keyEquivalent: { char: 'V', modifiers: 0 } })] })
  const two = await launched({ ...WORLD, elements: [item(100, {})] })
  try {
    assert.equal((await one.env.inspectPoint({ x: 100, y: 60 })).fingerprint, (await two.env.inspectPoint({ x: 100, y: 60 })).fingerprint)
  } finally {
    await one.env.close()
    await stopFake(one.child)
    await two.env.close()
    await stopFake(two.child)
  }
})
