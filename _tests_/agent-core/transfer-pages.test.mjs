import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-609: pages and settings named after transfers move no money; the transfer verbs still ask purchase.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => {
  const v = policy.classify({ type: 'click', x: 10, y: 10, button: 'left' }, { url: 'https://bank.fixture.example/transfers', target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-609: transfer pages and settings no longer ask purchase', () => {
  for (const name of ['Transfer history', 'Transfer limits', 'Transfer file', 'Transfer settings', 'Transfer details', 'Transfers overview', 'Transfer templates']) {
    assert.ok(!click(name).includes('purchase'), name)
  }
})

test('CU-609: every transfer verb form still asks purchase', () => {
  for (const name of ['Transfer', 'Transfer now', 'Transfer money', 'Wire transfer', 'Confirm transfer', 'Transfer to savings', 'Transfer to bank account']) {
    assert.ok(click(name).includes('purchase'), name)
  }
})
