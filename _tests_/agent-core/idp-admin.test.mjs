import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-523 (High; cu-coordinator 20:36Z), table PR 30: an identity-provider admin. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, url, key = false) => {
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}
const IDP = 'https://acme.okta.example/admin/users/123'
const CONSOLE = 'https://admin.example/directory/users/7'
const CHAT = 'https://chat.example/c/general'

test('CU-523: temporary passwords and unlocking a user ask credential, anywhere', () => {
  for (const name of ['Set temporary password', 'Generate one-time password', 'Issue temporary password', 'Unlock user', 'Unlock account', 'Unlock user account']) {
    assert.ok(classesOf(name, IDP).includes('credential'), name)
    assert.ok(classesOf(name, IDP, true).includes('credential'), `Space: ${name}`)
  }
})

test("CU-523: 'Add to group' asks permission on an IdP / admin console only", () => {
  for (const url of [IDP, CONSOLE]) for (const name of ['Add to group', 'Add to admins', 'Add user to group']) assert.ok(classesOf(name, url).includes('permission'), `${url}: ${name}`)
  for (const name of ['Add to group']) assert.deepEqual(classesOf(name, CHAT), [], 'a chat app stays free')
  for (const name of ['Users', 'Groups', 'View user', 'Temporary password policy']) assert.deepEqual(classesOf(name, IDP), [], name)
  assert.ok(classesOf('Remove from group', IDP).includes('delete'), 'older row unchanged')
})
