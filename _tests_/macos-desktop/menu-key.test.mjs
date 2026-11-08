import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { boundMenuItemOf } from '../../_environments_/macos-desktop/environment.mjs'
import { chordKeyDowns } from '../../_environments_/macos-desktop/input-plan.mjs'
import { fakeLauncher, logged, pause, scratchLocks, stopFake } from './harness.mjs'

/**
 * CU-232/CU-236: the driver's menuItemForChord. A key chord fires the menu item its key equivalent names (AppKit offers
 * it to the menu bar), so agent core must know that item. The driver asks the helper's menuKey with each of the chord's
 * non-modifier keyDowns exactly as it would post them, and passes on the item's title, path and key equivalent, `none`,
 * or `unreadable` - failing closed on anything else. All on the fake helper.
 */

const FIXTURE = 'com.example.fixture'
const locks = scratchLocks()
after(() => locks.remove())
const launchOnFake = fakeLauncher(locks, { apps: [FIXTURE] })
const WORLD = {
  displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 800, height: 600 }, scale: 1 }],
  apps: [{ bundleId: FIXTURE, pid: 601, title: 'CU Fixture', rect: { x: 0, y: 0, width: 800, height: 600 } }],
  frontmost: FIXTURE,
}
// kVK codes and CGEventFlags, written out so the rows do not lean on the code under test.
const KEY_D = 2
const KEY_K = 40
const KEY_DELETE = 0x33
const SHIFT = 0x2_0000
const COMMAND = 0x10_0000
const SEND = { title: 'Send', path: ['Message', 'Send'], keyEquivalent: { char: 'D', modifiers: 1 }, bundleId: FIXTURE }

const menuKeys = (child) => child.requests.filter((r) => r.type === 'menuKey')

async function withDriver(extra, body) {
  const { env, child } = await launchOnFake({ ...WORLD, ...extra })
  try {
    await logged(child, 3)
    return await body(env, child)
  } finally {
    await env.close()
    await stopFake(child)
  }
}

/** The menuKey requests once the fake's log has caught up with its replies. */
async function settledMenuKeys(child, at = 0) {
  let last = -1
  for (const deadline = Date.now() + 2000; Date.now() < deadline;) {
    const now = menuKeys(child).length
    if (now === last && now >= at) break
    last = now
    await pause(60)
  }
  return menuKeys(child).map(({ keyCode, flags }) => ({ keyCode, flags }))
}

test('Shift-Command-D bound to Send: the request is the chord\'s own keyDown, and the item comes back as title, path and key equivalent only', async () => {
  await withDriver({ menuKeys: [{ keyCode: KEY_D, flags: SHIFT | COMMAND, reply: { item: { ...SEND, value: 'draft text', selectedText: 'x' } } }] }, async (env, child) => {
    const bound = await env.menuItemForChord({ type: 'keypress', keys: ['META', 'SHIFT', 'D'] })
    assert.deepEqual(bound, { role: 'AXMenuItem', name: 'Send', keyEquivalent: { char: 'D', modifiers: 1 }, path: ['Message', 'Send'] }, 'no value or selected text passes')
    assert.deepEqual(await settledMenuKeys(child, 1), [{ keyCode: KEY_D, flags: SHIFT | COMMAND }])
    assert.deepEqual(chordKeyDowns(['META', 'SHIFT', 'D']), [{ keyCode: KEY_D, flags: SHIFT | COMMAND }], 'the planner posts that same keyDown')
    assert.deepEqual(await env.menuItemForChord({ type: 'hold_key', keys: ['SHIFT', 'CMD', 'd'], duration_ms: 500 }), bound, 'a held chord binds the same item')
    assert.equal((await settledMenuKeys(child, 2)).length, 2, 'read fresh each time, never cached')
  })
})

test('none only for the exact answer; unreadable for the helper\'s unreadable, an older helper and every malformed reply', async () => {
  await withDriver({ menuKeyDefault: { none: true } }, async (env) => {
    assert.deepEqual(await env.menuItemForChord({ type: 'keypress', keys: ['META', 'SHIFT', 'K'] }), { none: true })
  })
  await withDriver({ menuKeyDefault: { unreadable: true } }, async (env) => {
    assert.deepEqual(await env.menuItemForChord({ type: 'keypress', keys: ['META', 'SHIFT', 'K'] }), { unreadable: true })
  })
  await withDriver({ quirks: { noMenuKey: true } }, async (env) => {
    assert.deepEqual(await env.menuItemForChord({ type: 'keypress', keys: ['META', 'SHIFT', 'K'] }), { unreadable: true }, 'unknown_request')
  })
  const scope = [FIXTURE]
  for (const [label, reply] of [
    ['empty', {}], ['none false', { none: false }], ['none and an item', { none: true, item: SEND }], ['item and unreadable', { item: SEND, unreadable: true }],
    ['an item that is a string', { item: 'Send' }], ['an item list', { item: [SEND] }], ['no title', { item: { ...SEND, title: undefined } }],
    ['a blank title', { item: { ...SEND, title: '  ' } }], ['a control character', { item: { ...SEND, title: 'Se\u0007nd' } }],
    ['an app outside the scope', { item: { ...SEND, bundleId: 'com.example.other' } }], ['a bundle id that is no string', { item: { ...SEND, bundleId: 7 } }],
  ]) {
    assert.deepEqual(boundMenuItemOf(reply, scope), { unreadable: true }, label)
  }
  const long = boundMenuItemOf({ item: { title: `  ${'S'.repeat(120)}  `, path: ['Message', 7, '', 'x'.repeat(90)], keyEquivalent: { char: 'D', modifiers: 99 } } }, scope)
  assert.deepEqual(long, { role: 'AXMenuItem', name: 'S'.repeat(80), keyEquivalent: { char: 'D', modifiers: null }, path: ['Message', 'x'.repeat(80)] }, 'trimmed and capped; a malformed part is null; no bundle id is the helper\'s own scoping')
  assert.deepEqual(boundMenuItemOf({ item: { title: 'Move to Trash', keyEquivalent: { glyph: 23, modifiers: 0 } } }, scope).keyEquivalent, { char: null, glyph: 23, modifiers: 0 }, 'a glyph key equivalent (Delete)')
  assert.equal(boundMenuItemOf({ item: { title: 'Send', keyEquivalent: { glyph: -1 } } }, scope).keyEquivalent, null, 'nothing usable: null')
})

test('a chord with two keys: one item and a none is that item; two different items, or any unreadable, is unreadable', async () => {
  const other = { title: 'Clear Log', path: ['Log', 'Clear Log'], keyEquivalent: { char: 'K', modifiers: 1 }, bundleId: FIXTURE }
  const keys = ['META', 'SHIFT', 'D', 'K']
  assert.deepEqual(chordKeyDowns(keys), [{ keyCode: KEY_D, flags: SHIFT | COMMAND }, { keyCode: KEY_K, flags: SHIFT | COMMAND }])
  await withDriver({ menuKeys: [{ keyCode: KEY_D, flags: SHIFT | COMMAND, reply: { item: SEND } }] }, async (env) => {
    assert.equal((await env.menuItemForChord({ type: 'keypress', keys })).name, 'Send')
  })
  await withDriver({ menuKeys: [{ keyCode: KEY_D, flags: SHIFT | COMMAND, reply: { item: SEND } }, { keyCode: KEY_K, flags: SHIFT | COMMAND, reply: { item: other } }] }, async (env) => {
    assert.deepEqual(await env.menuItemForChord({ type: 'keypress', keys }), { unreadable: true })
  })
  await withDriver({ menuKeys: [{ keyCode: KEY_D, flags: SHIFT | COMMAND, reply: { item: SEND } }, { keyCode: KEY_K, flags: SHIFT | COMMAND, reply: { unreadable: true } }] }, async (env) => {
    assert.deepEqual(await env.menuItemForChord({ type: 'keypress', keys }), { unreadable: true })
  })
})

test('nothing to ask: a modifier-only chord is none; a non-key action or a key the planner refuses is unreadable; none sends a request', async () => {
  await withDriver({ menuKeys: [{ keyCode: KEY_DELETE, flags: COMMAND, reply: { item: { title: 'Move to Trash', keyEquivalent: { glyph: 23, modifiers: 0 } } } }] }, async (env, child) => {
    assert.deepEqual(await env.menuItemForChord({ type: 'keypress', keys: ['META', 'SHIFT'] }), { none: true })
    assert.deepEqual(await env.menuItemForChord({ type: 'click', x: 1, y: 1, keys: ['META', 'SHIFT', 'D'] }), { unreadable: true }, 'a click is no chord, whatever keys it names')
    assert.deepEqual(await env.menuItemForChord({ type: 'keypress', keys: ['META', 'NOT_A_KEY'] }), { unreadable: true })
    assert.deepEqual(await env.menuItemForChord({ type: 'keypress', keys: 'META+D' }), { unreadable: true })
    assert.deepEqual(await settledMenuKeys(child), [], 'not one menuKey request')
    assert.equal((await env.menuItemForChord({ type: 'keypress', keys: ['CMD', 'BACKSPACE'] })).name, 'Move to Trash', 'Command-Delete binds by its keyDown')
  })
})
