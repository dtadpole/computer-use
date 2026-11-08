import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { launchDesktopEnvironment } from '../../_environments_/macos-desktop/environment.mjs'
import { EnvironmentError } from '../../_environments_/macos-desktop/errors.mjs'
import { logged, scratchLocks, stdioLink, stopFake } from './harness.mjs'

/**
 * CU-60 (parity: ChatGPT's desktop computer use covers every display), the dry-run half: the real driver on the fake
 * helper's multi-display world, no second display needed. The run's frame is the display of the first approved app
 * (CU-68, refitFrameAtFirstApp); a frame point reaches the helper as a global point on that display, whatever side of
 * the main display it sits on; a point past the frame - the part of a window that spans onto another display - is
 * refused with a reason and nothing is posted (never clamped onto the wrong display). The live half waits for a real
 * second display (a named limit on this single-display Mac).
 */

const FIXTURE = 'com.example.fixture'
const SEAT = 'cu-developer-two'
const locks = scratchLocks()
after(() => locks.cleanup?.())
const MAIN = { id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 800, height: 600 }, scale: 1 }

async function launchOn(config, options = {}) {
  let child = null
  const connect = async () => {
    const started = await stdioLink(config)
    child = started.child
    return started.link
  }
  const env = await launchDesktopEnvironment({ apps: [FIXTURE], seat: SEAT, runLock: locks.next(), connect, ...options })
  return { env, child }
}

const inputs = (child) => child.requests.filter((r) => r.type === 'input')
const firstMove = (request) => request.events.find((e) => e.kind === 'move')

test('A: an app on a display to the right of the main one - the frame moves there and an interior click is that display\'s global point', async () => {
  const right = { id: 2, main: false, originPt: { x: 800, y: 0 }, sizePt: { width: 1024, height: 768 }, scale: 1 }
  const { env, child } = await launchOn({ displays: [MAIN, right], scopeDisplay: 2, apps: [{ bundleId: FIXTURE, pid: 501, rect: { x: 800, y: 0, width: 1024, height: 768 } }] }, { refitFrameAtFirstApp: true })
  try {
    await env.addApp(FIXTURE)
    assert.deepEqual([env.frame.display, env.frame.originPt], [2, { x: 800, y: 0 }])
    const sx = env.frame.width / right.sizePt.width
    const effect = await env.perform({ type: 'click', x: Math.round(300 * sx), y: Math.round(200 * sx), button: 'left' })
    assert.equal(effect.mapping.display, 2)
    await logged(child, child.requests.length)
    const move = firstMove(inputs(child).at(-1))
    assert.ok(Math.abs(move.x - 1100) <= 1 && Math.abs(move.y - 200) <= 1, `posted at (${move.x}, ${move.y}), expected (1100, 200) on display 2`)
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('B: an app on a Retina display above the main one (negative y) - an interior frame pixel maps to points on that display', async () => {
  const above = { id: 3, main: false, originPt: { x: 0, y: -768 }, sizePt: { width: 1024, height: 768 }, scale: 2 }
  const { env, child } = await launchOn({ displays: [MAIN, above], scopeDisplay: 3, apps: [{ bundleId: FIXTURE, pid: 501, rect: { x: 0, y: -768, width: 1024, height: 768 } }] }, { refitFrameAtFirstApp: true })
  try {
    await env.addApp(FIXTURE)
    assert.deepEqual([env.frame.display, env.frame.originPt], [3, { x: 0, y: -768 }])
    // Frame pixels to points per axis: the frame's width over the display's points.
    const px = env.frame.width / above.sizePt.width
    const py = env.frame.height / above.sizePt.height
    await env.perform({ type: 'click', x: Math.round(400 * px), y: Math.round(300 * py), button: 'left' })
    await logged(child, child.requests.length)
    const move = firstMove(inputs(child).at(-1))
    assert.ok(Math.abs(move.x - 400) <= 1 && Math.abs(move.y - (-768 + 300)) <= 1, `posted at (${move.x}, ${move.y}), expected (400, -468) above the main display`)
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('C: a window spanning two displays with the run on the main one - points inside the frame post; a point past its edge (the window\'s part on the other display) is refused, nothing posted', async () => {
  const left = { id: 2, main: false, originPt: { x: -1024, y: 0 }, sizePt: { width: 1024, height: 768 }, scale: 1 }
  // The run stays on the main display (no refit); the window reaches 200 pt onto the display to its left.
  const { env, child } = await launchOn({ displays: [MAIN, left], apps: [{ bundleId: FIXTURE, pid: 501, rect: { x: -200, y: 100, width: 700, height: 400 } }] })
  try {
    await env.addApp(FIXTURE)
    assert.deepEqual([env.frame.display, env.frame.originPt], [1, { x: 0, y: 0 }])
    await env.perform({ type: 'click', x: 10, y: 150, button: 'left' })
    await logged(child, child.requests.length)
    assert.deepEqual([firstMove(inputs(child).at(-1)).x, firstMove(inputs(child).at(-1)).y], [10, 150], 'the window\'s part on the run\'s display takes the click')
    const before = inputs(child).length
    // Both edges: the window's part on the display to the left, and points at or past the frame's right edge.
    for (const x of [-1, -150, env.frame.width, env.frame.width + 150]) {
      await assert.rejects(env.perform({ type: 'click', x, y: 150, button: 'left' }), (error) => {
        assert.ok(error instanceof EnvironmentError, String(error))
        assert.match(error.message, /frame|outside/i, `named: ${error.code}: ${error.message}`)
        return true
      })
    }
    assert.equal(inputs(child).length, before, 'nothing posted for a point on the other display - never clamped onto the wrong one')
  } finally {
    await env.close()
    await stopFake(child)
  }
})
