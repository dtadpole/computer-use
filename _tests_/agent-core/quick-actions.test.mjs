import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-382 (Medium): a Finder Quick Action runs an owner's Automator workflow, like a Service - it asks; a menu whose
// context could not be walked asks unknown.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const FINDER = 'com.apple.finder'
const judge = (action, target, extra = {}) => { const v = policy.classify(action, { url: `app:${FINDER}`, target, ...extra }); return v.decision === 'allow' ? 'allow' : `${v.class}/${v.rule}` }

test('CU-382: a click on a Quick Actions item, a preview-pane button or a chord bound to one asks', () => {
  assert.equal(judge({ type: 'click', x: 1, y: 1, button: 'left' }, { origin: FINDER, role: 'AXMenuItem', name: 'Resize Images', quickActions: true }), 'permission/quick_action')
  assert.equal(judge({ type: 'click', x: 1, y: 1, button: 'left' }, { origin: FINDER, role: 'AXButton', name: 'Convert', quickActions: true }), 'permission/quick_action')
  assert.equal(judge({ type: 'keypress', keys: ['META', 'SHIFT', 'R'] }, { origin: FINDER, role: 'AXRow', name: 'photo' }, { boundMenuItem: { title: 'Resize Images', quickActions: true } }), 'permission/quick_action')
})

test('CU-382: an item in a menu whose context could not be walked asks unknown', () => {
  assert.equal(judge({ type: 'click', x: 1, y: 1, button: 'left' }, { origin: FINDER, role: 'AXMenuItem', name: 'Process', menuContextUnread: true }), 'unknown_target/menu:context_unread')
})

test('CU-382 negatives: an unmarked menu item keeps its rules', () => {
  assert.equal(judge({ type: 'click', x: 1, y: 1, button: 'left' }, { origin: FINDER, role: 'AXMenuItem', name: 'Get Info' }), 'allow')
})
