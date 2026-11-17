import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-613: start / begin a subscription and 'switch to the <paid plan> version' ask purchase in five languages.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://shop.example/plans', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-613: start-subscription and paid-version switches ask purchase', () => {
  for (const name of ['Abonnement starten', 'Abo starten', 'Passer à la version Pro', 'Passer à la version Plus', 'Démarrer mon abonnement', 'Suscripción mensual: empezar', 'Empezar suscripción',
    'Iniciar suscripción', 'Iniciar mi suscripción', 'Iniciar assinatura', 'Iniciar a assinatura', 'Avvia abbonamento', "Avvia l'abbonamento", 'Abonnement starten', 'Start je abonnement', 'Abo - starten',
    'Commencer mon abonnement', "Commencer l'abonnement", 'Passa alla versione Pro', 'Comenzar membresía', 'Iniciar mi membresía', 'Mitgliedschaft beginnen', 'Zur Pro-Version wechseln',
    'Cambiar a la versión Pro', 'Mudar para a versão Pro', 'Lidmaatschap starten', 'Overstappen naar Pro']) assert.ok(click(name).includes('purchase'), name)
})

test('CU-613 negatives: layout switches, subscription details and trials of other things stay free', () => {
  for (const name of ['Passer à la version mobile', 'Passer à la version classique', 'Abonnement: Details', 'Suscripción: detalles', 'Iniciar sesión', 'Avvia la presentazione', 'Starten', 'Passa alla versione mobile', 'Cambiar a la versión móvil', 'Zur mobilen Version wechseln', 'Mudar para a versão clássica']) assert.deepEqual(click(name), [], name)
})
