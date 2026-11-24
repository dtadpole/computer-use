import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-771 (High; cu-researcher's r2 set for CU-748): Turkish and Russian future-passive deletion alerts acted unasked under a
// generic confirm. Russian now reads ё and the other delete participles and the reflexive future; Turkish reads its future
// passives and its confirm words. Plus the Japanese passive row cu-verifier's CU-748 close found untested (mutant L3).
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-771-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
const store = createAppApprovals({ path: join(tmp, 'a.json') })
store.grantAlways(FIXTURE, { by: 'api' })
const desktop = createAppPolicy({ scope: [FIXTURE], approvals: store })
const web = createPolicy({ sitePolicy: () => 'allow' })
const click = { type: 'click', x: 1, y: 1, button: 'left' }
const classes = (v) => (v.decision === 'allow' ? [] : (v.classes ?? [v.class]))
const onWeb = (name, dialogName, dialogDescription) => web.classify(click, { url: 'https://app.example/x', target: { role: 'button', name, dialogName, dialogDescription } })
const onDesktop = (name, dialogName, dialogDescription) => desktop.classify(click, { frontmostBundleId: FIXTURE, target: { origin: FIXTURE, role: 'AXButton', name, fingerprint: name, defaultButtonRead: true, dialogName, dialogDescription } })

test('CU-771: Turkish and Russian future passives ask delete on both routes', () => {
  for (const [name, title, description] of [
    ['Tamam', 'Uyarı', 'Bu dosya kalıcı olarak silinecek.'],
    ['Devam', 'Uyarı', 'Tüm mesajlar silinecektir.'],
    ['Evet', 'Uyarı', 'Hesabınız kaldırılacak.'],
    ['ОК', 'Внимание', 'Файл будет удалён без возможности восстановления.'],
    ['Продолжить', 'Внимание', 'Все данные будут стёрты.'],
    ['ОК', 'Внимание', 'Сообщения удалятся навсегда.'],
    ['ОК', 'Внимание', 'Корзина будет очищена.'],
  ]) {
    assert.ok(classes(onWeb(name, title, description)).includes('delete'), `web ${description}`)
    assert.ok(classes(onDesktop(name, title, description)).includes('delete'), `desktop ${description}`)
  }
})

test('CU-771: the Japanese passive deletion alert asks (cu-verifier mutant L3)', () => {
  assert.ok(classes(onDesktop('OK', '注意', 'このメモは削除されます。')).includes('delete'))
  assert.ok(classes(onWeb('OK', '注意', 'このメモは削除されます。')).includes('delete'))
})

test('CU-771: negated, past and harmless statements ask no delete', () => {
  for (const [name, title, description] of [
    ['Tamam', 'Bilgi', 'Bu dosya silinmeyecek.'],
    ['Tamam', 'Bilgi', 'Dosya silindi.'],
    ['Tamam', 'Bilgi', 'Ayarlarınız kaydedilecek.'],
    ['ОК', 'Информация', 'Файл не будет удалён.'],
    ['ОК', 'Информация', 'Файл не удалится.'],
    ['ОК', 'Информация', 'Настройки будут сохранены.'],
  ]) {
    // No DELETE from these statements (a Russian 'ОК' under 'Информация' asks permission on main by an older rule - unchanged here).
    assert.ok(!classes(onWeb(name, title, description)).includes('delete'), `web ${description}`)
    assert.ok(!classes(onDesktop(name, title, description)).includes('delete'), `desktop ${description}`)
  }
})
