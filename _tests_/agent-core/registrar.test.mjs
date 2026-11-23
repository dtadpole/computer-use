import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-501 (High; cu-coordinator 13:21Z): registrar rows as verb families, each adding beside an older class. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://registrar.example/domains/example.com'
const classesOf = (name, key = false) => {
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-501: a domain handed over asks purchase (the class of Transfer out); older classes stay beside it', () => {
  for (const name of ['Push domain to another account', 'Push domains to another registrar', 'Move domain to another account', 'Give domain to another user']) {
    assert.ok(classesOf(name).includes('purchase'), name)
    assert.ok(classesOf(name, true).includes('purchase'), `Space: ${name}`)
  }
  // The rows CU-446 ruled keep their class exactly (D-108; named): credential for push / registrant / unlock, permission for ownership.
  for (const name of ['Push domain', 'Change registrant', 'Unlock domain', 'Turn off domain lock']) assert.deepEqual(classesOf(name).slice(0, 1), ['credential'], name)
  assert.deepEqual(classesOf('Transfer ownership').slice(0, 1), ['permission'])
})

test('CU-501: MX / nameserver changes, DNSSEC off and a domain unlocked ask permission', () => {
  for (const name of ['Change MX records', 'Edit MX record', 'Edit nameservers', 'Update name servers', 'Use custom nameservers', 'Disable DNSSEC', 'Turn off DNSSEC']) assert.ok(classesOf(name).includes('permission'), name)
})

test('CU-501 negatives: views stay free', () => {
  for (const name of ['DNS records', 'Nameservers', 'Domain settings', 'MX records']) assert.deepEqual(classesOf(name), [], name)
})

test("CU-414's split (13:51Z): giving remote control asks permission like Allow remote control", () => {
  for (const name of ['Give remote control', 'Give control', 'Give remote control to Alex', 'Grant mouse and keyboard control']) assert.ok(classesOf(name).includes('permission'), name)
  assert.deepEqual(classesOf('Remote control settings'), [], 'a view stays free')
})

test('#688 round 2 (cu-researcher 14:21Z): object synonyms', () => {
  for (const name of ['Push to another account', 'Transfer to a different account', 'Change domain owner account']) assert.ok(classesOf(name).includes('purchase'), name)
  assert.deepEqual(classesOf('Change domain owner').slice(0, 1), ['credential'], 'CU-446\'s older credential leads')
  assert.ok(classesOf('Push to another account').includes('purchase'))
  for (const name of ['Update mail servers', 'Change mail exchangers', 'Edit mail server']) assert.ok(classesOf(name).includes('permission'), name)
  assert.deepEqual(classesOf('Replace mail server'), ['delete'], 'the older replace row keeps its class (D-108)')
})
