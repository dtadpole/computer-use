import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { formContextOf } from '../../_environments_/macos-desktop/environment.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { fakeLauncher, logged, scratchLocks, stopFake } from './harness.mjs'

// CU-409 (the desktop side of CU-402's asset context; helper 0.2.68): the helper reads a submit-like control's form
// context - the selected titles of its container's pop-ups, combo boxes or radio groups, and an amount-shaped entry's
// presence (never a text field's value). The client re-validates it with the browser driver's bounds and carries it on
// the target and on the default button a Return presses (D-106), outside the fingerprint. These pin the client half;
// the helper half is cu-developer-three's, the policy read (target.formContext) is agent core's on main.

const FIXTURE = 'ai.reflection.cu.fixture'
const locks = scratchLocks()
after(() => locks.remove())
const launchOnFake = fakeLauncher(locks, { apps: [FIXTURE] })

const SELL = { bundleId: FIXTURE, pid: 601, role: 'AXButton', subrole: null, title: 'Sell', frame: { x: 100, y: 100, width: 80, height: 30 }, secure: false }
const FIELD = { bundleId: FIXTURE, pid: 601, role: 'AXTextField', subrole: null, title: 'Amount', frame: { x: 20, y: 400, width: 300, height: 24 }, secure: false, editable: true }
const world = (extra) => ({
  displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 800, height: 600 }, scale: 1 }],
  apps: [{ bundleId: FIXTURE, pid: 601, title: 'Fixture', rect: { x: 0, y: 0, width: 800, height: 600 } }],
  frontmost: FIXTURE,
  ...extra,
})

test('CU-409 client: formContextOf keeps the browser bounds - at most 3 trimmed strings of at most 24 chars, amountEntry strictly true', () => {
  assert.deepEqual(formContextOf({ options: [' BTC ', 'Market'], amountEntry: true }), { options: ['BTC', 'Market'], amountEntry: true })
  assert.deepEqual(formContextOf({ options: ['a', 'b', 'c', 'd'] }).options, ['a', 'b', 'c'], 'a fourth option is dropped')
  assert.deepEqual(formContextOf({ options: ['x'.repeat(25), 7, null, 'ETH'], amountEntry: 'yes' }), { options: ['ETH'], amountEntry: false }, 'long and non-string options and a non-true flag are dropped')
  assert.deepEqual(formContextOf({ amountEntry: true }), { options: [], amountEntry: true })
  for (const bad of [undefined, null, 'BTC', ['BTC'], { options: [] }, { options: ['   '] }, { amountEntry: 1 }]) assert.equal(formContextOf(bad), null, JSON.stringify(bad))
})

test('CU-409 client: a control the helper reports with a form context carries it on the target, outside the fingerprint; a malformed one carries none', async () => {
  const control = createRunControl()
  const withContext = { ...SELL, formContext: { options: ['BTC'], amountEntry: true } }
  const malformed = { ...SELL, frame: { x: 300, y: 100, width: 80, height: 30 }, formContext: { options: ['x'.repeat(30)], amountEntry: 'yes' } }
  const plain = { ...SELL, frame: { x: 500, y: 100, width: 80, height: 30 } }
  const { env, child } = await launchOnFake(world({ elements: [{ rect: withContext.frame, element: withContext }, { rect: malformed.frame, element: malformed }, { rect: plain.frame, element: plain }] }), { control })
  await logged(child, 3)
  try {
    await env.addApp(FIXTURE)
    const a = await env.inspectPoint({ x: 140, y: 115 })
    assert.deepEqual([a.role, a.name, a.formContext], ['AXButton', 'Sell', { options: ['BTC'], amountEntry: true }])
    const b = await env.inspectPoint({ x: 340, y: 115 })
    assert.equal('formContext' in b, false, 'nothing usable: no field')
    const c = await env.inspectPoint({ x: 540, y: 115 })
    assert.equal('formContext' in c, false)
    const again = await env.inspectPoint({ x: 140, y: 115 })
    assert.equal(a.fingerprint, again.fingerprint)
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('CU-409 client (D-106): the default button a Return presses carries its own form context', async () => {
  const { env, child } = await launchOnFake(world({
    elements: [{ rect: FIELD.frame, element: FIELD }, { rect: SELL.frame, element: SELL }],
    focused: FIELD,
    defaultButton: { ...SELL, formContext: { options: ['BTC'], amountEntry: true } },
    defaultButtonRead: true,
  }))
  try {
    await logged(child, 3)
    const target = await env.focusedElement()
    assert.deepEqual(target.defaultButton, { role: 'AXButton', name: 'Sell', panel: null, formContext: { options: ['BTC'], amountEntry: true } })
    assert.equal('formContext' in target, false, 'the focused field itself carries none')
  } finally {
    await env.close()
    await stopFake(child)
  }
})
