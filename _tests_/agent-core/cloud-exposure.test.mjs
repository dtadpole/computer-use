import assert from 'node:assert/strict'
import { test } from 'node:test'

import { grammarClasses } from '../../_tools_/agent-core/phrase-grammar.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-447 (High): turning block-public-access off, opening resources to the internet and switching audit logging off ask
// permission (CU-417 family); minting a service-account or access key asks credential; the switches ask turned OFF. Grammar
// table rows. Click, Return, Space (D-106). Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://console.cloud.example/security'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Bucket', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const sw = (name, extra) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { name, ...extra } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-447: exposure and audit-off ask permission; minting keys asks credential', () => {
  const rows = [['Turn off block public access', 'permission'], ['Make public', 'permission'], ['Open to the internet', 'permission'], ['Allow all traffic', 'permission'],
    ['Allow 0.0.0.0/0', 'permission'], ['Turn off CloudTrail', 'permission'], ['Disable audit logs', 'permission'], ['Stop logging', 'permission'],
    ['Disable GuardDuty', 'permission'], ['Create service account key', 'credential'], ['Create access key', 'credential'], ['Download key', 'credential']]
  for (const [name, cls] of rows) {
    assert.equal(click(name), cls, name)
    assert.equal(enter(name), cls, `Return: ${name}`)
    assert.equal(space(name), cls, `Space: ${name}`)
  }
  for (const [name, cls] of [['Disable the audit logging', 'permission'], ['Allow all inbound', 'permission'], ['Create a new API key', 'credential']]) assert.deepEqual(grammarClasses(name), [cls], `table row: ${name}`)
})

test('CU-447: a block-public-access or logging switch turned OFF asks, ON free; unread asks both ways', () => {
  for (const name of ['Block public access', 'Audit logs', 'CloudTrail']) {
    assert.equal(sw(name, { tag: 'input', inputType: 'checkbox', role: 'switch', checked: true }), 'permission', `${name} on -> off`)
    assert.equal(sw(name, { tag: 'input', inputType: 'checkbox', role: 'switch', checked: false }), 'allow', `${name} off -> on`)
    assert.equal(sw(name, { tag: 'div', role: 'switch', checked: false }), 'permission', `${name} ARIA`)
  }
})

test('CU-447 negatives: buckets, turning protection on, audit log views and key lists stay free; Security groups keeps an older ask', () => {
  for (const name of ['Buckets', 'Turn on block public access', 'Audit logs', 'Keys', 'Open bucket', 'Allow notifications']) assert.equal(click(name), 'allow', name)
  // Named over-ask (older 'security' permission word, kept by the 15:08Z rule; CU-429's family).
  assert.equal(click('Security groups'), 'permission', 'older rule')
})
