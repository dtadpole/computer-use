import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-804 (P1; follow-up to CU-800, widened by cu-coordinator 09:39Z): a bare emptying verb ('Empty', 'Leegmaken') under a dialog
// that asks to permanently DELETE the items in the trash - in the title or the description, a verb the button does not echo -
// acts unasked, in English too.
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-804-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
const store = createAppApprovals({ path: join(tmp, 'a.json') })
store.grantAlways(FIXTURE, { by: 'api' })
const desktop = createAppPolicy({ scope: [FIXTURE], approvals: store })
const web = createPolicy({ sitePolicy: () => 'allow' })
const click = { type: 'click', x: 1, y: 1, button: 'left' }
const classes = (v) => (v.decision === 'allow' ? [] : (v.classes ?? [v.class]))
const extra = (description) => (description ? { dialogDescription: description } : {})
const onWeb = (name, dialogName, description) => web.classify(click, { url: 'https://app.example/files', target: { role: 'button', name, dialogName, ...extra(description) } })
const onDesktop = (name, dialogName, description) => desktop.classify(click, { frontmostBundleId: FIXTURE, target: { origin: FIXTURE, role: 'AXButton', name, fingerprint: name, defaultButtonRead: true, dialogName, ...extra(description) } })

test('CU-804: the filed rows, verbatim, ask delete on both routes', () => {
  for (const [name, title, description] of [
    ['Leegmaken', 'Prullenmand', 'Weet u zeker dat u de onderdelen in de prullenmand permanent wilt verwijderen?'],
    ['Empty', 'Trash', 'Are you sure you want to permanently delete the items in the Trash?'],
    ['Empty', 'Are you sure you want to permanently delete the items in the Trash?'],
  ]) {
    assert.ok(classes(onWeb(name, title, description)).includes('delete'), `web ${name} | ${title} | ${description ?? ''}`)
    assert.ok(classes(onDesktop(name, title, description)).includes('delete'), `desktop ${name} | ${title} | ${description ?? ''}`)
  }
})

test('CU-804: the class - other covered languages, title or description, a pending statement', () => {
  for (const [name, title, description] of [
    ['Leeren', 'Papierkorb', 'Möchten Sie die Objekte im Papierkorb wirklich endgültig löschen?'],
    ['Vider', 'Corbeille', 'Voulez-vous vraiment supprimer définitivement les éléments de la corbeille ?'],
    ['Vaciar', '¿Seguro que quieres eliminar definitivamente los elementos de la papelera?'],
    ['Svuota', 'Cestino', 'Vuoi eliminare definitivamente gli elementi nel cestino?'],
    ['Legen', 'Weet je zeker dat je de items in de prullenbak wilt verwijderen?'],
    ['Empty', 'Trash', 'All items in the Trash will be permanently erased.'],
  ]) {
    assert.ok(classes(onWeb(name, title, description)).includes('delete'), `web ${name} | ${title} | ${description ?? ''}`)
  }
})

test('CU-804 r2: cu-developer-two\'s rows verbatim - ru / ja / zh / ko / tr, and a pending statement with a following cannot-restore clause', () => {
  for (const [name, title, description] of [
    ['Очистить', 'Корзина', 'Вы действительно хотите безвозвратно удалить объекты из Корзины?'],
    ['空にする', 'ゴミ箱', 'ゴミ箱内の項目を完全に削除してもよろしいですか？'],
    ['清倒', '废纸篓', '确定要永久删除废纸篓中的项目吗？'],
    ['비우기', '휴지통', '휴지통에 있는 항목을 영구적으로 삭제하시겠습니까?'],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeleri kalıcı olarak silmek istediğinizden emin misiniz?"],
    ['Empty', 'Trash', "The items in the Trash will be permanently deleted and can't be restored."],
    ['Empty', 'Trash', "All items in the Trash will be erased; you won't be able to undo this."],
    ['Leeren', 'Papierkorb', 'Die Objekte im Papierkorb werden endgültig gelöscht und können nicht wiederhergestellt werden.'],
    ['Svuota', 'Cestino', 'Gli elementi nel Cestino verranno eliminati definitivamente e non potranno essere recuperati.'],
    ['Esvaziar', 'Lixeira', 'Os itens da Lixeira serão excluídos permanentemente e não poderão ser recuperados.'],
  ]) {
    assert.ok(classes(onWeb(name, title, description)).includes('delete'), `web ${name} | ${title} | ${description}`)
    assert.ok(classes(onDesktop(name, title, description)).includes('delete'), `desktop ${name} | ${title} | ${description}`)
  }
})

test('CU-804 r3: cu-researcher\'s r2 rows verbatim - the pending statements in ru / zh / ko / tr, and the rows that ask already', () => {
  for (const [name, title, description] of [
    ['Очистить', 'Внимание', 'Все объекты в Корзине будут удалены навсегда.'],
    ['清倒', '警告', '废纸篓中的所有项目将被永久删除。'],
    ['비우기', '확인', '휴지통의 모든 항목이 영구적으로 삭제됩니다.'],
    ['Boşalt', 'Uyarı', "Çöp Sepeti'ndeki tüm öğeler kalıcı olarak silinecek."],
    ['空にする', '確認', 'ゴミ箱の中身をすべて完全に削除しますか？'],
    ['空にする', '確認', 'ゴミ箱の中身はすべて完全に削除されます。'],
    // CU-805 (cu-developer-two's r2 rows, riding r3):
    ['Очистить', 'Корзина', 'Объекты в Корзине будут удалены безвозвратно и не могут быть восстановлены.'],
    ['空にする', 'ゴミ箱', 'ゴミ箱内の項目は完全に削除され、元に戻せません。'],
    ['Empty', 'Warning', 'Everything in the Trash will be deleted forever, and this cannot be undone.'],
    ['Leeren', 'Achtung', 'Alle Objekte im Papierkorb werden dauerhaft gelöscht; dies lässt sich nicht rückgängig machen.'],
  ]) {
    assert.ok(classes(onWeb(name, title, description)).includes('delete'), `web ${name} | ${title} | ${description}`)
    assert.ok(classes(onDesktop(name, title, description)).includes('delete'), `desktop ${name} | ${title} | ${description}`)
  }
})

test('CU-804: near rows stay free of delete - another button, no trash, the past, a negation', () => {
  for (const [name, title, description] of [
    ['Open', 'Trash', 'Are you sure you want to permanently delete the items in the Trash?'],
    ['Empty', 'Search', 'Are you sure you want to permanently delete your search history?'],
    ['Empty', 'Trash', 'The items in the Trash were deleted.'],
    ['Empty', 'Trash', 'The items in the Trash will not be deleted.'],
    ['Очистить', 'Поиск', 'Очистить историю поиска?'],
    // r4: the negated pending statements r3 made ask (cu-verifier's three rows verbatim, ko / tr siblings), and the ja past.
    ['Очистить', 'Внимание', 'Объекты в Корзине не будут удалены.'],
    ['清倒', '警告', '废纸篓中的项目不会被删除。'],
    ['空にする', '確認', 'ゴミ箱の項目は削除されません。'],
    ['Очистить', 'Корзина', 'Объекты в Корзине не будут удалены.'],
    ['空にする', 'ゴミ箱', 'ゴミ箱内の項目は削除されません。'],
    ['清倒', '废纸篓', '废纸篓中的项目不会被删除。'],
    ['清倒', '废纸篓', '废纸篓中的项目没有被删除。'],
    ['비우기', '휴지통', '휴지통의 항목은 삭제되지 않습니다.'],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler silinmeyecek."],
    ['空にする', 'ゴミ箱', 'ゴミ箱内の項目は削除されました。'],
    // CU-805: the over-asks found on #1474 r4 (cu-researcher's zh row, cu-developer-two's two ja rows), verbatim, and past siblings.
    ['清倒', '废纸篓', '废纸篓里的文件将不会被永久删除。'],
    ['空にする', 'ゴミ箱', 'ゴミ箱内の項目が削除されることはありません。'],
    ['空にする', 'ゴミ箱', 'ゴミ箱内の項目はすでに削除されています。'],
    ['空にする', 'ゴミ箱', 'ゴミ箱内の項目は削除された。'],
    ['Очистить', 'Корзина', 'Объекты в Корзине были удалены.'],
    ['清倒', '废纸篓', '废纸篓中的项目已被删除。'],
    ['비우기', '휴지통', '휴지통의 항목이 삭제되었습니다.'],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler silindi."],
    ['キャンセル', '確認', 'ゴミ箱の中身をすべて完全に削除しますか？'],
  ]) {
    assert.ok(!classes(onWeb(name, title, description)).includes('delete'), `web ${name} | ${title} | ${description ?? ''}`)
  }
})

test('CU-804 r4: a ru pending statement asks delete only - no permission on the web route (cu-developer-two\'s r3 row)', () => {
  for (const [name, title, description] of [
    ['Очистить', 'Корзина', 'Все объекты в Корзине будут удалены.'],
    ['Очистить', 'Внимание', 'Все объекты в Корзине будут удалены навсегда.'],
  ]) {
    assert.deepEqual(classes(onWeb(name, title, description)), ['delete'], `web ${name} | ${title} | ${description}`)
    assert.deepEqual(classes(onDesktop(name, title, description)), ['delete'], `desktop ${name} | ${title} | ${description}`)
  }
})
