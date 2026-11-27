import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-853 (P1 under-ask; table OK'd by cu-researcher 02:52Z): the pt synthetic future eliminarão was missing from the active-future
// list - 'Estes comandos eliminarão os itens da lixeira para sempre.' went free under Esvaziar | Lixeira while the singular
// eliminará (the shared es spelling, CU-828) and the plural destruirão (CU-831) asked.
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-853-'))
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
// A row reads as its twin on each route: the delete class on both, or on neither.
const same = (row, twin) => {
  for (const [route, f] of [['web', onWeb], ['desktop', onDesktop]]) {
    assert.equal(classes(f(...row)).includes('delete'), classes(f(...twin)).includes('delete'), `${route} ${row.join(' | ')} vs ${twin[2]}`)
  }
}

test('CU-853: table rows 1-4 ask on both routes, each beside its twin that asks on main', () => {
  asks([
    // Row 1, beside its destruirão plural and its eliminará singular.
    ['Esvaziar', 'Lixeira', 'Estes comandos eliminarão os itens da lixeira para sempre.'],
    ['Esvaziar', 'Lixeira', 'Estes comandos destruirão os itens da lixeira para sempre.'],
    ['Esvaziar', 'Lixeira', 'Este comando eliminará os itens da lixeira para sempre.'],
    // Row 2, the title lending the trash, beside its excluirão twin.
    ['Esvaziar', 'Lixeira', 'Os aplicativos eliminarão todos os arquivos de forma permanente.'],
    ['Esvaziar', 'Lixeira', 'Os aplicativos excluirão todos os arquivos de forma permanente.'],
    // Row 3, by the active-future list (not a se slot), beside its future passive twin.
    ['Esvaziar', 'Lixeira', 'Todos os itens da lixeira se eliminarão.'],
    ['Esvaziar', 'Lixeira', 'Todos os itens da lixeira serão eliminados.'],
    // Row 4, a negation after the verb, beside its destruirão twin.
    ['Esvaziar', 'Lixeira', 'Estes comandos eliminarão os itens da lixeira e não será possível recuperá-los.'],
    ['Esvaziar', 'Lixeira', 'Estes comandos destruirão os itens da lixeira e não será possível recuperá-los.'],
  ])
})

test('CU-853: the control, the singular eliminará, asks', () => {
  asks([['Esvaziar', 'Lixeira', 'O sistema eliminará os itens da lixeira.']])
})

// Out of scope, not asserted here: mesoclisis ('eliminar-se-ão') and the periphrastic active ('vão eliminar') stay as main.
test('CU-853: negated, past and restore twins stay free; a non-trash title reads as its excluirão twin', () => {
  free([
    ['Esvaziar', 'Lixeira', 'Estes comandos não eliminarão os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Estes comandos eliminaram os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Estes comandos restaurarão os itens da lixeira.'],
  ])
  same(
    ['Esvaziar', 'Histórico', 'Os aplicativos eliminarão todos os arquivos de forma permanente.'],
    ['Esvaziar', 'Histórico', 'Os aplicativos excluirão todos os arquivos de forma permanente.'],
  )
})
