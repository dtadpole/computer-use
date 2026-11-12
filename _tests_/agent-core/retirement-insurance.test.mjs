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
