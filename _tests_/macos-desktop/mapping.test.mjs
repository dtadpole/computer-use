import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { fakeLauncher, pause, scratchLocks, stopFake } from './harness.mjs'

/**
 * C7 (agent-core-changes.md, cu-verifier's desktop-trajectory T3): every pointer action's effect carries the mapping
 * its frame points went through - `{ frameScaleX, frameScaleY, originPt, display }`, the names of
 * capture-and-scaling.md (global = originPt + (x / frameScaleX, y / frameScaleY), rounded) - so agent core can copy it
 * onto the done record and a replay can tell where a click landed. Each case checks the mapping against the points the
 * fake helper actually received; actions that map no frame point carry none.
 */

const FIXTURE = 'com.example.fixture'
const locks = scratchLocks()
after(() => locks.remove())
const launchOnFake = fakeLauncher(locks)

/** The global point a mapping gives for a frame point, as the design writes it. */
const viaMapping = (mapping, { x, y }) => ({ x: Math.round(mapping.originPt.x + x / mapping.frameScaleX), y: Math.round(mapping.originPt.y + y / mapping.frameScaleY) })
const inputsOf = (child) => child.requests.filter((r) => r.type === 'input')
const lastInput = (child) => inputsOf(child).at(-1)
const pointsOf = (events) => events.filter((e) => typeof e.x === 'number').map(({ x, y }) => ({ x, y }))

/** A display away from the global origin, so a mapping that forgot `originPt` cannot pass. */
function world(scale = 1) {
  return {
    displays: [{ id: 4, main: true, originPt: { x: 100, y: 50 }, sizePt: { width: 400, height: 300 }, scale }],
    apps: [{ bundleId: FIXTURE, pid: 501, rect: { x: 100, y: 50, width: 400, height: 300 } }],
  }
}

/**
 * Run `action` and return its effect and the request the helper got for it. Waits for the input request itself: the
 * driver's target check sends one or two `hitTest` requests before it (D-036), and stderr may trail the reply.
 */
async function performed(env, child, action) {
  const before = inputsOf(child).length
  const effect = await env.perform(action)
  for (const deadline = Date.now() + 2000; inputsOf(child).length <= before && Date.now() < deadline;) await pause(5)
  return { effect, sent: lastInput(child) }
}

test('a click at scale 1 carries the mapping it was sent with: frame scale 1, the display\'s origin, the display', async () => {
  const { env, child } = await launchOnFake(world(1))
  try {
    const { effect, sent } = await performed(env, child, { type: 'click', x: 37, y: 211, button: 'left' })
    assert.deepEqual(effect.mapping, { frameScaleX: 1, frameScaleY: 1, originPt: { x: 100, y: 50 }, display: 4 })
    assert.deepEqual(sent.events[0], { kind: 'move', x: 137, y: 261, flags: 0 })
    assert.deepEqual(viaMapping(effect.mapping, { x: 37, y: 211 }), { x: 137, y: 261 }, 'the recorded mapping reproduces the point posted')
    assert.equal(JSON.stringify(effect.mapping), JSON.stringify(JSON.parse(JSON.stringify(effect.mapping))), 'plain data, safe to record')
    assert.equal(Object.isFrozen(effect.mapping), false)
    effect.mapping.originPt.x = 0
    assert.equal(env.frame.originPt.x, 100, 'a fresh object: changing it never moves the frame')
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('under simulateScale 2 the mapping says frame scale 2, and halves each frame point onto the point the helper got', async () => {
  const { env, child } = await launchOnFake(world(1), { simulateScale: 2 })
  try {
    const { effect, sent } = await performed(env, child, { type: 'click', x: 401, y: 101, button: 'left' })
    assert.deepEqual(effect.mapping, { frameScaleX: 2, frameScaleY: 2, originPt: { x: 100, y: 50 }, display: 4 })
    assert.deepEqual(pointsOf(sent.events)[0], { x: 301, y: 101 }, '100 + 401 / 2 rounded, 50 + 101 / 2 rounded')
    assert.deepEqual(viaMapping(effect.mapping, { x: 401, y: 101 }), pointsOf(sent.events)[0])
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('a Retina display and a fractional fit: each axis keeps its own scale, and every pointer action\'s mapping reproduces every point posted', async () => {
  const retina = await launchOnFake(world(2))
  try {
    const { effect } = await performed(retina.env, retina.child, { type: 'move', x: 797, y: 597 })
    assert.deepEqual([effect.mapping.frameScaleX, effect.mapping.frameScaleY], [2, 2])
  } finally {
    await retina.env.close()
    await stopFake(retina.child)
  }
  const fractional = {
    displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 1000, height: 777 }, scale: 1 }],
    apps: [{ bundleId: FIXTURE, pid: 501, rect: { x: 0, y: 0, width: 1000, height: 777 } }],
  }
  const { env, child } = await launchOnFake(fractional, { simulateScale: 2, frame: { maxLongEdge: 1500 } })
  try {
    const pointer = [
      [{ type: 'click', x: 1499, y: 1164, button: 'right' }, [{ x: 1499, y: 1164 }]],
      [{ type: 'double_click', x: 3, y: 7 }, [{ x: 3, y: 7 }]],
      [{ type: 'triple_click', x: 750, y: 500 }, [{ x: 750, y: 500 }]],
      [{ type: 'move', x: 11, y: 13 }, [{ x: 11, y: 13 }]],
      [{ type: 'scroll', x: 600, y: 400, scroll_x: 0, scroll_y: 90 }, [{ x: 600, y: 400 }]],
      [{ type: 'drag', path: [{ x: 10, y: 10 }, { x: 900, y: 700 }] }, [{ x: 10, y: 10 }, { x: 900, y: 700 }]],
    ]
    for (const [action, framePoints] of pointer) {
      const { effect, sent } = await performed(env, child, action)
      const { mapping } = effect
      assert.equal(mapping.frameScaleX, 1.5, action.type)
      assert.equal(mapping.frameScaleY, 1165 / 777, action.type)
      assert.deepEqual([mapping.originPt, mapping.display], [{ x: 0, y: 0 }, 1], action.type)
      const posted = pointsOf(sent.events)
      assert.deepEqual(posted[0], viaMapping(mapping, framePoints[0]), `${action.type}: first point`)
      assert.deepEqual(posted.at(-1), viaMapping(mapping, framePoints.at(-1)), `${action.type}: last point`)
    }
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('actions that map no frame point carry no mapping: keys, text, wait, screenshot, zoom, cursor_position', async () => {
  const { env, child } = await launchOnFake(world(1))
  try {
    await env.perform({ type: 'click', x: 5, y: 5, button: 'left' })
    for (const action of [
      { type: 'keypress', keys: ['ENTER'] },
      { type: 'type', text: 'hello' },
      { type: 'wait', duration_ms: 1 },
      { type: 'screenshot' },
      { type: 'zoom', region: [0, 0, 100, 100] },
      { type: 'cursor_position' },
    ]) {
      const effect = await env.perform(action)
      assert.equal(Object.hasOwn(effect, 'mapping'), false, action.type)
    }
    // The helper reports the pointer in global points (the fake's 100,100); the answer is that point in frame pixels.
    const f = env.frame
    const want = { x: Math.round((100 - f.originPt.x) * f.scaleX), y: Math.round((100 - f.originPt.y) * f.scaleY) }
    assert.deepEqual((await env.perform({ type: 'cursor_position' })).cursor, want, 'cursor_position answers in frame pixels, so it maps nothing')
  } finally {
    await env.close()
    await stopFake(child)
  }
})
