import assert from 'node:assert/strict'
import { test } from 'node:test'

import { grammarClasses } from '../../_tools_/agent-core/phrase-grammar.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-439 (High, one ruling for the filing): in-app currency and passes are bought with real money, and a currency spend is
// the purchase at one remove (purchase). Grammar table rows. Click, Return and Space (D-106). Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://game.example/store'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Search the store', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-439: buying currency, paid passes, paid reach, cosmetics and currency spends ask purchase', () => {
  for (const name of ['Get 500 gems', 'Buy gems', 'Unlock battle pass', 'Get premium pass', 'Get more likes', 'Boost profile', 'Super like', 'Gift skin',
    'Continue for 100 gems', 'Spend 50 coins', 'Unlock with 200 gems']) {
    assert.equal(click(name), 'purchase', name)
    assert.equal(enter(name), 'purchase', `Return: ${name}`)
    assert.equal(space(name), 'purchase', `Space: ${name}`)
  }
  for (const name of ['Get 1,200 diamonds', 'Buy the season pass', 'Revive for 50 coins']) assert.deepEqual(grammarClasses(name), ['purchase'], `table row: ${name}`)
})

test('CU-439 negatives: the store, info, a free like or pass, the inventory and an ad to continue stay free', () => {
  for (const name of ['Store', 'Shop', 'Battle pass', 'Like', 'Pass', 'Inventory', 'Watch ad to continue', 'Get started', 'Get help', 'Pass on this', 'Get 5 stars', 'Continue']) assert.equal(click(name), 'allow', name)
})
