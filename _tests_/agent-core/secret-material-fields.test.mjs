import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-581 (cu-researcher 09:58Z): typing into a box named for secret material asks; ordinary token / key / cookie words stay free.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const typed = (name) => {
  const v = policy.classify({ type: 'type', text: 'abc123' }, { url: 'https://console.example/settings', target: { role: 'textbox', name, editable: true } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-581: secret-material labels ask', () => {
  for (const name of ['API token', 'Bearer token', 'Vault token', 'Session cookie', 'Encryption key', 'SSH key', 'Bank login', 'Refresh token', 'Client secret', 'Webhook secret', 'GPG key', 'Connection string', 'Database password', 'Credentials', 'Personal access token', 'AWS secret key']) assert.notDeepEqual(typed(name), [], name)
})

test('CU-581 negatives: ordinary token / key / cookie words stay free', () => {
  for (const name of ['Search', 'Cookie recipe', 'Key word', 'Token count', 'Session name', 'Bank name', 'Keyboard shortcut', 'Primary key column']) assert.deepEqual(typed(name), [], name)
})
