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

// CU-857 (table r2 OK'd by cu-researcher 01:06Z): P1, follow-up to CU-842 after #1553, reproduced by cu-verifier (02:39Z). The tr
// -(y)Iver- compound of a covered delete verb went free in a pending trash statement in the future perfect ('…silinivermiş
// olacak.') and in the active future ('…siliverecek.'). The table reads four shapes on all seven stems: the passive + -iver future
// perfect (silinivermiş olacak), the -iver + passive future perfect (siliverilmiş olacak), the active future (siliverecek) and the
// -iver + passive future and aorist (siliverilecek / siliverilir). Each takes -lAr / -DIr where the cell reads them. Negation and
// past take the new stems and still decide first. The active -ivermiş olacak and -iverir stay outside the class. Her 06:12Z delta
// adds the plural future perfect (olacaklar / olacaklardır) with its negated and past plural twins, and a restore twin.
test('CU-857: cu-verifier\'s repro rows (02:39Z) ask delete on both routes', () => {
  asks([
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen silinivermiş olacak."],
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ndeki dosyaları hemen siliverecek."],
  ])
})

test('CU-857: each shape asks on all seven stems, with -lAr / -DIr where the cell reads them', () => {
  asks([
    // the passive + -iver future perfect, olacak in both numbers and in -tIr
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen silinivermiş olacaktır."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen silinivermiş olacaklar."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen silinivermiş olacaklardır."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen kaldırılıvermiş olacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen kaldırılıvermiş olacaktır."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen kaldırılıvermiş olacaklar."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen kaldırılıvermiş olacaklardır."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen yok edilivermiş olacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen yok edilivermiş olacaktır."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen yok edilivermiş olacaklar."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen yok edilivermiş olacaklardır."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen imha edilivermiş olacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen imha edilivermiş olacaktır."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen imha edilivermiş olacaklar."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen imha edilivermiş olacaklardır."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler hemen atılıvermiş olacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler hemen atılıvermiş olacaktır."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler hemen atılıvermiş olacaklar."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler hemen atılıvermiş olacaklardır."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen temizlenivermiş olacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen temizlenivermiş olacaktır."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen temizlenivermiş olacaklar."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen temizlenivermiş olacaklardır."],
    ['Boşalt', 'Çöp Sepeti', 'Çöp Sepeti hemen boşaltılıvermiş olacak.'],
    ['Boşalt', 'Çöp Sepeti', 'Çöp Sepeti hemen boşaltılıvermiş olacaktır.'],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki klasörler hemen boşaltılıvermiş olacaklar."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki klasörler hemen boşaltılıvermiş olacaklardır."],
    // the -iver + passive future perfect, olacak in both numbers and in -tIr
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen siliverilmiş olacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen siliverilmiş olacaktır."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen siliverilmiş olacaklar."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen siliverilmiş olacaklardır."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen kaldırıverilmiş olacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen kaldırıverilmiş olacaktır."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen kaldırıverilmiş olacaklar."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen kaldırıverilmiş olacaklardır."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen yok ediverilmiş olacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen yok ediverilmiş olacaktır."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen yok ediverilmiş olacaklar."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen yok ediverilmiş olacaklardır."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen imha ediverilmiş olacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen imha ediverilmiş olacaktır."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen imha ediverilmiş olacaklar."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen imha ediverilmiş olacaklardır."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler hemen atıverilmiş olacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler hemen atıverilmiş olacaktır."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler hemen atıverilmiş olacaklar."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler hemen atıverilmiş olacaklardır."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen temizleyiverilmiş olacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen temizleyiverilmiş olacaktır."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen temizleyiverilmiş olacaklar."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen temizleyiverilmiş olacaklardır."],
    ['Boşalt', 'Çöp Sepeti', 'Çöp Sepeti hemen boşaltıverilmiş olacak.'],
    ['Boşalt', 'Çöp Sepeti', 'Çöp Sepeti hemen boşaltıverilmiş olacaktır.'],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki klasörler hemen boşaltıverilmiş olacaklar."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki klasörler hemen boşaltıverilmiş olacaklardır."],
    // the active future, in both numbers and in -tIr
    ['Boşalt', 'Çöp Sepeti', "Bu araçlar Çöp Sepeti'ndeki dosyaları hemen siliverecekler."],
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ndeki dosyaları hemen siliverecektir."],
    ['Boşalt', 'Çöp Sepeti', "Bu araçlar Çöp Sepeti'ndeki dosyaları hemen silivereceklerdir."],
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ndeki dosyaları hemen kaldırıverecek."],
    ['Boşalt', 'Çöp Sepeti', "Bu araçlar Çöp Sepeti'ndeki dosyaları hemen kaldırıverecekler."],
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ndeki dosyaları hemen kaldırıverecektir."],
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ndeki dosyaları hemen yok ediverecek."],
    ['Boşalt', 'Çöp Sepeti', "Bu araçlar Çöp Sepeti'ndeki dosyaları hemen yok ediverecekler."],
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ndeki dosyaları hemen yok ediverecektir."],
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ndeki dosyaları hemen imha ediverecek."],
    ['Boşalt', 'Çöp Sepeti', "Bu araçlar Çöp Sepeti'ndeki dosyaları hemen imha ediverecekler."],
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ndeki dosyaları hemen imha ediverecektir."],
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ndeki öğeleri hemen atıverecek."],
    ['Boşalt', 'Çöp Sepeti', "Bu araçlar Çöp Sepeti'ndeki öğeleri hemen atıverecekler."],
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ndeki öğeleri hemen atıverecektir."],
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ni hemen temizleyiverecek."],
    ['Boşalt', 'Çöp Sepeti', "Bu araçlar Çöp Sepeti'ni hemen temizleyiverecekler."],
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ni hemen temizleyiverecektir."],
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ni hemen boşaltıverecek."],
    ['Boşalt', 'Çöp Sepeti', "Bu araçlar Çöp Sepeti'ni hemen boşaltıverecekler."],
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ni hemen boşaltıverecektir."],
    // the -iver + passive future and aorist, in both numbers and in -tIr
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen siliverilecek."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen siliverilecekler."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen siliverilecektir."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen siliverileceklerdir."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar tek tıkla siliverilir."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar tek tıkla siliverilirler."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen kaldırıverilecek."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen kaldırıverilecekler."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen kaldırıverilecektir."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar tek tıkla kaldırıverilir."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen yok ediverilecek."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen yok ediverilecekler."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen yok ediverilecektir."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar tek tıkla yok ediverilir."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen imha ediverilecek."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen imha ediverilecekler."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen imha ediverilecektir."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar tek tıkla imha ediverilir."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler hemen atıverilecek."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler hemen atıverilecekler."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler hemen atıverilecektir."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler tek tıkla atıverilir."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen temizleyiverilecek."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen temizleyiverilecekler."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen temizleyiverilecektir."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar tek tıkla temizleyiverilir."],
    ['Boşalt', 'Çöp Sepeti', 'Çöp Sepeti hemen boşaltıverilecek.'],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki klasörler hemen boşaltıverilecekler."],
    ['Boşalt', 'Çöp Sepeti', 'Çöp Sepeti hemen boşaltıverilecektir.'],
    ['Boşalt', 'Çöp Sepeti', 'Çöp Sepeti tek tıkla boşaltıverilir.'],
  ])
})

test('CU-857: every negated and past twin of each shape stays free, per stem', () => {
  free([
    // sil-
    ['Boşalt', 'Çöp Sepeti', "Bu araç Çöp Sepeti'ndeki dosyaları hemen silivermeyecek."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen siliverilmeyecek."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen siliverilmez."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen siliverilmemiş olacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar bir anda silinivermemiş olacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen siliverilmiş olmayacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar bir anda silinivermiş olmayacak."],
    ['Boşalt', 'Çöp Sepeti', "Bu araç Çöp Sepeti'ndeki dosyaları hemen siliverdi."],
    ['Boşalt', 'Çöp Sepeti', "Bu araç Çöp Sepeti'ndeki dosyaları hemen silivermiş."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen siliverildi."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen siliverilmiş."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar bir anda siliniverdi."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar bir anda silinivermiş."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar bir anda silinivermemiş olacaklar."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen siliverilmemiş olacaklar."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar bir anda silinivermişler."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen siliverilmişler."],
    // kaldır-
    ['Boşalt', 'Çöp Sepeti', "Bu araç Çöp Sepeti'ndeki dosyaları hemen kaldırıvermeyecek."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen kaldırıverilmeyecek."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen kaldırıverilmez."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen kaldırıverilmemiş olacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar bir anda kaldırılıvermemiş olacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen kaldırıverilmiş olmayacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar bir anda kaldırılıvermiş olmayacak."],
    ['Boşalt', 'Çöp Sepeti', "Bu araç Çöp Sepeti'ndeki dosyaları hemen kaldırıverdi."],
    ['Boşalt', 'Çöp Sepeti', "Bu araç Çöp Sepeti'ndeki dosyaları hemen kaldırıvermiş."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen kaldırıverildi."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen kaldırıverilmiş."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar bir anda kaldırılıverdi."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar bir anda kaldırılıvermiş."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar bir anda kaldırılıvermemiş olacaklar."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen kaldırıverilmemiş olacaklar."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar bir anda kaldırılıvermişler."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen kaldırıverilmişler."],
    // yok et-
    ['Boşalt', 'Çöp Sepeti', "Bu araç Çöp Sepeti'ndeki dosyaları hemen yok edivermeyecek."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen yok ediverilmeyecek."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen yok ediverilmez."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen yok ediverilmemiş olacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar bir anda yok edilivermemiş olacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen yok ediverilmiş olmayacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar bir anda yok edilivermiş olmayacak."],
    ['Boşalt', 'Çöp Sepeti', "Bu araç Çöp Sepeti'ndeki dosyaları hemen yok ediverdi."],
    ['Boşalt', 'Çöp Sepeti', "Bu araç Çöp Sepeti'ndeki dosyaları hemen yok edivermiş."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen yok ediverildi."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen yok ediverilmiş."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar bir anda yok ediliverdi."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar bir anda yok edilivermiş."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar bir anda yok edilivermemiş olacaklar."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen yok ediverilmemiş olacaklar."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar bir anda yok edilivermişler."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen yok ediverilmişler."],
    // imha et-
    ['Boşalt', 'Çöp Sepeti', "Bu araç Çöp Sepeti'ndeki dosyaları hemen imha edivermeyecek."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen imha ediverilmeyecek."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen imha ediverilmez."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen imha ediverilmemiş olacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar bir anda imha edilivermemiş olacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen imha ediverilmiş olmayacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar bir anda imha edilivermiş olmayacak."],
    ['Boşalt', 'Çöp Sepeti', "Bu araç Çöp Sepeti'ndeki dosyaları hemen imha ediverdi."],
    ['Boşalt', 'Çöp Sepeti', "Bu araç Çöp Sepeti'ndeki dosyaları hemen imha edivermiş."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen imha ediverildi."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen imha ediverilmiş."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar bir anda imha ediliverdi."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar bir anda imha edilivermiş."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar bir anda imha edilivermemiş olacaklar."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen imha ediverilmemiş olacaklar."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar bir anda imha edilivermişler."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen imha ediverilmişler."],
    // at-
    ['Boşalt', 'Çöp Sepeti', "Bu araç Çöp Sepeti'ndeki öğeleri hemen atıvermeyecek."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler hemen atıverilmeyecek."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler hemen atıverilmez."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler hemen atıverilmemiş olacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler bir anda atılıvermemiş olacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler hemen atıverilmiş olmayacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler bir anda atılıvermiş olmayacak."],
    ['Boşalt', 'Çöp Sepeti', "Bu araç Çöp Sepeti'ndeki öğeleri hemen atıverdi."],
    ['Boşalt', 'Çöp Sepeti', "Bu araç Çöp Sepeti'ndeki öğeleri hemen atıvermiş."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler hemen atıverildi."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler hemen atıverilmiş."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler bir anda atılıverdi."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler bir anda atılıvermiş."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler bir anda atılıvermemiş olacaklar."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler hemen atıverilmemiş olacaklar."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler bir anda atılıvermişler."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler hemen atıverilmişler."],
    // temizle-
    ['Boşalt', 'Çöp Sepeti', "Bu araç Çöp Sepeti'ni hemen temizleyivermeyecek."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen temizleyiverilmeyecek."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen temizleyiverilmez."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen temizleyiverilmemiş olacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar bir anda temizlenivermemiş olacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen temizleyiverilmiş olmayacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar bir anda temizlenivermiş olmayacak."],
    ['Boşalt', 'Çöp Sepeti', "Bu araç Çöp Sepeti'ni hemen temizleyiverdi."],
    ['Boşalt', 'Çöp Sepeti', "Bu araç Çöp Sepeti'ni hemen temizleyivermiş."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen temizleyiverildi."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen temizleyiverilmiş."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar bir anda temizleniverdi."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar bir anda temizlenivermiş."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar bir anda temizlenivermemiş olacaklar."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen temizleyiverilmemiş olacaklar."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar bir anda temizlenivermişler."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen temizleyiverilmişler."],
    // boşalt-
    ['Boşalt', 'Çöp Sepeti', "Bu araç Çöp Sepeti'ni hemen boşaltıvermeyecek."],
    ['Boşalt', 'Çöp Sepeti', 'Çöp Sepeti hemen boşaltıverilmeyecek.'],
    ['Boşalt', 'Çöp Sepeti', 'Çöp Sepeti hemen boşaltıverilmez.'],
    ['Boşalt', 'Çöp Sepeti', 'Çöp Sepeti hemen boşaltıverilmemiş olacak.'],
    ['Boşalt', 'Çöp Sepeti', 'Çöp Sepeti bir anda boşaltılıvermemiş olacak.'],
    ['Boşalt', 'Çöp Sepeti', 'Çöp Sepeti hemen boşaltıverilmiş olmayacak.'],
    ['Boşalt', 'Çöp Sepeti', 'Çöp Sepeti bir anda boşaltılıvermiş olmayacak.'],
    ['Boşalt', 'Çöp Sepeti', "Bu araç Çöp Sepeti'ni hemen boşaltıverdi."],
    ['Boşalt', 'Çöp Sepeti', "Bu araç Çöp Sepeti'ni hemen boşaltıvermiş."],
    ['Boşalt', 'Çöp Sepeti', 'Çöp Sepeti hemen boşaltıverildi.'],
    ['Boşalt', 'Çöp Sepeti', 'Çöp Sepeti hemen boşaltıverilmiş.'],
    ['Boşalt', 'Çöp Sepeti', 'Çöp Sepeti bir anda boşaltılıverdi.'],
    ['Boşalt', 'Çöp Sepeti', 'Çöp Sepeti bir anda boşaltılıvermiş.'],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki klasörler bir anda boşaltılıvermemiş olacaklar."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki klasörler hemen boşaltıverilmemiş olacaklar."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki klasörler bir anda boşaltılıvermişler."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki klasörler hemen boşaltıverilmişler."],
  ])
})

test('CU-857: the active -ivermiş olacak and -iverir, a restore verb, a non-trash title and a non-emptying button stay free', () => {
  free([
    // outside the class: the active future perfect and the active aorist of each stem
    ['Boşalt', 'Çöp Sepeti', "Bu araç Çöp Sepeti'ndeki dosyaları hemen silivermiş olacak."],
    ['Boşalt', 'Çöp Sepeti', "Bu araç Çöp Sepeti'ndeki dosyaları tek tıkla siliverir."],
    ['Boşalt', 'Çöp Sepeti', "Bu araç Çöp Sepeti'ndeki dosyaları hemen kaldırıvermiş olacak."],
    ['Boşalt', 'Çöp Sepeti', "Bu araç Çöp Sepeti'ndeki dosyaları tek tıkla kaldırıverir."],
    ['Boşalt', 'Çöp Sepeti', "Bu araç Çöp Sepeti'ndeki dosyaları hemen yok edivermiş olacak."],
    ['Boşalt', 'Çöp Sepeti', "Bu araç Çöp Sepeti'ndeki dosyaları tek tıkla yok ediverir."],
    ['Boşalt', 'Çöp Sepeti', "Bu araç Çöp Sepeti'ndeki dosyaları hemen imha edivermiş olacak."],
    ['Boşalt', 'Çöp Sepeti', "Bu araç Çöp Sepeti'ndeki dosyaları tek tıkla imha ediverir."],
    ['Boşalt', 'Çöp Sepeti', "Bu araç Çöp Sepeti'ndeki öğeleri hemen atıvermiş olacak."],
    ['Boşalt', 'Çöp Sepeti', "Bu araç Çöp Sepeti'ndeki öğeleri tek tıkla atıverir."],
    ['Boşalt', 'Çöp Sepeti', "Bu araç Çöp Sepeti'ni hemen temizleyivermiş olacak."],
    ['Boşalt', 'Çöp Sepeti', "Bu araç Çöp Sepeti'ni tek tıkla temizleyiverir."],
    ['Boşalt', 'Çöp Sepeti', "Bu araç Çöp Sepeti'ni hemen boşaltıvermiş olacak."],
    ['Boşalt', 'Çöp Sepeti', "Bu araç Çöp Sepeti'ni tek tıkla boşaltıverir."],
    // a restore verb in the -iver + passive future perfect (the 06:12Z delta): it would ask if geri yükle- were a delete verb
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen geri yükleyiverilmiş olacak."],
    // a non-trash title (no trash noun in the sentence), one row per shape
    ['Boşalt', 'Belgeler', 'Seçili belgeler hemen silinivermiş olacak.'],
    ['Boşalt', 'Belgeler', 'Seçili belgeler hemen siliverilmiş olacak.'],
    ['Boşalt', 'Belgeler', 'Bu araç seçili belgeleri hemen siliverecek.'],
    ['Boşalt', 'Belgeler', 'Seçili belgeler hemen siliverilecek.'],
    // a non-emptying button, one row per shape
    ['İptal', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen silinivermiş olacak."],
    ['İptal', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen siliverilmiş olacak."],
    ['İptal', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ndeki dosyaları hemen siliverecek."],
    ['İptal', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen siliverilecek."],
  ])
})

// CU-844 (P1; follow-up to CU-819 after #1539, found by cu-researcher): a ko pending delete with a dependent noun + a causal
// ending went free after a native passive - '…곧 모두 지워질 테니 미리 백업하세요.' - or after 될 with a copula causal ending
// beyond the four - '…영구 삭제될 것인즉 신중히 결정하십시오.'. The table cu-researcher OK'd (19:07Z), with its answer 4 (the
// bare -(이)라 before a space and a clause; -라고 / -라는 / -라면 out), adds both cells; negation and past still decide first.
test('CU-844: the filed rows, verbatim, and each new ending after 될 and after each native passive ask, beside the twins main asks', () => {
  asks([
    ['비우기', '휴지통', '휴지통 파일은 곧 모두 지워질 테니 미리 백업하세요.'],
    ['비우기', '휴지통', '휴지통 파일이 곧 지워질 터라 복구할 수 없습니다.'],
    ['비우기', '알림', '휴지통 항목은 영구 삭제될 것인즉 신중히 결정하십시오.'],
    ['비우기', '휴지통', '휴지통 파일은 곧 모두 삭제될 테니 미리 백업하세요.'],
    ['비우기', '알림', '휴지통 항목은 영구 삭제될 것이므로 신중히 결정하십시오.'],
    ['비우기', '휴지통', '휴지통 파일은 곧 모두 삭제될 것이므로 미리 백업하세요.'],
    ['비우기', '휴지통', '휴지통 파일은 곧 모두 버려질 것입니다.'],
    ['비우기', '휴지통', '휴지통은 곧 비워질 것입니다.'],
    ['비우기', '휴지통', '휴지통 파일은 곧 모두 지워질 것이므로 미리 백업하세요.'],
    ['비우기', '휴지통', '휴지통 파일은 곧 모두 지워질터이기에 미리 백업하세요.'],
    ['비우기', '휴지통', '휴지통 파일은 곧 모두 지워질 거기 때문에 미리 백업하세요.'],
    ['비우기', '휴지통', '휴지통 파일은 곧 모두 버려질 테니 미리 백업하세요.'],
    ['비우기', '휴지통', '휴지통은 곧 비워질 거니까 미리 백업하세요.'],
    ['비우기', '알림', '휴지통 항목은 영구 삭제될 터라 복구할 수 없습니다.'],
    ['비우기', '알림', '휴지통 항목은 영구 삭제될터라 복구할 수 없습니다.'],
    ['비우기', '알림', '휴지통 항목은 영구 삭제될 터인즉 신중히 결정하십시오.'],
    ['비우기', '휴지통', '휴지통 파일은 곧 지워질 것인즉 미리 백업하세요.'],
    ['비우기', '알림', '휴지통 항목은 영구 삭제될 것이라서 복구할 수 없습니다.'],
    ['비우기', '휴지통', '휴지통 파일은 곧 모두 버려질 것이라서 복구할 수 없습니다.'],
    ['비우기', '알림', '휴지통 항목은 영구 삭제될 것이어서 복구할 수 없습니다.'],
    ['비우기', '휴지통', '휴지통 파일은 곧 지워질 것이어서 복구할 수 없습니다.'],
    ['비우기', '알림', '휴지통 항목은 영구 삭제될 터인지라 신중히 결정하십시오.'],
    ['비우기', '휴지통', '휴지통 파일은 곧 모두 버려질 터인지라 복구할 수 없습니다.'],
    ['비우기', '알림', '휴지통 항목은 영구 삭제될 것인 만큼 신중히 결정하십시오.'],
    ['비우기', '휴지통', '휴지통은 곧 비워질 것인 만큼 신중히 결정하십시오.'],
    ['비우기', '알림', '휴지통 항목은 영구 삭제될 것이길래 복구할 수 없습니다.'],
    ['비우기', '휴지통', '휴지통은 곧 비워질 것이길래 복구할 수 없습니다.'],
    ['비우기', '알림', '휴지통 항목은 영구 삭제될 거라서 복구할 수 없습니다.'],
    ['비우기', '휴지통', '휴지통 파일은 곧 모두 지워질 거라서 복구할 수 없습니다.'],
    ['비우기', '알림', '휴지통 항목은 영구 삭제될 것이라 신중히 결정하십시오.'],
    ['비우기', '알림', '휴지통 항목은 영구 삭제될 거라 복구할 수 없습니다.'],
    ['비우기', '알림', '휴지통 항목은 영구 삭제될 터이라 복구할 수 없습니다.'],
    ['비우기', '휴지통', '휴지통은 곧 비워질 것이라 복구할 수 없습니다.'],
    ['비우기', '휴지통', '휴지통 파일은 곧 모두 지워질 거라 복구할 수 없습니다.'],
  ])
})

test('CU-844: a negated and a past twin of every new ending and every native passive stay free', () => {
  free([
    ['비우기', '휴지통', '휴지통 파일은 지워지지 않을 테니 그대로 두세요.'],
    ['비우기', '휴지통', '휴지통 파일은 이미 모두 지워졌을 테니 복구할 수 없습니다.'],
    ['비우기', '휴지통', '휴지통 파일은 지워지지 않을 터라 그대로 남습니다.'],
    ['비우기', '휴지통', '휴지통 파일은 이미 지워졌을 터라 복구할 수 없습니다.'],
    ['비우기', '알림', '휴지통 항목은 삭제되지 않을 것인즉 그대로 두세요.'],
    ['비우기', '알림', '휴지통 항목은 이미 영구 삭제되었을 것인즉 신중히 결정하십시오.'],
    ['비우기', '휴지통', '휴지통 파일은 버려지지 않을 것이므로 그대로 남습니다.'],
    ['비우기', '휴지통', '휴지통 파일은 이미 모두 버려졌을 것이므로 복구할 수 없습니다.'],
    ['비우기', '휴지통', '휴지통은 비워지지 않을 터이기에 그대로 남습니다.'],
    ['비우기', '휴지통', '휴지통은 이미 비워졌을 터이기에 복구할 수 없습니다.'],
    ['비우기', '휴지통', '휴지통 파일은 지워지지 못할 거기 때문에 그대로 남습니다.'],
    ['비우기', '휴지통', '휴지통 파일은 이미 지워졌을 거기 때문에 복구할 수 없습니다.'],
    ['비우기', '휴지통', '휴지통은 비워지지 않을 거니까 그대로 두세요.'],
    ['비우기', '휴지통', '휴지통은 이미 비워졌을 거니까 복구할 수 없습니다.'],
    ['비우기', '알림', '휴지통 항목은 삭제되지 않을 것이라서 그대로 남습니다.'],
    ['비우기', '알림', '휴지통 항목은 이미 삭제됐을 것이라서 복구할 수 없습니다.'],
    ['비우기', '휴지통', '휴지통 파일은 지워지지 않을 것이어서 그대로 남습니다.'],
    ['비우기', '휴지통', '휴지통 파일은 이미 지워졌을 것이어서 복구할 수 없습니다.'],
    ['비우기', '알림', '휴지통 항목은 삭제 안 될 터인지라 그대로 남습니다.'],
    ['비우기', '알림', '휴지통 항목은 이미 삭제되었을 터인지라 복구할 수 없습니다.'],
    ['비우기', '휴지통', '휴지통은 비워지지 못할 것인 만큼 그대로 두세요.'],
    ['비우기', '휴지통', '휴지통은 이미 비워졌을 것인 만큼 복구할 수 없습니다.'],
    ['비우기', '알림', '휴지통 항목은 삭제되지 않을 것이길래 그대로 남습니다.'],
    ['비우기', '알림', '휴지통 항목은 이미 삭제됐을 것이길래 복구할 수 없습니다.'],
    ['비우기', '휴지통', '휴지통 파일은 버려지지 않을 거라서 그대로 남습니다.'],
    ['비우기', '휴지통', '휴지통 파일은 이미 버려졌을 거라서 복구할 수 없습니다.'],
    ['비우기', '휴지통', '휴지통 파일은 지워지지 않을 거라 그대로 남습니다.'],
    ['비우기', '알림', '휴지통 항목은 이미 삭제되었을 것이라 복구할 수 없습니다.'],
    ['비우기', '알림', '휴지통 항목은 삭제되지 않을 터이라 그대로 남습니다.'],
    ['비우기', '알림', '휴지통 항목은 이미 삭제되었을 터이라 복구할 수 없습니다.'],
  ])
})

test('CU-844: the table\'s three near rows and the -라고 twins of the bare -(이)라 stay free', () => {
  free([
    ['비우기', '휴지통', '휴지통 파일은 곧 모두 지워질 수 있을 테니 미리 백업하세요.'],
    ['비우기', '휴지통', '휴지통 파일이 이미 지워진 터라 복구할 수 없습니다.'],
    ['비우기', '알림', '휴지통 항목은 영구 삭제될 것인지 신중히 결정하십시오.'],
    ['비우기', '휴지통', '휴지통 파일은 곧 모두 지워질 거라고 걱정하지 마세요.'],
    ['비우기', '휴지통', '휴지통 파일은 곧 모두 지워질 터라고 걱정하지 마세요.'],
    ['비우기', '알림', '휴지통 항목은 영구 삭제될 것이라고 걱정하지 마세요.'],
    ['비우기', '알림', '휴지통 항목은 영구 삭제될 터라고 걱정하지 마세요.'],
  ])
})

// CU-823's bound, pinned at cu-verifier's request (mutant C10 from the #1548 close): the locative cell never takes quedar /
// ficar / estar as a pending auxiliary, so a resultative 'van a quedar retirados de la papelera' stays free.
test('CU-823 bound (C10): quedar before a trash locative stays free in the locative cell', () => {
  free([
    ['Vaciar', 'Papelera', 'Los archivos van a quedar retirados de la papelera.'],
  ])
})

// CU-856 (P1; follow-up to CU-842): a ko pending trash statement went free while its particle-less 진행 / 처리 twin asked, when its
// delete noun had a case particle (을 / 를 / 이 / 가), one adverb before the light noun, a completion / end / start light noun (완료 /
// 종료 / 시작 / 개시 / 마무리) or a native completion verb (끝나- / 마치- / 끝내-). The table cu-researcher OK'd (r2, 01:06Z) reads these
// through KO_STEM / KO_END. Negation and past still decide first, and 안 / 못 never fill the adverb slot.
test('CU-856: the filed shapes, each new light noun, the particles, the adverb slot and the native completion verbs ask', () => {
  asks([
    // the filed shapes
    ['비우기', '휴지통', '휴지통 항목은 영구히 삭제 완료됩니다.'],
    ['비우기', '휴지통', '휴지통 항목은 지금 영구 삭제를 진행합니다.'],
    // the new light nouns 완료 / 종료 / 시작 / 개시 / 마무리
    ['비우기', '휴지통', '휴지통의 모든 파일은 영구 제거 완료될 예정입니다.'],
    ['비우기', '휴지통', '휴지통의 모든 파일은 영구 폐기 완료됩니다.'],
    ['비우기', '휴지통', '휴지통 항목의 영구 삭제가 곧 종료됩니다.'],
    ['비우기', '휴지통', '휴지통 항목의 영구 삭제가 시작됩니다.'],
    ['비우기', '휴지통', '휴지통 항목의 영구 삭제를 시작합니다.'],
    ['비우기', '휴지통', '휴지통의 모든 항목에 대한 영구 삭제를 개시합니다.'],
    ['비우기', '휴지통', '휴지통 항목의 영구 삭제가 곧 마무리됩니다.'],
    // a case particle before the light noun (를 / 가 after the vowel-final delete nouns)
    ['비우기', '휴지통', '휴지통의 모든 파일에 대해 영구 제거를 진행합니다.'],
    ['비우기', '휴지통', '휴지통 항목의 영구 삭제가 진행됩니다.'],
    ['비우기', '휴지통', '휴지통의 모든 항목에 대해 폐기를 실행합니다.'],
    ['비우기', '휴지통', '휴지통 항목의 파기가 수행될 예정입니다.'],
    ['비우기', '휴지통', '휴지통의 모든 항목에 대해 삭제를 처리합니다.'],
    ['비우기', '휴지통', '휴지통 항목의 삭제를 완료합니다.'],
    ['비우기', '휴지통', '휴지통 항목의 영구 삭제가 완료될 것입니다.'],
    ['비우기', '휴지통', '휴지통의 모든 파일은 제거가 완료되며 복구할 수 없습니다.'],
    ['비우기', '휴지통', '휴지통 항목의 영구 소거가 시작될 겁니다.'],
    // one adverb between the particle and the light noun
    ['비우기', '휴지통', '휴지통 항목의 삭제를 즉시 진행합니다.'],
    ['비우기', '휴지통', '휴지통의 모든 파일에 대한 제거가 자동으로 시작됩니다.'],
    ['비우기', '휴지통', '휴지통 항목의 폐기가 안전하게 진행됩니다.'],
    ['비우기', '휴지통', '휴지통 항목은 삭제가 바로 시작됩니다.'],
    ['비우기', '휴지통', '휴지통 항목의 삭제를 일괄 진행합니다.'],
    ['비우기', '휴지통', '휴지통의 모든 항목은 영구 삭제가 깨끗이 마무리될 것입니다.'],
    // the native completion verbs 끝나- / 마치- / 끝내-
    ['비우기', '휴지통', '휴지통 항목의 영구 삭제가 곧 끝납니다.'],
    ['비우기', '휴지통', '휴지통 항목의 삭제가 완전히 끝날 예정입니다.'],
    ['비우기', '휴지통', '휴지통 항목의 삭제가 곧 끝난다.'],
    ['비우기', '휴지통', '휴지통 항목의 삭제가 끝나며 복구할 수 없게 됩니다.'],
    ['비우기', '휴지통', '휴지통의 모든 항목에 대한 삭제를 곧 마칩니다.'],
    ['비우기', '휴지통', '휴지통 항목의 영구 삭제를 마칠 것입니다.'],
    ['비우기', '휴지통', '휴지통 항목의 삭제를 바로 끝냅니다.'],
    ['비우기', '휴지통', '휴지통의 모든 파일에 대한 제거를 끝낼 겁니다.'],
    // r3: the native completion verbs take CU-844's causal endings
    ['비우기', '휴지통', '휴지통 항목의 삭제가 곧 끝날 테니 미리 백업하세요.'],
    ['비우기', '휴지통', '휴지통 항목의 영구 삭제가 끝날 것이므로 복구할 수 없습니다.'],
    ['비우기', '휴지통', '휴지통 항목의 삭제가 곧 끝날 터이니 신중히 결정하세요.'],
    ['비우기', '휴지통', '휴지통 항목의 삭제가 끝날 것이기 때문에 되돌릴 수 없습니다.'],
    ['비우기', '휴지통', '휴지통 항목의 삭제가 곧 끝날 것인즉 신중히 결정하십시오.'],
    ['비우기', '휴지통', '휴지통 항목의 삭제가 곧 끝날 것이라서 복구할 수 없습니다.'],
    ['비우기', '휴지통', '휴지통 항목의 삭제가 끝날 터라 미리 백업해야 합니다.'],
    ['비우기', '휴지통', '휴지통 항목의 삭제가 곧 끝날 거라서 되돌릴 수 없어요.'],
    ['비우기', '휴지통', '휴지통 항목의 삭제가 곧 끝날 거라 미리 백업해 두세요.'],
    ['비우기', '휴지통', '휴지통 항목의 영구 삭제를 곧 마칠 테니 미리 확인하세요.'],
    ['비우기', '휴지통', '휴지통 파일에 대한 제거를 곧 끝낼 것이므로 주의하세요.'],
  ])
})

test('CU-856: a negated and a past twin of each new shape, 안 / 못 in the adverb slot, a non-trash title and a mismatched button stay free', () => {
  free([
    // negated
    ['비우기', '휴지통', '휴지통 항목은 영구히 삭제 완료되지 않습니다.'],
    ['비우기', '휴지통', '휴지통 항목은 지금 영구 삭제를 진행하지 않습니다.'],
    ['비우기', '휴지통', '휴지통 항목의 영구 삭제가 종료되지 않습니다.'],
    ['비우기', '휴지통', '휴지통 항목의 영구 삭제가 시작되지 못합니다.'],
    ['비우기', '휴지통', '휴지통의 모든 항목에 대한 영구 삭제를 개시하지 않습니다.'],
    ['비우기', '휴지통', '휴지통 항목의 영구 삭제가 마무리되지 않습니다.'],
    ['비우기', '휴지통', '휴지통 항목의 파기가 수행되지 않을 예정입니다.'],
    ['비우기', '휴지통', '휴지통 항목의 삭제를 즉시 진행하지 않습니다.'],
    ['비우기', '휴지통', '휴지통의 모든 파일에 대한 제거가 자동으로 시작되지 않습니다.'],
    ['비우기', '휴지통', '휴지통 항목의 삭제를 진행 안 합니다.'],
    ['비우기', '휴지통', '휴지통 항목의 영구 삭제가 곧 끝나지 않습니다.'],
    ['비우기', '휴지통', '휴지통의 모든 항목에 대한 삭제를 마치지 못합니다.'],
    ['비우기', '휴지통', '휴지통 항목의 삭제를 바로 끝내지 않습니다.'],
    // 안 / 못 where the adverb would stand
    ['비우기', '휴지통', '휴지통 항목의 삭제를 안 진행합니다.'],
    ['비우기', '휴지통', '휴지통 항목의 영구 삭제가 안 시작됩니다.'],
    ['비우기', '휴지통', '휴지통 항목의 파기를 못 진행합니다.'],
    ['비우기', '휴지통', '휴지통 항목의 영구 삭제가 안 끝납니다.'],
    ['비우기', '휴지통', '휴지통의 모든 항목에 대한 삭제를 못 마칩니다.'],
    // past
    ['비우기', '휴지통', '휴지통 항목은 영구히 삭제 완료되었습니다.'],
    ['비우기', '휴지통', '휴지통 항목은 이미 영구 삭제를 진행했습니다.'],
    ['비우기', '휴지통', '휴지통 항목의 영구 삭제가 종료되었습니다.'],
    ['비우기', '휴지통', '휴지통 항목의 영구 삭제가 시작됐습니다.'],
    ['비우기', '휴지통', '휴지통의 모든 항목에 대한 영구 삭제를 개시했습니다.'],
    ['비우기', '휴지통', '휴지통 항목의 영구 삭제가 마무리되었습니다.'],
    ['비우기', '휴지통', '휴지통 항목의 삭제를 완료했습니다.'],
    ['비우기', '휴지통', '휴지통 항목은 삭제가 완료되어 있습니다.'],
    ['비우기', '휴지통', '휴지통 항목의 삭제를 즉시 진행했습니다.'],
    ['비우기', '휴지통', '휴지통의 모든 파일에 대한 제거가 자동으로 시작되었습니다.'],
    ['비우기', '휴지통', '휴지통 항목의 영구 삭제가 모두 끝났습니다.'],
    ['비우기', '휴지통', '휴지통의 모든 항목에 대한 삭제를 마쳤습니다.'],
    ['비우기', '휴지통', '휴지통 항목의 삭제를 바로 끝냈습니다.'],
    // no trash title (and no trash noun in the sentence), and a mismatched button
    ['비우기', '메모', '항목이 영구히 삭제 완료됩니다.'],
    ['비우기', '메모', '선택한 메모의 삭제가 곧 끝납니다.'],
    ['취소', '휴지통', '휴지통 항목은 영구히 삭제 완료됩니다.'],
    ['취소', '휴지통', '휴지통 항목은 지금 영구 삭제를 진행합니다.'],
    // r3 twins: negated, past, and a non-delete noun with the native verb and a causal ending
    ['비우기', '휴지통', '휴지통 항목의 삭제가 끝나지 않을 테니 걱정하지 마세요.'],
    ['비우기', '휴지통', '휴지통 항목의 삭제가 이미 끝났을 테니 확인해 보세요.'],
    ['비우기', '휴지통', '휴지통 정리 안내가 곧 끝날 테니 잠시 기다려 주세요.'],
  ])
})
