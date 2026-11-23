import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-424 (High): OAuth grants, linked accounts, delegates and location sharing hand an outside party the owner's account,
// mail or location (permission). Click, Return and Space (D-106). Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://accounts.example/consent'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Email', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-424: OAuth grants, provider sign-ins, linked accounts, delegates and location sharing ask permission', () => {
  for (const name of ['Authorize app', 'Authorize', 'Allow access', 'Connect app', 'Sign in with Google', 'Continue with Apple', 'Continue with Google', 'Link account', 'Add delegate', 'Grant mailbox access', 'Share my location', 'Share location', 'Start sharing location', 'Continue as Jane']) {
    assert.equal(click(name), 'permission', name)
    assert.equal(enter(name), 'permission', `Return: ${name}`)
    assert.equal(space(name), 'permission', `Space: ${name}`)
  }
})

test('CU-424 negatives: lists, Stop sharing location, Cancel, Deny, bare Sign in and Continue as guest stay free', () => {
  for (const name of ['Connected apps', 'Delegates', 'Location', 'Stop sharing location', 'Cancel', 'Deny', 'Sign in', 'Continue as guest']) assert.equal(click(name), 'allow', name)
})

test('CU-424 round 2 (16:36Z): the nine near forms ask permission; network and device connects stay free', () => {
  for (const name of ['Login with Google', 'Link accounts', 'Connect to Slack', 'Connect with GitHub', 'Delegate access', 'Grant inbox access', 'Grant calendar access', 'Start sharing my location', 'Turn on location sharing']) {
    assert.equal(click(name), 'permission', name)
    assert.equal(enter(name), 'permission', `Return: ${name}`)
  }
  for (const name of ['Connect to Wi-Fi', 'Connect to printer', 'Connect to a network', 'Login', 'Location sharing']) assert.equal(click(name), 'allow', name)
})
