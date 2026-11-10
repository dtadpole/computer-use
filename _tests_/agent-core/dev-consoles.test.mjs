import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-417 (High): dev and cloud consoles - destroying data or infrastructure (delete), keys (credential), access
// (permission), launching resources (purchase), deploying to production (submit). Click, Return and Space (D-106). Both
// sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://console.example/project'
const click = (name, role = 'button') => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role, name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Confirm', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-417: drop, terminate, delete cluster, Destroy and Force push ask delete', () => {
  for (const name of ['Drop database', 'Drop table', 'Terminate instance', 'Delete cluster', 'Destroy', 'Force push']) {
    assert.equal(click(name), 'delete', name)
    assert.equal(enter(name), 'delete', `Return: ${name}`)
  }
})

test('CU-417: keys ask credential; collaborators and branch protection ask permission; launches ask purchase; deploy to production submits', () => {
  for (const name of ['Add SSH key', 'Add deploy key', 'Create access key']) {
    assert.equal(click(name), 'credential', name)
    assert.equal(space(name), 'credential', `Space: ${name}`)
  }
  for (const name of ['Add collaborator', 'Disable branch protection', 'Make public', 'Grant access']) assert.equal(click(name), 'permission', name)
  for (const name of ['Launch instance', 'Create instance', 'Create cluster']) {
    assert.equal(click(name), 'purchase', name)
    assert.equal(enter(name), 'purchase', `Return: ${name}`)
  }
  assert.equal(click('Deploy to production'), 'submit')
})

test('CU-417 negatives: lists, Settings and a Destroy link stay free', () => {
  for (const name of ['Databases', 'Instances', 'SSH keys', 'Collaborators', 'Branches', 'Settings']) assert.equal(click(name), 'allow', name)
  assert.equal(click('Destroy', 'link'), 'allow', 'a Destroy link (docs) stays free')
})

test('CU-417 (14:12Z): Rotate, Regenerate and Reset credentials ask credential', () => {
  for (const name of ['Rotate credentials', 'Regenerate credentials', 'Reset credentials']) {
    assert.equal(click(name), 'credential', name)
    assert.equal(enter(name), 'credential', `Return: ${name}`)
  }
  assert.equal(click('Credentials'), 'allow')
})
