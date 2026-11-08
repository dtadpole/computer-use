import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { boundMenuItemOf, menuPathOf, servicesMenuOf } from '../../_environments_/macos-desktop/environment.mjs'
import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { fakeLauncher, logged, scratchLocks, stopFake } from './harness.mjs'

/**
 * CU-250's driver half: helper 0.2.53 marks a menu item under the Services menu (servicesMenu) and gives its menu path.
 * A service acts outside the approved app (CU-249), and an owner-installed one has a name no list knows, so the mark is
 * what app-policy refuses by. The driver passes the mark on a clicked or focused menu item and on menuKey items, and the
 * path on a menu item - neither into run records. On the fake helper, and across the real seam through runTask.
 */

const FIXTURE = 'ai.reflection.cu.fixture'
const locks = scratchLocks()
const dir = mkdtempSync(join(tmpdir(), 'cu-services-'))
after(() => { locks.remove(); rmSync(dir, { recursive: true, force: true }) })
const launchOnFake = fakeLauncher(locks, { apps: [FIXTURE] })
const inputs = (child) => child.requests.filter((r) => r.type === 'input').length

// An owner-installed service: no default-service name matches it.
const SERVICE = { bundleId: FIXTURE, pid: 601, role: 'AXMenuItem', subrole: null, title: 'Upload with Example Sync', frame: { x: 100, y: 100, width: 200, height: 20 }, secure: false, menuPath: ['CU Fixture', 'Services', 'Upload with Example Sync'], servicesMenu: true }
const world = (elements, extra = {}) => ({
  displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 800, height: 600 }, scale: 1 }],
  apps: [{ bundleId: FIXTURE, pid: 601, title: 'Fixture', rect: { x: 0, y: 0, width: 800, height: 600 } }],
  frontmost: FIXTURE,
  elements: elements.map((element) => ({ rect: element.frame, element })),
  ...extra,
})

let runs = 0
async function runOnFake(config, action) {
  const control = createRunControl()
  const { env, child } = await launchOnFake(config, { control })
  await logged(child, 3)
  try {
    const store = createAppApprovals({ path: join(dir, `approvals-${runs += 1}.json`) })
    store.grantAlways(FIXTURE, { by: 'api' })
    const model = createScriptedAdapter({ frame: { width: env.frame.width, height: env.frame.height }, turns: [{ actions: [action] }, { final: 'done' }] })
    const result = await runTask({ task: 'share the file', environment: env, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
    const text = readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8')
    const events = text.trim().split('\n').map((line) => JSON.parse(line))
    const event = events.filter((e) => e.kind === 'action' && e.action?.type === action.type && e.status !== 'attempted').pop()
    return { event, posted: inputs(child), text }
  } finally {
    await env.close()
    await stopFake(child)
  }
}

const summary = (e) => JSON.stringify({ decision: e?.decision, rule: e?.rule, class: e?.class, status: e?.status })
const CLICK = { type: 'click', button: 'left', x: 200, y: 110 }

test('CU-250 seam: a click on an owner-installed service (marked servicesMenu) is refused - nothing posted, no path in the records', async () => {
  const { event, posted, text } = await runOnFake(world([SERVICE]), CLICK)
  assert.equal(event?.decision, 'block', summary(event))
  assert.equal(posted, 0)
  assert.doesNotMatch(text, /"menuPath"|"Services"/, 'the menu path stays out of the run records')
})

test('CU-250 seam: the same item without the mark (an older helper) is judged by its name only - allowed; the mark is what closes it', async () => {
  const { servicesMenu, menuPath, ...unmarked } = SERVICE
  const { event, posted } = await runOnFake(world([unmarked]), CLICK)
  assert.equal(event?.decision, 'allow', summary(event))
  assert.equal(posted, 1)
})

test('CU-250 driver: inspectPoint passes the mark and the path on a menu item; a malformed mark fails closed; a malformed path is null', async () => {
  const control = createRunControl()
  const plain = { ...SERVICE, title: 'Copy', frame: { x: 100, y: 200, width: 200, height: 20 }, menuPath: undefined, servicesMenu: undefined }
  const odd = { ...SERVICE, title: 'Odd', frame: { x: 100, y: 300, width: 200, height: 20 }, menuPath: ['A', 7], servicesMenu: 'yes' }
  const { env, child } = await launchOnFake(world([SERVICE, plain, odd]), { control })
  await logged(child, 3)
  try {
    await env.addApp(FIXTURE)
    const a = await env.inspectPoint({ x: 200, y: 110 })
    assert.deepEqual([a.servicesMenu, a.menuPath], [true, ['CU Fixture', 'Services', 'Upload with Example Sync']])
    const b = await env.inspectPoint({ x: 200, y: 210 })
    assert.deepEqual([Object.hasOwn(b, 'servicesMenu'), b.menuPath], [false, null], 'no mark, no path: an older helper or an ordinary item')
    const c = await env.inspectPoint({ x: 200, y: 310 })
    assert.deepEqual([c.servicesMenu, c.menuPath], [true, null])
    assert.equal(a.fingerprint, (await env.inspectPoint({ x: 200, y: 110 })).fingerprint)
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('CU-250 driver: menuPathOf and servicesMenuOf, and menuKey items carry the mark (a non-boolean mark makes the list unreadable)', () => {
  assert.deepEqual(menuPathOf([' File ', '', 'x'.repeat(90)]), ['File', '', 'x'.repeat(80)])
  for (const bad of [undefined, null, 'File', [], Array.from({ length: 11 }, () => 'a'), ['a', null]]) assert.equal(menuPathOf(bad), null, JSON.stringify(bad))
  assert.deepEqual([undefined, null, false, true, 'yes', 1].map(servicesMenuOf), [false, false, false, true, true, true])
  const reply = { bundleId: FIXTURE, items: [{ title: 'Upload with Example Sync', path: ['CU Fixture', 'Services', 'Upload with Example Sync'], keyEquivalent: { char: 'U', modifiers: 1 }, enabled: true, servicesMenu: true }] }
  assert.equal(boundMenuItemOf(reply, [FIXTURE]).items[0].servicesMenu, true)
  assert.deepEqual(boundMenuItemOf({ ...reply, items: [{ ...reply.items[0], servicesMenu: 'yes' }] }, [FIXTURE]), { unreadable: true })
  assert.equal(Object.hasOwn(boundMenuItemOf({ ...reply, items: [{ ...reply.items[0], servicesMenu: false }] }, [FIXTURE]).items[0], 'servicesMenu'), false)
})

test('CU-250 seam: a chord bound to a marked service is refused (agent core keeps the mark on a bound item since #56)', async () => {
  const bound = { bundleId: FIXTURE, items: [{ title: 'Upload with Example Sync', path: ['CU Fixture', 'Services', 'Upload with Example Sync'], keyEquivalent: { char: 'U', modifiers: 1 }, enabled: true, servicesMenu: true }] }
  const { event, posted } = await runOnFake(world([], { menuKeys: [{ keyCode: 32, flags: 0x120000, reply: bound }] }), { type: 'keypress', keys: ['META', 'SHIFT', 'U'] })
  assert.equal(event?.decision, 'block', summary(event))
  assert.equal(posted, 0)
})
