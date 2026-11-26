import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-832 (P1; residual of #1505): the data noun did not lend the trash title to its sentence -
// 'Vider' | 'Corbeille' | 'Les données seront effacées.' went free (option A; table OK'd by cu-researcher 06:14Z).
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-832-'))
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


test('CU-832: the filed row, verbatim, asks delete on both routes', () => {
  asks([['Vider', 'Corbeille', 'Les données seront effacées.']])
})

test('CU-832: the data noun lends the title\'s trash in each touched language', () => {
  asks([
    ['Vaciar', 'Papelera', 'Los datos se eliminarán.'],
    ['Leeren', 'Papierkorb', 'Die Daten werden gelöscht.'],
    ['Empty', 'Trash', 'The data will be deleted.'],
    ['Svuota', 'Cestino', 'I dati verranno eliminati.'],
    ['Esvaziar', 'Lixeira', 'Os dados serão excluídos.'],
    ['Legen', 'Prullenbak', 'De gegevens worden verwijderd.'],
    ['Очистить', 'Корзина', 'Данные будут удалены.'],
    ['Boşalt', 'Çöp Kutusu', 'Veriler silinecek.'],
    ['空にする', 'ゴミ箱', 'データは削除されます。'],
    ['비우기', '휴지통', '데이터가 삭제됩니다.'],
  ])
})

test('CU-832: a negated or past twin per language, a past-event row, no trash title and the wrong button stay free', () => {
  free([
    ['Vider', 'Corbeille', 'Les données ne seront pas effacées.'],
    ['Vider', 'Corbeille', 'Les données ont été effacées par erreur hier.'],
    ['Vaciar', 'Papelera', 'Los datos no se eliminarán.'],
    ['Leeren', 'Papierkorb', 'Die Daten wurden gelöscht.'],
    ['Empty', 'Trash', 'The data was deleted.'],
    ['Svuota', 'Cestino', 'I dati non verranno eliminati.'],
    ['Esvaziar', 'Lixeira', 'Os dados foram excluídos.'],
    ['Legen', 'Prullenbak', 'De gegevens zijn verwijderd.'],
    ['Очистить', 'Корзина', 'Данные не будут удалены.'],
    ['Boşalt', 'Çöp Kutusu', 'Veriler silinmeyecek.'],
    ['空にする', 'ゴミ箱', 'データは削除されません。'],
    ['비우기', '휴지통', '데이터가 삭제되지 않습니다.'],
    ['Vider', 'Notification', 'Les données seront effacées.'],
    ['Annuler', 'Corbeille', 'Les données seront effacées.'],
  ])
})
