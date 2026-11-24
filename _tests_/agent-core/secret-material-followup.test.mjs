import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-710 (cu-researcher's D-112 follow-up to CU-581): further secret-material labels by class ask; near collisions stay free.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const typed = (name) => {
  const v = policy.classify({ type: 'type', text: 'abc123' }, { url: 'https://console.example/settings', target: { role: 'textbox', name, editable: true } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-710: keys by algorithm, vendor tokens with a role word, bot tokens and cookie / authorization headers ask', () => {
  for (const name of ['HMAC key', 'Slack bot token', 'Cookie header', 'AES key', 'RSA key', 'Ed25519 key', 'Shared key', 'Discord bot token', 'Telegram bot token', 'GitHub app secret', 'Stripe signing secret', 'Twilio auth token', 'Bot token', 'Authorization header', 'Cookie string', 'Set-Cookie header']) {
    assert.ok(typed(name).length > 0, `asks: ${name}`)
  }
})

test('CU-710 near collisions stay free: preferences, names and settings beside the same words', () => {
  for (const name of ['Cookie preferences', 'Cookie settings', 'Cookie consent', 'Header text', 'Key name', 'HMAC algorithm', 'Bot name', 'Slack channel', 'Slack workspace', 'Discord username', 'Token name', 'Request header name', 'Shared folder', 'RSA bits']) {
    assert.deepEqual(typed(name), [], `free: ${name}`)
  }
})
