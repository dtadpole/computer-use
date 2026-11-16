import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-528 (High; cu-coordinator 22:21Z + 22:22Z): a trailing '?' / '.' / '!' and the question lead-ins never free a table row or drop
// its class off a union row. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, url = 'https://example.com/settings', key = false) => {
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-528: trailing punctuation keeps the row', () => {
  for (const [name, cls] of [['Allow 0.0.0.0/0?', 'permission'], ['Disable RLS.', 'permission'], ['Unpublish package?', 'delete'], ['Create granular token!', 'credential'], ['Merge when ready?', 'submit']]) {
    assert.ok(classesOf(name).includes(cls), name)
    assert.ok(classesOf(name, undefined, true).includes(cls), `Space: ${name}`)
  }
})

test('CU-528: union rows keep every class under punctuation', () => {
  const plain = classesOf('Reset account PIN')
  for (const name of ['Reset account PIN!', 'Reset account PIN?', 'Reset account PIN.']) for (const cls of plain) assert.ok(classesOf(name).includes(cls), `${name}: ${cls}`)
})

test('CU-528: the question lead-ins are stripped', () => {
  for (const name of ['Are you sure you want to unpublish package?', 'Really disable RLS?', 'Do you want to yank version?', 'Do you really want to add trusted publisher?']) assert.notDeepEqual(classesOf(name), [], name)
  for (const name of ['Are you sure?', 'Really?', 'Help?', 'Learn more.', 'Do you want to continue?', 'Is this safe?', 'How do I unpublish a package?', 'More\u2026', 'Export...']) assert.deepEqual(classesOf(name), [], name)
})
