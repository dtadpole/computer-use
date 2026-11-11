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

test('CU-418 switches (14:19Z): an ARIA or missing state, and a desktop switch without a native state, ask in both directions (named over-ask)', () => {
  assert.equal(sw('Camera', { tag: 'div', role: 'switch', checked: false }), 'physical', 'ARIA state is not trusted')
  assert.equal(sw('Oven', { tag: 'button', role: 'switch' }), 'physical', 'missing state')
  assert.equal(sw('Camera', { role: 'AXCheckBox', subrole: 'AXSwitch' }), 'physical', 'desktop: no state read (older helper)')
  assert.equal(sw('Oven', { role: 'AXCheckBox', subrole: 'AXSwitch' }), 'physical', 'desktop: no state read (older helper)')
  assert.equal(sw('Lights', { tag: 'input', inputType: 'checkbox', role: 'switch', checked: false }), 'allow', 'a lights switch is benign')
})

test('CU-418 round 2 (14:28Z): one adjective between verb and object, Oven on, bare Preheat, Start vehicle, Let visitor in, Pause camera ask physical', () => {
  for (const name of ['Turn on space heater', 'Turn on burner', 'Light fireplace', 'Turn on fireplace', 'Oven on', 'Preheat', 'Start vehicle', 'Start the rental car', 'Let visitor in', 'Let the delivery guest in', 'Pause camera', 'Turn off the security camera']) {
    assert.equal(click(name), 'physical', name)
    assert.equal(enter(name), 'physical', `Return: ${name}`)
  }
})

test('CU-418 round 2 negatives: Stop recording (named), oven timer and turning heat off stay free; a car-wash booking over-asks (named)', () => {
  for (const name of ['Stop recording', 'Oven timer', 'Turn off space heater', 'Lock the car', 'Turn on porch lights']) assert.equal(click(name), 'allow', name)
  assert.equal(click('Start car wash booking'), 'physical', 'named over-ask: the ruled phrase start car appears inside it')
})

test('CU-418 option (b) (helper 0.2.70): a desktop AXCheckBox outside any web area carries a native state, so the safe direction is free', () => {
  const desk = (checked, extra = {}) => ({ role: 'AXCheckBox', subrole: 'AXSwitch', checked, inWebArea: false, ...extra })
  assert.equal(sw('Camera', desk(true)), 'physical', 'camera on -> off')
  assert.equal(sw('Camera', desk(false)), 'allow', 'camera off -> on (protects)')
  assert.equal(sw('Oven', desk(false)), 'physical', 'oven off -> on')
  assert.equal(sw('Oven', desk(true)), 'allow', 'oven on -> off')
  // Fail closed: inside a web area the state is the page's aria-checked claim; an unread web area, 'mixed', or another role ask.
  assert.equal(sw('Camera', desk(false, { inWebArea: true })), 'physical', 'web area: the state is untrusted')
  assert.equal(sw('Camera', { role: 'AXCheckBox', subrole: 'AXSwitch', checked: false }), 'physical', 'web area unread')
  assert.equal(sw('Camera', desk('mixed')), 'physical', 'mixed')
  assert.equal(sw('Camera', desk(false, { role: 'AXRadioButton' })), 'physical', 'a radio button has no on/off direction')
})

test('CU-418 option (b): the CU-373 account toggles and the CU-408 Autopay switch read a desktop native state the same way', () => {
  const desk = (checked, extra = {}) => ({ role: 'AXCheckBox', subrole: 'AXSwitch', checked, inWebArea: false, ...extra })
  assert.equal(sw('Autopay', desk(true)), 'allow', 'autopay on -> off')
  assert.equal(sw('Autopay', desk(false)), 'purchase', 'autopay off -> on')
  assert.equal(sw('Autopay', desk(true, { inWebArea: true })), 'purchase', 'web area: untrusted')
  assert.equal(sw('Two-factor authentication', desk(false)), 'allow', 'protection off -> on')
  assert.equal(sw('Two-factor authentication', desk(true)), 'credential', 'protection on -> off')
  assert.equal(sw('Mail forwarding', desk(true)), 'allow', 'forwarding on -> off')
  assert.equal(sw('Mail forwarding', desk(false)), 'credential', 'forwarding off -> on')
})

test('CU-418 option (b): CU-431 router switches read a desktop native state the same way - ON asks permission, OFF is free', () => {
  const desk = (checked, extra = {}) => ({ role: 'AXCheckBox', subrole: 'AXSwitch', checked, inWebArea: false, ...extra })
  assert.equal(sw('Remote management', desk(false)), 'permission', 'off -> on exposes the router')
  assert.equal(sw('Remote management', desk(true)), 'allow', 'on -> off')
  assert.equal(sw('UPnP', desk(true, { inWebArea: true })), 'permission', 'web area: untrusted')
  assert.equal(sw('SSH', { role: 'AXCheckBox', subrole: 'AXSwitch' }), 'permission', 'older helper: no state')
})

test('CU-418 option (b): CU-436 spending-cap switch reads a desktop native state the same way - OFF asks purchase, ON is free', () => {
  const desk = (checked, extra = {}) => ({ role: 'AXCheckBox', subrole: 'AXSwitch', checked, inWebArea: false, ...extra })
  assert.equal(sw('Spending cap', desk(true)), 'purchase', 'on -> off lifts the cap')
  assert.equal(sw('Spending cap', desk(false)), 'allow', 'off -> on protects')
  assert.equal(sw('Spending cap', desk(false, { inWebArea: true })), 'purchase', 'web area: untrusted')
  assert.equal(sw('Spending cap', { role: 'AXCheckBox', subrole: 'AXSwitch' }), 'purchase', 'older helper: no state')
})

// CU-418 option (b), folds after #575 and #580: CU-440, CU-444..447 and the grammar's native-ON skip read nativeToggleState,
// so a desktop AXCheckBox outside a web area with a boolean state reads the same direction as a web native checkbox.
const dsw = (name, checked, extra = {}) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'app:com.example.settings', target: { role: 'AXCheckBox', subrole: 'AXSwitch', name, checked, inWebArea: false, ...extra } }); return v.decision === 'allow' ? 'allow' : v.class }
test('nativeToggleState folds: desktop native switches read their direction (CU-440, CU-444..447)', () => {
  for (const [name, offCls, onCls] of [
    ['Parental controls', 'permission', 'allow'], // CU-440: on -> off asks
    ['Privacy mode', 'permission', 'allow'], // CU-445
    ['Domain lock', 'credential', 'allow'], // CU-446
    ['WHOIS privacy', 'permission', 'allow'], // CU-446
    ['Block public access', 'permission', 'allow'], // CU-447
  ]) {
    assert.equal(dsw(name, true), offCls, `${name}: on -> off`)
    assert.equal(dsw(name, false), onCls, `${name}: off -> on`)
    assert.equal(dsw(name, false, { inWebArea: true }), offCls, `${name}: web area untrusted`)
    assert.equal(dsw(name, 'mixed'), offCls, `${name}: mixed asks`)
  }
  for (const name of ['Ads', 'Face recognition']) { // CU-444, CU-445: off -> on asks
    const cls = name === 'Ads' ? 'purchase' : 'permission'
    assert.equal(dsw(name, false), cls, `${name}: off -> on`)
    assert.equal(dsw(name, true), 'allow', `${name}: on -> off`)
    assert.equal(dsw(name, true, { inWebArea: true }), cls, `${name}: web area untrusted`)
  }
})
test('nativeToggleState folds: the grammar native-ON skip holds on desktop only for a trusted read', () => {
  assert.equal(dsw('Forward calls', true), 'allow', 'desktop native on -> off: the direction rules decide')
  assert.notEqual(dsw('Forward calls', true, { inWebArea: true }), 'allow', 'web area: the grammar still asks')
  assert.notEqual(dsw('Forward calls', undefined), 'allow', 'no state: the grammar still asks')
})
test('nativeToggleState folds after #590: CU-456 mail protections and CU-460 Sentry / PIN to drive read a desktop native state', () => {
  for (const [name, offCls] of [['Spam filter', 'permission'], ['Sentry Mode', 'permission'], ['PIN to drive', 'credential']]) {
    assert.equal(dsw(name, true), offCls, `${name}: on -> off`)
    assert.equal(dsw(name, false), 'allow', `${name}: off -> on`)
    assert.equal(dsw(name, false, { inWebArea: true }), offCls, `${name}: web area untrusted`)
  }
  assert.equal(dsw('Less secure app access', false), 'credential', 'off -> on asks')
  assert.equal(dsw('Less secure app access', true), 'allow', 'on -> off is free')
  assert.equal(dsw('Less secure app access', true, { inWebArea: true }), 'credential', 'web area untrusted')
})
test('nativeToggleState fold after #592: CU-461 private-account switch reads a desktop native state', () => {
  assert.equal(dsw('Private account', true), 'permission', 'on -> off makes the account public')
  assert.equal(dsw('Private account', false), 'allow', 'off -> on is free')
  assert.equal(dsw('Private account', false, { inWebArea: true }), 'permission', 'web area untrusted')
  assert.equal(dsw('Private account', undefined), 'permission', 'no state asks')
})
test('nativeToggleState folds after #597: CU-464/465 remote access and blanket approvals (ON asks), CU-466 repo protections', () => {
  // 'Auto-approve' is an older CU-427 phrase that asks both ways on the web too, so it is not a direction row here.
  for (const name of ['Screen Sharing', 'Remote Login', 'YOLO mode']) {
    assert.equal(dsw(name, false), 'permission', `${name}: off -> on asks`)
    assert.equal(dsw(name, true), 'allow', `${name}: on -> off is free`)
    assert.equal(dsw(name, true, { inWebArea: true }), 'permission', `${name}: web area untrusted`)
  }
  assert.equal(dsw('Branch protection', true), 'permission', 'protection on -> off asks')
  assert.equal(dsw('Branch protection', false), 'allow', 'protection off -> on is free')
  assert.equal(dsw('Allow force pushes', false), 'permission', 'force push off -> on asks')
  assert.equal(dsw('Allow force pushes', true), 'allow', 'force push on -> off is free')
  assert.equal(dsw('Allow force pushes', 'mixed'), 'permission', 'mixed asks')
})
test('nativeToggleState fold after #602: CU-468 auto-lock / armed switches read a desktop native state (OFF asks physical)', () => {
  for (const name of ['Auto-lock', 'Armed', 'Alarm armed']) {
    assert.equal(dsw(name, true), 'physical', `${name}: on -> off`)
    assert.equal(dsw(name, false), 'allow', `${name}: off -> on`)
    assert.equal(dsw(name, false, { inWebArea: true }), 'physical', `${name}: web area untrusted`)
  }
})
test('CU-464 switch rule reads the compound spellings too: a native Remote Log-in / Log in switch has the Remote Login direction', () => {
  for (const name of ['Remote Log-in', 'Remote Log in', 'Remote Login']) {
    assert.equal(dsw(name, false), 'permission', `${name}: off -> on asks`)
    assert.equal(dsw(name, true), 'allow', `${name}: on -> off is free`)
  }
})
test('CU-489 abbreviations on native switches take their setting\'s direction (0.2.70 + #653): RDP like Remote Desktop, MFA / 2SV like two-factor', () => {
  for (const [abbr, full] of [['RDP', 'Remote Desktop'], ['MFA', 'Two-factor authentication'], ['2SV', 'Two-factor authentication']]) {
    assert.equal(dsw(abbr, true), dsw(full, true), `${abbr} on -> off as ${full}`)
    assert.equal(dsw(abbr, false), dsw(full, false), `${abbr} off -> on as ${full}`)
  }
  assert.equal(dsw('RDP', false), 'permission')
  assert.equal(dsw('RDP', true), 'allow')
  assert.equal(dsw('MFA', true), 'credential')
  assert.equal(dsw('MFA', false), 'allow')
})
