import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy, looksSensitive } from '../../_tools_/agent-core/policy.mjs'
import { j } from '../fixture-shapes/shapes.mjs'

// CU-245 (cu-researcher's red team of the D-061 table): typed unasked on main 46e6d65 - an SSN in spaced groups, a PEM
// private key, a JWT, and entries named 'Bank account', 'Debit card', 'Recovery key', 'Backup codes'. Each is judged
// on the browser's class policy and on the real desktop path (createAppPolicy with url desktop://, CU-243's lesson).
// Values are built from fragments (public hygiene).
const SSN_SPACED = ['123', '45', '6789'].join(' ')
const PEM = [j('-----', 'BEGIN'), 'RSA', 'PRIVATE', j('KEY', '-----'), 'MIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu'].join(' ')
const b64 = (object) => Buffer.from(JSON.stringify(object)).toString('base64url')
const JWT = [b64({ alg: 'HS256', typ: 'JWT' }), b64({ sub: '1234567890', name: 'Test' }), 'SflKxwRJSMeKKF2QT4fwpMeJf36P'].join('.')

const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-245-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
const store = createAppApprovals({ path: join(tmp, 'a.json') })
store.grantAlways(FIXTURE, { by: 'api' })
const desktop = createAppPolicy({ scope: [FIXTURE], approvals: store })
const web = createPolicy({ sitePolicy: () => 'allow' })
const type = (text) => ({ type: 'type', text })
const judged = (v) => (v.decision === 'allow' ? 'allow' : v.decision === 'handoff' ? 'handoff' : v.class)
const both = (text, name) => [
  judged(web.classify(type(text), { url: 'https://other.example/form', target: { tag: 'input', role: 'textbox', name, editable: true } })),
  judged(desktop.classify(type(text), { frontmostBundleId: FIXTURE, target: { origin: FIXTURE, role: 'AXTextField', name, editable: true, fingerprint: 'e', defaultButtonRead: true } })),
]

test('CU-245 values: a spaced SSN, a PEM private key and a JWT ask sensitive_data on both paths, typed into an unnamed entry', () => {
  for (const [label, value] of [['spaced SSN', SSN_SPACED], ['PEM private key', PEM], ['JWT', JWT]]) {
    assert.deepEqual(both(value, ''), ['sensitive_data', 'sensitive_data'], label)
  }
  assert.equal(looksSensitive(SSN_SPACED), 'national_id')
  assert.equal(looksSensitive(PEM), 'key')
  assert.equal(looksSensitive(JWT), 'key')
})

test('CU-245 names: Bank account, Debit card, Recovery key and Backup codes ask whatever is typed, on both paths', () => {
  for (const name of ['Bank account', 'Debit card', 'Recovery key', 'Backup code', 'Backup codes']) {
    assert.deepEqual(both('hello', name), ['sensitive_data', 'sensitive_data'], name)
  }
})

test('CU-245 negatives: SSN issuing rules, other PEM blocks, a non-JWT dotted string, and nearby names stay allowed', () => {
  for (const spaced of [['000', '45', '6789'], ['666', '45', '6789'], ['912', '45', '6789'], ['123', '00', '6789'], ['123', '45', '0000']]) {
    assert.equal(looksSensitive(spaced.join(' ')), null, `${spaced.join(' ')} fails the issuing rules`)
  }
  assert.equal(looksSensitive([j('-----', 'BEGIN'), 'PUBLIC', j('KEY', '-----')].join(' ')), null, 'a public key block')
  assert.equal(looksSensitive([j('-----', 'BEGIN'), j('CERTIFICATE', '-----')].join(' ')), null, 'a certificate')
  assert.equal(looksSensitive(['eyJub3Rqc29u', 'abcdefgh', 'ijklmnop'].join('.')), null, 'eyJ prefix without a JSON header')
  assert.equal(looksSensitive([b64({ typ: 'none' }), 'abcdefgh', 'ijklmnop'].join('.')), null, 'a JSON header without alg')
  assert.equal(looksSensitive('version 1.24.3'), null, 'a dotted version string')
  assert.equal(looksSensitive('ABCDE-12345-FGHIJ-67890-KLMNO'), null, 'a product key in 5x5 groups')
  for (const name of ['Account name', 'Card holder', 'Recovery options', 'Backup folder']) {
    assert.deepEqual(both('hello', name), ['allow', 'allow'], name)
  }
})
