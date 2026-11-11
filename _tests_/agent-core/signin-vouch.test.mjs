import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-514 (High; cu-coordinator 18:21Z), table PR 26: vouching for or unblocking a suspicious sign-in asks permission, like 'Approve sign-in'. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, key = false) => {
  const url = 'https://account.example/security/activity'
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-514: the vouching and unblocking rows ask permission', () => {
  for (const name of ['Confirm sign-in', 'Verify sign-in attempt', 'Confirm it was you', 'Confirm that it was me', 'Unblock sign-in', 'Unblock account', 'Allow sign-in from new location', 'Allow sign-ins from a new device', 'Trust this device', 'Trust this browser']) {
    assert.ok(classesOf(name).includes('permission'), name)
    assert.ok(classesOf(name, true).includes('permission'), `Space: ${name}`)
  }
})

test('CU-514 negatives and older rows', () => {
  for (const name of ['Sign in', 'Recent sign-ins', 'Sign-in activity', 'Account locked', 'Not you? Secure your account', 'Review activity']) assert.deepEqual(classesOf(name), [], name)
  assert.ok(classesOf('Approve sign-in').includes('permission'), 'older row unchanged')
  assert.deepEqual(classesOf('Yes, it was me'), ['permission'])
  for (const name of ['Unlock account', 'Unlock your account']) assert.deepEqual(classesOf(name), ['credential'], `${name}: raised (18:21Z)`)
})

test('#721 round 2 (cu-coordinator 18:36Z): the present tense, and CU-515 one-time codes ask credential', () => {
  for (const name of ["Confirm it's you", 'Confirm it is you', "Confirm that's you", 'Verify it is me']) assert.ok(classesOf(name).includes('permission'), name)
  for (const name of ['Copy TOTP', 'Copy one-time code', 'Copy verification code', 'Copy 2FA code', 'Show TOTP', 'Reveal one-time code', 'Copy authentication code', 'View OTP']) {
    assert.ok(classesOf(name).includes('credential'), name)
    assert.ok(classesOf(name, true).includes('credential'), `Space: ${name}`)
  }
  for (const name of ["No, it's not me", 'Copy link', 'Show QR code help', 'One-time codes']) assert.deepEqual(classesOf(name), [], name)
})
