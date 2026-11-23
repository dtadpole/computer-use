import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-481 (High; cu-coordinator 04:51Z): a leading-verb synonym of a ruled row asks as the row does - one more canonical form (modify ->
// change, display / reveal -> show, give -> grant, begin -> start, ask for -> request, create -> add), tried only when the name as written
// gets no class (adds only), through the whole classifier.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/settings', target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-481: verb synonyms ask as their ruled row', () => {
  for (const [synonym, row] of [['Modify direct deposit', 'Change direct deposit'], ['Display password', 'Show password'], ['Give proxy access', 'Grant proxy access'],
    ['Begin sharing location', 'Start sharing location'], ['Create email alias', 'Add email alias'], ['Modify my direct deposit', 'Change direct deposit']]) {
    const want = click(row)
    assert.notEqual(want, 'allow', `${row} asks`)
    assert.equal(click(synonym), want, synonym)
  }
})

test('CU-481 negatives: synonyms of free rows stay free', () => {
  for (const name of ['Modify view', 'Display settings', 'Give feedback', 'Begin tour', 'Create folder', 'Ask for help']) assert.equal(click(name), 'allow', name)
})

test('CU-481: a synonym never outranks a row the name already matches', () => {
  assert.equal(click('Create service account key'), 'credential', 'CU-447 keeps credential (not the synonym form Add ... permission)')
})

test("#627 round 2 (cu-researcher 05:08Z; cu-verifier 05:09Z): 'Create account' stays free; cu-verifier's stand-in synonyms ask", () => {
  for (const name of ['Create account', 'Create an account', 'Create new account']) assert.equal(click(name), 'allow', name)
  for (const name of ['Modify user role', 'Reveal eSIM QR code']) assert.notEqual(click(name), 'allow', name)
  // 'Update audience to Public' was named free here (outside the six); the 06:34Z follow-up maps update -> change (test below).
})

test('CU-481 follow-up (cu-coordinator 06:34Z): update / edit -> change, tried last', () => {
  assert.equal(click('Update audience to Public'), click('Change audience to Public'))
  assert.notEqual(click('Update audience to Public'), 'allow')
  for (const name of ['Update profile', 'Update app', 'Edit profile', 'Edit photo', 'Update all', 'Update now']) assert.equal(click(name), 'allow', name)
  assert.equal(click('Update direct deposit'), 'credential', 'its own row leads')
})

test('CU-481 residual (cu-coordinator 06:49Z): firmware, DNS on a registrar URL, and granted minutes', () => {
  const at = (name, url) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
  for (const name of ['Edit firmware', 'Modify firmware', 'Change firmware']) assert.equal(at(name, 'http://router.example/admin'), 'install', name)
  for (const name of ['Update DNS', 'Change DNS']) {
    assert.equal(at(name, 'https://registrar.example/domain/x'), 'permission', name)
    assert.equal(at(name, 'https://app.example/settings'), 'allow', `${name} off a registrar URL (named limit)`)
  }
  // '... DNS records' is already a grammar row on any page (permission); 'Update DNS records' matches it as written.
  assert.equal(at('Update DNS records', 'https://registrar.example/domain/x'), 'permission')
  assert.equal(at('Grant 30 more minutes', 'https://families.example/child'), 'permission')
  assert.equal(at('Give 30 more minutes', 'https://families.example/child'), 'permission')
  assert.equal(at('Update SIM', 'https://carrier.example/account'), 'credential')
  for (const name of ['Edit name', 'Change theme', 'View grants']) assert.equal(at(name, 'https://app.example/settings'), 'allow', name)
})

test("#640 round 2 (cu-researcher 07:15Z): 'Update DNS settings' joins the registrar row", () => {
  const at = (name, url) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
  assert.equal(at('Update DNS settings', 'https://registrar.example/domain/x'), 'permission')
  assert.equal(at('Update DNS settings', 'https://app.example/settings'), 'allow', 'off a registrar URL (named limit)')
})
