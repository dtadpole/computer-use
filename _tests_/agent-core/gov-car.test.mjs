import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-498 / CU-499 (High; cu-coordinator 12:21Z): government / tax rows and car / smart-lock rows. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const at = (name, url, key = false) => {
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? 'allow' : v.class
}
const TAX = 'https://tax.example.gov/return/2025'
const CAR = 'https://app.example/vehicle/controls'

test('CU-498: on a government or tax URL the return / income / benefits / voter rows ask submit; direct debit asks purchase anywhere', () => {
  for (const url of [TAX, 'https://www.example.gov.uk/benefits', 'https://portal.example/taxes/2025']) for (const name of ['Amend return', 'Report income', 'Certify for benefits', 'Change voter registration']) {
    assert.equal(at(name, url), 'submit', `${name} on ${url}`)
    assert.equal(at(name, url, true), 'submit', `Space: ${name}`)
  }
  for (const name of ['Set up direct debit', 'Authorize direct debit']) assert.ok(['purchase', 'permission'].includes(at(name, 'https://shop.example/account')), name)
  assert.equal(at('Set up direct debit', 'https://shop.example/account'), 'purchase')
})

test('CU-499: on a car or lock URL a bare Unlock asks physical; adding a driver or sharing a key asks permission', () => {
  for (const url of [CAR, 'https://lock.example/locks/front', 'https://home.example/garage']) {
    assert.equal(at('Unlock', url), 'physical', url)
    assert.equal(at('Unlock', url, true), 'physical', `Space on ${url}`)
  }
  for (const name of ['Add driver', 'Share key', 'Invite driver']) assert.equal(at(name, CAR), 'permission', name)
  for (const name of ['Open trunk', 'Start engine', 'Remote start']) assert.equal(at(name, CAR), 'physical', name)
})

test('CU-498 / CU-499 negatives: off their URLs the bare rows stay free; views and Lock stay free', () => {
  for (const name of ['Amend return', 'Report income', 'Unlock', 'Add driver']) assert.equal(at(name, 'https://shop.example/x'), 'allow', name)
  for (const name of ['View return', 'Lock', 'Vehicle status']) assert.equal(at(name, name === 'View return' ? TAX : CAR), 'allow', name)
  assert.equal(at('Unlock', 'https://app.example/unlocks'), 'allow', 'not a whole segment')
})

test('#677 round 2 (cu-researcher 12:42Z): the ruled acts as families', () => {
  for (const name of ['Certify my eligibility', 'Certify weekly claim', 'Report hours worked', 'Update voter registration', 'Update your voter registration']) assert.equal(at(name, TAX), 'submit', name)
  for (const name of ['Set up automatic withdrawal', 'Create a debit mandate']) assert.equal(at(name, 'https://shop.example/account'), 'purchase', name)
  const authorise = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://shop.example/account', target: { role: 'button', name: 'Authorise recurring withdrawals' } })
  assert.ok((authorise.classes ?? [authorise.class]).includes('purchase'), 'purchase joins the older authorise permission')
  for (const name of ['Add secondary driver', 'Add a guest driver']) assert.equal(at(name, CAR), 'permission', name)
  assert.equal(at('Report hours worked', 'https://shop.example/x'), 'allow', 'off a gov/tax URL')
})

test('#677 round 3 (cu-developer-three 12:47Z): allow / enable / turn on the automatic withdrawals', () => {
  for (const name of ['Allow automatic withdrawals', 'Enable automatic withdrawals', 'Turn on automatic withdrawals']) {
    const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://bank.example/account', target: { role: 'button', name } })
    assert.ok((v.classes ?? [v.class]).includes('purchase'), name)
  }
})
