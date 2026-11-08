import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'

// CU-147: a plain Backspace or Delete on a focused collection removes the selection (Mail: no dialog).

const policy = createPolicy({ sitePolicy: () => 'allow' })
const decide = (keys, role, name = null) => policy.classify({ type: 'keypress', keys }, { url: 'app:ai.reflection.cu.fixture', target: { role, name } })

test('Backspace or Delete on a focused list, table, outline, row or cell asks delete - AX and web roles', () => {
  for (const role of ['AXTable', 'AXOutline', 'AXList', 'AXBrowser', 'AXRow', 'AXCell', 'grid', 'listbox', 'treegrid', 'tree', 'row', 'gridcell', 'option', 'listitem']) {
    assert.equal(decide(['BACKSPACE'], role).class, 'delete', `Backspace on ${role}`)
    assert.equal(decide(['DELETE'], role).class, 'delete', `Delete on ${role}`)
  }
  assert.equal(policy.classify({ type: 'hold_key', keys: ['BACKSPACE'] }, { url: 'app:ai.reflection.cu.fixture', target: { role: 'AXTable', name: 'Messages' } }).class, 'delete', 'a hold too')
})

test('in a text input Backspace edits text; elsewhere it is not a collection; a modified chord keeps its own rule', () => {
  for (const role of ['AXTextField', 'AXTextArea', 'AXComboBox', 'textbox', 'searchbox']) assert.equal(decide(['BACKSPACE'], role).decision, 'allow', role)
  assert.equal(decide(['BACKSPACE'], 'AXGroup').decision, 'allow', 'a canvas or group')
  // CU-234: with Shift, Option or Control too it removes the selection (Shift-Backspace is deleteBackward:); generous.
  for (const keys of [['SHIFT', 'BACKSPACE'], ['ALT', 'BACKSPACE'], ['CTRL', 'BACKSPACE'], ['SHIFT', 'DELETE']]) assert.equal(decide(keys, 'AXTable').class, 'delete', keys.join('+'))
  assert.equal(decide(['ALT', 'BACKSPACE'], 'AXTextField').decision, 'allow', 'in a text input Option-Backspace deletes a word')
})

test('in the loop: Tab onto the messages table, then Backspace in one batch - judged on the settled focus', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cu-collection-'))
  try {
    const FIXTURE = 'ai.reflection.cu.fixture'
    const field = { origin: FIXTURE, role: 'AXTextField', name: 'Search', fingerprint: 'f' }
    const table = { origin: FIXTURE, role: 'AXTable', name: 'Messages', fingerprint: 't' }
    const reads = [field, field, table]
    let i = 0
    const control = createRunControl()
    const environment = createFakeEnvironment({ kind: 'desktop', control })
    environment.focusedElement = async () => reads[Math.min(i++, reads.length - 1)]
    const store = createAppApprovals({ path: join(dir, 'a.json') })
    store.grantAlways(FIXTURE, { by: 'api' })
    const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'keypress', keys: ['TAB'] }, { type: 'keypress', keys: ['BACKSPACE'] }] }, { final: 'done' }] })
    const result = await runTask({ task: 'tidy', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
    const back = readRun(result.trajectoryDir).events.find((e) => e.kind === 'action' && e.action?.keys?.includes('BACKSPACE'))
    assert.deepEqual([back.decision, back.class], ['confirm', 'delete'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
