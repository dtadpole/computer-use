import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { fakeLauncher, logged, scratchLocks, stopFake } from './harness.mjs'

// CU-187: the desktop driver's selectionSource() - the element holding the selection when no text entry has the focus,
// as { role, tag: null, origin, caption }, the browser driver's four keys. Never a value or a title: a static text's
// own words are the value (D-060). Null on nothing selected, a malformed or out-of-scope element, an older helper.

const FIXTURE = 'ai.reflection.cu.fixture'
const locks = scratchLocks()
after(() => locks.remove())
const launchOnFake = fakeLauncher(locks, { apps: [FIXTURE] })

const world = (extra = {}) => ({
  displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 800, height: 600 }, scale: 1 }],
  apps: [{ bundleId: FIXTURE, pid: 601, title: 'Fixture', rect: { x: 0, y: 0, width: 800, height: 600 } }],
  frontmost: FIXTURE,
  ...extra,
})

async function source(extra) {
  const { env, child } = await launchOnFake(world(extra))
  try {
    await logged(child, 3)
    return await env.selectionSource()
  } finally {
    await env.close()
    await stopFake(child)
  }
}

test('CU-187: selectionSource is exactly { role, tag: null, origin, caption } - a value or title the helper sent never leaves the driver', async () => {
  const got = await source({ selection: { role: 'AXStaticText', caption: 'Passport number', bundleId: FIXTURE, pid: 601, title: 'X1234567', value: 'X1234567' } })
  assert.deepEqual(got, { role: 'AXStaticText', tag: null, origin: FIXTURE, caption: 'Passport number' })
  assert.equal(JSON.stringify(got).includes('X1234567'), false)
})

test('CU-187: the caption is trimmed and at most 80 characters; absent or not a string is null', async () => {
  const base = { role: 'AXStaticText', bundleId: FIXTURE, pid: 601 }
  assert.equal((await source({ selection: { ...base, caption: '  IBAN ' } })).caption, 'IBAN')
  assert.equal((await source({ selection: { ...base, caption: 'x'.repeat(100) } })).caption, 'x'.repeat(80))
  assert.equal((await source({ selection: base })).caption, null)
  assert.equal((await source({ selection: { ...base, caption: 7 } })).caption, null)
})

test('CU-187: null when nothing is selected, the element is malformed or of an app outside the scope, or the helper is older', async () => {
  assert.equal(await source({ selection: null }), null, 'nothing selected (or a text entry holds the focus)')
  assert.equal(await source({}), null, 'a world without a selection')
  assert.equal(await source({ selection: ['AXStaticText'] }), null, 'malformed')
  assert.equal(await source({ selection: { role: 'AXStaticText', caption: 'IBAN' } }), null, 'no bundle id')
  assert.equal(await source({ selection: { role: 'AXStaticText', caption: 'IBAN', bundleId: 'com.example.notapproved', pid: 9 } }), null, 'outside the approved apps')
  assert.equal(await source({ quirks: { noSelection: true }, selection: { role: 'AXStaticText', caption: 'IBAN', bundleId: FIXTURE, pid: 601 } }), null, 'an older helper refuses selection unknown_request')
})
