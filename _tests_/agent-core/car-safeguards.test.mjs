import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-555 (High, safety; cu-coordinator 06:21Z), folded into table PR 50: a connected car's safeguards turned off ask permission; their
// switches take the safeguard direction rule. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://car.example/vehicle/controls'
const classesOf = (name, key = false) => {
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-555: car safeguards turned off ask permission', () => {
  for (const name of ['Disable speed limit mode', 'Disable curfew', 'Turn off driver monitoring', 'Disable teen driver mode', 'Turn off valet mode', 'Exit valet mode', 'Turn off speed limiter']) {
    assert.ok(classesOf(name).includes('permission'), name)
    assert.ok(classesOf(name, true).includes('permission'), `Space: ${name}`)
  }
  for (const name of ['Valet mode', 'Curfew', 'Speed limit', 'Enable valet mode']) assert.deepEqual(classesOf(name), [], name)
  for (const name of ['Turn off speed alerts', 'Turn off parental controls']) assert.ok(classesOf(name).includes('permission'), `older row: ${name}`)
})

test('CU-555: the car safeguard switches - on -> off and unread ask, off -> on free', () => {
  for (const name of ['Speed limit mode', 'Curfew', 'Driver monitoring', 'Teen driver mode', 'Valet mode']) {
    const sw = (checked) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'switch', name, ...(checked === undefined ? {} : { tag: 'input', inputType: 'checkbox', checked }) } }); return v.decision === 'allow' ? [] : (v.classes ?? [v.class]) }
    assert.ok(sw(true).includes('permission'), `${name}: on -> off asks`)
    assert.ok(sw(undefined).includes('permission'), `${name}: unread asks`)
    assert.deepEqual(sw(false), [], `${name}: off -> on is free`)
  }
})

test("#814 round 3 (cu-researcher 06:27Z): 'Exit restricted driving profile', 'Stop monitoring my teen's driving' ask permission", () => {
  for (const name of ['Exit restricted driving profile', "Stop monitoring my teen's driving", 'Turn off teen driver profile']) assert.ok(classesOf(name).includes('permission'), name)
  for (const name of ['Driving profile', 'Stop navigation']) assert.deepEqual(classesOf(name), [], name)
})

test("#814 round 4 (cu-researcher 06:38Z): 'Stop monitoring driving' asks permission", () => {
  for (const name of ['Stop monitoring driving', 'Stop monitoring location']) assert.ok(classesOf(name).includes('permission'), name)
})

test('#814 round 4 (cu-coordinator 06:51Z): the whole car-safeguard family', () => {
  for (const name of ['Override speed limiter', 'Bypass curfew', 'Remove geofence', 'Stop teen monitoring', "Pause monitoring my kid's location", 'Leave restricted mode', 'End driver attention monitoring']) assert.ok(classesOf(name).includes('permission'), name)
  for (const name of ['Stop monitoring', 'Stop', 'Monitoring']) assert.deepEqual(classesOf(name), [], name)
})

test("#814 round 4 (cu-developer-two 06:54Z): 'Stop monitoring their / my driving' ask permission; a bare-site hide asks submit", () => {
  for (const name of ['Stop monitoring their driving', 'Stop monitoring my driving']) assert.ok(classesOf(name).includes('permission'), name)
  assert.ok(classesOf('Hide site from the public').includes('submit'), 'Hide site from the public')
})
