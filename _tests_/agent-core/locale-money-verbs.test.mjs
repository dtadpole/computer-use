import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-699 (the English facts are on the issue): the send-money / transfer-funds verbs with a money object and the place-order verbs ask
// purchase in the locales as 'Send money' / 'Transfer funds' / 'Place order' do. Bare transfer verbs, transfer page nouns and status
// forms follow #1000 (CU-609) and are not added here; fr Transférer / ru Перевести (also 'Forward' / 'Translate') stay out as ambiguous twins.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://bank.example/transfer', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-699: locale send-money / transfer-funds / place-order verbs ask purchase as English (parity)', () => {
  for (const name of ['Transférer des fonds', 'Transférer de l’argent', 'Effectuer un virement', 'Enviar dinero', 'Transferir fondos', 'Hacer una transferencia', 'Realizar pedido', 'Hacer el pedido', 'Transferir dinheiro', 'Finalizar pedido', 'Invia denaro', 'Trasferisci fondi', 'Fai un bonifico', 'Effettua l’ordine',
 'Geld transferieren', 'Bestellung aufgeben', 'Zahlungspflichtig bestellen', 'Geld overmaken', 'Bestelling plaatsen', 'Отправить деньги', 'Перевести средства', 'Переведите деньги', '送金', '送金する', '資金を振り込む', 'お金を送る', '注文する', '송금', '송금하기', '자금 이체', '돈 보내기', 'Para gönder', 'Havale yap', 'Sipariş ver', 'Send money', 'Transfer funds', 'Place order']) assert.ok(click(name).includes('purchase'), name)
})

test('CU-699 controls: negation, past / status and bare nouns that are free on main take no purchase', () => {
  for (const name of ['Transférer', 'Virement effectué', 'Ne pas transférer', 'Transferencia', 'Pedido realizado', 'Überweisung', 'Geld überwiesen', 'Перевести', 'Деньги отправлены', 'Не переводить', '送金済み', '振込', '송금 완료', '주문 내역', 'Para gönderildi', 'Money sent', "Don't transfer"]) assert.ok(!click(name).includes('purchase'), name)
})

test('CU-699 r2: ko bare 이체, ja 資金を移動, a de / nl recipient slot and Turkish capitals ask purchase; ambiguous bare twins and nouns stay out', () => {
  for (const name of ['이체', '이체하기', '資金を移動', '資金を移動する', 'Geld an Freunde senden', 'Geld an meine Mutter überweisen', 'Geld naar vrienden sturen', 'Maak geld over naar Jan', 'PARA GÖNDERİN', 'Send money to friends']) assert.ok(click(name).includes('purchase'), name)
  for (const name of ['Transférer', 'Перевести', 'Überweisung', '이체 내역', '이체 완료']) assert.ok(!click(name).includes('purchase'), name)
})

test('CU-702: the ko / ja account-noun transfer forms ask purchase as \'Transfer to account\' / \'Account transfer\'', () => {
  for (const name of ['계좌 이체', '계좌이체', '계좌로 이체', '계좌로 이체하기', '은행 송금', '口座に振り込む', '口座振替', '口座へ送金する', '銀行口座に振込', 'Transfer to account', 'Account transfer']) assert.ok(click(name).includes('purchase'), name)
  for (const name of ['계좌', '계좌 이체 내역', '口座', '口座振替済み']) assert.ok(!click(name).includes('purchase'), name)
})
