import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-558 (High, privacy; cu-coordinator 07:21Z), folded into table PR 51: downloading your information, showing your location on posts and
// letting anyone tag you ask permission, like 'Make account public'. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, key = false) => {
  const url = 'https://social.example/settings/privacy'
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-558: social privacy exposures ask permission', () => {
  for (const name of ['Download your information', 'Request a copy of my data', 'Download my archive', 'Show my location on posts', 'Add location to photos', 'Turn on location tagging', 'Let anyone tag me', 'Allow everyone to find me', "Let people I don't know mention me"]) {
    assert.ok(classesOf(name).length > 0, name)
    assert.ok(classesOf(name, true).length > 0, `Space: ${name}`)
  }
  for (const name of ['Download your information', 'Show my location on posts', 'Let anyone tag me']) assert.ok(classesOf(name).includes('permission'), `filed: ${name}`)
  for (const name of ['Your information', 'Location', 'Tags', 'Download app']) assert.deepEqual(classesOf(name), [], name)
  for (const name of ['Make account public', 'Allow messages from everyone']) assert.ok(classesOf(name).includes('permission'), `older row: ${name}`)
})
