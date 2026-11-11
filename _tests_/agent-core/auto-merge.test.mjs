import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-526 (High; cu-coordinator 21:36Z): a queued merge asks submit like 'Merge pull request'. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, key = false) => {
  const url = 'https://code.example/org/repo/pull/42'
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-526: merge when ready and auto-merge ask submit', () => {
  for (const name of ['Merge when ready', 'Merge when checks pass', 'Enable auto-merge', 'Enable automerge', 'Turn on auto-merge']) {
    assert.deepEqual(classesOf(name), ['submit'], name)
    assert.deepEqual(classesOf(name, true), ['submit'], `Space: ${name}`)
  }
})

test('CU-526 negatives and neighbours', () => {
  for (const name of ['Auto-merge', 'Disable auto-merge', 'Merge options']) assert.deepEqual(classesOf(name), [], name)
  assert.deepEqual(classesOf('Enable auto-renew'), ['purchase'], 'the enable-auto purchase row stays for renewals')
  assert.deepEqual(classesOf('Merge pull request'), ['submit'])
})

test('#747 round 2 (cu-researcher 21:43Z): the scheduled merge in one row', () => {
  for (const name of ['Merge automatically', 'Auto-merge when checks pass', 'Schedule merge', 'Queue for merge', 'Add to merge queue', 'Merge when all checks pass', 'Merge once CI is green']) assert.deepEqual(classesOf(name), ['submit'], name)
  for (const name of ['Merge queue', 'Auto-merge settings', 'View merge queue', 'Cancel auto-merge']) assert.deepEqual(classesOf(name), [], name)
})

test('CU-531 follow-up (cu-researcher 23:20Z): third-person merge-later verbs', () => {
  for (const name of ['Merge once the build succeeds', 'Merge when the pipeline completes', 'Merge after CI finishes', 'Merge when checks passes']) assert.deepEqual(classesOf(name), ['submit'], name)
})
