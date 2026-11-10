import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-375 (account-security leftovers), CU-385 (trash and spam drop zones), CU-389 (access widened without 'share').
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://mail.example/settings', target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const OUTLOOK = 'com.microsoft.Outlook'
const drop = (name) => { const v = policy.classify({ type: 'drag', path: [{ x: 1, y: 1 }, { x: 9, y: 9 }] }, { url: `app:${OUTLOOK}`, frontmostBundleId: OUTLOOK, target: { origin: OUTLOOK, role: 'AXRow', name: 'Invoice' }, dropTarget: { origin: OUTLOOK, role: 'AXRow', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-375: IMAP/POP access, login alerts, a bare Passkeys toggle, German app password and forwarding ask credential; a public profile asks permission', () => {
  for (const name of ['Enable IMAP', 'IMAP access', 'Enable POP', 'POP download', 'Login alerts', 'App-Passwort erstellen', 'Weiterleitungsadresse hinzuf\u00fcgen', 'Forward my email to']) assert.equal(click(name), 'credential', name)
  assert.equal(click('Make my profile public'), 'permission')
  const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://mail.example/settings', target: { role: 'switch', name: 'Passkeys' } })
  assert.equal(v.class, 'credential', 'a bare Passkeys toggle')
})

test('CU-375 negatives: protection turned on by name and passkey sign-in stay free', () => {
  for (const name of ['Turn on 2-Step Verification', 'Enable login alerts', 'Sign in with passkey', 'Passkeys', 'Pop out']) assert.equal(click(name), 'allow', name)
})

test('CU-389: access-widening labels ask permission', () => {
  for (const name of ['Anyone can edit', 'Anyone can view', 'Make editor', 'Can edit', 'Allow guests', 'Allow anyone to join', 'Shared folder']) assert.equal(click(name), 'permission', name)
})

test('CU-385: a drop on Deleted Items, Papierkorb, a Chinese trash, Junk or Spam asks delete; Archive stays free', () => {
  for (const name of ['Deleted Items', 'Papierkorb', '\u5783\u573e\u7bb1', 'Junk E-mail', 'Spam']) assert.equal(drop(name), 'delete', name)
  assert.equal(drop('Archive'), 'allow')
})
