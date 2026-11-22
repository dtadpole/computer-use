import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-699 (the English facts are on the issue): the send-money / transfer-funds verbs with a money object and the place-order verbs ask
// purchase in the locales as 'Send money' / 'Transfer funds' / 'Place order' do. Bare transfer verbs, transfer page nouns and status
// forms follow #1000 (CU-609) and are neither added nor pinned here, except the free rows below that are free on main today.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://bank.example/transfer', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-699: locale send-money / transfer-funds / place-order verbs ask purchase as English (parity)', () => {
  for (const name of ['Transférer des fonds', 'Transférer de l’argent', 'Effectuer un virement', 'Enviar dinero', 'Transferir fondos', 'Hacer una transferencia', 'Realizar pedido', 'Hacer el pedido', 'Transferir dinheiro', 'Finalizar pedido', 'Invia denaro', 'Trasferisci fondi', 'Fai un bonifico', 'Effettua l’ordine',
 'Geld transferieren', 'Bestellung aufgeben', 'Zahlungspflichtig bestellen', 'Geld overmaken', 'Bestelling plaatsen', 'Отправить деньги', 'Перевести средства', 'Переведите деньги', '送金', '送金する', '資金を振り込む', 'お金を送る', '注文する', '송금', '송금하기', '자금 이체', '돈 보내기', 'Para gönder', 'Havale yap', 'Sipariş ver', 'Send money', 'Transfer funds', 'Place order']) assert.ok(click(name).includes('purchase'), name)
})

test('CU-699 controls: negation, past / status and bare nouns that are free on main take no purchase', () => {
  for (const name of ['Transférer', 'Virement effectué', 'Ne pas transférer', 'Transferencia', 'Pedido realizado', 'Überweisung', 'Geld überwiesen', 'Перевести', 'Деньги отправлены', 'Не переводить', '送金済み', '振込', '이체', '송금 완료', '주문 내역', 'Para gönderildi', 'Money sent', "Don't transfer"]) assert.ok(!click(name).includes('purchase'), name)
})
