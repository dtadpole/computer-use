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

test('#813 round 3 (cu-researcher 06:26Z): the held-out escapes ask', () => {
  for (const [name, cls] of [['Separate employee', 'delete'], ['Begin termination', 'delete'], ['Set last working day and terminate', 'delete'], ['Elevate to people lead', 'permission'], ['Get a copy of my chart', 'permission'], ['Save visit history as PDF', 'permission']]) assert.ok(at(name, name.match(/chart|visit/i) ? PORTAL : HR).includes(cls), name)
  for (const name of ['Termination date', 'Visit history']) assert.deepEqual(at(name, HR), [], name)
  assert.deepEqual(at('Separation pay', HR), ['purchase'], 'an older pay row keeps purchase')
})

test("#813 round 4 (cu-verifier 06:31Z): 'Email my lab results' asks permission", () => {
  for (const name of ['Email my lab results', 'Send my lab results', 'Save my test results']) assert.ok(at(name, PORTAL).length > 0, name)
  assert.ok(at('Email my lab results', PORTAL).includes('permission'))
})

test("#813 round 5 (cu-coordinator 06:36Z): 'Download visit summary' asks permission", () => {
  for (const name of ['Download visit summary', 'Print after-visit summary', 'Email my discharge summary']) assert.ok(at(name, PORTAL).includes('permission'), name)
  assert.deepEqual(at('Visit summary', PORTAL), [], 'the label stays free')
})

test("#813 round 5 (06:36Z): 'Send my lab results' keeps the older submit and adds permission (a union)", () => {
  for (const name of ['Send my lab results', 'Send my test results']) { const c = at(name, PORTAL); assert.ok(c.includes('submit') && c.includes('permission'), `${name}: ${c}`) }
})

test('#813 round 5 (cu-researcher 06:37Z): the r2-line shapes ask', () => {
  for (const [name, cls, url] of [['Separate this person', 'delete', HR], ['Review and terminate', 'delete', HR], ['Move to director', 'permission', HR], ['Save my records as PDF', 'permission', PORTAL]]) assert.ok(at(name, url).includes(cls), name)
  assert.deepEqual(at('Save my records as PDF', CRM), [], 'off a portal the bare records form stays free')
})

test('#813 round 5 (cu-coordinator 06:51Z): the whole verb x object x tail families', () => {
  for (const name of ['Release this employee', 'Discharge worker', 'Lay off them', 'Fire this person from the company', 'Finalize separation', 'Approve and offboard', 'Confirm details and fire']) assert.ok(at(name, HR).includes('delete'), name)
  assert.ok(at('Submit termination request', HR).length > 0, 'asks - an older submit row leads (named)')
  for (const name of ['Advance to director', 'Move this employee to team lead', 'Promote them to head of sales']) assert.ok(at(name, HR).includes('permission'), name)
  for (const name of ['Request a copy of my medical records', 'Email my visit history as PDF', 'Send my health summary to my email', 'Obtain my chart', 'Download all of my clinical data as a zip']) assert.ok(at(name, PORTAL).includes('permission'), name)
  for (const name of ['Termination', 'Separation', 'Offboarding', 'Termination process', 'Move to folder', 'Chart']) assert.deepEqual(at(name, HR), [], name)
})

test("#813 round 6 (cu-developer-three 06:59Z): the promote family's object slot takes any pronoun or name", () => {
  for (const name of ['Promote her to manager', 'Promote him to director', 'Promote Dana Lee to team lead', 'Elevate them to admin', 'Make him an admin', 'Make her a manager', 'Move her to supervisor']) assert.ok(at(name, HR).includes('permission'), name)
  for (const name of ['Move file to admin', 'Promote post']) assert.ok(!at(name, HR).includes('permission'), name)
})

test("#813 round 6 (cu-researcher 07:01Z): 'Make director' and a portal's 'Email my records' ask permission", () => {
  for (const name of ['Make director', 'Make supervisor', 'Make team lead', 'Make her a director']) assert.ok(at(name, HR).includes('permission'), name)
  assert.ok(at('Email my records', PORTAL).includes('permission'), 'portal: Email my records')
  assert.deepEqual(at('Email my records', CRM), [], 'CRM: Email my records stays free')
})
