import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-565 (cu-researcher 01:47Z): a trailing check mark, bullet or metadata segment ('· 2 min', '- Free', '— Pro', '· Recommended')
// never frees an asking row. Click and Space.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, key = false) => {
  const url = 'https://example.com/account'
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-565: check-mark, bullet and metadata tails keep the row asking', () => {
  for (const base of ['Request withdrawal', 'Delete account', 'Turn off two-factor authentication', 'Open RDP']) {
    const want = classesOf(base)
    assert.notDeepEqual(want, [], `base asks: ${base}`)
    for (const tail of [' \u2713', ' \u2022', ' \u00b7 2 min', ' \u2022 5 mins ago', ' \u2014 Pro', ' - Free', ' \u00b7 Recommended', ' | Premium']) {
      assert.deepEqual(classesOf(`${base}${tail}`), want, `${base}${tail}`)
      assert.deepEqual(classesOf(`${base}${tail}`, true), want, `Space: ${base}${tail}`)
    }
  }
  for (const name of ['Free', 'Pro \u2713', 'Read more \u00b7 2 min', 'Plans - Free']) assert.deepEqual(classesOf(name), [], name)
})

test('CU-565 widened (cu-researcher 01:57Z): leading list numbers, bracketed badges and plan tags keep the row asking', () => {
  for (const base of ['Change IBAN', 'Turn off 2SV', 'Enable RDP', 'Delete account', 'Install now']) {
    const want = classesOf(base)
    assert.notDeepEqual(want, [], `base asks: ${base}`)
    for (const head of ['1. ', '2) ', '[Beta] ', '(New) ', 'Pro \u00b7 ', 'New: ', 'Premium - ']) assert.deepEqual(classesOf(`${head}${base}`), want, `${head}${base}`)
  }
  for (const name of ['1. Overview', '[Beta] Settings', 'Pro \u00b7 Plans', 'New: Inbox']) assert.deepEqual(classesOf(name), [], name)
})

test("#843 round 2 (cu-researcher 02:01Z): ' ✓ Done' and a price after a bar keep the row asking", () => {
  for (const base of ['Request withdrawal', 'Delete account', 'Open RDP', 'Keep anyway']) {
    const want = classesOf(base)
    for (const tail of [' \u2713 Done', ' \u2714 Saved']) assert.deepEqual(classesOf(`${base}${tail}`), want, `${base}${tail}`)
    // A shown price may add purchase (the amount rule) - the row's own classes stay.
    for (const tail of [' | $9.99', ' \u00b7 \u20ac5/mo']) for (const cls of want) assert.ok(classesOf(`${base}${tail}`).includes(cls), `${base}${tail}: ${cls}`)
  }
})

test('#843 round 3 (cu-researcher 02:23Z): any separator glyph and any 1-4 word tag, either side, or a bracketed tag', () => {
  for (const base of ['Change IBAN', 'Delete account', 'Open RDP', 'Review and confirm withdrawal']) {
    const want = classesOf(base)
    for (const form of [`Gold \u00b7 ${base}`, `Team \u2022 ${base}`, `(Admin) ${base}`, `${base} \u2219 Admins only`, `${base} \u2027 Team plan`, `${base} \u22c5 Owner`, `${base} (Admin)`, `Enterprise plan | ${base}`]) for (const cls of want) assert.ok(classesOf(form).includes(cls), `${form}: ${cls}`)
  }
  for (const name of ['Gold \u00b7 Plans', 'Team \u2022 Overview', 'Settings \u2219 Admins only', '$10 - $20']) assert.deepEqual(classesOf(name), [], name)
})

test('#843 round 4 (cu-researcher 02:37Z): every split, and separators need whitespace', () => {
  for (const [form, base] of [['Step 2 of 3 - Add phone key \u22c5 3 min', 'Add phone key'], ['Add rule ::/0 \u2027 New', 'Add rule ::/0'], ['Billing \u00b7 Team plan \u00b7 Change IBAN \u00b7 2 min', 'Change IBAN']]) {
    const want = classesOf(base)
    assert.notDeepEqual(want, [], `base asks: ${base}`)
    for (const cls of want) assert.ok(classesOf(form).includes(cls), `${form}: ${cls}`)
  }
  for (const name of ['Step 2 of 3 - Overview \u22c5 3 min', 'Docs: Settings', '$10 - $20']) assert.deepEqual(classesOf(name), [], name)
})
