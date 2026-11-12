import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-533 (High; cu-coordinator 00:21Z), table PR 36: an organisation's security settings ask permission. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, key = false) => {
  const url = 'https://code.example/organizations/acme/settings/security'
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-533: the ruled org-security rows ask permission', () => {
  for (const name of ['Disable SAML SSO', 'Turn off SSO enforcement', 'Disable single sign-on', 'Disable IP allow list', 'Turn off IP allowlist', 'Disable audit log streaming', 'Stop audit logging', 'Allow forking of private repositories', 'Allow forking of private and internal repositories']) {
    assert.ok(classesOf(name).includes('permission'), name)
    assert.ok(classesOf(name, true).includes('permission'), `Space: ${name}`)
  }
})

test('CU-533 negatives and older rows', () => {
  for (const name of ['Test SSO connection', 'Enable SSO', 'SSO settings', 'IP allow list', 'Audit log', 'Allow forking']) assert.deepEqual(classesOf(name), [], name)
  assert.ok(classesOf('Disable two-factor requirement').includes('permission'), 'older row unchanged')
  assert.ok(classesOf('Remove IP allow list').includes('delete'), 'older row unchanged')
})

test('#769 round 2 (cu-researcher 00:33Z): stop requiring SSO, the hyphened audit log, private repository forking', () => {
  for (const name of ['Stop requiring SAML', 'Stop enforcing SSO', 'Stop requiring SAML SSO', 'Stop audit-log streaming', 'Disable audit-log streaming', 'Allow private repository forking', 'Enable private repo forking', 'Enable forking of private repositories']) assert.ok(classesOf(name).includes('permission'), name)
  for (const name of ['Repository forking', 'Audit-log streaming', 'Forking policy']) assert.deepEqual(classesOf(name), [], name)
})
