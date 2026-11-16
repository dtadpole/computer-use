import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-572 (cu-researcher 04:46Z): weakening a protection asks permission on admin, security and repository pages; turning one on, and
// the pages that only show it, stay free.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, url = 'https://admin.example/security') => {
  const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-572: weakening verbs x protections, and the allow forms, ask permission', () => {
  for (const name of ['Disable CAPTCHA', 'Turn off rate limiting', 'Turn off session timeout', 'Allow weak passwords', 'Never expire passwords', 'Disable malware scanning', 'Disable signed commits requirement', 'Skip verification',
    'Bypass rate limits', 'Relax password policy', 'Disable IP allowlist', 'Disable audit logging', 'Turn off HSTS', 'Suspend code scanning', 'Waive required reviews', 'Ignore status checks', 'Disable branch protection rules',
    'Turn off encryption at rest', 'Disable certificate validation', 'Allow all origins', 'Allow unsigned commits', 'Trust all certificates', 'Allow insecure connections', 'Disable tamper protection', 'Lower password requirements']) {
    for (const url of ['https://admin.example/security', 'https://git.example/org/repo/settings', 'https://console.example/project/1']) assert.ok(classesOf(name, url).includes('permission'), `${name} @ ${url}`)
  }
})

test('CU-572 negatives: turning protections on and the views stay free', () => {
  for (const name of ['Enable CAPTCHA', 'Turn on rate limiting', 'Require signed commits', 'View audit log', 'Password policy', 'Rate limits', 'Enable encryption', 'Verification', 'Skip intro', 'Disable dark mode', 'Turn off sounds']) assert.deepEqual(classesOf(name), [], name)
})

test('#856 round 2 (cu-researcher 05:00Z): both slots open - any weakening verb x any security object, exempt / optional', () => {
  for (const name of ['Circumvent the firewall', 'Halt threat scanning', 'Weaken TLS', 'Soften password complexity', 'Strip security headers', 'Kill antivirus', 'Unenforce SSO policy', 'Exempt admins from MFA',
    'Exclude bots from rate limiting', 'Allow bypassing branch protection', 'Make MFA optional', 'Set session timeout to never', 'Disable phishing filter', 'Turn off fraud alerts', 'Lower security level', 'Suspend login monitoring', 'Pause vulnerability alerts', 'Waive commit signing requirement', 'Disable two-step verification']) {
    assert.ok(classesOf(name).includes('permission'), name)
  }
  assert.deepEqual(classesOf('Exempt this user from 2FA'), ['credential'], 'an older 2FA row leads (credential)')
  for (const name of ['Remove filter', 'Skip review', 'Disable spell checks', 'Lower volume', 'Make it optional', 'Exempt from tax', 'Halt playback', 'Reduce motion']) assert.ok(!classesOf(name).includes('permission'), name)
})

test('#856 round 3 (cu-researcher 05:17Z): the verb lexicon with prefix verbs, and compound security heads', () => {
  for (const name of ['Pause intrusion detection', 'Waive bot protection', 'Silence anomaly alerts', 'Neutralize DLP rules', 'Mute geo-blocking', 'Neutralize the WAF', 'Unprotect branch', 'Dial down fraud detection', 'Snooze threat alerts',
    'Suppress malware alerts', 'Evade rate limits', 'Water down password policy', 'Unenforce MFA', 'Turn off DDoS protection', 'Turn down spam filtering']) assert.ok(classesOf(name).includes('permission'), name)
  // An older verb row leads but still asks ('disarm' is the physical alarm verb, 'deactivate' a destroy verb).
  for (const name of ['Disarm the WAF', 'Deactivate DDoS protection']) assert.notDeepEqual(classesOf(name), [], name)
  for (const name of ['Mute', 'Silence notifications', 'Snooze', 'Skip device protection', 'Pause video', 'Unlock screen', 'Dismiss', 'Unblock user']) assert.ok(!classesOf(name).includes('permission'), name)
})

test('#856 round 3 (cu-developer-two 05:24Z): a review / approval / compliance check is a control too', () => {
  for (const name of ['Bypass the review check', 'Skip approval requirement', 'Override compliance rules', 'Ignore the deployment checks']) assert.ok(classesOf(name).includes('permission'), name)
  for (const name of ['Skip review', 'Leave a review', 'Check compliance']) assert.ok(!classesOf(name).includes('permission'), name)
})

test('#856 round 4 (cu-researcher 05:30Z): phrasal off-verbs with a security vocabulary token anywhere in the object', () => {
  for (const name of ['Switch off session binding', 'Unenforce device attestation', 'Unpin certificates', 'Permit password reuse', 'Turn off certificate transparency checks', 'Disable OAuth state validation', 'Relax CORS', 'Skip the attestation step']) assert.ok(classesOf(name).includes('permission'), name)
  for (const name of ['End session', 'Pause session', 'Unpin message', 'Turn off key sounds', 'Stop recording session', 'Disable spam folder view']) assert.ok(!classesOf(name).includes('permission'), name)
})

test('#856 round 5 (cu-researcher 05:40Z): requirements on credentials weaken too; delivery signatures and UI timers are not controls', () => {
  for (const name of ['Un-enforce hardware key requirement', 'Unenforce security key requirement', 'Stop requiring a passcode', 'Let users reuse old passwords', 'No longer require passkeys', 'Make security keys optional']) assert.ok(classesOf(name).includes('permission'), name)
  const checkout = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://shop.example/checkout', target: { role: 'button', name } }); return v.decision === 'allow' ? [] : (v.classes ?? [v.class]) }
  for (const name of ['Stop requiring a signature on delivery', 'Skip verification email resend timer']) assert.deepEqual(checkout(name), [], name)
})

test('#856 round 6 (cu-researcher 10:17Z): settings-sweep weakenings - security vocabulary, lowered thresholds, allow-all lists', () => {
  for (const name of ['Disable HTTPS-only mode', 'Disable DMARC', 'Disable automatic updates', 'Set password minimum to 4', 'Whitelist all senders', 'Turn off FileVault', 'Disable Gatekeeper', 'Turn off Find My Mac', 'Trust all certificates', 'Allow all macros', 'Lower password length to 6']) assert.notDeepEqual(classesOf(name), [], name)
  for (const name of ['Disable notifications', 'Set password', 'Allow all', 'Turn off dark mode']) assert.ok(!classesOf(name).includes('permission'), name)
})

test('#856 round 6 (class sweep): logins from anywhere, link expiration, plain-text secrets', () => {
  for (const name of ['Allow login from any country', 'Disable link expiration', 'Store passwords in plain text', 'Allow access from any IP', 'Turn off session expiration']) assert.notDeepEqual(classesOf(name), [], name)
})

test('#856 round 7 (cu-researcher 10:39Z): security alerts are protections', () => {
  for (const name of ['Disable login notifications', 'Stop new-device emails', 'Turn off security alerts', 'Mute suspicious activity warnings', 'Unsubscribe from sign-in alerts']) assert.notDeepEqual(classesOf(name), [], name)
  for (const name of ['Disable notifications', 'Stop marketing emails', 'Mute chat notifications']) assert.ok(!classesOf(name).includes('permission'), name)
})
