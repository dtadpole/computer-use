import assert from 'node:assert/strict'
import { test } from 'node:test'

import { canonicalConfirm, grammarClasses } from '../../_tools_/agent-core/phrase-grammar.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-469 (High; cu-coordinator 01:19Z): 'Yes, <ruled row>' and trailing wrappers no longer escape the start-anchored table rows -
// the wrapper comes off and the row is judged again, only when the name as written gets no class (adds only).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/dialog', target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: 'https://app.example/dialog', target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-469: a confirmation prefix or trailing wrapper asks as the ruled row does', () => {
  for (const [wrapped, row] of [['Yes, change direct deposit', 'Change direct deposit'], ['OK, transfer domain', 'Transfer domain'], ['Sure, add phone key', 'Add phone key'],
    ['Confirm: add phone key', 'Add phone key'], ['Yes, add phone key now', 'Add phone key'], ['Yes - add phone key \u2192', 'Add phone key'], ['\u2705 Yes, add phone key', 'Add phone key']]) {
    const want = click(row)
    assert.notEqual(want, 'allow', `${row} asks`)
    assert.equal(click(wrapped), want, wrapped)
    assert.equal(space(wrapped), want, `Space: ${wrapped}`)
  }
})

test('CU-469: adds only - a name that already asks keeps its class; bare confirmations and wrapped free rows stay free', () => {
  for (const name of ['Yes', 'OK', 'Sure', 'Yes, continue', 'OK, got it', 'Yes, show me', 'Confirm: view details', 'Next \u2192']) assert.equal(click(name), 'allow', name)
  assert.equal(canonicalConfirm('Yes, change direct deposit now \u2192'), 'change direct deposit')
  assert.deepEqual(grammarClasses('Change direct deposit'), grammarClasses('Yes, change direct deposit'))
})

test('#600 round 2: the wrapper comes off for the whole classifier - older exact phrases and URL-bound rows read it too', () => {
  const at = (name, url) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
  for (const [wrapped, row, url] of [['Yes, allow 0.0.0.0/0', 'Allow 0.0.0.0/0', 'https://cloud.example/security'], ['OK, add time', 'Add time', 'https://parking.example/session'],
    ['Yes, edit DNS', 'Edit DNS', 'https://registrar.example/domains'], ['Yes please, change direct deposit', 'Change direct deposit', 'https://app.example/pay'],
    ['Change direct deposit right now', 'Change direct deposit', 'https://app.example/pay']]) {
    const want = at(row, url)
    assert.notEqual(want, 'allow', `${row} asks`)
    assert.equal(at(wrapped, url), want, wrapped)
  }
  // Named: 'Confirm, add deploy key' keeps the older 'confirm' submit (asks either way; the probe runs only when nothing asked).
  assert.equal(at('Confirm, add deploy key', 'https://git.example/settings'), 'submit')
})
