import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { EnvironmentError } from '../../_environments_/macos-desktop/errors.mjs'
import { fakeLauncher, logged, pause, scratchLocks, stopFake } from './harness.mjs'

/**
 * The driver's half of file panels (file-panels.md, Q-D13): the helper reports an open or save panel it attributed to
 * an approved app as that app plus `hostedBy`, and the driver's three guards then see the approved app with no special
 * case - the capture with the panel is kept, its watch frames reach the viewer, a click on it passes the target check.
 * A panel-service window the helper did not attribute (a floating panel, an out-of-scope client) stays another app:
 * the target check refuses it, and the helper's capture never shows it.
 */

const FIXTURE = 'ai.reflection.cu.fixture'
const PANEL = 'com.apple.appkit.xpc.openAndSavePanelService'
const locks = scratchLocks()
after(() => locks.remove())
const launchOnFake = fakeLauncher(locks, { apps: [FIXTURE] })

// Global = frame here (origin 0,0). Listed front to back: the attributed sheet over CU Fixture, an unattributed panel
// on the right, then CU Fixture's window.
const WORLD = {
  displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 800, height: 600 }, scale: 1 }],
  apps: [
    { bundleId: FIXTURE, pid: 601, title: 'Save', rect: { x: 100, y: 100, width: 200, height: 150 }, hostedBy: PANEL },
    { bundleId: PANEL, pid: 777, title: 'Open', rect: { x: 500, y: 100, width: 200, height: 150 } },
    { bundleId: FIXTURE, pid: 601, title: 'CU Fixture', rect: { x: 0, y: 0, width: 450, height: 600 } },
  ],
  frontmost: FIXTURE,
}

const code = (expected) => (error) => error instanceof EnvironmentError && error.code === expected

async function launched(config = WORLD) {
  const started = await launchOnFake(config)
  await logged(started.child, 3)
  return started
}

test('an attributed panel passes all three guards; an unattributed panel-service window is refused at its point', async () => {
  const { env, child } = await launched()
  try {
    // capture_leak: the capture naming the attributed sheet (the client's bundle id, hostedBy) is kept.
    const shot = await env.perform({ type: 'screenshot' })
    assert.ok(shot, 'the capture with the attributed panel is not refused')
    // Watch frames naming it reach the viewer; none is dropped as a leak.
    const frames = []
    const stop = await env.startScreencast({ onFrame: (frame) => frames.push(frame), fps: 2 })
    for (const deadline = Date.now() + 1_500; frames.length === 0 && Date.now() < deadline;) await pause(20)
    await stop()
    assert.equal(frames.length > 0 && env.leakedFrames === 0, true, 'watch frames with the attributed panel reach the viewer')
    // The target check: a click on the sheet passes and is posted; one on the unattributed panel is refused unposted.
    await env.perform({ type: 'click', x: 150, y: 150, button: 'left' })
    const posted = child.requests.filter((r) => r.type === 'input').length
    assert.equal(posted, 1, 'the click on the attributed panel was posted')
    await assert.rejects(env.perform({ type: 'click', x: 550, y: 150, button: 'left' }),
      (e) => code('out_of_scope')(e) && e.details?.reason === 'target_out_of_scope' && e.details.bundleId === PANEL)
    assert.equal(child.requests.filter((r) => r.type === 'input').length, posted, 'nothing posted on the unattributed panel')
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('a hit test the helper refuses for another app (D-045 mismatch) is refused unposted, keeping the app it named for the person', async () => {
  const { env, child } = await launched({ ...WORLD, quirks: { hitTestRefusesFor: PANEL } })
  try {
    await assert.rejects(env.perform({ type: 'click', x: 150, y: 150, button: 'left' }),
      (e) => code('out_of_scope')(e) && e.details?.reason === 'target_out_of_scope' && e.details.bundleId === PANEL)
    assert.equal(child.requests.filter((r) => r.type === 'input').length, 0, 'nothing posted')
  } finally {
    await env.close()
    await stopFake(child)
  }
})
