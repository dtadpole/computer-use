import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-629: one adverb inside a cancel / end subscription-family label keeps the English twin's class.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/account/subscription', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-629: cancel subscription with one adverb inside asks delete', () => {
  for (const name of ['Abonnement direct opzeggen', 'Abonnement nu opzeggen', 'Abo jetzt kündigen', 'Abonnement sofort kündigen', 'Kündigen Sie jetzt Ihr Abo', "Annuler maintenant l'abonnement",
    'Cancelar ahora la suscripción', 'Cancelar agora a assinatura', "Annulla subito l'abbonamento", 'Aboneliği hemen iptal et']) assert.ok(click(name).includes('delete'), name)
})

test('CU-629: end subscription / any membership verb with one adverb inside asks purchase', () => {
  for (const name of ['Mitgliedschaft sofort beenden', 'Abo jetzt beenden', 'Lidmaatschap direct opzeggen', 'Abonnement nu stopzetten', 'Üyeliği hemen iptal et', 'Cancelar ahora la membresía', 'End subscription now']) assert.ok(click(name).includes('purchase'), name)
})

test('CU-629 negatives: an adverb alone or with a page noun stays free', () => {
  for (const name of ['Jetzt', 'Abo jetzt ansehen', 'Abonnement nu bekijken', 'Plan ahora', 'Mi suscripción ahora', 'Annulla subito']) assert.deepEqual(click(name), [], name)
})
