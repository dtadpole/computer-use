import assert from 'node:assert/strict'
import { test } from 'node:test'

import { grammarClasses } from '../../_tools_/agent-core/phrase-grammar.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-442 (High): starting, extending or booking a metered EV-charging or parking session asks purchase; stopping one settles a
// fee (submit). Grammar table rows; a bare 'Add time' asks on a parking / charging page, read from the URL (titles never reach
// the policy). Click, Return and Space (D-106). Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://city.example/parking/session'
const click = (name, url = URL) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Zone', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-442: charging and parking sessions ask purchase; stopping one asks submit', () => {
  const rows = [['Start charging', 'purchase'], ['Unlock charger', 'purchase'], ['Reserve charger', 'purchase'], ['Start parking', 'purchase'], ['Pay for parking', 'purchase'],
    ['Extend parking', 'purchase'], ['Add 30 minutes', 'purchase'], ['Add time', 'purchase'], ['Book parking', 'purchase'], ['Stop charging', 'submit'], ['End parking session', 'submit']]
  for (const [name, cls] of rows) {
    assert.equal(click(name), cls, name)
    assert.equal(enter(name), cls, `Return: ${name}`)
    assert.equal(space(name), cls, `Space: ${name}`)
  }
  for (const [name, cls] of [['Add 2 hours', 'purchase'], ['Extend my parking', 'purchase'], ['Stop the charging session', 'submit']]) assert.deepEqual(grammarClasses(name), [cls], `table row: ${name}`)
})

test('CU-442 negatives: lists, history, zones, finding parking and rates stay free; a bare Add time off a parking page is a named limit', () => {
  for (const name of ['Chargers', 'Charging history', 'Parking zones', 'Find parking', 'Rates', 'Extend session']) assert.equal(click(name), 'allow', name)
  assert.equal(click('Add time', 'https://clock.example/timer'), 'allow', 'named limit: no parking / charging page in the URL')
})
