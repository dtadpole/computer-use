import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-544 (High; cu-coordinator 03:06Z), table PR 43: a chat workspace's admin. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, key = false) => {
  const url = 'https://acme.chat.example/admin/settings'
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-544: workspace export / external sharing / guest access ask permission; installing an app to the workspace asks install', () => {
  for (const [name, cls] of [['Export workspace data', 'permission'], ['Export all messages', 'permission'], ['Allow external sharing', 'permission'], ['Turn on external sharing', 'permission'], ['Enable guest access', 'permission'], ['Allow guest access', 'permission'], ['Install app to workspace', 'install'], ['Add bot to workspace', 'install']]) {
    assert.ok(classesOf(name).includes(cls), name)
    assert.ok(classesOf(name, true).includes(cls), `Space: ${name}`)
  }
  assert.ok(classesOf('Enable guest access').includes('physical'), 'the older physical stays (union)')
  for (const name of ['Workspace settings', 'External sharing', 'Guest access', 'Export']) assert.deepEqual(classesOf(name), [], name)
})
