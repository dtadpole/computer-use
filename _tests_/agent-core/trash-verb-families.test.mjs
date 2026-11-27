import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-809 (P1; follow-up to CU-805 after #1475 r2, found by cu-researcher): common erase / remove / discard verbs outside the
// #1475 table go free in pending trash statements - zh '…将被永久删去。' under '清倒', ko '…영구적으로 폐기됩니다.' under '비우기'.
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-809-'))
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

test('CU-809: the filed rows, verbatim, ask delete on both routes', () => {
  asks([
    ['清倒', '废纸篓', '废纸篓内的文件将被永久删去。'],
    ['비우기', '휴지통', '휴지통의 모든 항목이 영구적으로 폐기됩니다.'],
  ])
})

test('#1479 close (cu-verifier 15:35Z): the row that kills mutant N4 (ko 될 거예요 off) asks', () => {
  asks([['비우기', '휴지통', '휴지통의 모든 항목이 영구적으로 삭제될 거예요.']])
})

test('CU-809: the added verb families ask when pending, per the table cu-researcher OK\'d (15:35Z)', () => {
  asks([
    ['清倒', '废纸篓', '废纸篓中的文件将被丢弃。'],
    ['清倒', '废纸篓', '废纸篓中的所有项目将被彻底擦除。'],
    ['비우기', '휴지통', '휴지통의 항목이 모두 파기됩니다.'],
    ['비우기', '휴지통', '휴지통의 항목이 모두 버려집니다.'],
    ['空にする', 'ゴミ箱', 'ゴミ箱の項目はすべて廃棄されます。'],
    ['空にする', 'ゴミ箱', 'ゴミ箱の項目はすべて捨てられます。'],
    ['Очистить', 'Корзина', 'Все файлы в Корзине будут выброшены.'],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler atılacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti temizlenecek."],
  ])
})

test('CU-809: negated and past twins of every added family stay free', () => {
  free([
    ['清倒', '废纸篓', '废纸篓内的文件不会被删去。'],
    ['清倒', '废纸篓', '废纸篓中的文件已被丢弃。'],
    ['비우기', '휴지통', '휴지통의 항목이 폐기되었습니다.'],
    ['비우기', '휴지통', '휴지통의 항목은 폐기되지 않습니다.'],
    ['비우기', '휴지통', '휴지통의 항목은 버려지지 않습니다.'],
    ['비우기', '휴지통', '휴지통의 항목이 버려졌습니다.'],
    ['空にする', 'ゴミ箱', 'ゴミ箱の項目は破棄されませんでした。'],
    ['空にする', 'ゴミ箱', 'ゴミ箱の項目は廃棄されません。'],
    ['空にする', 'ゴミ箱', 'ゴミ箱の項目は捨てられました。'],
    ['空にする', 'ゴミ箱', 'ゴミ箱の項目は捨てられません。'],
    ['Очистить', 'Корзина', 'Файлы в Корзине не будут стёрты.'],
    ['Очистить', 'Корзина', 'Файлы в Корзине были выброшены.'],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler yok edilmeyecek."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler atılmayacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti temizlendi."],
  ])
})

test('#1481 r2: cu-researcher\'s and cu-developer-two\'s tr misses verbatim, and the tr destroy verb / formal future rows', () => {
  asks([
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki tüm dosyalar kalıcı olarak imha edilecek."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki tüm öğeler kalıcı olarak atılacaktır."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler temizlenecektir."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler imha edilecektir."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler imha edilir."],
  ])
  free([
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar imha edilmeyecek."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar imha edildi."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler atılmayacaktır."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler temizlenmeyecektir."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler imha edilmek üzere değil."],
  ])
})

// CU-815 (P1; follow-up to CU-809 after #1481 r2): a compound or periphrastic form of a covered verb - a delete noun with a light
// verb, a resultative complement, a converb chain - went free in a pending trash statement while its plain form asked. The table
// cu-researcher OK'd (13:44Z) puts each compound in its language's verb slot only; markers, negation, past and gap are unchanged.
test('CU-815: the filed rows, verbatim, ask delete on both routes', () => {
  asks([
    ['비우기', '휴지통', '휴지통 항목은 영구 삭제 처리됩니다.'],
    ['清倒', '废纸篓', '废纸篓里的文件会被全部删光。'],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar kalıcı olarak silinip gidecek."],
  ])
})

test('CU-815: each language\'s compound asks when pending, as its plain twin already does (ko with and without the space)', () => {
  asks([
    // plain twins, read on main (the parity proof)
    ['비우기', '휴지통', '휴지통 항목은 영구 삭제됩니다.'],
    ['清倒', '废纸篓', '废纸篓里的文件会被全部删除。'],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar kalıcı olarak silinecek."],
    ['空にする', 'ゴミ箱', 'ゴミ箱内のファイルはすべて完全に消去されます。'],
    ['Очистить', 'Корзина', 'Все файлы в Корзине будут удалены.'],
    // ko: Sino delete noun + 처리, both spellings
    ['비우기', '휴지통', '휴지통의 모든 파일은 영구 제거 처리될 예정입니다.'],
    ['비우기', '휴지통', '휴지통 항목을 모두 폐기 처리합니다.'],
    ['비우기', '휴지통', '휴지통 항목은 영구 삭제처리됩니다.'],
    ['비우기', '휴지통', '휴지통의 모든 파일은 영구 제거처리될 예정입니다.'],
    // zh: resultatives on 删
    ['清倒', '废纸篓', '废纸篓中的所有项目将被彻底删干净。'],
    ['清倒', '废纸篓', '廢紙簍裡的檔案即將被全部刪完。'],
    // tr: -Ip + git-
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki tüm öğeler kalıcı olarak kaldırılıp gidecektir."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar temizlenip gider."],
    // ja: Sino delete noun + 処理
    ['空にする', 'ゴミ箱', 'ゴミ箱内のファイルはすべて完全に消去処理されます。'],
    ['空にする', 'ゴミ箱', 'ゴミ箱の項目は廃棄処理される予定です。'],
    // ru: light-verb participle + delete noun
    ['Очистить', 'Корзина', 'Будет произведена полная очистка Корзины.'],
    ['Очистить', 'Корзина', 'В Корзине будет выполнено безвозвратное удаление файлов.'],
  ])
})

test('CU-815: the negated and past twins of each compound stay free', () => {
  free([
    ['비우기', '휴지통', '휴지통 항목은 삭제 처리되지 않습니다.'],
    ['비우기', '휴지통', '휴지통의 파일은 제거 처리되지 않습니다.'],
    ['비우기', '휴지통', '휴지통 항목이 모두 폐기 처리되었습니다.'],
    ['비우기', '휴지통', '휴지통 항목이 모두 폐기처리되었습니다.'],
    ['清倒', '废纸篓', '废纸篓里的文件没有被删光。'],
    ['清倒', '废纸篓', '废纸篓中的项目不会被删完。'],
    ['清倒', '废纸篓', '废纸篓里的文件已经全部删干净了。'],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler silinip gitmeyecek."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar kalıcı olarak silinip gitti."],
    ['空にする', 'ゴミ箱', 'ゴミ箱の項目は消去処理されません。'],
    ['空にする', 'ゴミ箱', 'ゴミ箱の項目はすべて削除処理されました。'],
    ['Очистить', 'Корзина', 'Из Корзины не будет произведено удаление файлов.'],
    ['Очистить', 'Корзина', 'Из Корзины было выполнено удаление файлов.'],
  ])
})

// CU-819 (P1; follow-up to CU-813 after #1482 r2): a ko pending delete in the future adnominal + a dependent noun + a copula
// causal ending went free - '…삭제될 터이므로 백업하세요.' - while the same ending after 것 asked. The table cu-researcher OK'd
// (15:06Z) lets 터 / 거 take main's four endings after 것; negation and past still decide first.
test('CU-819: the filed row, verbatim, and each new noun + ending ask, with and without the space, beside their 것 twins', () => {
  asks([
    ['비우기', '알림', '휴지통 항목은 곧 영구 삭제될 터이므로 백업하세요.'],
    ['비우기', '알림', '휴지통 항목은 곧 영구 삭제될 것이므로 백업하세요.'],
    ['비우기', '알림', '휴지통 항목은 곧 영구 삭제될터이므로 백업하세요.'],
    ['비우기', '알림', '휴지통 항목은 완전히 제거될 터이니 필요한 파일은 먼저 옮기세요.'],
    ['비우기', '알림', '휴지통 항목은 완전히 제거될 테니 필요한 파일은 먼저 옮기세요.'],
    ['비우기', '알림', '휴지통 항목은 영구적으로 파기될 터이기에 되돌릴 수 없습니다.'],
    ['비우기', '알림', '휴지통 항목은 영구적으로 파기될 것이기에 되돌릴 수 없습니다.'],
    ['비우기', '알림', '휴지통 항목은 모두 폐기될 터이기 때문에 복구할 수 없습니다.'],
    ['비우기', '알림', '휴지통 항목은 모두 폐기될 것이기 때문에 복구할 수 없습니다.'],
    ['비우기', '알림', '휴지통 항목은 곧 삭제될 거니까 미리 백업해 두세요.'],
    ['비우기', '알림', '휴지통 항목은 곧 삭제될거니까 미리 백업해 두세요.'],
    ['비우기', '알림', '휴지통 항목은 곧 삭제될 것이니까 미리 백업해 두세요.'],
  ])
})

test('CU-819: the negated and past twins of each new shape, and the near rows, stay free', () => {
  free([
    ['비우기', '알림', '휴지통 항목은 삭제되지 않을 터이므로 그대로 남습니다.'],
    ['비우기', '알림', '휴지통 항목은 이미 삭제되었을 터이므로 복구할 수 없습니다.'],
    ['비우기', '알림', '휴지통 항목은 제거되지 않을 터이니 그대로 두세요.'],
    ['비우기', '알림', '휴지통 항목은 이미 제거됐을 터이니 다시 확인하세요.'],
    ['비우기', '알림', '휴지통 항목은 파기되지 못할 터이기에 안전합니다.'],
    ['비우기', '알림', '휴지통 항목은 이미 파기됐을 터이기에 늦었습니다.'],
    ['비우기', '알림', '휴지통 항목은 폐기되지 않을 터이기 때문에 안전합니다.'],
    ['비우기', '알림', '휴지통 항목은 이미 폐기됐을 터이기 때문에 늦었습니다.'],
    ['비우기', '알림', '휴지통 항목은 삭제 안 될 거니까 걱정하지 마세요.'],
    ['비우기', '알림', '휴지통 항목은 벌써 삭제됐을 거니까 찾지 마세요.'],
    ['비우기', '알림', '휴지통 항목은 영구 삭제될 수 있을 터이므로 주의하세요.'],
    ['비우기', '알림', '휴지통 항목은 이미 삭제된 터라 복구할 수 없었습니다.'],
  ])
})

// CU-823 (P1; follow-up to CU-818 after #1491 r2): a periphrastic or resultative future passive of a covered delete verb - es
// 'quedarán eliminados', pt 'vão ser excluídos', fr 'vont être supprimés' - went free in a pending trash statement, even with the
// trash named in the sentence, while its synthetic future ('serán / serão / seront …') asked. The table cu-researcher OK'd
// (15:45Z) widens only the auxiliary slot of the fr / es / pt future passives, and adds the es reflexive periphrastic, the
// periphrastic auxiliaries of the trash-locative cell (never quedar / ficar / estar) and en 'is / are going to'; negation and past
// still decide first.
test('CU-823: the filed rows, verbatim, ask delete on both routes', () => {
  asks([
    ['Vaciar', 'Papelera', 'Los archivos quedarán eliminados para siempre.'],
    ['Esvaziar', 'Lixo', 'Os arquivos vão ser excluídos de forma permanente.'],
    ['Vider', 'Corbeille', 'Les fichiers vont être supprimés définitivement.'],
    ['Vaciar', 'Papelera', 'Los archivos de la papelera quedarán eliminados para siempre.'],
    ['Esvaziar', 'Lixo', 'Os arquivos do lixo vão ser excluídos de forma permanente.'],
    ['Vider', 'Corbeille', 'Les fichiers de la corbeille vont être supprimés définitivement.'],
  ])
})

test('CU-823: each periphrastic or resultative future passive asks, beside its synthetic twin that asks on main', () => {
  asks([
    // the table's rows, each followed by its synthetic twin
    ['Vaciar', 'Papelera', 'Todos los elementos van a ser borrados de forma permanente.'],
    ['Vaciar', 'Papelera', 'Todos los elementos serán borrados de forma permanente.'],
    ['Vaciar', 'Papelera', 'Los documentos de la papelera van a quedar definitivamente suprimidos.'],
    ['Vaciar', 'Papelera', 'Los documentos de la papelera serán definitivamente suprimidos.'],
    ['Esvaziar', 'Lixeira', 'Os itens irão ser apagados permanentemente.'],
    ['Esvaziar', 'Lixeira', 'Os itens serão apagados permanentemente.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira ficarão excluídos para sempre.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira serão excluídos para sempre.'],
    ['Vider', 'Corbeille', 'Tous les éléments vont être définitivement effacés.'],
    ['Vider', 'Corbeille', 'Tous les éléments seront définitivement effacés.'],
    ['Vider', 'Corbeille', 'Le contenu de la corbeille va être supprimé de façon irréversible.'],
    ['Vider', 'Corbeille', 'Le contenu de la corbeille sera supprimé de façon irréversible.'],
    // estar in the es and pt cells
    ['Vaciar', 'Papelera', 'Los archivos estarán eliminados para siempre.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos vão estar apagados para sempre.'],
    // (1) the es reflexive periphrastic, both word orders
    ['Vaciar', 'Papelera', 'Los elementos se van a borrar de forma permanente.'],
    ['Vaciar', 'Papelera', 'Los archivos van a eliminarse para siempre.'],
    ['Vaciar', 'Papelera', 'Los elementos se borrarán de forma permanente.'],
    // (2) the trash-locative cell, with a removal participle only it reads
    ['Vider', 'Corbeille', 'Tous les fichiers vont être retirés de la corbeille.'],
    ['Vider', 'Corbeille', 'Tous les fichiers seront retirés de la corbeille.'],
    ['Vaciar', 'Papelera', 'Todos los archivos van a ser retirados de la papelera.'],
    ['Vaciar', 'Papelera', 'Todos los archivos serán retirados de la papelera.'],
    ['Esvaziar', 'Lixeira', 'Todos os itens vão ser retirados da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Todos os itens serão retirados da lixeira.'],
    // (3) en 'is / are going to', in the pending cell and in the trash-locative cell
    ['Empty', 'Trash', 'All items are going to be erased.'],
    ['Empty', 'Trash', 'All items will be erased.'],
    ['Empty', 'Trash', 'The file is going to be permanently deleted.'],
    ['Empty', 'Trash', 'The file will be permanently deleted.'],
    ['Empty', 'Trash', 'All items are going to be purged from the trash.'],
    ['Empty', 'Trash', 'All items will be purged from the trash.'],
  ])
})

test('CU-823: the negated and past twins of every new form, and the near rows, stay free', () => {
  free([
    // the filed shapes
    ['Vaciar', 'Papelera', 'Los archivos no quedarán eliminados para siempre.'],
    ['Vaciar', 'Papelera', 'Los archivos quedaron eliminados para siempre.'],
    ['Esvaziar', 'Lixo', 'Os arquivos não vão ser excluídos de forma permanente.'],
    ['Esvaziar', 'Lixo', 'Os arquivos foram excluídos de forma permanente.'],
    ['Vider', 'Corbeille', 'Les fichiers ne vont pas être supprimés définitivement.'],
    ['Vider', 'Corbeille', 'Les fichiers ont été supprimés définitivement.'],
    // the table's rows
    ['Vaciar', 'Papelera', 'Los elementos no van a ser borrados.'],
    ['Vaciar', 'Papelera', 'Todos los elementos fueron borrados de forma permanente.'],
    ['Vaciar', 'Papelera', 'Los documentos de la papelera no van a quedar suprimidos.'],
    ['Vaciar', 'Papelera', 'Los documentos de la papelera quedaron definitivamente suprimidos.'],
    ['Esvaziar', 'Lixeira', 'Os itens não irão ser apagados.'],
    ['Esvaziar', 'Lixeira', 'Os itens foram apagados permanentemente.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira não ficarão excluídos.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira ficaram excluídos para sempre.'],
    ['Vider', 'Corbeille', 'Les éléments ne vont pas être effacés.'],
    ['Vider', 'Corbeille', 'Tous les éléments ont été définitivement effacés.'],
    ['Vider', 'Corbeille', 'Le contenu de la corbeille ne va jamais être supprimé.'],
    ['Vider', 'Corbeille', 'Le contenu de la corbeille a été supprimé de façon irréversible.'],
    // estar
    ['Vaciar', 'Papelera', 'Los archivos no estarán eliminados.'],
    ['Vaciar', 'Papelera', 'Los archivos estaban eliminados.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos não vão estar apagados.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos estavam apagados.'],
    // the table's near rows
    ['Vider', 'Corbeille', 'Les fichiers vont pouvoir être supprimés.'],
    ['Vaciar', 'Papelera', 'Los archivos iban a ser eliminados.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos iam ser excluídos.'],
    // (1)
    ['Vaciar', 'Papelera', 'Los elementos no se van a borrar.'],
    ['Vaciar', 'Papelera', 'Los elementos se borraron de forma permanente.'],
    ['Vaciar', 'Papelera', 'Los archivos no van a eliminarse.'],
    ['Vaciar', 'Papelera', 'Los archivos iban a eliminarse para siempre.'],
    // (2)
    ['Vider', 'Corbeille', 'Les fichiers ne vont pas être retirés de la corbeille.'],
    ['Vider', 'Corbeille', 'Tous les fichiers ont été retirés de la corbeille.'],
    ['Vaciar', 'Papelera', 'Los archivos no van a ser retirados de la papelera.'],
    ['Vaciar', 'Papelera', 'Todos los archivos fueron retirados de la papelera.'],
    ['Esvaziar', 'Lixeira', 'Os itens não vão ser retirados da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Todos os itens foram retirados da lixeira.'],
    // (3) the not and were twins, and a near row whose participle is no delete verb
    ['Empty', 'Trash', 'All items are not going to be erased.'],
    ['Empty', 'Trash', 'All items were going to be erased.'],
    ['Empty', 'Trash', 'The file is not going to be deleted.'],
    ['Empty', 'Trash', 'All items are going to be moved.'],
  ])
})

// CU-842 (P1; follow-up to CU-815 from #1533's held-out): further compound and auxiliary shapes of a covered verb - the ko light
// nouns beside 처리, the tr -(y)Iver- auxiliary, the ja te-form + なくなる - went free in a pending trash statement while the plain
// form asked. The table cu-researcher OK'd (17:23Z) gives each shape only its plain sibling's markers; negation and past decide first.
test('CU-842: the filed rows, verbatim, ask delete on both routes', () => {
  asks([
    ['비우기', '휴지통', '휴지통 항목은 영구히 삭제 조치됩니다.'],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen siliniverecek."],
    ['空にする', 'ゴミ箱', 'ゴミ箱の項目は削除されてなくなります。'],
  ])
})

test('CU-842: each shape asks when pending, as its plain twin already does', () => {
  asks([
    // plain twins, read on main (the parity proof)
    ['비우기', '휴지통', '휴지통의 모든 파일은 영구 제거될 예정입니다.'],
    ['비우기', '휴지통', '휴지통의 모든 항목을 영구 삭제합니다.'],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki tüm öğeler bir anda kaldırılacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar tek tıkla temizlenir."],
    ['空にする', 'ゴミ箱', 'ゴミ箱の項目はすべて消されます。'],
    ['空にする', 'ゴミ箱', 'ゴミ箱内の書類は破棄されてしまいます。'],
    // ko: Sino delete noun + 조치 / 진행
    ['비우기', '휴지통', '휴지통의 모든 파일은 영구 제거 조치될 예정입니다.'],
    ['비우기', '휴지통', '휴지통의 모든 항목을 영구 삭제 진행합니다.'],
    // tr: -(y)Iver- on a covered passive
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki tüm öğeler bir anda kaldırılıverecek."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar tek tıkla temizleniverir."],
    // ja: covered passive + te + なくなる
    ['空にする', 'ゴミ箱', 'ゴミ箱の項目はすべて消されてなくなります。'],
    ['空にする', 'ゴミ箱', 'ゴミ箱内の書類は破棄されてなくなってしまいます。'],
  ])
})

test('CU-842: the negated and past twins of each shape stay free (the filed rows\' and the table\'s)', () => {
  free([
    ['비우기', '휴지통', '휴지통 항목은 삭제 조치되지 않습니다.'],
    ['비우기', '휴지통', '휴지통 항목은 영구히 삭제 조치되었습니다.'],
    ['비우기', '휴지통', '휴지통의 파일은 제거 조치되지 않습니다.'],
    ['비우기', '휴지통', '휴지통의 모든 파일은 영구 제거 조치되었습니다.'],
    ['비우기', '휴지통', '휴지통의 모든 항목을 영구 삭제 진행하지 않습니다.'],
    ['비우기', '휴지통', '휴지통의 모든 항목이 영구 삭제 진행되었습니다.'],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen silinivermeyecek."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen siliniverdi."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki tüm öğeler öyle kolayca kaldırılıvermeyecek."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki tüm öğeler bir anda kaldırılıverdi."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar tek tıkla temizlenivermez."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar tek tıkla temizleniverdi."],
    ['空にする', 'ゴミ箱', 'ゴミ箱の項目は削除されてなくなりません。'],
    ['空にする', 'ゴミ箱', 'ゴミ箱の項目は削除されてなくなりました。'],
    ['空にする', 'ゴミ箱', 'ゴミ箱の項目が消されてなくなることはありません。'],
    ['空にする', 'ゴミ箱', 'ゴミ箱の項目はすべて消されてなくなりました。'],
    ['空にする', 'ゴミ箱', 'ゴミ箱内の書類は破棄されてなくなりません。'],
    ['空にする', 'ゴミ箱', 'ゴミ箱内の書類は破棄されてなくなってしまいました。'],
  ])
})
