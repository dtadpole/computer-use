import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-833 (P1; found in #1509's review): the pt verb 'deletar' was read in no shape - 'Esvaziar' | 'Lixeira' |
// 'Os arquivos da lixeira serão deletados.' went free while its excluir / apagar twins ask (table OK'd by cu-researcher 12:27Z).
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-833-'))
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

test('CU-833: the two filed rows, verbatim, ask delete on both routes', () => {
  asks([
    ['Esvaziar', 'Lixeira', 'O sistema deletará todos os arquivos da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira serão deletados.'],
  ])
})

test('CU-833: deletar asks in each shape excluir / apagar have - plural future, trash in the title only, the echo question', () => {
  asks([
    ['Esvaziar', 'Lixeira', 'Os aplicativos deletarão todos os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Todos os itens serão deletados permanentemente.'],
    ['Esvaziar', 'Os itens serão deletados da lixeira?'],
  ])
})

test('CU-833: negated, past, past-event, conditional and wrong-button rows stay free (with cu-researcher\'s two near rows)', () => {
  free([
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira não serão deletados.'],
    ['Esvaziar', 'Lixeira', 'O sistema não deletará os arquivos da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira foram deletados.'],
    ['Esvaziar', 'Lixeira', 'Alguns arquivos foram deletados por engano ontem.'],
    ['Esvaziar', 'Lixeira', 'Se os arquivos forem deletados, não poderão ser recuperados.'],
    ['Cancelar', 'Lixeira', 'Os arquivos da lixeira serão deletados.'],
    ['Esvaziar', 'Lixeira', 'Os administradores deletaram os arquivos da lixeira na terça-feira.'],
  ])
})

test('CU-833: a past question asks as its excluir / apagar / English twins already do on main (pre-existing; table row changed, OK 12:36Z)', () => {
  // The Western cell reads a final '?' as pending even after a past auxiliary - for every verb, so this is parity, not new:
  // 'Os arquivos já foram excluídos da lixeira?' and 'Were the files already deleted from the trash?' ask on main too.
  asks([['Esvaziar', '', 'Os arquivos já foram deletados da lixeira?']])
})
