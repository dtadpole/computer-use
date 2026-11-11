import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-484 (High; cu-coordinator 06:05Z): installs by store wording ask install; sideloading and unknown sources ask permission.
// Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://addons.example/item/x'
const at = (name, key = false) => {
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } })
  return v.decision === 'allow' ? 'allow' : v.class
}

test('CU-484: store installs ask install; sideloading asks permission', () => {
  for (const [name, cls] of [['Add to Slack', 'install'], ['Add to Discord', 'install'], ['Add to Firefox', 'install'], ['Add to Chrome', 'install'], ['Get extension', 'install'],
    ['Install now', 'install'], ['Run installer', 'install'], ['Activate plugin', 'install'], ['Sideload app', 'permission'], ['Allow unknown sources', 'permission'], ['Allow apps from anywhere', 'permission']]) {
    assert.equal(at(name), cls, name)
    assert.equal(at(name, true), cls, `Space: ${name}`)
  }
  // Named (older classes kept): 'Add to Teams' keeps permission; 'Uninstall' keeps delete.
  assert.equal(at('Add to Teams'), 'permission')
  assert.equal(at('Uninstall'), 'delete')
})

test('CU-484 negatives: store views and other add-to lists stay free', () => {
  for (const name of ['Extensions', 'Details', 'Add to playlist', 'Add to calendar', 'Add to favorites', 'Get started', 'Installation guide']) assert.equal(at(name), 'allow', name)
})
