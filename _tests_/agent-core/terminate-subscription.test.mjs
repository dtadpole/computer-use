import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-628: terminate / stop a subscription, membership or plan asks purchase as 'End subscription' does; Chinese 退订 asks submit
// as 'Unsubscribe' does.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/account/subscription', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-628: terminate / stop subscription, membership or plan asks purchase', () => {
  for (const name of ['Terminate subscription', 'Terminate my subscription', 'Terminate membership', 'Terminate my plan', 'Stop subscription', 'Stop my subscription', 'Stop membership']) assert.ok(click(name).includes('purchase'), name)
})

test('CU-628: Chinese 退订 asks submit', () => {
  for (const name of ['退订', '退訂', '退订邮件']) assert.ok(click(name).includes('submit'), name)
})

test('CU-628 negatives: subscription pages and other stops stay free', () => {
  for (const name of ['Subscription details', 'Stop video', 'Stop sharing screen', 'Terminate session']) assert.ok(!click(name).includes('purchase'), name)
})
