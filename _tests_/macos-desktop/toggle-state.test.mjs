import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { fakeLauncher, logged, scratchLocks, stopFake } from './harness.mjs'

// CU-418 (b) (helper 0.2.70): the driver passes a checkbox, switch or radio button's state as `checked` - true, false or
// 'mixed' as the helper read its AXValue; anything else, or an older helper, carries no key. Outside the fingerprint.

const FIXTURE = 'ai.reflection.cu.fixture'
const locks = scratchLocks()
after(() => locks.remove())
const launchOnFake = fakeLauncher(locks, { apps: [FIXTURE] })

const SWITCH = { bundleId: FIXTURE, pid: 601, role: 'AXCheckBox', subrole: 'AXSwitch', title: 'Camera', frame: { x: 100, y: 60, width: 120, height: 24 }, secure: false, editable: false }
const world = (element) => ({
  displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 800, height: 600 }, scale: 1 }],
  apps: [{ bundleId: FIXTURE, pid: 601, title: 'Fixture', rect: { x: 0, y: 0, width: 800, height: 600 } }],
  frontmost: FIXTURE,
  elements: [{ rect: element.frame, element }],
  focused: element,
})

async function focusedWith(extra) {
  const { env, child } = await launchOnFake(world({ ...SWITCH, ...extra }))
  try {
    await logged(child, 3)
    return await env.focusedElement()
  } finally {
    await env.close()
    await stopFake(child)
  }
}

test('CU-418 (b) driver: a switch read on is checked true, off false, and mixed stays mixed', async () => {
  assert.equal((await focusedWith({ checked: true })).checked, true)
  assert.equal((await focusedWith({ checked: false })).checked, false)
  assert.equal((await focusedWith({ checked: 'mixed' })).checked, 'mixed')
})

test('CU-418 (b) driver: no state (an older helper) or a malformed one carries no key; the fingerprint ignores the state', async () => {
  const none = await focusedWith({})
  assert.equal(Object.hasOwn(none, 'checked'), false)
  assert.equal(Object.hasOwn(await focusedWith({ checked: 1 }), 'checked'), false)
  assert.equal(Object.hasOwn(await focusedWith({ checked: 'on' }), 'checked'), false)
  assert.equal((await focusedWith({ checked: true })).fingerprint, none.fingerprint, 'the same switch is the same target whichever way it is set')
})
