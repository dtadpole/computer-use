import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy, isOAuthConsentPage } from '../../_tools_/agent-core/policy.mjs'

// CU-393: the provider's bare grant button on an OAuth consent page (or in an access-request dialog) asks permission; the same
// words elsewhere keep today's judgement; declining stays free.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (url, name, extra = {}) => { const r = policy.classify({ type: 'click', x: 5, y: 5, button: 'left' }, { url, target: { tag: 'button', role: 'button', name, ...extra } }); return r.decision === 'allow' ? 'allow' : r.class }
const PAGES = ['https://accounts.idp.example/o/oauth2/v2/auth?client_id=abc&response_type=code&scope=email', 'https://login.idp.example/common/oauth2/v2.0/authorize?client_id=abc',
  'https://code.example/login/oauth/authorize?client_id=abc&scope=repo', 'https://idp.example/connect/authorize?response_type=code&client_id=x', 'https://idp.example/consent?client_id=x']

test('CU-393: a bare grant on an OAuth consent page asks permission', () => {
  for (const url of PAGES) for (const name of ['Allow', 'Continue', 'Accept', 'Authorize', 'Approve', 'Yes, allow']) assert.equal(click(url, name), 'permission', `${url} ${name}`)
})

test('CU-393: an access-request dialog makes a bare grant ask, on any page', () => {
  assert.equal(click('https://app.example/home', 'Allow', { dialogName: 'Acme Notes wants to access your account' }), 'permission')
  assert.equal(click('https://app.example/home', 'Continue', { dialogDescription: 'Zapline is requesting permission to read your calendar.' }), 'permission')
})

test('CU-393 negatives: declining, other pages and non-consent dialogs stay as they were', () => {
  for (const name of ['Cancel', 'Deny', 'Not now', 'Back', 'Privacy policy', 'Use another account']) assert.equal(click(PAGES[0], name), 'allow', name)
  for (const url of ['https://app.example/settings', 'https://idp.example/oauth2/docs', 'https://idp.example/authorize/help']) for (const name of ['Allow', 'Continue', 'Accept']) assert.equal(click(url, name), 'allow', `${url} ${name}`)
  assert.equal(click('https://app.example/home', 'Continue', { dialogName: 'Welcome back' }), 'allow')
  assert.equal(isOAuthConsentPage('https://idp.example/o/oauth2/v2/auth'), false)
})
