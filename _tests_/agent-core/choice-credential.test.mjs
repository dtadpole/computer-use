import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-388 (High: ArrowDown onto Gmail's 'Forward a copy of incoming mail to' radio turned forwarding on unasked): a choice
// reached by key is judged like a click on it, CU-373's account-security names included.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const arrow = (name, role = 'radio') => { const v = policy.classify({ type: 'keypress', keys: ['ARROWDOWN'] }, { url: 'https://mail.example/settings', target: { tag: 'input', inputType: role, role, name, selectOption: true } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-388: an account-security choice reached by ArrowDown asks credential', () => {
  for (const name of ['Forward a copy of incoming mail to', 'Automatically forward', 'App passwords', 'Two-factor authentication']) assert.equal(arrow(name), 'credential', name)
  assert.equal(arrow('Forward a copy of incoming mail to', 'option'), 'credential', 'a select option too')
})

test('CU-388 negatives: the safe directions by name and ordinary choices stay free', () => {
  for (const name of ['Disable forwarding', 'Forwarding off', 'Turn on 2-Step Verification', 'Conversation view on', 'Display density: Compact']) assert.equal(arrow(name), 'allow', name)
})
