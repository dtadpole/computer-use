import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-496 (High; cu-coordinator 11:21Z): recovery / trusted / legacy contacts, access requests and autofill-on-load ask permission; a
// vault's backup, emergency kit and recovery codes ask credential. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const VAULT = 'https://vault.example/settings'
const at = (name, url = VAULT, key = false, extra = {}) => {
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name, ...extra } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name, ...extra } })
  return v.decision === 'allow' ? 'allow' : v.class
}

test('CU-496: contacts and access requests ask permission; the vault backup, kit and codes ask credential', () => {
  for (const [name, cls] of [['Add recovery contact', 'permission'], ['Add trusted contact', 'permission'], ['Add legacy contact', 'permission'], ['Approve access request', 'permission'],
    ['Download backup', 'credential'], ['Print emergency kit', 'credential'], ['Export recovery codes', 'credential'], ['Turn on autofill on page load', 'permission']]) {
    assert.equal(at(name), cls, name)
    assert.equal(at(name, VAULT, true), cls, `Space: ${name}`)
  }
})

test('CU-496: a native Autofill on page load switch asks only when the press turns it on', () => {
  const sw = (checked) => at('Autofill on page load', VAULT, false, { role: 'switch', tag: 'input', inputType: 'checkbox', checked })
  assert.equal(sw(false), 'permission', 'off -> on')
  assert.equal(sw(true), 'allow', 'on -> off protects')
})

test('CU-496 negatives: recovery options, a non-vault backup, and views stay free', () => {
  for (const name of ['Recovery options', 'Trusted contacts', 'Emergency kit help']) assert.equal(at(name), 'allow', name)
  assert.equal(at('Download backup', 'https://blog.example/wp-admin/tools'), 'allow', 'off a vault URL')
})

test('#669 round 2 (cu-developer-three 11:32Z): only a native read gives the switch direction; an ARIA or unread switch asks', () => {
  assert.equal(at('Autofill on page load', VAULT, false, { role: 'switch', checked: true }), 'permission', 'an ARIA state is page-supplied')
  assert.equal(at('Autofill on page load', VAULT, false, { role: 'switch' }), 'permission', 'no state read')
  assert.equal(at('Autofill on page load', 'desktop://com.example.vault', false, { role: 'AXSwitch' }), 'permission', 'desktop switch with no read')
  assert.equal(at('Autofill on page load', VAULT, false, { role: 'switch', tag: 'input', inputType: 'checkbox', checked: true }), 'allow', 'native on -> off')
})

test('#669 round 2 (cu-researcher 11:33Z): emergency access requests and the for-all-items form', () => {
  assert.equal(at('Approve emergency access request'), 'permission')
  assert.equal(at('Turn on autofill on page load for all items'), 'permission')
  assert.equal(at('Autofill on page load for all items', VAULT, false, { role: 'switch', tag: 'input', inputType: 'checkbox', checked: false }), 'permission')
})

test("#669 round 3 (cu-verifier 11:50Z): the title's 'Allow item to autofill on page load' asks permission", () => {
  for (const name of ['Allow item to autofill on page load', 'Allow this item to autofill on page load', 'Let this login autofill on page load']) assert.equal(at(name), 'permission', name)
})
