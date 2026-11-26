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
