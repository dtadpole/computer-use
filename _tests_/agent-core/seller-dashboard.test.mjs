import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-516 (High; cu-coordinator 18:51Z), table PR 27: a seller dashboard's money and data controls ask. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, key = false) => {
  const url = 'https://seller.example/orders/1001'
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-516: purchase rows', () => {
  for (const name of ['Mark as paid', 'Mark order as paid', 'Void authorization', 'Void payment', 'Accept dispute', 'Accept chargeback', 'Apply 100% discount', 'Apply full discount', 'Waive fee', 'Waive late fees']) {
    assert.ok(classesOf(name).includes('purchase'), name)
    assert.ok(classesOf(name, true).includes('purchase'), `Space: ${name}`)
  }
})

test('CU-516: submit + purchase and permission rows', () => {
  for (const name of ['Ship to new address', 'Ship to a different address']) {
    const got = classesOf(name)
    assert.ok(got.includes('submit') && got.includes('purchase'), `${name}: ${got}`)
  }
  for (const name of ['Export customer list', 'Download customer emails', 'Export customers', 'Download buyer data']) {
    assert.ok(classesOf(name).includes('permission'), name)
    assert.ok(classesOf(name, true).includes('permission'), `Space: ${name}`)
  }
})

test('CU-516 negatives and older rows', () => {
  for (const name of ['Orders', 'Mark as shipped', 'Apply discount', 'Customers', 'Disputes', 'Shipping address']) assert.deepEqual(classesOf(name), [], name)
  assert.deepEqual(classesOf('Issue refund'), ['purchase'], 'older row unchanged')
  assert.deepEqual(classesOf('Change address'), ['credential'], 'older row unchanged')
})

test('#723 round 2 (cu-researcher 19:00Z): conceding a dispute is the same family', () => {
  for (const name of ['Concede dispute', 'Forfeit dispute', 'Give up dispute', 'Concede chargeback']) assert.ok(classesOf(name).includes('purchase'), name)
  for (const name of ['Dispute details', 'Respond to dispute', 'Disputes']) assert.deepEqual(classesOf(name), [], name)
})
