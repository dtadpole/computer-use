import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { createRunControl } from '../../_tools_/agent-core/lib.mjs'
import { frameFor } from '../../_environments_/macos-desktop/coords.mjs'
import { EnvironmentError } from '../../_environments_/macos-desktop/errors.mjs'
import { ACTION_TYPES, HOLD_MAX_MS, planAction, planHoldKey } from '../../_environments_/macos-desktop/input-plan.mjs'
import { fakeLauncher, launchApproved, scratchLocks, stdioLink, stopFake } from './harness.mjs'

/**
 * CU-64, the driver's half: nothing stays held past one input request. hold_key plans the chord's downs, ONE
 * `{kind: 'hold', ms}` step and the ups reversed; a drag point's holdMs is the same step with the button down; the
 * request's deadline grows by its holds. cursor_position asks the helper (helper 0.2.30's `cursor`) and maps the point
 * at the run's scale, says off-frame without coordinates, and on an older helper falls back to the last point sent -
 * labelled, and null after a person had the Mac (D5). On a lost link mid-hold the error names what may be held (the
 * driver cannot post a key-up; the helper's next start releases its marker, reported as hello.releasedStale).
 */

const FIXTURE = 'com.example.fixture'
const locks = scratchLocks()
after(() => locks.remove())
const launchOnFake = fakeLauncher(locks, { apps: [FIXTURE] })
const code = (expected) => (error) => error instanceof EnvironmentError && error.code === expected
const flat = frameFor({ display: 1, originPt: { x: 0, y: 0 }, sizePt: { width: 1920, height: 1080 }, scale: 1 }, 1)
const kinds = (events) => events.map((e) => (e.kind === 'hold' ? `hold:${e.ms}` : e.kind === 'keyDown' || e.kind === 'keyUp' ? `${e.kind}${e.keyCode}` : e.kind))
const MAIN = { id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 1920, height: 1080 }, scale: 1 }
const world = (extra = {}) => ({ displays: [MAIN], apps: [{ bundleId: FIXTURE, pid: 501, rect: { x: 0, y: 0, width: 1512, height: 982 } }], ...extra })

test('hold_key plans the chord\'s downs, one hold step and the ups reversed; 1..10000 ms, else refused before anything (H1, H2)', () => {
  assert.deepEqual(kinds(planHoldKey({ keys: ['shift'], duration_ms: 500 }).input), ['keyDown56', 'hold:500', 'keyUp56'])
  assert.deepEqual(kinds(planHoldKey({ keys: ['cmd', 'shift', 'a'], duration_ms: HOLD_MAX_MS }).input),
    ['keyDown55', 'keyDown56', 'keyDown0', 'hold:10000', 'keyUp0', 'keyUp56', 'keyUp55'])
  for (const duration_ms of [0, -1, 10_001, 1.5, '500', undefined]) {
    assert.throws(() => planHoldKey({ keys: ['shift'], duration_ms }), (e) => code('invalid_argument')(e) && e.details?.field === 'duration_ms', String(duration_ms))
  }
  assert.throws(() => planHoldKey({ keys: [], duration_ms: 10 }), code('invalid_argument'))
  // A public action since hold_key joined the canonical vocabulary with agent core's half (#206: one change, two lists).
  assert.equal(ACTION_TYPES.includes('hold_key'), true)
})

test('a drag point\'s holdMs is a dwell with the button down - one hold step at that point, all dwells at most 10 s (R1)', () => {
  const drag = (path) => kinds(planAction({ type: 'drag', path }, flat).input)
  const press = drag([{ x: 10, y: 10, holdMs: 1500 }, { x: 12, y: 10 }])
  assert.deepEqual(press.slice(0, 3), ['move', 'down', 'hold:1500'], 'a long press: held at the press point before any move')
  assert.equal(press.at(-1), 'up')
  const over = drag([{ x: 10, y: 10 }, { x: 200, y: 10, holdMs: 700 }, { x: 400, y: 10 }])
  const at = over.indexOf('hold:700')
  assert.ok(at > 2 && over[at - 1] === 'drag' && over[at + 1] === 'drag', 'the dwell comes on reaching the middle point, between held moves')
  const last = drag([{ x: 10, y: 10 }, { x: 40, y: 10, holdMs: 300 }])
  assert.deepEqual(last.slice(-2), ['hold:300', 'up'], 'a dwell over the drop point comes before the release')
  assert.throws(() => drag([{ x: 10, y: 10, holdMs: 6000 }, { x: 40, y: 10, holdMs: 5000 }]), (e) => code('invalid_argument')(e) && e.details?.field === 'path')
  assert.throws(() => drag([{ x: 10, y: 10, holdMs: 0 }, { x: 40, y: 10 }]), (e) => code('invalid_argument')(e) && e.details?.field === 'path[0].holdMs')
})

test('a hold longer than the link\'s request timeout does not end the link: the request\'s deadline grows by its holds', async () => {
  let child = null
  const connect = async () => {
    const started = await stdioLink(world(), { requestTimeoutMs: 300 })
    child = started.child
    return started.link
  }
  const env = await launchApproved(connect, { apps: [FIXTURE], seat: 'cu-developer-two', runLock: locks.next() })
  try {
    const started = Date.now()
    await env.perform({ type: 'drag', path: [{ x: 10, y: 10, holdMs: 600 }, { x: 40, y: 10 }] })
    assert.ok(Date.now() - started >= 600, 'the fake held for the dwell')
    assert.equal(env.link.lost, false, 'a 600 ms hold under a 300 ms request timeout ended nothing')
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('the helper lost mid-hold: the error names what may still be down (G1); a person during a hold: heldKeys (G2)', async () => {
  const lost = await launchOnFake(world({ quirks: { exitOn: 'input' } }))
  try {
    let error = null
    await assert.rejects(lost.env.perform({ type: 'drag', keys: ['shift'], path: [{ x: 10, y: 10, holdMs: 500 }, { x: 40, y: 10 }] }), (e) => { error = e; return code('helper_lost')(e) })
    assert.deepEqual(error.details.heldAtLoss, { keys: ['SHIFT'], buttons: ['left'] }, 'Shift and the left button were down at the hold, by name')
  } finally {
    await lost.env.close().catch(() => {})
    await stopFake(lost.child)
  }
  // A plain drag holds its button for seconds without a hold step: lost mid-drag, the button may still be down too.
  const dragLost = await launchOnFake(world({ quirks: { exitOn: 'input' } }))
  try {
    let error = null
    await assert.rejects(dragLost.env.perform({ type: 'drag', path: [{ x: 10, y: 10 }, { x: 400, y: 10 }] }), (e) => { error = e; return code('helper_lost')(e) })
    assert.deepEqual(error.details.heldAtLoss, { keys: [], buttons: ['left'] })
  } finally {
    await dragLost.env.close().catch(() => {})
    await stopFake(dragLost.child)
  }
  // Events: keyDown Shift, move, down, hold - the person's input comes at the hold (index 3).
  const control = createRunControl({ runId: 'hold' })
  const person = await launchOnFake(world({ quirks: { localInputAfter: 3 } }), { control })
  try {
    let error = null
    await assert.rejects(person.env.perform({ type: 'drag', keys: ['shift'], path: [{ x: 10, y: 10, holdMs: 500 }, { x: 40, y: 10 }] }), (e) => { error = e; return code('taken_over')(e) })
    assert.deepEqual([error.details.reason, error.details.heldKeys], ['local_input', ['SHIFT']], 'the notice can say the person\'s first key may have carried Shift')
  } finally {
    await person.env.close()
    await stopFake(person.child)
  }
})

test('a releasedStale event (a dead helper\'s held keys, released at this start) reaches state() even before the environment exists; malformed is null (G1)', async () => {
  for (const [stale, want] of [
    [{ keys: [56], buttons: ['left'], posted: 2 }, { keys: ['SHIFT'], buttons: ['left'], posted: 2 }],
    [{ keys: [], buttons: [] }, null],
    [{ keys: 'shift' }, null],
    [undefined, null],
  ]) {
    const { env, child } = await launchOnFake(world({ quirks: stale === undefined ? {} : { releasedStale: stale } }))
    try {
      assert.deepEqual(env.state().releasedStale, want, JSON.stringify(stale))
      assert.equal(env.link.lost, false, 'a known event ends nothing')
    } finally {
      await env.close()
      await stopFake(child)
    }
  }
})

test('a releasedStale event that comes before any environment exists is kept by the link and read at construction (G1)', async () => {
  let child = null
  let keptByLink = null
  const connect = async () => {
    const started = await stdioLink(world({ quirks: { releasedStale: { keys: [55], buttons: [] } } }))
    child = started.child
    // A request before the environment is built: the helper answers the driver's first request after the event.
    await started.link.request('focused', {}).catch(() => {})
    keptByLink = started.link.releasedStale
    return started.link
  }
  const env = await launchApproved(connect, { apps: [FIXTURE], seat: 'cu-developer-two', runLock: locks.next() })
  try {
    assert.deepEqual(keptByLink, { keys: [55], buttons: [] }, 'the link kept it with nobody listening (as the helper sent it)')
    assert.deepEqual(env.state().releasedStale, { keys: ['META'], buttons: [], posted: null }, 'the environment read it when built, by name')
    // One that comes later is also emitted, for a listener already there.
    const heard = []
    env.on('releasedStale', (event) => heard.push(event))
    env.link.emit('releasedStale', { keys: [58], buttons: [], posted: 1 })
    assert.deepEqual(heard, [{ keys: ['ALT'], buttons: [], posted: 1 }])
    // The very object state() returns, so agent core reports a release once whichever path saw it first (=== dedupes).
    assert.equal(env.state().releasedStale, heard[0], 'the emitted payload is the object in state()')
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('cursor_position: the helper\'s pointer in frame pixels at the run\'s scale, off-frame says so, an older helper is labelled last_pointer and null after a person (C1-C3, D5)', async () => {
  const cursorAt = async (config, options = {}, then = async () => {}) => {
    const { env, child } = await launchOnFake(config, options)
    try {
      await then(env)
      const { cursor, offFrame, source } = await env.perform({ type: 'cursor_position' })
      return { effect: { cursor, ...(offFrame === undefined ? {} : { offFrame }), source }, frame: env.frame }
    } finally {
      await env.close()
      await stopFake(child)
    }
  }
  // Scale 2 (simulated): 100,100 points is 200,200 frame pixels times the fit, per axis.
  const scaled = await cursorAt(world({ cursor: { xPt: 100, yPt: 100, display: 1 } }), { simulateScale: 2, frame: { maxLongEdge: 2000 } })
  assert.deepEqual(scaled.effect.cursor, { x: Math.round(100 * scaled.frame.scaleX), y: Math.round(100 * scaled.frame.scaleY) })
  assert.ok(scaled.frame.scaleX > 1, `a simulated scale-2 frame (${scaled.frame.scaleX})`)
  assert.equal(scaled.effect.source, 'helper')
  // A simulated 1512x982 display: a pointer at x 1600 points is off the run's frame - no coordinates.
  const region = await cursorAt(world({ cursor: { xPt: 1600, yPt: 100, display: 1 } }), { simulateScale: 2, simulateDisplay: { width: 1512, height: 982 }, frame: { maxLongEdge: 2000 } })
  assert.deepEqual(region.effect, { cursor: null, offFrame: true, source: 'helper' })
  // On another display: off the frame too.
  assert.deepEqual((await cursorAt(world({ cursor: { xPt: 10, yPt: 10, display: 7 } }))).effect, { cursor: null, offFrame: true, source: 'helper' })
  // An older helper: the last point this driver sent, labelled; after a pause and a resume there is none.
  const older = await cursorAt(world({ quirks: { noCursor: true } }), {}, (env) => env.perform({ type: 'click', x: 5, y: 5, button: 'left' }))
  assert.deepEqual(older.effect, { cursor: { x: 5, y: 5 }, source: 'last_pointer' })
  const control = createRunControl({ runId: 'cursor' })
  const resumed = await cursorAt(world({ quirks: { noCursor: true } }), { control }, async (env) => {
    await env.perform({ type: 'click', x: 5, y: 5, button: 'left' })
    assert.equal(control.send({ command: 'pause' }, { source: 'control' }).ok, true)
    assert.equal(control.send({ command: 'resume' }, { source: 'control' }).ok, true)
  })
  assert.deepEqual(resumed.effect, { cursor: null, source: 'last_pointer' }, 'the person may have moved it: the last point sent is stale')
})

test('the driver declares press_hold in actionTypes (agent core sends a long press as holdMs only then), beside every action it plans', async () => {
  const { env, child } = await launchOnFake(world())
  try {
    assert.ok(env.actionTypes.includes('press_hold'))
    for (const type of ACTION_TYPES) assert.ok(env.actionTypes.includes(type), type)
    assert.equal(env.actionTypes.includes('hold_key'), true, 'canonical since #206, so agent core offers it')
    assert.ok(Object.isFrozen(env.actionTypes))
  } finally {
    await env.close()
    await stopFake(child)
  }
})
