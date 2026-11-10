import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-381 (High: Delete/Backspace on a page body deleted rows live): with no text entry focused the key reaches the page's
// own handler - it asks delete.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const press = (keys, target) => { const v = policy.classify({ type: 'keypress', keys }, { url: 'https://mail.example/inbox', target }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-381: Delete or Backspace with a null, role-less or body focus asks delete', () => {
  for (const target of [null, { name: '' }, { role: 'document', name: 'Inbox' }, { role: 'generic', name: '' }]) {
    assert.equal(press(['DELETE'], target), 'delete', JSON.stringify(target))
    assert.equal(press(['BACKSPACE'], target), 'delete', JSON.stringify(target))
  }
})

test('CU-381 negatives: Backspace in a text field and on the desktop route keep their rules', () => {
  assert.equal(press(['BACKSPACE'], { tag: 'input', role: 'textbox', name: 'Search', editable: true }), 'allow')
  assert.equal(policy.classify({ type: 'keypress', keys: ['BACKSPACE'] }, { url: 'app:com.apple.TextEdit', target: { role: 'AXTextArea', name: 'doc', editable: true } }).decision, 'allow')
})
