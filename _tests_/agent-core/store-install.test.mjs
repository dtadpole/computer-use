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
  // Named (older classes kept): 'Add to Teams' keeps permission (the older rule leads); 'Uninstall' keeps delete.
  assert.equal(at('Add to Teams'), 'permission')
  assert.equal(at('Uninstall'), 'delete')
})

test('CU-484 negatives: store views and other add-to lists stay free', () => {
  for (const name of ['Extensions', 'Details', 'Add to playlist', 'Add to calendar', 'Add to favorites', 'Get started', 'Installation guide']) assert.equal(at(name), 'allow', name)
})

test('#635 round 2 (cu-researcher 07:08Z): the Install now family under every variant, and the held-out escapes', () => {
  for (const name of ['Install now…', 'Install now...', 'Install now (recommended)', '🔓 Install now', 'Install now →', 'Yes, install now', 'Please install now', 'Click to install now',
    'Install now, please', 'Install for free', 'Install it', 'Launch installer', 'Activate extension', 'Add to Telegram']) assert.equal(at(name), 'install', name)
  assert.equal(at('Allow apps from unknown sources'), 'permission')
  for (const name of ['Install', 'Installed', 'Install guide', 'Now playing']) assert.equal(at(name), 'allow', name)
})

test("#635 round 3 (cu-developer-three 07:19Z): 'add-on' / 'plug-in' hyphen forms; 'Install now on this device' is a named limit (07:21Z)", () => {
  for (const name of ['Get add-on', 'Get the add-on', 'Get add on', 'Get plug-in', 'Activate add-on', 'Enable plug-in']) assert.equal(at(name), 'install', name)
  assert.equal(at('Install now on this device'), 'allow', 'double qualifier - named limit (cu-coordinator 07:21Z)')
  for (const name of ['Add-ons', 'Plug-in settings', 'Get help']) assert.equal(at(name), 'allow', name)
})
