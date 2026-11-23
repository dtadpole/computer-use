import assert from 'node:assert/strict'
import { test } from 'node:test'

import { quantifierDropped, synonymForms } from '../../_tools_/agent-core/phrase-grammar.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-502 (High; cu-coordinator 13:21Z): 'all' / 'every' / 'each' / 'all of the' between a verb and its noun is dropped and the noun
// singularised, tried last. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const at = (name, url = 'https://app.example/x', key = false) => {
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? 'allow' : v.class
}

test('CU-502: the quantifier forms', () => {
  assert.deepEqual(quantifierDropped('Empty all buckets'), ['Empty buckets', 'Empty bucket'])
  assert.deepEqual(quantifierDropped('Cancel every order'), ['Cancel order'])
  assert.deepEqual(quantifierDropped('Delete all of the files'), ['Delete files', 'Delete file'])
  assert.deepEqual(quantifierDropped('Select all'), [])
  assert.deepEqual(quantifierDropped('Mark all as read'), [])
  assert.ok(synonymForms('Empty all buckets').includes('Empty bucket'), 'tried with the synonym forms, last')
})

test('CU-502: ruled Highs with a quantifier ask in their class', () => {
  for (const [name, cls, url] of [['Silence all alarms', 'physical', 'https://home.example/security'], ['Empty all buckets', 'delete'], ['Run all installers', 'install'], ['Link all devices', 'permission'], ['Cancel all orders', 'purchase'], ['Empty every bucket', 'delete']]) {
    assert.equal(at(name, url), cls, name)
    assert.equal(at(name, url, true), cls, `Space: ${name}`)
  }
})

test('CU-502 negatives: the list-handling verbs stay free', () => {
  for (const name of ['Select all', 'Mark all as read', 'Expand all', 'Show all', 'See all', 'View all', 'Show all results', 'Collapse all sections', 'Select all items']) assert.equal(at(name), 'allow', name)
})

test('#683 round 2 (cu-coordinator 13:36Z): open is not a list verb; a quantified name takes its singular row\'s full class set', () => {
  for (const name of ['Open all ports', 'Open every port']) assert.notEqual(at(name), 'allow', name)
  const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/x', target: { role: 'button', name: 'Approve each sign-in' } })
  const single = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/x', target: { role: 'button', name: 'Approve sign-in' } })
  for (const cls of single.classes ?? [single.class]) assert.ok((v.classes ?? [v.class]).includes(cls), cls)
  assert.equal(at('Open all tabs'), 'allow', 'a benign open stays free')
})
