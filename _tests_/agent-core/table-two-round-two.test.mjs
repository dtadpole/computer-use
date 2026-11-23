import assert from 'node:assert/strict'
import { test } from 'node:test'

import { grammarClasses } from '../../_tools_/agent-core/phrase-grammar.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// #575 round 2 (cu-coordinator 21:26Z): the nine held-out escapes fold in with their family's class (D-108); the PR's own
// 'Forward calls' row no longer asks when a native checkbox is turned OFF; desktop switches pin today's both-ways ask.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name, url = 'https://app.example/settings', target = {}) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name, ...target } }); return v.decision === 'allow' ? 'allow' : v.class }

test('#575 round 2: the nine held-out escapes ask with their family class', () => {
  for (const [name, cls] of [['Change role', 'permission'], ['Add 5 licenses', 'purchase'], ['Get unlimited likes', 'purchase'], ['Allow purchases without approval', 'permission'],
    ['Allow in-app buying', 'permission'], ['Give 30 more minutes', 'permission'], ['Extend screen time', 'permission'], ['Request port-out PIN', 'credential'],
    ['Forward text messages', 'credential']]) {
    assert.deepEqual(grammarClasses(name), [cls], name)
    assert.equal(click(name), cls, `hook: ${name}`)
  }
})

test('#575 round 2: a native "Forward calls" checkbox turned OFF is free, ON asks credential; an ARIA one asks either way', () => {
  const box = (checked) => ({ role: 'checkbox', tag: 'input', inputType: 'checkbox', checked })
  assert.equal(click('Forward calls', 'https://phone.example/settings', box(true)), 'allow', 'on -> off')
  assert.equal(click('Forward calls', 'https://phone.example/settings', box(false)), 'credential', 'off -> on')
  assert.equal(click('Forward calls', 'https://phone.example/settings', { role: 'checkbox', tag: 'div', checked: true }), 'credential', 'ARIA state not trusted')
})

test('cu-developer-three 21:26Z: a desktop protection switch asks both ways today (no native read until helper 0.2.70)', () => {
  for (const checked of [true, false]) assert.equal(click('Parental controls', 'app:com.example.family', { role: 'AXCheckBox', subrole: 'AXSwitch', checked }), 'permission', `checked ${checked}`)
  // cu-coordinator 21:28Z: the same pin for the 'Forward calls' switch (credential both ways on desktop until 0.2.70).
  for (const checked of [true, false]) assert.equal(click('Forward calls', 'app:com.example.phone', { role: 'AXCheckBox', subrole: 'AXSwitch', checked }), 'credential', `Forward calls checked ${checked}`)
})
