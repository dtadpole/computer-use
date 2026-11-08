import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { connectStdio } from '../../_environments_/macos-desktop/helper-link.mjs'
import { createAppApprovals, createScriptedAdapter, startRun } from '../../_tools_/agent-core/lib.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'
import { cleanEnvironment } from '../../_tools_/verify-kit/sut.mjs'
import { scratchLocks, spawnFake, stopFake } from './harness.mjs'

// CU-135 seam (keyboard-activation.md): agent core's own startRun over the real macOS driver on the fake helper. The
// keypress target is the FOCUSED control the helper names - not its window - and a key that activates a destructive
// button asks: unattended it is declined, and no input reaches the helper.

const FIXTURE = 'com.example.fixture'
const locks = scratchLocks()

const element = (fields) => ({ bundleId: FIXTURE, pid: 501, frame: { x: 300, y: 300, width: 120, height: 32 }, secure: false, ...fields })

async function keyOnFocused(keys, focused, { batch = null, focusedReads = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cu-keyboard-seam-'))
  const child = spawnFake(focusedReads ? { focusedReads: focusedReads.map(element) } : { focused: element(focused) })
  let handle = null
  try {
    const appApprovals = createAppApprovals({ path: join(dir, 'app-approvals.json') })
    appApprovals.grantAlways(FIXTURE, { by: 'tty' })
    handle = await startRun({
      environment: 'macos-desktop', seat: 'cu-developer-one', apps: [FIXTURE], appApprovals, env: cleanEnvironment(), task: 'finish up',
      runsDirectory: join(dir, 'runs'), live: false, consent: { mode: 'unattended' }, bounds: { maxSteps: 3, maxWallMs: 30_000 },
      model: createScriptedAdapter({ turns: [{ actions: batch ?? [{ type: 'keypress', keys }] }, { final: 'done\nOUTCOME: not_done' }] }),
      environmentOptions: { connect: () => connectStdio(child, { token: 'test-token', helloTimeoutMs: 5000 }), runLock: locks.next() },
    })
    assert.equal(handle.started, true)
    const result = await handle.done
    const events = readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action' && ['keypress', 'type'].includes(e.action?.type))
    return { event: events[events.length - 1], events, inputs: child.requests.filter((r) => r.type === 'input').length }
  } finally {
    if (handle !== null) await handle.done.catch(() => {})
    await stopFake(child)
    rmSync(dir, { recursive: true, force: true })
  }
}

test('Space on a focused Delete button asks through the real driver: unattended declined, no input', async () => {
  const { event, inputs } = await keyOnFocused(['SPACE'], { role: 'AXButton', title: 'Delete' })
  assert.deepEqual([event.decision, event.class, event.target?.role, event.target?.name], ['confirm', 'delete', 'AXButton', 'Delete'], 'the target is the focused button')
  assert.notEqual(event.status, 'done')
  assert.equal(inputs, 0, 'nothing reached the helper')
})

test('Command-D on a focused sheet button asks; Space on a benign button does not', async () => {
  const sheet = await keyOnFocused(['META', 'D'], { role: 'AXButton', title: 'Save' })
  assert.deepEqual([sheet.event.decision, sheet.event.class], ['confirm', 'delete'])
  assert.equal(sheet.inputs, 0)
  const benign = await keyOnFocused(['SPACE'], { role: 'AXButton', title: 'Update cart' })
  assert.equal(benign.event.decision, 'allow')
})

test('a click the helper answers with the window itself (no control under the pointer) is marked targetUnnamed', async () => {
  const run = async (element) => {
    const dir = mkdtempSync(join(tmpdir(), 'cu-unnamed-seam-'))
    const child = spawnFake({ elements: [{ rect: { x: 200, y: 200, width: 200, height: 100 }, element: { bundleId: FIXTURE, pid: 501, frame: { x: 200, y: 200, width: 200, height: 100 }, secure: false, ...element } }] })
    let handle = null
    try {
      const appApprovals = createAppApprovals({ path: join(dir, 'app-approvals.json') })
      appApprovals.grantAlways(FIXTURE, { by: 'tty' })
      handle = await startRun({
        environment: 'macos-desktop', seat: 'cu-developer-one', apps: [FIXTURE], appApprovals, env: cleanEnvironment(), task: 'press it',
        runsDirectory: join(dir, 'runs'), live: false, consent: { mode: 'unattended' }, bounds: { maxSteps: 3, maxWallMs: 30_000 },
        model: createScriptedAdapter({ turns: [{ actions: [{ type: 'click', x: 250, y: 250, button: 'left' }] }, { final: 'done\nOUTCOME: done' }] }),
        environmentOptions: { connect: () => connectStdio(child, { token: 'test-token', helloTimeoutMs: 5000 }), runLock: locks.next() },
      })
      const result = await handle.done
      return readRun(result.trajectoryDir).events.find((e) => e.kind === 'action' && e.action?.type === 'click')
    } finally {
      if (handle !== null) await handle.done.catch(() => {})
      await stopFake(child)
      rmSync(dir, { recursive: true, force: true })
    }
  }
  assert.equal((await run({ role: 'AXWindow', title: 'Archive' })).targetUnnamed, true, 'the window answered for a custom view')
  assert.equal((await run({ role: 'AXButton', title: 'Open' })).targetUnnamed, undefined, 'a named control is not marked')
})

test('Tab then Space in one batch: the Space is judged against the focus after the app moved it (cu-developer-two\'s race)', async () => {
  const name = { role: 'AXTextField', title: 'Name' }
  const del = { role: 'AXButton', title: 'Delete' }
  // The Tab's own read, then one stale read of the name field before the app's focus reaches Delete.
  const late = await keyOnFocused(null, null, { batch: [{ type: 'keypress', keys: ['TAB'] }, { type: 'keypress', keys: ['SPACE'] }], focusedReads: [name, name, del] })
  assert.deepEqual([late.event.action.keys, late.event.decision, late.event.class, late.event.target?.name], [['SPACE'], 'confirm', 'delete', 'Delete'])
  assert.equal(late.inputs, 1, 'the Tab went, the Space did not')
  // A focus that never settles within the window is asked as an unknown target, never let through.
  const flapping = Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? name : del))
  const never = await keyOnFocused(null, null, { batch: [{ type: 'keypress', keys: ['TAB'] }, { type: 'keypress', keys: ['SPACE'] }], focusedReads: [name, ...flapping] })
  assert.deepEqual([never.event.decision, never.event.class], ['confirm', 'unknown_target'])
  assert.equal(never.inputs, 1)
})

test('a type holding tabs runs as its segments, each judged on the settled focus (cu-verifier, cu-researcher)', async () => {
  const cell = { role: 'AXTextField', title: 'Cell' }
  // enter-12-rows' recorded shape: rows typed tab-separated, newline-ended, into grid cells - typing, never asked.
  const rows = await keyOnFocused(null, cell, { batch: Array.from({ length: 3 }, (_, i) => ({ type: 'type', text: `Fay ${i}\t4${i}\tpaid\n` })) })
  assert.deepEqual(rows.events.filter((e) => e.decision !== 'allow').map((e) => [e.action.type, e.decision, e.class]), [], 'no question across text inputs')
  assert.ok(rows.inputs >= 15, 'every segment and tab reached the helper')
  const address = await keyOnFocused(null, cell, { batch: [{ type: 'type', text: 'John\t123 Main St' }] })
  assert.equal(address.events.every((e) => e.decision === 'allow'), true, 'a space in the next field is typing')
  // 'x\t ' from a field: the tab moves the focus late onto Delete, and the space would press it - asked.
  const field = { role: 'AXTextField', title: 'Name' }
  const del = { role: 'AXButton', title: 'Delete' }
  const pressed = await keyOnFocused(null, null, { batch: [{ type: 'type', text: 'x\t ' }], focusedReads: [field, field, field, del] })
  assert.deepEqual([pressed.event.action.type, pressed.event.action.text, pressed.event.decision, pressed.event.class, pressed.event.target?.name], ['type', ' ', 'confirm', 'delete', 'Delete'])
  assert.equal(pressed.event.composedFrom?.typeSplitFrom, 0, 'the part records the action it came from')
  assert.equal(pressed.inputs, 2, 'the x and the tab went, the space did not')
})
