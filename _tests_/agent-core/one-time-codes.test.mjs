import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-604: one-time codes in six languages and the German bank TAN family are sensitive_data, as 'One-time code' / 'OTP' are.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const field = (name) => { const r = policy.classify({ type: 'type', text: '123456' }, { url: 'https://bank.example/login', target: { tag: 'input', role: 'textbox', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-604: one-time codes and TANs are sensitive_data', () => {
  for (const name of ['TAN', 'mTAN', 'SMS-TAN', 'pushTAN', 'chipTAN', 'TAN-Nummer', 'TAN eingeben', 'Code à usage unique', 'Code reçu par SMS', 'Código de un solo uso',
    'Código recibido por SMS', 'Código de acesso único', 'Codice monouso', 'Codice ricevuto via SMS', 'Tek kullanımlık kod', 'Tek kullanımlık kodunuz', 'SMS kodu']) assert.ok(field(name).includes('sensitive_data'), name)
})

test('CU-607: a one-time PASSWORD asks as English \'One-time password\' does (credential); one-time codes stay sensitive_data', () => {
  for (const name of ['Einmalpasswort', 'Eenmalig wachtwoord']) assert.deepEqual(field(name), field('One-time password'), name)
})

test('CU-604 negatives: tan inside words, colours and plain SMS settings stay free', () => {
  for (const name of ['Tango', 'Tan colour', 'Sultan', 'Titan', 'SMS-Benachrichtigungen', 'Recibir SMS', 'Code postal', 'Codice postale', 'Código postal']) assert.ok(!field(name).includes('sensitive_data'), name)
})
