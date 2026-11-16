import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-529 (High; cu-coordinator 22:51Z), table PR 34: a browser / site permission grant asks permission. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, key = false) => {
  const url = 'https://meet.example/room/42'
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-529: the ruled grants ask permission', () => {
  for (const name of ['Allow in incognito', 'Allow in private windows', 'On all sites', 'Allow on all sites', 'Allow camera', 'Allow microphone', 'Allow location', 'Allow notifications', 'Allow camera and microphone']) {
    assert.ok(classesOf(name).includes('permission'), name)
    assert.ok(classesOf(name, true).includes('permission'), `Space: ${name}`)
  }
})

test('CU-529 negatives and older rows', () => {
  for (const name of ['Block', 'Not now', 'Allow', 'Site settings', 'Camera', 'On click', 'On specific sites']) assert.deepEqual(classesOf(name), [], name)
  assert.ok(classesOf('Allow access to all websites').includes('permission'), 'older row unchanged')
})

test('#754 round 2 (cu-researcher 22:54Z): run / enable in, InPrivate, every site', () => {
  for (const name of ['Allow in InPrivate', 'Run in private windows', 'Enable in incognito', 'Allow on every site', 'On every website', 'Run in InPrivate mode']) assert.ok(classesOf(name).includes('permission'), name)
  for (const name of ['Site access', 'On click', 'InPrivate', 'Every site']) assert.deepEqual(classesOf(name), [], name)
})
