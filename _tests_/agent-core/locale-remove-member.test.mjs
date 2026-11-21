import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-686 (strict English parity; the English facts are on the issue): removing a member asks delete in fr / ko as 'Remove member' does,
// fr 'Exclure le membre' asks permission as 'Kick member' does; bare verbs, other objects, negation and past / status forms stay free.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/team', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-686: fr / ko remove-member rows ask delete as their English twins (parity)', () => {
  for (const name of ['Retirer le membre', 'Retirer ce membre', 'Retirer les membres', 'Retirer l’utilisateur', 'Retirer Paul de l’équipe', 'Retirer de l’équipe', 'Retirer du groupe', 'Retirez ce participant', 'Retirer le membre maintenant',
 '구성원 제거', '멤버 제거', '사용자 제거', '구성원을 제거하세요', '이 멤버 제거하기', '모든 구성원 제거', '팀에서 제거', '그룹에서 제거하기', '팀에서 김철수 제거', 'Remove member', 'Remove from team']) assert.ok(click(name).includes('delete'), name)
})

test('CU-686: fr exclude-member rows ask permission as \'Kick member\' does', () => {
  for (const name of ['Exclure le membre', 'Exclure ce membre', 'Exclure l’utilisateur', 'Kick member']) assert.ok(click(name).includes('permission'), name)
})

test('CU-686 controls: bare verbs, other objects, negation, past / status forms and bare nouns stay free', () => {
  for (const name of ['Retirer de l’argent', 'Retirer la carte', 'Retirer le filtre', 'Membre retiré', 'Ne pas retirer le membre', 'Membres', 'Le membre a été retiré', 'Exclure', 'Exclure les mots-clés',
 '필터 제거', '구성원', '구성원이 제거되었습니다', '구성원을 제거하지 마세요', '팀', "Don't remove member", 'Member removed', 'Members']) assert.deepEqual(click(name), [], name)
})

test('CU-686 corrected go (23:45Z): the bare remove verbs ask delete as English bare \'Remove\' does', () => {
  for (const name of ['Retirer', 'Retirez', '제거', '삭제', '제거하기', '삭제하기', 'Remove']) assert.ok(click(name).includes('delete'), name)
  for (const name of ['Retiré', '삭제됨', '제거되었습니다', 'Exclure']) assert.deepEqual(click(name), [], name)
})
