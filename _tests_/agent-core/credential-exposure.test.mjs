import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-420 (High): exporting or revealing credentials (credential) and turning machine protection off or trusting a device
// (permission). Click, Return and Space (D-106). Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://vault.example/settings'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Search', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-420: exporting, revealing or copying passwords and backup/recovery codes ask credential', () => {
  for (const name of ['Export passwords', 'Export vault', 'Reveal password', 'Show password', 'Copy password', 'View password', 'Show saved passwords', 'Download backup codes', 'View recovery codes', 'Export keychain', 'Export credentials', 'Show passwords', 'Reveal secret', 'Get backup codes']) {
    assert.equal(click(name), 'credential', name)
    assert.equal(enter(name), 'credential', `Return: ${name}`)
  }
})

test('CU-420: turning FileVault, the firewall or antivirus off and trusting a device ask permission', () => {
  for (const name of ['Disable FileVault', 'Turn off FileVault', 'Turn off firewall', 'Disable firewall', 'Disable antivirus', 'Turn off real-time protection', 'Trust this device', 'Disable Defender', 'Pause protection', 'Remember this device']) {
    assert.equal(click(name), 'permission', name)
    assert.equal(space(name), 'permission', `Space: ${name}`)
  }
})

test('CU-420 negatives: lists, labels and Hide password stay free; a bare Security keeps its older permission ask (15:08Z: a High never lowers an older rule)', () => {
  for (const name of ['Passwords', 'Vault', 'Firewall', 'Backup codes', 'Hide password', 'Keychain', 'Secrets']) assert.equal(click(name), 'allow', name)
  assert.equal(click('Security'), 'allow', 'CU-429 (cu-coordinator 09:34Z): a pane name is lowered to free')
})
