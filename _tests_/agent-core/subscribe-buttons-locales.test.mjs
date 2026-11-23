import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-610: subscribe / upgrade / start-trial buttons in the seven locales ask purchase, as English 'Subscribe now' does.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://shop.example/plans', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-610: subscribe / upgrade buttons ask purchase in seven languages', () => {
  for (const name of ['Jetzt abonnieren', 'Abo abschließen', 'Kostenpflichtig abonnieren', "S'abonner", 'Souscrire', 'Passer à Premium', 'Suscribirse', 'Suscríbete ahora', 'Mejorar a Pro', 'Assinar agora',
    'Fazer upgrade', 'Abbonati ora', 'Passa a Premium', 'Abonneren', 'Nu abonneren', 'Upgraden naar Pro', 'Abone ol', 'Abone olun', "Premium'a geç", 'Aboneliği başlat', 'Kostenlos testen',
    'Auf Pro upgraden', "Pro'ya yükselt", "Premium'a yükselt", 'Planı yükselt', 'Ücretsiz denemeyi başlat', 'Hesabını yükselt', 'Hesabınızı yükseltin', 'Paketini yükselt', 'Üyeliğini yükselt',
    'Konto upgraden', 'Mitgliedschaft upgraden', 'Paket upgraden', 'Mettre à niveau mon compte', 'Mejorar mi cuenta', 'Mejorar el plan', 'Actualizar mi plan', 'Atualizar o plano', 'Aggiorna il piano',
    'Potenzia il tuo account', 'Account upgraden', 'Lidmaatschap upgraden', 'Upgrade je account']) assert.ok(click(name).includes('purchase'), name)
})

test('CU-610 negatives: subscription management, signing and plan details stay free', () => {
  for (const name of ['Meine Abos', 'Abonnements verwalten', 'Mes abonnements', 'Mis suscripciones', 'Assinar documento', 'I miei abbonamenti', 'Mijn abonnementen', 'Aboneliklerim', 'Premium özellikleri', 'Sesi yükselt', 'Actualizar cuenta', 'Atualizar dados da conta', 'Aggiorna account', 'Konto bearbeiten', 'Mettre à jour le profil']) assert.deepEqual(click(name), [], name)
})
