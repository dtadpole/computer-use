import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-401 (High): changing the account's email redirects password resets (credential); ending a plan (purchase); disabling
// an account (delete); leaving a workspace or unlinking an account (permission). Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/account', target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-401: account changes ask their class', () => {
  for (const name of ['Change email', 'Change email address', 'Update email', 'Change recovery email', 'Change recovery phone']) assert.equal(click(name), 'credential', name)
  for (const name of ['Cancel plan', 'Cancel membership', 'Downgrade', 'End trial']) assert.equal(click(name), 'purchase', name)
  for (const name of ['Disable account', 'Deactivate account']) assert.equal(click(name), 'delete', name)
  for (const name of ['Leave workspace', 'Leave organization', 'Leave team', 'Unlink account']) assert.equal(click(name), 'permission', name)
})

test('CU-401 negatives: viewing or editing a profile stays free', () => {
  for (const name of ['Email', 'Edit profile', 'Plan details', 'Team settings', 'Leave a comment', 'Email preferences']) assert.equal(click(name), 'allow', name)
})
