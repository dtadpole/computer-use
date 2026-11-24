import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy, modalStatementNames } from '../../_tools_/agent-core/policy.mjs'

// CU-756 (High; cu-researcher's #1423 r2 miss): a generic confirm under a transfer / handover / grant noun title acted unasked,
// as CU-746's 'Account deletion' did for delete.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://code.example/org/repo/settings'
const press = (name, dialogName, dialogDescription) => {
  const target = { role: 'button', tag: 'button', name, ...(dialogName !== undefined ? { dialogName } : {}), ...(dialogDescription !== undefined ? { dialogDescription } : {}) }
  const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class]).slice().sort()
}

test('CU-756: the filed row and the class ask permission', () => {
  assert.deepEqual(press('Confirm', 'Ownership handover', 'The new owner gets full control.'), ['permission'], "cu-researcher's filed row")
  assert.ok(press('OK', 'Admin transfer', 'Sam becomes the only admin.').includes('permission'), 'an admin transfer')
  assert.ok(press('Continue', 'Access grant', 'The app can read your files.').includes('permission'), 'an access grant')
  assert.ok(press('Confirm', 'Handover of the workspace', 'Sam takes over today.').includes('permission'), "'<noun> of <x>'")
})

test('CU-756: what the reading produces', () => {
  assert.ok(modalStatementNames('Ownership handover').includes('Transfer ownership'))
  assert.ok(modalStatementNames('Team handoff').includes('Transfer ownership'))
  assert.ok(modalStatementNames('Access grant').includes('Grant Access'))
  assert.ok(!modalStatementNames('Funds transfer').includes('Transfer ownership'), 'money is no control object')
  assert.ok(modalStatementNames('When this is done, the workspace is transferred to Sam.').includes('Transfer ownership'), 'a statement over a control object (cu-developer-one, CU-759)')
  assert.ok(!modalStatementNames('Once confirmed, your balance is transferred to savings.').includes('Transfer ownership'), 'money in a statement')
})

test('CU-756 near collisions stay free', () => {
  assert.deepEqual(press('OK', 'Ownership details', 'You own 3 projects.'), [], "cu-researcher's free row")
  assert.deepEqual(press('OK', 'Transfer history', 'Nothing here yet.'), [], "cu-researcher's free row")
  assert.deepEqual(modalStatementNames('Grant history'), [], 'no noun title')
})
