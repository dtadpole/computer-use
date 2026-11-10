import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createSitePolicy, isFixedDenied } from '../../_tools_/agent-core/sites.mjs'

// CU-394 follow-up (cu-coordinator 02:57Z): Chrome Remote Desktop's web client is a window onto another machine - denied on
// the browser route whatever the allow list says, like the remote_surface apps on the desktop.
test('CU-394: remotedesktop.google.com is fixed-denied, subdomains and case included, even when allowed', () => {
  for (const url of ['https://remotedesktop.google.com/access', 'https://REMOTEDESKTOP.google.com./support', 'https://x.remotedesktop.google.com/']) assert.equal(isFixedDenied(url), true, url)
  const policy = createSitePolicy({ allowed: ['https://remotedesktop.google.com'] })
  assert.deepEqual(policy('https://remotedesktop.google.com/access'), { block: 'fixed_deny' })
})

test('CU-394 negatives: other Google hosts are not fixed-denied', () => {
  for (const url of ['https://www.google.com/', 'https://docs.google.com/document/d/1', 'https://desktop.google.com/']) assert.equal(isFixedDenied(url), false, url)
})
