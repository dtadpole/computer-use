import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-593: more shared / public spaces as a web drop target's whole name ask permission, as #925's do.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const drop = (name) => { const r = policy.classify({ type: 'drag', from: [10, 10], to: [200, 200] }, { url: 'https://cloud.example/files/home', target: { role: 'row', name: 'Board deck.pptx' }, dropTarget: { role: 'treeitem', name } }); return r.decision === 'allow' ? 'allow' : (r.classes ?? [r.class]).includes('permission') ? 'permission' : r.class }

test('CU-593: Public + a container noun and Shared with <group> ask permission as drop targets', () => {
  for (const name of ['Public Files', 'Public share', 'Public uploads', 'Public Documents', 'Shared with partners', 'Shared with clients', 'Shared with external users', 'Shared with the team', 'Public Files (12)']) assert.equal(drop(name), 'permission', name)
})

test('CU-593 negatives: names that are not a shared space stay free', () => {
  for (const name of ['Public relations', 'Public speaking notes', 'Shared calendar settings', 'Sharing preferences', 'My files', 'Desktop', 'Files not shared']) assert.equal(drop(name), 'allow', name)
})
