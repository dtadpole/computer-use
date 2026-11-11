import assert from 'node:assert/strict'
import { test } from 'node:test'

import { checkLowering } from '../../_tools_/probe-kit/lowering-check.mjs'

// Part of CU-458: the CU-429-style check kept on the kit. On today's tree a free name passes as LOWER, an asking name passes
// as KEEP, and a name with its class passes as CLASS; the opposite of each fails the whole check.
const SITE = 'https://app.fixture.example/settings/account'

test('a ruling that matches the tree is ok', () => {
  const r = checkLowering({ lower: [{ name: 'View profile', site: SITE }], keep: [{ name: 'Delete account', site: SITE }], classes: [{ name: 'Delete account', site: SITE, want: 'delete' }] })
  assert.equal(r.ok, true, JSON.stringify(r))
})

test('an asking LOWER item, a free KEEP item or a wrong CLASS each fail the check', () => {
  assert.equal(checkLowering({ lower: [{ name: 'Delete account', site: SITE }], keep: [] }).ok, false)
  assert.equal(checkLowering({ lower: [], keep: [{ name: 'View profile', site: SITE }] }).ok, false)
  assert.equal(checkLowering({ classes: [{ name: 'Delete account', site: SITE, want: 'purchase' }] }).ok, false)
})

test('link and desktop items are judged on their own shape', () => {
  const r = checkLowering({ keep: [{ name: 'Delete account', site: SITE, role: 'link' }, { name: 'Delete account', app: 'com.example.console' }] })
  assert.equal(r.keep.length, 2)
  for (const x of r.keep) assert.equal(typeof x.verdict, 'string')
})
