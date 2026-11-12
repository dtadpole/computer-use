import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-551 (High; cu-coordinator 05:06Z), table PR 48: a repository going public asks permission; enabling Pages asks submit; going private
// stays free. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, key = false) => {
  const url = 'https://code.example/acme/app/settings'
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-551: repository visibility to public asks permission; Pages asks submit', () => {
  for (const [name, cls] of [['Change visibility to public', 'permission'], ['Change repository visibility to public', 'permission'], ['Make this repository public', 'permission'], ['I understand, change repository visibility.', 'permission'], ['Enable GitHub Pages', 'submit'], ['Turn on Pages', 'submit']]) {
    assert.ok(classesOf(name).includes(cls), name)
    assert.ok(classesOf(name, true).includes(cls), `Space: ${name}`)
  }
  for (const name of ['Change visibility to private', 'Make this repository private', 'Visibility', 'Pages', 'Change visibility']) assert.deepEqual(classesOf(name), [], name)
})

test('#807 round 2 (05:18Z / 05:21Z): the confirm wrappers, a bare Change repository visibility, Switch repository to public', () => {
  for (const name of ['I understand, change repository visibility\u2026', 'I understand, change repository visibility...', 'Please change repository visibility', 'Change repository visibility now', 'Change repository visibility', 'Switch repository to public', 'Set repo to public', 'Make public']) assert.ok(classesOf(name).includes('permission'), name)
  for (const name of ['Switch repository to private', 'Change repository name']) assert.deepEqual(classesOf(name), [], name)
})
