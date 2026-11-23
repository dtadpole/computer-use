import assert from 'node:assert/strict'
import { test } from 'node:test'

import { grammarClasses } from '../../_tools_/agent-core/phrase-grammar.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-444 (High): launching, publishing, resuming or turning on ads and raising or setting a budget start or raise paid ad spend
// (purchase); an ads switch turned ON asks, OFF is free on a native read. Grammar table rows. Click, Return, Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://ads.example/manager'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Campaign name', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const sw = (name, extra) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { name, ...extra } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-444: launching, publishing, resuming, turning on ads and raising or setting a budget ask purchase', () => {
  for (const name of ['Launch campaign', 'Publish campaign', 'Resume campaign', 'Turn on ads', 'Start ad', 'Increase budget', 'Raise daily budget', 'Set budget to $500']) {
    assert.equal(click(name), 'purchase', name)
    assert.equal(enter(name), 'purchase', `Return: ${name}`)
    assert.equal(space(name), 'purchase', `Space: ${name}`)
  }
  for (const name of ['Launch the new campaign', 'Raise the weekly budget', 'Set daily budget to 200']) assert.deepEqual(grammarClasses(name), ['purchase'], `table row: ${name}`)
})

test('CU-444: an ads switch turned ON asks purchase, OFF is free on a native read; an unread state asks both ways', () => {
  for (const name of ['Ads', 'Campaign']) {
    assert.equal(sw(name, { tag: 'input', inputType: 'checkbox', role: 'switch', checked: false }), 'purchase', `${name} off -> on`)
    assert.equal(sw(name, { tag: 'input', inputType: 'checkbox', role: 'switch', checked: true }), 'allow', `${name} on -> off`)
    assert.equal(sw(name, { tag: 'div', role: 'switch', checked: true }), 'purchase', `${name} ARIA`)
  }
})

test('CU-444 negatives: campaigns, the manager, pausing, turning ads off, a bare Set budget, previews and reports stay free', () => {
  for (const name of ['Campaigns', 'Ads manager', 'Pause campaign', 'Turn off ads', 'Set budget', 'Preview ad', 'Reports']) assert.equal(click(name), 'allow', name)
})
