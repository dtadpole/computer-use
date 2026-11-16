import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-570 (cu-researcher 03:57Z): purchase CTAs by class - each verb bound to what it pays for; the nouns stay free.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name) => {
  const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://shop.example/item/1', target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-570: purchase CTAs ask purchase', () => {
  for (const name of ['Become a patron', 'Become a supporter', 'Become a paid subscriber', 'Become a founding member', 'Sponsor', 'Sponsor this project', 'Sponsor now', 'Fund this', 'Fund this project', 'Back this creator',
    'Support this creator', 'Support the artist', 'Lease now', 'Lease this car', 'Finance now', 'Finance this car', 'Charter a yacht', 'Hire this car', 'Pre-order', 'Preorder now', 'Commission this artist',
    'Grab it now', 'Grab this deal', 'Snag it now', 'Extend subscription', 'Extend my membership', 'Extend rental', 'Extend warranty', 'Extend stay', 'Get lifetime access']) assert.ok(classesOf(name).includes('purchase'), name)
})

test('CU-570 negatives: the nouns and neighbours stay free', () => {
  for (const name of ['Support', 'Contact support', 'Sponsors', 'Our sponsors', 'Backers', 'Funding', 'Grab', 'Lease terms', 'Extend', 'Extend selection', 'Hire', 'Finance', 'Finance team', 'Fund details', 'Patron benefits', 'Grab attention', 'Support center']) assert.deepEqual(classesOf(name), [], name)
})
