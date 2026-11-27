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

test('CU-846: the out-of-scope shapes stay free - pt quase a / em vias de, fr en passe de, the it active imminent', () => {
  free([
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira estão quase a ser excluídos.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira estão em vias de ser excluídos.'],
    ['Vider', 'Corbeille', 'Les fichiers de la corbeille sont en passe d\'être supprimés.'],
    ['Svuota', 'Cestino', 'Il sistema sta per eliminare tutti i file del cestino.'],
  ])
})
