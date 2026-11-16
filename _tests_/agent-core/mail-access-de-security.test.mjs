import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-375: switching on IMAP / POP / SMTP access asks permission; the German app-password and forwarding names ask credential
// as their English twins do; turning German forwarding off stays free.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 5, y: 5, button: 'left' }, { url: 'https://mail.example/settings', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? 'allow' : r.class }

test('CU-375: enabling IMAP, POP or SMTP access asks permission', () => {
  for (const name of ['Enable IMAP', 'Enable POP', 'Enable IMAP/POP', 'Enable POP for all mail', 'Turn on IMAP access', 'Allow SMTP', 'Activate POP3']) assert.equal(click(name), 'permission', name)
})

test('CU-375: German app-password and forwarding names ask credential', () => {
  for (const name of ['App-Passwort erstellen', 'App Passwort', 'Anwendungsspezifisches Passwort', 'Weiterleitungsadresse hinzufügen', 'Weiterleitung aktivieren', 'Automatische Weiterleitung']) assert.equal(click(name), 'credential', name)
})

test('CU-375 negatives: pop-ups, mail settings pages and German forwarding off stay free', () => {
  for (const name of ['Enable pop-ups', 'Enable pop-up blocker', 'Allow pop ups', 'IMAP settings', 'POP server', 'Disable IMAP', 'Weiterleitung deaktivieren', 'Weiterleitung ausschalten', 'Passwort vergessen?', 'Weiter']) assert.equal(click(name), 'allow', name)
})
