import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-504: a leading symbol glyph is stripped like an emoji, so the row decides. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const at = (name, key = false) => {
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: 'https://app.example/settings', target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/settings', target: { role: 'button', name } })
  return v.decision === 'allow' ? 'allow' : v.class
}

test('CU-504: a leading arrow / bullet / check before a ruled row asks in the row\'s class', () => {
  for (const row of ['Delete account', 'Download W-2s', 'Make this repository public', 'Disable two-factor authentication']) {
    const bare = at(row)
    assert.notEqual(bare, 'allow', row)
    for (const glyph of ['\u2192 ', '\u2022 ', '\u2713 ', '\u2714 ', '\u25b6 ', '\u00bb ', '> ', '- ', '\u2014 ', '* ']) {
      assert.equal(at(glyph + row), bare, JSON.stringify(glyph + row))
      assert.equal(at(glyph + row, true), bare, `Space: ${JSON.stringify(glyph + row)}`)
    }
  }
})

test('CU-504 negatives: a glyph before a benign label stays free', () => {
  for (const name of ['\u2192 Next', '\u2022 Settings', '\u2713 Done', '> More']) assert.equal(at(name), 'allow', name)
})
