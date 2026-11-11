import assert from 'node:assert/strict'
import { test } from 'node:test'

import { grammarClasses } from '../../_tools_/agent-core/phrase-grammar.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-467 (High): a pressed control that names a money amount asks purchase whatever its verb (a currency pattern, not a word
// list); paid creator and dating features ask purchase on a creator or dating page. Click, Return and Space (D-106). Both sides.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const verdict = (name, url = 'https://shop.example/checkout', role = 'button') => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role, name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: 'https://shop.example/checkout', target: { tag: 'input', role: 'textbox', name: 'Promo code', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: 'https://shop.example/checkout', target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-467: a button naming a money amount asks purchase, any verb, any currency form', () => {
  for (const name of ['Continue for $9.99', 'Confirm $12.00', 'Yes, charge $25', 'Upgrade for $3', '$4.99/month', 'Continue for 12.00 EUR', 'Pay EUR 30', 'Renew - \u00a35/mo', 'Tip \u20ac2']) {
    assert.equal(verdict(name), 'purchase', name)
    assert.equal(enter(name), 'purchase', `Return: ${name}`)
    assert.equal(space(name), 'purchase', `Space: ${name}`)
  }
  // cu-coordinator 01:04Z: a link or list item carrying a price asks only with a commit verb; a product tile stays free.
  assert.equal(verdict('Buy for $5', 'https://shop.example/item', 'link'), 'purchase', 'a commit-verb link')
  assert.equal(verdict('Subscribe for $4.99/month', 'https://shop.example/item', 'link'), 'purchase', 'a commit-verb link')
  for (const [name, role] of [['Blue mug, $12.99', 'link'], ['Continue for $9.99', 'link'], ['Blue mug, $12.99', 'listitem']]) assert.equal(verdict(name, 'https://shop.example/search', role), 'allow', `${role}: ${name}`)
  assert.equal(verdict('Continue for $9.99', 'app:com.example.store', 'AXButton'), 'purchase', 'desktop button')
})

test('CU-467 negatives: prices as text, price views, zero amounts and Free stay free', () => {
  for (const name of ['See price', 'Compare plans', '$0', 'Get it for $0.00', 'Free', 'Plans from $5']) assert.equal(verdict(name, 'https://shop.example/pricing', name === 'Plans from $5' ? 'statictext' : 'button'), 'allow', name)
  assert.deepEqual(grammarClasses('$9.99', 'statictext'), [], 'a price shown as text is not a control')
  assert.deepEqual(grammarClasses('Step 2 of 3'), [], 'a number without a currency')
  // cu-researcher 00:51Z: price filters and ranges commit nothing.
  for (const name of ['Under $25', '$10 - $20', '$10 \u2013 $20', 'Over EUR 100', 'Up to $50', '$50 and up', '$25 or less']) assert.equal(verdict(name, 'https://shop.example/search'), 'allow', name)
})

test('CU-467: paid creator and dating features ask purchase on a creator or dating page; older submit asks keep their class', () => {
  for (const [name, url] of [['Cheer', 'https://twitch.example/channel'], ['Boost', 'https://dating.example/app'], ['Get Boost', 'https://dating.example/app'],
    ['Unlock likes', 'https://dating.example/app'], ['Unlock message', 'https://dating.example/app']]) assert.equal(verdict(name, url), 'purchase', name)
  for (const [name, url] of [['Send Super Chat', 'https://video.example/live/1'], ['Send stars', 'https://social.example/live'], ['Send Bits', 'https://twitch.example/c'], ['Unlock post', 'https://patreon.example/creator']]) assert.equal(verdict(name, url), 'submit', `${name}: older submit`)
  for (const name of ['Boost', 'Cheer']) assert.equal(verdict(name, 'https://docs.example/page'), 'allow', `${name} off a creator or dating page`)
})
