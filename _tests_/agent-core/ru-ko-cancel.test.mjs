import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-650 (cu-developer-one's go, 20 Nov 04:21Z): Russian and Korean cancel rows take their English twins' classes - cancel +
// subscription asks delete; + order / membership / plan asks purchase; 'Отписаться' follows 'Unsubscribe' (submit).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/account', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

const GRID = {
  delete: ['Отменить подписку', 'Отмените подписку', 'Отмени подписку', 'Отмените свою подписку', 'Отменить мою подписку', 'ОТМЕНИТЕ ПОДПИСКУ',
    '구독 취소', '구독취소', '구독 취소하기', '구독 취소하세요', '구독 취소해 주세요', '구독 해지', '구독 해지해 주세요', '취소 구독'],
  purchase: ['Отменить заказ', 'Отмените заказ', 'Отмени заказ', 'Отмените членство', 'Отмените тариф', 'Отменить план',
    '주문 취소', '주문취소하기', '멤버십 해지', '멤버십 취소하세요', '요금제 취소하세요', '플랜 해지'],
  submit: ['Отписаться', 'Отпишитесь', 'Отпишись'],
}

test('CU-650: Russian / Korean cancel rows ask as their English twins', () => {
  for (const [cls, names] of Object.entries(GRID)) for (const name of names) assert.ok(click(name).includes(cls), `${name} -> ${cls}`)
})

test('CU-650 controls: bare cancel, the nouns and state / past forms stay free', () => {
  for (const name of ['Отменить', 'Отмените', 'Подписка отменена', 'Заказ отменён', '취소', '구독', '구독 취소됨', '취소됨', '구독 취소 완료', '구독 취소했어요', '주문 취소됨']) assert.deepEqual(click(name), [], name)
})
