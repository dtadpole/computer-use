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

test('#853 round 2 (cu-researcher 04:39Z): the class - other funding verbs, keeping a paid membership, taking a priced deal', () => {
  for (const name of ['Bankroll this project', 'Underwrite this campaign', 'Endow the project', 'Subsidize this creator', 'Crowdfund this project', 'Chip in for this project', 'Pitch in to the campaign', 'Invest in this project', 'Patronize this artist',
    'Keep my membership', 'Continue subscription', 'Resume my subscription', 'Reactivate membership', 'Retain premium', 'Stay subscribed', 'Stay a member', 'Remain a supporter', 'Rejoin premium',
    'Take the deal', 'Take this offer', 'Get the deal', 'Grab the discount', 'Lock in this deal', 'Activate the offer', 'Take the special offer', 'Accept discount']) assert.ok(classesOf(name).includes('purchase'), name)
  for (const name of ['Keep my settings', 'Continue reading', 'Resume playback', 'Stay signed in', 'Take a photo', 'Accept cookies', 'Get the app', 'Deals', 'Offers', 'Invest', 'Crowdfunding']) assert.ok(!classesOf(name).includes('purchase'), name)
})

test('#853 round 3 (cu-researcher 08:14Z): concrete objects - handles, named people, concrete vehicles', () => {
  for (const name of ['Sponsor @octocat', 'Fund @alice-dev', 'Sponsor Jane Doe', 'Lease the 2024 Model Y', 'Finance a 2023 Civic', 'Charter the Sea Breeze', 'Rent the Lakeside Cabin']) assert.ok(classesOf(name).includes('purchase'), name)
  for (const name of ['Lease terms', 'Finance team', 'Sponsor logo', 'Fund details', 'Sponsors', 'Finance']) assert.ok(!classesOf(name).includes('purchase'), name)
})

test('#853 round 4 (cu-researcher 08:39Z): patron of, back on a platform, a named deal; info nouns stay free', () => {
  for (const name of ['Become a patron of Ana Lopez', 'Back Ana on Patreon', 'Grab the 4K TV deal', 'Support the band on Ko-fi', 'Take the Black Friday bundle offer']) assert.notDeepEqual(classesOf(name), [], name)
  for (const name of ['Lease agreement PDF', 'Fund performance', 'Fund prospectus', 'Lease agreement']) assert.ok(!classesOf(name).includes('purchase'), name)
})

test('#853 round 5 (cu-researcher 08:56Z): information nouns count in the plural', () => {
  for (const name of ['Sponsor logos', 'Sponsor lists', 'Lease agreements', 'Fund reports']) assert.ok(!classesOf(name).includes('purchase'), name)
  for (const name of ['Become a patron of Ana Lopez', 'Back Ana on Patreon', 'Grab the 4K TV deal', 'Sponsor @octocat', 'Lease the 2024 Model Y']) assert.ok(classesOf(name).includes('purchase') || classesOf(name).length > 0, name)
})
