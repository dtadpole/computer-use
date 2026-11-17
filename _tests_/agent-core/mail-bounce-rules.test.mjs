import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-399 (Low): Mail's 'Bounce' sends a reply to the sender (submit); 'Apply Rules' may delete, forward or run a script (permission).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const MAIL = 'com.apple.mail'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: `app:${MAIL}`, frontmostBundleId: MAIL, target: { origin: MAIL, role: 'AXMenuItem', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-399: Bounce asks submit; Apply Rules asks permission', () => {
  assert.equal(click('Bounce'), 'submit')
  assert.equal(click('Apply Rules'), 'permission')
})

test('CU-399 negatives: Rules, Mark as Read and an analytics Bounce rate stay free', () => {
  for (const name of ['Rules', 'Mark as Read', 'Bounce rate']) assert.equal(click(name), 'allow', name)
})

test('CU-399 r2 (cu-researcher 02:19Z): Bounce Message and Redirect ask submit, with or without an ellipsis', () => {
  for (const name of ['Bounce Message', 'Bounce…', 'Redirect', 'Redirect…', 'Redirect Message']) assert.equal(click(name), 'submit', name)
  for (const name of ['Rules…', 'Forward', 'Move to', 'Redirect URL']) assert.notEqual(click(name), 'submit', name)
})

test('CU-399 r3 (cu-developer-two 03:06Z): Outlook\'s Run rules now and its twins ask permission', () => {
  for (const name of ['Run rules now', 'Run Rules', 'Run all rules', 'Apply rules now']) assert.equal(click(name), 'permission', name)
  for (const name of ['Rules', 'Manage rules', 'Rule settings']) assert.notEqual(click(name), 'permission', name)
})
