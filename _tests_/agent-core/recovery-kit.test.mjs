import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-545 (High; cu-coordinator 03:36Z), table PR 44: a recovery kit / key asks credential. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, key = false) => {
  const url = 'https://account.example/security'
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-545: recovery kit / key downloads and saves ask credential', () => {
  for (const name of ['Download recovery kit', 'Save recovery key', 'Print recovery kit', 'Save recovery kit', 'Download recovery kit PDF', 'Export recovery key']) {
    assert.ok(classesOf(name).includes('credential'), name)
    assert.ok(classesOf(name, true).includes('credential'), `Space: ${name}`)
  }
  for (const name of ['Recovery kit', 'Recovery options', 'Account recovery']) assert.deepEqual(classesOf(name), [], name)
  for (const name of ['Download recovery key', 'Download emergency kit']) assert.ok(classesOf(name).includes('credential'), `older row: ${name}`)
})
