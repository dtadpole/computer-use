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
