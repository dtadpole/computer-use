import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-508: a trailing widening qualifier is stripped, so the row decides. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, key = false) => {
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: 'https://app.example/x', target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/x', target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-508: a widening qualifier after a ruled row asks the row\'s classes', () => {
  for (const row of ['Empty bucket', 'Disable encryption', 'Make this repository public', 'Sign out', 'Turn off two-factor authentication']) {
    const bare = classesOf(row)
    if (bare.length === 0) continue
    for (const tail of [' permanently', ' forever', ' for all users', ' for everyone', ' on all devices', ' on all my devices', ' everywhere', ', permanently']) {
      for (const cls of bare) {
        assert.ok(classesOf(row + tail).includes(cls), row + tail)
        assert.ok(classesOf(row + tail, true).includes(cls), `Space: ${row}${tail}`)
      }
    }
  }
  assert.ok(classesOf('Empty bucket permanently').length > 0)
})

test('CU-508 negatives: a widening qualifier after a free label stays free', () => {
  for (const name of ['Show for all users', 'Available everywhere', 'Sync on all devices', 'View permanently', 'Keep forever']) assert.deepEqual(classesOf(name), [], name)
})

test('CU-509: a trailing scope phrase never frees the row', () => {
  for (const [name, row] of [['Disable encryption for this bucket', 'Disable encryption'], ['Make this repository public for this org', 'Make this repository public'], ['Empty bucket in this project', 'Empty bucket'], ['Disable two-factor authentication for this account', 'Disable two-factor authentication']]) {
    for (const cls of classesOf(row)) assert.ok(classesOf(name).includes(cls), `${name} has ${cls}`)
  }
  for (const name of ['Settings for this project', 'Members in this workspace', 'Show for this account']) assert.deepEqual(classesOf(name), [], name)
})
