import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-419 (Medium): mass messages and public reviews speak for the owner to many people or publicly (submit). Click,
// Return and Space (D-106). Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://crm.example/members'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Subject', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-419: broadcasts, all-member messages, campaigns, reviews and star ratings ask submit', () => {
  for (const name of ['Broadcast', 'Message all members', 'Email all customers', 'Notify all users', 'Text all', 'Send to all', 'Schedule campaign', 'Send campaign', 'Leave review', 'Post review', 'Rate 1 star', 'Rate 5 stars']) {
    assert.equal(click(name), 'submit', name)
    assert.equal(enter(name), 'submit', `Return: ${name}`)
    assert.equal(space(name), 'submit', `Space: ${name}`)
  }
})

test('CU-419 negatives: lists, a draft campaign and broadcast settings stay free', () => {
  for (const name of ['Members', 'Campaigns', 'Reviews', 'Ratings', 'Draft campaign', 'Broadcast settings', 'Rate limits']) assert.equal(click(name), 'allow', name)
})
