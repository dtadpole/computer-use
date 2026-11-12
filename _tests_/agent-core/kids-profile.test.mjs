import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-543 (High; cu-coordinator 02:36Z), table PR 42: a kids profile's safeguards ask permission. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, key = false) => {
  const url = 'https://stream.example/account/profiles/kids'
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-543: kids-profile safeguards off ask permission', () => {
  for (const name of ['Turn off profile PIN', 'Disable profile lock', 'Allow all maturity ratings', 'Set maturity to 18+', 'Set maturity rating to All', 'Turn off content filter']) {
    assert.ok(classesOf(name).includes('permission'), name)
    assert.ok(classesOf(name, true).includes('permission'), `Space: ${name}`)
  }
  for (const name of ['Profile PIN', 'Maturity ratings', 'Set maturity to Kids', 'Turn on profile PIN']) assert.deepEqual(classesOf(name), [], name)
  assert.ok(classesOf('Turn off parental controls').includes('permission'), 'older row unchanged')
  assert.ok(classesOf('Remove profile lock').includes('delete'), 'older row unchanged')
})
