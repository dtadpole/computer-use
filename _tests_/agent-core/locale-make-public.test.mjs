import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-677 (strict English parity; the English facts are on the issue): making something public asks permission in the locales as 'Make
// public' does - negation too, as "Don't make public" asks in English; past / status forms, bare adjectives and make-private twins stay free.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/settings', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-677: locale make-public rows ask permission as their English twins (parity, negation included)', () => {
  for (const name of ['Rendre public', 'Rendre le dépôt public', 'Rendre mon profil public', 'Rendre public maintenant', 'Ne pas rendre public', 'Définir comme public', 'Changer la visibilité en public',
 'Hacer público', 'Hacer público el repositorio', 'Hacer pública mi página', 'No hacer público', 'Cambiar la visibilidad a pública', 'Establecer como público',
 'Tornar público', 'Tornar o repositório público', 'Não tornar público', 'Alterar a visibilidade para pública', 'Definir como público',
 'Rendi pubblico', 'Rendi pubblico il repository', 'Non rendere pubblico', 'Imposta come pubblico', 'Cambia la visibilità in pubblica',
 'Öffentlich machen', 'Repository öffentlich machen', 'Jetzt öffentlich machen', 'Nicht öffentlich machen', 'Machen Sie das Profil öffentlich', 'Sichtbarkeit auf öffentlich setzen', 'Auf öffentlich stellen',
 'Openbaar maken', 'Repository openbaar maken', 'Niet openbaar maken', 'Maak het profiel openbaar',
 'Сделать общедоступным', 'Сделать репозиторий публичным', 'Сделайте профиль общедоступным', 'Не делать общедоступным', '공개로 전환', '공개로 설정하기', '저장소를 공개로 변경하세요',
 'Herkese açık yap', 'Depoyu herkese açık yap', 'Profili herkese açık hale getir', 'Make public', "Don't make public"]) assert.ok(click(name).includes('permission'), name)
})

test('CU-677 controls: past / status forms, bare adjectives and the make-private twins stay free, as in English', () => {
  for (const name of ['Public', 'Rendu public', 'Rendre privé', 'Público', 'Hecho público', 'Hacer privado', 'Tornado público', 'Tornar privado', 'Pubblico', 'Reso pubblico', 'Rendi privato',
 'Öffentlich', 'Öffentlich gemacht', 'Privat machen', 'Openbaar', 'Openbaar gemaakt', 'Privé maken', 'Общедоступный', 'Сделано общедоступным', 'Сделать приватным', '공개', '공개로 전환되었습니다', '비공개로 전환',
 'Herkese açık', 'Herkese açık yapıldı', 'Gizli yap', 'Make private', 'Made public']) assert.deepEqual(click(name), [], name)
})

test('CU-677 r2: the Korean verb forms of 공개하다 (literal \'make public\') ask permission; private / status / past forms stay free', () => {
  for (const name of ['공개하기', '저장소 공개하기', '공개하세요', '공개해 주세요', '프로필을 공개하세요', '저장소를 공개해 주세요', '지금 공개하기']) assert.ok(click(name).includes('permission'), name)
  for (const name of ['공개', '비공개', '공개됨', '공개 중', '공개되었습니다', '비공개하기', '공개했습니다', '공개 설정']) assert.deepEqual(click(name), [], name)
})
