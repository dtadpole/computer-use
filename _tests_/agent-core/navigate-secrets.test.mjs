import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy, urlSecret } from '../../_tools_/agent-core/policy.mjs'
import { AWS_KEY_ID, CARD_DIGITS, GITHUB_TOKEN, SSN, j } from '../fixture-shapes/shapes.mjs'

// CU-260 (cu-researcher): a secret in a navigate URL leaves with the request. Values from fragments (public hygiene).
const ALLOWED = 'https://shop.example'
const policy = createPolicy({ sitePolicy: (url) => (String(url).startsWith(ALLOWED) ? 'allow' : { block: 'not_allowed' }) })
const go = (url) => policy.classify({ type: 'navigate', url }, { url: `${ALLOWED}/start` })
const verdict = (v) => [v.decision, v.class ?? null, v.rule]
const HASH = '0123456789abcdef0123456789abcdef01234567'

test('CU-260: a value in the query, the fragment or a path segment asks sensitive_data on an allowed site', () => {
  for (const url of [
    `${ALLOWED}/search?q=${AWS_KEY_ID}`,
    `${ALLOWED}/pay?card=${CARD_DIGITS}`,
    `${ALLOWED}/form?ssn=${encodeURIComponent(SSN)}`,
    `${ALLOWED}/cb#access_token=${GITHUB_TOKEN}`,
    `${ALLOWED}/u/${encodeURIComponent(j('someone', '@', 'mail.example'))}`,
    `${ALLOWED}/reset?token=${j('Zx81', 'qPl0', 'rT55')}`,
    `${ALLOWED}/api?api_key=${j('abcd', '1234', 'efgh')}`,
    j('https://user:', 'hunter2', '@shop.example/'),
    // cu-verifier on #91: a password or secret parameter asks whatever its length.
    `${ALLOWED}/login?user=me&password=${j('hun', 'ter2')}`,
    `${ALLOWED}/login?passwd=${j('ab', 'c1')}`,
    `${ALLOWED}/oauth?client_secret=${j('s3', 'cr')}`,
    `${ALLOWED}/x?api_secret=${j('hun', 'ter2')}`,
    `${ALLOWED}/x?passcode=${j('12', '34')}`,
    `${ALLOWED}/x?pin=${j('98', '76')}`,
  ]) {
    assert.deepEqual(verdict(go(url)), ['confirm', 'sensitive_data', 'url:sensitive_data'], url)
  }
})

test('CU-260: on a new site the ask names both classes, sensitive_data first', () => {
  const v = go(`https://other.example/collect?k=${AWS_KEY_ID}`)
  assert.deepEqual([v.decision, v.class, v.classes], ['confirm', 'sensitive_data', ['sensitive_data', 'new_site']])
  assert.deepEqual(verdict(go('https://other.example/page')), ['confirm', 'new_site', 'site:not_allowed'], 'no secret: the new-site ask as before')
})

test('CU-260 negatives: plain URLs, numeric ids in the path and short token values stay free; a commit hash is the named over-ask', () => {
  for (const url of [`${ALLOWED}/item/4111111111111111`, `${ALLOWED}/status/1234567890123456789`, `${ALLOWED}/search?q=shoes&page=2`, `${ALLOWED}/reset?token=abc`, `${ALLOWED}/#section-2`]) {
    assert.deepEqual(verdict(go(url)), ['allow', null, 'site:allowed'], url)
  }
  assert.equal(urlSecret(`https://code.example/repo/commit/${HASH}`), 'key', 'named over-ask, kept (cu-coordinator)')
})

test('CU-281: a query or fragment parameter named for a D-061 field asks sensitive_data whatever its value looks like', () => {
  for (const url of [`${ALLOWED}/apply?passport=${j('X12', '34567')}`, `${ALLOWED}/f?ssn=${j('12', '3')}`, `${ALLOWED}/f?date_of_birth=1990-01-01`,
    `${ALLOWED}/f?dateOfBirth=1990`, `${ALLOWED}/f?dob=1`, `${ALLOWED}/pay?card_number=${j('41', '11')}`, `${ALLOWED}/bank?iban=${j('GB', '29')}`,
    `${ALLOWED}/tax#tax_id=99`, `${ALLOWED}/f?national_insurance=${j('QQ', '12')}`]) {
    assert.deepEqual(verdict(go(url)), ['confirm', 'sensitive_data', 'url:sensitive_data'], url)
  }
})

test('CU-281 negatives: an empty value, the word in a value, contact names and cache-style expiry stay as before', () => {
  for (const url of [`${ALLOWED}/f?passport=`, `${ALLOWED}/search?q=passport`, `${ALLOWED}/f?mobile=on`, `${ALLOWED}/cdn?expiry=3600`, `${ALLOWED}/list?page=2`]) {
    assert.deepEqual(verdict(go(url)), ['allow', null, 'site:allowed'], url)
  }
})
