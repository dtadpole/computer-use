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
