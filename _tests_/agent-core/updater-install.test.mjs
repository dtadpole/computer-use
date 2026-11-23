import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-407: an app updater's buttons install new code - install, on the desktop route only.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const desk = (name, extra = {}) => { const r = policy.classify({ type: 'click', x: 5, y: 5, button: 'left' }, { url: 'desktop://', frontmostBundleId: 'com.example.editor', target: { role: 'AXButton', name, origin: 'com.example.editor', ...extra } }); return r.decision === 'allow' ? 'allow' : r.class }
const web = (name) => { const r = policy.classify({ type: 'click', x: 5, y: 5, button: 'left' }, { url: 'https://app.example/settings', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? 'allow' : r.class }

test('CU-407: updater buttons ask install on the desktop route', () => {
  for (const name of ['Update Now', 'Update and Restart', 'Update & Relaunch', 'Download and Install', 'Download & Install now', 'Update All', 'Update all extensions', 'Update All Plugins']) assert.equal(desk(name), 'install', name)
})

test('CU-407 negatives: postponing, notes, a bare Update, a web form and a web-area control stay as they were', () => {
  for (const name of ['Later', 'Skip This Version', 'Remind Me Later', 'Release notes', 'Update', 'Check for Updates', 'Automatically update']) assert.equal(desk(name), 'allow', name)
  for (const name of ['Update Now', 'Update all', 'Download and Install']) assert.equal(web(name), 'allow', `web ${name}`)
  assert.equal(desk('Update Now', { inWebArea: true }), 'allow')
})
