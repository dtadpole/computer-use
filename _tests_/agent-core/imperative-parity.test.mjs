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
    purchase: ['Bezahlt jetzt', 'Bestellt jetzt', 'Kauft jetzt', 'Pagate subito', 'Pagad ahora', 'Paguen ahora', 'Paguem agora', 'Pagate ora', 'Überweist das Geld', 'Transferid el dinero', 'Transfiram o dinheiro'] }
  for (const [cls, names] of Object.entries(rows)) for (const name of names) assert.ok(click(name).includes(cls), `${name} -> ${cls}`)
})

test('CU-638 collisions: a participle / noun form alone, or after its noun, stays free', () => {
  for (const name of ['Kauf', 'Kauft', 'Bezahlt', 'Bestellt', 'Entfernt', 'Veröffentlicht', 'Posta', 'Teil', 'Teile', 'Teilt', 'Paye', 'Commande', 'Partilha',
    'Acquistate', 'Eliminate', 'Cancellate', 'Inviate', 'Chiamate', 'Trasferite', 'Pagate', 'Andate', 'Esca',
    'Foto eliminate', 'Messaggi inviati', 'Fatture pagate', 'Rechnung bezahlt', 'Para assinatura anual', 'Para a assinatura',
    'Bestell-Nr.', 'Bestell-Nummer', 'Zahl-Art', 'Lösch-Datum', 'Start-Seite', 'Bestellt am 3. Mai', 'Bezahlt per Karte', 'Inviate da Mario']) assert.deepEqual(click(name), [], name)
})

test('CU-638 near misses: conjugated view / show / open verbs stay free', () => {
  for (const name of ['Affichez votre compte', 'Ouvrez le compte', 'Zeigt euer Konto', 'Öffnet euer Konto', 'Mostrad vuestra cuenta', 'Vean su cuenta', 'Visualizzate il vostro account',
    'Aprite il conto', 'Vejam a conta', 'Abram a conta']) assert.deepEqual(click(name), [], name)
})

// cu-verifier at CU-638's close: the parity test is generated from the table, so a form dropped from the table would drop its row
// too. These pinned rows, one or more per language and person, must stay generated.
test('CU-638 / CU-641: pinned forms stay in the table (a dropped form fails here)', () => {
  const labels = new Set(imperativeParityRows().map((row) => row.label))
  for (const label of ['supprimez', 'supprime', 'envoyez', 'payez', 'löscht', 'lösche', 'löschen sie', 'sendet', 'bezahlt jetzt', 'eliminad', 'eliminen', 'elimine',
    'pagad', 'paguen', 'enviad', 'envíen', 'pagate ora', 'excluam', 'paguem', 'enviem', 'verzend', 'verzendt u', 'zeg abonnement op', 'zegt u abonnement op',
    'annuleer abonnement', 'wis account', 'verwijdert u', 'staat u toegang toe',
    // CU-648: Russian and Korean.
    'удалите', 'удали', 'отправьте', 'оплатите', 'купите', 'закажите', 'оформите заказ', 'сотрите', '보내세요', '보내 주세요', '삭제해 주세요', '결제하세요', '구매해 주세요', '전송하세요']) assert.ok(labels.has(label), `pinned row: ${label}`)
})
