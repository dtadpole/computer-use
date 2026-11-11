import assert from 'node:assert/strict'
import { test } from 'node:test'

import { canonicalConfirm } from '../../_tools_/agent-core/phrase-grammar.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-473 (CU-469's sibling): a second line, a badge or a count after a ruled name no longer escapes the table rows - the wrapper
// comes off and the row is judged again, only when the name as written gets no class (adds only).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/pay', target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-473: a second line, a badge or a parenthetical after a ruled row asks as the row does', () => {
  for (const [wrapped, row] of [['Change direct deposit\nTakes effect immediately', 'Change direct deposit'], ['Change direct deposit Takes effect immediately', 'Change direct deposit'],
    ['Unlock battle pass New', 'Unlock battle pass'], ['Add phone key Beta', 'Add phone key'], ['Add phone key (opens in a new window)', 'Add phone key'],
    ['Change direct deposit (3)', 'Change direct deposit']]) {
    const want = click(row)
    assert.notEqual(want, 'allow', `${row} asks`)
    assert.notEqual(click(wrapped), 'allow', wrapped)
  }
  assert.equal(canonicalConfirm('Change direct deposit\nTakes effect immediately'), 'Change direct deposit')
  assert.equal(canonicalConfirm('Unlock battle pass New'), 'Unlock battle pass')
})

test('CU-473 negatives: free names with badges, counts and second lines stay free; title-case names are not split', () => {
  for (const name of ['Notifications (3)', 'Help (opens in a new window)', 'Dark mode Beta', 'Inbox New', 'Settings\nManage your account', 'View plans Compare features']) assert.equal(click(name), 'allow', name)
  assert.equal(canonicalConfirm('Change Direct Deposit'), 'Change Direct Deposit')
})

test('#609 round 2: additive - a Title-Case object is never lost to the sentence cut; CU-469 forms keep asking', () => {
  for (const [wrapped, row] of [['Turn off Safe Browsing now', 'Turn off Safe Browsing'], ['\ud83d\udd13 Login with Google', 'Login with Google'], ['Turn off Screen Time Beta', 'Turn off Screen Time']]) {
    const want = click(row)
    assert.notEqual(want, 'allow', `${row} asks`)
    assert.equal(click(wrapped), want, wrapped)
  }
})

test('#609 round 3: a trailing key hint comes off for the whole classifier', () => {
  const at = (name, url) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
  for (const [wrapped, row, url] of [['Add time \u2318\u23ce', 'Add time', 'https://parking.example/session'], ['Change direct deposit \u2318S', 'Change direct deposit', 'https://app.example/pay'],
    ['Change direct deposit Ctrl+Enter', 'Change direct deposit', 'https://app.example/pay']]) {
    const want = at(row, url)
    assert.notEqual(want, 'allow', `${row} asks`)
    assert.equal(at(wrapped, url), want, wrapped)
  }
  for (const name of ['Search \u2318K', 'Next Ctrl+Enter']) assert.equal(at(name, 'https://app.example/page'), 'allow', name)
})
