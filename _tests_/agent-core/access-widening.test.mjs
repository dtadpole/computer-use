import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-389: labels that widen who can reach a document or space ask permission; 'Forward my email to' asks credential as the
// CU-373 forwarding names do; narrowing options stay free.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name, extra = {}) => { const r = policy.classify({ type: 'click', x: 5, y: 5, button: 'left' }, { url: 'https://docs.example/d/abc/edit', target: { tag: 'button', role: 'button', name, ...extra } }); return r.decision === 'allow' ? 'allow' : r.class }

test('CU-389: general-access and join settings that widen access ask permission', () => {
  for (const name of ['Anyone can edit', 'Anyone can view', 'Anyone on the web can edit', 'Anyone with the link', 'Anyone with the link can comment', 'Anyone at Acme Corp can edit', 'Anyone in this workspace can view',
    'Make editor', 'Allow anyone to join', 'Allow everyone to join', 'Public on the web']) assert.equal(click(name), 'permission', name)
})

test('CU-389: a role option inside a share dialog grants it', () => {
  const dlg = { dialogName: 'Share "Q3 plan"' }
  for (const name of ['Can edit', 'Editor', 'Owner', 'Can comment']) assert.equal(click(name, dlg), 'permission', name)
  for (const name of ['Can view', 'Viewer', 'Restricted']) assert.equal(click(name, dlg), 'allow', name)
})

test('CU-389: forwarding mail to an address asks credential', () => {
  for (const name of ['Forward my email to', 'Forward all mail to', 'Forward incoming messages to']) assert.equal(click(name), 'credential', name)
})

test('CU-389 negatives: narrowing options, a bare role option outside a share dialog and help stay free', () => {
  for (const name of ['Restricted', 'Only me', 'Can view', 'Viewer', 'Can edit', 'Editor', 'Who can see this?', 'Shared with me', 'Shared folder', 'Anyone can join our newsletter', 'Anyone']) assert.notEqual(click(name), 'permission', name)
})
