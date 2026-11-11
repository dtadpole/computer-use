import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-505: a short section label before a row, and brackets / quotes around a name, are stripped. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const at = (name, key = false) => {
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: 'https://app.example/settings', target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/settings', target: { role: 'button', name } })
  return v.decision === 'allow' ? 'allow' : v.class
}

test('CU-505: a section label or wrapping brackets before a ruled row ask in the row\'s class', () => {
  for (const row of ['Make this repository public', 'Change direct deposit', 'Delete account', 'Empty bucket']) {
    const bare = at(row)
    assert.notEqual(bare, 'allow', row)
    for (const wrapped of [`Danger zone: ${row}`, `Payroll - ${row}`, `Actions \u2014 ${row}`, `[${row}]`, `"${row}"`, `(${row})`]) {
      assert.equal(at(wrapped), bare, wrapped)
      assert.equal(at(wrapped, true), bare, `Space: ${wrapped}`)
    }
  }
})

test('CU-505 negatives: a label before a benign label and a lone label stay free', () => {
  for (const name of ['Danger zone', 'Settings: General', 'Account - Overview', '[Beta]', 'Note: Read more']) assert.equal(at(name), 'allow', name)
})

test('CU-505 (14:49Z): a label of up to five words; times and ratios never split', () => {
  assert.equal(at('Repository settings danger zone area: Make this repository public'), at('Make this repository public'))
  for (const name of ['Meeting at 10:30', 'Aspect 16:9', 'Ratio 4:3 - 16:9']) assert.equal(at(name), 'allow', name)
})

test('#694 round 2 (cu-researcher 15:05Z): one-word rests; the label never replaces the row\'s class (union)', () => {
  const classesOf = (name, url = 'https://app.example/settings') => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } }); return v.decision === 'allow' ? [] : (v.classes ?? [v.class]) }
  assert.ok(classesOf('Pay settings: Change direct deposit').includes('credential'))
  assert.equal(at('Car - Honk'), at('Honk'))
  assert.equal(at('Settings: General'), 'allow')
})
