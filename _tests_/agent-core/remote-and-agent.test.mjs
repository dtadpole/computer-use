import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createExclusions } from '../../_tools_/agent-core/exclusions.mjs'
import { grammarClasses } from '../../_tools_/agent-core/phrase-grammar.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-464 (High): remote-access switches on web and app admin pages ask permission (System Settings stays excluded by app policy).
// CU-466 (High): removing a repository's protections asks permission.
// CU-465 (High): blanket approvals for an agent to run commands ask permission (CU-427's family). Grammar table rows and
// switches. Click, Return and Space (D-106). Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://admin.example/settings'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Host name', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const sw = (name, extra) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { name, ...extra } }); return v.decision === 'allow' ? 'allow' : v.class }
const native = (checked) => ({ tag: 'input', inputType: 'checkbox', role: 'switch', checked })

test('CU-464: turning on screen sharing, remote login or desktop, file or internet sharing and remote Apple events asks permission', () => {
  for (const name of ['Turn on Screen Sharing', 'Turn on Remote Login', 'Enable Remote Desktop', 'Allow remote connections', 'Turn on File Sharing', 'Turn on Internet Sharing',
    'Turn on Remote Apple Events']) {
    assert.equal(click(name), 'permission', name)
    assert.equal(enter(name), 'permission', `Return: ${name}`)
    assert.equal(space(name), 'permission', `Space: ${name}`)
  }
  for (const name of ['Turn off Screen Sharing', 'Remote Desktop', 'Screen Sharing settings', 'Turn off File Sharing']) assert.equal(click(name), 'allow', name)
})

test('CU-465: blanket agent approvals ask permission; single-step and safe-direction controls stay free', () => {
  for (const name of ['Allow all tools', 'Allow all commands', 'Always allow', 'Run without confirmation', 'Run in YOLO mode', 'Auto-accept edits', 'Auto-approve', 'Skip approvals',
    'Trust this workspace']) {
    assert.equal(click(name), 'permission', name)
    assert.equal(enter(name), 'permission', `Return: ${name}`)
    assert.equal(space(name), 'permission', `Space: ${name}`)
  }
  for (const name of ['Agent settings', 'Ask every time', 'Require approval', 'Allow once']) assert.equal(click(name), 'allow', name)
  for (const name of ['Skip confirmations', 'Auto-run commands', 'Run without asking']) assert.deepEqual(grammarClasses(name), ['permission'], `table row: ${name}`)
})

test('CU-464 / CU-465 switches: ON asks, OFF free on a native read; unread and desktop ask both ways', () => {
  for (const name of ['Screen Sharing', 'Remote Login', 'Auto-accept edits', 'YOLO mode']) {
    assert.equal(sw(name, native(false)), 'permission', `${name} off -> on`)
    assert.equal(sw(name, native(true)), 'allow', `${name} on -> off`)
  }
  for (const checked of [true, false]) assert.equal(sw('Screen Sharing', { role: 'AXCheckBox', subrole: 'AXSwitch', checked }), 'permission', `desktop pin ${checked}`)
})

test('CU-464 full ruling (00:34Z): the named enable / allow forms and SMB ask; views stay free', () => {
  for (const name of ['Enable Screen Sharing', 'Enable SSH', 'Allow Remote Desktop', 'Enable remote desktop', 'Enable SMB', 'Enable Remote Apple Events', 'Open port 22', 'Open port 3389']) assert.equal(click(name), 'permission', name)
  for (const name of ['Sharing', 'Remote access', 'Connected devices']) assert.equal(click(name), 'allow', name)
})

test('CU-466: removing repository protections asks permission, a deploy key credential; protection switches OFF and allow switches ON ask', () => {
  const repo = 'https://git.example/org/repo/settings'
  const at = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: repo, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
  for (const name of ['Allow force pushes', 'Allow deletions', 'Disable branch protection', 'Disable secret scanning', 'Disable push protection', 'Allow all actions and reusable workflows',
    'Allow all actions', 'Add webhook']) {
    assert.equal(at(name), 'permission', name)
    assert.equal(space(name), 'permission', `Space: ${name}`)
  }
  assert.equal(at('Add deploy key'), 'credential')
  // Named (older class leads; it asks either way): 'Delete protection rule' keeps its older delete.
  assert.equal(at('Delete protection rule'), 'delete')
  for (const name of ['Settings', 'Branches', 'Require pull request', 'Enable secret scanning', 'Webhooks']) assert.equal(at(name), 'allow', name)
  assert.equal(sw('Branch protection', native(true)), 'permission', 'protection on -> off')
  assert.equal(sw('Branch protection', native(false)), 'allow', 'protection off -> on')
  assert.equal(sw('Allow force pushes', native(false)), 'permission', 'force push off -> on')
  assert.equal(sw('Allow force pushes', native(true)), 'allow', 'force push on -> off')
  for (const checked of [true, false]) assert.equal(sw('Secret scanning', { role: 'AXCheckBox', subrole: 'AXSwitch', checked }), 'permission', `desktop pin ${checked}`)
})

test('CU-464 (cu-developer-three 00:41Z): macOS System Settings stays REFUSED as os_security, not merely asked', () => {
  const exclusions = createExclusions()
  assert.deepEqual(exclusions.isExcludedApp('com.apple.systempreferences'), { excluded: true, kind: 'os_security', rule: 'com.apple.systempreferences' })
  const window = exclusions.isExcludedWindow({ bundleId: 'com.apple.systempreferences', title: 'Sharing' })
  assert.equal(window.excluded, true)
  assert.equal(window.kind, 'os_security')
})

test('#597 round 2: the eleven held-out escapes ask permission; their free counterparts stay free', () => {
  for (const name of ['Allow remote desktop connections', 'Enable SMB file sharing service', 'Allow all tool calls', 'Allow all terminal commands', 'Switch to YOLO mode',
    'Trust this project', 'Execute without approval', 'Allow branch deletions', 'Turn off secret scanning', 'Create webhook', 'Disable required reviews']) {
    assert.deepEqual(grammarClasses(name), ['permission'], name)
    assert.equal(click(name), 'permission', `hook: ${name}`)
  }
  for (const name of ['Turn on secret scanning', 'Webhooks', 'Switch to dark mode', 'Trust', 'Create', 'Allow all']) assert.equal(click(name), 'allow', name)
  // Named (cu-coordinator 00:49Z; older classes lead, each asks either way): 'Run commands without confirmation' keeps install,
  // 'Allow force push' (singular) keeps delete.
  assert.equal(click('Run commands without confirmation'), 'install')
  assert.equal(click('Allow force push'), 'delete')
})
