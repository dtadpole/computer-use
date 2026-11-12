import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-554 (High; cu-coordinator 06:06Z), table PR 50: unpublishing / taking offline / maintenance mode / disabling a site asks submit; the
// switch forms take a direction rule. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://sites.example/admin/settings'
const classesOf = (name, key = false) => {
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}
const sw = (name, checked) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'switch', name, ...(checked === undefined ? {} : { tag: 'input', inputType: 'checkbox', checked }) } }); return v.decision === 'allow' ? [] : (v.classes ?? [v.class]) }

test('CU-554: taking a site down asks submit', () => {
  for (const name of ['Unpublish site', 'Unpublish this website', 'Take site offline', 'Take the store down', 'Enable maintenance mode', 'Turn on maintenance mode', 'Put site in maintenance mode', 'Disable site', 'Shut down store']) {
    assert.ok(classesOf(name).includes('submit'), name)
    assert.ok(classesOf(name, true).includes('submit'), `Space: ${name}`)
  }
  for (const name of ['Maintenance', 'Site settings', 'Disable maintenance mode', 'Offline mode']) assert.deepEqual(classesOf(name), [], name)
  for (const [name, cls] of [['Publish site', 'submit'], ['Delete site', 'delete']]) assert.ok(classesOf(name).includes(cls), `older row: ${name}`)
})

test('CU-554: the switches - maintenance mode ON asks, a published / online site turned OFF asks', () => {
  assert.ok(sw('Maintenance mode', false).includes('submit'), 'maintenance off -> on asks')
  assert.ok(sw('Maintenance mode', undefined).includes('submit'), 'maintenance unread asks')
  assert.deepEqual(sw('Maintenance mode', true), [], 'maintenance on -> off is free')
  for (const name of ['Site published', 'Site online', 'Store live']) {
    assert.ok(sw(name, true).includes('submit'), `${name}: on -> off asks`)
    assert.ok(sw(name, undefined).includes('submit'), `${name}: unread asks`)
    assert.deepEqual(sw(name, false), [], `${name}: off -> on is free`)
  }
})

test('#814 round 3 (cu-researcher 06:27Z): the held-out site forms ask submit', () => {
  for (const name of ['Set the site into maintenance', 'Hide my website from visitors', 'Enable coming soon page', 'Turn on under construction mode']) assert.ok(classesOf(name).includes('submit'), name)
  for (const name of ['Coming soon', 'Hide sidebar']) assert.deepEqual(classesOf(name), [], name)
})

test('#814 round 4 (cu-researcher 06:38Z): the r2-line site shapes ask submit', () => {
  for (const name of ['Hide site from everyone', 'Enable maintenance page']) assert.ok(classesOf(name).includes('submit'), name)
})

test('#814 round 4 (cu-coordinator 06:51Z): the whole site-takedown family', () => {
  for (const name of ['Hide my entire website from the public', 'Close store temporarily', 'Lock site', 'Take it offline', 'Show maintenance screen', 'Enable password protection page', 'Pause my store']) assert.ok(classesOf(name).includes('submit'), name)
  for (const name of ['Close', 'Hide', 'Store hours', 'Close dialog']) assert.deepEqual(classesOf(name), [], name)
})
