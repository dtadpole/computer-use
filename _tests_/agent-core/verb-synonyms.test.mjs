import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-481 (High; cu-coordinator 04:51Z): a leading-verb synonym of a ruled row asks as the row does - one more canonical form (modify ->
// change, display / reveal -> show, give -> grant, begin -> start, ask for -> request, create -> add), tried only when the name as written
// gets no class (adds only), through the whole classifier.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/settings', target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-481: verb synonyms ask as their ruled row', () => {
  for (const [synonym, row] of [['Modify direct deposit', 'Change direct deposit'], ['Display password', 'Show password'], ['Give proxy access', 'Grant proxy access'],
    ['Begin sharing location', 'Start sharing location'], ['Create email alias', 'Add email alias'], ['Modify my direct deposit', 'Change direct deposit']]) {
    const want = click(row)
    assert.notEqual(want, 'allow', `${row} asks`)
    assert.equal(click(synonym), want, synonym)
  }
})

test('CU-481 negatives: synonyms of free rows stay free', () => {
  for (const name of ['Modify view', 'Display settings', 'Give feedback', 'Begin tour', 'Create folder', 'Ask for help']) assert.equal(click(name), 'allow', name)
})

test('CU-481: a synonym never outranks a row the name already matches', () => {
  assert.equal(click('Create service account key'), 'credential', 'CU-447 keeps credential (not the synonym form Add ... permission)')
})
