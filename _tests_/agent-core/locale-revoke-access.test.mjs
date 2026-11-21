import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-683 (strict English parity; the English facts are on the issue): revoking access asks permission in the locales as 'Revoke access'
// does; negation, past / status forms, bare nouns and bare cancel-sense verbs do not take permission.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/team', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-683: locale revoke-access rows ask permission as their English twins (parity)', () => {
  for (const name of ['Révoquer l’accès', "Révoquer l'accès de Paul", 'Révoquer tous les accès', 'Révoquer les autorisations', 'Révoquez son accès', 'Revocar acceso', 'Revocar el acceso de Ana', 'Revocar todos los permisos', 'Revogar acesso', 'Revogar as permissões',
 'Revoca l’accesso', 'Revocare le autorizzazioni', 'Zugriff widerrufen', 'Den Zugriff entziehen', 'Alle Berechtigungen widerrufen', 'Widerrufen Sie den Zugriff', 'App-Zugriff widerrufen', 'Toegang intrekken', 'Alle machtigingen intrekken', 'Trek de toegang in',
 'Отозвать доступ', 'Отзовите разрешения', 'Отозвать доступ для Анны', 'アクセスを取り消す', 'アクセス権を取り消してください', 'すべての権限を取り消す', 'アクセス権限を剥奪', '액세스 권한 취소', '접근 권한을 철회하세요', '모든 권한 회수', '撤销访问权限', '撤銷存取權', '收回所有权限', '取消授权',
 'Erişimi iptal et', 'Tüm izinleri geri al', 'Revoke access', 'Revoke permissions']) assert.ok(click(name).includes('permission'), name)
})

test('CU-683 controls: negation, past / status forms, bare nouns and bare cancel-sense verbs do not take permission', () => {
  for (const name of ['Accès', 'Accès révoqué', 'Ne pas révoquer l’accès', 'Acceso revocado', 'No revocar el acceso', 'Zugriff', 'Zugriff widerrufen.x', 'Zugriff wurde widerrufen', 'Zugriff nicht widerrufen', 'Toegang ingetrokken', 'Доступ отозван',
 'Не отзывать доступ', 'アクセス', 'アクセスを取り消しました', '取り消す', '액세스 권한이 취소되었습니다', '취소', '访问权限已撤销', '撤销', '取消', 'Erişim iptal edildi', 'Access revoked', "Don't revoke access", 'Access']) assert.ok(!click(name).includes('permission'), name)
})

test('CU-683 go (22:32Z): the unambiguous bare revoke verbs ask as English bare \'Revoke\' does; cancel-sense bare verbs stay free', () => {
  for (const name of ['Révoquer', 'Revocar', 'Revogar', 'Revoca', 'Widerrufen', 'Intrekken', 'Отозвать', 'Отзовите', 'Revoke']) assert.ok(click(name).includes('permission'), name)
  for (const name of ['取り消す', '취소', '撤销', 'İptal et', 'Révoqué', 'Revocado', 'Отозвано']) assert.ok(!click(name).includes('permission'), name)
})
