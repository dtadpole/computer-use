import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-455 (High; cu-coordinator 22:48Z): switch / flip / toggle (+ on|off, either word order) are canonicalised to 'turn on|off X'
// before the whole classifier - the closed Highs' older 'turn' lists then read them. One probe, only when nothing asked; adds
// only.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const verdict = (name, desk = false) => {
  const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, desk ? { url: 'app:com.example.settingsapp', target: { role: 'AXButton', name } } : { url: 'https://app.example/settings', target: { role: 'button', name } })
  return v.decision === 'allow' ? 'allow' : v.class
}
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: 'https://app.example/settings', target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-455: the six named escapes ask as their turn form does, web and desktop, click and Space', () => {
  for (const [name, canonical] of [['Switch off firewall', 'Turn off firewall'], ['Switch FileVault off', 'Turn off FileVault'], ['Switch on remote management', 'Turn on remote management'],
    ['Switch off spending cap', 'Turn off spending cap'], ['Switch on location sharing', 'Turn on location sharing'], ['Flip parental controls off', 'Turn off parental controls']]) {
    const want = verdict(canonical)
    assert.notEqual(want, 'allow', `${canonical} asks`)
    assert.equal(verdict(name), want, name)
    assert.equal(verdict(name, true), verdict(canonical, true), `desktop: ${name}`)
    assert.equal(space(name), want, `Space: ${name}`)
  }
})

test('CU-455: verb-synonym parity - switch / flip / toggle match turn in both word orders; safe directions and non-switch uses stay free', () => {
  const objects = ['firewall', 'FileVault', 'remote management', 'location sharing', 'Find My', 'parental controls', 'spending cap', 'the heater', 'privacy mode',
    'notifications', 'dark mode', 'sync', 'ads', 'audit logging']
  // Named (CU-450's three, CU-429's family): the older two-factor / forwarding words read anywhere - not in this list.
  for (const verb of ['Switch', 'Flip', 'Toggle']) for (const q of ['on', 'off']) for (const x of objects) {
    const canonical = verdict(`Turn ${q} ${x}`)
    assert.equal(verdict(`${verb} ${q} ${x}`), canonical, `${verb} ${q} ${x}`)
    assert.equal(verdict(`${verb} ${x} ${q}`), canonical, `${verb} ${x} ${q}`)
  }
  for (const name of ['Switch off', 'Switch tabs', 'Switch account', 'Flip card', 'Toggle sidebar', 'Toggle']) assert.equal(verdict(name), 'allow', name)
})
