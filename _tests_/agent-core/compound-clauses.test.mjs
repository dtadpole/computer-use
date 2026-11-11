import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-506: verb-led clauses joined by and / & / then are judged clause by clause; the union asks. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, key = false) => {
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: 'https://app.example/x', target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/x', target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-506: a compound of verb-led clauses asks the union', () => {
  for (const [name, row] of [['Review and confirm withdrawal', 'Confirm withdrawal'], ['Scan and link device', 'Link device'], ['Save and disable encryption', 'Disable encryption'], ['Delete account and continue', 'Delete account'], ['Empty bucket & close', 'Empty bucket'], ['Save then make this repository public', 'Make this repository public']]) {
    for (const cls of classesOf(row)) {
      assert.ok(classesOf(name).includes(cls), `${name} has ${cls}`)
      assert.ok(classesOf(name, true).includes(cls), `Space: ${name} has ${cls}`)
    }
    assert.ok(classesOf(row).length > 0, `the row asks: ${row}`)
  }
})

test('CU-506 negatives: noun pairs never split; benign compounds stay free', () => {
  for (const name of ['Terms and conditions', 'Rock and roll', 'Save and continue', 'Review and close', 'Search and filter']) assert.deepEqual(classesOf(name), [], name)
})

test('#699 round 2 (cu-researcher 15:43Z): a clause that asks on its own counts as verb-led', () => {
  for (const [name, row] of [['Suspend user and continue', 'Suspend user'], ['Wipe device and continue', 'Wipe device'], ['Suspend user & close', 'Suspend user']]) {
    assert.ok(classesOf(row).length > 0, row)
    for (const cls of classesOf(row)) assert.ok(classesOf(name).includes(cls), `${name} has ${cls}`)
  }
  for (const name of ['Terms and conditions', 'Pros and cons', 'Rock and roll']) assert.deepEqual(classesOf(name), [], name)
})
