import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-527 (High; cu-coordinator 22:06Z), table PR 33: a package registry. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, key = false) => {
  const url = 'https://registry.example/package/foo/settings'
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-527: the ruled rows ask their class', () => {
  for (const [name, cls] of [['Unpublish package', 'delete'], ['Unpublish version', 'delete'], ['Yank version', 'delete'], ['Add maintainer', 'permission'], ['Add owner', 'permission'], ['Add trusted publisher', 'permission'], ['Create granular token', 'credential'], ['Generate automation token', 'credential'], ['Deprecate package', 'submit'], ['Deprecate version', 'submit']]) {
    assert.ok(classesOf(name).includes(cls), name)
    assert.ok(classesOf(name, true).includes(cls), `Space: ${name}`)
  }
})

test('CU-527 negatives and older rows', () => {
  for (const name of ['Versions', 'Maintainers', 'Tokens', 'Deprecation notice', 'View package']) assert.deepEqual(classesOf(name), [], name)
  assert.deepEqual(classesOf('Publish package'), ['submit'], 'older row unchanged')
  assert.ok(classesOf('Remove maintainer').includes('delete'), 'older row unchanged')
})
