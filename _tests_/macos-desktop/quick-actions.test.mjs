import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { boundMenuItemOf } from '../../_environments_/macos-desktop/environment.mjs'
import { fakeLauncher, logged, scratchLocks, stopFake } from './harness.mjs'

// CU-382 (helper 0.2.66): the driver carries the helper's quickActions mark (an item under Finder's Quick Actions, or a
// button in its preview-pane row) and menuContextUnread (a menu walk that could not finish) - each only when true.

const FIXTURE = 'ai.reflection.cu.fixture'
const locks = scratchLocks()
after(() => locks.remove())
const launchOnFake = fakeLauncher(locks, { apps: [FIXTURE] })
const ITEM = { bundleId: FIXTURE, pid: 601, role: 'AXMenuItem', subrole: null, title: 'Run Shell Script', frame: { x: 20, y: 100, width: 160, height: 22 }, secure: false, editable: false }
const world = (value) => ({
  displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 800, height: 600 }, scale: 1 }],
  apps: [{ bundleId: FIXTURE, pid: 601, title: 'Fixture', rect: { x: 0, y: 0, width: 800, height: 600 } }],
  frontmost: FIXTURE,
  elements: [{ rect: value.frame, element: value }],
  focused: value,
})

async function hit(value) {
  const { env, child } = await launchOnFake(world(value))
  try {
    await logged(child, 3)
    return await env.inspectPoint({ x: 50, y: 110 })
  } finally {
    await env.close()
    await stopFake(child)
  }
}

test('CU-382: an item the helper marks quickActions, and a walk it marks unread, carry those marks', async () => {
  const marked = await hit({ ...ITEM, menuPath: ['Quick Actions', 'Run Shell Script'], quickActions: true })
  assert.deepEqual([marked.quickActions, marked.menuContextUnread, marked.servicesMenu], [true, undefined, undefined])
  const unread = await hit({ ...ITEM, menuPath: ['Run Shell Script'], menuContextUnread: true })
  assert.deepEqual([unread.quickActions, unread.menuContextUnread], [undefined, true])
  const button = await hit({ ...ITEM, role: 'AXButton', title: 'Markup', quickActions: true })
  assert.equal(button.quickActions, true, 'a preview-pane button carries it too')
})

test('CU-382: absent or anything but true carries no mark', async () => {
  for (const extra of [{}, { quickActions: 'yes', menuContextUnread: 1 }, { quickActions: false, menuContextUnread: false }]) {
    const target = await hit({ ...ITEM, ...extra })
    assert.deepEqual([target.quickActions, target.menuContextUnread], [undefined, undefined], JSON.stringify(extra))
  }
})

test('CU-382 driver: a menu-key entry carries quickActions when the helper marks it (cu-researcher 08:07Z drop 1); a non-boolean mark makes the list unreadable', () => {
  const reply = { bundleId: FIXTURE, items: [{ title: 'Upload to S3', path: ['CU Fixture', 'Quick Actions', 'Upload to S3'], keyEquivalent: { char: 'U', modifiers: 1 }, enabled: true, quickActions: true }] }
  assert.equal(boundMenuItemOf(reply, [FIXTURE]).items[0].quickActions, true)
  assert.equal(Object.hasOwn(boundMenuItemOf({ ...reply, items: [{ ...reply.items[0], quickActions: false }] }, [FIXTURE]).items[0], 'quickActions'), false)
  assert.deepEqual(boundMenuItemOf({ ...reply, items: [{ ...reply.items[0], quickActions: 'yes' }] }, [FIXTURE]), { unreadable: true })
  const plain = { ...reply, items: [{ ...reply.items[0], quickActions: undefined }] }
  assert.equal(Object.hasOwn(boundMenuItemOf(plain, [FIXTURE]).items[0], 'quickActions'), false)
})
