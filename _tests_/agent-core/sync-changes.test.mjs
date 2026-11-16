import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-403 (cu-verifier 23:42Z): an IDE's 'Sync Changes' asks submit, as 'Push' does.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const cls = (n) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { target: { role: 'AXButton', name: n, origin: 'com.microsoft.VSCode' }, frontmostBundleId: 'com.microsoft.VSCode' }); return v.decision === 'allow' ? [] : (v.classes ?? [v.class]) }

test('CU-403: Sync Changes / commits / branch ask submit, as Push does', () => {
  for (const n of ['Sync Changes', 'Sync changes 1↓ 2↑', 'Sync commits', 'Sync Branch']) assert.ok(cls(n).includes('submit'), n)
  assert.ok(cls('Push').includes('submit'))
})

test('CU-403: a bare Sync and unrelated syncs stay as they were', () => {
  for (const n of ['Sync', 'Sync calendar', 'Sync settings']) assert.ok(!cls(n).includes('submit'), n)
})
