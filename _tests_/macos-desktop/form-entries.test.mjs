import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { formEntriesOf } from '../../_environments_/macos-desktop/environment.mjs'
import { fakeLauncher, logged, scratchLocks, stopFake } from './harness.mjs'

/**
 * CU-588 (helper 0.2.72, the desktop half of CU-585): a button carries the words its sheet's or window's text entries
 * show - labels, placeholders and help, never a value (FormEntries in the helper) - on the target and on Return's
 * default button, the seam the web route's formEntries gives, so CU-585's late union judges a bare 'Confirm' beside a
 * placeholder-only 'Type DELETE to confirm' on the desktop too. On the fake helper.
 */

const FIXTURE = 'ai.reflection.cu.fixture'
const locks = scratchLocks()
after(() => locks.remove())
const launchOnFake = fakeLauncher(locks, { apps: [FIXTURE] })

const CONFIRM = { bundleId: FIXTURE, pid: 601, role: 'AXButton', subrole: null, title: 'Confirm', frame: { x: 100, y: 100, width: 80, height: 30 }, secure: false, editable: false }
const world = (elements, extra = {}) => ({
  displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 800, height: 600 }, scale: 1 }],
  apps: [{ bundleId: FIXTURE, pid: 601, title: 'Fixture', rect: { x: 0, y: 0, width: 800, height: 600 } }],
  frontmost: FIXTURE,
  elements: elements.map((element) => ({ rect: element.frame, element })),
  ...extra,
})

test('CU-588 driver: formEntriesOf keeps up to 3 texts of 1-80 characters, whitespace collapsed, control characters dropped; anything else is null', () => {
  assert.deepEqual(formEntriesOf(['  Type  DELETE\nto confirm ']), ['Type DELETE to confirm'])
  assert.deepEqual(formEntriesOf(['a', 'b', 'c', 'd']), ['a', 'b', 'c'])
  assert.deepEqual(formEntriesOf(['x'.repeat(81), 'ok', 7, null, '  ']), ['ok'], 'a text over 80 characters is dropped, never cut')
  assert.deepEqual(formEntriesOf(['Type\u0000 ERASE']), ['Type ERASE'])
  for (const bad of [null, undefined, '', 'Type DELETE', {}, [], ['   '], [5]]) assert.equal(formEntriesOf(bad), null, JSON.stringify(bad))
})

async function hit(value) {
  const { env, child } = await launchOnFake(world([value]))
  try {
    await logged(child, 3)
    return await env.inspectPoint({ x: 140, y: 115 })
  } finally {
    await env.close()
    await stopFake(child)
  }
}

test('CU-588 driver: a button\'s form entries reach the target; absent or malformed stays absent (an older helper)', async () => {
  const read = await hit({ ...CONFIRM, formEntries: ['Type DELETE to confirm'] })
  assert.deepEqual(read.formEntries, ['Type DELETE to confirm'])
  const plain = await hit(CONFIRM)
  assert.equal(Object.hasOwn(plain, 'formEntries'), false, 'an older helper: no key')
  const blank = await hit({ ...CONFIRM, formEntries: ['   ', 5] })
  assert.equal(Object.hasOwn(blank, 'formEntries'), false, 'malformed reads as none')
})

test('CU-588 driver: Return\'s default button carries its form entries too (D-106: judged like the click)', async () => {
  const field = { bundleId: FIXTURE, pid: 601, role: 'AXTextField', subrole: null, title: null, frame: { x: 100, y: 60, width: 120, height: 24 }, secure: false, editable: true }
  const button = { ...CONFIRM, formEntries: ['Type DELETE to confirm'] }
  const { env, child } = await launchOnFake(world([field, button], { focused: field, defaultButton: button }))
  try {
    await logged(child, 3)
    const focus = await env.focusedElement()
    assert.equal(focus.defaultButton?.name, 'Confirm')
    assert.deepEqual(focus.defaultButton?.formEntries, ['Type DELETE to confirm'])
  } finally {
    await env.close()
    await stopFake(child)
  }
})
