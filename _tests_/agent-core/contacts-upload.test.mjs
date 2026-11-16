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

test('CU-462 negatives: the contacts view stays free; the user\'s own data export asks since CU-558', () => {
  for (const name of ['Contacts', 'Contact list', 'Download invoice', 'Export report']) assert.equal(at(name), 'allow', name)
  // Pin moved by CU-558 (cu-coordinator 07:21Z, 12 Nov; #821 round 3): exporting your / my data asks permission now (a raise on main).
  assert.equal(at('Export my data'), 'permission', 'raised by CU-558')
})

test('#742 round 2 (cu-researcher 21:13Z): the two-word address book', () => {
  const policy2 = createPolicy({ sitePolicy: () => 'allow' })
  const at = (name) => { const v = policy2.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://mail.example/contacts', target: { role: 'button', name } }); return v.decision === 'allow' ? [] : (v.classes ?? [v.class]) }
  for (const name of ['Export address book', 'Sync my address book', 'Upload address book', 'Import address book', 'Share address book']) assert.ok(at(name).includes('permission'), name)
  for (const name of ['Address book', 'Open address book']) assert.deepEqual(at(name), [], name)
})

test("#742 round 3 (cu-coordinator 21:21Z): the rest of CU-462's shareable-link words", () => {
  const policy3 = createPolicy({ sitePolicy: () => 'allow' })
  const at = (name) => { const v = policy3.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://docs.example/d/1', target: { role: 'button', name } }); return v.decision === 'allow' ? [] : (v.classes ?? [v.class]) }
  for (const name of ['Create shareable link', 'Generate share link', 'Anyone with the link', 'Anyone with the link can edit']) assert.ok(at(name).includes('permission'), name)
  for (const name of ['Link settings', 'Restricted']) assert.deepEqual(at(name), [], name)
  assert.deepEqual(at('Share'), ['permission'], 'an older ask, unchanged')
})

test('#742 round 4 (cu-developer-three 00:10Z): the people-list family', () => {
  for (const name of ['Upload contact list', 'Sync my contacts list', 'Import mailing list', 'Export email list', 'Share customer list', 'Download subscriber lists']) assert.equal(at(name), 'permission', name)
  for (const name of ['Contact list', 'Mailing list settings']) assert.equal(at(name), 'allow', name)
  assert.equal(at('Upload file list'), 'submit', 'not a people list: the older upload row (submit) is unchanged')
})

test('CU-462 follow-up round 2 (cu-developer-three 01:26Z): the whole people-list noun slot', () => {
  for (const name of ['Upload member list', 'Export user list', 'Import guest list', 'Download attendee list', 'Sync leads list', 'Share donor list', 'Upload address list', 'Export phone list', 'Upload student list', 'Export employee list']) assert.equal(at(name), 'permission', name)
  for (const name of ['Member list', 'Guest list settings']) assert.equal(at(name), 'allow', name)
})

test("#841 round 3 (cu-developer-three 01:35Z): 'Upload user list' keeps its older submit and adds permission", () => {
  const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name: 'Upload user list' } })
  const classes = v.classes ?? [v.class]
  assert.ok(classes.includes('submit') && classes.includes('permission'), JSON.stringify(classes))
})
