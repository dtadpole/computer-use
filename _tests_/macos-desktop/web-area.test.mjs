import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { after, test } from 'node:test'

import { fakeLauncher, scratchLocks, stopFake } from './harness.mjs'

/**
 * CU-322 (D-089, the driver's part): the helper's `inWebArea` - the element is, or descends from, a browser's AXWebArea -
 * reaches agent core on every target the driver describes, at a point and where focus is, so the policy can refuse a
 * browser's exposed page (Safari; Chrome with accessibility on) on the desktop route while the browser's own chrome
 * (its address bar, tabs and menus) stays judged as today.
 */

const SAFARI = 'com.apple.Safari'
const locks = scratchLocks()
after(() => locks.remove())
const launchOnFake = fakeLauncher(locks)

const cell = (col, row) => ({ x: col * 100, y: row * 100, width: 100, height: 100 })
const element = (col, row, fields) => ({ rect: cell(col, row), element: { bundleId: SAFARI, pid: 701, subrole: null, secure: false, frame: { ...cell(col, row), width: 90, height: 20 }, ...fields } })

function webWorld(focused) {
  return {
    apps: [{ bundleId: SAFARI, pid: 701, rect: { x: 0, y: 0, width: 400, height: 400 } }],
    elements: [
      element(0, 0, { role: 'AXTextField', title: 'Address and search', inWebArea: false }),
      element(1, 0, { role: 'AXButton', title: 'Buy now', inWebArea: true }),
      element(2, 0, { role: 'AXTextField', title: 'Card number', inWebArea: true }),
      element(3, 0, { role: 'AXWebArea', title: null, opaque: true, inWebArea: true }),
      element(0, 1, { role: 'AXButton', title: 'Reload' }),
    ],
    ...(focused ? { focused } : {}),
  }
}

test('CU-322: a target inside a browser\'s web area says so; the address bar says not; a helper that does not say gives null', async () => {
  const { env, child } = await launchOnFake(webWorld(), { apps: [SAFARI] })
  try {
    const at = async (x, y) => {
      const target = await env.inspectPoint({ x, y })
      return [target.role, target.name, target.inWebArea]
    }
    assert.deepEqual(await at(150, 50), ['AXButton', 'Buy now', true], "a page's button: descends from the web area")
    assert.deepEqual(await at(250, 50), ['AXTextField', 'Card number', true], "a page's text field")
    assert.deepEqual(await at(350, 50), ['AXWebArea', null, true], 'the web area itself')
    assert.deepEqual(await at(50, 50), ['AXTextField', 'Address and search', false], "the browser's own address bar: not web content")
    assert.deepEqual(await at(50, 150), ['AXButton', 'Reload', null], 'no word from the helper: unknown, never false')
    const buy = await env.inspectPoint({ x: 150, y: 50 })
    const { inWebArea, ...rest } = buy
    assert.equal(inWebArea, true)
    assert.ok(!Object.keys(rest).includes('inWebArea'))
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('CU-322: the focused element carries inWebArea too, for keys and typing', async () => {
  const focused = { bundleId: SAFARI, pid: 701, role: 'AXTextField', subrole: null, title: 'Card number', frame: { x: 200, y: 0, width: 90, height: 20 }, secure: false, inWebArea: true }
  const { env, child } = await launchOnFake(webWorld(focused), { apps: [SAFARI] })
  try {
    const target = await env.focusedElement()
    assert.deepEqual([target.role, target.name, target.inWebArea], ['AXTextField', 'Card number', true])
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('CU-322: inWebArea stays outside the fingerprint - bundle id, role, title and frame, as before', async () => {
  const { env, child } = await launchOnFake(webWorld(), { apps: [SAFARI] })
  try {
    const buy = await env.inspectPoint({ x: 150, y: 50 })
    const expected = createHash('sha256').update([SAFARI, 'AXButton', 'Buy now', 100, 0, 90, 20].join('|')).digest('hex').slice(0, 32)
    assert.equal(buy.fingerprint, expected)
  } finally {
    await env.close()
    await stopFake(child)
  }
})
