import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-521 (High; cu-coordinator 20:06Z), table PR 29: a code host's admin-bypass merge. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, key = false) => {
  const url = 'https://code.example/org/repo/pull/42'
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-521: the bypass merges ask permission + submit', () => {
  for (const name of ['Merge without waiting for requirements to be met', 'Bypass rules and merge', 'Use your administrator privileges to merge', 'Force merge', 'Merge anyway', 'Bypass branch protections', 'Merge as admin']) {
    for (const key of [false, true]) {
      const got = classesOf(name, key)
      assert.ok(got.includes('permission') && got.includes('submit'), `${key ? 'Space: ' : ''}${name}: ${got}`)
    }
  }
})

test('CU-521: dismissing reviews and overriding checks ask permission', () => {
  for (const name of ['Dismiss review', 'Dismiss stale approvals', 'Override required check', 'Skip required checks']) {
    assert.ok(classesOf(name).includes('permission'), name)
    assert.ok(classesOf(name, true).includes('permission'), `Space: ${name}`)
  }
})

test('CU-521 negatives and older rows', () => {
  for (const name of ['Re-run checks', 'View checks', 'Checks', 'Reviews', 'Request review']) assert.deepEqual(classesOf(name), [], name)
  assert.deepEqual(classesOf('Merge pull request'), ['submit'], 'older row unchanged')
})
