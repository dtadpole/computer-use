import assert from 'node:assert/strict'
import { test } from 'node:test'

import { grammarClasses } from '../../_tools_/agent-core/phrase-grammar.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-449 (High): streaming add-ons, episode / season unlocks, rentals and gifts ask purchase (CU-428 family). Grammar table rows.
// Click, Return and Space (D-106). Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://stream.example/title/42'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Search titles', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-449: channels, add-ons, episode / season unlocks, rentals and gifts ask purchase', () => {
  for (const name of ['Add channel', 'Add HBO channel', 'Subscribe to channel', 'Unlock episode', 'Unlock season', 'Rent', 'Buy movie', 'Gift this movie', 'Gift subscription', 'Add premium add-on']) {
    assert.equal(click(name), 'purchase', name)
    assert.equal(enter(name), 'purchase', `Return: ${name}`)
    assert.equal(space(name), 'purchase', `Space: ${name}`)
  }
  for (const name of ['Add the Starz channel', 'Unlock the next episode', 'Gift a film', 'Add sports add-on']) assert.deepEqual(grammarClasses(name), ['purchase'], `table row: ${name}`)
})

test('CU-449 negatives: channels, watch, play, trailer and adding to a list stay free', () => {
  for (const name of ['Channels', 'Watch', 'Play', 'Trailer', 'Add to watchlist', 'Add to list', 'Add channel to favorites']) assert.equal(click(name), 'allow', name)
})
