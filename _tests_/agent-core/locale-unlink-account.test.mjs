import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-685 (strict English parity; the English facts are on the issue): unlinking an account or device asks permission in the locales as
// 'Unlink account' does; bare verbs, other objects, negation, past / status and the disconnect / unpair twins do not take permission.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/settings', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-685: locale unlink-account / device rows ask permission as their English twins (parity)', () => {
  for (const name of ['Dissocier le compte', 'Dissocier mon compte Google', 'Dissocier l’appareil', 'Délier le compte', 'Desvincular cuenta', 'Desvincular mi cuenta de Google', 'Desvincular el dispositivo', 'Desvincular a conta', 'Scollega l’account', 'Dissocia il dispositivo',
 'Konto entkoppeln', 'Google-Konto entkoppeln', 'Gerät entkoppeln', 'Verknüpfung des Kontos aufheben', 'Account ontkoppelen', 'Apparaat ontkoppelen', 'Отвязать аккаунт', 'Отвяжите устройство', 'Отвязать аккаунт Google',
 'アカウントのリンクを解除', 'アカウントの連携を解除する', 'デバイスのリンクを解除してください', '계정 연결 해제', '기기 연결 해제하기', 'Google 계정 연동 해제', '取消关联账户', '解除绑定设备', '解綁帳號', 'Hesabın bağlantısını kaldır', 'Cihazın bağlantısını kaldırın', 'Unlink account', 'Unlink device']) assert.ok(click(name).includes('permission'), name)
})

test('CU-685 controls: bare verbs, other objects, negation, past / status and disconnect twins do not take permission', () => {
  for (const name of ['Dissocier', 'Dissocier la carte', 'Compte dissocié', 'Ne pas dissocier le compte', 'Desvincular', 'Desvincular tarjeta', 'Cuenta desvinculada', 'Entkoppeln', 'Karte entkoppeln', 'Konto entkoppelt', 'Konto trennen', 'Ontkoppelen',
 'Отвязать', 'Отвязать карту', 'Аккаунт отвязан', 'Отключить устройство', 'リンクを解除', 'カードのリンクを解除', 'アカウントのリンクを解除しました', '연결 해제', '카드 연결 해제', '계정 연결이 해제되었습니다', '계정 연결 끊기', '取消关联', '解除绑定银行卡', '账户已解绑', '断开账户',
 'Bağlantıyı kaldır', 'Kartın bağlantısını kaldır', 'Unlink', 'Unlink card', 'Disconnect account', 'Account unlinked']) assert.ok(!click(name).includes('permission'), name)
})

test('CU-685 r2: the zh split form and the de compound Verknüpfung ask permission', () => {
  for (const name of ['解除账户关联', '解除账号绑定', '取消设备绑定', '解除帳號綁定', 'Kontoverknüpfung aufheben', 'Die Kontoverknüpfung aufheben', 'Google-Kontoverknüpfung aufheben', 'Geräteverknüpfung aufheben', 'Accountkopplung aufheben']) assert.ok(click(name).includes('permission'), name)
  for (const name of ['解除银行卡绑定', '解除关联', 'Kontoverknüpfung', 'Kontoverknüpfung aufgehoben', 'Verknüpfung aufheben']) assert.ok(!click(name).includes('permission'), name)
})
