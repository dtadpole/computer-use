import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-818 (P1; found by cu-verifier in the #1482 review): an emptying button under a dialog whose TITLE alone names the trash
// ('Empty' under 'Trash' / 'The items will be permanently deleted, so they cannot be recovered.') acts unasked.
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-818-'))
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


test('CU-818: the filed row, verbatim, asks delete on both routes', () => {
  asks([['Empty', 'Trash', 'The items will be permanently deleted, so they cannot be recovered.']])
})

test('CU-818: a title naming the trash lends it to the description\'s item sentences, in every covered language', () => {
  asks([
    ['Leeren', 'Papierkorb', 'Die Objekte werden endgültig gelöscht.'],
    ['空にする', 'ゴミ箱', '項目は完全に削除されます。'],
    ['비우기', '휴지통', '항목이 영구적으로 삭제됩니다.'],
    ['Empty', 'Trash', 'This cannot be undone. Everything will be permanently deleted.'],
  ])
})

test('CU-818: negated, past, past-event, conditional, other-object, no-trash-title and mismatched-button rows stay free', () => {
  free([
    ['Empty', 'Trash', 'The items will not be deleted.'],
    ['Empty', 'Trash', 'The items were permanently deleted.'],
    ['Empty', 'Trash', 'The items were deleted by mistake, so they could not be recovered.'],
    ['Empty', 'Trash', 'Some items were deleted by mistake yesterday.'],
    ['Empty', 'Trash', 'If the items are deleted, they cannot be recovered.'],
    ['Empty', 'Trash', 'Your search history will also be deleted.'],
    ['Empty', 'Notice', 'The items will be permanently deleted.'],
    ['Cancel', 'Trash', 'The items will be permanently deleted.'],
  ])
})

test('#1491 r2: the future passives the in-sentence rule reads count under the title too - cu-researcher\'s miss = CU-821\'s row', () => {
  asks([
    ['Vaciar', 'Papelera', 'Los elementos se eliminarán de forma permanente.'],
    ['Vaciar', 'Papelera', 'Los elementos se borrarán.'],
    ['Svuota', 'Cestino', 'Gli elementi verranno eliminati.'],
    ['Esvaziar', 'Lixeira', 'Os itens serão excluídos.'],
  ])
  free([
    ['Vaciar', 'Papelera', 'Los elementos no se eliminarán.'],
    ['Vaciar', 'Papelera', 'Los elementos se eliminaron.'],
    ['Vaciar', 'Papelera', 'Algunos elementos se eliminaron por error ayer.'],
    ['Vaciar', 'Papelera', 'Si se eliminan los elementos, no se podrán recuperar.'],
    ['Vaciar', 'Aviso', 'Los elementos se eliminarán.'],
  ])
})

// CU-847 (P1; found in #1548's review): a pt pending trash statement with a singular subject read no item noun under a trash
// title ('O arquivo será excluído para sempre.' went free while 'Os arquivos serão excluídos para sempre.' asked). Table r1
// (cu-researcher 22:17Z): pt names each item noun in both numbers.
test('CU-847: the filed singular, verbatim, and each pt item noun in both numbers ask delete under a trash title, on both routes', () => {
  asks([
    ['Esvaziar', 'Lixo', 'O arquivo será excluído para sempre.'],
    ['Esvaziar', 'Lixo', 'Os arquivos serão excluídos para sempre.'],
    ['Esvaziar', 'Lixeira', 'O ficheiro será apagado definitivamente.'],
    ['Esvaziar', 'Lixeira', 'Os ficheiros serão apagados definitivamente.'],
    ['Esvaziar', 'Lixo', 'O documento será removido permanentemente.'],
    ['Esvaziar', 'Lixo', 'Os documentos serão removidos permanentemente.'],
    ['Esvaziar', 'Lixeira', 'O objeto será excluído para sempre.'],
    ['Esvaziar', 'Lixeira', 'Os objetos serão excluídos para sempre.'],
    ['Esvaziar', 'Lixo', 'Os conteúdos serão apagados para sempre.'],
    ['Esvaziar', 'Lixo', 'O conteúdo será apagado para sempre.'],
  ])
})

test('CU-847: the other side - negated, past, conditional, other-object, no-trash-title and non-emptying rows stay free', () => {
  free([
    ['Esvaziar', 'Lixo', 'O arquivo não será excluído.'],
    ['Esvaziar', 'Lixo', 'O arquivo foi excluído para sempre.'],
    ['Esvaziar', 'Lixeira', 'O ficheiro foi apagado por engano ontem.'],
    ['Esvaziar', 'Lixo', 'Se o documento for removido, não poderá ser recuperado.'],
    ['Esvaziar', 'Lixo', 'O histórico de pesquisa será excluído.'],
    ['Esvaziar', 'Aviso', 'O arquivo será excluído para sempre.'],
    ['Cancelar', 'Lixo', 'O arquivo será excluído para sempre.'],
    ['Abrir', 'Lixeira', 'O objeto será excluído para sempre.'],
  ])
})

// CU-849 (P1; follow-up to CU-847): in de / nl / ru / tr / it / es / fr a singular (or unlisted) item noun under a trash title
// read no item, so 'Die Datei wird endgültig gelöscht.' went free while 'Die Dateien werden endgültig gelöscht.' asked. Table r1
// (cu-researcher 00:34Z): each language names the five item nouns of the English cell in both numbers.
test('CU-849: the filed singulars, verbatim, and each new item noun in both numbers ask delete under a trash title, on both routes', () => {
  asks([
    ['Leeren', 'Papierkorb', 'Die Datei wird endgültig gelöscht.'],
    ['Leeren', 'Papierkorb', 'Die Dateien werden endgültig gelöscht.'],
    ['Leeren', 'Papierkorb', 'Das Objekt wird endgültig gelöscht.'],
    ['Leeren', 'Papierkorb', 'Das Dokument wird endgültig gelöscht.'],
    ['Leeren', 'Papierkorb', 'Die Dokumente werden endgültig gelöscht.'],
    ['Leegmaken', 'Prullenmand', 'Het bestand wordt definitief verwijderd.'],
    ['Leegmaken', 'Prullenmand', 'De bestanden worden definitief verwijderd.'],
    ['Leegmaken', 'Prullenmand', 'Het onderdeel wordt definitief verwijderd.'],
    ['Leegmaken', 'Prullenmand', 'De documenten worden definitief verwijderd.'],
    ['Leegmaken', 'Prullenmand', 'De objecten worden definitief verwijderd.'],
    ['Очистить', 'Корзина', 'Файл будет удалён навсегда.'],
    ['Очистить', 'Корзина', 'Файлы будут удалены навсегда.'],
    ['Очистить', 'Корзина', 'Объект будет удалён навсегда.'],
    ['Очистить', 'Корзина', 'Элемент будет удалён навсегда.'],
    ['Очистить', 'Корзина', 'Документ будет удалён навсегда.'],
    ['Очистить', 'Корзина', 'Документы будут удалены навсегда.'],
    ['Boşalt', 'Çöp Sepeti', 'Dosya kalıcı olarak silinecek.'],
    ['Boşalt', 'Çöp Sepeti', 'Dosyalar kalıcı olarak silinecek.'],
    ['Boşalt', 'Çöp Sepeti', 'Öğe kalıcı olarak silinecek.'],
    ['Boşalt', 'Çöp Sepeti', 'Belge kalıcı olarak silinecek.'],
    ['Boşalt', 'Çöp Sepeti', 'Belgeler kalıcı olarak silinecek.'],
    ['Boşalt', 'Çöp Sepeti', 'Nesne kalıcı olarak silinecek.'],
    ['Boşalt', 'Çöp Sepeti', 'Nesneler kalıcı olarak silinecek.'],
    ['Boşalt', 'Çöp Sepeti', 'Tüm içerikler kalıcı olarak silinecek.'],
    ['Svuota', 'Cestino', "L'oggetto verrà eliminato definitivamente."],
    ['Svuota', 'Cestino', 'Gli oggetti verranno eliminati definitivamente.'],
    ['Svuota', 'Cestino', 'Il documento verrà eliminato definitivamente.'],
    ['Svuota', 'Cestino', 'I documenti verranno eliminati definitivamente.'],
    ['Svuota', 'Cestino', 'I contenuti verranno eliminati definitivamente.'],
    ['Svuota', 'Cestino', 'Gli elementi verranno eliminati definitivamente.'],
    ['Vaciar', 'Papelera', 'El fichero será eliminado para siempre.'],
    ['Vaciar', 'Papelera', 'Los ficheros serán eliminados para siempre.'],
    ['Vaciar', 'Papelera', 'Los contenidos serán eliminados para siempre.'],
    ['Vaciar', 'Papelera', 'El archivo será eliminado para siempre.'],
    ['Vider', 'Corbeille', "L'objet sera supprimé définitivement."],
    ['Vider', 'Corbeille', 'Les objets seront supprimés définitivement.'],
    ['Vider', 'Corbeille', 'Les contenus seront supprimés définitivement.'],
    ['Vider', 'Corbeille', 'Le fichier sera supprimé définitivement.'],
  ])
})

test('CU-849: the other side - negated, past and other-object rows in each language, no-trash-title and non-emptying rows, and the data nouns stay free', () => {
  free([
    ['Leeren', 'Papierkorb', 'Die Datei wird nicht gelöscht.'],
    ['Leeren', 'Papierkorb', 'Die Datei wurde gelöscht.'],
    ['Leeren', 'Papierkorb', 'Der Suchverlauf wird endgültig gelöscht.'],
    ['Leeren', 'Hinweis', 'Die Datei wird endgültig gelöscht.'],
    ['Abbrechen', 'Papierkorb', 'Die Datei wird endgültig gelöscht.'],
    ['Leegmaken', 'Prullenmand', 'Het bestand wordt niet verwijderd.'],
    ['Leegmaken', 'Prullenmand', 'Het bestand werd verwijderd.'],
    ['Leegmaken', 'Prullenmand', 'De zoekgeschiedenis wordt definitief verwijderd.'],
    ['Очистить', 'Корзина', 'Файл не будет удалён.'],
    ['Очистить', 'Корзина', 'Файл был удалён.'],
    ['Очистить', 'Корзина', 'История поиска будет удалена навсегда.'],
    ['Boşalt', 'Çöp Sepeti', 'Dosya silinmeyecek.'],
    ['Boşalt', 'Çöp Sepeti', 'Dosya silindi.'],
    ['Boşalt', 'Çöp Sepeti', 'Arama geçmişi kalıcı olarak silinecek.'],
    ['Svuota', 'Cestino', "L'oggetto non verrà eliminato."],
    ['Svuota', 'Cestino', "L'oggetto è stato eliminato."],
    ['Svuota', 'Cestino', 'La cronologia delle ricerche verrà eliminata definitivamente.'],
    ['Vaciar', 'Papelera', 'El fichero no será eliminado.'],
    ['Vaciar', 'Papelera', 'El fichero fue eliminado.'],
    ['Vaciar', 'Papelera', 'El historial de búsqueda será eliminado para siempre.'],
    ['Vider', 'Corbeille', "L'objet ne sera pas supprimé."],
    ['Vider', 'Corbeille', "L'objet a été supprimé."],
    ['Vider', 'Corbeille', "L'historique de recherche sera supprimé définitivement."],
    ['Cancelar', 'Papelera', 'El fichero será eliminado para siempre.'],
    // The data nouns stay CU-832's plurals: tr 'veri' stays out, and pt 'dado' (cu-verifier's CU-847 mutant P6) too.
    ['Boşalt', 'Çöp Sepeti', 'Veri kalıcı olarak silinecek.'],
    ['Esvaziar', 'Lixo', 'O dado será excluído para sempre.'],
  ])
})
