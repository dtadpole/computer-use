import assert from 'node:assert/strict'
import { test } from 'node:test'

import { canonicalForms } from '../../_tools_/agent-core/phrase-grammar.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-486 (High; cu-coordinator 07:36Z): a compound spelled the other way asks as the row does - known compounds are joined and split
// both ways in the canonical forms, tried only when the name as written gets no class (adds only), through the whole classifier.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name, url = 'https://app.example/settings') => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-486: compound spellings ask as their row does', () => {
  for (const [variant, row] of [['Show my e-mail', 'Show my email'], ['Turn on Remote log-in', 'Turn on Remote login'], ['Show e-sim QR code', 'Show eSIM QR code']]) {
    const want = click(row)
    assert.notEqual(want, 'allow', `${row} asks`)
    assert.equal(click(variant), want, variant)
  }
  assert.ok(canonicalForms('Show my e-mail').includes('Show my email'))
  assert.ok(canonicalForms('Turn off autolock').includes('Turn off auto-lock'))
})

test('CU-486 negatives: compounds in free names stay free', () => {
  for (const name of ['E-mail settings', 'Log-in help', 'Set-up guide', 'Sign-in options', 'Add-ons']) assert.equal(click(name), 'allow', name)
})

test('#642 round 2 (cu-researcher 07:54Z): spaced compounds join; auto-invest both ways', () => {
  assert.equal(click('Turn on Remote log in'), click('Turn on Remote login'))
  assert.notEqual(click('Turn on Remote log in'), 'allow')
  assert.equal(click('Autoinvest'), 'purchase')
  assert.equal(click('Install plug in'), 'install')
  for (const name of ['Log in', 'Sign in', 'Check in later', 'Set up later']) assert.equal(click(name), click(name.replace(' ', '')) === 'allow' ? 'allow' : click(name), name)
})
