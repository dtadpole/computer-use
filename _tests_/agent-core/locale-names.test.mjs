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
  // CU-358: Italian, Dutch, Portuguese and Turkish.
  it: [['Acquista ora', 'purchase'], ['Paga ora', 'purchase'], ['Effettua ordine', 'purchase'], ['Elimina', 'delete'], ['Cancella', 'delete'], ['Rimuovi', 'delete'], ['Invia', 'submit']],
  nl: [['Nu kopen', 'purchase'], ['Nu betalen', 'purchase'], ['Afrekenen', 'purchase'], ['Verwijderen', 'delete'], ['Wissen', 'delete'], ['Versturen', 'submit'], ['Verzenden', 'submit']],
  pt: [['Comprar agora', 'purchase'], ['Finalizar pedido', 'purchase'], ['Excluir', 'delete'], ['Apagar', 'delete'], ['Remover', 'delete'], ['Enviar', 'submit']],
  tr: [['Şimdi satın al', 'purchase'], ['Şimdi öde', 'purchase'], ['Sipariş ver', 'purchase'], ['SATIN AL', 'purchase'], ['Hemen al', 'purchase'], ['Sil', 'delete'], ['SİL', 'delete'], ['Kalıcı olarak sil', 'delete'], ['Kaldır', 'delete'], ['Gönder', 'submit']],
}
for (const [locale, rows] of Object.entries(BUTTONS)) {
  test(`CU-352 [${locale}]: buy, pay, delete and send buttons ask`, () => {
    for (const [name, expected] of rows) assert.equal(click(name), expected, name)
  })
}

test('CU-345: PIN, security code and password fields named in six languages ask for what is typed', () => {
  for (const name of ['Passwort', 'Sicherheitscode', 'Mot de passe', 'Contraseña', 'Пароль', 'パスワード', '暗証番号', '비밀번호', '인증번호',
    'Geheimzahl', 'Bestätigungscode', 'Prüfnummer', 'Código de verificación', 'Код подтверждения', 'Kartennummer', 'カード番号', 'Numéro de carte', 'Número de tarjeta', 'Номер карты', '카드 번호', 'Kreditkartennummer', 'Debitkartennummer', 'Bankkartennummer', 'Kartenprüfnummer', 'Bankkartengeheimzahl', 'Einmalcode', 'SMS-Code', 'Bestätigungs-Code', 'Bestätigungs Code', 'Kreditkarten-Nummer', 'Karten Nummer']) {
    assert.notEqual(typeInto(name), 'allow', name)
  }
})

test('CU-358 r2 (cu-developer-three): empty-trash, short-imperative and confirm-payment forms ask', () => {
  for (const [name, expected] of [['Svuota cestino', 'delete'], ['Prullenbak legen', 'delete'], ['Esvaziar lixeira', 'delete'], ['Çöp kutusunu boşalt', 'delete'],
    ['Compra adesso', 'purchase'], ['Koop', 'purchase'], ['Betaal nu', 'purchase'], ['Conferma pagamento', 'purchase'], ['Compre agora', 'purchase'], ['Ödemeyi onayla', 'purchase']]) assert.equal(click(name), expected, name)
})

test('CU-358: PIN, one-time code, password and card-number fields named in Italian, Dutch, Portuguese and Turkish ask', () => {
  for (const name of ['Codice di verifica', 'Codice di sicurezza', 'Numero della carta', 'Wachtwoord', 'Pincode', 'Bankpincode', 'Verificatiecode', 'Sms-verificatiecode',
    'Beveiligingscode', 'Kaartnummer', 'Creditcardkaartnummer', 'Senha', 'Código de verificação', 'Código de segurança', 'Número do cartão',
    'Şifre', 'ŞİFRE', 'Parola', 'Doğrulama kodu', 'Güvenlik kodu', 'Kart numarası', 'Şifreniz', 'Parolanız', 'Kart numaranız', 'Número de cartão', 'Número de cartão de crédito']) {
    assert.notEqual(typeInto(name), 'allow', name)
  }
})

test('CU-358 negatives: cancel, back and near words stay allowed; ordinary fields stay free', () => {
  for (const name of ['Annulla', 'Indietro', 'Annuleren', 'Terug', 'Voltar', 'İptal', 'Geri', 'Silikon', 'Inviato', 'Pagamenti', 'Pagamentos', 'Ordinamento', 'Bestellingen', 'Verzonden', 'Ödeme yöntemleri', 'Gönderildi', 'Silvester', 'Pagamento', 'Compravendite', 'Koopjes', 'Betaalmethoden', 'Bestellingen', 'Compreensão', 'Cestino', 'Prullenbak', 'Lixeira', 'Çöp kutusu']) assert.equal(click(name), 'allow', name)
  for (const name of ['Nome', 'Città', 'Naam', 'Woonplaats', 'Cidade', 'Ad', 'Şehir', 'Codice sconto', 'Kortingscode', 'Código promocional', 'İndirim kodu', 'Postcode', 'Código postal', 'Şifreleme', 'Adınız', 'Şehriniz']) assert.equal(typeInto(name), 'allow', name)
})

test('CU-352 negatives: cancel, back, a shopping list, a longer Russian word and ordinary fields stay allowed', () => {
  for (const name of ['Abbrechen', 'Annuler', 'Cancelar', 'Отмена', 'キャンセル', '취소', 'Einkaufsliste', 'Удалиться', 'Zurück']) assert.equal(click(name), 'allow', name)
  for (const name of ['Vorname', 'Nom', 'Ciudad', 'Город', '名前', '이름', 'Benutzername', 'ユーザー名', 'Suche', 'Código postal', 'Kartenname', 'Kartentyp', 'Gutscheincode', 'Rabattcode', 'Promo-Code', 'Ländercode', 'Barcode', 'Postleitzahl', 'SMS-Benachrichtigung']) assert.equal(typeInto(name), 'allow', name)
})
