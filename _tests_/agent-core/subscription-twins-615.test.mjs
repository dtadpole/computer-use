import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-615: the imperative / possessive twins named at #1007 r4 ask purchase, and 'bitte' counts as the adverb in the split rules.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (url, name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-615: imperative and possessive subscription twins ask purchase', () => {
  for (const name of ['Inicia tu suscripción', 'Empieza tu suscripción', 'Inicia la suscripción', 'Inicie sua assinatura', 'Avvia il tuo abbonamento', 'Premium plana geç', 'Premium planına geçin',
    "Passez à l'offre Premium", 'Passez à l’offre Pro', 'Passez à la version Pro', 'Abo bitte starten']) assert.ok(click('https://shop.example/plans', name).includes('purchase'), name)
})

test("CU-615: 'bitte' as the adverb in a split transfer confirmation", () => {
  for (const name of ['Überweisung bitte bestätigen', 'Überweisung bitte ausführen']) assert.ok(click('https://bank.example/transfer', name).includes('purchase'), name)
})

test('CU-615 negatives: sign-in, profile and layout forms stay free', () => {
  for (const name of ['Inicia tu sesión', 'Inicie sua sessão', 'Passez à la version mobile', 'Überweisung bitte prüfen', 'Plana göz at']) assert.deepEqual(click('https://app.example/settings', name), [], name)
})
