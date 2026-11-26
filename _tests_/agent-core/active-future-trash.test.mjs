import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-828 (P1; found in the #1499 review): the active future of a delete verb with an agent subject went free over the trash -
// 'Il sistema cancellerà tutti i file del cestino.' (table OK'd by cu-researcher 02:31Z).
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-828-'))
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


test('CU-828: the filed rows, verbatim, ask delete on both routes', () => {
  asks([
    ['Svuota', 'Cestino', 'Il sistema cancellerà tutti i file del cestino.'],
    ['Svuota', 'Cestino', 'I sistemi cancelleranno tutti i file del cestino.'],
    ['Esvaziar', 'Lixeira', 'O sistema apagará todos os arquivos da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Os sistemas apagarão todos os arquivos da lixeira.'],
  ])
})

test('CU-828: es / fr active futures ask, and a negation in a following clause does not free them', () => {
  asks([
    ['Vaciar', 'Papelera', 'El sistema eliminará los elementos de la papelera.'],
    ['Vider', 'Corbeille', 'Le système supprimera les éléments de la corbeille.'],
    ['Svuota', 'Cestino', 'Il sistema cancellerà tutti i file e non sarà possibile recuperarli.'],
    ['Esvaziar', 'Lixeira', 'O sistema apagará os arquivos e não será possível recuperá-los.'],
  ])
})

test('CU-828: negated, past, past-event, conditional and wrong-button rows stay free', () => {
  free([
    ['Svuota', 'Cestino', 'Il sistema non cancellerà gli elementi del cestino.'],
    ['Esvaziar', 'Lixeira', 'O sistema não apagará os itens da lixeira.'],
    ['Svuota', 'Cestino', 'Il sistema ha cancellato gli elementi del cestino.'],
    ['Esvaziar', 'Lixeira', 'O sistema apagou os itens da lixeira.'],
    ['Svuota', 'Cestino', 'Il sistema ha cancellato per errore gli elementi del cestino ieri.'],
    ['Svuota', 'Cestino', 'Il sistema cancellerebbe gli elementi del cestino.'],
    ['Esvaziar', 'Lixeira', 'O sistema apagaria os itens da lixeira.'],
    ['Annulla', 'Cestino', 'Il sistema cancellerà gli elementi del cestino.'],
  ])
})
