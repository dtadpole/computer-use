import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-407 (Medium): an approved app's own extension, plug-in or update install is the App Store's act without the store
// (CU-254's install class); a web store's 'Add to Chrome' too. Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const CODE = 'com.microsoft.VSCode'
const desk = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: `app:${CODE}`, frontmostBundleId: CODE, target: { origin: CODE, role: 'AXButton', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const web = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://store.example/detail/x', target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-407: Install Extension / Plugin / and Relaunch, Update Now, Install Update, Restart to Update ask install; web Add to Chrome too', () => {
  for (const name of ['Install Extension', 'Install Plugin', 'Install plug-in', 'Install and Relaunch', 'Update Now', 'Install Update', 'Install Updates', 'Restart to Update']) assert.equal(desk(name), 'install', name)
  for (const name of ['Add to Chrome', 'Add extension']) assert.equal(web(name), 'install', name)
})

test('CU-407 negatives: Extensions, Plugins, Check for Updates and Release notes stay free', () => {
  for (const name of ['Extensions', 'Plugins', 'Check for Updates', 'Release notes', 'Installed', 'Update profile']) assert.equal(desk(name), 'allow', name)
})
