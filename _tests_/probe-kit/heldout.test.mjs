import assert from 'node:assert/strict'
import { test } from 'node:test'

import { measure, summary } from '../../_tools_/probe-kit/heldout.mjs'

// Part of CU-458: the held-out runner kept on the kit - web, dialog and desktop items, alternatives 'a|b', and an
// out-of-scope item reported apart.
const SITE = 'https://app.fixture.example/settings/account'

test('web items: an asking item in class, a free item free, and the miss and over-ask lists', () => {
  const r = measure({ ask: [['delete', 'Delete account', SITE], ['purchase|delete', 'Empty trash', SITE], ['credential', 'View profile', SITE]], free: [['View profile', SITE], ['Delete account', SITE]] })
  assert.equal(r.counted, 3); assert.equal(r.inClass, 2); assert.equal(r.misses.length, 1)
  assert.equal(r.freeOk, 1); assert.equal(r.overAsks.length, 1)
  assert.match(summary(r), /^HELD-OUT ask 2\/3 \(in class 2\); free 1\/2/)
})

test('an out-of-scope item is reported apart and not counted', () => {
  const r = measure({ ask: [['delete', 'Delete account', SITE], ['credential', 'View profile', SITE]], free: [], out_of_scope: ['View profile'] })
  assert.equal(r.counted, 1); assert.equal(r.apart.length, 1)
})

test('a dialog item reads the title (CU-507) and a desktop item goes through the desk policy', () => {
  const r = measure({ ask: [['delete', 'Continue', SITE, { title: 'Delete account?' }], ['delete', 'Continue', 'app:com.example.console', { title: 'Delete 3 projects?' }]], free: [['Continue', SITE, { title: 'Welcome back' }]] })
  assert.equal(r.inClass, 2, r.misses.join(' | ')); assert.equal(r.freeOk, 1)
})
