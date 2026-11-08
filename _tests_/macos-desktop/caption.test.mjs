import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { isTextEntry } from '../../_tools_/agent-core/policy.mjs'
import { fakeLauncher, logged, scratchLocks, stopFake } from './harness.mjs'

// CU-187: the desktop driver carries the helper's caption - the label beside a value (AXTitleUIElement's title, or the
// row's sibling title) - as target.caption, a string of at most 80 characters or null, outside the fingerprint. The
// helper half reads it; until it ships the field is absent and the caption null.

const FIXTURE = 'ai.reflection.cu.fixture'
const OTHER = 'com.example.notapproved'
const locks = scratchLocks()
after(() => locks.remove())
const launchOnFake = fakeLauncher(locks, { apps: [FIXTURE] })

const VALUE = { bundleId: FIXTURE, pid: 601, role: 'AXStaticText', subrole: null, title: null, frame: { x: 20, y: 100, width: 200, height: 20 }, secure: false }
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

test('CU-187: a target carries the helper\'s caption, on a hit and on the focused element alike', async () => {
  const { hit, focused } = await read({ ...VALUE, caption: 'Passport number' })
  assert.equal(hit.caption, 'Passport number')
  assert.equal(focused.caption, 'Passport number')
})

// CU-209's driver half (the open D-059 cell drag-readonly-textview-value): a read-only text view - AXTextArea whose value
// is not settable, so the helper sends editable false - arrives with its caption and editable false and no field key, so
// agent core takes it for shown text judged by its caption, not for an entry (isTextEntry decides on editable first).
test('CU-209: a read-only text view carries its caption and editable false, with no field key - not an entry; its editable twin is one', async () => {
  const AREA = { ...VALUE, role: 'AXTextArea', frame: { x: 20, y: 100, width: 300, height: 60 }, editable: false, caption: 'IBAN' }
  const readOnly = (await read(AREA)).hit
  assert.deepEqual([readOnly.role, readOnly.caption, readOnly.editable, Object.hasOwn(readOnly, 'fieldKey')], ['AXTextArea', 'IBAN', false, false])
  assert.equal(isTextEntry(readOnly), false, 'shown text: the caption rule judges a drag from it')
  const twin = (await read({ ...AREA, editable: true })).hit
  assert.deepEqual([twin.editable, isTextEntry(twin), typeof twin.fieldKey], [true, true, 'string'], 'the editable twin is an entry, keyed')
})

test('CU-187: a caption is trimmed and at most 80 characters; absent (an older helper), empty or not a string is null', async () => {
  assert.equal((await read({ ...VALUE, caption: '  IBAN  ' })).hit.caption, 'IBAN')
  assert.equal((await read({ ...VALUE, caption: 'x'.repeat(120) })).hit.caption, 'x'.repeat(80))
  assert.equal((await read(VALUE)).hit.caption, null, 'an older helper sends no caption')
  for (const caption of ['', '   ', 42, { title: 'IBAN' }, null]) assert.equal((await read({ ...VALUE, caption })).hit.caption, null, JSON.stringify(caption))
})

test('CU-187: the caption is context, not identity - the fingerprint is the same whatever it says', async () => {
  const prints = new Set()
  for (const caption of [undefined, 'IBAN', 'Passport number']) prints.add((await read({ ...VALUE, ...(caption === undefined ? {} : { caption }) })).hit.fingerprint)
  assert.equal(prints.size, 1)
})

test('CU-187: an element of an app outside the scope carries no caption - the helper names it by bundle id only', async () => {
  const outside = { ...VALUE, bundleId: OTHER, caption: 'IBAN' }
  const { env, child } = await launchOnFake({ ...world(outside), apps: [{ bundleId: OTHER, pid: 602, title: 'Other', rect: { x: 0, y: 0, width: 800, height: 600 } }], frontmost: OTHER })
  try {
    await logged(child, 3)
    const hit = await env.inspectPoint({ x: 50, y: 110 }).catch(() => null)
    assert.equal(hit?.caption ?? null, null)
  } finally {
    await env.close()
    await stopFake(child)
  }
})
