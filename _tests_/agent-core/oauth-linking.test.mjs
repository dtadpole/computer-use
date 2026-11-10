import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-393 (Medium): an OAuth consent or an account link hands the account's data or identity to another service - it asks.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://auth.example/consent', target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-393: Authorize, Link bank account, Connect account and Sign in / Continue with a provider ask permission', () => {
  for (const name of ['Authorize', 'Authorize app', 'Link bank account', 'Link account', 'Connect account', 'Sign in with Google', 'Continue with Apple', 'Continue with Microsoft']) assert.equal(click(name), 'permission', name)
})

test('CU-393 negatives: a bare Allow, Sign in, Continue and a passkey sign-in keep their rules', () => {
  for (const name of ['Allow', 'Sign in', 'Continue', 'Sign in with passkey', 'Use passkey', 'Copy link']) assert.equal(click(name), 'allow', name)
})
