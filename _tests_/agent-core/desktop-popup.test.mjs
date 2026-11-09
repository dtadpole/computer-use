import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-372 (Medium; helper 0.2.65): a desktop popup button is a choice like a web select (CU-370) - the item a key or a type
// lands on is judged like a click on it; an unread landing asks.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const APP = 'ai.reflection.cu.fixture'
const POPUP = { origin: APP, role: 'AXPopUpButton', name: 'Action', editable: false }
const judge = (action, target, extra = {}) => { const v = policy.classify(action, { url: `app:${APP}`, target, ...extra }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-372: a popup item landed on by arrow or type is judged by its title; unread asks', () => {
  assert.equal(judge({ type: 'keypress', keys: ['ARROWDOWN'] }, { origin: APP, role: 'AXMenuItem', name: 'Delete', selectOption: true }), 'delete')
  assert.equal(judge({ type: 'type', text: 'Del' }, POPUP, { typeOptions: [{ role: 'AXMenuItem', name: 'Delete' }] }), 'delete')
  assert.equal(judge({ type: 'keypress', keys: ['ENTER'] }, { ...POPUP, optionUnread: true }), 'unknown_target')
  assert.equal(judge({ type: 'keypress', keys: ['ARROWDOWN'] }, { origin: APP, role: 'AXMenuItem', name: ['Remove account pat', 'example.com'].join('@'), selectOption: true }), 'delete', 'the raw title is judged (cu-researcher)')
  assert.equal(judge({ type: 'type', text: 'Del' }, POPUP, { typeOptions: { unread: true } }), 'unknown_target')
})

test('CU-372 negatives: a benign item is free', () => {
  assert.equal(judge({ type: 'keypress', keys: ['ARROWDOWN'] }, { origin: APP, role: 'AXMenuItem', name: 'Archive', selectOption: true }), 'allow')
  assert.equal(judge({ type: 'type', text: 'Ar' }, POPUP, { typeOptions: [{ role: 'AXMenuItem', name: 'Archive' }] }), 'allow')
})

test('CU-372 privacy: a value-shaped landed item title never reaches the run record', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { createScriptedAdapter } = await import('../../_tools_/agent-core/adapter-scripted.mjs')
  const { createRunControl } = await import('../../_tools_/agent-core/control.mjs')
  const { createFakeEnvironment } = await import('../../_tools_/agent-core/fake-env.mjs')
  const { runTask } = await import('../../_tools_/agent-core/loop.mjs')
  const { createAppApprovals } = await import('../../_tools_/agent-core/app-approvals.mjs')
  const { readRun } = await import('../../_tools_/agent-core/trajectory.mjs')
  const tmp = mkdtempSync(join(tmpdir(), 'cu-372-'))
  try {
    const CARD = ['4111', '1111', '1111', '1111'].join(' ')
    const control = createRunControl()
    const environment = createFakeEnvironment({ kind: 'desktop', control, frontmost: APP, focused: POPUP })
    environment.keyTarget = async () => ({ origin: APP, role: 'AXMenuItem', name: CARD, selectOption: true })
    const approvals = createAppApprovals({ path: join(tmp, 'a.json') })
    approvals.grantAlways(APP, { by: 'api' })
    const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'keypress', keys: ['ARROWDOWN'] }] }, { final: 'done' }] })
    const result = await runTask({ task: 'pick a card', environment, model, control, runsDirectory: join(tmp, 'runs'), build: { commit: 'test', dirty: false }, apps: [APP], appApprovals: approvals })
    assert.equal(JSON.stringify(readRun(result.trajectoryDir).events).includes('4111'), false)
  } finally { rmSync(tmp, { recursive: true, force: true }) }
})

test('CU-372 in the loop: the desktop route asks typeOptions - Ar into a popup landing on Archive types freely', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { createScriptedAdapter } = await import('../../_tools_/agent-core/adapter-scripted.mjs')
  const { createRunControl } = await import('../../_tools_/agent-core/control.mjs')
  const { createFakeEnvironment } = await import('../../_tools_/agent-core/fake-env.mjs')
  const { runTask } = await import('../../_tools_/agent-core/loop.mjs')
  const { createAppApprovals } = await import('../../_tools_/agent-core/app-approvals.mjs')
  const { readRun } = await import('../../_tools_/agent-core/trajectory.mjs')
  const tmp = mkdtempSync(join(tmpdir(), 'cu-372-type-'))
  try {
    const control = createRunControl()
    const environment = createFakeEnvironment({ kind: 'desktop', control, frontmost: APP, focused: POPUP })
    environment.typeOptions = async () => [{ origin: APP, role: 'AXMenuItem', name: 'Archive', selectOption: true }]
    const approvals = createAppApprovals({ path: join(tmp, 'a.json') })
    approvals.grantAlways(APP, { by: 'api' })
    const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'type', text: 'Ar' }] }, { final: 'done' }] })
    const result = await runTask({ task: 'tidy', environment, model, control, runsDirectory: join(tmp, 'runs'), build: { commit: 'test', dirty: false }, apps: [APP], appApprovals: approvals })
    const typed = readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action' && e.action?.type === 'type').at(-1)
    assert.equal(typed.status, 'done', 'read landing on a benign item: no shortcut fallback')
  } finally { rmSync(tmp, { recursive: true, force: true }) }
})
