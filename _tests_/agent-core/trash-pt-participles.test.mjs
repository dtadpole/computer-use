import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-851 (P1; the table cu-researcher OK'd 00:17Z): a pt pending trash statement with the participle eliminado or destruído after
// the CU-823 auxiliaries went free - 'Esvaziar' under 'Lixo' with 'Os arquivos vão ficar eliminados permanentemente.' Its negated,
// past and restored twins stay free.
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-851-'))
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

test('CU-851: the filed rows, verbatim, ask delete on both routes, and so does the control', () => {
  asks([
    ['Esvaziar', 'Lixo', 'Os arquivos vão ficar eliminados permanentemente.'],
    // 'não' sits outside the match, and is not the word before it
    ['Esvaziar', 'Lixo', 'Atenção: este documento vai ficar eliminado e a ação não pode ser desfeita.'],
    // the control, which asks on main
    ['Esvaziar', 'Lixo', 'Os arquivos serão eliminados permanentemente.'],
  ])
})

test('CU-851: each pending passive of eliminado / destruído asks, beside its excluído / apagado twin that asks on main', () => {
  asks([
    ['Esvaziar', 'Lixo', 'O documento vai ser eliminado definitivamente.'],
    ['Esvaziar', 'Lixo', 'O documento vai ser excluído definitivamente.'],
    ['Esvaziar', 'Lixo', 'As fotos na lixeira vão estar eliminadas.'],
    ['Esvaziar', 'Lixo', 'As fotos na lixeira vão estar excluídas.'],
    ['Esvaziar', 'Lixo', 'Os itens ficarão eliminados.'],
    ['Esvaziar', 'Lixo', 'Os itens ficarão excluídos.'],
    ['Esvaziar', 'Lixo', 'A pasta no Lixo ficará eliminada.'],
    ['Esvaziar', 'Lixo', 'A pasta no Lixo ficará apagada.'],
    // Q1: destruíd-
    ['Esvaziar', 'Lixo', 'Os arquivos irão ser destruídos.'],
    ['Esvaziar', 'Lixo', 'Os arquivos irão ser apagados.'],
  ])
})

test('CU-851: the negated, past-event, past-state and restored twins stay free', () => {
  free([
    ['Esvaziar', 'Lixo', 'Os arquivos não vão ficar eliminados.'],
    ['Esvaziar', 'Lixo', 'Os arquivos foram eliminados permanentemente.'],
    ['Esvaziar', 'Lixo', 'Os arquivos ficaram eliminados.'],
    ['Esvaziar', 'Lixo', 'Os arquivos vão ser restaurados.'],
    ['Esvaziar', 'Lixo', 'Os arquivos não irão ser destruídos.'],
    ['Esvaziar', 'Lixo', 'Os arquivos foram destruídos.'],
  ])
})

test('CU-851: the near row under a title that names no trash reads the same as its excluídos twin on each route (Q4)', () => {
  const near = ['Esvaziar', 'Histórico', 'Os arquivos vão ficar eliminados permanentemente.']
  const twin = ['Esvaziar', 'Histórico', 'Os arquivos vão ficar excluídos permanentemente.']
  for (const [route, classify] of [['web', onWeb], ['desktop', onDesktop]]) {
    assert.equal(classes(classify(...near)).includes('delete'), classes(classify(...twin)).includes('delete'), `${route} ${near.join(' | ')}`)
  }
})

test('CU-851: out of scope stays free - tirad- after the same auxiliaries (Q2)', () => {
  free([['Esvaziar', 'Lixo', 'Os arquivos vão ficar tirados.']])
})

// CU-851 table Q3: the second of CU-846 / CU-851 to land carries the composed rows - CU-846's pt imminent auxiliaries with the
// participles CU-851 adds ask; their negated and past twins stay free.
test('CU-851 + CU-846: the pt imminent auxiliaries with eliminado / destruído ask, their negated and past twins stay free', () => {
  asks([
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira estão prestes a ser eliminados.'],
    ['Esvaziar', 'Lixeira', 'O documento da lixeira está para ser destruído.'],
  ])
  free([
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira não estão prestes a ser eliminados.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira estavam prestes a ser eliminados.'],
  ])
})
