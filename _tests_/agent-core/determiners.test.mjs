import assert from 'node:assert/strict'
import { test } from 'node:test'

import { canonicalForms } from '../../_tools_/agent-core/phrase-grammar.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-478 (High; cu-coordinator 03:51Z): a determiner after the verb no longer escapes the older exact-phrase rows - one more canonical
// form drops it, tried only when the name as written gets no class (adds only), through the whole classifier.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name, url = 'https://router.example/admin') => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-478: the determiner forms ask as their row does', () => {
  for (const [wrapped, row] of [['Update my firmware', 'Update firmware'], ['Update your firmware', 'Update firmware'], ['Accept my counteroffer', 'Accept counteroffer'],
    ['Turn on my location sharing', 'Turn on location sharing'], ['Open the ports', 'Open ports'], ['Yes, update the firmware now', 'Update firmware']]) {
    const want = click(row)
    assert.notEqual(want, 'allow', `${row} asks`)
    assert.equal(click(wrapped), want, wrapped)
  }
  assert.ok(canonicalForms('Update my firmware').includes('Update firmware'))
})

test('CU-478 negatives: free names with determiners stay free', () => {
  for (const name of ['View my account', 'Open the menu', 'Show the details', 'Go to my profile']) assert.equal(click(name), 'allow', name)
})
