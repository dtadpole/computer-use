import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-511 (High; cu-coordinator 17:21Z), table PR 24: Office macros and Protected View ask install; mail-trust overrides and
// Gatekeeper ask permission. Desktop (Word / Mail) and web, click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const desk = (name, bundle, key = false) => {
  const action = key ? { type: 'keypress', keys: ['SPACE'] } : { type: 'click', x: 1, y: 1, button: 'left' }
  const v = policy.classify(action, { url: 'desktop://', frontmostBundleId: bundle, target: { role: 'AXButton', tag: 'button', name, origin: bundle } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}
const web = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://mail.example/inbox/1', target: { role: 'button', name } }); return v.decision === 'allow' ? [] : (v.classes ?? [v.class]) }

test('CU-511: Office macro and Protected View rows ask install', () => {
  for (const name of ['Enable Content', 'Enable Macros', 'Enable all macros', 'Run macro', 'Run this macro', 'Trust Document', 'Trust this workbook', 'Enable Editing']) {
    assert.ok(desk(name, 'com.microsoft.Word').includes('install'), name)
    assert.ok(desk(name, 'com.microsoft.Excel', true).includes('install'), `Space: ${name}`)
  }
})

test('CU-511: mail-trust overrides and Gatekeeper ask permission', () => {
  for (const name of ['Trust this sender', 'This is not phishing', 'Not phishing', 'Add to safe senders', 'Add sender to safe senders list', 'Add alice@example.com to safe senders', 'Mark as not spam', 'Not spam', 'Always show images from this sender']) {
    assert.ok(web(name).includes('permission'), name)
    assert.ok(desk(name, 'com.apple.mail').includes('permission'), `Mail: ${name}`)
  }
  for (const name of ['Disable Gatekeeper', 'Turn off Gatekeeper', 'Allow apps from anywhere']) assert.ok(desk(name, 'com.apple.systempreferences').includes('permission'), name)
})

test('CU-511 negatives and older rows', () => {
  for (const name of ['Macros', 'View macros', 'Safe senders', 'Junk settings', 'Gatekeeper', 'Show images', 'Protected View settings']) assert.deepEqual(desk(name, 'com.microsoft.Word'), [], name)
  assert.deepEqual(web('Report phishing'), ['submit'], 'CU-433 keeps its class')
  assert.deepEqual(web('Mark as spam'), [], 'marking spam stays free')
})
