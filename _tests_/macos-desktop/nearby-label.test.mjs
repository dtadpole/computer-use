import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { fakeLauncher, logged, scratchLocks, stopFake } from './harness.mjs'

// CU-361 (helper 0.2.64): the desktop driver carries an unnamed entry's layout label - the static text the helper finds
// beside it (left on its row, else just above it), reported only when the entry has no title, caption or placeholder -
// as target.nearbyLabel: a trimmed string of at most 80 characters (longer is none, never cut) or null. Agent core uses
// it upgrade-only; outside the fingerprint.

const FIXTURE = 'ai.reflection.cu.fixture'
const locks = scratchLocks()
after(() => locks.remove())
const launchOnFake = fakeLauncher(locks, { apps: [FIXTURE] })

const BOX = { bundleId: FIXTURE, pid: 601, role: 'AXTextField', subrole: null, title: null, frame: { x: 20, y: 100, width: 200, height: 24 }, secure: false, editable: true }
const world = (value) => ({
  displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 800, height: 600 }, scale: 1 }],
  apps: [{ bundleId: FIXTURE, pid: 601, title: 'Fixture', rect: { x: 0, y: 0, width: 800, height: 600 } }],
  frontmost: FIXTURE,
  elements: [{ rect: value.frame, element: value }],
  focused: value,
})

async function read(value) {
  const { env, child } = await launchOnFake(world(value))
  try {
    await logged(child, 3)
    return { hit: await env.inspectPoint({ x: 50, y: 110 }), focused: await env.focusedElement() }
  } finally {
    await env.close()
    await stopFake(child)
  }
}

test('CU-361: an untitled box carries its nearby label, on a hit and on the focused element alike', async () => {
  const { hit, focused } = await read({ ...BOX, nearbyLabel: 'Password' })
  assert.deepEqual([hit.title ?? hit.name ?? null, hit.caption, hit.placeholder, hit.nearbyLabel], [null, null, null, 'Password'])
  assert.equal(focused.nearbyLabel, 'Password')
})

test('CU-361: the nearby label is a separate key - it never becomes the name, the caption or the placeholder', async () => {
  const { hit } = await read({ ...BOX, nearbyLabel: 'Password' })
  for (const key of ['name', 'title', 'caption', 'placeholder']) assert.notEqual(hit[key], 'Password', key)
})

test('CU-361: a nearby label is trimmed; 80 characters is kept, 81 is null (never cut)', async () => {
  assert.equal((await read({ ...BOX, nearbyLabel: '  Password \n' })).hit.nearbyLabel, 'Password')
  assert.equal((await read({ ...BOX, nearbyLabel: 'x'.repeat(80) })).hit.nearbyLabel, 'x'.repeat(80))
  assert.equal((await read({ ...BOX, nearbyLabel: 'x'.repeat(81) })).hit.nearbyLabel, null, 'longer is none, never cut mid-word')
})

test('CU-361: absent (an older helper), empty or not a string is null', async () => {
  const { hit, focused } = await read(BOX)
  assert.deepEqual([hit.nearbyLabel, focused.nearbyLabel], [null, null], 'an older helper sends none')
  for (const nearbyLabel of ['', '   ', 42, true, ['Password'], { text: 'Password' }, null]) {
    assert.equal((await read({ ...BOX, nearbyLabel })).hit.nearbyLabel, null, JSON.stringify(nearbyLabel))
  }
})

test('CU-361 (cu-researcher): a static text the value rules class as sensitive is a displayed value, not a label - it reads as null', async () => {
  const card = ['4111', '1111', '1111', '1111'].join(' ') // built from fragments: no card-shaped literal in the tree
  const iban = ['GB82', 'WEST', '1234', '5698', '7654', '32'].join(' ')
  for (const shown of [`Card ${card}`, card, `IBAN ${iban}`]) {
    const { hit, focused } = await read({ ...BOX, nearbyLabel: shown })
    assert.equal(hit.nearbyLabel, null, shown.replace(/\d/g, '#'))
    assert.equal(focused.nearbyLabel, null)
    for (const target of [hit, focused]) assert.ok(!JSON.stringify(target).includes(card.replace(/ /g, '').slice(0, 8)) && !JSON.stringify(target).includes('4111 1111'), 'no field carries the value')
  }
  assert.equal((await read({ ...BOX, nearbyLabel: 'Card number' })).hit.nearbyLabel, 'Card number', 'a label naming a card stays a label')
})

