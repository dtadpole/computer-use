import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ERROR_CODES, EnvironmentError, invalid } from '../../_environments_/chrome-browser/errors.mjs'

test('error codes include the design 0.4 names and refuse unknown codes', () => {
  for (const code of ['invalid_argument', 'unsupported_action', 'blocked_by_policy', 'dialog_open', 'taken_over', 'cancelled',
    'timeout', 'browser_crashed', 'closed', 'resource_refused', 'sandbox_unavailable']) {
    assert.ok(ERROR_CODES.includes(code), code)
  }
  assert.ok(!ERROR_CODES.includes('human_in_control'), 'replaced by taken_over')
  assert.throws(() => new EnvironmentError('oops', 'x'), TypeError)
})

test('an EnvironmentError carries its code, model-safe message and optional details', () => {
  const error = invalid('point (5, 5) is outside the 4x4 screenshot', { index: 2 })
  assert.ok(error instanceof Error)
  assert.equal(error.name, 'EnvironmentError')
  assert.equal(error.code, 'invalid_argument')
  assert.deepEqual(error.details, { index: 2 })
  assert.equal(new EnvironmentError('closed', 'closed').details, undefined)
})
