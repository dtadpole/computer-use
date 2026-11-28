import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-892 + CU-890 (P1, one class-general fix): a positive future of a covered delete verb after a contrast word, following a negated
// earlier future, went free over the trash - the cell read only the first match, so a negated first clause decided the sentence.
// The table cu-researcher OK'd (r1 + r1a, 04:09Z): main's whole-sentence reading stays; then each clause cut at a contrast marker
// (es pero / sino, tr ama ..., the sentence adverbs after ',' or ';', tr contrastive 'ise') is read as a sentence of its own. A
// negated or past second clause, a restore verb and a non-emptying button stay free. Round 2c (D-121 (1)) cut the en / de / it / pt /
// nl arms, whose cut clauses over-asked when a word no negation list holds negated them; round 2d cut fr 'mais', which also cut
// Portuguese 'mais' ('more') (CU-890, CU-920).
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-892-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
const store = createAppApprovals({ path: join(tmp, 'a.json') })
store.grantAlways(FIXTURE, { by: 'api' })
const desktop = createAppPolicy({ scope: [FIXTURE], approvals: store })
const web = createPolicy({ sitePolicy: () => 'allow' })
const click = { type: 'click', x: 1, y: 1, button: 'left' }
const classes = (v) => (v.decision === 'allow' ? [] : (v.classes ?? [v.class]))
const onWeb = (name, dialogName, description) => web.classify(click, { url: 'https://app.example/files', target: { role: 'button', name, dialogName, ...(description ? { dialogDescription: description } : {}) } })
const onDesktop = (name, dialogName, description) => desktop.classify(click, { frontmostBundleId: FIXTURE, target: { origin: FIXTURE, role: 'AXButton', name, fingerprint: name, defaultButtonRead: true, dialogName, ...(description ? { dialogDescription: description } : {}) } })
const asks = (rows) => { for (const [n, t, d] of rows) { assert.ok(classes(onWeb(n, t, d)).includes('delete'), `web ${n} | ${t} | ${d ?? ''}`); assert.ok(classes(onDesktop(n, t, d)).includes('delete'), `desktop ${n} | ${t} | ${d ?? ''}`) } }
const free = (rows) => { for (const [n, t, d] of rows) { assert.ok(!classes(onWeb(n, t, d)).includes('delete'), `web ${n} | ${t} | ${d ?? ''}`); assert.ok(!classes(onDesktop(n, t, d)).includes('delete'), `desktop ${n} | ${t} | ${d ?? ''}`) } }

test('CU-890 cut (#1615 round 2c, D-121 (1)): en has no contrast arm - a cut clause negated by a negative pronoun stays free, as on main', () => {
  free([
    // asked at 00c45d10a, free on main; the sentence states no pending delete (cu-coordinator's grade 16:43Z)
    ['Empty', 'Trash', 'The app will not delete the folders, but nothing in the Trash will be deleted.'],
    ['Empty', 'Trash', 'The app will not delete the folders, but none of the items in the Trash will be deleted.'],
    ['Empty', 'Trash', 'The app will not delete the folders, but nobody will delete the items in the Trash.'],
  ])
})

test('CU-892: es / fr - a positive future after the contrast marker (es pero / sino, fr ; cependant) asks delete', () => {
  asks([
    // the 'contudo' shape the #1588 cut returned to free (CU-892's source)
    ['Vaciar', 'Papelera', 'La app no eliminará las carpetas, pero eliminará los elementos de la papelera.'],
    ['Vaciar', 'Papelera', 'La app no eliminará las carpetas, sin embargo, eliminará los elementos de la papelera.'],
    ['Vaciar', 'Papelera', 'No solo eliminará los archivos, sino que también eliminará los elementos de la papelera.'],
    ['Vaciar', 'Papelera', 'La app no quitará las carpetas, pero quitará los elementos de la papelera.'],
  ])
})

test('CU-892: tr - the clause whose subject carries contrastive ise is read on its own (cu-verifier 02:25Z)', () => {
  asks([['Boşalt', 'Çöp Sepeti', "Uygulama hiçbir dosyayı silmeyecek, Çöp Sepeti'ndeki öğeler ise kalıcı olarak silinecek."]])
  free([['Boşalt', 'Çöp Sepeti', 'Uygulama hiçbir dosyayı silmeyecek, Çöp Sepeti ise boşaltılmayacak.']])
})

test('CU-892 + CU-890: the second clause negated or past, a restore verb, a mid-clause adverb and a non-emptying button stay free', () => {
  free([
    ['Empty', 'Trash', 'The app will not delete the folders, but it will not delete the items in the Trash.'],
    ['Empty', 'Trash', 'The app will not delete the folders; however, it will not delete the items in the Trash.'],
    ['Empty', 'Trash', 'The app will not delete the folders, but it deleted the items in the Trash yesterday.'],
    ['Empty', 'Trash', 'The app will not delete the folders, but it will restore the items in the Trash.'],
    ['Empty', 'Trash', 'The items will not be deleted, but the files will be moved.'],
    ['Esvaziar', 'Lixeira', 'O app não apagará as pastas, mas não excluirá os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'O app não apagará as pastas; contudo, não excluirá os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'O app não apagará as pastas, mas excluiu os itens da lixeira ontem.'],
    // es free rows use quitar: a negated 'eliminará ... de la papelera' already asks on main by the es echo of 'Vaciar' (CU-826).
    ['Vaciar', 'Papelera', 'La app no quitará las carpetas, pero no quitará los elementos de la papelera.'],
    ['Vaciar', 'Papelera', 'La app no quitará las carpetas, sin embargo, no quitará los elementos de la papelera.'],
    ['Vaciar', 'Papelera', 'La app no quitará las carpetas, pero quitó los elementos de la papelera ayer.'],
    ['Svuota', 'Cestino', "L'app non cancellerà le cartelle, ma non cancellerà i file del cestino."],
    ['Vider', 'Corbeille', "L'app ne retirera pas les dossiers, mais ne retirera pas les éléments de la corbeille."],
    ['Leeren', 'Papierkorb', 'Die App wird die Ordner nicht löschen, aber sie wird die Objekte im Papierkorb nicht löschen.'],
    ['Leeren', 'Papierkorb', 'Die Dateien werden jedoch nicht gelöscht.'],
    ['Legen', 'Prullenbak', 'De app zal de mappen niet verwijderen, maar zal de items in de prullenbak niet verwijderen.'],
    // the gate is unchanged: no emptying button
    ['Cancel', 'Trash', 'The apps will not delete the folders nor the photos, but they will delete the items in the trash.'],
    ['Cancelar', 'Papelera', 'La app no eliminará las carpetas, pero eliminará los elementos de la papelera.'],
  ])
})

test('#1615 round 2: a negative additive before the cut clause\'s verb shares the negation; after the verb, or a positive additive, it asks', () => {
  // cu-researcher's held-out row (NOT OK at e6fd72ea0): free on main and in en, it asked on the first head
  free([
    ['Svuota', 'Cestino', 'Il servizio non cancellerà le bozze, ma nemmeno eliminerà gli elementi del cestino.'],
    ['Svuota', 'Cestino', 'Il servizio non cancellerà le bozze, ma neanche eliminerà gli elementi del cestino.'],
    ['Svuota', 'Cestino', 'Il servizio non cancellerà le bozze, ma neppure eliminerà gli elementi del cestino.'],
    // es rows use quitar: a negated 'eliminará ... de la papelera' already asks on main by the es echo of 'Vaciar' (CU-826)
    ['Vaciar', 'Papelera', 'La app no quitará las carpetas, pero tampoco quitará los elementos de la papelera.'],
    ['Vaciar', 'Papelera', 'La app no quitará las carpetas, pero ni siquiera quitará los elementos de la papelera.'],
    ['Esvaziar', 'Lixeira', 'O app não apagará as pastas, mas tampouco excluirá os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'O app não apagará as pastas, mas nem excluirá os itens da lixeira.'],
    ['Empty', 'Trash', 'The app will not delete the folders, but neither will it delete the items in the Trash.'],
    ['Legen', 'Prullenbak', 'De app zal de mappen niet verwijderen, maar evenmin zal ze de items in de prullenbak verwijderen.'],
  ])
  asks([
    ['Vaciar', 'Papelera', 'La app no quitará las carpetas, pero también quitará los elementos de la papelera.'],
    // the additive after the clause's delete verb does not negate it (cu-researcher's position change, r1c)
    ['Vaciar', 'Papelera', 'La app no quitará las carpetas, pero quitará todos los elementos de la papelera sin dejar ni uno.'],
  ])
})

test('#1615 round 2 (cu-verifier\'s classes, r1d): no cut right after a negator; any negator before the cut clause\'s verb shares the negation', () => {
  free([
    // pt 'não mais' / 'nunca mais' ('no longer' / 'never again') are no contrast
    ['Esvaziar', 'Lixeira', 'O app não mais excluirá os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'O app nunca mais excluirá os itens da lixeira.'],
    // a negator before the cut clause's verb, outside the four-word window or outside TRASH_NEGATION
    ['Empty', 'Trash', 'The app will not delete the folders, but no item in the Trash will be deleted.'],
    // main reads the first delete verb's window ('nicht löschen') and stays free; the cut clause carries 'niemals'
    ['Leeren', 'Papierkorb', 'Die App wird die Ordner nicht löschen, aber sie wird die Objekte im Papierkorb niemals löschen.'],
  ])
})

test('#1615 round 2c (D-121 (1) cut): de / it / pt / nl have no contrast arm - a clause negated by a word no list holds stays free, as on main (CU-920)', () => {
  free([
    // cu-developer-two's F1 and its twins (free on main, asked at 00c45d10a)
    ['Leeren', 'Papierkorb', 'Die Ordner werden nicht gelöscht, aber ebenso wenig werden die Objekte gelöscht.'],
    ['Leeren', 'Papierkorb', 'Die Ordner werden nicht gelöscht, aber genauso wenig werden die Objekte gelöscht.'],
    ['Leeren', 'Papierkorb', 'Die App wird die Ordner nicht löschen, aber ebenso wenig wird sie die Objekte im Papierkorb löschen.'],
    // cu-verifier's 'keineswegs' class and the probe's 'in no way' adverbs (16:42Z)
    ['Leeren', 'Papierkorb', 'Die App wird die Ordner nicht löschen, aber sie wird die Objekte im Papierkorb keinesfalls löschen.'],
    ['Svuota', 'Cestino', "L'app non cancellerà le cartelle, ma in nessun modo cancellerà i file del cestino."],
    ['Esvaziar', 'Lixeira', 'O app não apagará as pastas, mas de modo algum excluirá os itens da lixeira.'],
    ['Legen', 'Prullenbak', 'De app zal de mappen niet verwijderen, maar zal de items in de prullenbak nimmer verwijderen.'],
    ['Legen', 'Prullenbak', 'De app zal de mappen niet verwijderen, maar zal de items in de prullenbak geenszins verwijderen.'],
  ])
})

test('#1615 round 2d (the last cut): fr \'mais\' cuts nothing, so Portuguese \'mais\' (more) after a negator stays free, as on main', () => {
  free([
    // cu-verifier's NOT OK at cb36b8f1e (18:25Z): asked there, free on main
    ['Esvaziar', 'Lixeira', 'O app não excluirá as pastas agora, nem mais tarde excluirá os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'O app não vai excluir as pastas agora, nem mais tarde vai excluir os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Os itens da lixeira não serão excluídos hoje, nem mais tarde serão excluídos da lixeira.'],
  ])
})
