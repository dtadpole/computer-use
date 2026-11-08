import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { fakeLauncher, logged, scratchLocks, stopFake } from './harness.mjs'

// CU-194 (password-memory.md rule 1, the desktop half): an entry carries fieldKey, a hash of its bundle id, process
// and frame's top-left relative to its window (helper 0.2.48's windowOrigin, else the screen frame), so a show-password toggle
// that swaps a secure field for a plain twin in its place keeps the key. Properties only - the tests never recompute
// the hash. Each world is its own fake helper launch (CU-117).

const FIXTURE = 'ai.reflection.cu.fixture'
const OTHER = 'ai.reflection.cu.ledger'
const locks = scratchLocks()
after(() => locks.remove())
const launchOnFake = fakeLauncher(locks, { apps: [FIXTURE] })
const box = (x, y, width, height) => ({ x, y, width, height })
const world = (element, { bundleId = FIXTURE, pid = 601 } = {}) => ({
  displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 800, height: 600 }, scale: 1 }],
  apps: [{ bundleId: FIXTURE, pid: 601, title: 'CU Fixture', rect: box(0, 0, 800, 600) }, ...(bundleId === OTHER ? [{ bundleId: OTHER, pid, title: 'CU Ledger', rect: box(0, 0, 800, 600) }] : [])],
  frontmost: bundleId,
  elements: [{ rect: element.frame, element: { bundleId, pid, ...element } }],
})
const inspect = async (element, owner = {}, options = {}) => {
  const { env, child } = await launchOnFake(world(element, owner), options)
  try {
    await logged(child, 3)
    return await env.inspectPoint({ x: element.frame.x + 5, y: element.frame.y + 5 })
  } finally {
    await env.close().catch(() => {})
    await stopFake(child)
  }
}
const SECURE = Object.freeze({ role: 'AXTextField', subrole: 'AXSecureTextField', title: 'Password', frame: box(300, 200, 200, 24), secure: true, windowOrigin: { x: 100, y: 80 } })
const PLAIN = Object.freeze({ ...SECURE, subrole: null, secure: false })
const MOVED = (element) => ({ ...element, frame: box(350, 230, 200, 24), ...(element.windowOrigin ? { windowOrigin: { x: 150, y: 110 } } : {}) })

test('CU-194: a secure field and the plain twin a show-password toggle puts in its place share one fieldKey - also when a custom toggle narrows it for an eye button', async () => {
  const secret = await inspect(SECURE)
  const shown = await inspect(PLAIN)
  assert.match(secret.fieldKey, /^[0-9a-f]{32}$/)
  assert.equal(shown.fieldKey, secret.fieldKey)
  assert.deepEqual([secret.isPassword, shown.isPassword], [true, false], 'only the key carries the memory')
  assert.equal((await inspect({ ...PLAIN, frame: box(300, 200, 172, 24) })).fieldKey, secret.fieldKey, 'narrowed for an eye button (cu-researcher): same top-left, same key')
  assert.equal((await inspect({ ...PLAIN, frame: box(300, 200, 200, 30) })).fieldKey, secret.fieldKey, 'a taller twin too')
})

test('CU-194: the key is window-relative - a window moved with its field keeps it; with no windowOrigin, a malformed one or an older helper the screen frame is used, so a move loses it (the named limit)', async () => {
  const base = await inspect(SECURE)
  assert.equal((await inspect(MOVED(SECURE))).fieldKey, base.fieldKey, 'moved window, same key')
  const screen = await inspect({ ...SECURE, windowOrigin: null })
  assert.notEqual(screen.fieldKey, base.fieldKey, 'the screen frame is another key than the window-relative one')
  assert.notEqual((await inspect(MOVED({ ...SECURE, windowOrigin: null }))).fieldKey, screen.fieldKey, 'no windowOrigin: a move loses it')
  assert.equal((await inspect({ ...SECURE, windowOrigin: { x: '100', y: 80 } })).fieldKey, screen.fieldKey, 'a malformed windowOrigin reads as none')
  const { windowOrigin, ...older } = SECURE
  assert.equal((await inspect(older)).fieldKey, screen.fieldKey, 'an older helper sends none: the screen frame')
  assert.equal((await inspect({ ...SECURE, windowOrigin: { x: 0, y: 7 } })).fingerprint, base.fingerprint, 'windowOrigin is outside the fingerprint')
})

test('CU-194: another process, another app, or another top-left in the window is another key', async () => {
  const base = await inspect(SECURE)
  assert.notEqual((await inspect(SECURE, { pid: 602 })).fieldKey, base.fieldKey, 'the app relaunched: its keys are gone')
  assert.notEqual((await inspect({ ...SECURE, frame: box(300, 240, 200, 24) })).fieldKey, base.fieldKey, 'the next field down')
  assert.notEqual((await inspect({ ...SECURE, frame: box(320, 200, 200, 24) })).fieldKey, base.fieldKey, 'the field beside it')
  const other = await inspect(SECURE, { bundleId: OTHER, pid: 601 }, { apps: [FIXTURE, OTHER] })
  assert.match(other.fieldKey, /^[0-9a-f]{32}$/, 'the second app is in scope')
  assert.notEqual(other.fieldKey, base.fieldKey, 'same pid and place in another app (a reused pid): another key')
})

test('CU-194: only entries carry a key - a button, static text and a read-only field none; a text area, combo box, search field or any editable element one', async () => {
  for (const element of [{ role: 'AXButton', title: 'Save' }, { role: 'AXStaticText', title: 'IBAN' }, { role: 'AXTextField', title: 'Name', editable: false }]) {
    assert.equal((await inspect({ ...element, frame: box(300, 200, 200, 24) })).fieldKey, undefined, JSON.stringify(element))
  }
  for (const element of [{ role: 'AXTextArea', title: 'Notes' }, { role: 'AXComboBox', title: 'City' }, { role: 'AXSearchField', title: 'Search' }, { role: 'AXGroup', title: 'Editor', editable: true }]) {
    assert.match((await inspect({ ...element, frame: box(300, 200, 200, 24) })).fieldKey ?? '', /^[0-9a-f]{32}$/, JSON.stringify(element))
  }
})
