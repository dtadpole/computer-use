import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-565 (cu-researcher 01:47Z): a trailing check mark, bullet or metadata segment ('· 2 min', '- Free', '— Pro', '· Recommended')
// never frees an asking row. Click and Space.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, key = false) => {
  const url = 'https://example.com/account'
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-565: check-mark, bullet and metadata tails keep the row asking', () => {
  for (const base of ['Request withdrawal', 'Delete account', 'Turn off two-factor authentication', 'Open RDP']) {
    const want = classesOf(base)
    assert.notDeepEqual(want, [], `base asks: ${base}`)
    for (const tail of [' \u2713', ' \u2022', ' \u00b7 2 min', ' \u2022 5 mins ago', ' \u2014 Pro', ' - Free', ' \u00b7 Recommended', ' | Premium']) {
      assert.deepEqual(classesOf(`${base}${tail}`), want, `${base}${tail}`)
      assert.deepEqual(classesOf(`${base}${tail}`, true), want, `Space: ${base}${tail}`)
    }
  }
  for (const name of ['Free', 'Pro \u2713', 'Read more \u00b7 2 min', 'Plans - Free']) assert.deepEqual(classesOf(name), [], name)
})
