import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// cu-developer-three 21:48Z: one desktop pin row per #580 switch rule - an AXCheckBox / AXSwitch has no native state read on the
// desktop until helper 0.2.70, so each asks both ways today; the later nativeToggleState fold then changes only the
// inWebArea:false case, visibly.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const sw = (name, checked, app = 'app:com.example.settings') => {
  const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: app, target: { role: 'AXCheckBox', subrole: 'AXSwitch', name, checked } })
  return v.decision === 'allow' ? 'allow' : v.class
}

test('#580 desktop pins: every switch rule asks both ways on the desktop today', () => {
  for (const [name, cls] of [['Ads', 'purchase'], ['Privacy mode', 'permission'], ['Face recognition', 'permission'], ['Domain lock', 'credential'],
    ['WHOIS privacy', 'permission'], ['Block public access', 'permission'], ['Audit logs', 'permission']]) {
    for (const checked of [true, false]) assert.equal(sw(name, checked), cls, `${name} checked ${checked}`)
  }
})
