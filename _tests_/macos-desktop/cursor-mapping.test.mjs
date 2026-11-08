import assert from 'node:assert/strict'
import { test } from 'node:test'

import { launchApproved, scratchLocks, stdioLink, stopFake } from './harness.mjs'

// CU-125 (cu-researcher): the helper's cursor goes through the driver's toFrame - the same transform as the screenshot -
// under a simulated display and scale. Inside the simulated region it is the frame pixel the screenshot shows; just
// outside it, or on another display, it is offFrame with no coordinates the model could act on.

const FIXTURE = 'com.example.fixture'
const locks = scratchLocks()
const MAIN = { id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 1728, height: 1117 }, scale: 1 }
const SIDE = { id: 2, main: false, originPt: { x: 1728, y: 0 }, sizePt: { width: 1920, height: 1080 }, scale: 1 }

async function cursorAt(cursor) {
  let child = null
  const config = { displays: [MAIN, SIDE], apps: [{ bundleId: FIXTURE, pid: 501, rect: { x: 100, y: 100, width: 800, height: 600 } }], cursor }
  const env = await launchApproved(async () => { const s = await stdioLink(config); child = s.child; return s.link }, {
    apps: [FIXTURE], seat: 'cu-developer-one', runLock: locks.next(), simulateDisplay: { width: 1512, height: 982 }, simulateScale: 2,
  })
  try {
    return { frame: env.frame, effect: await env.perform({ type: 'cursor_position' }) }
  } finally {
    await env.close()
    await stopFake(child)
  }
}

test('under --simulate-display 1512x982 and --simulate-scale 2 the cursor maps as the screenshot does', async () => {
  const inside = await cursorAt({ xPt: 700, yPt: 400, display: 1 })
  assert.deepEqual([inside.frame.width, inside.frame.height, inside.frame.scaleX, inside.frame.scaleY], [3024, 1964, 2, 2])
  assert.deepEqual([inside.effect.cursor, inside.effect.source], [{ x: 1400, y: 800 }, 'helper'], 'the frame pixel the screenshot shows')

  const pastEdge = await cursorAt({ xPt: 1520, yPt: 400, display: 1 })
  assert.deepEqual([pastEdge.effect.cursor, pastEdge.effect.offFrame], [null, true], 'just outside the simulated region: off the frame')

  const otherDisplay = await cursorAt({ xPt: 1800, yPt: 300, display: 2 })
  assert.deepEqual([otherDisplay.effect.cursor, otherDisplay.effect.offFrame], [null, true], 'on another display: off the frame')
  for (const effect of [pastEdge.effect, otherDisplay.effect]) assert.equal(JSON.stringify(effect.cursor), 'null', 'no coordinates off the frame')
})
