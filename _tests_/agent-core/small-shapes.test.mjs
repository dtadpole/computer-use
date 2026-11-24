import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-755 (cu-researcher's sweep 6): three smaller shapes that acted unasked.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const press = (url, name, extra = {}) => {
  const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', tag: 'button', name, ...extra } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class]).slice().sort()
}
const FILES = 'https://files.example/folder/42'
const COMMITS = 'https://code.example/org/repo/commits/main'
const STORE = 'https://store.example/app/pro'

test('CU-755: a glyph-only trash name asks delete', () => {
  assert.ok(press(FILES, '\u{1F5D1}').includes('delete'), "cu-researcher's row ('🗑')")
  assert.ok(press(FILES, '\u{1F5D1}\uFE0F').includes('delete'), "cu-researcher's row ('🗑️', with the emoji selector)")
  assert.ok(press(FILES, '\u{1F6AE}').includes('delete'), 'the litter-bin glyph')
  assert.deepEqual(press(FILES, '\u{1F50D}'), [], 'a search glyph stays free')
})

test('CU-755: resetting a branch to a commit asks delete', () => {
  assert.ok(press(COMMITS, 'Reset branch to this commit').includes('delete'), "cu-researcher's row")
  assert.ok(press(COMMITS, 'Reset current branch to here').includes('delete'), "a branch to 'here'")
  assert.ok(press(COMMITS, 'Hard reset').includes('delete'), 'a hard reset')
  assert.ok(press(COMMITS, 'Reset to this commit').includes('delete'), 'no object')
  assert.deepEqual(press(COMMITS, 'Reset filters'), [], 'a filter reset stays free')
  assert.deepEqual(press(COMMITS, 'Reset zoom to 100%'), [], 'a zoom reset stays free')
})

test('CU-755: a store commit in a priced sheet asks purchase', () => {
  assert.ok(press(STORE, 'Install', { dialogName: 'Confirm with Touch ID', dialogDescription: 'Pro Upgrade - $9.99' }).includes('purchase'), "cu-researcher's row")
  assert.ok(press(STORE, 'Buy', { dialogName: 'Pro Upgrade', dialogDescription: '$4.99 per month.' }).includes('purchase'), 'the price in the description')
  assert.ok(!press(STORE, 'Install', { dialogName: 'Install update?', dialogDescription: 'Version 2.1 is ready.' }).includes('purchase'), 'no price, no purchase')
  assert.ok(!press(STORE, 'Get', { dialogName: 'Get the newsletter', dialogDescription: 'Weekly tips by email.' }).includes('purchase'), 'no price, no purchase')
})
