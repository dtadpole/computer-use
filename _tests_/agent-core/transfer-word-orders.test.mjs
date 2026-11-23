import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-611: a transfer noun then its confirming verb, with one adverb or a ':' / '-' between, asks purchase.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://bank.example/transfer', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-611: split transfer confirmations ask purchase', () => {
  for (const name of ['Überweisung jetzt ausführen', 'Überweisung jetzt bestätigen', 'Überweisung: ausführen', 'Virement : confirmer', 'Virement - valider', 'Virement maintenant confirmer',
    'Transferencia: confirmar', 'Transferencia ahora realizar', 'Transferência: confirmar', 'Overboeking: bevestigen', 'Overboeking nu uitvoeren', 'Transfer: onayla', 'Havaleyi şimdi onaylayın', 'Bonifico: conferma']) assert.ok(click(name).includes('purchase'), name)
})

test('CU-611 negatives: a transfer noun with a non-confirming word, or more text, stays as it was', () => {
  for (const name of ['Überweisung: Details', 'Virement : historique', 'Transferencia: estado', 'Overboeking: details bekijken', 'Überweisung jetzt ausführen? Mehr erfahren']) assert.deepEqual(click(name), [], name)
})
