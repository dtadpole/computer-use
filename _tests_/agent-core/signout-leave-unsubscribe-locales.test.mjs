import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-621: sign out of all devices (permission), leave group and unsubscribe (submit) in the seven locales, as English. My own
// twin battery (infinitive, imperative, formal, other objects), written before review.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/settings', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-621: sign out of all devices asks permission in seven languages', () => {
  for (const name of ['Von allen Geräten abmelden', 'Auf allen Geräten abmelden', 'Überall abmelden', 'Se déconnecter de tous les appareils', 'Déconnectez-vous de tous les appareils', 'Se déconnecter partout',
    'Cerrar sesión en todos los dispositivos', 'Cierra sesión en todos los dispositivos', 'Sair de todos os dispositivos', 'Terminar sessão em todos os dispositivos', 'Esci da tutti i dispositivi', 'Disconnetti tutti i dispositivi',
    'Esci ovunque', 'Afmelden op alle apparaten', 'Uitloggen op alle apparaten', 'Overal uitloggen', 'Tüm cihazlardan çıkış yap', 'Tüm oturumları kapat']) assert.ok(click(name).includes('permission'), name)
})

test('CU-621: leave group and unsubscribe ask submit in seven languages', () => {
  for (const name of ['Gruppe verlassen', 'Verlassen Sie die Gruppe', 'Quitter le groupe', 'Quittez le groupe', 'Salir del grupo', 'Salga del grupo', 'Abandonar el grupo', 'Sair do grupo', 'Saia do grupo',
    'Abbandona il gruppo', 'Esci dal gruppo', 'Groep verlaten', 'Verlaat de groep', 'Quitter ce groupe', 'Diese Gruppe verlassen', 'Salir de este grupo', 'Sair deste grupo', 'Esci da questo gruppo', 'Deze groep verlaten', 'Bu gruptan çık', 'Gruptan çık', 'Gruptan ayrıl', 'Gruptan ayrılın',
    'Abbestellen', 'Newsletter abbestellen', 'Vom Newsletter abmelden', 'Se désabonner', 'Désabonnez-vous', 'Se désinscrire', 'Darse de baja', 'Date de baja', 'Cancelar inscrição', 'Descadastrar',
    'Annulla iscrizione', 'Disiscriviti', 'Uitschrijven', 'Schrijf je uit', 'Afmelden voor nieuwsbrief', 'Afmelden voor de nieuwsbrief', 'Meld je af voor de nieuwsbrief', 'Abonelikten çık', 'Bültenden çık']) assert.ok(click(name).includes('submit'), name)
})

test('CU-621 negatives: plain sign-out, group pages and device lists stay free', () => {
  for (const name of ['Abmelden', 'Se déconnecter', 'Cerrar sesión', 'Sair', 'Esci', 'Afmelden', 'Çıkış yap', 'Gruppeneinstellungen', 'Paramètres du groupe', 'Miembros del grupo', 'Todos os dispositivos',
    'Tutti i dispositivi', 'Alle apparaten', 'Tüm cihazlar', 'Abonnements', 'Inscrições']) assert.deepEqual(click(name), [], name)
})
