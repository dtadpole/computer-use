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
// (but / mas / pero / ma / mais / aber / maar / ama ..., the sentence adverbs after ',' or ';', tr contrastive 'ise') is read as a
// sentence of its own. A negated or past second clause, a restore verb and a non-emptying button stay free.
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

test('CU-890: en - a positive future after but / ; however, following a negated first clause, asks delete', () => {
  asks([
    // cu-developer-two's filed row (cross-check 23:02:20Z 27 Nov), free on main on both routes
    ['Empty', 'Trash', 'The apps will not delete the folders nor the photos, but they will delete the items in the trash.'],
    ['Empty', 'Trash', 'The app will not delete the folders; however, it will delete the items in the Trash.'],
    ['Empty', 'Trash', 'It will not only delete the files but it will also delete the items in the Trash.'],
  ])
})

test('CU-892: pt / es / it / fr / de / nl - a positive future after the contrast marker asks delete', () => {
  asks([
    ['Esvaziar', 'Lixeira', 'O app não apagará as pastas, mas excluirá os itens da lixeira.'],
    // the 'contudo' shape the #1588 cut returned to free (CU-892's source)
    ['Esvaziar', 'Lixeira', 'O app não apagará as pastas; contudo, excluirá os itens da lixeira.'],
    ['Vaciar', 'Papelera', 'La app no eliminará las carpetas, pero eliminará los elementos de la papelera.'],
    ['Vaciar', 'Papelera', 'La app no eliminará las carpetas, sin embargo, eliminará los elementos de la papelera.'],
    ['Vaciar', 'Papelera', 'No solo eliminará los archivos, sino que también eliminará los elementos de la papelera.'],
    ['Vaciar', 'Papelera', 'La app no quitará las carpetas, pero quitará los elementos de la papelera.'],
    ['Vider', 'Corbeille', "L'app ne retirera pas les dossiers, mais retirera les éléments de la corbeille."],
    ['Svuota', 'Cestino', "L'app non cancellerà le cartelle, ma cancellerà tutti i file del cestino."],
    ['Vider', 'Corbeille', "L'app ne supprimera pas les dossiers, mais supprimera les éléments de la corbeille."],
    ['Leeren', 'Papierkorb', 'Die App wird die Ordner nicht löschen, aber sie wird die Objekte im Papierkorb löschen.'],
    ['Legen', 'Prullenbak', 'De app zal de mappen niet verwijderen, maar zal de items in de prullenbak verwijderen.'],
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
    ['Vaciar', 'Papelera', 'La app no eliminará las carpetas, pero tampoco eliminará los elementos de la papelera.'],
    ['Vaciar', 'Papelera', 'La app no eliminará las carpetas, pero ni siquiera eliminará los elementos de la papelera.'],
    ['Esvaziar', 'Lixeira', 'O app não apagará as pastas, mas tampouco excluirá os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'O app não apagará as pastas, mas nem excluirá os itens da lixeira.'],
    ['Empty', 'Trash', 'The app will not delete the folders, but neither will it delete the items in the Trash.'],
    ['Legen', 'Prullenbak', 'De app zal de mappen niet verwijderen, maar evenmin zal ze de items in de prullenbak verwijderen.'],
  ])
  asks([
    ['Esvaziar', 'Lixeira', 'O app não apagará as pastas, mas também excluirá os itens da lixeira.'],
    ['Svuota', 'Cestino', 'Il servizio non cancellerà le bozze, ma eliminerà anche gli elementi del cestino.'],
    ['Vaciar', 'Papelera', 'La app no eliminará las carpetas, pero también eliminará los elementos de la papelera.'],
    // the additive after the clause's delete verb does not negate it (cu-researcher's position change, r1c)
    ['Vaciar', 'Papelera', 'La app no eliminará las carpetas, pero eliminará todos los elementos de la papelera sin dejar ni uno.'],
    ['Esvaziar', 'Lixeira', 'O app não apagará as pastas, mas excluirá os itens da lixeira sem deixar nem um.'],
  ])
})

test('#1615 round 2 (cu-verifier\'s classes, r1d): no cut right after a negator; any negator before the cut clause\'s verb shares the negation', () => {
  free([
    // pt 'não mais' / 'nunca mais' ('no longer' / 'never again') are no contrast
    ['Esvaziar', 'Lixeira', 'O app não mais excluirá os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'O app nunca mais excluirá os itens da lixeira.'],
    // a negator before the cut clause's verb, outside the four-word window or outside TRASH_NEGATION
    ['Empty', 'Trash', 'The app will not delete the folders, but no item in the Trash will be deleted.'],
    ['Leeren', 'Papierkorb', 'Die App löscht die Ordner nicht, aber sie wird die Objekte im Papierkorb niemals löschen.'],
  ])
  asks([
    // a comma or semicolon between the negator and the contrast word keeps the cut (cu-researcher's r1d condition)
    ['Vider', 'Corbeille', "L'app ne supprimera pas les dossiers, mais elle supprimera les éléments de la corbeille."],
    ['Legen', 'Prullenbak', 'De app zal de mappen niet verwijderen, maar zal de items in de prullenbak verwijderen.'],
    ['Leeren', 'Papierkorb', 'Die App löscht die Ordner nicht, aber sie wird die Objekte im Papierkorb löschen.'],
    ['Empty', 'Trash', 'The app will not delete the folders, but every item in the Trash will be deleted.'],
  ])
})
