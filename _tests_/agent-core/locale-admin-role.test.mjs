import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-691 (strict English parity; the English facts are on the issue): admin-role changes ask as in English - make / set / promote
// + admin asks permission (negation too), remove + admin asks delete, revoke + admin rights asks permission; moderator, demote,
// past / status forms and the bare nouns stay free.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/team', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-691: locale make / set / promote-admin rows ask permission as their English twins', () => {
  for (const name of ['Nommer administrateur', 'Promouvoir Paul administrateur', 'Hacer administrador', 'Nombrar administrador', 'Tornar administrador', 'Rendi amministratore', 'Zum Administrator machen',
    'Zum Admin ernennen', 'Als Administrator festlegen', 'Beheerder maken', 'Сделать администратором', 'Назначить администратором', 'Не делать администратором', '管理者にする', '管理者に設定', '관리자로 지정',
    '관리자로 승격하기', '设为管理员', '提升为管理员', 'Yönetici yap', 'Administratorrechte entziehen', 'Make admin', "Don't make admin"]) assert.ok(click(name).includes('permission'), name)
})

test('CU-691: locale remove-admin rows ask delete as English \'Remove admin\'', () => {
  for (const name of ['Retirer les droits d’administrateur', 'Retirer administrateur', 'Quitar administrador', 'Administratorrechte entfernen', '관리자 권한 제거', 'Remove admin']) assert.ok(click(name).includes('delete'), name)
})

test('CU-691 controls: moderator, demote, past / status forms and bare nouns stay free', () => {
  for (const name of ['Administrateur', 'Admin', 'Modérateur', 'Nommer modérateur', 'Rétrograder', 'Administrador', 'Zum Moderator machen', 'Администратор', '管理者', '관리자', '管理员', 'Made admin']) assert.deepEqual(click(name), [], name)
})

test('CU-691 go (06:20Z): admin rights / privileges twins ask permission whatever the verb, as \'Revoke admin rights\'', () => {
  for (const name of ['Retirer les droits d’administrateur', 'Révoquer les droits d’administrateur', 'Quitar los permisos de administrador', 'Administratorrechte entfernen', '관리자 권한 제거', '管理者権限を削除', '移除管理员权限', 'Revoke admin rights']) assert.ok(click(name).includes('permission'), name)
  for (const name of ['Droits d’administrateur', '관리자 권한', '管理者権限']) assert.deepEqual(click(name), [], name)
})

test('CU-691 r2: ko 관리자 해제, zh 取消管理员 and fr l\' ask delete; the de formal, ja 設定してください and zh 立即 make-admin forms ask permission', () => {
  for (const name of ['관리자 해제', '관리자에서 해제', '取消管理员', '取消管理员身份', "Retirer l'administrateur", 'Retirer l’administratrice']) assert.ok(click(name).includes('delete'), name)
  for (const name of ['Machen Sie Alex zum Administrator', 'Ernennen Sie Paul zum Admin', '管理者に設定してください', '管理者に昇格してください', '立即设为管理员']) assert.ok(click(name).includes('permission'), name)
  for (const name of ['取消', '해제', '管理员', '管理者に設定しました']) assert.deepEqual(click(name), [], name)
})
