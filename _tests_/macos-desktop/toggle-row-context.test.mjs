import assert from 'node:assert/strict'
import { test } from 'node:test'

import { toggleRowContextOf } from '../../_environments_/macos-desktop/environment.mjs'

// CU-763: a toggle's row context from the helper (RowContext), re-validated at the boundary in the web driver's
// { list, hints } shape - what CU-754's access-toggle rule reads.

test('CU-763: a row context the helper read passes, cleaned', () => {
  assert.deepEqual(toggleRowContextOf({ list: 'Full Disk Access', hints: [] }), { list: 'Full Disk Access', hints: [] })
  assert.deepEqual(toggleRowContextOf({ list: '  Screen &\n System Audio Recording ', hints: [] }), { list: 'Screen & System Audio Recording', hints: [] })
  assert.deepEqual(toggleRowContextOf({ list: 'Privacy', hints: ['Allow the applications below to control', '', 'x'.repeat(41), 'a', 'b', 'c'] }), { list: 'Privacy', hints: ['Allow the applications below to control', 'a', 'b'] })
})

test('CU-763: anything else is null, never guessed', () => {
  for (const value of [null, undefined, 'Full Disk Access', 42, [], { list: '' }, { list: 'x'.repeat(61) }, { hints: 'nope' }]) assert.equal(toggleRowContextOf(value), null, JSON.stringify(value))
  // A list over 60 characters is dropped, but a hint keeps the context.
  assert.deepEqual(toggleRowContextOf({ list: 'x'.repeat(61), hints: ['Camera'] }), { hints: ['Camera'] })
})
