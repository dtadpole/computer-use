import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-676 (strict English parity; the English facts are on the issue): closing the account asks delete in fr / es / de / ru / ja / ko as
// 'Close account' does; negation, past / status forms, the bare verb and other objects stay free.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/settings', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-676: locale close-account rows ask delete as their English twins (parity)', () => {
  for (const name of ['Fermer le compte', 'Fermer mon compte', 'Fermez votre compte', 'Fermer mon compte PayPal', 'Fermer mon compte définitivement', 'Clôturer le compte', 'Clôturez votre compte',
 'Cerrar cuenta', 'Cerrar mi cuenta', 'Cierre su cuenta', 'Cerrar mi cuenta definitivamente', 'Cerrar la cuenta ahora',
 'Konto schließen', 'Mein Konto schließen', 'Benutzerkonto schließen', 'Konto jetzt schließen', 'Schließen Sie Ihr Konto', 'Account schließen', 'Konto kündigen', 'Mein Konto kündigen', 'Kündigen Sie Ihr Konto', 'Account jetzt kündigen',
 'Закрыть аккаунт', 'Закройте свой аккаунт', 'Закрыть учётную запись', 'Аккаунт закрыть', 'Навсегда закрыть аккаунт', 'ЗАКРЫТЬ АККАУНТ',
 'アカウントを閉鎖', 'アカウントを閉鎖する', 'アカウントを閉鎖してください', 'アカウントを解約', '계정 해지', '계정 해지하기', '내 계정을 해지하세요', '계정 폐쇄', '계정을 영구적으로 해지', 'Close account', 'Close my account']) assert.ok(click(name).includes('delete'), name)
})

test('CU-676 controls: negation, past / status forms, the bare verb and other objects stay free, as in English', () => {
  for (const name of ['Ne pas fermer mon compte', 'Compte fermé', 'Votre compte a été fermé', 'Fermer', 'Fermer la fenêtre', 'Fermer l’onglet', 'Rouvrir le compte',
 'No cerrar mi cuenta', 'Cuenta cerrada', 'Cerrar', 'Cerrar ventana', 'Cerrar sesión', 'Konto nicht schließen', 'Konto geschlossen', 'Fenster schließen', 'Schließen', 'Vertrag kündigen', 'Kündigen', 'Konto gekündigt', 'Konto nicht kündigen',
 'Не закрывать аккаунт', 'Аккаунт закрыт', 'Закрыть окно', 'Закрыть', 'アカウントを閉鎖しました', 'アカウントは閉鎖されました', 'ウィンドウを閉じる', '계정이 해지되었습니다', '계정을 해지하지 마세요', '창 닫기',
 "Don't close my account", 'Account closed', 'Close window']) assert.deepEqual(click(name), [], name)
})

test('CU-676 r2: the plural account nouns ask as English \'Close accounts\' does, and ru счёт joins', () => {
  for (const name of ['Konten schließen', 'Alle Konten schließen', 'Schließen Sie Ihre Konten', 'Benutzerkonten schließen', 'Konten kündigen', 'Fermer les comptes', 'Fermer mes comptes', 'Cerrar cuentas',
    'Cerrar mis cuentas', 'Закрыть аккаунты', 'Закрыть счёт', 'Закрыть счет', 'Закрыть счета', 'Закрыть учётные записи', '계정들 해지', '계정들을 해지하세요', 'Close accounts']) assert.ok(click(name).includes('delete'), name)
  for (const name of ['Счёт оплачен', 'Счёт', 'Konten', 'Comptes fermés', 'Cuentas cerradas', 'Konten geschlossen', 'Konten nicht schließen']) assert.deepEqual(click(name), [], name)
})

test('CU-676 r3: ja 閉じる / ko 닫기 with the account noun, ja / ko \'all\', fr résilier and es dar de baja join', () => {
  for (const name of ['アカウントを閉じる', 'アカウントを閉じてください', 'すべてのアカウントを閉鎖', '全てのアカウントを閉じる', '계정 닫기', '계정들 닫기', '계정을 닫으세요', '모든 계정 해지', '모든 계정 닫기',
    'Résilier le compte', 'Résilier mon compte', 'Résiliez votre compte', 'Dar de baja la cuenta', 'Dar de baja mi cuenta', 'Dé de baja su cuenta', 'Close all accounts']) assert.ok(click(name).includes('delete'), name)
  for (const name of ['閉じる', 'ウィンドウを閉じる', 'タブを閉じる', '닫기', '창 닫기', '탭 닫기', 'Résilier', 'Dar de baja', 'アカウントを閉じました', '계정이 닫혔습니다', 'Compte résilié', 'Cuenta dada de baja']) assert.deepEqual(click(name), [], name)
})
