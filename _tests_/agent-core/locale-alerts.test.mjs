import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-748 (High; cu-researcher's sweep 5): localized desktop alerts acted unasked - a German passive statement ('Diese 12 Fotos
// werden ... gelöscht.'), an Italian infinitive title ('Rimuovere tutti i dati dei siti web?'), a Korean honorific question
// ('지우시겠습니까') and Japanese 続ける on a purchase sheet. By class: passive-future delete statements in eight languages, the
// infinitive and honorific forms, and the localized continue / next / finish words, all read inside a dialog only.
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-748-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
const store = createAppApprovals({ path: join(tmp, 'a.json') })
store.grantAlways(FIXTURE, { by: 'api' })
const desktop = createAppPolicy({ scope: [FIXTURE], approvals: store })
const web = createPolicy({ sitePolicy: () => 'allow' })
const click = { type: 'click', x: 1, y: 1, button: 'left' }
const onDesktop = (name, dialogName, dialogDescription = '') => desktop.classify(click, { frontmostBundleId: FIXTURE, target: { origin: FIXTURE, role: 'AXButton', name, fingerprint: name, defaultButtonRead: true, dialogName, dialogDescription } })
const onWeb = (name, dialogName, dialogDescription = '') => web.classify(click, { url: 'https://app.example/', target: { role: 'button', name, dialogName, dialogDescription } })
const classes = (v) => (v.decision === 'allow' ? [] : (v.classes ?? [v.class]))

test('CU-748: the filed alerts ask their class on the desktop and the web', () => {
  for (const [name, title, description, cls] of [
    ['OK', '12 Fotos', 'Diese 12 Fotos werden von allen deinen Geräten gelöscht.', 'delete'],
    ['OK', 'Rimuovere tutti i dati dei siti web?', '', 'delete'],
    ['확인', '모든 방문 기록을 지우시겠습니까?', '', 'delete'],
    ['続ける', '購入しますか？', '¥1,200 が請求されます。', 'purchase'],
  ]) {
    assert.ok(classes(onDesktop(name, title, description)).includes(cls), `desktop ${name} / ${title}`)
    assert.ok(classes(onWeb(name, title, description)).includes(cls), `web ${name} / ${title}`)
  }
})

test('CU-748: passive-future delete statements in the covered languages ask delete under a generic confirm', () => {
  for (const [name, description] of [
    ['OK', 'Les 3 fichiers seront supprimés définitivement.'],
    ['Aceptar', 'Los mensajes se eliminarán de forma permanente.'],
    ['OK', 'I file selezionati verranno eliminati.'],
    ['OK', 'Os arquivos serão excluídos.'],
    ['ОК', 'Все данные будут удалены.'],
    ['OK', 'すべてのデータが削除されます。'],
    ['确定', '所有照片将被永久删除。'],
    ['확인', '모든 데이터가 삭제됩니다.'],
    ['Doorgaan', 'Deze mailbox wordt permanent verwijderd.'],
  ]) {
    assert.ok(classes(onDesktop(name, 'Hinweis', description)).includes('delete'), `desktop ${description}`)
  }
})

test('CU-748: localized next / finish words read their risk dialog', () => {
  for (const [name, title] of [['Suivant', 'Supprimer le compte ?'], ['Siguiente', '¿Eliminar la cuenta?'], ['次へ', 'アカウントを削除しますか？'], ['下一步', '确定要删除账户吗？'], ['다음', '계정을 삭제하시겠습니까?']]) {
    assert.ok(classes(onDesktop(name, title)).includes('delete'), `desktop ${name} / ${title}`)
  }
})

test('CU-748: harmless alerts and the same words outside a dialog stay free', () => {
  for (const [name, title, description] of [
    ['OK', 'Einstellungen', 'Diese Einstellungen werden gespeichert.'],
    ['続ける', 'ようこそ', 'セットアップを続けます。'],
    ['Suivant', 'Bienvenue', 'Choisissez votre langue.'],
    ['확인', '알림', '설정이 저장됩니다.'],
    ['Doorgaan', 'Melding', 'Uw instellingen worden opgeslagen.'],
  ]) {
    assert.deepEqual(classes(onDesktop(name, title, description)), [], `desktop ${name} / ${title}`)
  }
  for (const name of ['続ける', 'Suivant', '次へ', '다음']) {
    assert.deepEqual(classes(web.classify(click, { url: 'https://app.example/', target: { role: 'button', name } })), [], `web bare ${name}`)
  }
})
