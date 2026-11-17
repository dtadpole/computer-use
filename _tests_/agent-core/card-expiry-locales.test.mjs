import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-600: the card's expiry in German, Spanish, Portuguese, Italian and French, and the spelled-out card verification value,
// are sensitive_data like English 'Expiration date' and 'CVV'.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const field = (name) => { const r = policy.classify({ type: 'type', text: 'x' }, { url: 'https://shop.example/checkout', target: { tag: 'input', role: 'textbox', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-600: locale card-expiry labels and the spelled-out verification value are sensitive_data', () => {
  for (const name of ['Ablaufdatum', 'Karten-Ablaufdatum', 'Gültig bis', 'Fecha de caducidad', 'Fecha de vencimiento', 'Data de validade', 'Data di scadenza', 'Date de validité',
    'Card verification value', 'Card verification code']) assert.ok(field(name).includes('sensitive_data'), name)
})

test('CU-600 negatives: bare due dates and shelf lives stay as they were', () => {
  for (const name of ['Vencimiento', 'Validade', 'Scadenza', 'Lieferdatum', 'Fecha de entrega', 'Data di consegna']) assert.ok(!field(name).includes('sensitive_data'), name)
})
