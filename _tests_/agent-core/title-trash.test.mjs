import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-818 (P1; found by cu-verifier in the #1482 review): an emptying button under a dialog whose TITLE alone names the trash
// ('Empty' under 'Trash' / 'The items will be permanently deleted, so they cannot be recovered.') acts unasked.
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-818-'))
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


test('CU-818: the filed row, verbatim, asks delete on both routes', () => {
  asks([['Empty', 'Trash', 'The items will be permanently deleted, so they cannot be recovered.']])
})

test('CU-818: a title naming the trash lends it to the description\'s item sentences, in every covered language', () => {
  asks([
    ['Leeren', 'Papierkorb', 'Die Objekte werden endgültig gelöscht.'],
    ['空にする', 'ゴミ箱', '項目は完全に削除されます。'],
    ['비우기', '휴지통', '항목이 영구적으로 삭제됩니다.'],
    ['Empty', 'Trash', 'This cannot be undone. Everything will be permanently deleted.'],
  ])
})

test('CU-818: negated, past, past-event, conditional, other-object, no-trash-title and mismatched-button rows stay free', () => {
  free([
    ['Empty', 'Trash', 'The items will not be deleted.'],
    ['Empty', 'Trash', 'The items were permanently deleted.'],
    ['Empty', 'Trash', 'The items were deleted by mistake, so they could not be recovered.'],
    ['Empty', 'Trash', 'Some items were deleted by mistake yesterday.'],
    ['Empty', 'Trash', 'If the items are deleted, they cannot be recovered.'],
    ['Empty', 'Trash', 'Your search history will also be deleted.'],
    ['Empty', 'Notice', 'The items will be permanently deleted.'],
    ['Cancel', 'Trash', 'The items will be permanently deleted.'],
  ])
})

test('#1491 r2: the future passives the in-sentence rule reads count under the title too - cu-researcher\'s miss = CU-821\'s row', () => {
  asks([
    ['Vaciar', 'Papelera', 'Los elementos se eliminarán de forma permanente.'],
    ['Vaciar', 'Papelera', 'Los elementos se borrarán.'],
    ['Svuota', 'Cestino', 'Gli elementi verranno eliminati.'],
    ['Esvaziar', 'Lixeira', 'Os itens serão excluídos.'],
  ])
  free([
    ['Vaciar', 'Papelera', 'Los elementos no se eliminarán.'],
    ['Vaciar', 'Papelera', 'Los elementos se eliminaron.'],
    ['Vaciar', 'Papelera', 'Algunos elementos se eliminaron por error ayer.'],
    ['Vaciar', 'Papelera', 'Si se eliminan los elementos, no se podrán recuperar.'],
    ['Vaciar', 'Aviso', 'Los elementos se eliminarán.'],
  ])
})
