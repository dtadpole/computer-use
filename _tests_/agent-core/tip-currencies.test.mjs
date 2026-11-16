import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-567 (cu-researcher 02:45Z): 'Tip <amount>' / 'Contribute <amount>' ask purchase in every currency and in a platform's coins, Bits
// or Stars - not only $ / EUR / GBP / JPY / INR / USD.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, role = 'button') => {
  const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://stream.example/live', target: { role, name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-567: tips and contributions in any currency or platform coin ask purchase', () => {
  for (const name of ['Tip 10 kr', 'Tip \u20a95,000', 'Tip 20 z\u0142', 'Tip \u20ba50', 'Tip \u20bd100', 'Tip 500 Ft', 'Tip \u20b1100', 'Tip \u0e3f100', 'Tip RM 10', 'Tip 100 CZK', 'Tip MXN 50', 'Tip \u20bf0.001',
    'Contribute 10 kr', 'Contribute \u20a910,000', 'Cheer 100 Bits', 'Send 50 Stars', 'Tip 100 coins', 'Give 5 gems']) assert.ok(classesOf(name).includes('purchase'), name)
  for (const name of ['Tip', 'Tips', 'Try 3 days', 'Add 10 ft', '100 Bits', 'PHP 8 docs']) assert.deepEqual(classesOf(name), [], name)
  assert.ok(!classesOf('Rate 5 stars').includes('purchase'), 'a rating is not a purchase (its older class is unchanged)')
})

test("#847 round 2 (cu-researcher 03:08Z): 'Give 5 stars' is a rating, not a purchase", () => {
  for (const name of ['Give 5 stars', 'Give 4 stars']) assert.deepEqual(classesOf(name), [], name)
  // 'Give 10 points' asks purchase on main already (an older row) and keeps it.
  for (const name of ['Send 50 Stars', 'Tip 100 Stars', 'Cheer 100 Bits', 'Give 5 gems']) assert.ok(classesOf(name).includes('purchase'), name)
})

test('#847 round 3 (cu-researcher 10:20Z class sweep): more stars than a rating, currency tickers', () => {
  for (const name of ['Give 50 stars', 'Tip 3 USDC', 'Send 0.5 ETH', 'Tip 20 USDT']) assert.ok(classesOf(name).includes('purchase'), name)
  for (const name of ['Give 5 stars', 'Send 3 PDF', 'Give 4 stars']) assert.ok(!classesOf(name).includes('purchase'), name)
})
