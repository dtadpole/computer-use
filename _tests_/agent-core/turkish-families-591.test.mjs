import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-591: the future with its copula ('silinecektir') reads like the future ('silinecek'); the card number in the genitive
// ('Kartınızın numarası') reads like the compound ('Kart numarası').
const policy = createPolicy({ sitePolicy: () => 'allow' })
const u = 'https://shop.example/tr/hesap'
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: u, target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? 'allow' : (r.classes ?? [r.class]).join('+') }
const field = (name) => { const r = policy.classify({ type: 'type', text: 'x' }, { url: u, target: { tag: 'input', role: 'textbox', name } }); return r.decision === 'allow' ? 'allow' : (r.classes ?? [r.class]).join('+') }

test('CU-591: the future + copula asks like the future', () => {
  for (const name of ['Hesap kalıcı olarak silinecektir, onayla', 'Dosyalar silinecektir - onayla', 'Hesabınız silinecek, onayla']) assert.ok(click(name).includes('delete'), name)
})

test('CU-591: the card number in the genitive is sensitive like the compound', () => {
  for (const name of ['Kartınızın numarası', 'Kartın numarası', 'Kart numarası', 'Kartınızın numarasını girin']) assert.ok(field(name).includes('sensitive_data'), name)
})

test('CU-591 negatives: other words on the same stems stay free', () => {
  for (const name of ['Silindir', 'Silinenler', 'Kartlar', 'Kartvizit', 'Numara sırası']) assert.equal(click(name), 'allow', name)
  for (const name of ['Kartvizit adı', 'Sipariş numarası', 'Telefon numarası']) assert.ok(!field(name).includes('sensitive_data'), name)
})
