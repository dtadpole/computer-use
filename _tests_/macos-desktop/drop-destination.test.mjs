import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { fakeLauncher, logged, scratchLocks, stopFake } from './harness.mjs'

// CU-392 / CU-387 (helper 0.2.67): the driver carries the helper's dropDestination (one of three values) and the file a
// row's child lends from its row (shape 1: the element's own filename/url fields) - nothing else.

const FINDER = 'com.apple.finder'
const locks = scratchLocks()
after(() => locks.remove())
const launchOnFake = fakeLauncher(locks, { apps: [FINDER] })
const TILE = { bundleId: FINDER, pid: 701, role: 'AXButton', subrole: null, title: 'Alex', frame: { x: 20, y: 100, width: 120, height: 120 }, secure: false, editable: false }
const world = (value) => ({
  displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 800, height: 600 }, scale: 1 }],
  apps: [{ bundleId: FINDER, pid: 701, title: 'Finder', rect: { x: 0, y: 0, width: 800, height: 600 } }],
  frontmost: FINDER,
  elements: [{ rect: value.frame, element: value }],
  focused: value,
})

async function hit(value) {
  const { env, child } = await launchOnFake(world(value))
  try {
    await logged(child, 3)
    return await env.inspectPoint({ x: 50, y: 150 })
  } finally {
    await env.close()
    await stopFake(child)
  }
}

test('CU-392: dropDestination airdrop, shared and server pass; anything else carries none', async () => {
  for (const value of ['airdrop', 'shared', 'server']) assert.equal((await hit({ ...TILE, dropDestination: value })).dropDestination, value)
  for (const value of ['AirDrop', 'local', '', 7, null]) assert.equal((await hit({ ...TILE, dropDestination: value })).dropDestination, undefined, String(value))
})

test('CU-387: a row text carrying its row\'s file (shape 1) reaches the target as filename and url leaf', async () => {
  const text = await hit({ ...TILE, role: 'AXStaticText', title: null, filename: 'install.command', url: 'file:///tmp/cu-fixture-sandbox/install.command', fileFrom: 'ancestor' })
  assert.deepEqual([text.role, text.filename, text.url], ['AXStaticText', 'install.command', 'install.command'])
})
