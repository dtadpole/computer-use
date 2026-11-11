import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-492 + CU-493 (High; cu-coordinator 10:36Z): cloud-console widenings and MFA-fatigue approvals ask in their ruled class. Click and Space.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://console.example/storage'
const at = (name, key = false) => {
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } })
  return v.decision === 'allow' ? 'allow' : v.class
}

test('CU-492: Empty bucket deletes; open-to-all rules and disabling encryption / versioning ask permission', () => {
  for (const [name, cls] of [['Empty bucket', 'delete'], ['Add rule 0.0.0.0/0', 'permission'], ['Add rule ::/0', 'permission'], ['Allow all traffic', 'permission'],
    ['Disable encryption', 'permission'], ['Disable versioning', 'permission'], ['Suspend versioning', 'permission']]) {
    assert.equal(at(name), cls, name)
    assert.equal(at(name, true), cls, `Space: ${name}`)
  }
  assert.equal(at('Delete bucket'), 'delete', 'the ruled neighbour')
})

test("CU-493: 'Yes, it's me' and its kin ask as 'Approve sign-in'; linking a device asks as 'Add device'", () => {
  const approve = at('Approve sign-in')
  assert.notEqual(approve, 'allow')
  for (const name of ["Yes, it's me", 'This was me', 'It was me', 'Allow sign-in']) {
    assert.equal(at(name), approve, name)
    assert.equal(at(name, true), approve, `Space: ${name}`)
  }
  const add = at('Add device')
  for (const name of ['Link a device', 'Link device']) assert.equal(at(name), add, name)
})

test('CU-492 + CU-493 negatives stay free', () => {
  for (const name of ['Bucket details', 'Add rule', "No, it wasn't me", "This wasn't me", 'Review activity', 'Encryption settings', 'Versioning']) assert.equal(at(name), 'allow', name)
})
