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
