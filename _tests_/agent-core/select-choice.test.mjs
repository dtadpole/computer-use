import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-370 (design note 0.1; cu-verifier reproduced it live: 'Delete' typed into a focused 'Bulk actions' <select>
// deleted the rows): a select is a choice, not a text entry, and the option a key lands on is judged like a click on it.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const BULK = { tag: 'select', role: 'combobox', name: 'Bulk actions', editable: false }
const judge = (action, target, extra = {}) => { const v = policy.classify(action, { url: 'https://shop.example/orders', target, ...extra }); return v.decision === 'allow' ? 'allow' : `${v.class}/${v.rule}` }

test('CU-370: type-ahead into a select is judged by the option it names; a partial name or key still asks as a page shortcut', () => {
  assert.equal(judge({ type: 'type', text: 'Delete' }, BULK), 'delete/class:delete', "the live row: 'Delete' typed into the select")
  assert.equal(judge({ type: 'type', text: 'Del' }, BULK), 'permission/page:shortcut', 'a prefix the policy cannot resolve still asks')
  assert.equal(judge({ type: 'keypress', keys: ['D'] }, BULK), 'permission/page:shortcut')
})

test("CU-370: the driver's keyTarget (the option a key lands on, selectOption) is judged like a click on that option", () => {
  assert.equal(judge({ type: 'keypress', keys: ['ENTER'] }, { role: 'option', name: 'Delete', selectOption: true }), 'delete/class:delete', 'an ARIA listbox Enter on an active Delete')
  assert.equal(judge({ type: 'keypress', keys: ['ARROWDOWN'] }, { role: 'option', name: 'Buy now', selectOption: true }), 'purchase/class:purchase')
  assert.equal(judge({ type: 'keypress', keys: ['ENTER'] }, { ...BULK, optionUnread: true }), 'unknown_target/select:option_unread', 'an open popup whose highlight cannot be read asks')
})

test('CU-370: a type is judged by every option its prefix passes through (typeOptions), keeping the strongest class', () => {
  assert.equal(judge({ type: 'type', text: 'Del' }, BULK, { typeOptions: [{ role: 'option', name: 'Details' }, { role: 'option', name: 'Delete' }] }), 'delete/class:delete')
  assert.equal(judge({ type: 'type', text: 'Ar' }, BULK, { typeOptions: [{ role: 'option', name: 'Archive' }] }), 'permission/page:shortcut', 'a harmless option: the shortcut fallback still asks once')
})

test('CU-370 negatives and named over-ask: an editable combobox is text entry; a harmless option name asks once as a shortcut', () => {
  assert.equal(judge({ type: 'type', text: 'Delete' }, { role: 'combobox', name: 'Search', editable: true }), 'allow', 'an editable combobox takes text')
  assert.equal(judge({ type: 'type', text: 'Newest' }, { tag: 'select', role: 'combobox', name: 'Sort', editable: false }), 'permission/page:shortcut', "named over-ask: 'Newest' into a sort select")
  assert.equal(judge({ type: 'keypress', keys: ['ARROWDOWN'] }, { role: 'option', name: 'Archive', selectOption: true }), 'allow', 'a harmless option')
})

test('CU-370 in the loop: the driver typeOptions read reaches the policy - Del into Bulk actions asks delete, unattended declined', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { createScriptedAdapter } = await import('../../_tools_/agent-core/adapter-scripted.mjs')
  const { createRunControl } = await import('../../_tools_/agent-core/control.mjs')
  const { createFakeEnvironment } = await import('../../_tools_/agent-core/fake-env.mjs')
  const { runTask } = await import('../../_tools_/agent-core/loop.mjs')
  const { createSitePolicy } = await import('../../_tools_/agent-core/sites.mjs')
  const { readRun } = await import('../../_tools_/agent-core/trajectory.mjs')
  const tmp = mkdtempSync(join(tmpdir(), 'cu-370-'))
  try {
    const control = createRunControl()
    const environment = createFakeEnvironment({ kind: 'browser', control, url: 'https://shop.example/orders', focused: BULK })
    environment.typeOptions = async () => [{ role: 'option', name: 'Details' }, { role: 'option', name: 'Delete' }]
    const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'type', text: 'Del' }] }, { final: 'done' }] })
    const result = await runTask({ task: 'tidy the orders', environment, model, control, runsDirectory: join(tmp, 'runs'), build: { commit: 'test', dirty: false }, sitePolicy: createSitePolicy({ allowed: ['https://shop.example'] }) })
    const typed = readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action' && e.action?.type === 'type').at(-1)
    assert.equal(typed.class, 'delete')
    assert.equal(typed.status, 'declined')
  } finally { rmSync(tmp, { recursive: true, force: true }) }
})
