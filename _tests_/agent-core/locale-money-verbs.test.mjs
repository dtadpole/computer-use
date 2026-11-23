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

test('CU-702: the locale transfer-to-account forms ask purchase (go 01:13Z); bare nouns and the bare verbs stay as before', () => {
  for (const name of ['Transférer vers le compte', 'Virer sur le compte', 'Virer sur mon compte épargne', 'Auf Konto übertragen', 'Auf das Sparkonto übertragen', 'Перевести на счёт', 'Перевести на счет', 'Перевести на карту', 'Hesaba aktar', 'HESABA AKTAR', '转入账户', '转到储蓄账户']) assert.ok(click(name).includes('purchase'), name)
  for (const name of ['Mon compte', 'Konto', 'Счёт', 'Перевести', '账户']) assert.ok(!click(name).includes('purchase'), name)
})

test('CU-702 r2: noun-led transfer + account object and the ko possessive / qualifier ask purchase; bare nouns free; translate-to stays no purchase', () => {
  for (const name of ['Virement vers le compte', 'Virement sur le compte', 'Transferencia a la cuenta', 'Überweisung auf das Konto', 'Bonifico sul conto', 'Перевод на счёт', '내 계좌로 이체하기', '제 계좌로 송금', '은행 계좌로 이체', 'Transfer to my account', 'Transfer to bank account']) assert.ok(click(name).includes('purchase'), name)
  // bare 'Bonifico' asks purchase on main already, so it is not a control; the translate-to rows (CU-706) must not become purchase
  for (const name of ['Virement', 'Transferencia', 'Überweisung', 'Перевод', 'Перевести на английский', 'Перевод на английский']) assert.ok(!click(name).includes('purchase'), name)
})

test('CU-702 r3: every to-account line takes the contractions and a determiner slot of up to two words; ja takes a possessive; page nouns stay free', () => {
  for (const name of ['Überweisung aufs Konto', 'Aufs Konto überweisen', 'Virer au compte', 'Virement au compte', 'Transferir à conta', 'Transferência à conta', 'Virer sur un autre compte', 'Transférer vers ton compte',
    'Transferir para a minha conta', 'Bonifico sul proprio conto', 'Trasferisci sul tuo conto', 'Auf unser Konto überweisen', 'Überweisung auf ein anderes Konto', 'Transferir a otra cuenta', 'Transferencia a mi cuenta de ahorros',
    '自分の口座に振り込む', '私の口座に振り込む']) assert.ok(click(name).includes('purchase'), name)
  for (const name of ['Mon compte', 'Virement', 'Kontoauszug', 'Überweisung', 'Historique des virements', 'Transferencia', '口座', '自分の口座']) assert.ok(!click(name).includes('purchase'), name)
})
