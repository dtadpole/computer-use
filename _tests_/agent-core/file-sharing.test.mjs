import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-425 (Medium): file-sharing near forms widen access to an owner file (permission). Click, Return and Space (D-106).
// Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://docs.example/d/1/share'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Add people', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-425: widening edit or download access asks permission', () => {
  for (const name of ['Allow anyone to edit', 'Anyone with the link can edit', 'Turn on link sharing', 'Give edit access', 'Change to editor', 'Disable download protection', 'Allow download']) {
    assert.equal(click(name), 'permission', name)
    assert.equal(enter(name), 'permission', `Return: ${name}`)
    assert.equal(space(name), 'permission', `Space: ${name}`)
  }
})

test('CU-425 negatives: settings, restricting, link sharing off, viewer and Copy link stay free', () => {
  for (const name of ['Sharing settings', 'Restrict', 'Turn off link sharing', 'Change to viewer', 'Copy link']) assert.equal(click(name), 'allow', name)
})

test('CU-425 round 2 (16:34Z): Change to owner, Enable link sharing, Anyone can edit, Allow anyone to comment / view, Give view access ask permission', () => {
  for (const name of ['Change to owner', 'Enable link sharing', 'Anyone can edit', 'Allow anyone to comment', 'Allow anyone to view', 'Give view access']) {
    assert.equal(click(name), 'permission', name)
    assert.equal(enter(name), 'permission', `Return: ${name}`)
  }
  assert.equal(click('Change to viewer'), 'allow', 'narrowing access stays free')
})
