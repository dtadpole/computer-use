import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { fakeLauncher, logged, scratchLocks, stopFake } from './harness.mjs'

// CU-349 (helper 0.2.63): the desktop driver carries an entry's placeholder - the helper's AXPlaceholderValue read,
// never the field's value - as target.placeholder: a trimmed string of at most 80 characters (longer is none, never cut)
// or null. It is an extra name source for the consent field rules; outside the fingerprint.

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

test('CU-349: an untitled box carries its placeholder, on a hit and on the focused element alike', async () => {
  const { hit, focused } = await read({ ...BOX, placeholder: 'One-time code' })
  assert.deepEqual([hit.title ?? hit.name ?? null, hit.placeholder], [null, 'One-time code'])
  assert.equal(focused.placeholder, 'One-time code')
})

test('CU-349: a titled box keeps its name, with the placeholder as a separate key', async () => {
  const { hit } = await read({ ...BOX, title: 'Notes', placeholder: 'CVV' })
  assert.equal(hit.placeholder, 'CVV')
  assert.notEqual(hit.name ?? hit.title, 'CVV', 'the placeholder never replaces the name')
})

test('CU-349: a placeholder is trimmed; over 80 characters, empty, absent (an older helper) or not a string is null', async () => {
  assert.equal((await read({ ...BOX, placeholder: '  PIN  ' })).hit.placeholder, 'PIN')
  assert.equal((await read({ ...BOX, placeholder: 'x'.repeat(80) })).hit.placeholder, 'x'.repeat(80))
  assert.equal((await read({ ...BOX, placeholder: 'x'.repeat(81) })).hit.placeholder, null, 'longer is none, never cut mid-word')
  assert.equal((await read(BOX)).hit.placeholder, null, 'an older helper sends none')
  for (const placeholder of ['', '   ', 42, { text: 'CVV' }, null]) assert.equal((await read({ ...BOX, placeholder })).hit.placeholder, null, JSON.stringify(placeholder))
})

test('CU-349 (cu-researcher): a box whose value holds a card and whose placeholder says Card number returns the placeholder and never the digits', async () => {
  const digits = ['4111', '1111', '1111', '1111'].join('') // built from fragments: no card-shaped literal in the tree
  const { hit, focused } = await read({ ...BOX, value: digits, placeholder: 'Card number' })
  assert.equal(hit.placeholder, 'Card number')
  for (const target of [hit, focused]) assert.ok(!JSON.stringify(target).includes(digits), 'no field of the target carries the value')
})
