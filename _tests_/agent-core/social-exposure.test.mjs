import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-497 (High; cu-coordinator 11:49Z): profile exposure and account links ask permission. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://social.example/settings/privacy'
const at = (name, key = false) => {
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } })
  return v.decision === 'allow' ? 'allow' : v.class
}

test('CU-497: exposure and account links ask permission', () => {
  for (const name of ['Make phone number visible', 'Let anyone find me by phone', 'Let anyone find me by email', 'Turn on location in posts', 'Show my location', 'Link Instagram account', 'Connect Instagram', 'Link Spotify account']) {
    assert.equal(at(name), 'permission', name)
    assert.equal(at(name, true), 'permission', `Space: ${name}`)
  }
})

test('CU-497 negatives: privacy settings, the picker, hiding, and lowercase links stay free', () => {
  for (const name of ['Privacy settings', 'Who can see my phone number', 'Hide phone number', 'Link copied', 'Connect', 'Show my posts']) assert.equal(at(name), 'allow', name)
  assert.equal(at('Link a billing account'), 'purchase', 'the older #563 billing-link row keeps its class')
})

test('#672 round 2 (cu-researcher 12:00Z): the held-out escapes fold', () => {
  for (const name of ['Show phone number on profile', 'Show my location to everyone', 'Share location with everyone', 'Display email publicly']) assert.equal(at(name), 'permission', name)
  for (const name of ['Show location history', 'Phone number']) assert.equal(at(name), 'allow', name)
})
