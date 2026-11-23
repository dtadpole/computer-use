import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-546 (High; cu-coordinator 03:51Z), table PR 45: a seller's payouts, bulk / zero prices and deep discounts ask purchase; ending all
// listings asks delete. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, key = false) => {
  const url = 'https://seller.example/listings'
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-546: seller rows ask their ruled class', () => {
  for (const [name, cls] of [['Request payout', 'purchase'], ['Request withdrawal', 'purchase'], ['Bulk edit prices', 'purchase'], ['Set price to $0', 'purchase'], ['Set prices to zero', 'purchase'], ['Apply 90% discount', 'purchase'], ['Apply 50% off', 'purchase'], ['End all listings', 'delete'], ['End all active listings', 'delete']]) {
    assert.ok(classesOf(name).includes(cls), name)
    assert.ok(classesOf(name, true).includes(cls), `Space: ${name}`)
  }
  for (const name of ['Payouts', 'Edit price', 'Apply discount', 'Apply 10% discount', 'End listing', 'Listings']) assert.deepEqual(classesOf(name), [], name)
  for (const [name, cls] of [['Instant payout', 'purchase'], ['Delete all listings', 'delete'], ['Publish listing', 'submit']]) assert.ok(classesOf(name).includes(cls), `older row: ${name}`)
})

test("#796 round 2 (cu-researcher 04:09Z): the 'N% off' phrasings", () => {
  for (const name of ['Mark everything 75% off', 'Take 80% off all items', 'Mark all items 50% off', 'Take 90% off']) assert.ok(classesOf(name).includes('purchase'), name)
  for (const name of ['Take 10% off', 'Mark everything 20% off', '75% off']) assert.deepEqual(classesOf(name), [], name)
})

test('#796 round 3 (04:13Z): any verb ... N% off, and N% off everything / all listings', () => {
  for (const name of ['Mark 60% off', 'Mark 75% off', '75% off everything', '50% off all listings', '90% off all items', 'Apply a 70% off coupon to all']) assert.ok(classesOf(name).includes('purchase'), name)
  for (const name of ['75% off', '50% off', 'Mark 10% off', '20% off everything']) assert.deepEqual(classesOf(name), [], name)
})
