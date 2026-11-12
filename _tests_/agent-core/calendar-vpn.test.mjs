import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-534 + CU-535 (High; cu-coordinator 00:51Z), table PR 37: a calendar's exposure and wipe; a VPN's safeguards. Click and Space.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, key = false) => {
  const url = 'https://app.example/settings'
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-534: calendar exposure asks permission, a wipe asks delete', () => {
  for (const [name, cls] of [['Get public iCal address', 'permission'], ['Get public address in iCal format', 'permission'], ['Get secret address in iCal format', 'permission'], ['Get shareable link to calendar', 'permission'], ['Clear calendar', 'delete'], ['Delete all events', 'delete']]) {
    assert.ok(classesOf(name).includes(cls), name)
    assert.ok(classesOf(name, true).includes(cls), `Space: ${name}`)
  }
  for (const name of ['Calendar settings', 'iCal format', 'Integrate calendar']) assert.deepEqual(classesOf(name), [], name)
})

test('CU-535: VPN safeguards off ask permission, a config download asks credential', () => {
  for (const [name, cls] of [['Turn off kill switch', 'permission'], ['Enable split tunneling', 'permission'], ['Exclude apps from VPN', 'permission'], ['Trust this network', 'permission'], ['Download config file', 'credential'], ['Download WireGuard configuration', 'credential']]) {
    assert.ok(classesOf(name).includes(cls), name)
    assert.ok(classesOf(name, true).includes(cls), `Space: ${name}`)
  }
  for (const name of ['Disconnect', 'Pause VPN', 'Change server', 'Kill switch', 'Split tunneling']) assert.deepEqual(classesOf(name), [], name)
  assert.deepEqual(classesOf('Trust this computer'), [], 'CU-286 exclusion unchanged')
})

test('#773 round 2 (cu-developer-three 01:03Z): the kill switch as a switch has a direction; Download configuration keeps install', () => {
  const sw = (checked, extra = {}) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://vpn.example/settings', target: { role: 'switch', name: 'Kill switch', ...(checked === undefined ? {} : { tag: 'input', inputType: 'checkbox', checked }), ...extra } }); return v.decision === 'allow' ? [] : (v.classes ?? [v.class]) }
  assert.ok(sw(true).includes('permission'), 'on -> off asks')
  assert.ok(sw(undefined).includes('permission'), 'unread asks')
  assert.deepEqual(sw(false), [], 'off -> on is free')
  const desk = (checked) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'desktop://com.example.vpn', target: { role: 'AXCheckBox', name: 'Kill switch', inWebArea: false, checked } }); return v.decision === 'allow' ? [] : (v.classes ?? [v.class]) }
  assert.ok(desk(true).includes('permission'), 'desktop on -> off asks')
  assert.deepEqual(desk(false), [], 'desktop off -> on is free')
  for (const name of ['Download configuration', 'Download VPN configuration', 'Download configuration file', 'Download OpenVPN profile']) { const c = classesOf(name); assert.ok(c.includes('install') && c.includes('credential'), `${name}: ${c}`) }
  for (const name of ['Export VPN profile', 'Save OpenVPN profile']) assert.ok(classesOf(name).includes('credential'), name)
})

test('CU-536 (cu-coordinator 01:06Z, #773 r2): home-security page rows; an alarm clock stays free', () => {
  const at = (name, url) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } }); return v.decision === 'allow' ? [] : (v.classes ?? [v.class]) }
  const SEC = 'https://alarm.simplisafe.example/home-security/system'
  for (const name of ['Silence siren', 'Mute siren', 'Turn off motion detection', 'Pause recording', 'Stop recording', 'Cancel monitoring']) assert.ok(at(name, SEC).includes('permission'), name)
  for (const name of ['Add user', 'Add PIN code', 'Add user code']) assert.ok(at(name, SEC).includes('physical'), name)
  for (const name of ['Silence siren', 'Add user', 'Pause recording']) assert.deepEqual(at(name, 'https://clock.example/alarms'), [], `off a home-security page: ${name}`)
  assert.deepEqual(at('Silence alarm', 'https://clock.example/alarms'), [], 'an alarm clock stays free')
})
