import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-494 residual (cu-coordinator 11:36Z): an unlabelled entry's raw name/id attribute (the chrome driver's target.fieldAttr)
// identifies a money or identity field, so typing an attacker IBAN into <input name="iban"> under a grant still asks credential.
const granted = createPolicy({ sitePolicy: () => 'allow', preApprovals: [{ class: 'credential' }, { class: 'sensitive_data' }] })
const type = (text, target) => granted.classify({ type: 'type', text }, { url: 'https://bank.example/settings', target: { role: 'textbox', editable: true, isPassword: false, ...target } })

test('CU-494 residual: an unlabelled money field asks credential under a credential + sensitive_data grant', () => {
  for (const fieldAttr of ['iban', 'wallet_address', 'routing-number', 'account_number', 'swift_code']) {
    const v = type('DE89370400440532013000', { name: '', fieldAttr })
    assert.equal(v.decision, 'confirm', fieldAttr)
    assert.ok([v.class, ...(v.classes ?? [])].includes('credential'), fieldAttr)
  }
})

test('CU-494 residual: a caller secret typed into an unlabelled money field is not carried by the credential grant', () => {
  const v = type('{{secret:bank_iban}}', { name: '', fieldAttr: 'iban' })
  assert.equal(v.decision, 'confirm')
})

test('CU-494 residual: other unlabelled fields and a labelled name are unchanged', () => {
  assert.equal(type('hello', { name: '', fieldAttr: 'nickname' }).decision, 'allow')
  assert.equal(type('{{secret:pw}}', { name: '', fieldAttr: 'password', isPassword: true }).decision, 'allow', 'a caller secret into a secret field rides the grant')
  assert.equal(type('DE89', { name: 'Nickname', fieldAttr: 'iban' }).decision, 'allow', 'a name wins over the raw attribute')
})

test('CU-494 residual r2: bank_account, a bare wallet, forward_to and a card autocomplete token ask under the grant', () => {
  for (const fieldAttr of ['bank_account', 'wallet', 'forward_to']) {
    const v = type('0x' + '5290'.repeat(10), { name: '', fieldAttr })
    assert.equal(v.decision, 'confirm', fieldAttr)
  }
  assert.equal(type('{{secret:card}}', { name: '', autocomplete: 'cc-number' }).decision, 'confirm', 'cc-number')
  assert.equal(type('120.00', { name: '', autocomplete: 'transaction-amount' }).decision, 'confirm', 'transaction-amount')
  assert.equal(type('Mira', { name: 'Forward to' }).decision, 'confirm', "a named 'Forward to' field")
  assert.equal(type('Mira', { name: 'Wallet' }).decision, 'allow', "a bare 'Wallet' name stays as it was - the attribute-only word")
})

test('#671 r3: a camelCase fieldAttr is split, and payout_account asks', () => {
  for (const fieldAttr of ['BankAccountNumber', 'bank_account_number', 'payout_account', 'IBANNumber']) {
    assert.equal(type('021000021', { name: '', fieldAttr }).decision, 'confirm', fieldAttr)
  }
  for (const fieldAttr of ['accountName', 'displayName', 'wallpaper']) {
    assert.equal(type('Mira', { name: '', fieldAttr }).decision, 'allow', fieldAttr)
  }
})

test('CU-494 follow-up: an unnamed entry with a money placeholder or layout label asks; cc_number without autocomplete asks', () => {
  assert.equal(type('DE89370400440532013000', { name: '', placeholder: 'IBAN' }).decision, 'confirm', 'placeholder')
  assert.equal(type('021000021', { name: '', nearbyLabel: 'Routing number' }).decision, 'confirm', 'nearbyLabel')
  assert.equal(type('4000', { name: '', fieldAttr: 'cc_number' }).decision, 'confirm', 'cc_number')
  assert.equal(type('4000', { name: '', fieldAttr: 'ccNumber' }).decision, 'confirm', 'ccNumber')
  assert.equal(type('Mira', { name: '', placeholder: 'Search' }).decision, 'allow', 'an ordinary placeholder')
  assert.equal(type('Mira', { name: 'Nickname', placeholder: 'IBAN' }).decision, 'allow', 'the name wins')
})
