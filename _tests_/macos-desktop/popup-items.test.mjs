import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { popUpKeyItem, popUpOf, popUpTypeItems } from '../../_environments_/macos-desktop/environment.mjs'
import { fakeLauncher, logged, scratchLocks, stopFake } from './harness.mjs'

// CU-372 (helper 0.2.65): a pop-up button takes type-ahead and arrows without opening its menu, so the desktop driver
// judges a key or a type on it by the item it selects - keyTarget answers that item (selectOption: true) or the button
// with optionUnread: true; typeOptions answers every item a type may select, or { unread: true }. Unread is never an
// empty list. The shapes mirror the browser route's (CU-370).

const FIXTURE = 'ai.reflection.cu.fixture'
const locks = scratchLocks()
after(() => locks.remove())
const launchOnFake = fakeLauncher(locks, { apps: [FIXTURE] })

const items = (...titles) => titles.map((title) => (typeof title === 'string' ? { title, enabled: true } : title))
const MENU = { items: items('Archive', 'Delete', { title: 'Disabled', enabled: false }, 'Keep'), selected: 'Archive', selectedIndex: 0 }
const POPUP = { bundleId: FIXTURE, pid: 601, role: 'AXPopUpButton', subrole: null, title: 'Action', frame: { x: 20, y: 100, width: 160, height: 24 }, secure: false, editable: false }
const world = (value) => ({
  displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 800, height: 600 }, scale: 1 }],
  apps: [{ bundleId: FIXTURE, pid: 601, title: 'Fixture', rect: { x: 0, y: 0, width: 800, height: 600 } }],
  frontmost: FIXTURE,
  elements: [{ rect: value.frame, element: value }],
  focused: value,
})

async function onFake(value, use) {
  const { env, child } = await launchOnFake(world(value))
  try {
    await logged(child, 3)
    return await use(env)
  } finally {
    await env.close()
    await stopFake(child)
  }
}

test('CU-372: popUpOf keeps a read menu and reads anything else as unread - never an empty list', () => {
  assert.deepEqual(popUpOf(MENU), { items: MENU.items.map(({ title, enabled }) => ({ title, enabled })), selected: 'Archive', selectedIndex: 0 })
  assert.equal(popUpOf(undefined), null, 'an older helper sends none')
  for (const bad of [{ unread: true, selected: 'Archive' }, { items: [] }, { items: 'Archive' }, { items: [{ title: '' }] }, { items: [{}] }, { items: items(...Array.from({ length: 51 }, (_, i) => `Item ${i}`)) }]) {
    assert.equal(popUpOf(bad).unread, true, JSON.stringify(bad).slice(0, 60))
    assert.equal(popUpOf(bad).items, undefined)
  }
  assert.equal(popUpOf({ ...MENU, selectedIndex: 9 }).selectedIndex, null, 'an index outside the list reads as unknown')
})

test('CU-372: a type selects every enabled item a prefix of it may reach, case-insensitively; none matching is []', () => {
  const menu = popUpOf(MENU)
  assert.deepEqual(popUpTypeItems(menu, 'd').map((item) => item.title), ['Delete'], 'a disabled item is never landed on')
  assert.deepEqual(popUpTypeItems(menu, 'DEL').map((item) => item.title), ['Delete'])
  assert.deepEqual(popUpTypeItems(menu, 'ak').map((item) => item.title), ['Archive'], 'each prefix: a reaches Archive, ak nothing more')
  assert.deepEqual(popUpTypeItems(popUpOf({ items: items('Delete all', 'Download'), selectedIndex: 0 }), 'd').map((item) => item.title), ['Delete all', 'Download'], 'every item a letter may reach, not only the first (named over-ask)')
  assert.deepEqual(popUpTypeItems(menu, 'zz'), [])
  assert.deepEqual(popUpTypeItems(popUpOf({ unread: true }), 'd'), { unread: true })
  assert.deepEqual(popUpTypeItems(null, 'd'), { unread: true })
})

test('CU-372: a key lands on the next or previous enabled item (no wrap), Home and End on the ends; unknown is unread', () => {
  const at = (index) => popUpOf({ ...MENU, selected: MENU.items[index].title, selectedIndex: index })
  assert.equal(popUpKeyItem(at(0), 'ARROWDOWN').item.title, 'Delete')
  assert.equal(popUpKeyItem(at(1), 'ARROWDOWN').item.title, 'Keep', 'a disabled item is skipped')
  assert.equal(popUpKeyItem(at(3), 'ARROWDOWN'), null, 'the last item stays: no wrap')
  assert.equal(popUpKeyItem(at(3), 'ARROWUP').item.title, 'Delete')
  assert.equal(popUpKeyItem(at(0), 'ARROWRIGHT').item.title, 'Delete', 'Right moves like Down')
  assert.equal(popUpKeyItem(at(1), 'ARROWLEFT').item.title, 'Archive', 'Left moves like Up')
  assert.equal(popUpKeyItem(at(2), 'HOME').item.title, 'Archive')
  assert.equal(popUpKeyItem(at(0), 'END').item.title, 'Keep')
  assert.equal(popUpKeyItem(at(0), 'D').item.title, 'Delete', 'a letter type-selects')
  assert.deepEqual(popUpKeyItem(popUpOf({ items: items('Delete all', 'Download'), selected: 'Delete all', selectedIndex: 0 }), 'D'), { unread: true }, 'a letter two items share is unread')
  assert.equal(popUpKeyItem(at(0), 'Z'), null)
  for (const key of ['PAGEUP', 'PAGEDOWN']) assert.deepEqual(popUpKeyItem(at(0), key), { unread: true }, key)
  assert.deepEqual(popUpKeyItem(popUpOf({ ...MENU, selectedIndex: null }), 'ARROWDOWN'), { unread: true }, 'an unknown selected item makes an arrow unread')
  assert.equal(popUpKeyItem(at(0), 'TAB'), null, 'a key that chooses nothing')
})

test('CU-372 on the driver: keyTarget answers the item an arrow lands on, marked a choice; unread asks; other keys give the focus', async () => {
  await onFake({ ...POPUP, popUp: MENU }, async (env) => {
    const down = await env.keyTarget({ type: 'keypress', keys: ['down'] })
    assert.deepEqual([down.role, down.name, down.selectOption, down.origin], ['AXMenuItem', 'Delete', true, FIXTURE])
    assert.equal(down.popUp, undefined, 'the item target does not carry the menu')
    const focus = await env.focusedElement()
    assert.notEqual(down.fingerprint, focus.fingerprint, 'an item is another target than its button')
    assert.equal((await env.keyTarget({ type: 'keypress', keys: ['tab'] })).role, 'AXPopUpButton', 'Tab chooses nothing: the focus')
    assert.equal((await env.keyTarget({ type: 'keypress', keys: ['cmd', 'down'] })).role, 'AXPopUpButton', 'a chord is not a plain key')
    assert.equal((await env.keyTarget({ type: 'keypress', keys: ['pagedown'] })).optionUnread, true)
  })
  await onFake({ ...POPUP, popUp: { unread: true, selected: 'Archive' } }, async (env) => {
    const target = await env.keyTarget({ type: 'keypress', keys: ['down'] })
    assert.deepEqual([target.role, target.optionUnread], ['AXPopUpButton', true], 'a closed popup that exposes no menu asks')
  })
  await onFake({ ...POPUP }, async (env) => {
    assert.equal((await env.keyTarget({ type: 'keypress', keys: ['down'] })).optionUnread, true, 'an older helper (no popUp) asks')
  })
  await onFake({ ...POPUP, role: 'AXTextField', editable: true, popUp: MENU }, async (env) => {
    const target = await env.keyTarget({ type: 'keypress', keys: ['down'] })
    assert.deepEqual([target.role, target.popUp, target.optionUnread], ['AXTextField', undefined, undefined], 'another role: the focus, and no popUp read')
  })
})

test('CU-372 on the driver: typeOptions answers every item a type may select, [] for none, { unread } when unreadable, null off a popup', async () => {
  await onFake({ ...POPUP, popUp: MENU }, async (env) => {
    const typed = await env.typeOptions({ type: 'type', text: 'De' })
    assert.deepEqual(typed.map((item) => [item.role, item.name, item.selectOption]), [['AXMenuItem', 'Delete', true]])
    assert.deepEqual(await env.typeOptions({ type: 'type', text: 'zz' }), [])
    assert.equal(await env.typeOptions({ type: 'click', x: 1, y: 1 }), null)
  })
  await onFake({ ...POPUP, popUp: { unread: true } }, async (env) => {
    assert.deepEqual(await env.typeOptions({ type: 'type', text: 'd' }), { unread: true })
  })
  await onFake({ ...POPUP, role: 'AXTextField', editable: true }, async (env) => {
    assert.equal(await env.typeOptions({ type: 'type', text: 'd' }), null)
  })
})

test('CU-372 (cu-researcher): a selected title two items share is unread; an index that names another title is unknown', () => {
  const twins = { items: items('Custom…', 'Delete', 'Custom…'), selected: 'Custom…', selectedIndex: 0 }
  assert.equal(popUpOf(twins).unread, true)
  assert.equal(popUpKeyItem(popUpOf(twins), 'ARROWDOWN').unread, true)
  assert.equal(popUpOf({ ...MENU, selectedIndex: 1 }).selectedIndex, null, 'index 1 is Delete, not the selected Archive')
})

test('CU-372 (cu-researcher): a pull-down button (AXMenuButton, pullsDown) - any key or type on it is unread; the mark survives an unread read', async () => {
  const pull = popUpOf({ ...MENU, selected: 'Actions', selectedIndex: null, pullsDown: true })
  assert.deepEqual([pull.pullsDown, pull.selectedIndex, pull.items.length], [true, null, 4])
  assert.equal(popUpOf({ unread: true, pullsDown: true }).pullsDown, true)
  assert.deepEqual(popUpKeyItem(pull, 'ARROWDOWN'), { unread: true })
  assert.deepEqual(popUpTypeItems(pull, 'd'), { unread: true })
  await onFake({ ...POPUP, role: 'AXMenuButton', title: 'Actions', popUp: { ...MENU, selected: 'Actions', selectedIndex: null, pullsDown: true } }, async (env) => {
    const focus = await env.focusedElement()
    assert.equal(focus.popUp.pullsDown, true, 'the focus carries the mark, so agent core can judge Return or Space on it as unread')
    assert.equal((await env.keyTarget({ type: 'keypress', keys: ['down'] })).optionUnread, true)
    assert.deepEqual(await env.typeOptions({ type: 'type', text: 'd' }), { unread: true })
  })
})

