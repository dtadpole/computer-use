import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-806 (P1; follow-up to CU-804 after #1474 r3, found by cu-researcher, reproduced live by cu-verifier at 11:19Z): a Turkish
// formal-future pending-delete statement over the trash acts unasked - '... silinecektir.' is free while '... silinecek.' asks.
// The class (cu-researcher's held-out): tr / ko / ja pending forms beyond the base future and passive.
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-806-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
const store = createAppApprovals({ path: join(tmp, 'a.json') })
store.grantAlways(FIXTURE, { by: 'api' })
const desktop = createAppPolicy({ scope: [FIXTURE], approvals: store })
const web = createPolicy({ sitePolicy: () => 'allow' })
const click = { type: 'click', x: 1, y: 1, button: 'left' }
const classes = (v) => (v.decision === 'allow' ? [] : (v.classes ?? [v.class]))
const onWeb = (name, dialogName, description) => web.classify(click, { url: 'https://app.example/files', target: { role: 'button', name, dialogName, dialogDescription: description } })
const onDesktop = (name, dialogName, description) => desktop.classify(click, { frontmostBundleId: FIXTURE, target: { origin: FIXTURE, role: 'AXButton', name, fingerprint: name, defaultButtonRead: true, dialogName, dialogDescription: description } })
const asks = (rows) => { for (const [n, t, d] of rows) { assert.ok(classes(onWeb(n, t, d)).includes('delete'), `web ${n} | ${t} | ${d}`); assert.ok(classes(onDesktop(n, t, d)).includes('delete'), `desktop ${n} | ${t} | ${d}`) } }
const free = (rows) => { for (const [n, t, d] of rows) { assert.ok(!classes(onWeb(n, t, d)).includes('delete'), `web ${n} | ${t} | ${d}`); assert.ok(!classes(onDesktop(n, t, d)).includes('delete'), `desktop ${n} | ${t} | ${d}`) } }

test('CU-806: the filed row, verbatim, asks delete on both routes', () => {
  asks([['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler kalıcı olarak silinecektir."]])
})

test('CU-806: the class - tr formal future / aorist / future perfect, more ja and ko pending forms ask', () => {
  asks([
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler kalıcı olarak kaldırılacaktır."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler kalıcı olarak silinir."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler silinmiş olacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler yok edilecektir."],
    ['空にする', 'ゴミ箱', 'ゴミ箱内の項目は完全に削除されることになります。'],
    ['空にする', 'ゴミ箱', 'ゴミ箱内の項目は削除される予定です。'],
    ['비우기', '휴지통', '휴지통의 항목이 영구적으로 삭제되겠습니다.'],
    ['비우기', '휴지통', '휴지통의 모든 항목이 삭제된다.'],
  ])
})

test('CU-806: negated and past twins of every new form stay free', () => {
  free([
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler silinmeyecektir."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler kaldırılmayacaktır."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler silinmez."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler silinmiştir."],
    ['空にする', 'ゴミ箱', 'ゴミ箱内の項目が削除されることはありません。'],
    ['空にする', 'ゴミ箱', 'ゴミ箱内の項目は削除されていました。'],
    ['비우기', '휴지통', '휴지통의 항목은 삭제되지 않는다.'],
    ['비우기', '휴지통', '휴지통의 항목이 삭제됐다.'],
  ])
})

test('#1479 r2: cu-researcher\'s four misses verbatim and the table\'s added forms ask', () => {
  asks([
    ['Boşalt', 'Dikkat', "Çöp Sepeti'ndeki tüm dosyalar kalıcı olarak silinecekler."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler kalıcı olarak silinmek üzere."],
    ['비우기', '알림', '휴지통 파일은 곧 삭제될 겁니다.'],
    ['空にする', 'ゴミ箱', 'ゴミ箱の項目は完全に削除されようとしています。'],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler silinirler."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler kaldırılacaklardır."],
    ['비우기', '휴지통', '휴지통의 항목이 지워질 거예요.'],
  ])
})

test('#1479 r2: cu-developer-two\'s ko conditional over-ask verbatim, and the negated / past twins of every added form, stay free', () => {
  free([
    ['비우기', '휴지통', '휴지통의 항목이 삭제된다면 복구할 수 없습니다.'],
    ['비우기', '휴지통', '휴지통의 항목이 삭제된다고 알려 드립니다.'],
    ['비우기', '휴지통', '휴지통의 항목이 삭제될 거라면 미리 백업하세요.'],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler silinmek üzere değil."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler silinmeyecekler."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler silinmezler."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler silindiler."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler silinmek üzereydi."],
    ['비우기', '휴지통', '휴지통의 항목은 삭제되지 않을 겁니다.'],
    ['비우기', '휴지통', '휴지통의 항목은 이미 삭제됐을 겁니다.'],
    ['空にする', 'ゴミ箱', 'ゴミ箱の項目は削除されようとしていません。'],
    ['空にする', 'ゴミ箱', 'ゴミ箱の項目は削除されようとしていました。'],
  ])
})

// CU-858 (P1; the plain gaps of CU-857's table, reproduced by cu-verifier 02:50Z): the tr cell read only passives, so the active future
// of a covered delete verb went free, and so did the future perfect of imha edil- / boşaltıl- / atıl- / temizlen-. The table
// cu-researcher OK'd (r1, 03:14Z) reads the active future of all seven stems and the future perfect of all seven passives, in both numbers
// and in -tIr. Negation and past still decide first. The active past stays out of the past cell, so a -DIğI relative participle keeps
// its current result.
test('CU-858: the active future of every covered stem and the missing future perfect ask, in both numbers and -tIr', () => {
  asks([
    // cu-verifier's repro
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ndeki dosyaları kalıcı olarak silecek."],
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ndeki dosyaları kalıcı olarak kaldıracak."],
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ndeki dosyaları kalıcı olarak imha edecek."],
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ndeki dosyaları kalıcı olarak yok edecek."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen imha edilmiş olacak."],
    // the active future of at- / temizle- / boşalt-
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ndeki tüm öğeleri tamamen atacak."],
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ndeki tüm öğeleri temizleyecek."],
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ni tamamen boşaltacak."],
    // the plural
    ['Boşalt', 'Çöp Sepeti', "Yöneticiler Çöp Sepeti'ndeki dosyaları kalıcı olarak silecekler."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyaları gece yarısı otomatik olarak kaldıracaklar."],
    ['Boşalt', 'Çöp Sepeti', "Bakım ekipleri Çöp Sepeti'ndeki eski dosyaları imha edecekler."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki tüm kayıtları güvenli biçimde yok edecekler."],
    ['Boşalt', 'Çöp Sepeti', "Temizlik araçları Çöp Sepeti'ndeki öğeleri atacaklar."],
    ['Boşalt', 'Çöp Sepeti', "Bu araçlar Çöp Sepeti'ni düzenli olarak temizleyecekler."],
    ['Boşalt', 'Çöp Sepeti', "Senkronizasyon hizmetleri Çöp Sepeti'ni her gece boşaltacaklar."],
    // the formal -tIr
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ndeki tüm dosyaları kalıcı olarak silecektir."],
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ndeki öğeleri kalıcı olarak kaldıracaktır."],
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ndeki verileri kalıcı olarak imha edecektir."],
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ndeki tüm kayıtları yok edecektir."],
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ndeki öğeleri tamamen atacaktır."],
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ni tamamen temizleyecektir."],
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ni kalıcı olarak boşaltacaktır."],
    // the future perfect of imha edil- / boşaltıl- / atıl- / temizlen-, and silinmiş with olacak in the plural
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki tüm dosyalar imha edilmiş olacaklar."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler sabaha kadar imha edilmiş olacaktır."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti işlem bitince tamamen boşaltılmış olacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki klasörler boşaltılmış olacaklar."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti bu işlemle boşaltılmış olacaktır."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler birkaç saniye içinde atılmış olacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar işlem sonunda atılmış olacaklar."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler atılmış olacaktır."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler kısa süre içinde temizlenmiş olacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki tüm dosyalar temizlenmiş olacaklardır."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler tamamen temizlenmiş olacaktır."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar silinmiş olacaklar."],
    // a -DIğI relative participle: it asks on main through silinecek, and still asks, since the active past is not a past form
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ne attığınız dosyalar kalıcı olarak silinecek."],
  ])
})

test('CU-858: a negated and a past twin of each added form, a restore verb, a non-trash title and a non-emptying button stay free', () => {
  free([
    // the negated active future
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ndeki dosyaları silmeyecek."],
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ndeki dosyaları kaldırmayacak."],
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ndeki dosyaları imha etmeyecek."],
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ndeki kayıtları yok etmeyecektir."],
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ndeki öğeleri atmayacak."],
    ['Boşalt', 'Çöp Sepeti', "Bu araçlar Çöp Sepeti'ni temizlemeyecekler."],
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ni boşaltmayacaktır."],
    // the active past (read by no pending form)
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ndeki dosyaları sildi."],
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ndeki dosyaları kaldırdı."],
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ndeki verileri imha etti."],
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ndeki kayıtları yok etmiş."],
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ndeki öğeleri attı."],
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ni temizledi."],
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ni boşalttı."],
    // the negated future perfect (-mAmIş olacak, -mIş olmayacak)
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar imha edilmemiş olacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen imha edilmiş olmayacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti boşaltılmamış olacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti boşaltılmış olmayacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler atılmamış olacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler atılmış olmayacaklar."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler temizlenmemiş olacak."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler temizlenmiş olmayacak."],
    // the past of the future perfect stems
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen imha edildi."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar imha edilmiş."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti boşaltıldı."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler atılmış."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler temizlendi."],
    // a restore verb
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ndeki dosyaları geri yükleyecek."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar geri yüklenmiş olacak."],
    // a non-trash title (no trash noun in the sentence), and a non-emptying button
    ['Boşalt', 'Belgeler', 'Bu işlem seçili belgeleri kalıcı olarak silecek.'],
    ['Boşalt', 'Belgeler', 'Seçili belgeler hemen imha edilmiş olacak.'],
    ['İptal', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ndeki dosyaları kalıcı olarak silecek."],
    ['İptal', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar hemen imha edilmiş olacak."],
  ])
})

// CU-858 fold (cu-verifier's F1 / F2 / Q3 on #1591, table r1 OK'd by cu-researcher 19:11Z): the active future asks only as a finite
// predicate, or as a participle right after an accusative item noun (its English twin asks); at- only after its accusative object.
test('CU-858 fold: the active future as a predicate, a participle after its object and at- after its object still ask', () => {
  asks([
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ndeki dosyaları silecek, geri alınamaz."],
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ndeki dosyaları silecek ve uygulamayı kapatacak."],
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ndeki dosyaları atacak."],
    ['Boşalt', 'Çöp Sepeti', "Temizlik aracı Çöp Sepeti'ndeki tüm öğeleri hemen atacak."],
    // Q3 verbatim, and a participle right after Çöp Sepeti'ni
    ['Boşalt', 'Çöp Sepeti', 'Çöp kutusundaki dosyaları silecek uygulamayı seçin.'],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ni boşaltacak aracı seçin."],
    // cu-developer-one's P1: a negated relative participle in -mAmIş no longer frees the pending clause (as on main)
    ['Boşalt', 'Çöp Sepeti', 'Temizlenmemiş öğeler kalıcı olarak silinecek.'],
    ['Boşalt', 'Çöp Sepeti', 'Atılmamış dosyalar kalıcı olarak silinecek.'],
  ])
})

test('CU-858 fold: -AcAk as a noun or a participle with no object, the light verbs of at- and the negated twins stay free', () => {
  free([
    // F1 verbatim, and the noun / participle with no object before it
    ['Boşalt', 'Çöp Sepeti', 'Çöp kutusundaki fotoğraf, bir cam sileceğini ve yedek silecek lastiğini gösteriyor.'],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki resimde yeni bir silecek var."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'nde silecek bir şey kalmadı."],
    // F2 verbatim, and the other light verbs of at-
    ['Boşalt', 'Çöp Sepeti', 'Finder, çöp kutusundaki öğelere yalnızca göz atacak.'],
    ['Boşalt', 'Çöp Sepeti', "Yönetici Çöp Sepeti'ndeki listeye imza atacak."],
    ['Boşalt', 'Çöp Sepeti', "Destek ekibi Çöp Sepeti'ndeki öğeler için mesaj atacak."],
    // negated twins
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ndeki öğeleri atmayacak."],
    ['Boşalt', 'Çöp Sepeti', "Bu işlem Çöp Sepeti'ndeki dosyaları silmeyecek."],
  ])
})
