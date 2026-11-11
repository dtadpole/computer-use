import assert from 'node:assert/strict'
import { test } from 'node:test'

import { grammarClasses } from '../../_tools_/agent-core/phrase-grammar.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-471 (High; cu-coordinator 01:19Z): removing a tenant's admin protections asks permission - conditional access, DLP and
// security-default policies off, excluding a user, legacy authentication, global admin and role assignments; resetting a user's
// MFA asks credential. Grammar table rows. Click, Return and Space (D-106). Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://admin.example/tenant/users'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'User', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-471: tenant protections off, exclusions, legacy auth and admin assignments ask permission; Reset MFA asks credential', () => {
  for (const [name, cls] of [['Disable conditional access policy', 'permission'], ['Exclude user from policy', 'permission'], ['Disable DLP policy', 'permission'],
    ['Allow legacy authentication', 'permission'], ['Turn off security defaults', 'permission'], ['Assign Global Administrator', 'permission'], ['Add role assignment', 'permission'],
    ['Reset MFA', 'credential']]) {
    assert.equal(click(name), cls, name)
    assert.equal(enter(name), cls, `Return: ${name}`)
    assert.equal(space(name), cls, `Space: ${name}`)
  }
  for (const [name, cls] of [['Delete the retention policy', 'permission'], ['Exclude group from MFA', 'permission'], ['Assign admin role', 'permission'], ['Reset authenticator app', 'credential']]) assert.deepEqual(grammarClasses(name), [cls], `table row: ${name}`)
})

test('CU-471 negatives: views and enabling a policy stay free', () => {
  for (const name of ['Enable policy', 'Conditional access', 'Policies', 'Users', 'Roles', 'Reset filters', 'Disable notifications']) assert.equal(click(name), 'allow', name)
})

test('#606 round 2: the five held-out escapes ask permission; older over-asks named for CU-429', () => {
  for (const name of ['Turn off conditional access', 'Exclude from conditional access', 'Disable data loss prevention policy', 'Allow basic authentication', 'Make Global Administrator']) {
    assert.deepEqual(grammarClasses(name), ['permission'], name)
    assert.equal(click(name), 'permission', `hook: ${name}`)
  }
  // Named (older rules, identical on main; CU-429): 'Security policies' and 'Turn on security defaults' (older security word),
  // 'Require multi-factor authentication' (older 2FA rule).
  for (const name of ['Security policies', 'Turn on security defaults', 'Require multi-factor authentication']) assert.notEqual(click(name), 'allow', name)
  assert.equal(click('Require MFA'), 'allow')
})
