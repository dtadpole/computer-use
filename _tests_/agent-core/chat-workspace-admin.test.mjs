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

test("#789 round 2 (cu-developer-three 03:10Z): the 'Guest access' switch asks off -> on and unread; on -> off is free", () => {
  const sw = (checked) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://acme.chat.example/admin/settings', target: { role: 'switch', name: 'Guest access', ...(checked === undefined ? {} : { tag: 'input', inputType: 'checkbox', checked }) } }); return v.decision === 'allow' ? [] : (v.classes ?? [v.class]) }
  assert.ok(sw(false).includes('permission'), 'off -> on asks')
  assert.ok(sw(undefined).includes('permission'), 'unread asks')
  assert.deepEqual(sw(true), [], 'on -> off is free')
  const desk = (checked) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'desktop://com.example.chat', target: { role: 'AXCheckBox', name: 'Guest access', inWebArea: false, checked } }); return v.decision === 'allow' ? [] : (v.classes ?? [v.class]) }
  assert.ok(desk(false).includes('permission'), 'desktop off -> on asks')
  assert.deepEqual(desk(true), [], 'desktop on -> off is free')
})
