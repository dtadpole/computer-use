import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-713 (cu-researcher's D-112 follow-up to CU-572, and cu-verifier's two switch rows): silencing security notices by class and turning
// an account-protection switch off ask permission; ordinary banners, reminders and marketing notices, and switching one ON, stay free.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://account.example/security'
const classesOf = (name) => {
  const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}
const sw = (name, checked) => {
  const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { name, tag: 'input', inputType: 'checkbox', role: 'switch', checked } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-713: silencing security notices asks permission', () => {
  for (const name of ['Hide unusual-activity banners for good', 'Block password-change emails', 'Ignore compromised-credential alerts', 'Mute new-device alerts', 'Turn off suspicious login warnings', 'Unsubscribe from security notifications', 'Stop sending password reset emails', 'Dismiss all breach alerts forever', 'Filter out leaked-password notices']) {
    assert.ok(classesOf(name).includes('permission'), name)
  }
})

test('CU-713 near collisions: ordinary banners, reminders and marketing notices stay free', () => {
  for (const name of ['Hide banner', 'Snooze reminder', 'Hide promotional banners', 'Block marketing emails', 'Ignore spelling alerts', 'Mute new message alerts', 'Dismiss this security banner', 'Hide unusual-activity banner', 'Clear notifications']) {
    assert.ok(!classesOf(name).includes('permission'), name)
  }
})

test("CU-713: an account-protection switch turned off asks permission; turned on it stays free", () => {
  for (const name of ['Passkeys', 'Login alerts', 'Two-factor authentication', '2FA', 'New-device notifications', 'Security alerts']) {
    assert.ok(sw(name, true).includes('permission'), `${name} on -> off`)
    assert.ok(!sw(name, false).includes('permission'), `${name} off -> on`)
  }
  for (const name of ['Dark mode', 'Marketing emails', 'Newsletter']) assert.ok(!sw(name, true).includes('permission'), `${name} stays free`)
})
