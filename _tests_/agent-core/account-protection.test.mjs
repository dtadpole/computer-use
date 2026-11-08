import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-270 (cu-researcher): a control that switches an account's protection off asks permission.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const judge = (name) => policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://fixture.example/', target: { role: 'button', name } })

test('CU-270 (and Finder\'s Change All, with CU-258): turning off 2-step verification, 2FA, passkeys, login alerts, recovery or Find My, or allowing less secure apps, asks permission', () => {
  for (const name of ['Turn off 2-Step Verification', 'Disable 2FA', 'Turn off two-factor authentication', 'Remove passkey', 'Remove security key',
    'Turn off login alerts', 'Turn off account recovery', 'Turn Off Find My Mac', 'Allow less secure apps', 'Disable MFA', 'Turn off password', 'Change All\u2026', 'Change All...', 'Always use this app\u2026', 'Do not ask me again', "Don't ask me again"]) {
    assert.ok((judge(name).classes ?? []).includes('permission'), name)
  }
})

test('CU-270: ordinary switches and turning protection on stay as they were', () => {
  for (const name of ['Turn off notifications', 'Turn off dark mode', 'Disable animations', 'Turn on 2-Step Verification', 'Allow']) {
    assert.equal(judge(name).decision, 'allow', name)
  }
})
