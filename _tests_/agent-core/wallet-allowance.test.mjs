import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-530 (High; cu-coordinator 23:21Z), table PR 35: a wallet allowance or permit asks purchase. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, key = false) => {
  const url = 'https://wallet.example/approve'
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-530: allowances and permits ask purchase', () => {
  for (const name of ['Set unlimited allowance', 'Set allowance', 'Set max allowance', 'Sign typed data', 'Sign permit', 'Sign Permit2', 'Sign permit message']) {
    assert.ok(classesOf(name).includes('purchase'), name)
    assert.ok(classesOf(name, true).includes('purchase'), `Space: ${name}`)
  }
})

test('CU-530 negatives and older rows', () => {
  for (const name of ['View allowances', 'Allowances', 'Permit details', 'Typed data']) assert.deepEqual(classesOf(name), [], name)
  assert.ok(classesOf('Approve unlimited').includes('purchase'), 'older row unchanged')
  assert.ok(classesOf('Increase allowance').includes('purchase'), 'older row unchanged')
})

test('#761 round 2 (cu-researcher 23:27Z): a purpose tail', () => {
  for (const name of ['Sign permit to deposit', 'Sign Permit2 for swap', 'Sign typed data for swap']) assert.ok(classesOf(name).includes('purchase'), name)
})
