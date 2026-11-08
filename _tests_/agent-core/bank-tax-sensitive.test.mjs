import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy, looksSensitive } from '../../_tools_/agent-core/policy.mjs'
import { createSitePolicy } from '../../_tools_/agent-core/sites.mjs'
import { IBAN_DE, IBAN_DE_COMPACT, IBAN_GB, IBAN_GB_BAD_CHECK, IBAN_GB_SHORT, SSN_NINES, j } from '../fixture-shapes/shapes.mjs'

// CU-163 (cu-researcher, S9 live): an IBAN and a tax id were typed with no class. A bank account or tax id now asks
// sensitive_data - by value (an IBAN whose mod-97 check holds; an EIN, NN-NNNNNNN) or by the field it is typed into.

const START = 'https://vendor.example/onboarding'
const policy = createPolicy({ sitePolicy: createSitePolicy({ startUrl: START }) })
const typeInto = (name, text, task = 'fill the vendor form') =>
  policy.classify({ type: 'type', text }, { url: START, task, target: { tag: 'input', role: 'textbox', name, origin: 'https://vendor.example', fingerprint: 'f' } })

test('an IBAN whose mod-97 check holds is sensitive data, spaced or not, in any field; a failed check is not', () => {
  for (const iban of [IBAN_GB, IBAN_DE_COMPACT, IBAN_GB.replaceAll(' ', '').toLowerCase()]) {
    assert.equal(looksSensitive(iban), 'iban', iban)
    assert.deepEqual([typeInto('Notes', iban).decision, typeInto('Notes', iban).class], ['confirm', 'sensitive_data'], iban)
  }
  assert.equal(looksSensitive(IBAN_GB_BAD_CHECK), null, 'a failed check is not an IBAN')
  assert.equal(looksSensitive(`IBAN ${IBAN_GB} thanks`), 'iban', 'an IBAN followed by a word (the greedy match runs on)')
  assert.equal(looksSensitive(`send to ${IBAN_DE} today`), 'iban')
  assert.equal(typeInto('Notes', IBAN_GB_BAD_CHECK).decision, 'allow')
})

test('a random token is not an IBAN: an unregistered country, a wrong length, a temp folder name, a hash', () => {
  // The temp folder under /var/folders matched a first version that tried every prefix length (the gate caught it).
  for (const token of ['pp55rtv12zx1lph4hqj2d2s00000gn', '/private/var/folders/nn/pp55rtv12zx1lph4hqj2d2s00000gn/T/x/Reports',
    'ab12cd34ef56ab78cd90ef12ab34cd56', IBAN_GB_SHORT, j('XX82', 'WEST12345698765432')]) {
    assert.equal(looksSensitive(token), null, token)
  }
})

test('a US routing number (ABA check) beside an account number is sensitive data; either alone, or a failed check, is not', () => {
  for (const pair of ['021000021 / 123456789012', 'routing 021000021 account 4455667788', '021000021-000123456']) {
    assert.equal(looksSensitive(pair), 'bank_account', pair)
    assert.equal(typeInto('Notes', pair).class, 'sensitive_data', pair)
  }
  // 123456789 fails the ABA check; a lone routing number or a lone long number is not a pair.
  for (const other of ['123456789 / 123456789012', '021000021', 'order 4455667788', '999999999 / 9999999999']) {
    assert.equal(looksSensitive(other), null, other)
  }
})

test('an EIN (NN-NNNNNNN) is sensitive data; an SSN still is; longer dashed numbers are not EINs', () => {
  assert.equal(looksSensitive('Tax ID 12-3456789'), 'tax_id')
  assert.equal(typeInto('Notes', '12-3456789').class, 'sensitive_data')
  assert.equal(looksSensitive(SSN_NINES), 'national_id')
  for (const other of ['123-3456789', '12-34567890', '2026-11-07']) assert.equal(looksSensitive(other), null, other)
})

test('a field for a bank account or a tax id asks whatever is typed into it', () => {
  for (const name of ['IBAN', 'Account number', 'Bank account no.', 'Routing number', 'Sort code', 'Tax ID', 'EIN']) {
    const v = typeInto(name, 'abc 123')
    assert.deepEqual([v.decision, v.class], ['confirm', 'sensitive_data'], name)
  }
})

test('negatives: an order number, an account name and a plain code stay allowed', () => {
  assert.equal(typeInto('Order', '1234567890123456780').decision, 'allow', 'a 19-digit order number in a field named Order')
  assert.equal(typeInto('Account name', 'Acme Ltd').decision, 'allow', 'an account NAME is not an account number')
  assert.equal(typeInto('Reference', 'INV-2026-0042').decision, 'allow')
})

test('a value the task itself gave is not asked again (as for every sensitive_data pattern)', () => {
  assert.equal(typeInto('Notes', IBAN_GB, `pay ${IBAN_GB}`).decision, 'allow')
})
