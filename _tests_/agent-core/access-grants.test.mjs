import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-423 (High): home access codes and keys, photo-library grants and 'Make <noun> public anyway' grant access
// (permission); password changes with an object between ask credential. Click, Return and Space (D-106). Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://home.example/settings'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Label', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-423: access codes, home keys, home invites, photo grants and Make <noun> public anyway ask permission', () => {
  for (const name of ['Create access code', 'Share access code', 'Add home key', 'Share home key', 'Invite to home', 'Allow access to all photos', 'Grant photo library access', 'Make Playlist Public Anyway']) {
    assert.equal(click(name), 'permission', name)
    assert.equal(space(name), 'permission', `Space: ${name}`)
  }
})

test('CU-423: password changes with an object between ask credential; the bare Change password keeps its hand-off', () => {
  for (const name of ['Change my password', 'Change account password', 'Update your password', 'Reset my password']) {
    assert.equal(click(name), 'credential', name)
    assert.equal(enter(name), 'credential', `Return: ${name}`)
  }
  const bare = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name: 'Change password' } })
  assert.equal(bare.decision, 'handoff', 'the stricter hand-off stands')
})

test('CU-423 negatives: lists, Select photos, Keep private and Limit access stay free', () => {
  for (const name of ['Access codes', 'Home keys', 'Photos', 'Select photos', 'Keep private', 'Limit access', 'Password']) assert.equal(click(name), 'allow', name)
})

test('CU-423 round 2 (16:11Z): Change / Edit / Create new access code and Allow full access ask permission; New / Add Password ask credential', () => {
  for (const name of ['Change access code', 'Edit access code', 'Create new access code', 'Allow full access']) assert.equal(click(name), 'permission', name)
  for (const name of ['New Password', 'Add Password']) {
    assert.equal(click(name), 'credential', name)
    assert.equal(enter(name), 'credential', `Return: ${name}`)
  }
  for (const name of ['Passwords', 'Access code settings']) assert.equal(click(name), 'allow', name)
})
