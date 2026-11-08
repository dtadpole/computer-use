import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { MAX_SELECTED_ITEMS, selectedItemsOf } from '../../_environments_/macos-desktop/environment.mjs'
import { fakeLauncher, logged, scratchLocks, stopFake } from './harness.mjs'

/**
 * CU-259 (CU-252 rule 3): the driver's selectedItems() - what a menu Open, Command-O or Command-Down acts on in a file
 * browser: the focused collection's selected items, names and kinds only (design note 0.2 on CU-252: the helper reads
 * no URL resource values, D-024). Every answer shape on the fake helper; anything else fails closed to unreadable.
 */

const FIXTURE = 'ai.reflection.cu.fixture'
const locks = scratchLocks()
after(() => locks.remove())
const launchOnFake = fakeLauncher(locks, { apps: [FIXTURE] })
const WORLD = {
  displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 800, height: 600 }, scale: 1 }],
  apps: [{ bundleId: FIXTURE, pid: 601, title: 'CU Fixture', rect: { x: 0, y: 0, width: 800, height: 600 } }],
  frontmost: FIXTURE,
}
const reads = (child) => child.requests.filter((r) => r.type === 'selectedItems').length

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

test('the selected items come back as names and kinds only, read fresh each time', async () => {
  const selectedItems = { bundleId: FIXTURE, items: [{ name: 'install.command', kind: 'file', url: 'file:///Users/someone/install.command' }, { name: 'Payload.app', kind: 'folder' }, { name: 'Recents item', kind: 'unknown' }] }
  await withDriver({ selectedItems }, async (env, child) => {
    const read = await env.selectedItems()
    assert.deepEqual(read, { items: [{ name: 'install.command', kind: 'file' }, { name: 'Payload.app', kind: 'folder' }, { name: 'Recents item', kind: 'unknown' }] }, 'no URL or path passes')
    await env.selectedItems()
    for (let i = 0; i < 50 && reads(child) < 2; i += 1) await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(reads(child), 2, 'never cached')
  })
})

test('none, notCollection and the helper\'s unreadable pass as they are; an older helper fails closed (no_scope: empty-scope.test.mjs)', async () => {
  await withDriver({ selectedItems: { bundleId: FIXTURE, none: true } }, async (env) => assert.deepEqual(await env.selectedItems(), { none: true }))
  await withDriver({}, async (env) => assert.deepEqual(await env.selectedItems(), { notCollection: true }, 'the fake\'s default: the focus is no collection'))
  await withDriver({ selectedItems: { bundleId: FIXTURE, unreadable: true, reason: 'no AX selection' } }, async (env) => assert.deepEqual(await env.selectedItems(), { unreadable: true }))
  await withDriver({ quirks: { noSelectedItems: true } }, async (env) => assert.deepEqual(await env.selectedItems(), { unreadable: true }, 'unknown_request'))
})

test('every malformed reply is unreadable: no app or one outside the scope, two answers, truncated, an empty or long list, a bad entry', () => {
  const scope = [FIXTURE]
  const item = { name: 'Report.pdf', kind: 'file' }
  const list = (...items) => ({ bundleId: FIXTURE, items })
  for (const [label, reply] of [
    ['null', null], ['empty', {}], ['no bundle id', { items: [item] }], ['an app outside the scope', { bundleId: 'com.example.other', items: [item] }],
    ['none naming no app', { none: true }], ['none and items', { ...list(item), none: true }], ['notCollection and none', { bundleId: FIXTURE, none: true, notCollection: true }],
    ['none false', { bundleId: FIXTURE, none: false }], ['truncated', { ...list(item), truncated: true }], ['an empty list', list()],
    ['over the cap', list(...Array.from({ length: MAX_SELECTED_ITEMS + 1 }, (_, i) => ({ name: `f${i}.txt`, kind: 'file' })))],
    ['an entry that is a string', list(item, 'x.txt')], ['an unnamed entry', list(item, { kind: 'file' })], ['a path for a name', list({ name: 'a/b.txt', kind: 'file' })],
    ['a control character', list({ name: 'x\u0007.txt', kind: 'file' })], ['an unknown kind', list({ name: 'x.txt', kind: 'package' })], ['no kind', list({ name: 'x.txt' })],
  ]) assert.deepEqual(selectedItemsOf(reply, scope), { unreadable: true }, label)
  assert.deepEqual(selectedItemsOf({ ...list(item), truncated: false }, scope), { items: [item] }, 'truncated false is no truncation')
  assert.deepEqual(selectedItemsOf(list({ name: '  Notes  ', kind: 'unknown' }), scope), { items: [{ name: 'Notes', kind: 'unknown' }] }, 'trimmed')
})
