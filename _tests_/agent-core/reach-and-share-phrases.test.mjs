import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-378 (publishing and reaching people) and CU-379 (opening a file to others, handing over ownership), as whole phrases.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://social.example/', target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-378: repost, friend and join requests, a specific reject and an RSVP ask', () => {
  for (const name of ['Repost', 'Retweet', 'Add friend', 'Request to join', 'Reject friend request', 'Yes, going', 'Reject changes', 'Decline request', 'Going', 'Not going']) assert.equal(click(name), 'submit', name)
})

test('CU-379: link sharing, collaborators and ownership ask', () => {
  for (const name of ['Anyone with the link', 'Public on the web', 'Add people', 'Add collaborators', 'Collaborate', 'Change owner', 'Get link', 'Create link', 'Copy iCloud Link']) assert.equal(click(name), 'permission', name)
  assert.equal(click('Transfer ownership'), 'permission', 'ownership, not a payment')
})

test('CU-378/379 negatives: a bare Reject, Reject all, Copy link and Accept stay free (named limits)', () => {
  for (const name of ['Reject', 'Reject all', 'Accept all', 'Copy link', 'Accept', 'Keep going', 'Endorse']) assert.equal(click(name), 'allow', name)
})
