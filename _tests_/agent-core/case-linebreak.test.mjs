import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-566 (cu-researcher 02:04Z): ALL-CAPS, lower-case acronyms and a line break inside a label never free an asking row.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name) => {
  const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://example.com/settings', target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : [...(v.classes ?? [v.class])].sort()
}

test('CU-566: case and line-break transforms keep the row asking with its classes', () => {
  for (const base of ['Turn off login approvals', 'Update ACH info', 'Open RDP port', 'Change IBAN', 'Disable TOTP', 'Cancel all orders', 'Review and confirm withdrawal', 'I understand and want to install anyway']) {
    const want = classesOf(base)
    assert.notDeepEqual(want, [], `base asks: ${base}`)
    const i = base.indexOf(' ', Math.floor(base.length / 2))
    for (const form of [base.toUpperCase(), base.toLowerCase(), i < 0 ? base : `${base.slice(0, i)}\n${base.slice(i + 1)}`]) for (const cls of want) assert.ok(classesOf(form).includes(cls), `${JSON.stringify(form)}: ${cls}`)
  }
  for (const name of ['OPEN RDP GUIDE', 'SETTINGS', 'Account\nOverview']) assert.deepEqual(classesOf(name), [], JSON.stringify(name))
})

test("#846 round 2 (cu-researcher 02:42Z): the AAAA record in any case", () => {
  for (const name of ['ADD AAAA RECORD', 'add aaaa record', 'Add AAAA record', 'ADD MX RECORD', 'CREATE A RECORD']) assert.ok(classesOf(name).includes('permission'), name)
  assert.deepEqual(classesOf('add a record'), [], "a lower-case 'a record' is the generic phrase")
})

test('#846 round 3 (cu-researcher 08:17Z): lower / upper case with a tail reads like the written form', () => {
  const written = classesOf('Change direct deposit to Acme Bank')
  assert.notDeepEqual(written, [], 'the written form asks')
  for (const name of ['change direct deposit to Acme Bank', 'change direct deposit to acme bank', 'CHANGE DIRECT DEPOSIT TO ACME BANK']) for (const cls of written) assert.ok(classesOf(name).includes(cls), `${name} keeps ${cls}`)
})
