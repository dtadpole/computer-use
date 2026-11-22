import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-700 (strict English parity; the English facts are on the issue): the subscribe / renew verb asks purchase in the locales as
// 'Subscribe' / 'Renew subscription' do; negation, past / status, the bare noun and 'Resubscribe' stay free, as in English.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/billing', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-700: locale subscribe / renew rows ask purchase as English (parity)', () => {
  for (const name of ['S’abonner', 'Abonnez-vous', 'Renouveler', 'Renouveler l’abonnement', 'Renouveler mon abonnement', 'Suscribirse', 'Suscríbete ahora', 'Renovar', 'Renovar la suscripción', 'Assinar', 'Renovar assinatura', 'Abbonati', 'Rinnova l’abbonamento', 'Abonnieren', 'Abo verlängern', 'Mitgliedschaft verlängern', 'Jetzt verlängern',
 'Abonneren', 'Abonnement verlengen', 'Подписаться', 'Подпишитесь на рассылку', 'Продлить', 'Продлить подписку', 'Возобновить подписку', '購読する', '定期購入', 'サブスクリプションを更新', 'プランを更新する', '구독', '구독하기', '구독 갱신', '멤버십 연장하기', 'Abone ol', 'Aboneliği yenile', 'Subscribe', 'Renew subscription']) assert.ok(click(name).includes('purchase'), name)
})

test('CU-700 controls: negation, past / status, bare nouns and bare update verbs take no purchase', () => {
  for (const name of ['Abonnement renouvelé', 'Abonnement', 'Ne pas renouveler', 'Suscripción', 'Suscripción renovada', 'No renovar', 'Abo', 'Abo verlängert', 'Подписка', 'Подписка продлена', 'Не продлевать', '更新', '更新する', '購読済み', '갱신', '구독 중', '구독이 갱신되었습니다', 'Abonelik', 'Resubscribe', "Don't renew", 'Subscription']) assert.ok(!click(name).includes('purchase'), name)
})

test('CU-700: pt assinar asks only bare, with agora or a plan noun - \'Assinar documento\' (sign a document) stays free (found by the corpus reclass); sign-up verbs stay out', () => {
  for (const name of ['Assinar', 'Assinar agora', 'Assinar o plano Pro', 'Assinar a newsletter']) assert.ok(click(name).includes('purchase'), name)
  for (const name of ['Assinar documento', 'Assinar contrato', 'Inscreva-se', 'Iscriviti']) assert.ok(!click(name).includes('purchase'), name)
})
