import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { fakeLauncher, logged, scratchLocks, stopFake } from './harness.mjs'

/**
 * CU-252 across the real seam (CU-259's selectedItems, #101's rules): in a file browser, an open of the selection -
 * Command-O with a list focused, or a click on File > Open - reads the selection through the desktop driver from the
 * helper and asks launch_code when it may run code (a script, a bundle, an extensionless file, an unreadable read);
 * a document, a folder or nothing selected opens freely. On the fake helper, with the file browser's bundle id as a
 * plain string in its world - no app is touched.
 */

const FINDER = 'com.apple.finder'
const locks = scratchLocks()
const dir = mkdtempSync(join(tmpdir(), 'cu-open-selection-'))
after(() => { locks.remove(); rmSync(dir, { recursive: true, force: true }) })
const launchOnFake = fakeLauncher(locks, { apps: [FINDER] })
const inputs = (child) => child.requests.filter((r) => r.type === 'input').length

const LIST = { bundleId: FINDER, pid: 701, role: 'AXOutline', subrole: null, title: '', frame: { x: 0, y: 40, width: 800, height: 500 }, secure: false }
const OPEN_ITEM = { bundleId: FINDER, pid: 701, role: 'AXMenuItem', subrole: null, title: 'Open', frame: { x: 100, y: 100, width: 200, height: 20 }, secure: false }
const selection = (items) => ({ items, bundleId: FINDER })
const world = (selected, extra = {}) => ({
  displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 800, height: 600 }, scale: 1 }],
  apps: [{ bundleId: FINDER, pid: 701, title: 'Files', rect: { x: 0, y: 0, width: 800, height: 600 } }],
  frontmost: FINDER,
  elements: [{ rect: OPEN_ITEM.frame, element: OPEN_ITEM }, { rect: LIST.frame, element: LIST }],
  focused: LIST,
  selectedItems: selected,
  ...extra,
})

let runs = 0
async function runOnFake(config, action) {
  const control = createRunControl()
  const { env, child } = await launchOnFake(config, { control })
  await logged(child, 3)
  try {
    const store = createAppApprovals({ path: join(dir, `approvals-${runs += 1}.json`) })
    store.grantAlways(FINDER, { by: 'api' })
    const model = createScriptedAdapter({ frame: { width: env.frame.width, height: env.frame.height }, turns: [{ actions: [action] }, { final: 'done' }] })
    const result = await runTask({ task: 'open the selected file', environment: env, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FINDER], appApprovals: store })
    const text = readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8')
    const events = text.trim().split('\n').map((line) => JSON.parse(line))
    const event = events.filter((e) => e.kind === 'action' && e.action?.type === action.type && e.status !== 'attempted').pop()
    return { event, posted: inputs(child), text, asked: child.requests.filter((r) => r.type === 'selectedItems').length }
  } finally {
    await env.close()
    await stopFake(child)
  }
}

const summary = (e) => JSON.stringify({ decision: e?.decision, rule: e?.rule, class: e?.class, status: e?.status })
const CMD_O = { type: 'keypress', keys: ['META', 'O'] }
const OPEN_CLICK = { type: 'click', button: 'left', x: 200, y: 110 }

test('CU-252 seam: Command-O on a selected script asks launch_code through the real driver - read once, nothing posted, no name in the records', async () => {
  const { event, posted, text, asked } = await runOnFake(world(selection([{ name: 'install.command', kind: 'file' }])), CMD_O)
  assert.deepEqual([event?.decision, event?.class, event?.rule], ['confirm', 'launch_code', 'selection:launch_code'], summary(event))
  assert.equal(posted, 0, 'declined unattended: nothing posted')
  assert.equal(asked, 1, 'the selection was read once, from the helper')
  assert.equal(text.includes('install.command'), false, 'the selected name never reaches the run records')
})

test('CU-252 seam: a click on File > Open with a bundle selected asks; so does an unreadable read', async () => {
  const bundle = await runOnFake(world(selection([{ name: 'Payload.app', kind: 'folder' }])), OPEN_CLICK)
  assert.equal(bundle.event?.class, 'launch_code', summary(bundle.event))
  assert.equal(bundle.posted, 0)
  const unreadable = await runOnFake(world({ unreadable: true, bundleId: FINDER }), CMD_O)
  assert.equal(unreadable.event?.class, 'launch_code', `rule 1: an open of what cannot be read asks - ${summary(unreadable.event)}`)
  const truncated = await runOnFake(world({ items: [{ name: 'notes.txt', kind: 'file' }], truncated: true, bundleId: FINDER }), CMD_O)
  assert.equal(truncated.event?.class, 'launch_code', `a truncated list is unreadable - ${summary(truncated.event)}`)
})

test('CU-252 seam: a document, a folder or nothing selected opens freely - the keys are posted', async () => {
  for (const selected of [selection([{ name: 'notes.txt', kind: 'file' }]), selection([{ name: 'Reports', kind: 'folder' }]), { none: true, bundleId: FINDER }]) {
    const { event, posted } = await runOnFake(world(selected), CMD_O)
    assert.equal(event?.decision, 'allow', `${JSON.stringify(selected)} ${summary(event)}`)
    assert.equal(posted, 1)
  }
})

test('CU-252 seam: in another app whose selection read reports files (the CU Fixture stand-in, Path Finder), Command-O on a script asks', { todo: 'CU-252: #103 (the any-app rule) not on main yet' }, async () => {
  const FIXTURE = 'ai.reflection.cu.fixture'
  const config = world({ items: [{ name: 'install.command', kind: 'file' }], bundleId: FIXTURE }, {
    apps: [{ bundleId: FIXTURE, pid: 601, title: 'Fixture', rect: { x: 0, y: 0, width: 800, height: 600 } }],
    frontmost: FIXTURE,
    focused: { ...LIST, bundleId: FIXTURE, pid: 601 },
    elements: [],
  })
  const control = createRunControl()
  const { env, child } = await fakeLauncher(locks, { apps: [FIXTURE] })(config, { control })
  await logged(child, 3)
  try {
    const store = createAppApprovals({ path: join(dir, `approvals-${runs += 1}.json`) })
    store.grantAlways(FIXTURE, { by: 'api' })
    const model = createScriptedAdapter({ frame: { width: env.frame.width, height: env.frame.height }, turns: [{ actions: [CMD_O] }, { final: 'done' }] })
    const result = await runTask({ task: 'open the selected file', environment: env, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
    const events = readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
    const event = events.filter((e) => e.kind === 'action' && e.action?.type === 'keypress' && e.status !== 'attempted').pop()
    assert.equal(event?.class, 'launch_code', summary(event))
    assert.equal(inputs(child), 0)
  } finally {
    await env.close()
    await stopFake(child)
  }
})
