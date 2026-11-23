import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-648 (cu-developer-one's design, 20 Nov 03:04Z / 03:06Z): Russian perfective ty / vy imperatives and Korean polite imperatives
// ask as their infinitive / noun twins.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/account', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

const GRID = {
  delete: ['Удалите аккаунт', 'Удали аккаунт', 'Удалите свой аккаунт', 'УДАЛИТЕ АККАУНТ', 'Удалите', 'Удали', 'Сотрите', 'Сотри', '삭제하세요', '삭제해 주세요', '삭제해주세요', '삭제하십시오'],
  submit: ['Отправьте', 'Отправь', 'Отправьте сообщение', '보내세요', '보내 주세요', '보내주세요', '보내십시오', '전송하세요', '전송해 주세요'],
  purchase: ['Оплатите', 'Оплати', 'Купите', 'Купи', 'Закажите', 'Закажи', 'Оформите заказ', 'Оформи заказ', 'Оформите ваш заказ', 'Оформите покупку', 'Оформите подписку',
    '결제하세요', '결제해 주세요', '구매하세요', '구매해 주세요'],
}

test('CU-648: Russian ty / vy imperatives and Korean polite imperatives ask as their twins', () => {
  for (const [cls, names] of Object.entries(GRID)) for (const name of names) assert.ok(click(name).includes(cls), `${name} -> ${cls}`)
})

test('CU-648 controls: imperfective, negated and statement forms and the near misses stay free', () => {
  for (const name of ['Покупайте', 'Удаляйте', 'Не удаляйте', 'Не отправляйте', 'Покажите', 'Покажи', 'Откройте', '보내요', '보기', '열기']) assert.deepEqual(click(name), [], name)
})
