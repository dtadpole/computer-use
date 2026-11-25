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
