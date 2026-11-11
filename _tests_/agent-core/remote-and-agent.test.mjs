import assert from 'node:assert/strict'
import { test } from 'node:test'

import { grammarClasses } from '../../_tools_/agent-core/phrase-grammar.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-464 (High): remote-access switches on web and app admin pages ask permission (System Settings stays excluded by app policy).
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
