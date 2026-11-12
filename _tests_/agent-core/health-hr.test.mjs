import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-552 + CU-553 (High; cu-coordinator 05:21Z), table PR 49: health-record downloads ask permission; the HR termination family asks
// delete, promote / make manager asks permission. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const at = (name, url, key = false) => {
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}
const PORTAL = 'https://mychart.example/patient/records'
const HR = 'https://hr.example/employees/123'
const CRM = 'https://crm.example/accounts'

test('CU-552: health-record downloads ask permission', () => {
  for (const name of ['Export medical records', 'Download health summary', 'Download my medical records', 'Print health history', 'Download lab results']) {
    for (const url of [PORTAL, CRM]) assert.ok(at(name, url).includes('permission'), `${url}: ${name}`)
    assert.ok(at(name, PORTAL, true).includes('permission'), `Space: ${name}`)
  }
  assert.ok(at('Download all records', PORTAL).includes('permission'), 'a portal page binds the bare form')
  assert.deepEqual(at('Download all records', CRM), [], 'a CRM keeps it free')
  for (const name of ['Medical records', 'Health summary']) assert.deepEqual(at(name, PORTAL), [], name)
})

test('CU-553: the HR termination family asks delete; promote / make manager asks permission', () => {
  for (const [name, cls] of [['End employment', 'delete'], ['Dismiss employee', 'delete'], ['Fire employee', 'delete'], ['Process termination', 'delete'], ['Mark as terminated', 'delete'], ['Start offboarding', 'delete'], ['Let go of this employee', 'delete'], ['Promote to manager', 'permission'], ['Make manager', 'permission'], ['Make them a manager', 'permission']]) {
    assert.ok(at(name, HR).includes(cls), name)
    assert.ok(at(name, HR, true).includes(cls), `Space: ${name}`)
  }
  for (const name of ['Let go', 'Dismiss']) {
    assert.ok(at(name, HR).includes('delete'), `HR page: ${name}`)
    assert.deepEqual(at(name, CRM), [], `elsewhere: ${name}`)
  }
  for (const name of ['Employees', 'Offboarding checklist', 'Termination policy']) assert.deepEqual(at(name, HR), [], name)
  assert.ok(at('Terminate employee', HR).includes('delete'), 'older row unchanged')
})

test("#813 round 2 (cu-developer-three 06:16Z): 'Terminate employment' asks delete, 'Promote employee' asks permission", () => {
  assert.ok(at('Terminate employment', HR).includes('delete'))
  assert.ok(at('Promote employee', HR).includes('permission'))
  assert.ok(at('Promote this employee', CRM).includes('permission'), 'unbound like the filed rows')
  assert.deepEqual(at('Promotions', HR), [], 'Promotions')
  assert.deepEqual(at('Promote post', HR), ['submit'], 'an older ad-promotion row keeps submit')
})
