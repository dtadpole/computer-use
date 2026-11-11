import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'

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

test('#721 round 3 (cu-coordinator 18:51Z): curly apostrophes and quotes read as straight', () => {
  for (const name of ['Yes, it\u2019s me', 'Confirm it\u2019s you', 'Confirm that\u2019s you']) assert.ok(classesOf(name).includes('permission'), name)
  assert.ok(classesOf('\u201CTrust this sender\u201D'.slice(1, -1)).includes('permission'))
  assert.deepEqual(classesOf('No, it\u2019s not me'), [], 'the negation stays free')
})

// cu-developer-three's pins (18:38Z): through createAppPolicy, the real desktop route; bundle ids here are test values.
function desktop(app, name, role = 'AXButton') {
  const policy = createAppPolicy({ scope: [app] })
  policy.grantScope(app, { approved: true, answeredBy: 'live' })
  const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { frontmostBundleId: app, target: { origin: app, role, name } })
  return v
}

test('#721 round 3: a bare Copy / Copy code / Show code asks credential in a native authenticator, free elsewhere', () => {
  for (const app of ['com.example.authy-desktop', 'com.example.azureauthenticator', 'com.example.otpauth', 'com.example.steptwo']) {
    for (const name of ['Copy', 'Copy code', 'Show code']) {
      const v = desktop(app, name)
      assert.equal(v.decision, 'confirm', `${app}: ${name}`)
      assert.ok((v.classes ?? [v.class]).includes('credential'), `${app}: ${name}`)
    }
    assert.equal(desktop(app, 'Settings').decision, 'allow', `${app}: Settings stays free`)
  }
  for (const app of ['com.apple.TextEdit', 'com.apple.Notes']) for (const name of ['Copy', 'Copy code', 'Show code']) assert.equal(desktop(app, name).decision, 'allow', `${app}: ${name}`)
})

test('#721 round 3: a password manager stays BLOCKED (excluded), never merely asked', () => {
  const v = desktop('com.1password.1password', 'Copy code')
  assert.equal(v.decision, 'block')
  assert.equal(v.rule, 'excluded:password_manager')
})
