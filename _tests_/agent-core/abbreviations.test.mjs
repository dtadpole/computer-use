import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-489 (High; cu-coordinator 08:49Z): an abbreviation of a ruled row's object asks as the row does - expanded in one more form, tried
// last (adds only), through the whole classifier. Word-edged; the acronyms are case-sensitive.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name, url = 'https://app.example/settings') => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-489: abbreviations ask as their ruled row', () => {
  for (const [abbrev, row] of [['Change IBAN', 'Change direct deposit'], ['Change ACH', 'Change direct deposit'], ['Turn off 2SV', 'Turn off two-factor authentication'],
    ['Disable TOTP', 'Disable two-factor authentication'], ['Turn off login approvals', 'Turn off two-factor authentication'], ['Enable RDP', 'Enable Remote Desktop']]) {
    const want = click(row)
    assert.notEqual(want, 'allow', `${row} asks`)
    assert.equal(click(abbrev), want, abbrev)
  }
})

test('CU-489 negatives: words that merely contain the letters, and free objects, stay free', () => {
  for (const name of ['Coach settings', 'Reach out', 'IBAN format help', 'Teach mode', 'Rdp notes']) assert.equal(click(name), 'allow', name)
  assert.equal(click('View MFA devices'), 'allow', 'a view is not a lowering verb')
  // A protection being raised never takes the lowering row: 'Require MFA' stays free (#606).
  assert.equal(click('Require MFA'), 'allow')
})
