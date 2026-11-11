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
