import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// Open-menu focus (cu-coordinator 22:03Z): with a menu open the helper reads only the system-wide focus, so Return or Space
// commits a highlighted item the policy cannot see - it asks unknown_target.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const press = (keys, target) => { const v = policy.classify({ type: 'keypress', keys }, { url: 'app:ai.reflection.cu.fixture', target }); return v.decision === 'allow' ? 'allow' : `${v.class}/${v.rule}` }

test('Return or Space with a menu open (menuOpen, or the focus is the AXMenu) asks unknown_target', () => {
  assert.equal(press(['ENTER'], { role: 'AXMenu', name: 'File' }), 'unknown_target/menu:open_unread')
  assert.equal(press(['SPACE'], { role: 'AXGroup', name: 'Canvas', menuOpen: true }), 'unknown_target/menu:open_unread')
})

test('negatives: arrows in an open menu, and Return with no menu open, keep their rules', () => {
  assert.equal(press(['ARROWDOWN'], { role: 'AXMenu', name: 'File' }), 'allow')
  assert.notEqual(press(['ENTER'], { role: 'AXTextField', name: 'Notes', editable: true }), 'unknown_target/menu:open_unread')
})
