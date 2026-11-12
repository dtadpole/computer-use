import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-559 (High, money / fraud; cu-coordinator 08:06Z), table PR 52: beneficiary changes ask permission; a 401(k) loan / an IRA rollover ask
// purchase; surrendering / lapsing a policy asks delete. Whole verb families from r1. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, key = false) => {
  const url = 'https://retire.example/account'
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-559: beneficiary changes, retirement loans / rollovers and policy surrender ask their ruled class', () => {
  for (const [name, cls] of [['Change beneficiary', 'permission'], ['Change primary beneficiary', 'permission'], ['Update beneficiary percentages', 'permission'], ['Edit contingent beneficiaries', 'permission'], ['Designate a beneficiary', 'permission'],
    ['Take a loan from 401(k)', 'purchase'], ['Take out a loan against my 401k', 'purchase'], ['Request a loan from my retirement account', 'purchase'], ['Borrow against policy', 'purchase'], ['Roll over to IRA', 'purchase'], ['Roll over my 401(k) to a Roth IRA', 'purchase'], ['Start a rollover', 'purchase'],
    ['Surrender policy', 'delete'], ['Lapse policy', 'delete'], ['Surrender my life insurance policy', 'delete'], ['Let policy lapse', 'delete'], ['Terminate annuity', 'delete']]) {
    assert.ok(classesOf(name).includes(cls), name)
    assert.ok(classesOf(name, true).includes(cls), `Space: ${name}`)
  }
  for (const name of ['Beneficiaries', 'Loans', 'Rollover options', 'Policy details', 'View beneficiary']) assert.deepEqual(classesOf(name), [], name)
  for (const [name, cls] of [['Add beneficiary', 'permission'], ['Request withdrawal', 'purchase'], ['Cancel policy', 'delete']]) assert.ok(classesOf(name).includes(cls), `older row: ${name}`)
})

test("#825 round 2 (cu-developer-three 08:09Z): 'Take a 401(k) loan', 'Roll over my IRA'", () => {
  for (const name of ['Take a 401(k) loan', 'Request a retirement loan', 'Take out a 401k loan', 'Roll over my IRA', 'Roll over my old 401(k)', 'Transfer my pension']) assert.ok(classesOf(name).includes('purchase'), name)
  for (const name of ['401(k) loan', 'IRA']) assert.deepEqual(classesOf(name), [], name)
})

test('#825 round 2 (cu-researcher 08:12Z): wrappers after 401(k), a new beneficiary, retirement savings, a bare Roll over on a retirement page', () => {
  for (const name of ['Take a loan from 401(k)\u2026', 'Take a loan from 401(k) now', 'Take a loan from 401(k) please', 'Take a loan from 401(k) \u2192', 'Borrow against my retirement savings']) assert.ok(classesOf(name).includes('purchase'), name)
  assert.ok(classesOf('Designate a new beneficiary').includes('permission'))
  const at = (name, url) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } }); return v.decision === 'allow' ? [] : (v.classes ?? [v.class]) }
  assert.ok(at('Roll over', 'https://retire.example/401k/rollover').includes('purchase'), 'retirement page: Roll over')
  assert.deepEqual(at('Roll over', 'https://games.example/play'), [], 'elsewhere: Roll over stays free')
})
