import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-603: national health-insurance numbers are sensitive_data, as 'Health insurance number' and 'NHS number' are.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const field = (name) => { const r = policy.classify({ type: 'type', text: 'x' }, { url: 'https://clinic.example/register', target: { tag: 'input', role: 'textbox', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-603: health-insurance numbers in six languages and the member number are sensitive_data', () => {
  for (const name of ['Versichertennummer', 'Krankenversichertennummer', 'Número de la seguridad social', 'Tarjeta sanitaria', 'Número do SNS', 'Número de utente', 'Tessera sanitaria',
    'Codice della tessera sanitaria', 'Zorgverzekeringsnummer', 'Sağlık sigortası numarası', 'Sağlık sigorta numaranız', 'Insurance member number', 'Insurance member ID',
    'Versicherten-Nr.', "Numéro d'assuré", 'Numéro d’assuré', "N° d'assuré"]) assert.ok(field(name).includes('sensitive_data'), name)
})

test('CU-603 negatives: the insurer, a bare member or patient id, and appointment fields stay as they were', () => {
  for (const name of ['Krankenkasse', 'Member ID', 'Patient ID', 'Terminwunsch', 'Fecha de la cita', 'Nome del medico', 'Sigorta şirketi']) assert.ok(!field(name).includes('sensitive_data'), name)
})
