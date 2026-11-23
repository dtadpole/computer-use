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

test('CU-393 r2: question-form and data-scope dialogs, and a provider consent step without client_id, ask', () => {
  assert.equal(click('https://app.example/home', 'Allow', { dialogName: 'Allow "Notes Sync" to access your Google account?' }), 'permission')
  assert.equal(click('https://app.example/home', 'Allow', { dialogName: 'Allow "Budget" to access your contacts?' }), 'permission')
  assert.equal(click('https://app.example/home', 'Allow', { dialogName: 'Grant access to your calendar' }), 'permission')
  assert.equal(click('https://app.example/home', 'Continue', { dialogDescription: 'App wants to view your contacts' }), 'permission')
  assert.equal(click('https://accounts.idp.example/signin/oauth/consent?authuser=0&part=abc', 'Allow'), 'permission')
  assert.equal(click('https://app.example/home', 'Allow', { dialogName: 'Allow pasting into this document?' }), 'allow')
  assert.equal(click('https://app.example/home', 'Continue', { dialogName: 'Terms of Service updated' }), 'allow')
})

test('CU-393 r3: the macOS wording, the Let question, consentsummary; a consent help page stays free', () => {
  assert.equal(click('https://app.example/home', 'Accept', { dialogName: 'Trello would like to read your calendar' }), 'permission')
  assert.equal(click('https://app.example/home', 'Allow', { dialogName: 'Let "Photo Mixer" see your photos?' }), 'permission')
  assert.equal(click('https://accounts.idp.example/signin/oauth/v2/consentsummary?authuser=0&part=x&flowName=GeneralOAuthFlow', 'Allow'), 'permission')
  assert.equal(click('https://accounts.idp.example/signin/oauth/consent/help', 'Allow'), 'allow')
  assert.equal(click('https://app.example/home', 'Allow', { dialogName: 'Allow this file to open?' }), 'allow')
  assert.equal(click('https://app.example/home', 'Allow', { dialogName: 'Let the export finish?' }), 'allow')
  // r4 (cu-developer-two): account linking in the dialog's words.
  assert.equal(click('https://app.example/home', 'Continue', { dialogName: 'Spotify would like to connect to your Facebook account' }), 'permission')
  assert.equal(click('https://app.example/home', 'Allow', { dialogName: 'Acme wants to link with your bank account' }), 'permission')
  assert.equal(click('https://app.example/home', 'Continue', { dialogName: 'Connecting to the server...' }), 'allow')
})

test('CU-393 negatives: declining, other pages and non-consent dialogs stay as they were', () => {
  for (const name of ['Cancel', 'Deny', 'Not now', 'Back', 'Privacy policy', 'Use another account']) assert.equal(click(PAGES[0], name), 'allow', name)
  for (const url of ['https://app.example/settings', 'https://idp.example/oauth2/docs', 'https://idp.example/authorize/help']) for (const name of ['Allow', 'Continue', 'Accept']) assert.equal(click(url, name), 'allow', `${url} ${name}`)
  assert.equal(click('https://app.example/home', 'Continue', { dialogName: 'Welcome back' }), 'allow')
  assert.equal(isOAuthConsentPage('https://idp.example/o/oauth2/v2/auth'), false)
})
