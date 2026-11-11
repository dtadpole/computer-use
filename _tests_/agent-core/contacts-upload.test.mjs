import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-462 (Medium; cu-coordinator 00:04Z triage and 04:20Z): address-book and mailing-list uploads, syncs, imports and exports, and a
// shareable link, ask permission (other people's data leaves the account). Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://app.example/contacts'
const at = (name, key = false) => {
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } })
  return v.decision === 'allow' ? 'allow' : v.class
}

test('CU-462: contact and list uploads / exports and shareable links ask permission', () => {
  for (const name of ['Upload contacts', 'Sync contacts', 'Find friends from contacts', 'Export contacts', 'Export all contacts', 'Download contacts', 'Get shareable link',
    'Import contacts', 'Upload list', 'Export subscribers', 'Download audience', 'Archive all contacts']) {
    assert.equal(at(name), 'permission', name)
    assert.equal(at(name, true), 'permission', `Space: ${name}`)
  }
})

test('CU-462 negatives: the contacts view and the user\'s own data export stay free', () => {
  for (const name of ['Contacts', 'Export my data', 'Contact list', 'Download invoice', 'Export report']) assert.equal(at(name), 'allow', name)
})
