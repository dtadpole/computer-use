import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-688 (strict English parity; the English facts are on the issue): revoking an invitation asks permission in the locales as 'Revoke
// invitation' does; 'Cancel invitation' twins, negation, past / status forms and the bare noun do not take permission.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/team', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-688: locale revoke-invitation rows ask permission as their English twin (parity)', () => {
  for (const name of ['Révoquer l’invitation', 'Révoquer cette invitation', 'Révoquer toutes les invitations', 'Revocar invitación', 'Revocar la invitación', 'Revogar convite', 'Revoca l’invito', 'Einladung widerrufen', 'Alle Einladungen widerrufen', 'Widerrufen Sie die Einladung',
 'Uitnodiging intrekken', 'Trek de uitnodiging in', 'Отозвать приглашение', 'Отзовите приглашения', '招待を取り消す', 'この招待を取り消してください', 'すべての招待を無効にする', '초대 취소', '초대를 취소하세요', '모든 초대 철회', 'Revoke invitation']) assert.ok(click(name).includes('permission'), name)
})

test('CU-688 controls: cancel-invitation twins, negation, past / status forms and bare nouns do not take permission', () => {
  for (const name of ['Invitation révoquée', 'Ne pas révoquer l’invitation', 'Invitation', 'Annuler l’invitation', 'Invitación revocada', 'Cancelar invitación', 'Einladung wurde widerrufen', 'Einladung', 'Приглашение отозвано', 'Приглашение',
 '招待を取り消しました', '초대가 취소되었습니다', '취소', '取り消す', 'Invitation revoked', "Don't revoke invitation"]) assert.ok(!click(name).includes('permission'), name)
})
