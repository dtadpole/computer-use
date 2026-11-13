import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-403 (Medium): pushing code and distributing an app publish it (submit); a force push rewrites shared history
// (delete); adding a collaborator opens the repository (permission). Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const CODE = 'com.microsoft.VSCode'
const press = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: `app:${CODE}`, frontmostBundleId: CODE, target: { origin: CODE, role: 'AXButton', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-403: Push, Sync changes and app distribution ask submit; Force Push asks delete; Add collaborator asks permission', () => {
  for (const name of ['Push', 'Push origin', 'Sync changes', 'Upload to App Store', 'Distribute App', 'Submit for Review']) assert.equal(press(name), 'submit', name)
  for (const name of ['Force Push', 'Force push with lease']) assert.equal(press(name), 'delete', name)
  for (const name of ['Add collaborator', 'Invite collaborator', 'Add member', 'Add people']) assert.equal(press(name), 'permission', name)
})

test('CU-403 negatives: Push notifications and settings, Pull, Fetch and Commit message stay free', () => {
  for (const name of ['Push notifications', 'Push settings', 'Pull', 'Fetch', 'Commit message', 'Collaborators', 'Sync', 'Sync now', 'Members']) assert.equal(press(name), 'allow', name)
})
