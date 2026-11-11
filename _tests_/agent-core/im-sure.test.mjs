import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-517 (High; cu-coordinator 19:06Z): 'I'm sure' acknowledgements are stripped like 'I understand', so the row decides.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, key = false) => {
  const url = 'https://cloud.example/storage'
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test("CU-517: \"I'm sure, <row>\" and its kin ask the row's class", () => {
  for (const [name, cls] of [["I'm sure, empty bucket", 'delete'], ["Yes, I'm sure, delete account", 'delete'], ["Delete account, I'm sure", 'delete'], ['I am sure, disable two-factor authentication', 'permission'], ["I\u2019m sure, delete repository", 'delete'], ["I'm certain - transfer ownership", 'permission']]) {
    assert.ok(classesOf(name).includes(cls), name)
    assert.ok(classesOf(name, true).includes(cls), `Space: ${name}`)
  }
})

test("CU-517 negatives: an acknowledgement with no row stays free", () => {
  for (const name of ["I'm sure", "Yes, I'm sure", "I'm sure, go back", "Are you sure?", "I'm not sure"]) assert.deepEqual(classesOf(name), [], name)
})
