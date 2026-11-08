import assert from 'node:assert/strict'
import { test } from 'node:test'

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'

// CU-148: with a sheet or alert up, Command-D and Command-Delete press Don't Save whatever holds the focus.

const policy = createPolicy({ sitePolicy: () => 'allow' })
const decide = (keys, target, extra = {}) => policy.classify({ type: 'keypress', keys }, { url: 'app:ai.reflection.cu.fixture', target, ...extra })
const windowWithSheet = { role: 'AXWindow', name: 'Untitled', sheet: true }
const plainWindow = { role: 'AXWindow', name: 'Untitled', sheet: false }

test('Command-D or Command-Delete with a sheet up asks delete, whatever has the focus', () => {
  for (const target of [windowWithSheet, { role: 'AXSheet', name: null, sheet: true }, { role: 'AXTextField', name: 'Name', sheet: true }]) {
    assert.equal(decide(['META', 'D'], target).class, 'delete', `META+D on ${target.role}`)
    assert.equal(decide(['META', 'BACKSPACE'], target).class, 'delete', `META+BACKSPACE on ${target.role}`)
  }
})

test('without a sheet Command-D is not asked (Duplicate, Bookmark); Escape and Command-period on a sheet cancel', () => {
  assert.equal(decide(['META', 'D'], plainWindow).decision, 'allow')
  assert.equal(decide(['META', 'D'], { role: 'AXTextField', name: 'Name', sheet: false }).decision, 'allow')
  assert.equal(decide(['META', 'D'], { role: 'AXWindow', name: 'Untitled' }).decision, 'allow', 'an older helper reports no sheet: as before')
  assert.equal(decide(['ESCAPE'], windowWithSheet).decision, 'allow')
  assert.equal(decide(['META', 'PERIOD'], windowWithSheet).decision, 'allow')
  // CU-234: the modified variants are Don't Save too (generous; a no-op variant is a named over-ask).
  for (const mod of ['SHIFT', 'ALT', 'CTRL']) assert.equal(decide(['META', mod, 'D'], windowWithSheet).class, 'delete', `Command-${mod}-D`)
})

test('Command-D right after Command-W or Command-Q in the batch is aimed at the sheet that close raises', () => {
  assert.equal(decide(['META', 'D'], plainWindow, { afterClose: true }).class, 'delete')
})

async function pair(first) {
  const dir = mkdtempSync(join(tmpdir(), 'cu-sheet-'))
  try {
    const FIXTURE = 'ai.reflection.cu.fixture'
    const control = createRunControl()
    const environment = createFakeEnvironment({ kind: 'desktop', control })
    environment.focusedElement = async () => ({ origin: FIXTURE, role: 'AXWindow', name: 'Untitled', fingerprint: 'w', sheet: false })
    const store = createAppApprovals({ path: join(dir, 'a.json') })
    store.grantAlways(FIXTURE, { by: 'api' })
    const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'keypress', keys: first }, { type: 'keypress', keys: ['META', 'D'] }] }, { final: 'done' }] })
    const result = await runTask({ task: 'close it', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
    const keys = readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action' && e.action?.type === 'keypress')
    return { first: keys.find((e) => e.action.keys.includes(first[1])), d: keys.find((e) => e.action.keys.includes('D')) }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('in the loop: Command-W or Command-Q then Command-D in one batch - the D asked delete, though the read sees no sheet yet', async () => {
  // CU-234: Command-Option-W (Close All) and Command-Shift-W raise the same sheets (Command-Shift-Q is the system's Log
  // Out, refused before it can raise one).
  for (const close of [['META', 'W'], ['META', 'Q'], ['META', 'ALT', 'W'], ['META', 'SHIFT', 'W'], ['META', 'ALT', 'Q']]) {
    const { first, d } = await pair(close)
    assert.equal(first.decision, 'allow', close.join('+'))
    assert.deepEqual([d.decision, d.class], ['confirm', 'delete'], close.join('+'))
  }
})

test('in the loop: only a close raises the sheet - Command-S or Command-C then Command-D is not asked (cu-verifier)', async () => {
  for (const other of [['META', 'S'], ['META', 'C']]) {
    const { d } = await pair(other)
    assert.equal(d.decision, 'allow', other.join('+'))
  }
})

test('in the loop on the desktop: a drag released on a zone named Trash asks delete (CU-152 - the drop reaches the policy)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cu-drop-'))
  try {
    const FIXTURE = 'ai.reflection.cu.fixture'
    const control = createRunControl()
    const environment = createFakeEnvironment({ kind: 'desktop', control })
    environment.inspectPoint = async ({ x }) => (x < 100 ? { origin: FIXTURE, role: 'AXRow', name: 'doc-104', fingerprint: 'row' } : { origin: FIXTURE, role: 'AXGroup', name: 'Trash', fingerprint: 'zone' })
    const store = createAppApprovals({ path: join(dir, 'a.json') })
    store.grantAlways(FIXTURE, { by: 'api' })
    const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'drag', path: [{ x: 50, y: 50 }, { x: 600, y: 400 }] }] }, { final: 'done' }] })
    const result = await runTask({ task: 'tidy up', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
    const drag = readRun(result.trajectoryDir).events.find((e) => e.kind === 'action' && e.action?.type === 'drag')
    assert.deepEqual([drag.decision, drag.class], ['confirm', 'delete'])
    assert.equal(environment.log.length, 0, 'unattended, the drop never ran')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
