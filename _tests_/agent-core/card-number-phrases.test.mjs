import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-599: the card number with a possessive or 'of' is sensitive_data like the compound 'card number', in five languages.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const field = (name) => { const r = policy.classify({ type: 'type', text: 'x' }, { url: 'https://shop.example/checkout', target: { tag: 'input', role: 'textbox', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-599: possessive and of-forms of the card number are sensitive_data', () => {
  for (const name of ["Your card's number", 'Your card’s number', 'Number of your card', 'Number on your card', 'Number on the credit card', 'Numéro de votre carte', 'Nummer Ihrer Karte',
    'Nummer Ihrer Kreditkarte', 'Número de su tarjeta', 'Número do seu cartão', 'Numero della tua carta']) assert.ok(field(name).includes('sensitive_data'), name)
})

test('CU-599 negatives: other numbers and other cards stay as they were', () => {
  for (const name of ['Number of cards', 'Order number', 'Card holder name', 'Gift card message', 'Nummer Ihrer Bestellung', 'Número de su pedido']) assert.ok(!field(name).includes('sensitive_data'), name)
})
