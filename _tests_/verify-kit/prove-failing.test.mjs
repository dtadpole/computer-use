import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { newProfiles, outcomeOf, seatProfiles, summarize } from '../../_tools_/verify-kit/prove-failing.mjs'

describe('prove-failing', () => {
  test('only verdict 1 catches a mutant; 0 misses it and 3 leaves it unjudged', () => {
    assert.equal(outcomeOf(1), 'caught')
    assert.equal(outcomeOf(0), 'missed')
    assert.equal(outcomeOf(3), 'unjudged')
    assert.equal(outcomeOf(2), 'unjudged')
  })

  test('the proof holds only when every mutant was caught', () => {
    assert.deepEqual(summarize([{ name: 'a', outcome: 'caught' }, { name: 'b', outcome: 'caught' }]), { caught: ['a', 'b'], missed: [], unjudged: [], ok: true })
    assert.equal(summarize([{ name: 'a', outcome: 'caught' }, { name: 'b', outcome: 'missed' }]).ok, false)
    assert.equal(summarize([{ name: 'a', outcome: 'unjudged' }]).ok, false)
    assert.equal(summarize([]).ok, false, 'no mutants proves nothing')
  })

  test('leaked profiles are the new, well-formed ones of this seat only', () => {
    const list = () => ['cu-verifier-chrome-AbC123', 'cu-verifier-chrome-NeW456', 'cu-developer-two-chrome-XyZ789', 'cu-verifier-chrome-bad', 'other']
    assert.deepEqual(seatProfiles('cu-verifier', list), ['/tmp/cu-verifier-chrome-AbC123', '/tmp/cu-verifier-chrome-NeW456'])
    assert.deepEqual(newProfiles(['/tmp/cu-verifier-chrome-AbC123'], seatProfiles('cu-verifier', list)), ['/tmp/cu-verifier-chrome-NeW456'])
    assert.deepEqual(newProfiles([], []), [])
  })
})
