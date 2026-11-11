import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-463 (High; cu-coordinator 00:04Z): 'enable / activate X' is judged as 'turn on X' and 'disable / deactivate X' as 'turn off X'
// by the whole classifier, through CU-455's single probe - only when nothing asked, so it adds only.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const verdict = (name, desk = false) => {
  const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, desk ? { url: 'app:com.example.settingsapp', target: { role: 'AXButton', name } } : { url: 'https://app.example/settings', target: { role: 'button', name } })
  return v.decision === 'allow' ? 'allow' : v.class
}
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: 'https://app.example/settings', target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-463: the five named escapes ask as their turn-on form does, web, desktop and Space', () => {
  for (const [name, canonical] of [['Enable location sharing', 'Turn on location sharing'], ['Activate location sharing', 'Turn on location sharing'],
    ['Activate remote management', 'Turn on remote management'], ['Activate UPnP', 'Turn on UPnP'], ['Activate YOLO mode', 'Turn on YOLO mode']]) {
    const want = verdict(canonical)
    assert.notEqual(want, 'allow', `${canonical} asks`)
    assert.equal(verdict(name), want, name)
    assert.equal(verdict(name, true), verdict(canonical, true), `desktop: ${name}`)
    assert.equal(space(name), want, `Space: ${name}`)
  }
})

test('CU-463: verb parity - enable / activate match turn on, disable / deactivate match turn off where nothing older asks first', () => {
  const objects = ['location sharing', 'remote management', 'firewall', 'FileVault', 'Find My', 'parental controls', 'spending cap', 'privacy mode', 'notifications', 'dark mode',
    'sync', 'cookies', 'autoplay', 'captions']
  for (const x of objects) {
    for (const verb of ['Enable', 'Activate']) {
      const canonical = verdict(`Turn on ${x}`)
      // Adds only: where the turn-on form asks, the verb form asks too (an older rule may already ask for the verb form itself).
      if (canonical !== 'allow') assert.notEqual(verdict(`${verb} ${x}`), 'allow', `${verb} ${x} asks`)
    }
    for (const verb of ['Disable', 'Deactivate']) {
      const canonical = verdict(`Turn off ${x}`)
      if (canonical !== 'allow') assert.notEqual(verdict(`${verb} ${x}`), 'allow', `${verb} ${x} asks`)
    }
  }
  // Older classes lead (D-108 rule 1): 'Deactivate firewall' keeps its older delete; 'Activate license' its older purchase.
  assert.equal(verdict('Deactivate firewall'), 'delete')
  assert.equal(verdict('Activate license'), 'purchase')
  for (const name of ['Enable notifications', 'Enable dark mode', 'Activate account', 'Disable ads', 'Enable', 'Activate']) assert.equal(verdict(name), 'allow', name)
})

test('#595 round 2: allow / start / opt in to X read as turn on X; permit-for-me objects and trials keep their own reading', () => {
  for (const [name, canonical] of [['Allow location sharing', 'Turn on location sharing'], ['Start location sharing', 'Turn on location sharing'],
    ['Opt in to location sharing', 'Turn on location sharing'], ['Allow UPnP', 'Turn on UPnP'], ['Allow YOLO mode', 'Turn on YOLO mode']]) assert.equal(verdict(name), verdict(canonical), name)
  // cu-researcher 00:15Z: 'allow' before a site's own prompt object means permit-for-me, not switch a feature on.
  for (const name of ['Allow ads', 'Allow acceptable ads', 'Allow non-intrusive ads', 'Allow camera', 'Allow microphone', 'Allow location', 'Allow tracking', 'Allow cookies', 'Allow pop-ups', 'Allow notifications',
    'Start tour', 'Start over', 'Start timer', 'Opt in to emails']) assert.equal(verdict(name), 'allow', name)
  for (const name of ['Start trial', 'Start free trial']) assert.equal(verdict(name), 'purchase', `${name} keeps its own class`)
})
