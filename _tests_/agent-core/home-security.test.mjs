import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-491 (High; cu-coordinator 10:19Z): on a home-security page, silencing an alarm and stopping a recording ask physical. Click and Space.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const HOME = 'https://home.example/security/panel'
const at = (name, url = HOME, key = false) => {
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? 'allow' : v.class
}

test('CU-491: on a security URL the alarm and recording rows ask physical, like Turn off alarm', () => {
  assert.equal(at('Turn off alarm'), 'physical')
  for (const name of ['Silence alarm', 'Mute siren', 'Pause recording', 'Stop recording', 'Snooze alarm']) {
    assert.equal(at(name), 'physical', name)
    assert.equal(at(name, HOME, true), 'physical', `Space: ${name}`)
  }
  for (const url of ['https://x.example/alarm', 'https://x.example/cameras/front', 'https://x.example/home-security']) assert.equal(at('Silence alarm', url), 'physical', url)
  // #659 round 2 (cu-researcher 10:26Z): a trailing on / for / from phrase keeps the row.
  for (const name of ['Stop recording on all cameras', 'Stop recording on front camera', 'Pause recording for 1 hour', 'Silence alarm for 10 minutes']) assert.equal(at(name), 'physical', name)
})

test("CU-491 negatives: off a security URL (#462's meeting Stop recording), lookalike segments, and views stay free", () => {
  for (const url of ['https://meet.example/call/42', 'https://x.example/securityguide', 'app:com.example.security']) assert.equal(at('Stop recording', url), 'allow', url)
  // A phone clock's /alarms is not a security page (the ruled segments exactly).
  for (const url of ['https://clock.example/alarms', 'https://clock.example/clock/alarms']) assert.equal(at('Snooze alarm', url), 'allow', url)
  for (const name of ['Alarm history', 'Recordings', 'Camera settings', 'Siren test schedule']) assert.equal(at(name), 'allow', name)
})
