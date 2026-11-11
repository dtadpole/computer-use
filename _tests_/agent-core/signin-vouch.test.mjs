import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-514: vouching for or unblocking a suspicious sign-in asks permission, like 'Approve sign-in'. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, key = false) => {
  const url = 'https://account.example/security/activity'
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-514: the vouching and unblocking rows ask permission', () => {
  for (const name of ['Confirm sign-in', 'Verify sign-in attempt', 'Confirm it was you', 'Confirm that it was me', 'Unblock sign-in', 'Unlock account', 'Unlock your account', 'Allow sign-in from new location', 'Allow sign-ins from a new device']) {
    assert.ok(classesOf(name).includes('permission'), name)
    assert.ok(classesOf(name, true).includes('permission'), `Space: ${name}`)
  }
})

test('CU-514 negatives and older rows', () => {
  for (const name of ['Sign in', 'Recent sign-ins', 'Sign-in activity', 'Account locked']) assert.deepEqual(classesOf(name), [], name)
  assert.ok(classesOf('Approve sign-in').includes('permission'), 'older row unchanged')
  assert.deepEqual(classesOf('Yes, it was me'), ['permission'])
})
