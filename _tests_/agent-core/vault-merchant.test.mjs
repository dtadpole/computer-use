import assert from 'node:assert/strict'
import { test } from 'node:test'

import { grammarClasses } from '../../_tools_/agent-core/phrase-grammar.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-474 (High): a password vault's protections - an unencrypted export and an emergency contact (credential), master-password reprompt
// off, never locking and an endless vault timeout, and auto-lock off on a vault page (permission). CU-475 (High): a merchant console's
// bulk money acts (purchase), fraud filters off (permission), closing the store (delete). Click, Return and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const VAULT = 'https://vault.example/settings/security'
const MERCHANT = 'https://merchant.example/dashboard/settings'
const click = (name, url) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name, url) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-474: vault protections ask - credential for an unencrypted export and an emergency contact, permission for the rest', () => {
  for (const [name, cls] of [['Download unencrypted export', 'credential'], ['Export vault (unencrypted)', 'credential'], ['Add emergency contact', 'credential'],
    ['Turn off master password reprompt', 'permission'], ['Never lock vault', 'permission'], ['Set vault timeout to never', 'permission'], ['Turn off auto-lock', 'permission']]) {
    assert.equal(click(name, VAULT), cls, name)
    assert.equal(space(name, VAULT), cls, `Space: ${name}`)
  }
  assert.equal(click('Turn off auto-lock', 'https://home.example/lock/front-door'), 'physical', 'a door keeps CU-468 physical')
  for (const name of ['Export (encrypted)', 'Lock now', 'Vault']) assert.equal(click(name, VAULT), 'allow', name)
  // Named for CU-429 (older 'Security' rule, identical on main): a bare 'Security' tab asks permission.
  assert.equal(click('Security', VAULT), 'allow', 'CU-429 (09:34Z): lowered to free')
})

test('CU-475: merchant bulk money acts ask purchase, fraud filters off permission, closing the store delete; views free', () => {
  for (const [name, cls] of [['Instant payout', 'purchase'], ['Accept all disputes', 'purchase'], ['Set all prices to $0', 'purchase'], ['Apply 90% discount to all', 'purchase'],
    ['Issue refund to all', 'purchase'], ['Disable fraud filters', 'permission'], ['Turn off Radar rules', 'permission'], ['Close store', 'delete']]) {
    assert.equal(click(name, MERCHANT), cls, name)
    assert.equal(space(name, MERCHANT), cls, `Space: ${name}`)
  }
  for (const name of ['Payouts', 'Enable fraud filters', 'Disputes', 'Store settings']) assert.equal(click(name, MERCHANT), 'allow', name)
  assert.equal(click('Refund order', MERCHANT), 'purchase', 'a single-order action keeps its own class')
  assert.deepEqual(grammarClasses('Close shop'), ['delete'])
})

test('#614 round 2: the held-out escapes fold as patterns; an emergency contact asks without a page; screen timeouts stay free', () => {
  for (const [name, cls] of [['Download plaintext export', 'credential'], ['Turn off reprompt', 'permission'], ['Set timeout to never', 'permission'], ['Turn off vault auto-lock', 'permission']]) assert.equal(click(name, VAULT), cls, name)
  assert.deepEqual(grammarClasses('Add emergency contact'), ['credential'], 'no page condition')
  for (const [name, cls] of [['Get instant payout', 'purchase'], ['Instant payout to bank', 'purchase'], ['Accept all chargebacks', 'purchase'], ['Accept all open disputes', 'purchase'],
    ['Set every price to $0', 'purchase'], ['Apply 50% discount to all products', 'purchase'], ['Disable risk rules', 'permission']]) assert.equal(click(name, MERCHANT), cls, name)
  for (const name of ['Set screen timeout to never', 'Accept', 'Apply discount code']) assert.equal(click(name, 'https://app.example/settings'), 'allow', name)
})

test('#614 round 2 (cu-coordinator 03:19Z): pausing the store and changing the payout schedule ask permission; desktop vault class comes from the bundle id', () => {
  for (const name of ['Pause store', 'Change payout schedule']) assert.equal(click(name, MERCHANT), 'permission', name)
  // Named (cu-developer-three 03:20Z): on the desktop route the vault test reads the app: context, so a vault app's bundle id gives
  // permission and any other app gives CU-468's physical - it asks either way; a later http-only guard would change it visibly.
  const desk = (url) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'AXButton', name: 'Turn off auto-lock' } }); return v.decision === 'allow' ? 'allow' : v.class }
  assert.equal(desk('app:com.1password.1password'), 'permission')
  assert.equal(desk('app:com.example.homecontrol'), 'physical')
})
