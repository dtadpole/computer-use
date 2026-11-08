import assert from 'node:assert/strict'
import { test } from 'node:test'

import { replyError } from '../../_environments_/macos-desktop/helper-link.mjs'

/**
 * CU-240's driver half (helper 0.2.56): a not_granted after a grant that read true earlier in the run keeps its code -
 * every fail-closed path stays - but carries wasGranted and the re-read count, and its text stops asking the owner to
 * grant what is already on.
 */

test('CU-240 driver: not_granted with wasGranted keeps its code, carries the re-reads, and words it as a grant read true earlier', () => {
  const error = replyError('capture', { code: 'not_granted', grant: 'screen', wasGranted: true, rechecks: 3 })
  assert.equal(error.code, 'not_granted')
  assert.deepEqual(error.details, { grant: 'screen', wasGranted: true, rechecks: 3 })
  assert.match(error.message, /Screen Recording grant \(screen\) read true earlier in this run and reads false now after 3 re-reads/)
  assert.doesNotMatch(error.message, /only the owner can grant it/)
})

test('CU-240 driver: a plain not_granted, or a wasGranted that is not true, reads as a missing grant as before', () => {
  for (const reply of [{ code: 'not_granted', grant: 'screen' }, { code: 'not_granted', grant: 'screen', wasGranted: 'yes', rechecks: 3 }, { code: 'not_granted', grant: 'accessibility', wasGranted: false }]) {
    const error = replyError('capture', reply)
    assert.equal(error.code, 'not_granted')
    assert.equal(error.details.wasGranted, undefined, JSON.stringify(reply))
    assert.match(error.message, /only the owner can grant it/)
  }
  const odd = replyError('capture', { code: 'not_granted', grant: 'screen', wasGranted: true, rechecks: 'many' })
  assert.deepEqual(odd.details, { grant: 'screen', wasGranted: true }, 'a malformed count is dropped, the mark kept')
})
