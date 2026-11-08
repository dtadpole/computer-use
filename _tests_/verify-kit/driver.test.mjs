import assert from 'node:assert/strict'
import { test } from 'node:test'

import { launchRefusal } from '../../_tools_/verify-kit/driver.mjs'

test('launchRefusal names a refused launch and nothing else', () => {
  assert.equal(launchRefusal({ status: 'error', error: 'resource_refused: the team already runs 2 browsers' }), 'resource_refused: the team already runs 2 browsers')
  assert.equal(launchRefusal({ status: 'error', error: 'sandbox_unavailable: no sandbox' }), null)
  assert.equal(launchRefusal({ status: 'completed' }), null)
  assert.equal(launchRefusal(undefined), null)
})
