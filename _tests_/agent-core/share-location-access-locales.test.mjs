import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-616: share-location and grant-access buttons in the seven locales ask permission, as English 'Share my location' does.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/settings', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-616: share-location / grant-access ask permission in seven languages', () => {
  for (const name of ['Standort teilen', 'Live-Standort teilen', 'Zugriff gewähren', 'Partager ma position', 'Partager la position en direct', "Accorder l'accès", 'Compartir ubicación',
    'Compartir ubicación en tiempo real', 'Conceder acceso', 'Compartilhar localização', 'Conceder acesso', 'Condividi posizione', 'Concedi accesso', 'Locatie delen', 'Toegang verlenen',
    'Konumu paylaş', 'Canlı konum paylaş', 'Erişim izni ver', 'Konumunu paylaş', 'Condividi la mia posizione', 'Compartilhar minha localização']) assert.ok(click(name).includes('permission'), name)
})

test('CU-616 negatives: location settings and access pages that grant nothing stay free', () => {
  for (const name of ['Standort', 'Standortverlauf', 'Ma position', 'Ubicación actual', 'Localização', 'Posizione attuale', 'Locatie', 'Konum ayarları', 'Zugriffsprotokoll', 'Accès rapide', 'Acceso directo']) assert.deepEqual(click(name), [], name)
})
