import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-574 (cu-researcher 06:35Z): recovery-factor changes ask credential and account handovers ask permission, like 'Change recovery email'
// and 'Transfer ownership' on main; reading stays free.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, url = 'https://account.example/security') => {
  const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-574: recovery / sign-in factor changes ask credential; handovers and successors ask permission', () => {
  for (const name of ['Set new recovery contact', 'Unlink phone', 'Detach phone number', 'Disconnect authenticator', 'Change sign-in phone', 'Set fallback email']) assert.ok(classesOf(name).includes('credential'), name)
  for (const name of ['Hand over the account', 'Pass the account to my colleague', 'Reassign the workspace to', 'Delegate admin rights to Sam', 'Designate an heir', 'Appoint a new admin', 'Set legacy contact', 'Sign over ownership']) assert.ok(classesOf(name).includes('permission'), name)
})

test('CU-574: an older row leads but still asks', () => {
  for (const name of ['Replace backup codes', 'Remove passkey']) assert.notDeepEqual(classesOf(name), [], name)
})

test('CU-574 negatives: reading and unrelated phones stay free', () => {
  for (const name of ['View recovery options', 'Learn about legacy contacts', 'Phone settings', 'Owner', 'Admins', 'Pass']) assert.deepEqual(classesOf(name), [], name)
})

test('#862 round 2 (cu-researcher 07:08Z): a reset / verification destination is a recovery route', () => {
  for (const name of ['Use a different inbox for password resets', 'Route verification codes to a new phone', 'Switch the account recovery address', 'Deliver sign-in codes to this device']) assert.ok(classesOf(name).includes('credential'), name)
  assert.notDeepEqual(classesOf('Send reset links to my work email'), [], 'an older send row leads and asks')
  for (const name of ['Reset filters', 'Send email', 'Use a different inbox', 'Get verification badge', 'Recovery mode guide']) assert.ok(!classesOf(name).includes('credential'), name)
})

test('#862 round 3 (cu-researcher 08:14Z): concrete objects - a person, a literal number or an address', () => {
  for (const name of ['Set Ana as recovery contact', 'Unlink +1 555 0100', 'Remove ana@example.org', 'Add Bob Lee as a trusted contact']) assert.notDeepEqual(classesOf(name), [], name)
  for (const name of ['Make sam@partner.example the account owner', 'Make Ana the workspace admin', 'Set Priya as owner']) assert.notDeepEqual(classesOf(name), [], name)
  for (const name of ['Set Ana as favorite', 'Make it the default', 'Unlink']) assert.ok(!classesOf(name).includes('credential') && !classesOf(name).includes('permission') || name === 'Unlink', name)
})

test('#862 round 4 (cu-researcher 08:28Z): a hardware key or authenticator named by brand and model', () => {
  for (const name of ['Unlink YubiKey 5C', 'Remove YubiKey 5 NFC', 'Unregister Titan Security Key', 'Disconnect Okta Verify', 'Remove Google Authenticator on Pixel 8', 'Add new YubiKey']) assert.notDeepEqual(classesOf(name), [], name)
})
