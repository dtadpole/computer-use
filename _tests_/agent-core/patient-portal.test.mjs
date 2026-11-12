import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-477 (High; cu-coordinator 03:36Z): a patient portal - giving another person access to the account (credential), signing a HIPAA
// authorization or a release and scheduling care (submit), research opt-in (permission), an e-visit (submit; purchase when a copay is
// named). Click and Space (D-106). Both sides.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://portal.example/patient/records'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-477: portal acts ask in their ruled class', () => {
  for (const [name, cls] of [['Give access to my account', 'credential'], ['Sign HIPAA authorization', 'submit'], ['Sign release', 'submit'], ['Schedule appointment', 'submit'],
    ['Book appointment', 'submit'], ['Opt in to research', 'permission'], ['Start e-visit', 'submit'], ['Start e-visit ($25 copay)', 'purchase']]) {
    assert.equal(click(name), cls, name)
    assert.equal(space(name), cls, `Space: ${name}`)
  }
  // Named (older classes kept; each asks either way): 'Add proxy' and 'Share my records' keep permission (ruled credential).
  for (const name of ['Add proxy', 'Share my records']) assert.equal(click(name), 'permission', name)
})

test('CU-477 negatives: records, messages and results views stay free', () => {
  for (const name of ['Records', 'Messages', 'View results', 'Appointments', 'Research']) assert.equal(click(name), 'allow', name)
})

test('#617 round 2: the four held-out escapes ask; video visits keep the older camera class (named)', () => {
  for (const [name, cls] of [['Give someone access to my account', 'credential'], ['Give access to my chart', 'credential'], ['Join research program', 'permission'], ['Schedule follow-up', 'submit']]) assert.equal(click(name), cls, name)
  assert.equal(click('Start video visit'), 'permission', 'older camera / video rule (ruled submit; asks either way)')
  for (const name of ['Follow-up notes', 'Research news', 'Give feedback']) assert.equal(click(name), 'allow', name)
})

test('#617 round 2 (cu-coordinator 03:51Z): checking in asks submit; downloads and messages stay free', () => {
  for (const name of ['Check in', 'eCheck-in', 'Check in for appointment', 'Check in online']) assert.equal(click(name), 'submit', name)
  assert.equal(click('Message provider'), 'allow', 'Message provider')
  // Pin moved by #813 r5 (cu-coordinator 06:36Z, 12 Nov: 'Download visit summary' asks permission under CU-552), a raise over 03:51Z.
  assert.equal(click('Download visit summary'), 'permission', 'CU-552 raise: Download visit summary')
  // Pin moved by CU-552 (cu-coordinator 05:21Z, 12 Nov: patient-portal record downloads / exports = permission), a raise over this
  // 03:51Z row: on a portal page 'Download records' / 'Download my records' now ask permission.
  for (const name of ['Download records', 'Download my records']) assert.equal(click(name), 'permission', `CU-552 raise: ${name}`)
})

test('#617 x #609: the grammar on the full name goes before the canonical probe - a named copay keeps purchase', () => {
  assert.equal(click('Start e-visit ($25 copay)'), 'purchase')
  assert.equal(click('Start e-visit (opens in a new window)'), 'submit', 'a parenthetical with no amount still comes off')
})

test("#617 round 4 (cu-developer-three 04:15Z): 'Sign waiver' keeps main's permission - no reclass", () => {
  assert.equal(click('Sign waiver'), 'permission')
})
