import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-606: 'Palavra-passe', access codes and two-factor recovery codes ask, each in its twin's class.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const field = (name) => { const r = policy.classify({ type: 'type', text: 'x' }, { url: 'https://app.example/login', target: { tag: 'input', role: 'textbox', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-606: English access code asks credential like passcode; recovery code asks sensitive_data like backup code', () => {
  assert.ok(field('Access code').includes('credential'))
  assert.deepEqual(field('Passcode'), field('Access code'))
  for (const name of ['Recovery code', 'Recovery codes']) assert.deepEqual(field(name), field('Backup code'), name)
})

test('CU-606: Palavra-passe and the locale access / recovery codes ask like the locale password words', () => {
  const twin = field('Senha')
  for (const name of ['Palavra-passe', 'Palavra passe', 'Zugangscode', "Code d'accès", 'Código de acceso', 'Clave de acceso', 'Código de acesso', 'Codice di accesso', 'Toegangscode', 'Erişim kodu',
    'Wiederherstellungscode', 'Code de récupération', 'Código de recuperación', 'Codice di recupero', 'Herstelcode', 'Kurtarma kodu', 'Kurtarma kodunuz']) assert.deepEqual(field(name), twin, name)
})

test('CU-606 negatives: access and recovery words without a code stay free', () => {
  for (const name of ['Access level', 'Zugangsart', "Point d'accès", 'Acceso rápido', 'Wiederherstellung starten', 'Récupération du compte', 'Clave']) assert.deepEqual(field(name), [], name)
})
