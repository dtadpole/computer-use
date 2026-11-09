import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-358 (D-099's next table pass): Italian, Dutch, Portuguese and Turkish action, credential and personal-ID names.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 5, y: 5, button: 'left' }, { url: 'https://shop.example/cart', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? 'allow' : r.class }
const typeInto = (name) => { const r = policy.classify({ type: 'type', text: '4821' }, { url: 'https://forms.example/apply', target: { tag: 'input', role: 'textbox', name, editable: true } }); return r.decision === 'allow' ? 'allow' : r.class }

const BUTTONS = {
  it: [['Acquista ora', 'purchase'], ['Paga', 'purchase'], ['Elimina', 'delete'], ['Invia', 'submit']],
  nl: [['Afrekenen', 'purchase'], ['Nu betalen', 'purchase'], ['Verwijderen', 'delete'], ['Verzenden', 'submit']],
  pt: [['Finalizar pedido', 'purchase'], ['Comprar agora', 'purchase'], ['Excluir', 'delete'], ['Enviar', 'submit']],
  tr: [['SATIN AL', 'purchase'], ['Ödeme yap', 'purchase'], ['SİL', 'delete'], ['Gönder', 'submit']],
}
for (const [locale, rows] of Object.entries(BUTTONS)) {
  test(`CU-358 [${locale}]: buy, pay, delete and send buttons ask`, () => {
    for (const [name, expected] of rows) assert.equal(click(name), expected, name)
  })
}

test('CU-358: credential and personal-ID field names in the four languages ask', () => {
  for (const name of ['Codice di sicurezza', 'Codice fiscale', 'Wachtwoord', 'Burgerservicenummer', 'Bankrekeningnummer', 'Senha', 'CPF',
    'Data de nascimento', 'ŞİFRE', 'TC Kimlik No', 'Doğum tarihi', 'Kart numarası']) {
    assert.equal(typeInto(name), 'sensitive_data', name)
  }
})

test('CU-358 negatives: cancel and ordinary names stay free', () => {
  for (const name of ['Annulla', 'Annuleren', 'Cancelar', 'İptal', 'Pagamento', 'Ödeme yöntemi', 'Silvester']) assert.equal(click(name), 'allow', name)
  for (const name of ['Nome', 'Naam', 'Cidade', 'Şehir', 'Cognome', 'Achternaam']) assert.equal(typeInto(name), 'allow', name)
})
