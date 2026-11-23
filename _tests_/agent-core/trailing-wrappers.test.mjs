import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-561 (High; cu-coordinator 08:36Z): a trailing ' instead' or an arrow / chevron wrapper never frees an asking row. Click and Space.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, key = false) => {
  const url = 'https://example.com/account'
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-561: trailing instead / arrow / chevron wrappers keep the row asking', () => {
  for (const base of ['Request withdrawal', 'Delete account', 'Turn off two-factor authentication', 'Take a loan from 401(k)']) {
    const want = classesOf(base)
    assert.notDeepEqual(want, [], `base asks: ${base}`)
    for (const tail of [' instead', ' \u25b8', ' \u203a', ' \u00bb', ' \u2192', ' \u25b6', ' \u276f', ' instead \u25b8']) {
      assert.deepEqual(classesOf(`${base}${tail}`), want, `${base}${tail}`)
      assert.deepEqual(classesOf(`${base}${tail}`, true), want, `Space: ${base}${tail}`)
    }
  }
  for (const name of ['Instead', 'Use this instead', 'Next \u25b8']) assert.deepEqual(classesOf(name), [], name)
})
