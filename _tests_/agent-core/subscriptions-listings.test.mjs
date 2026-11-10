import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-428 (High): memberships, paid tiers and trials start a recurring charge and a counteroffer binds a sale (purchase);
// listing, relisting and accepting a return bind a sale (submit). Click, Return and Space (D-106). Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://store.example/account'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Promo code', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-428: memberships, paid tiers, trials and counteroffers ask purchase', () => {
  for (const name of ['Join Prime', 'Join Gold', 'Become a member', 'Go Premium', 'Unlock Pro', 'Get Plus', 'Upgrade to Pro', 'Start my trial', 'Start free trial', 'Accept counteroffer']) {
    assert.equal(click(name), 'purchase', name)
    assert.equal(enter(name), 'purchase', `Return: ${name}`)
    assert.equal(space(name), 'purchase', `Space: ${name}`)
  }
})

test('CU-428: List now, Relist and Accept return submit', () => {
  for (const name of ['List now', 'Relist', 'Accept return']) {
    assert.equal(click(name), 'submit', name)
    assert.equal(enter(name), 'submit', `Return: ${name}`)
  }
})

test('CU-428 negatives: plans, membership, features, Compare plans, Learn more, Manage subscription, Join group stay free', () => {
  for (const name of ['Plans', 'Membership', 'Premium features', 'Compare plans', 'Learn more', 'Manage subscription', 'Join group', 'Get started', 'Pro tips']) assert.equal(click(name), 'allow', name)
})

test('CU-428 round 2 (17:00Z): Upgrade to <any tier>, Join the club and Become a <tier> member ask purchase', () => {
  for (const name of ['Upgrade to Gold', 'Upgrade to Family', 'Upgrade to Business', 'Join the club', 'Become a Plus member', 'Become a Gold member']) {
    assert.equal(click(name), 'purchase', name)
    assert.equal(enter(name), 'purchase', `Return: ${name}`)
  }
  for (const name of ['Upgrade guide', 'Club rules', 'Member benefits']) assert.equal(click(name), 'allow', name)
})

test('CU-428 round 3 (17:16Z): a software upgrade asks install, a paid tier stays purchase', () => {
  for (const name of ['Upgrade to the latest version', 'Upgrade to macOS Sequoia', 'Upgrade to version 2.0', 'Upgrade to iOS 18']) {
    assert.equal(click(name), 'install', name)
    assert.equal(enter(name), 'install', `Return: ${name}`)
  }
  for (const name of ['Upgrade to Gold', 'Upgrade to Pro', 'Upgrade to Business']) assert.equal(click(name), 'purchase', name)
  assert.equal(click('Upgrade now'), 'purchase', "the bare 'Upgrade now' keeps CU-288's older purchase (no update-prompt context is read)")
})
