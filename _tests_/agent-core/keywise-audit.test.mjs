import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'
import { AWS_KEY_ID, CARD, GITHUB_TOKEN, IBAN_DE, IBAN_GB, SEED_TWELVE, SK_KEY, SSN, j } from '../fixture-shapes/shapes.mjs'

// CU-339 (cu-coordinator 12:51Z): every D-061 value class typed key by key and in 2- and 3-character chunks into one plain
// field asks sensitive_data at the action that completes it - the field's typed buffer (CU-267) judges the whole value,
// so no class depends on arriving in one action. A class that only asks when typed whole is an under-ask (CU-336's
// shape) and is filed as its own issue.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const FIELD = { tag: 'input', inputType: 'text', role: 'textbox', name: 'Reference', editable: true }
const PAGE = 'https://forms.example/apply'

const CLASSES = [
  ['card', CARD],
  ['iban (GB)', IBAN_GB],
  ['iban (DE)', IBAN_DE],
  ['bank account (routing + account)', j('0110', '00015 ', '12345678')],
  ['national id (SSN, dashed)', SSN],
  ['national id (UK NI number)', j('AB', '123456', 'C')],
  ['national id (PAN)', j('ABCPE', '1234', 'F')],
  ['tax id (EIN)', j('12-', '3456789')],
  ['email', j('pat', '@', 'mail.example')],
  ['phone (international)', j('+1 415 ', '555 0100')],
  ['key (secret key)', SK_KEY],
  ['key (GitHub token)', GITHUB_TOKEN],
  ['key (AWS key id)', AWS_KEY_ID],
  ['recovery phrase', SEED_TWELVE],
]

// Feed `value` in pieces of `size` characters; return the index of the first piece that asks, or -1.
function firstAsk(value, size, kind) {
  let before = ''
  for (let i = 0, n = 0; i < value.length; i += size, n++) {
    const next = value.slice(i, i + size)
    const action = kind === 'keypress' && next.length === 1 && /[A-Za-z0-9]/.test(next) ? { type: 'keypress', keys: [next.toUpperCase()] } : { type: 'type', text: next }
    const r = policy.classify(action, { url: PAGE, target: FIELD, typed: { before, next } })
    if (r.decision !== 'allow') return { piece: n, at: i + next.length, class: r.class }
    before += next
  }
  return null
}

for (const [label, value] of CLASSES) {
  test(`CU-339 keywise: ${label} asks when typed whole`, () => {
    const r = policy.classify({ type: 'type', text: value }, { url: PAGE, target: FIELD, typed: { before: '', next: value } })
    assert.equal(r.decision === 'allow' ? 'allow' : r.class, 'sensitive_data')
  })
  for (const [size, kind] of [[1, 'type'], [1, 'keypress'], [2, 'type'], [3, 'type']]) {
    test(`CU-339 keywise: ${label} asks when fed ${size} at a time (${kind})`, () => {
      const hit = firstAsk(value, size, kind)
      assert.ok(hit, `never asked: ${label} in pieces of ${size}`)
      assert.equal(hit.class, 'sensitive_data')
    })
  }
}

// The audit's one miss, CU-340 (PR #294): a value the page splits across consecutive unnamed fields. The loop passes the
// other boxes typed just before (typedSplit), and the box that completes the value asks.
const UNNAMED = { tag: 'input', inputType: 'text', role: 'textbox', name: null, editable: true }
const splitVerdicts = (parts) => parts.map((part, i) => {
  const r = policy.classify({ type: 'type', text: part }, { url: PAGE, target: UNNAMED, typedSplit: { parts: parts.slice(0, i), before: '', next: part } })
  return r.decision === 'allow' ? 'allow' : r.class
})
test('CU-340: an SSN typed 3/2/4 into three unnamed fields asks at the third', () => {
  assert.deepEqual(splitVerdicts(SSN.split('-')), ['allow', 'allow', 'sensitive_data'])
})
test('CU-340: a card typed 4x4 into four unnamed fields asks at the fourth', () => {
  const digits = CARD.replace(/\D/g, '')
  assert.deepEqual(splitVerdicts([digits.slice(0, 4), digits.slice(4, 8), digits.slice(8, 12), digits.slice(12)]), ['allow', 'allow', 'allow', 'sensitive_data'])
})
