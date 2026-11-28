import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-863 (P1): the pt periphrastic active future of a covered delete verb - 'Estes comandos vão eliminar os itens da lixeira.' under
// 'Esvaziar' - went free in a pending trash statement while its synthetic future ('eliminará') asked. The table cu-researcher OK'd
// (03:36Z) adds vai / vão / irá / irão (+ se) + the infinitive or its enclitic form ('vai excluí-los') to the active-future cell;
// vou / vamos, retirar / tirar and es 'va(n) a' stay out, and a negation within four words before the auxiliary still frees it.
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-863-'))
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
const same = (row, twin) => { for (const [label, route] of [['web', onWeb], ['desktop', onDesktop]]) assert.equal(deletes(route, row), deletes(route, twin), `${label} ${row.join(' | ')}`) }

test('CU-863: each covered verb\'s periphrastic future asks, singular and plural, beside its synthetic twin that asks on main', () => {
  asks([
    // excluir: vai / irão
    ['Esvaziar', 'Lixeira', 'O sistema vai excluir os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'O sistema excluirá os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Estes comandos irão excluir os itens da lixeira para sempre.'],
    ['Esvaziar', 'Lixeira', 'Estes comandos excluirão os itens da lixeira para sempre.'],
    // deletar: irá / vão
    ['Esvaziar', 'Lixeira', 'O sistema irá deletar os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'O sistema deletará os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Estes comandos vão deletar os itens da lixeira para sempre.'],
    ['Esvaziar', 'Lixeira', 'Estes comandos deletarão os itens da lixeira para sempre.'],
    // apagar: vai / vão, and the table's row with no object
    ['Esvaziar', 'Lixeira', 'O sistema vai apagar os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'O sistema apagará os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Estes comandos vão apagar os itens da lixeira para sempre.'],
    ['Esvaziar', 'Lixeira', 'Estes comandos apagarão os itens da lixeira para sempre.'],
    ['Esvaziar', 'Lixeira', 'Ao esvaziar a lixeira, o sistema vai apagar para sempre.'],
    ['Esvaziar', 'Lixeira', 'Ao esvaziar a lixeira, o sistema apagará para sempre.'],
    // remover: irá / irão
    ['Esvaziar', 'Lixeira', 'O sistema irá remover os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'O sistema removerá os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Estes comandos irão remover os itens da lixeira para sempre.'],
    ['Esvaziar', 'Lixeira', 'Estes comandos removerão os itens da lixeira para sempre.'],
    // eliminar: vai / vão (the plural synthetic eliminarão is CU-853's, so the singular stands as the plural row's twin)
    ['Esvaziar', 'Lixeira', 'O sistema vai eliminar os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'O sistema eliminará os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Estes comandos vão eliminar os itens da lixeira para sempre.'],
    ['Esvaziar', 'Lixeira', 'O sistema eliminará os itens da lixeira para sempre.'],
    // destruir: irá / vão
    ['Esvaziar', 'Lixeira', 'O sistema irá destruir os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'O sistema destruirá os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Estes comandos vão destruir os itens da lixeira para sempre.'],
    ['Esvaziar', 'Lixeira', 'Estes comandos destruirão os itens da lixeira para sempre.'],
  ])
})

test('CU-863: the reflexive word orders and a title that lends the trash ask, beside their twins', () => {
  asks([
    ['Esvaziar', 'Lixeira', 'Todos os itens da lixeira vão se eliminar.'],
    ['Esvaziar', 'Lixeira', 'Todos os itens da lixeira vão eliminar-se.'],
    ['Esvaziar', 'Lixeira', 'Todos os itens da lixeira se vão apagar.'],
    ['Esvaziar', 'Lixeira', 'Todos os itens da lixeira se destruirão.'],
    ['Esvaziar', 'Lixeira', 'Os aplicativos vão eliminar todos os arquivos de forma permanente.'],
    ['Esvaziar', 'Lixeira', 'O aplicativo eliminará todos os arquivos de forma permanente.'],
  ])
})

test('CU-863: the enclitic object after the infinitive asks, one row per covered verb', () => {
  asks([
    ['Esvaziar', 'Lixeira', 'Quanto aos itens da lixeira, o sistema vai excluí-los para sempre.'],
    ['Esvaziar', 'Lixeira', 'Quanto às mensagens da lixeira, estes comandos vão apagá-las para sempre.'],
    ['Esvaziar', 'Lixeira', 'Quanto ao arquivo da lixeira, o sistema irá removê-lo para sempre.'],
    ['Esvaziar', 'Lixeira', 'Quanto aos itens da lixeira, estes comandos irão eliminá-los para sempre.'],
    ['Esvaziar', 'Lixeira', 'Quanto à pasta da lixeira, o sistema vai destruí-la para sempre.'],
    ['Esvaziar', 'Lixeira', 'Quanto aos arquivos da lixeira, estes comandos vão deletá-los para sempre.'],
  ])
})

test('CU-863: the negated, past and non-delete twins stay free, and a title that names no trash reads as the synthetic twin', () => {
  free([
    ['Esvaziar', 'Lixeira', 'Estes comandos não vão eliminar os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Estes comandos nunca irão apagar os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Os itens da lixeira não se vão eliminar.'],
    ['Esvaziar', 'Lixeira', 'Quanto aos itens da lixeira, o sistema não vai excluí-los.'],
    ['Esvaziar', 'Lixeira', 'Estes comandos eliminaram os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Estes comandos iam eliminar os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Estes comandos foram eliminar os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Estes comandos vão restaurar os itens da lixeira.'],
    ['Esvaziar', 'Histórico', 'Os aplicativos vão eliminar todos os arquivos de forma permanente.'],
  ])
  same(['Esvaziar', 'Histórico', 'Os aplicativos vão eliminar todos os arquivos de forma permanente.'], ['Esvaziar', 'Histórico', 'O aplicativo eliminará todos os arquivos de forma permanente.'])
})

// Table row 10: the eliminar row with a negation after the verb already asks on main (the trash-statement reader); its remover twin,
// free on main, asks with the change.
test('CU-863: a negation after the verb keeps the row asking, and its remover twin asks with it', () => {
  asks([
    ['Esvaziar', 'Lixeira', 'Estes comandos vão eliminar os itens da lixeira e não será possível recuperá-los.'],
    ['Esvaziar', 'Lixeira', 'Estes comandos vão remover os itens da lixeira e não será possível recuperá-los.'],
  ])
})

test('CU-863: the table\'s bounds stay free - retirar (Q1 out) and the first person (Q2 out)', () => {
  free([
    ['Esvaziar', 'Lixeira', 'Estes comandos vão retirar os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Vamos eliminar os itens da lixeira.'],
  ])
})

// Composed with CU-853 (the second PR on the TRASH_ACTIVE_FUTURE line carries the composed rows): with eliminarão read, each plural
// periphrastic eliminar row now stands beside its own plural synthetic twin.
test('CU-863 composed with CU-853: the plural vão eliminar asks beside its plural synthetic twin eliminarão, on both routes', () => {
  asks([
    ['Esvaziar', 'Lixeira', 'Estes comandos vão eliminar os itens da lixeira para sempre.'],
    ['Esvaziar', 'Lixeira', 'Estes comandos eliminarão os itens da lixeira para sempre.'],
    ['Esvaziar', 'Lixeira', 'Todos os itens da lixeira vão se eliminar.'],
    ['Esvaziar', 'Lixeira', 'Todos os itens da lixeira se eliminarão.'],
    ['Esvaziar', 'Lixeira', 'Os aplicativos vão eliminar todos os arquivos de forma permanente.'],
    ['Esvaziar', 'Lixeira', 'Os aplicativos eliminarão todos os arquivos de forma permanente.'],
  ])
  free([
    ['Esvaziar', 'Lixeira', 'Estes comandos não vão eliminar os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Estes comandos não eliminarão os itens da lixeira.'],
  ])
  same(['Esvaziar', 'Histórico', 'Os aplicativos vão eliminar todos os arquivos de forma permanente.'], ['Esvaziar', 'Histórico', 'Os aplicativos eliminarão todos os arquivos de forma permanente.'])
})

// The fold for #1588 (F1, F2): every future in the sentence is read, and 'em vão' (in vain) is no auxiliary.
test('CU-863 fold: a negated or windowed periphrastic first no longer hides a later synthetic future, the European \'vão-se\' asks, and \'em vão\' stays free', () => {
  asks([
    ['Esvaziar', 'Lixeira', 'O sistema não vai apagar as pastas, mas excluirá todos os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Os aplicativos não vão apagar os originais, mas eliminarão os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Estes comandos nunca irão remover os arquivos abertos, mas apagarão todos os outros itens.'],
    ['Esvaziar', 'Lixeira', 'Os aplicativos no Mac vão apagar as cópias e eliminarão os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Em breve, os aplicativos vão apagar os itens da lixeira.'],
    ['Esvaziar', 'Lixo', 'Vão-se eliminar todos os ficheiros do Lixo.'],
    ['Esvaziar', 'Lixo', 'Vai-se apagar todo o conteúdo do Lixo.'],
  ])
  free([
    ['Esvaziar', 'Lixeira', 'Ontem o aplicativo tentou em vão excluir os arquivos da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Os aplicativos tentaram em vão apagar os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Os filtros tentarão em vão remover os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'O sistema não eliminará as pastas e não excluirá os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Os aplicativos não vão apagar os itens da lixeira, mas restaurarão as pastas.'],
    ['Esvaziar', 'Lixo', 'Os ficheiros do Lixo não se vão eliminar.'],
  ])
})

test('#1588 cut (D-121 (1)): later futures are read as on main - after a negated periphrastic only main\'s first match, else none', () => {
  free([
    ['Esvaziar', 'Lixeira', 'Os aplicativos não vão apagar os itens da lixeira nem os vão excluir.'],
    ['Esvaziar', 'Lixeira', 'O sistema não vai apagar os itens da lixeira nem vai excluir as pastas.'],
    ['Esvaziar', 'Lixeira', 'O sistema não apagará os itens da lixeira nem excluirá as pastas.'],
    ['Esvaziar', 'Lixeira', 'Os aplicativos não apagarão os itens da lixeira nem os excluirão.'],
    ['Esvaziar', 'Lixeira', 'O sistema nunca apagará as pastas nem os excluirá da lixeira.'],
    ['Svuota', 'Cestino', 'Le app non cancelleranno gli elementi del cestino né li elimineranno.'],
    ['Esvaziar', 'Lixeira', 'O sistema não vai apagar as pastas nem durante a noite de hoje vai excluir os itens da lixeira.'],
  ])
  asks([
    ['Esvaziar', 'Lixeira', 'O sistema excluirá todos os itens da lixeira, nem que demore.'],
    // free on main (main reads only its first match); the follow-up this cut named is CU-892: the clause after the contrast
    // marker ('mas', ', contudo') is read on its own, so its positive future asks
    ['Esvaziar', 'Lixeira', 'O sistema não apagará as pastas, mas excluirá todos os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'O sistema não vai apagar as pastas nem os atalhos, mas vai excluir todos os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'O sistema não apagará as pastas nem os atalhos, contudo excluirá todos os itens da lixeira.'],
    // asks on main 986abf965 as well (another rule reads it), so it keeps asking
    ['Esvaziar', 'Lixeira', 'O sistema não eliminará as pastas, mas excluirá todos os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'O sistema não vai apagar as pastas, mas excluirá todos os itens da lixeira.'],
  ])
})
