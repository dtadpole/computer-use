import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { EnvironmentError } from '../../_environments_/macos-desktop/errors.mjs'
import { MENU_CLOSE_MS } from '../../_environments_/macos-desktop/environment.mjs'
import { fakeLauncher, logged, scratchLocks, stopFake } from './harness.mjs'

/**
 * CU-201 (found live by cu-verifier): while a menu is still closing after one of its items was clicked, the next click
 * of the same batch is consumed by the menu, so a batch "Edit > Copy, click the destination, Command-V" pasted back into
 * the source entry. A click whose hit test named an AXMenuItem now resolves only after MENU_CLOSE_MS, so the batch's
 * next action - and agent core's target read for it - meets the window behind the menu.
 *
 * Wall-clock only bounds what load cannot break. A wait is a LOWER bound (load only lengthens a click), so the menu
 * item's click is checked at a short WAIT. "No wait" is an UPPER bound, and a click under suite load has spiked past
 * 1 s on main (CU-201 row, 14 gate first runs on 11-12 Nov), so it is checked against MENU_CLOSE_CAP_MS (5 s): a click
 * that waited takes 5 s or more, and one that did not stays far under NO_WAIT_BOUND even in a spike.
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
  elements: [
    { rect: box(100, 100, 120, 22), element: { bundleId: FIXTURE, pid: 601, role: 'AXMenuItem', subrole: null, title: 'Copy', frame: box(100, 100, 120, 22), secure: false } },
    { rect: box(100, 300, 100, 30), element: { bundleId: FIXTURE, pid: 601, role: 'AXButton', subrole: null, title: 'Save', frame: box(100, 300, 100, 30), secure: false } },
  ],
}
const WAIT = 400
// The validated cap (menuCloseMs above it is refused, the third row), used where a row proves that a click does NOT wait.
const CAP = 5000
const NO_WAIT_BOUND = CAP / 2
const timed = async (promise) => { const start = Date.now(); await promise; return Date.now() - start }

async function withEnv(options, body) {
  const { env, child } = await launchOnFake(WORLD, options)
  await logged(child, 3)
  try {
    await body(env)
  } finally {
    await env.close().catch(() => {})
    await stopFake(child)
  }
}

test('CU-201: a click that chooses a menu item resolves only once the menu has had time to close; a button click and a hover over the item do not wait', async () => {
  await withEnv({ menuCloseMs: WAIT }, async (env) => {
    const menu = await timed(env.perform({ type: 'click', x: 150, y: 110, button: 'left' }))
    assert.ok(menu >= WAIT - 20, `the menu item's click waited ${menu} ms`)
  })
  // At the cap, a click or move that waited would take 5 s; one that did not is far under the bound, load or not.
  await withEnv({ menuCloseMs: CAP }, async (env) => {
    const button = await timed(env.perform({ type: 'click', x: 140, y: 315, button: 'left' }))
    assert.ok(button < NO_WAIT_BOUND, `a button's click is not delayed (${button} ms, the wait would be ${CAP} ms)`)
    const hover = await timed(env.perform({ type: 'move', x: 150, y: 110 }))
    assert.ok(hover < NO_WAIT_BOUND, `a move over the item chooses nothing, so no wait (${hover} ms, the wait would be ${CAP} ms)`)
  })
})

test('CU-201: menuCloseMs 0 turns the wait off; the default sits above the measured ~555 ms an item takes to fire', async () => {
  await withEnv({ menuCloseMs: 0 }, async (env) => {
    // The driver keeps the option as given, and a 0 wait resolves at once. The wall clock is only a sanity bound here,
    // with room for a load spike: an upper bound near a wait is what flaked (see the header).
    assert.equal(env.menuCloseMs, 0)
    const menu = await timed(env.perform({ type: 'click', x: 150, y: 110, button: 'left' }))
    assert.ok(menu < NO_WAIT_BOUND, `off: ${menu} ms`)
  })
  assert.ok(MENU_CLOSE_MS > 555 && MENU_CLOSE_MS <= 1000, `MENU_CLOSE_MS is ${MENU_CLOSE_MS}`)
})

test('CU-201: menuCloseMs is a whole number of milliseconds from 0 to the cap', async () => {
  for (const bad of [-1, 1.5, 6000, '800']) {
    let started = null
    try {
      await assert.rejects(launchOnFake(WORLD, { menuCloseMs: bad }).then((launched) => { started = launched }),
        (e) => e instanceof EnvironmentError && e.details?.field === 'menuCloseMs', `refused ${JSON.stringify(bad)}`)
    } finally {
      // A launch that wrongly succeeds is closed, so a failing check never leaves a fake helper alive.
      if (started !== null) {
        await started.env.close().catch(() => {})
        await stopFake(started.child)
      }
    }
  }
})
