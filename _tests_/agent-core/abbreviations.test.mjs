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

test('#653 round 2 (cu-researcher 09:11Z; cu-developer-three 09:10Z): trailing nouns, WPA, open / start RDP, and bare acronyms on switches', () => {
  const at = (name, url = 'http://router.example/admin') => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
  for (const [name, row] of [['Update ACH info', 'Update direct deposit'], ['Edit ACH details', 'Edit direct deposit'], ['Disable WPA', 'Disable Wi-Fi security'], ['Turn off WPA', 'Turn off Wi-Fi security'],
    ['Open RDP', 'Open port 3389'], ['Start RDP', 'Start Remote Desktop']]) {
    assert.notEqual(at(row), 'allow', `${row} asks`)
    assert.equal(at(name), at(row), name)
  }
  const sw = (name, checked) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'http://router.example/admin', target: { tag: 'input', inputType: 'checkbox', role: 'switch', name, checked } }); return v.decision === 'allow' ? 'allow' : v.class }
  assert.equal(sw('RDP', false), sw('Remote Desktop', false), 'RDP switch turned on')
  assert.equal(sw('RDP', true), sw('Remote Desktop', true), 'RDP switch turned off')
  assert.equal(sw('MFA', true), sw('Two-factor authentication', true), 'MFA switch turned off')
  assert.equal(sw('MFA', false), sw('Two-factor authentication', false), 'MFA switch turned on')
  for (const name of ['Require MFA', 'MFA settings', 'ACH history', 'RDP guide', 'WPA2 info']) assert.equal(at(name), 'allow', name)
})
