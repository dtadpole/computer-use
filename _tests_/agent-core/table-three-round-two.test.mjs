import assert from 'node:assert/strict'
import { test } from 'node:test'

import { grammarClasses } from '../../_tools_/agent-core/phrase-grammar.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// #580 round 2 (cu-coordinator 21:52Z): the six held-out escapes fold in - a split-particle normaliser ('Turn ads on'),
// 'Enable ad set', 'Enable microphone', 'Enable person recognition', and 'Edit DNS' on a registrar URL.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name, url = 'https://app.example/settings') => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('#580 round 2: the six held-out escapes ask with their family class', () => {
  for (const [name, cls] of [['Turn ads on', 'purchase'], ['Turn privacy mode off', 'permission'], ['Enable ad set', 'purchase'], ['Enable microphone', 'permission'],
    ['Enable person recognition', 'permission']]) {
    assert.deepEqual(grammarClasses(name), [cls], name)
    assert.equal(click(name), cls, `hook: ${name}`)
  }
  assert.equal(click('Edit DNS', 'https://registrar.example/domains/example-org'), 'permission', 'registrar URL')
  assert.equal(click('Edit DNS', 'https://router.example/settings'), 'allow', 'off a registrar page')
})

test('split particles: the normaliser keeps each direction and touches nothing else', () => {
  assert.deepEqual(grammarClasses('Turn privacy mode on'), [], 'privacy on stays free')
  assert.deepEqual(grammarClasses('Turn ads off'), [], 'ads off stays free')
  assert.deepEqual(grammarClasses('Switch content filter off'), ['permission'], 'CU-440 via the normaliser')
  assert.deepEqual(grammarClasses('Turn on'), [], 'a bare particle stays free')
})

test('#580 round 3 (cu-verifier 22:41Z): switch as well as turn - Switch ads on / Switch on ads ask purchase; Switch ads off stays free', () => {
  for (const name of ['Switch ads on', 'Switch on ads', 'Switch on the campaign']) {
    assert.deepEqual(grammarClasses(name), ['purchase'], name)
    assert.equal(click(name), 'purchase', `hook: ${name}`)
  }
  assert.deepEqual(grammarClasses('Switch ads off'), [], 'off stays free')
})

test('#580 round 4 (cu-coordinator 22:44Z): flip and toggle read beside turn and switch, both word orders; the off / on safe directions stay free', () => {
  for (const [name, cls] of [['Toggle ads on', 'purchase'], ['Flip ads on', 'purchase'], ['Flip privacy mode off', 'permission'], ['Toggle domain lock off', 'credential'],
    ['Flip CloudTrail off', 'permission'], ['Toggle off parental controls', 'permission'], ['Flip on ads', 'purchase']]) {
    assert.deepEqual(grammarClasses(name), [cls], name)
    assert.equal(click(name), cls, `hook: ${name}`)
  }
  for (const name of ['Toggle ads off', 'Flip privacy mode on', 'Toggle domain lock on', 'Flip CloudTrail on', 'Toggle dark mode', 'Flip card']) assert.deepEqual(grammarClasses(name), [], name)
})
