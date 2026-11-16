import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-431 (High): router / NAS admin acts that expose the home network (permission), an admin password change (credential),
// firmware updates (install). Web admin pages; desktop System Settings stays excluded (os_security). Click, Return and
// Space (D-106). Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'http://router.example/admin'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Port', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-431: remote management, SSH / Telnet, ports, DMZ, UPnP and WAN exposure ask permission', () => {
  for (const name of ['Enable remote management', 'Enable remote access', 'Enable SSH', 'Enable Telnet', 'Open port', 'Add port forwarding', 'Enable DMZ', 'Enable UPnP', 'Expose to internet', 'Allow WAN access']) {
    assert.equal(click(name), 'permission', name)
    assert.equal(enter(name), 'permission', `Return: ${name}`)
    assert.equal(space(name), 'permission', `Space: ${name}`)
  }
})

test('CU-431: an admin password change asks credential; firmware updates ask install', () => {
  for (const name of ['Change admin password', 'Reset admin password']) assert.equal(click(name), 'credential', name)
  for (const name of ['Update firmware', 'Upload firmware', 'Flash firmware']) {
    assert.equal(click(name), 'install', name)
    assert.equal(enter(name), 'install', `Return: ${name}`)
  }
})

test('CU-431 negatives: Firmware, Check for updates, Disable remote management, Close port and Status stay free', () => {
  for (const name of ['Firmware', 'Check for updates', 'Disable remote management', 'Close port', 'Status']) assert.equal(click(name), 'allow', name)
  // Pin moved by CU-556 round 5 (cu-coordinator 06:21Z, 12 Nov): the 'Port forwarding' label (button / link) lowers to free; its switch keeps CU-373's direction rule.
  assert.equal(click('Port forwarding'), 'allow', 'round 5: the label is free')
})

const sw = (name, extra) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { name, ...extra } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-431 switches (17:27Z): turning a router exposure switch ON asks permission, OFF is free on a native read; an unread state asks both ways', () => {
  const native = (checked) => ({ tag: 'input', inputType: 'checkbox', role: 'switch', checked })
  for (const name of ['Remote management', 'Remote access', 'SSH', 'Telnet', 'UPnP', 'DMZ', 'WAN access']) {
    assert.equal(sw(name, native(false)), 'permission', `${name} off -> on`)
    assert.equal(sw(name, native(true)), 'allow', `${name} on -> off`)
    assert.equal(sw(name, { tag: 'div', role: 'switch', checked: true }), 'permission', `${name}: an ARIA state is not trusted`)
    assert.equal(sw(name, { role: 'AXCheckBox', subrole: 'AXSwitch' }), 'permission', `${name}: no state read`)
  }
  assert.equal(sw('Port forwarding', native(false)), 'permission', 'off -> on')
  assert.equal(sw('Port forwarding', native(true)), 'allow', 'on -> off (CU-373 reads the native direction too)')
})

test('CU-431 round 2 (17:39Z): the six held-out escapes ask', () => {
  for (const name of ['Turn on remote management', 'Allow remote access', 'Turn on UPnP', 'Open ports', 'Enable the DMZ']) {
    assert.equal(click(name), 'permission', name)
    assert.equal(enter(name), 'permission', `Return: ${name}`)
  }
  assert.equal(click('Change router password'), 'credential')
  const bare = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name: 'Change password' } })
  assert.equal(bare.decision, 'handoff', 'the bare Change password keeps its stricter hand-off')
})
