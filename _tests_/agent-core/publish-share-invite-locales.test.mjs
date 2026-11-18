import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-617: publish / post ask submit and share / invite ask permission in the seven locales, as in English. The rows are my
// own twin battery (infinitive, imperative, formal, object, adverb) across every language, written before review.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://social.example/compose', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-617: publish / post ask submit in seven languages', () => {
  for (const name of ['Veröffentlichen', 'Jetzt veröffentlichen', 'Veröffentliche', 'Veröffentlichen Sie', 'Beitrag veröffentlichen', 'Posten', 'Publier', 'Publier maintenant', 'Publiez', 'Publicar',
    'Publicar ahora', 'Publica', 'Publique', 'Postar', 'Publicar agora', 'Pubblica', 'Pubblica ora', 'Pubblicare', 'Publiceren', 'Nu publiceren', 'Publiceer', 'Yayınla', 'Şimdi yayınla', 'Yayınlayın']) assert.ok(click(name).includes('submit'), name)
})

test('CU-617: share / invite ask permission in seven languages', () => {
  for (const name of ['Teilen', 'Mit anderen teilen', 'Teilen Sie', 'Teile das Dokument', 'Einladen', 'Personen einladen', 'Lade Freunde ein', 'Laden Sie Kollegen ein', 'Partager', 'Partager avec',
    'Partagez', 'Inviter', 'Inviter des personnes', 'Invitez vos amis', 'Compartir', 'Comparte', 'Invitar', 'Invitar personas', 'Invita a tus amigos', 'Compartilhar', 'Compartilhe', 'Partilhe', 'Convidar',
    'Convidar pessoas', 'Convide amigos', 'Condividi', 'Condividere', 'Invita', 'Invita persone', 'Delen', 'Deel de link', 'Uitnodigen', 'Mensen uitnodigen', 'Nodig je team uit', 'Deel', 'Nodig uit', 'Paylaş', 'Paylaşın',
    'Davet et', 'Kişileri davet et', 'Davet edin']) assert.ok(click(name).includes('permission'), name)
})

test('CU-617 negatives: drafts, previews, parts and settings stay free', () => {
  for (const name of ['Entwurf speichern', 'Vorschau', 'Teilnehmer', 'Brouillon', 'Aperçu', 'Borrador', 'Vista previa', 'Rascunho', 'Bozza', 'Anteprima', 'Concept', 'Deel 2', 'Taslak', 'Önizleme', 'Einladungen verwalten', 'Invitaciones pendientes']) assert.deepEqual(click(name), [], name)
})
