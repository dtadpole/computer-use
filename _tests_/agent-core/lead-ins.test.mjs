import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-482 (CU-469's sibling): a call-to-action lead-in before a ruled row comes off in the canonical form - tried only when the name as
// written gets no class (adds only), through the whole classifier.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/settings', target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-482: lead-ins before a ruled row ask as the row does', () => {
  for (const [wrapped, row] of [['Tap to change direct deposit', 'Change direct deposit'], ['Click here to show seed phrase', 'Show seed phrase'], ['I want to turn off spam filter', 'Turn off spam filter'],
    ["Let's unlock domain", 'Unlock domain'], ['Go ahead and add phone key', 'Add phone key'], ['Please change direct deposit', 'Change direct deposit']]) {
    const want = click(row)
    assert.notEqual(want, 'allow', `${row} asks`)
    assert.equal(click(wrapped), want, wrapped)
  }
})

test('CU-482 negatives: lead-ins before free rows stay free', () => {
  for (const name of ['Click to view details', 'Tap to see more', "Let's go", 'I want to learn more']) assert.equal(click(name), 'allow', name)
})
