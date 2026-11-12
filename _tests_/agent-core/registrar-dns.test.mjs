import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-537 (High; cu-coordinator 01:06Z), table PR 38: registrar DNS. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, url, key = false) => {
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}
const DNS = 'https://registrar.example/domains/example.com/dns'
const CRM = 'https://crm.example/contacts/1'

test('CU-537: typed record adds ask permission everywhere', () => {
  for (const name of ['Add MX record', 'Add CNAME record', 'Add TXT record', 'Add A record', 'Add AAAA record', 'Create SRV record']) {
    for (const url of [DNS, CRM]) assert.ok(classesOf(name, url).includes('permission'), `${url}: ${name}`)
    assert.ok(classesOf(name, DNS, true).includes('permission'), `Space: ${name}`)
  }
})

test('CU-537: the generic record buttons ask on a DNS page only', () => {
  for (const name of ['Add record', 'Edit record', 'Save record', 'Add a record']) {
    assert.ok(classesOf(name, DNS).includes('permission'), `DNS page: ${name}`)
    assert.deepEqual(classesOf(name, CRM), [], `a CRM stays free: ${name}`)
  }
  for (const name of ['DNS records', 'MX record', 'Auto-renew']) assert.deepEqual(classesOf(name, DNS), [], name)
  assert.ok(classesOf('Add DNS record', CRM).includes('permission'), 'older row unchanged')
})

test("CU-537: a domain's auto-renew off asks on a domain / registrar page; a subscription's stays free (CU-410)", () => {
  for (const name of ['Disable auto-renew', 'Turn off auto-renew', 'Turn off auto-renewal']) {
    assert.ok(classesOf(name, DNS).includes('permission'), `domain page: ${name}`)
    assert.ok(classesOf(name, 'https://registrar.example/domains/example.com').includes('permission'), `domain page 2: ${name}`)
    assert.deepEqual(classesOf(name, 'https://stream.example/account/subscription'), [], `subscription: ${name}`)
  }
})

test('#774 round 2 (cu-researcher 01:16Z): automatic renewal; change / update record on DNS pages', () => {
  for (const name of ['Turn off automatic renewal', 'Disable automatic renewal']) {
    assert.ok(classesOf(name, DNS).includes('permission'), name)
    assert.deepEqual(classesOf(name, 'https://stream.example/account/subscription'), [], `subscription: ${name}`)
  }
  for (const name of ['Change record', 'Update record']) {
    assert.ok(classesOf(name, DNS).includes('permission'), name)
    assert.deepEqual(classesOf(name, CRM), [], `CRM: ${name}`)
  }
  assert.ok(classesOf('Update DNS record', CRM).includes('permission'), 'the older DNS-record row asks anywhere')
})
