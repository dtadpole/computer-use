import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-881 (P1): pt 'no' is the contraction em + o ('in the'), but the four-word negation window read it as the es / en negation, so
// a pending pt trash statement with a locative right before its delete verb ('O macOS no seu Mac apagará ...') went free under
// 'Esvaziar'. The table cu-researcher OK'd (18:31Z, shapes A and B): (A) 'no' before a possessive or a listed noun or brand is no
// negation; (B) before a pt-only verb form no bare 'no' is. não / nunca / jamais still free, and es / en 'no' still negates.
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-881-'))
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
const deletes = (route, [n, t, d]) => classes(route(n, t, d)).includes('delete')

test('CU-881 (A): a pt locative no + possessive or listed noun before the verb no longer frees a pending statement', () => {
  asks([
    ['Esvaziar', 'Lixo', 'O macOS no seu Mac apagará todos os itens do Lixo.'],
    ['Esvaziar', 'Lixo', 'Os serviços no iCloud eliminarão os itens do Lixo.'],
    ['Esvaziar', 'Lixo', 'O Finder no Mac vai apagar todos os itens do Lixo.'],
    ['Esvaziar', 'Lixo', 'No Lixo, o macOS apagará todos os itens.'],
    ['Esvaziar', 'Lixo', 'O Lixo no seu Mac será esvaziado.'],
    ['Esvaziar', 'Lixo', 'Deseja que os itens no Lixo sejam apagados?'],
    // CU-889's half 1 (cu-verifier's rows, split to CU-881 by cu-coordinator 18:29Z)
    ['Esvaziar', 'Lixeira', 'A limpeza agendada no Mac apagará todos os arquivos da lixeira.'],
    ['Esvaziar', 'Lixeira', 'A limpeza agendada no Mac vai apagar todos os arquivos da lixeira.'],
  ])
})

test('CU-881 (B): before a pt-only verb form a locative no + an unlisted noun no longer frees it either', () => {
  asks([
    ['Esvaziar', 'Lixeira', 'Os serviços no navegador eliminarão os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'A tarefa no Finder vai excluir os arquivos da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Deseja que os arquivos no Finder sejam excluídos?'],
  ])
})

test('CU-881: the passive futures that already asked on main keep asking', () => {
  asks([
    ['Esvaziar', 'Lixo', 'Os itens no lixo serão apagados.'],
    ['Esvaziar', 'Lixo', 'Tudo no computador será eliminado.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos no iCloud vão ser excluídos.'],
  ])
})

test('CU-881: real negations still free - pt não / nunca / jamais, es and en no - and so do a restore verb and a past', () => {
  free([
    ['Esvaziar', 'Lixo', 'Os itens no Lixo não serão apagados.'],
    ['Esvaziar', 'Lixo', 'O macOS no seu Mac nunca apagará os itens do Lixo.'],
    ['Esvaziar', 'Lixeira', 'O sistema jamais eliminará os itens da lixeira.'],
    ['Esvaziar', 'Lixo', 'O Finder no Mac não vai apagar os itens do Lixo.'],
    ['Esvaziar', 'Lixeira', 'Os serviços no navegador não eliminarão os itens da lixeira.'],
    ['Esvaziar', 'Lixo', 'O sistema no Mac restaurará os itens do Lixo.'],
    ['Esvaziar', 'Lixo', 'Os itens no Lixo foram apagados.'],
    // es 'no' still negates. The table's 'Los elementos de la papelera no se eliminarán.' and 'El sistema no eliminará los
    // elementos de la papelera.' ask on main 701a53309 too (measured in the CU-881 test1 window, 28 Nov 04:4xZ - another route,
    // not this window), so they are no twins here; 'quitar' carries the same negation and is free on main.
    ['Vaciar', 'Papelera', 'Los elementos de la papelera no se quitarán.'],
    ['Vaciar', 'Papelera', 'El sistema no quitará los elementos de la papelera.'],
    ['Empty', 'Trash', 'No items will be deleted.'],
  ])
})

test('#1605 fold: the en determiner No + a listed noun or brand stays a negation (free, as on main)', () => {
  // cu-verifier's finding at 5762a9f9e (issuecomment-7234844551): (A) had read these as the pt locative.
  free([
    ['Empty', 'Trash', 'No Mac will delete the items in the Trash.'],
    ['Empty', 'Trash', 'No iPhone will erase the items in the Trash.'],
    ['Empty', 'Trash', 'No app will delete the items in the Trash.'],
  ])
})

test('#1605 fold: Mac / MacBook / iMac, the possessive próprio and the pt-only destruíd- complete (A) and (B)', () => {
  asks([
    ['Esvaziar', 'Lixo', 'O macOS no MacBook apagará todos os itens do Lixo.'],
    ['Esvaziar', 'Lixo', 'O Finder no iMac apagará os itens do Lixo.'],
    ['Esvaziar', 'Lixo', 'O Finder no próprio Mac apagará os itens do Lixo.'],
    ['Esvaziar', 'Lixeira', 'Deseja que os arquivos no Finder sejam destruídos?'],
  ])
  free([
    ['Esvaziar', 'Lixo', 'O Finder no próprio Mac não apagará os itens do Lixo.'],
    ['Esvaziar', 'Lixo', 'O Finder no iMac apagou os itens do Lixo.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos no Finder não serão destruídos.'],
  ])
})
