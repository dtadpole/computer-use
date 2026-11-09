import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-352 (High) and CU-345: buy, pay, delete and send controls, and PIN, one-time code, security code and password fields,
// named in German, French, Spanish, Russian, Japanese and Korean ask as their English and Chinese names do.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 5, y: 5, button: 'left' }, { url: 'https://shop.example/cart', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? 'allow' : r.class }
const typeInto = (name) => { const r = policy.classify({ type: 'type', text: '4821' }, { url: 'https://shop.example/pay', target: { tag: 'input', role: 'textbox', name, editable: true } }); return r.decision === 'allow' ? 'allow' : r.class }

const BUTTONS = {
  de: [['Zahlungspflichtig bestellen', 'purchase'], ['Jetzt kaufen', 'purchase'], ['Löschen', 'delete'], ['Absenden', 'submit']],
  fr: [['Passer la commande', 'purchase'], ['Payer', 'purchase'], ['Supprimer', 'delete'], ['Envoyer', 'submit']],
  es: [['Finalizar compra', 'purchase'], ['Pagar', 'purchase'], ['Eliminar', 'delete'], ['Enviar', 'submit']],
  ru: [['Оформить заказ', 'purchase'], ['КУПИТЬ', 'purchase'], ['Удалить', 'delete'], ['Отправить', 'submit']],
  ja: [['注文を確定する', 'purchase'], ['購入する', 'purchase'], ['削除', 'delete'], ['送信', 'submit']],
  ko: [['결제하기', 'purchase'], ['바로구매', 'purchase'], ['삭제', 'delete'], ['보내기', 'submit']],
}
for (const [locale, rows] of Object.entries(BUTTONS)) {
  test(`CU-352 [${locale}]: buy, pay, delete and send buttons ask`, () => {
    for (const [name, expected] of rows) assert.equal(click(name), expected, name)
  })
}

test('CU-345: PIN, security code and password fields named in six languages ask for what is typed', () => {
  for (const name of ['Passwort', 'Sicherheitscode', 'Mot de passe', 'Contraseña', 'Пароль', 'パスワード', '暗証番号', '비밀번호', '인증번호']) {
    assert.notEqual(typeInto(name), 'allow', name)
  }
})

test('CU-352 negatives: cancel, back, a shopping list, a longer Russian word and ordinary fields stay allowed', () => {
  for (const name of ['Abbrechen', 'Annuler', 'Cancelar', 'Отмена', 'キャンセル', '취소', 'Einkaufsliste', 'Удалиться', 'Zurück']) assert.equal(click(name), 'allow', name)
  for (const name of ['Vorname', 'Nom', 'Ciudad', 'Город', '名前', '이름']) assert.equal(typeInto(name), 'allow', name)
})
