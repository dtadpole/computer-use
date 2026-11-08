import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-185: a national phone number typed into a neutral field asks; look-alikes - dates, versions, times, prices,
// postcodes, a PIN, an ISBN, short codes, an unbroken run (named: not covered) - do not, so widening the rule cannot
// quietly start over-asking.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const notes = { role: 'textbox', name: 'Notes', editable: true }
const typed = (text) => policy.classify({ type: 'type', text }, { url: 'http://127.0.0.1:43117/', target: notes })

// Parenthesised trunk codes as forms print them; '01-2345-6789' is a grouped reference that asks - an accepted over-ask.
for (const text of ['020 7946 0958', '07700 900123', '01 23 45 67 89', '030 1234567', 'call me on 020 7946 0958 today', '(020) 7946 0958', '(030) 1234567', '01-2345-6789',
  '01 12 2345 678']) {
  test(`CU-185: '${text}' typed into Notes asks sensitive_data`, () => {
    const v = typed(text); assert.equal(v.decision, 'confirm'); assert.equal(v.class, 'sensitive_data')
  })
}
for (const text of ['2026-11-07', '07/11/2026', '0.2.47', '09:30', '0,99 EUR', 'SW1A 0AA', '10115 Berlin', 'order 4711', '2 x 0.5 l', 'v0.10.3', '1970-01-01 00:00', 'PIN 0000', '03 2026', '0123', '012 345', 'ISBN 0-306-40615-2', '07700900123', '(0) 12', '07.11.2026 10:30',
  '01-02-2026 09:15', 'Meeting 07.11.2026 14 Uhr']) {
  test(`CU-185: '${text}' typed into Notes stays allowed (not a phone)`, () => {
    assert.equal(typed(text).decision, 'allow')
  })
}
