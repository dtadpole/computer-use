import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-524 (High; cu-coordinator 21:06Z), table PR 31: a new recovery channel asks credential. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, url, key = false) => {
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}
const SEC = 'https://account.example/security/signin'
const SHOP = 'https://shop.example/checkout/shipping'

test('CU-524: recovery channels ask credential anywhere', () => {
  for (const name of ['Add a trusted phone number', 'Add alternate email', 'Add recovery email', 'Add backup phone', 'Set up account recovery', 'Set up recovery options', 'Add backup method', 'Add a sign-in method']) {
    for (const url of [SEC, SHOP]) assert.ok(classesOf(name, url).includes('credential'), `${url}: ${name}`)
    assert.ok(classesOf(name, SEC, true).includes('credential'), `Space: ${name}`)
  }
})

test("CU-524: a bare 'Add phone number' asks on an account-security page only", () => {
  for (const url of [SEC, 'https://myaccount.example/personal-info', 'https://example.com/settings/two-factor']) assert.ok(classesOf('Add phone number', url).includes('credential'), url)
  assert.deepEqual(classesOf('Add phone number', SHOP), [], 'a checkout form stays free')
  for (const name of ['Review recovery options', 'Recovery', 'Phone numbers']) assert.deepEqual(classesOf(name, SEC), [], name)
  assert.ok(classesOf('Change trusted phone number', SEC).includes('credential'), 'older row unchanged')
})

test("#741 round 2 (cu-researcher 21:10Z): '... for verification' and '(another) email (address)' on an account-security page", () => {
  for (const name of ['Add phone number for verification', 'Add another email address', 'Add email address', 'Add an email']) {
    assert.ok(classesOf(name, SEC).includes('credential'), name)
    assert.deepEqual(classesOf(name, SHOP), [], `free off a security page: ${name}`)
  }
  assert.ok(classesOf('Add phone for 2-step verification', SEC).includes('credential'))
  assert.ok(classesOf('Add phone for 2-step verification', SHOP).includes('credential'), 'the older 2-step row asks anywhere')
})
