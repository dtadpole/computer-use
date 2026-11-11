import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-488: a verb-only control beside its setting's label asks as the full row does - the driver's target.caption completes the name in
// one more canonical form, tried last (adds only), through the whole classifier.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name, caption) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/security', target: { role: 'button', name, ...(caption ? { caption } : {}) } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-488: a verb-only control with a caption asks as its full row', () => {
  for (const [verb, caption] of [['Turn off', 'Two-factor authentication'], ['Enable', 'Remote management'], ['Show', 'Seed phrase']]) {
    const want = click(`${verb} ${caption}`)
    assert.notEqual(want, 'allow', `${verb} ${caption} asks`)
    assert.equal(click(verb, caption), want, `${caption} [${verb}]`)
  }
})

test('CU-488 negatives: free captions, no caption, and named controls stay as they were', () => {
  assert.equal(click('Edit', 'Display name'), 'allow')
  assert.equal(click('Show', 'Notifications'), 'allow')
  assert.equal(click('Turn off'), 'allow', 'no caption - unchanged')
  assert.equal(click('Save changes', 'Two-factor authentication'), click('Save changes'), 'a named control ignores its caption')
})
