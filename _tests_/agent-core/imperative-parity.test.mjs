import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy, imperativeParityRows } from '../../_tools_/agent-core/policy.mjs'

// CU-638 (cu-developer-one's design, 19 Nov 13:36Z): every plural / formal imperative of a locale verb asks as its entry asks.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/account', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-638 parity: for every entry and every imperative form, the form (with the entry\'s own object) asks the entry\'s class', () => {
  const rows = imperativeParityRows()
  assert.ok(rows.length > 1500, `the table covers the entry list (${rows.length} rows)`)
  const misses = rows.filter((row) => !click(row.label).includes(row.cls)).map((row) => `${row.label} (${row.cls}, from '${row.entry}')`)
  assert.deepEqual(misses, [])
})

test('CU-638: the filed rows ask (delete / submit / purchase in FR / DE / ES / IT / PT)', () => {
  const rows = { delete: ['Supprimez votre compte', 'Supprime ton compte', 'Löscht euer Konto', 'Eliminad vuestra cuenta', 'Eliminen su cuenta', 'Excluam a conta', 'Excluam a vossa conta', 'Eliminate il vostro account'],
    submit: ['Envoyez', 'Sendet', 'Enviad', 'Envíen', 'Enviem', 'Inviate il messaggio'],
    purchase: ['Bezahlt jetzt', 'Pagad ahora', 'Paguen ahora', 'Paguem agora', 'Pagate ora', 'Überweist das Geld', 'Transferid el dinero', 'Transfiram o dinheiro'] }
  for (const [cls, names] of Object.entries(rows)) for (const name of names) assert.ok(click(name).includes(cls), `${name} -> ${cls}`)
})

test('CU-638 collisions: a participle / noun form alone, or after its noun, stays free', () => {
  for (const name of ['Kauf', 'Kauft', 'Bezahlt', 'Bestellt', 'Entfernt', 'Veröffentlicht', 'Posta', 'Teil', 'Teile', 'Teilt', 'Paye', 'Commande', 'Partilha',
    'Acquistate', 'Eliminate', 'Cancellate', 'Inviate', 'Chiamate', 'Trasferite', 'Pagate', 'Andate', 'Esca',
    'Foto eliminate', 'Messaggi inviati', 'Fatture pagate', 'Rechnung bezahlt', 'Para assinatura anual', 'Para a assinatura']) assert.deepEqual(click(name), [], name)
})

test('CU-638 near misses: conjugated view / show / open verbs stay free', () => {
  for (const name of ['Affichez votre compte', 'Ouvrez le compte', 'Zeigt euer Konto', 'Öffnet euer Konto', 'Mostrad vuestra cuenta', 'Vean su cuenta', 'Visualizzate il vostro account',
    'Aprite il conto', 'Vejam a conta', 'Abram a conta']) assert.deepEqual(click(name), [], name)
})
