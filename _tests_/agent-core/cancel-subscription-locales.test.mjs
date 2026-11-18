import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-625: cancelling a subscription asks delete and cancelling a membership or plan asks purchase in the seven locales, each as
// its exact English twin (cu-developer-one's class rule). My own twin battery, written before review.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/account/subscription', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-625: cancel subscription asks delete in seven languages', () => {
  for (const name of ['Abo kündigen', 'Abonnement kündigen', 'Kündigen Sie Ihr Abonnement', 'Kündige dein Abo', "Résilier l'abonnement", "Annuler l'abonnement", 'Résiliez votre abonnement',
    'Cancelar suscripción', 'Cancelar la suscripción', 'Cancela tu suscripción', 'Cancele su suscripción', 'Cancelar assinatura', 'Cancelar a assinatura', 'Cancele sua assinatura',
    'Annulla abbonamento', "Annulla l'abbonamento", 'Disdici abbonamento', 'Disdici il tuo abbonamento', 'Abonnement opzeggen', 'Zeg je abonnement op', 'Aboneliği iptal et', 'Aboneliğinizi iptal edin']) assert.ok(click(name).includes('delete'), name)
})

test('CU-625: cancel membership / plan asks purchase in seven languages', () => {
  for (const name of ['Mitgliedschaft kündigen', 'Kündigen Sie Ihre Mitgliedschaft', 'Tarif kündigen', "Résilier l'adhésion", 'Résilier mon forfait', 'Cancelar membresía', 'Cancelar mi plan',
    'Cancelar plano', 'Cancelar meu plano', 'Annulla piano', 'Disdici il piano', 'Lidmaatschap opzeggen', 'Zeg je lidmaatschap op', 'Üyeliği iptal et', 'Üyeliğinizi iptal edin', 'Planı iptal et']) assert.ok(click(name).includes('purchase'), name)
})

test('CU-625 negatives: subscription pages and plan details stay free', () => {
  for (const name of ['Abonnement', 'Mein Abo', "Détails de l'abonnement", 'Mi suscripción', 'Minha assinatura', 'Il mio abbonamento', 'Mijn abonnement', 'Aboneliğim', 'Kündigungsfrist', 'Plan details', 'Planes']) assert.deepEqual(click(name), [], name)
})
