import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-411 (High): account closure and data wipes (delete), ownership and admin grants (permission), key and token acts
// (credential). Click and Return (D-106). Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://app.example/settings/account'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Confirm', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-411: closing, terminating, resetting or wiping an account or its data asks delete', () => {
  for (const name of ['Close my account', 'Close account', 'Terminate account', 'Reset account', 'Clear data', 'Clear all data', 'Wipe data', 'Erase account', 'Factory reset']) {
    assert.equal(click(name), 'delete', name)
    assert.equal(enter(name), 'delete', `Return: ${name}`)
  }
})

test('CU-411: ownership and admin grants ask permission; key and token acts ask credential', () => {
  for (const name of ['Make owner', 'Transfer ownership', 'Make admin', 'Grant admin']) assert.equal(click(name), 'permission', name)
  for (const name of ['Rotate key', 'Regenerate key', 'Generate token', 'Create token', 'New API key', 'Revoke key', 'Revoke token']) {
    assert.equal(click(name), 'credential', name)
    assert.equal(enter(name), 'credential', `Return: ${name}`)
  }
})

test('CU-411 negatives: lists, labels, search and filter resets stay free', () => {
  for (const name of ['Account', 'Owners', 'Tokens', 'API keys', 'Data & privacy', 'Clear search', 'Clear filters', 'Reset filters', 'Reset zoom', 'Clear']) assert.equal(click(name), 'allow', name)
})

test('CU-411 near forms (11:13Z): my/your/the forms ask delete; Make co-owner permission; Rotate secret, Regenerate token, New token, Reset password credential', () => {
  for (const name of ['Close your account', 'Terminate my account', 'Reset my account', 'Clear my data', 'Clear all my data']) {
    assert.equal(click(name), 'delete', name)
    assert.equal(enter(name), 'delete', `Return: ${name}`)
  }
  assert.equal(click('Make co-owner'), 'permission')
  for (const name of ['Rotate secret', 'Regenerate token', 'New token', 'Reset password']) assert.equal(click(name), 'credential', name)
  for (const name of ['Forgot password?', 'Password', 'Reset filters', 'Clear search']) assert.equal(click(name), 'allow', name)
  const link = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'link', name: 'Reset password' } })
  assert.equal(link.decision, 'allow', 'a Reset password link (the login page) stays free')
})
