import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-414 (Medium): meeting access (permission), calls and meetings that open the camera and microphone (submit, as
// 'Answer'), ending for all (submit). Click, Return and Space (D-106). Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://meet.example/room'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Name', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-414: Admit, Admit all, Let in, Make host and Make co-host ask permission', () => {
  for (const name of ['Admit', 'Admit all', 'Let in', 'Make host', 'Make co-host']) {
    assert.equal(click(name), 'permission', name)
    assert.equal(space(name), 'permission', `Space: ${name}`)
  }
})

test('CU-414: Accept call, Join call, New meeting, Start meeting, Start call and End meeting for all ask submit', () => {
  for (const name of ['Accept call', 'Join call', 'New meeting', 'Start meeting', 'Start call', 'End meeting for all']) {
    assert.equal(click(name), 'submit', name)
    assert.equal(enter(name), 'submit', `Return: ${name}`)
  }
  assert.notEqual(click('Remove participant'), 'allow', 'Remove participant asks (its remove word already asks delete)')
})

test('CU-414 negatives: Participants, Waiting room, Leave meeting, Mute and Chat stay free', () => {
  for (const name of ['Participants', 'Waiting room', 'Leave meeting', 'Mute', 'Chat']) assert.equal(click(name), 'allow', name)
})
