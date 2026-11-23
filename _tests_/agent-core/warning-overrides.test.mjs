import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-421 (High): overriding a malware warning or installing a profile or helper (install), system-level control
// (permission), running a script (submit). Click, Return and Space (D-106). Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://downloads.example/file'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Name', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-421: warning overrides and profile / helper installs ask install', () => {
  for (const name of ['Open anyway', 'Run anyway', 'Keep anyway', 'Download anyway', 'Install profile', 'Install helper', 'Install configuration profile']) {
    assert.equal(click(name), 'install', name)
    assert.equal(enter(name), 'install', `Return: ${name}`)
  }
})

test('CU-421: SIP off, full disk access and accessibility ask permission; Run script submits', () => {
  for (const name of ['Disable SIP', 'Grant full disk access', 'Enable accessibility', 'Allow full disk access', 'Allow accessibility access']) {
    assert.equal(click(name), 'permission', name)
    assert.equal(space(name), 'permission', `Space: ${name}`)
  }
  assert.equal(click('Run script'), 'submit')
})

test('CU-421 negatives: Profiles and Cancel stay free; older asks stay (15:08Z): Move to Trash / Delete download delete, Privacy & Security permission', () => {
  for (const name of ['Profiles', 'Cancel']) assert.equal(click(name), 'allow', name)
  for (const name of ['Move to Trash', 'Delete download']) assert.equal(click(name), 'delete', `${name} (CU-146, unchanged)`)
  assert.equal(click('Privacy & Security'), 'allow', 'CU-429 (09:34Z): a pane name is lowered to free')
})

test('CU-421 round 2 (15:25Z): Keep dangerous file asks install; Trust / Install certificate and Always trust ask permission', () => {
  assert.equal(click('Keep dangerous file'), 'install')
  assert.equal(enter('Keep dangerous file'), 'install', 'Return: Keep dangerous file')
  for (const name of ['Trust certificate', 'Install certificate', 'Always trust']) assert.equal(click(name), 'permission', name)
  for (const name of ['Certificates', 'View certificate']) assert.equal(click(name), 'allow', name)
})
