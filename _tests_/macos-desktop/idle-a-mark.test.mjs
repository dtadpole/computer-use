import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { fakeLauncher, logged, scratchLocks, stopFake } from './harness.mjs'

/**
 * Idle (A), the driver's half: the run's lock entry learns, through the slot's optional `mark(patch)`, that the
 * local-input pause is armed (`{ armed: true }` once the helper confirms it), when the person last touched the Mac
 * while it was (`{ lastOwnerInputAt }`, epoch ms, from each `localInput` event - a settle's too), and that it is no
 * longer armed (`{ armed: false }` before the lock is released, or when the helper is lost). The lock (run-lock.mjs)
 * judges an armed run's owner idle from these instead of HIDIdleTime, which the run's own synthetic input resets.
 * A slot without `mark` (older lock code, a seam) keeps working unchanged. On the fake helper.
 */

const FIXTURE = 'ai.reflection.cu.fixture'
const locks = scratchLocks()
after(() => locks.remove())
const launchOnFake = fakeLauncher(locks, { apps: [FIXTURE] })

const box = (x, y, width, height) => ({ x, y, width, height })
const WORLD = {
  displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 800, height: 600 }, scale: 1 }],
  apps: [{ bundleId: FIXTURE, pid: 601, title: 'CU Fixture', rect: box(0, 0, 800, 600) }],
  frontmost: FIXTURE,
  elements: [{ rect: box(100, 300, 100, 30), element: { bundleId: FIXTURE, pid: 601, role: 'AXButton', subrole: null, title: 'Save', frame: box(100, 300, 100, 30), secure: false } }],
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function markingSeam() {
  const calls = []
  let released = false
  return {
    calls,
    released: () => released,
    seam: () => ({ release() { calls.push({ released: true }); released = true }, mark(patch) { calls.push({ ...patch }) } }),
  }
}

test('idle (A): armed once the pause is confirmed, each local input stamped as epoch ms, disarmed before the lock is released', async () => {
  const lock = markingSeam()
  const control = createRunControl({ runId: 'idle-a' })
  const before = Date.now()
  const { env, child } = await launchOnFake({ ...WORLD, quirks: { localInputAfter: 1 } }, { runLock: lock.seam, control })
  try {
    await logged(child, 3)
    assert.deepEqual(lock.calls[0], { armed: true }, 'the first mark is the armed pause')
    await assert.rejects(env.perform({ type: 'click', x: 140, y: 315, button: 'left' }), (e) => e.code === 'taken_over')
    await pause(20)
    const stamps = lock.calls.filter((c) => 'lastOwnerInputAt' in c)
    assert.ok(stamps.length >= 1, 'the local input is stamped')
    for (const { lastOwnerInputAt } of stamps) {
      assert.equal(typeof lastOwnerInputAt, 'number')
      assert.ok(lastOwnerInputAt >= before - 1000 && lastOwnerInputAt <= Date.now() + 1000, 'epoch ms near now')
    }
    assert.ok(stamps.every((s) => Object.keys(s).length === 1), 'a stamp carries the time alone - never a key or a place')
  } finally {
    await env.close()
    await stopFake(child)
  }
  const last = lock.calls.slice(-2)
  assert.deepEqual(last, [{ armed: false }, { released: true }], 'disarmed, then released - in that order')
  assert.equal(lock.calls.filter((c) => c.armed === true).length, 1, 'armed once')
})

test('idle (A): a slot without mark() keeps working - the run arms, acts and releases as before', async () => {
  let released = 0
  const { env, child } = await launchOnFake(WORLD, { runLock: () => ({ release() { released += 1 } }) })
  try {
    await logged(child, 3)
    await env.perform({ type: 'click', x: 140, y: 315, button: 'left' })
    assert.equal(env.state().pauseArmed, true)
  } finally {
    await env.close()
    await stopFake(child)
  }
  assert.equal(released, 1)
})

test('idle (A): a mark() that throws is best effort - the run is not stopped by its own lock bookkeeping', async () => {
  const { env, child } = await launchOnFake(WORLD, { runLock: () => ({ release() {}, mark() { throw new Error('lock file gone') } }) })
  try {
    await logged(child, 3)
    await env.perform({ type: 'click', x: 140, y: 315, button: 'left' })
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('idle (A): an arm without the event tap (idle counter only) never marks the entry armed - the lock keeps reading HIDIdleTime', async () => {
  const lock = markingSeam()
  const { env, child } = await launchOnFake({ ...WORLD, grants: { screen: true, accessibility: false, listenEvents: false }, quirks: { localInputAfter: 1 } }, { runLock: lock.seam })
  try {
    await logged(child, 3)
    assert.equal(env.state().pauseArmed, true, 'the pause itself is armed (idle counter)')
    await env.perform({ type: 'click', x: 140, y: 315, button: 'left' }).catch(() => {})
    await pause(20)
  } finally {
    await env.close()
    await stopFake(child)
  }
  assert.deepEqual(lock.calls, [{ released: true }], 'no armed, no stamp, no disarm - only the release')
})

test('idle (A): an async mark() that rejects (the lock\'s mutex timing out) is swallowed - no unhandled rejection, the run goes on', async () => {
  const unhandled = []
  const onUnhandled = (reason) => unhandled.push(reason)
  process.on('unhandledRejection', onUnhandled)
  const { env, child } = await launchOnFake(WORLD, { runLock: () => ({ release() {}, async mark() { throw new Error('mutex timed out') } }) })
  try {
    await logged(child, 3)
    await env.perform({ type: 'click', x: 140, y: 315, button: 'left' })
  } finally {
    await env.close()
    await stopFake(child)
  }
  await pause(20)
  process.off('unhandledRejection', onUnhandled)
  assert.deepEqual(unhandled, [])
})
