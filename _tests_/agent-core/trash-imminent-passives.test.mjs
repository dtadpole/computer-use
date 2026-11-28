import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-846 (P1; the table cu-researcher OK'd 23:55Z, with r1a): an imminent future passive of a covered delete verb over the trash
// went free - 'Svuota' under 'Cestino' with 'I file nel cestino stanno per essere eliminati definitivamente.' Its negated,
// past-imminent and past-event twins stay free.
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-846-'))
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

test('CU-846: the filed row, verbatim, asks delete on both routes', () => {
  asks([['Svuota', 'Cestino', 'I file nel cestino stanno per essere eliminati definitivamente.']])
})

test('CU-846: it - each imminent future passive asks, beside its synthetic twin that asks on main', () => {
  asks([
    ['Svuota', 'Cestino', 'Il file nel cestino sta per essere definitivamente cancellato.'],
    ['Svuota', 'Cestino', 'Il file nel cestino verrà definitivamente cancellato.'],
    ['Svuota', 'Cestino', 'Gli elementi del cestino sono sul punto di essere rimossi.'],
    ['Svuota', 'Cestino', 'Gli elementi del cestino saranno rimossi.'],
    // 'è' after no letter (CU-825)
    ['Svuota', 'Cestino', 'Il file nel cestino è sul punto di essere eliminato.'],
    ['Svuota', 'Cestino', 'Il file nel cestino sarà eliminato.'],
    // Q4: venire after the imminent auxiliary
    ['Svuota', 'Cestino', 'Le foto nel cestino stanno per venire distrutte.'],
    ['Svuota', 'Cestino', 'Le foto nel cestino verranno distrutte.'],
    // Q2: the trash-locative cell, with a removal participle only it reads
    ['Svuota', 'Cestino', 'I file stanno per essere tolti dal cestino.'],
    ['Svuota', 'Cestino', 'I file verranno tolti dal cestino.'],
    ['Svuota', 'Cestino', 'Il file è sul punto di essere tolto dal cestino.'],
    ['Svuota', 'Cestino', 'Il file sarà tolto dal cestino.'],
  ])
})

test('CU-846: fr - each imminent future passive asks, beside its synthetic twin that asks on main', () => {
  asks([
    ['Vider', 'Corbeille', 'Les fichiers de la corbeille sont sur le point d\'être supprimés définitivement.'],
    ['Vider', 'Corbeille', 'Les fichiers de la corbeille seront supprimés définitivement.'],
    ['Vider', 'Corbeille', 'Le fichier est sur le point d’être définitivement effacé.'],
    ['Vider', 'Corbeille', 'Le fichier sera définitivement effacé.'],
    // Q2: the trash-locative cell, both apostrophes
    ['Vider', 'Corbeille', 'Les fichiers sont sur le point d\'être retirés de la corbeille.'],
    ['Vider', 'Corbeille', 'Les fichiers seront retirés de la corbeille.'],
    ['Vider', 'Corbeille', 'Le fichier est sur le point d’être retiré de la corbeille.'],
    ['Vider', 'Corbeille', 'Le fichier sera retiré de la corbeille.'],
  ])
})

test('CU-846: es - each imminent future passive asks, beside its synthetic twin that asks on main', () => {
  asks([
    ['Vaciar', 'Papelera', 'Los archivos de la papelera están a punto de ser eliminados para siempre.'],
    ['Vaciar', 'Papelera', 'Los archivos de la papelera serán eliminados para siempre.'],
    ['Vaciar', 'Papelera', 'El archivo está a punto de ser borrado.'],
    ['Vaciar', 'Papelera', 'El archivo será borrado.'],
    // Q4: quedar after the imminent auxiliary
    ['Vaciar', 'Papelera', 'Los documentos de la papelera están a punto de quedar suprimidos.'],
    ['Vaciar', 'Papelera', 'Los documentos de la papelera serán suprimidos.'],
    // Q3: the enclitic
    ['Vaciar', 'Papelera', 'Los elementos de la papelera están a punto de borrarse.'],
    ['Vaciar', 'Papelera', 'Los elementos de la papelera se borrarán.'],
    // r1a: está(n) por ser
    ['Vaciar', 'Papelera', 'Los archivos de la papelera están por ser eliminados.'],
    ['Vaciar', 'Papelera', 'Los archivos de la papelera serán eliminados.'],
    ['Vaciar', 'Papelera', 'El archivo de la papelera está por ser borrado.'],
    ['Vaciar', 'Papelera', 'El archivo de la papelera será borrado.'],
    // Q2 / r1a: the trash-locative cell
    ['Vaciar', 'Papelera', 'Los archivos están a punto de ser quitados de la papelera.'],
    ['Vaciar', 'Papelera', 'Los archivos serán quitados de la papelera.'],
    ['Vaciar', 'Papelera', 'El archivo está por ser quitado de la papelera.'],
    ['Vaciar', 'Papelera', 'El archivo será quitado de la papelera.'],
  ])
})

test('CU-846: pt - each imminent future passive asks, beside its synthetic twin that asks on main', () => {
  asks([
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira estão prestes a ser excluídos para sempre.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira serão excluídos para sempre.'],
    ['Esvaziar', 'Lixeira', 'O arquivo da lixeira está prestes a ser apagado.'],
    ['Esvaziar', 'Lixeira', 'O arquivo da lixeira será apagado.'],
    // Q1: a ponto de
    ['Esvaziar', 'Lixeira', 'Os itens da lixeira estão a ponto de ser removidos.'],
    ['Esvaziar', 'Lixeira', 'Os itens da lixeira serão removidos.'],
    // Q4: ficar after the imminent auxiliary
    ['Esvaziar', 'Lixeira', 'Os documentos da lixeira estão prestes a ficar excluídos.'],
    ['Esvaziar', 'Lixeira', 'Os documentos da lixeira serão excluídos.'],
    // r1a: está / estão para ser
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira estão para ser excluídos.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira serão excluídos.'],
    ['Esvaziar', 'Lixeira', 'O arquivo da lixeira está para ser apagado.'],
    ['Esvaziar', 'Lixeira', 'O arquivo da lixeira será apagado.'],
    // Q2 / r1a: the trash-locative cell
    ['Esvaziar', 'Lixeira', 'Os itens estão prestes a ser retirados da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Os itens serão retirados da lixeira.'],
    ['Esvaziar', 'Lixeira', 'O item está a ponto de ser retirado da lixeira.'],
    ['Esvaziar', 'Lixeira', 'O item será retirado da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Os itens estão para ser retirados da lixeira.'],
  ])
})

test('CU-846: it - the negated, past-imminent and past-event twins stay free', () => {
  free([
    ['Svuota', 'Cestino', 'I file nel cestino non stanno per essere eliminati definitivamente.'],
    ['Svuota', 'Cestino', 'I file nel cestino stavano per essere eliminati definitivamente.'],
    ['Svuota', 'Cestino', 'I file nel cestino sono stati eliminati definitivamente.'],
    ['Svuota', 'Cestino', 'Il file nel cestino non sta per essere definitivamente cancellato.'],
    ['Svuota', 'Cestino', 'Il file nel cestino stava per essere definitivamente cancellato.'],
    ['Svuota', 'Cestino', 'Il file nel cestino è stato definitivamente cancellato.'],
    ['Svuota', 'Cestino', 'Gli elementi del cestino non sono sul punto di essere rimossi.'],
    ['Svuota', 'Cestino', 'Gli elementi del cestino erano sul punto di essere rimossi.'],
    ['Svuota', 'Cestino', 'Gli elementi del cestino sono stati rimossi.'],
    ['Svuota', 'Cestino', 'Il file nel cestino non è sul punto di essere eliminato.'],
    ['Svuota', 'Cestino', 'Il file nel cestino era sul punto di essere eliminato.'],
    ['Svuota', 'Cestino', 'Il file nel cestino è stato eliminato.'],
    ['Svuota', 'Cestino', 'Le foto nel cestino non stanno per venire distrutte.'],
    ['Svuota', 'Cestino', 'Le foto nel cestino stavano per venire distrutte.'],
    ['Svuota', 'Cestino', 'Le foto nel cestino sono state distrutte.'],
    ['Svuota', 'Cestino', 'I file non stanno per essere tolti dal cestino.'],
    ['Svuota', 'Cestino', 'I file stavano per essere tolti dal cestino.'],
    ['Svuota', 'Cestino', 'I file sono stati tolti dal cestino.'],
    ['Svuota', 'Cestino', 'Il file non è sul punto di essere tolto dal cestino.'],
    ['Svuota', 'Cestino', 'Il file era sul punto di essere tolto dal cestino.'],
    ['Svuota', 'Cestino', 'Il file è stato tolto dal cestino.'],
  ])
})

test('CU-846: fr - the negated, past-imminent and past-event twins stay free', () => {
  free([
    ['Vider', 'Corbeille', 'Les fichiers de la corbeille ne sont pas sur le point d\'être supprimés définitivement.'],
    ['Vider', 'Corbeille', 'Les fichiers de la corbeille étaient sur le point d\'être supprimés définitivement.'],
    ['Vider', 'Corbeille', 'Les fichiers de la corbeille ont été supprimés définitivement.'],
    ['Vider', 'Corbeille', 'Le fichier n’est pas sur le point d’être définitivement effacé.'],
    ['Vider', 'Corbeille', 'Le fichier était sur le point d’être définitivement effacé.'],
    ['Vider', 'Corbeille', 'Le fichier a été définitivement effacé.'],
    ['Vider', 'Corbeille', 'Les fichiers ne sont pas sur le point d\'être retirés de la corbeille.'],
    ['Vider', 'Corbeille', 'Les fichiers étaient sur le point d\'être retirés de la corbeille.'],
    ['Vider', 'Corbeille', 'Les fichiers ont été retirés de la corbeille.'],
    ['Vider', 'Corbeille', 'Le fichier n’est pas sur le point d’être retiré de la corbeille.'],
    ['Vider', 'Corbeille', 'Le fichier était sur le point d’être retiré de la corbeille.'],
    ['Vider', 'Corbeille', 'Le fichier a été retiré de la corbeille.'],
  ])
})

test('CU-846: es - the negated, past-imminent and past-event twins stay free', () => {
  free([
    ['Vaciar', 'Papelera', 'Los archivos de la papelera no están a punto de ser eliminados para siempre.'],
    ['Vaciar', 'Papelera', 'Los archivos de la papelera estaban a punto de ser eliminados para siempre.'],
    ['Vaciar', 'Papelera', 'Los archivos de la papelera estuvieron a punto de ser eliminados.'],
    ['Vaciar', 'Papelera', 'Los archivos de la papelera fueron eliminados para siempre.'],
    ['Vaciar', 'Papelera', 'El archivo no está a punto de ser borrado.'],
    ['Vaciar', 'Papelera', 'El archivo estaba a punto de ser borrado.'],
    ['Vaciar', 'Papelera', 'El archivo fue borrado.'],
    ['Vaciar', 'Papelera', 'Los documentos de la papelera no están a punto de quedar suprimidos.'],
    ['Vaciar', 'Papelera', 'Los documentos de la papelera estaban a punto de quedar suprimidos.'],
    ['Vaciar', 'Papelera', 'Los documentos de la papelera quedaron suprimidos.'],
    ['Vaciar', 'Papelera', 'Los elementos de la papelera no están a punto de borrarse.'],
    ['Vaciar', 'Papelera', 'Los elementos de la papelera estaban a punto de borrarse.'],
    ['Vaciar', 'Papelera', 'Los elementos de la papelera se borraron.'],
    ['Vaciar', 'Papelera', 'Los archivos de la papelera no están por ser eliminados.'],
    ['Vaciar', 'Papelera', 'Los archivos de la papelera estaban por ser eliminados.'],
    ['Vaciar', 'Papelera', 'Los archivos de la papelera fueron eliminados.'],
    ['Vaciar', 'Papelera', 'El archivo de la papelera no está por ser borrado.'],
    ['Vaciar', 'Papelera', 'El archivo de la papelera estaba por ser borrado.'],
    ['Vaciar', 'Papelera', 'El archivo de la papelera fue borrado.'],
    ['Vaciar', 'Papelera', 'Los archivos no están a punto de ser quitados de la papelera.'],
    ['Vaciar', 'Papelera', 'Los archivos estaban a punto de ser quitados de la papelera.'],
    ['Vaciar', 'Papelera', 'Los archivos fueron quitados de la papelera.'],
    ['Vaciar', 'Papelera', 'El archivo no está por ser quitado de la papelera.'],
    ['Vaciar', 'Papelera', 'El archivo estaba por ser quitado de la papelera.'],
  ])
})

test('CU-846: pt - the negated, past-imminent and past-event twins stay free', () => {
  free([
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira não estão prestes a ser excluídos para sempre.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira estavam prestes a ser excluídos para sempre.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira foram excluídos para sempre.'],
    ['Esvaziar', 'Lixeira', 'O arquivo da lixeira não está prestes a ser apagado.'],
    ['Esvaziar', 'Lixeira', 'O arquivo da lixeira estava prestes a ser apagado.'],
    ['Esvaziar', 'Lixeira', 'O arquivo da lixeira esteve prestes a ser apagado.'],
    ['Esvaziar', 'Lixeira', 'O arquivo da lixeira foi apagado.'],
    ['Esvaziar', 'Lixeira', 'Os itens da lixeira não estão a ponto de ser removidos.'],
    ['Esvaziar', 'Lixeira', 'Os itens da lixeira estavam a ponto de ser removidos.'],
    ['Esvaziar', 'Lixeira', 'Os itens da lixeira foram removidos.'],
    ['Esvaziar', 'Lixeira', 'Os documentos da lixeira não estão prestes a ficar excluídos.'],
    ['Esvaziar', 'Lixeira', 'Os documentos da lixeira estavam prestes a ficar excluídos.'],
    ['Esvaziar', 'Lixeira', 'Os documentos da lixeira ficaram excluídos.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira não estão para ser excluídos.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira estavam para ser excluídos.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira foram excluídos.'],
    ['Esvaziar', 'Lixeira', 'O arquivo da lixeira não está para ser apagado.'],
    ['Esvaziar', 'Lixeira', 'O arquivo da lixeira estava para ser apagado.'],
    ['Esvaziar', 'Lixeira', 'Os itens não estão prestes a ser retirados da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Os itens estavam prestes a ser retirados da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Os itens foram retirados da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Os itens não estão para ser retirados da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Os itens estavam para ser retirados da lixeira.'],
  ])
})

test('CU-846: the near rows stay free - a restored verb, and a pending statement that names no trash', () => {
  free([
    ['Svuota', 'Cestino', 'I file nel cestino stanno per essere ripristinati.'],
    ['Vider', 'Corbeille', 'Les fichiers de la corbeille sont sur le point d\'être restaurés.'],
    ['Vaciar', 'Papelera', 'Los archivos de la papelera están a punto de ser restaurados.'],
    ['Vaciar', 'Papelera', 'Los archivos de la papelera están por ser restaurados.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira estão prestes a ser restaurados.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira estão para ser restaurados.'],
    ['Svuota', 'Note', 'Le note stanno per essere eliminate.'],
  ])
})

test('CU-846: the out-of-scope shapes stay free - pt quase a / em vias de, fr en passe de (CU-860: the it active imminent now asks)', () => {
  free([
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira estão quase a ser excluídos.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira estão em vias de ser excluídos.'],
    ['Vider', 'Corbeille', 'Les fichiers de la corbeille sont en passe d\'être supprimés.'],
  ])
  // CU-860 (table r1 OK'd by cu-researcher): the active twin of the imminent auxiliary, with a covered delete verb, asks as its
  // passive does, so the it active row CU-846 pinned free now asks (trash-active-imminent.test.mjs).
  asks([
    ['Svuota', 'Cestino', 'Il sistema sta per eliminare tutti i file del cestino.'],
  ])
})

// CU-865 (P1; table r1 OK'd by cu-researcher 05:37Z, Q2 folded): the es imminent 'está(n) por' took only ser, so 'Los archivos de la
// papelera están por quedar eliminados.' went free under Vaciar | Papelera while its 'a punto de quedar' twin asked. 'está(n) por' now
// takes quedar and the enclitic V-se of the four covered verbs; the subjects are the es item nouns (archivo, documento, elemento,
// todo), all masculine, so the feminine participles ride the cell's [oa]s? as on main. Negated, past and near twins stay free.
test('CU-865: está(n) por quedar + each covered delete participle asks delete on both routes, beside its twins that ask on main', () => {
  asks([
    // the gap row of the table
    ['Vaciar', 'Papelera', 'Los archivos de la papelera están por quedar eliminados.'],
    // each covered participle, singular and plural
    ['Vaciar', 'Papelera', 'El archivo de la papelera está por quedar eliminado.'],
    ['Vaciar', 'Papelera', 'Los elementos de la papelera están por quedar eliminados.'],
    ['Vaciar', 'Papelera', 'El documento de la papelera está por quedar borrado.'],
    ['Vaciar', 'Papelera', 'Los documentos de la papelera están por quedar borrados.'],
    ['Vaciar', 'Papelera', 'El elemento de la papelera está por quedar suprimido.'],
    ['Vaciar', 'Papelera', 'Los elementos de la papelera están por quedar suprimidos.'],
    // Q1: destruid- (CU-854 is on main)
    ['Vaciar', 'Papelera', 'El archivo de la papelera está por quedar destruido.'],
    ['Vaciar', 'Papelera', 'Los archivos de la papelera están por quedar destruidos.'],
    // the trash title lends itself to an item-noun sentence (CU-818)
    ['Vaciar', 'Papelera', 'El archivo está por quedar borrado.'],
    ['Vaciar', 'Papelera', 'Todos los documentos están por quedar eliminados.'],
    ['Vaciar', 'Papelera', 'Todo está por quedar suprimido.'],
    // one to three words between the auxiliary and the participle
    ['Vaciar', 'Papelera', 'Los archivos de la papelera están por quedar definitivamente eliminados.'],
    ['Vaciar', 'Papelera', 'Los archivos de la papelera están por quedar total y definitivamente borrados.'],
    // the twins, which already ask on main
    ['Vaciar', 'Papelera', 'Los archivos de la papelera están a punto de quedar eliminados.'],
    ['Vaciar', 'Papelera', 'El archivo de la papelera está a punto de quedar borrado.'],
    ['Vaciar', 'Papelera', 'Los archivos de la papelera están por ser eliminados.'],
  ])
})

test('CU-865 Q2: the enclitic after está(n) por asks like its a punto de twin; its negated and past twins stay free', () => {
  asks([
    ['Vaciar', 'Papelera', 'Los archivos de la papelera están por borrarse.'],
    ['Vaciar', 'Papelera', 'El archivo de la papelera está por eliminarse.'],
    ['Vaciar', 'Papelera', 'Los documentos de la papelera están por suprimirse.'],
    ['Vaciar', 'Papelera', 'Los elementos de la papelera están por destruirse.'],
    // the twin, which already asks on main
    ['Vaciar', 'Papelera', 'Los archivos de la papelera están a punto de borrarse.'],
  ])
  free([
    ['Vaciar', 'Papelera', 'Los archivos de la papelera no están por borrarse.'],
    ['Vaciar', 'Papelera', 'Los archivos de la papelera estaban por borrarse.'],
    ['Vaciar', 'Papelera', 'El archivo de la papelera no está por eliminarse.'],
    ['Vaciar', 'Papelera', 'El archivo de la papelera estaba por eliminarse.'],
    ['Vaciar', 'Papelera', 'Los elementos de la papelera no están por destruirse.'],
  ])
})

test('CU-865: the past, negated and four-word twins of está(n) por quedar stay free', () => {
  free([
    ['Vaciar', 'Papelera', 'El archivo de la papelera estaba por quedar eliminado.'],
    ['Vaciar', 'Papelera', 'Los archivos de la papelera estaban por quedar eliminados.'],
    ['Vaciar', 'Papelera', 'Los archivos de la papelera estuvieron por quedar eliminados.'],
    ['Vaciar', 'Papelera', 'Los archivos de la papelera quedaron eliminados.'],
    ['Vaciar', 'Papelera', 'Los archivos de la papelera han quedado eliminados.'],
    ['Vaciar', 'Papelera', 'El archivo de la papelera no está por quedar eliminado.'],
    ['Vaciar', 'Papelera', 'Los archivos de la papelera no están por quedar eliminados.'],
    ['Vaciar', 'Papelera', 'Los archivos de la papelera nunca están por quedar eliminados.'],
    ['Vaciar', 'Papelera', 'Los archivos de la papelera están por no quedar eliminados.'],
    ['Vaciar', 'Papelera', 'Los archivos de la papelera están por quedar total, completa y definitivamente eliminados.'],
  ])
})

test('CU-865: the near rows and the unrelated por stay free - no delete participle, no trash, no emptying button, no auxiliary (CU-860: the es active imminent now asks)', () => {
  free([
    ['Vaciar', 'Papelera', 'Los archivos de la papelera están por quedar restaurados.'],
    ['Vaciar', 'Papelera', 'Los archivos de la papelera están por quedar guardados.'],
    ['Vaciar', 'Papelera', 'Los archivos están por quedar quitados de la papelera.'],
    ['Vaciar', 'Papelera', 'Los archivos están por quedar retirados de la papelera.'],
    ['Vaciar', 'Papelera', 'La papelera está por quedar vaciada.'],
    ['Vaciar', 'Notas', 'Las notas están por quedar eliminadas.'],
    ['Cancelar', 'Papelera', 'Los archivos de la papelera están por quedar eliminados.'],
    ['Vaciar', 'Papelera', 'Está por verse si los archivos quedan eliminados.'],
    ['Vaciar', 'Papelera', 'Queda por hacer la limpieza de la papelera.'],
    // Q3 row without the locative: '... de la papelera' asks on main through the CU-790 echo route, not this cell (unchanged by CU-865)
    ['Vaciar', 'Papelera', 'Quedan por eliminar 3 archivos.'],
  ])
  // CU-860 (table r1 OK'd by cu-researcher): the active twin of the imminent auxiliary, with a covered delete verb, asks as its
  // active future 'El sistema eliminará los archivos.' does, so the es active row CU-865 pinned free now asks (trash-active-imminent.test.mjs).
  asks([
    ['Vaciar', 'Papelera', 'El sistema está por eliminar los archivos.'],
  ])
})

// CU-873 (P1; table r1 OK'd by cu-researcher 02:56Z 28 Nov): the pt imminent 'está / estão para' took only ser, so 'Os arquivos estão
// para ficar eliminados.' went free under Esvaziar | Lixo while its 'prestes a / a ponto de ficar' twins asked. The one change: 'está /
// estão para' takes ficar too, before the six covered participles. Past, negated, four-word, broken and near twins stay free.
test('CU-873: está / estão para ficar + each covered delete participle asks delete on both routes, beside its twins that ask on main', () => {
  asks([
    // the filed row
    ['Esvaziar', 'Lixo', 'Os arquivos estão para ficar eliminados.'],
    // the gap row, both numbers
    ['Esvaziar', 'Lixeira', 'O arquivo da lixeira está para ficar excluído.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira estão para ficar excluídos.'],
    // each covered participle, singular and plural (destruíd-: CU-851)
    ['Esvaziar', 'Lixeira', 'O documento da lixeira está para ficar deletado.'],
    ['Esvaziar', 'Lixeira', 'Os documentos da lixeira estão para ficar deletados.'],
    ['Esvaziar', 'Lixeira', 'O item da lixeira está para ficar apagado.'],
    ['Esvaziar', 'Lixeira', 'Os itens da lixeira estão para ficar apagados.'],
    ['Esvaziar', 'Lixeira', 'O objeto da lixeira está para ficar removido.'],
    ['Esvaziar', 'Lixeira', 'Os objetos da lixeira estão para ficar removidos.'],
    ['Esvaziar', 'Lixeira', 'O ficheiro da lixeira está para ficar eliminado.'],
    ['Esvaziar', 'Lixeira', 'Os ficheiros da lixeira estão para ficar eliminados.'],
    ['Esvaziar', 'Lixeira', 'O conteúdo da lixeira está para ficar destruído.'],
    ['Esvaziar', 'Lixeira', 'Os elementos da lixeira estão para ficar destruídos.'],
    // the trash title lends itself to an item-noun sentence (CU-818)
    ['Esvaziar', 'Lixo', 'O arquivo está para ficar apagado.'],
    ['Esvaziar', 'Lixo', 'Tudo está para ficar excluído.'],
    ['Esvaziar', 'Lixo', 'Os dados estão para ficar deletados.'],
    // removid- is in this cell
    ['Esvaziar', 'Lixo', 'Os itens estão para ficar removidos da lixeira.'],
    // Q1: the feminine participles, with a subject over 'da lixeira' that is not an item noun
    ['Esvaziar', 'Lixeira', 'As fotos da lixeira estão para ficar excluídas.'],
    ['Esvaziar', 'Lixeira', 'A foto da lixeira está para ficar apagada.'],
    // one to three words between, a word after the participle, a word before the marker that is no negation
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira estão para ficar definitivamente excluídos.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira estão para ficar total e definitivamente apagados.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira estão para ficar excluídos para sempre.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira já estão para ficar excluídos.'],
    // the twins, which already ask on main
    ['Esvaziar', 'Lixo', 'Os arquivos estão a ponto de ficar eliminados.'],
    ['Esvaziar', 'Lixo', 'Os arquivos estão prestes a ficar eliminados.'],
    ['Esvaziar', 'Lixo', 'Os arquivos estão para ser eliminados.'],
  ])
})

test('CU-873: the four-word, broken, past, negated and near twins of está / estão para ficar stay free', () => {
  free([
    // four words between; a word that breaks the phrase
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira estão para ficar total, completa e definitivamente excluídos.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira estão agora para ficar excluídos.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira estão lá para ficar excluídos.'],
    // the past, and ficar with no auxiliary of the cell
    ['Esvaziar', 'Lixeira', 'O arquivo estava para ficar excluído.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira estavam para ficar excluídos.'],
    ['Esvaziar', 'Lixeira', 'O arquivo esteve para ficar excluído.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira estiveram para ficar excluídos.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira ficaram excluídos.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira têm ficado excluídos.'],
    // a negation right before the marker, or inside the phrase
    ['Esvaziar', 'Lixeira', 'O arquivo não está para ficar excluído.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira não estão para ficar excluídos.'],
    ['Esvaziar', 'Lixo', 'Os arquivos não estão para ficar eliminados.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira nunca estão para ficar excluídos.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira jamais estão para ficar excluídos.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira estão para não ficar excluídos.'],
    // the near rows: no está, out of scope, no delete participle, not in the cell, the emptying verb, no trash, no item noun, no
    // emptying button
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira são para ficar excluídos.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira estão em vias de ficar excluídos.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira estão para ficar restaurados.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira estão para ficar guardados.'],
    ['Esvaziar', 'Lixeira', 'Os itens estão para ficar retirados da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Os itens estão para ficar tirados da lixeira.'],
    ['Esvaziar', 'Lixeira', 'A lixeira está para ficar esvaziada.'],
    ['Esvaziar', 'Notas', 'Os arquivos estão para ficar apagados.'],
    ['Esvaziar', 'Lixo', 'O histórico está para ficar apagado.'],
    ['Cancelar', 'Lixo', 'Os arquivos estão para ficar eliminados.'],
  ])
})

// CU-896 (P1; r1a delta of the CU-873 table, OK'd by cu-researcher 04:01Z 28 Nov): the pt imminent 'está / estão por' + ser / ficar +
// a covered delete participle went free; it now asks as its 'para ser' twin does (one class-general change with CU-873, D-119 (5)).
test('CU-896: está / estão por ser / ficar + a covered delete participle asks delete on both routes, beside its para ser twin', () => {
  asks([
    ['Esvaziar', 'Lixo', 'Os arquivos estão por ser eliminados.'],
    ['Esvaziar', 'Lixeira', 'O arquivo da lixeira está por ser apagado.'],
    ['Esvaziar', 'Lixeira', 'Os itens da lixeira estão por ser excluídos.'],
    ['Esvaziar', 'Lixeira', 'Os itens da lixeira estão por ser deletados.'],
    ['Esvaziar', 'Lixeira', 'Os itens da lixeira estão por ser removidos.'],
    ['Esvaziar', 'Lixeira', 'Os itens da lixeira estão por ser destruídos.'],
    ['Esvaziar', 'Lixeira', 'Os documentos da lixeira estão por ficar eliminados.'],
    ['Esvaziar', 'Lixeira', 'As fotos da lixeira estão por ser excluídas.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira estão por ser definitivamente removidos.'],
    // the twin that already asks on main
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira estão para ser removidos.'],
  ])
})

test('CU-896: the negated, past, four-word and near twins of está / estão por ser / ficar stay free', () => {
  free([
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira não estão por ser excluídos.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira estavam por ser excluídos.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira estiveram por ser excluídos.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira estão por ser restaurados.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos estão por toda a lixeira.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira estão por ser total, completa e definitivamente excluídos.'],
    ['Esvaziar', 'Notas', 'Os arquivos estão por ser apagados.'],
    ['Cancelar', 'Lixo', 'Os arquivos estão por ser eliminados.'],
  ])
})
