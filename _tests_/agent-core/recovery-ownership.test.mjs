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
