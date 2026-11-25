import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-814 (P1; follow-up to CU-809): a pending 'the Trash will be emptied' statement under the emptying button acts unasked in every
// covered language, English included. The passive / participle of the emptying verb joins the trash verb column (table OK'd by
// cu-researcher 21:56Z); the active button verb, an active question and a state stay as main.
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-814-'))
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


test('CU-814: the filed English rows, verbatim, ask delete on both routes', () => {
  asks([
    ['Empty', 'Empty Trash', 'The items in the Trash will be emptied.'],
    ['Empty', 'Empty Trash', 'The Trash will be emptied.'],
  ])
})

test('CU-814: the emptying passive asks in every covered language', () => {
  asks([
    ['Leeren', 'Papierkorb', 'Der Papierkorb wird geleert.'],
    ['Vider', 'Corbeille', 'La corbeille sera vidée.'],
    ['Vaciar', 'Papelera', 'La papelera será vaciada.'],
    ['Vaciar', 'Papelera', 'La papelera se vaciará.'],
    ['Svuota', 'Cestino', 'Il cestino verrà svuotato.'],
    ['Esvaziar', 'Lixeira', 'A lixeira será esvaziada.'],
    ['Legen', 'Prullenbak', 'De prullenbak wordt geleegd.'],
    ['Очистить', 'Корзина', 'Корзина будет опустошена.'],
    ['清空', '废纸篓', '废纸篓将被清空。'],
    ['空にする', 'ゴミ箱', 'ゴミ箱が空になります。'],
    ['空にする', 'ゴミ箱', 'ゴミ箱は空にされます。'],
    ['비우기', '휴지통', '휴지통이 비워집니다.'],
    ['Boşalt', 'Çöp Sepeti', 'Çöp Sepeti boşaltılacak.'],
  ])
})

test('CU-814: negated, past, past-event, state, active-question and non-trash rows stay free', () => {
  free([
    ['Empty', 'Empty Trash', 'The Trash will not be emptied.'],
    ['Empty', 'Empty Trash', 'The Trash was emptied.'],
    ['Empty', 'Empty Trash', 'The Trash was emptied by mistake yesterday.'],
    ['Empty', 'Empty Trash', 'The Trash is empty.'],
    ['Empty', 'Notice', 'Empty the Trash?'],
    ['Empty', 'Notice', 'The cache will be emptied.'],
    ['Leeren', 'Papierkorb', 'Der Papierkorb wird nicht geleert.'],
    ['Leeren', 'Papierkorb', 'Der Papierkorb wurde gestern versehentlich geleert.'],
    ['Leeren', 'Papierkorb', 'Der Papierkorb ist leer.'],
    ['Vider', 'Corbeille', 'La corbeille ne sera pas vidée.'],
    ['Vider', 'Corbeille', 'La corbeille a été vidée par erreur hier.'],
    ['Vider', 'Corbeille', 'La corbeille est vide.'],
    ['Vaciar', 'Papelera', 'La papelera no se vaciará.'],
    ['Vaciar', 'Papelera', 'La papelera se vació por error ayer.'],
    ['Svuota', 'Cestino', 'Il cestino non verrà svuotato.'],
    ['Svuota', 'Cestino', 'Il cestino è stato svuotato per errore ieri.'],
    ['Esvaziar', 'Lixeira', 'A lixeira não será esvaziada.'],
    ['Esvaziar', 'Lixeira', 'A lixeira foi esvaziada por engano ontem.'],
    ['Legen', 'Prullenbak', 'De prullenbak wordt niet geleegd.'],
    ['Legen', 'Prullenbak', 'De prullenbak werd gisteren per ongeluk geleegd.'],
    ['Очистить', 'Корзина', 'Корзина не будет опустошена.'],
    ['Очистить', 'Корзина', 'Корзина была по ошибке опустошена вчера.'],
    ['清空', '废纸篓', '废纸篓不会被清空。'],
    ['清空', '废纸篓', '废纸篓已清空。'],
    ['清空', '废纸篓', '废纸篓昨天被误清空了。'],
    ['清空', '提示', '清空废纸篓？'],
    ['空にする', 'ゴミ箱', 'ゴミ箱は空になりません。'],
    ['空にする', 'ゴミ箱', 'ゴミ箱は昨日誤って空になりました。'],
    ['空にする', 'ゴミ箱', 'ゴミ箱は空になっています。'],
    ['空にする', '確認', 'ゴミ箱を空にしますか？'],
    ['비우기', '휴지통', '휴지통이 비워지지 않습니다.'],
    ['비우기', '휴지통', '휴지통이 어제 실수로 비워졌습니다.'],
    ['비우기', '휴지통', '휴지통이 비어 있습니다.'],
    ['비우기', '확인', '휴지통을 비우시겠습니까?'],
    ['Boşalt', 'Çöp Sepeti', 'Çöp Sepeti boşaltılmayacak.'],
    ['Boşalt', 'Çöp Sepeti', 'Çöp Sepeti dün yanlışlıkla boşaltıldı.'],
  ])
})
