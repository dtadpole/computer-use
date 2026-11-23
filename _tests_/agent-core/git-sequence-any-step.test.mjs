import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-597: a sequence whose last step is push asks submit whatever its leading steps are; a last 'sync' asks with a git object.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const desk = (name) => { const r = policy.classify({ type: 'click', x: 5, y: 5, button: 'left' }, { url: 'desktop://', frontmostBundleId: 'com.example.ide', target: { role: 'AXButton', name, origin: 'com.example.ide' } }); return r.decision === 'allow' ? 'allow' : r.class }

test('CU-597: any leading steps before a push, or a sync with a git object, ask submit', () => {
  for (const name of ['Reword, then push', 'Undo last commit and push', 'Stage all, commit and push', 'Format, then push', 'Bump version and push', 'Rename branch and push',
    'Edit, then sync changes', 'Rebuild & push to origin']) assert.equal(desk(name), 'submit', name)
})

test('CU-597 negatives: no push / sync step, a bare last sync, and push notifications stay free', () => {
  for (const name of ['Reword commit', 'Stage all', 'Undo last commit', 'Save and sync', 'Sign in and sync', 'Enable push notifications', 'Allow push notifications', 'Pull, then rebase']) assert.equal(desk(name), 'allow', name)
})
