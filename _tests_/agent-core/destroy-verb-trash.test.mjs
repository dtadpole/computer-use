import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-831 (P1; residual of #1502): the destroy verb was missing from the Western trash cell and the active-future list -
// 'Los elementos de la papelera se destruirán de forma permanente.' went free (table OK'd by cu-researcher 03:32Z).
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-831-'))
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


test('CU-831: the filed row, verbatim, asks delete on both routes', () => {
  asks([['Vaciar', 'Papelera', 'Los elementos de la papelera se destruirán de forma permanente.']])
})

test('CU-831: the destroy verb asks in en / de / it', () => {
  asks([
    ['Empty', 'Trash', 'The items in the trash will be destroyed.'],
    ['Leeren', 'Papierkorb', 'Der Inhalt des Papierkorbs wird vernichtet.'],
    ['Svuota', 'Cestino', 'Il sistema distruggerà i file del cestino.'],
  ])
})

test('CU-831: negated, past, past-event, conditional, wrong-button and a non-trash object stay free', () => {
  free([
    ['Vaciar', 'Papelera', 'Los elementos no se destruirán.'],
    ['Vaciar', 'Papelera', 'Los elementos se destruyeron.'],
    ['Vaciar', 'Papelera', 'Algunos elementos se destruyeron por error ayer.'],
    ['Vaciar', 'Papelera', 'Si se destruyen los elementos, no se podrán recuperar.'],
    ['Cancelar', 'Papelera', 'Los elementos se destruirán de forma permanente.'],
    // cu-researcher's over-ask check: a destroyed object that is not the trash's items, under a trash title.
    ['Empty', 'Trash', 'This will destroy your current session.'],
  ])
})

test('CU-831 r2: the it future passive with sarà / saranno reads the destroy participle (cu-verifier\'s #1516 row)', () => {
  asks([['Svuota', 'Cestino', 'Gli elementi del cestino saranno distrutti definitivamente.']])
  free([
    ['Svuota', 'Cestino', 'Gli elementi del cestino non saranno distrutti.'],
    ['Svuota', 'Cestino', 'Gli elementi del cestino sono stati distrutti.'],
    ['Svuota', 'Cestino', 'Alcuni elementi del cestino sono stati distrutti per errore ieri.'],
  ])
})

// CU-854 (P1; found in the CU-851 table): the es passive cell read eliminad- / borrad- / suprimid- after its periphrastic and
// resultative auxiliaries but not destruid-, so 'Los archivos van a ser destruidos para siempre.' went free under a trash title
// while 'serán destruidos' asked by another route. Table r1 (cu-researcher 00:34Z): destruir joins each shape of the cell.
test('CU-854: destruid- after the periphrastic and resultative auxiliaries, and the reflexive destroy forms, ask delete on both routes', () => {
  asks([
    ['Vaciar', 'Papelera', 'Los archivos van a ser destruidos para siempre.'],
    ['Vaciar', 'Papelera', 'El archivo va a ser destruido para siempre.'],
    ['Vaciar', 'Papelera', 'Los elementos quedarán destruidos de forma permanente.'],
    ['Vaciar', 'Papelera', 'Los elementos estarán destruidos de forma permanente.'],
    ['Vaciar', 'Papelera', 'Los elementos se van a destruir de forma permanente.'],
    ['Vaciar', 'Papelera', 'Los elementos van a destruirse de forma permanente.'],
    // the twins and the control, which already ask on main
    ['Vaciar', 'Papelera', 'Los archivos van a ser eliminados para siempre.'],
    ['Vaciar', 'Papelera', 'Los elementos quedarán eliminados de forma permanente.'],
    ['Vaciar', 'Papelera', 'Los archivos serán destruidos para siempre.'],
  ])
})

test('CU-854: the other side - negated, past, perfect, restore, no-trash-title and non-emptying rows stay free', () => {
  free([
    ['Vaciar', 'Papelera', 'Los archivos no van a ser destruidos.'],
    ['Vaciar', 'Papelera', 'Los archivos nunca serán destruidos.'],
    ['Vaciar', 'Papelera', 'Los elementos no se van a destruir.'],
    ['Vaciar', 'Papelera', 'Los archivos fueron destruidos.'],
    ['Vaciar', 'Papelera', 'Los archivos han sido destruidos.'],
    ['Vaciar', 'Papelera', 'Los archivos van a ser restaurados.'],
    ['Vaciar', 'Aviso', 'Los archivos van a ser destruidos para siempre.'],
    ['Cancelar', 'Papelera', 'Los archivos van a ser destruidos para siempre.'],
  ])
})

// CU-854 rebuild delta (cu-researcher 05:53Z): main's CU-846 shapes (#1562) - 'está(n) a punto de ser / quedar', 'está(n) por ser'
// and the enclitic 'está(n) a punto de ...se' - read destruir like the other three covered es delete verbs.
test('CU-854 delta: destruid- under the imminent auxiliaries and the enclitic a punto de destruirse ask; negated and past twins stay free', () => {
  asks([
    ['Vaciar', 'Papelera', 'Los archivos de la papelera están a punto de ser destruidos.'],
    ['Vaciar', 'Papelera', 'El archivo está a punto de quedar destruido.'],
    ['Vaciar', 'Papelera', 'Los documentos están por ser destruidos.'],
    ['Vaciar', 'Papelera', 'Los archivos están a punto de destruirse.'],
    // the twin, which already asks on main
    ['Vaciar', 'Papelera', 'Los archivos de la papelera están a punto de ser eliminados.'],
  ])
  free([
    ['Vaciar', 'Papelera', 'Los archivos no están a punto de ser destruidos.'],
    ['Vaciar', 'Papelera', 'Los archivos estaban a punto de ser destruidos.'],
    ['Vaciar', 'Papelera', 'Los archivos no están a punto de destruirse.'],
  ])
})
