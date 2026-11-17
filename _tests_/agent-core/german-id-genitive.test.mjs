import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-602: German ID fields in the genitive or hyphenated, and English 'Number of your ID card', are sensitive_data.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const field = (name) => { const r = policy.classify({ type: 'type', text: 'x' }, { url: 'https://gov.example/apply', target: { tag: 'input', role: 'textbox', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-602: genitive and hyphenated German ID fields and the ID-card of-form are sensitive_data', () => {
  for (const name of ['Nummer Ihres Reisepasses', 'Nummer des Reisepasses', 'Nummer des Ausweises', 'Nummer Ihres Personalausweises', 'Steuer-Identifikationsnummer', 'Sozialversicherungs-Nr.',
    'Sozialversicherungs-Nummer', 'Nummer Ihrer Krankenversicherung', 'Nummer Ihres Führerscheins', 'Number of your ID card', 'Number on your identity card']) assert.ok(field(name).includes('sensitive_data'), name)
})

test('CU-602 negatives: other German numbers and passes stay free', () => {
  for (const name of ['Nummer Ihrer Bestellung', 'Nummer des Pakets', 'Bordkarte', 'Nummer Ihres Tickets', 'Number of ID cards issued']) assert.ok(!field(name).includes('sensitive_data'), name)
})
