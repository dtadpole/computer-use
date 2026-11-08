import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'

// CU-277 (cu-coordinator: High; CU-278 its duplicate): Writing Tools acts outside the approved app on the owner's
// selection, so its items are refused like the Services items (CU-249).
const FIXTURE = 'ai.reflection.cu.fixture'
const policy = createAppPolicy({ scope: [FIXTURE] })
policy.grantScope(FIXTURE, { approved: true, answeredBy: 'api' })
const click = { type: 'click', x: 1, y: 1, button: 'left' }
const item = (name, menuPath) => policy.classify(click, { frontmostBundleId: FIXTURE, target: { origin: FIXTURE, role: 'AXMenuItem', name, fingerprint: 'm', ...(menuPath ? { menuPath } : {}) } })

test('CU-277: any item under a Writing Tools parent is refused, generic titles included', () => {
  for (const name of ['Proofread', 'Rewrite', 'Friendly', 'Professional', 'Concise', 'Summary', 'Key Points', 'List', 'Table', 'Compose…']) {
    for (const menuPath of [['Writing Tools', name], ['Edit', 'Writing Tools', name]]) {
      const v = item(name, menuPath)
      assert.deepEqual([v.decision, v.rule], ['block', 'writing_tools'], `${menuPath.join(' > ')}`)
    }
  }
})

test('CU-277: with no path read, the unambiguous titles and any item naming another AI are refused by title', () => {
  // 'Writing Tools Settings…' opens an owner setting (System Settings), refused as well.
  for (const name of ['Proofread', 'Rewrite', 'Show Writing Tools', 'Writing Tools', 'Writing Tools Settings…', 'Compose with ChatGPT', 'Ask Gemini', 'Send to Copilot']) {
    assert.deepEqual([item(name).decision, item(name).rule], ['block', 'writing_tools'], name)
  }
})

test('CU-277 negatives: an app\'s own Table, List, Summary or Compose outside Writing Tools stays as before', () => {
  for (const [name, menuPath] of [['Table', ['Format', 'Table']], ['List', ['View', 'List']], ['Summary', null], ['Compose', ['File', 'Compose']]]) {
    assert.notEqual(item(name, menuPath ?? undefined).rule, 'writing_tools', `${name}`)
  }
})
