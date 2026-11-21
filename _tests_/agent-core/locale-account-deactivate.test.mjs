import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-672 (cu-developer-one's go 08:59Z, strict English parity; the English facts are on the issue): deactivating or disabling the account
// asks delete in the locales as 'Deactivate account' / 'Disable my account' do; negation, past / status forms, the bare verb and other
// objects stay free.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/account', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-672: locale account-deactivation rows ask delete as their English twins (parity)', () => {
  for (const name of ['Désactiver le compte', 'Désactiver mon compte', 'Désactivez votre compte', 'Désactiver mon compte Facebook', 'Désactiver mon compte définitivement', 'Temporairement désactiver mon compte',
 'Desactivar cuenta', 'Desactivar mi cuenta', 'Desactive su cuenta', 'Desactivar mi cuenta temporalmente', 'Deshabilitar la cuenta',
 'Desativar conta', 'Desativar minha conta', 'Desative sua conta', 'Desativar a conta agora', 'Disattiva account', "Disattiva il mio account", 'Disabilita account', 'Disattiva account temporaneamente',
 'Konto deaktivieren', 'Mein Konto deaktivieren', 'Benutzerkonto deaktivieren', 'Konto vorübergehend deaktivieren', 'Deaktivieren Sie Ihr Konto', 'Account deaktivieren',
 'Account deactiveren', 'Mijn account deactiveren', 'Deactiveer je account', 'Account tijdelijk deactiveren', 'Schakel account uit',
 'Деактивировать аккаунт', 'Деактивируйте свой аккаунт', 'Отключить аккаунт', 'Отключить учётную запись', 'Временно деактивировать аккаунт', 'Аккаунт деактивировать', 'ДЕАКТИВИРОВАТЬ АККАУНТ',
 'アカウントを無効にする', 'アカウントを無効にしてください', 'アカウントを停止', 'アカウントを一時的に停止する', '계정 비활성화', '내 계정을 비활성화하세요', '계정 비활성화하기', '계정을 일시적으로 비활성화',
 '停用账户', '停用我的账号', '禁用帐户', 'Hesabı devre dışı bırak', 'Hesabınızı devre dışı bırakın', 'Hesabımı geçici olarak devre dışı bırak', 'Deactivate account', 'Disable my account']) assert.ok(click(name).includes('delete'), name)
})

test('CU-672 controls: negation, past / status forms, the bare verb and other objects stay free, as in English', () => {
  for (const name of ['Ne pas désactiver mon compte', 'Ne désactivez pas votre compte', 'Compte désactivé', 'Votre compte a été désactivé', 'Désactiver', 'Désactiver les notifications', 'Réactiver le compte',
 'No desactivar mi cuenta', 'Cuenta desactivada', 'Desactivar notificaciones', 'Não desativar a conta', 'Conta desativada', 'Desativar notificações', 'Non disattivare account', 'Account disattivato', 'Disattiva notifiche',
 'Konto nicht deaktivieren', 'Konto deaktiviert', 'Benachrichtigungen deaktivieren', 'Account niet deactiveren', 'Account gedeactiveerd', 'Meldingen uitschakelen',
 'Не деактивировать аккаунт', 'Аккаунт деактивирован', 'Отключить уведомления', 'アカウントを無効にしました', 'アカウントは無効です', '通知を無効にする', '계정이 비활성화되었습니다', '계정을 비활성화하지 마세요', '알림 비활성화',
 '账户已停用', '停用通知', 'Hesap devre dışı bırakıldı', 'Hesabı devre dışı bırakma', 'Bildirimleri devre dışı bırak', "Don't deactivate my account", 'Account deactivated', 'Disable notifications', 'Disable']) assert.deepEqual(click(name), [], name)
})
