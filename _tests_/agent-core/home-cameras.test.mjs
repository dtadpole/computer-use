import assert from 'node:assert/strict'
import { test } from 'node:test'

import { grammarClasses } from '../../_tools_/agent-core/phrase-grammar.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-445 (High): turning a home camera's privacy off, recording audio or continuously, face recognition and sharing the camera
// ask permission (CU-418 family); privacy switches OFF and recording / face switches ON ask. Grammar table rows. Click, Return,
// Space (D-106). Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://home.example/cameras'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Camera name', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const sw = (name, extra) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { name, ...extra } }); return v.decision === 'allow' ? 'allow' : v.class }
const native = (checked) => ({ tag: 'input', inputType: 'checkbox', role: 'switch', checked })

test('CU-445: privacy off, audio and continuous recording, face recognition and sharing ask permission', () => {
  for (const name of ['Turn off privacy mode', 'Disable privacy mode', 'Disable privacy shutter', 'Open shutter', 'Enable audio recording', 'Turn on microphone',
    'Turn on continuous recording', 'Enable 24/7 recording', 'Enable face recognition', 'Enable familiar faces', 'Share camera', 'Share live view']) {
    assert.equal(click(name), 'permission', name)
    assert.equal(enter(name), 'permission', `Return: ${name}`)
    assert.equal(space(name), 'permission', `Space: ${name}`)
  }
  for (const name of ['Switch off privacy mode', 'Start continuous recording', 'Turn on facial recognition']) assert.deepEqual(grammarClasses(name), ['permission'], `table row: ${name}`)
})

test('CU-445: a privacy switch turned OFF asks, ON free; a recording or face switch turned ON asks, OFF free; unread asks both ways', () => {
  for (const name of ['Privacy mode', 'Privacy shutter']) {
    assert.equal(sw(name, native(true)), 'permission', `${name} on -> off`)
    assert.equal(sw(name, native(false)), 'allow', `${name} off -> on`)
    assert.equal(sw(name, { tag: 'div', role: 'switch', checked: false }), 'permission', `${name} ARIA`)
  }
  for (const name of ['Audio recording', 'Continuous recording', 'Face recognition', 'Familiar faces']) {
    assert.equal(sw(name, native(false)), 'permission', `${name} off -> on`)
    assert.equal(sw(name, native(true)), 'allow', `${name} on -> off`)
    assert.equal(sw(name, { tag: 'div', role: 'switch', checked: true }), 'permission', `${name} ARIA`)
  }
})

test('CU-445 negatives: cameras, the owner\'s live view, privacy on, closing the shutter, events and clips stay free', () => {
  for (const name of ['Cameras', 'Live view', 'Turn on privacy mode', 'Close shutter', 'Events', 'Clips']) assert.equal(click(name), 'allow', name)
  assert.deepEqual(grammarClasses('Continuous'), [], "'continuous' stays whole (no plural -s)")
})
