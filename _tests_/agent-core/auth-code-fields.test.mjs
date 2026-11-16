import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-580 (cu-researcher 09:26Z): typing into a sign-in / recovery code box asks, like 'Backup code'; ordinary code boxes stay free.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const typed = (name, url = 'https://account.example/verify') => {
  const v = policy.classify({ type: 'type', text: '123456' }, { url, target: { role: 'textbox', name, editable: true } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-580: recovery / login / sign-in / verification code boxes ask', () => {
  for (const name of ['Recovery code', 'Login code', 'Sign-in code', 'Verification code', 'Security code from your app', 'Enter your access token', 'Pairing code', 'Unlock PIN', 'Email code', 'Backup code']) {
    for (const url of ['https://account.example/verify', 'https://bank.example/login']) assert.notDeepEqual(typed(name, url), [], `${name} @ ${url}`)
  }
})

test('CU-580 negatives: ordinary code boxes stay free', () => {
  for (const name of ['Zip code', 'Promo code', 'Discount code', 'Country code', 'Search code', 'Coupon code']) assert.deepEqual(typed(name), [], name)
})
