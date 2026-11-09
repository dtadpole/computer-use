import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-377 (High pending a live row): a desktop drag into another app hands it what was pressed - it asks, failing closed
// when either end's app is unknown; a drag inside one app stays free.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const drag = (from, to) => {
  const v = policy.classify({ type: 'drag', path: [{ x: 10, y: 10 }, { x: 400, y: 300 }] }, { url: 'app:com.apple.finder', target: from, dropTarget: to })
  return v.decision === 'allow' ? 'allow' : v.class
}
const FILE = { origin: 'com.apple.finder', role: 'AXRow', name: 'report.pdf' }

test('CU-377: a file dragged from Finder into Slack or Mail asks; an unknown end asks too', () => {
  assert.equal(drag(FILE, { origin: 'com.tinyspeck.slackmacgap', role: 'AXGroup', name: 'Message' }), 'permission')
  assert.equal(drag(FILE, { origin: 'com.apple.mail', role: 'AXTextArea', name: '' }), 'permission')
  assert.equal(drag(FILE, null), 'permission', 'a drop point that could not be read')
  assert.equal(drag({ role: 'AXRow', name: 'report.pdf' }, { origin: 'com.apple.mail', role: 'AXGroup' }), 'permission', 'an unknown source app')
})

test('CU-377 negatives: a drag inside one app and a drag that does not travel stay as judged', () => {
  assert.equal(drag({ origin: 'com.tinyspeck.slackmacgap', role: 'AXRow', name: 'general' }, { origin: 'com.tinyspeck.slackmacgap', role: 'AXRow', name: 'random' }), 'allow', 'a reorder inside Slack')
  const v = policy.classify({ type: 'drag', path: [{ x: 10, y: 10 }] }, { url: 'app:com.apple.finder', target: FILE, dropTarget: null })
  assert.equal(v.decision, 'allow', 'a press-and-hold that does not travel')
  assert.equal(policy.classify({ type: 'drag', path: [{ x: 1, y: 1 }, { x: 9, y: 9 }] }, { url: 'https://example.com/', target: FILE, dropTarget: null }).rule === 'class:permission', false, 'the browser route keeps its own drop block')
})
