import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-418 (High): physical near forms ask physical each time (D-105) - disabling an alarm or security camera, starting a
// car, heating an oven / heater / stove, buzzing someone in. Click, Return and Space (D-106). Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://home.example/devices'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'PIN', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-418: the physical near forms ask physical on a click, Return and Space', () => {
  for (const name of ['Disable alarm', 'Turn off camera', 'Disable camera', 'Start car', 'Remote start', 'Start engine', 'Turn on oven', 'Preheat oven', 'Turn on heater', 'Turn on stove', 'Buzz in', 'Let guest in', 'Open gate']) {
    assert.equal(click(name), 'physical', name)
    assert.equal(enter(name), 'physical', `Return: ${name}`)
    assert.equal(space(name), 'physical', `Space: ${name}`)
  }
})

test('CU-418 negatives: protecting or benign acts stay free; Arm alarm still asks as ruled', () => {
  for (const name of ['Lock car', 'Turn off oven', 'Turn off heater', 'Turn on lights', 'Cameras', 'Thermostat']) assert.equal(click(name), 'allow', name)
  assert.equal(click('Arm alarm'), 'physical')
})

const sw = (name, extra) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { name, ...extra } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-418 switches (14:17Z): a security switch turned OFF and a heat/vehicle switch turned ON ask physical; the safe direction is free on a native read', () => {
  const native = (checked) => ({ tag: 'input', inputType: 'checkbox', role: 'switch', checked })
  assert.equal(sw('Camera', native(true)), 'physical', 'camera on -> off')
  assert.equal(sw('Alarm', native(true)), 'physical', 'alarm on -> off')
  assert.equal(sw('Camera', native(false)), 'allow', 'camera off -> on (protects)')
  assert.equal(sw('Oven', native(false)), 'physical', 'oven off -> on')
  assert.equal(sw('Engine', native(false)), 'physical', 'engine off -> on')
  assert.equal(sw('Heater', native(true)), 'allow', 'heater on -> off')
})

test('CU-418 switches (14:19Z): an ARIA or missing state, and every desktop switch, ask in both directions (named over-ask)', () => {
  assert.equal(sw('Camera', { tag: 'div', role: 'switch', checked: false }), 'physical', 'ARIA state is not trusted')
  assert.equal(sw('Oven', { tag: 'button', role: 'switch' }), 'physical', 'missing state')
  assert.equal(sw('Camera', { role: 'AXCheckBox', subrole: 'AXSwitch' }), 'physical', 'desktop: no state read')
  assert.equal(sw('Oven', { role: 'AXCheckBox', subrole: 'AXSwitch' }), 'physical', 'desktop: no state read')
  assert.equal(sw('Lights', { tag: 'input', inputType: 'checkbox', role: 'switch', checked: false }), 'allow', 'a lights switch is benign')
})
