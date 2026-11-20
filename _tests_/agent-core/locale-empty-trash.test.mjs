import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-655 (cu-developer-one's design, 20 Nov 14:29Z): the locale twins of 'Empty trash' - FR / ES / DE / RU / JA / KO ask delete
// as the English label and the IT / NL / PT / TR entries do; past forms, other objects, opening the trash and the bare nouns stay free.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name, url = 'https://app.example/files/trash') => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

const ASK = [
  'Vider la corbeille', 'Videz la corbeille', 'Vide la corbeille', 'Vider toute la corbeille', 'Vider la corbeille maintenant', 'Ne pas vider la corbeille', 'Ne videz pas la corbeille',
  'Vaciar papelera', 'Vaciar la papelera', 'Vacía la papelera', 'Vacíe la papelera', 'Vaciar la papelera de reciclaje', 'No vacíes la papelera',
  'Papierkorb leeren', 'Den Papierkorb leeren', 'Papierkorb jetzt leeren', 'Papierkorb nicht leeren', 'Papierkorb entleeren', 'Leere den Papierkorb', 'Leeren Sie den Papierkorb',
  'Очистить корзину', 'Очистите корзину', 'Очисти корзину', 'ОЧИСТИТЬ КОРЗИНУ', 'Корзину очистить', 'Не очищать корзину', 'Очистить корзину удалённых',
  'ゴミ箱を空にする', 'ゴミ箱を空にしてください', 'ゴミ箱を今すぐ空にする',
  '휴지통 비우기', '휴지통을 비우세요', '휴지통 비워줘', '휴지통을 지금 비우기',
]

test('CU-655: emptying the trash asks delete in every locale, as its English twin does', () => {
  assert.ok(click('Empty trash').includes('delete'), 'the English twin asks')
  for (const name of ['Svuota il cestino', 'Prullenbak legen', 'Esvaziar lixeira']) assert.ok(click(name).includes('delete'), `${name} asked before CU-655 too`)
  for (const name of ASK) assert.ok(click(name).includes('delete'), `${name} -> delete`)
})

test('CU-655 controls: past forms, other objects, opening the trash and the bare nouns stay free', () => {
  for (const name of ['Corbeille vidée', 'La corbeille a été vidée', 'Papelera vaciada', 'Papierkorb geleert', 'Der Papierkorb wurde geleert', 'Корзина очищена',
    'ゴミ箱を空にしました', 'ゴミ箱が空にされました', '휴지통을 비웠습니다',
    'Vider le panier', 'Vider le cache', 'Vaciar carrito', 'Warenkorb leeren', 'カートを空にする', '장바구니 비우기', 'Очистить корзину покупок', 'Очистить фильтры',
    'Ouvrir la corbeille', 'Papierkorb öffnen', 'ゴミ箱を開く', '휴지통 보기', 'Corbeille', 'Papelera', 'Papierkorb', 'ゴミ箱', '휴지통',
    // five words between the noun and the verb stay out, as in CU-644 / CU-654
    'Papierkorb von allen meinen alten Geräten leeren']) assert.deepEqual(click(name), [], name)
})

test('CU-655: Russian korzina is also a shopping cart - it asks there too (a known over-ask), unless the cart is named', () => {
  const cart = 'https://shop.example/cart'
  assert.deepEqual(click('Empty cart', cart), [], 'the English cart twin is free')
  assert.ok(click('Очистить корзину', cart).includes('delete'), 'the trash reading wins: the trash deletes for good, a cart empties reversibly')
  assert.deepEqual(click('Очистить корзину покупок', cart), [], 'a cart named as such stays free')
  for (const name of ['Очистить корзину заказа', 'Очистить корзину товаров', 'Очистить корзину покупки']) assert.deepEqual(click(name, cart), [], `${name}: a named cart, singular or plural (r2)`)
})
