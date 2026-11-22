import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-689 (strict English parity; the English facts are on the issue): linking an account or device asks permission in the locales as
// 'Link account' does, negation included ("Don't link account" asks); bare verbs, other objects and past / status forms do not.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/settings', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-689: locale link-account / device rows ask permission as their English twins (parity, negation included)', () => {
  for (const name of ['Lier le compte', 'Lier mon compte Google', 'Associer l’appareil', 'Ne pas lier le compte', 'Vincular cuenta', 'Vincular mi cuenta de Google', 'Asociar el dispositivo', 'No vincular la cuenta', 'Vincular a conta', 'Collega l’account', 'Associa il dispositivo',
 'Konto verknüpfen', 'Google-Konto verknüpfen', 'Gerät verknüpfen', 'Verknüpfen Sie Ihr Konto', 'Konto nicht verknüpfen', 'Account koppelen', 'Apparaat koppelen', 'Привязать аккаунт', 'Привяжите устройство', 'Не привязывать аккаунт',
 'アカウントをリンク', 'アカウントを連携する', 'デバイスをリンクしてください', 'アカウントをリンクしないでください', '계정 연결', '기기 연결하기', 'Google 계정 연동', '계정을 연결하지 마세요', '关联账户', '绑定设备', '綁定帳號', '不要关联账户', 'Hesabı bağla', 'Cihazı bağlayın',
 'Link account', "Don't link account"]) assert.ok(click(name).includes('permission'), name)
})

test('CU-689 controls: bare verbs, other objects and past / status forms do not take permission, as in English', () => {
  for (const name of ['Lier', 'Lier le numéro de téléphone', 'Compte lié', 'Vincular', 'Vincular número de teléfono', 'Cuenta vinculada', 'Verknüpfen', 'Telefonnummer verknüpfen', 'Konto verknüpft', 'Koppelen', 'Привязать', 'Привязать номер телефона', 'Аккаунт привязан',
 'リンク', '電話番号をリンク', 'アカウントをリンクしました', '연결', '전화번호 연결', '계정이 연결되었습니다', '关联', '绑定手机号', '账户已关联', 'Bağla', 'Telefon numarasını bağla', 'Link', 'Link phone number', 'Account linked']) assert.ok(!click(name).includes('permission'), name)
})
