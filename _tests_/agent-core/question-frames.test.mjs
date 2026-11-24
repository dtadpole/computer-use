import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-766 (High; cu-researcher's r2 set for CU-747): a localized bare verb under a question whose frame is informal or not yet
// listed acted unasked - 'Vaciar' under '¿Seguro que quieres vaciar la papelera?'. The frame list read 'quiere' inside 'quieres' and
// left a stray 's', so the title never reduced to its act. The informal and other common frames are now removed whole.
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-766-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
const store = createAppApprovals({ path: join(tmp, 'a.json') })
store.grantAlways(FIXTURE, { by: 'api' })
const desktop = createAppPolicy({ scope: [FIXTURE], approvals: store })
const web = createPolicy({ sitePolicy: () => 'allow' })
const click = { type: 'click', x: 1, y: 1, button: 'left' }
const classes = (v) => (v.decision === 'allow' ? [] : (v.classes ?? [v.class]))
const onWeb = (name, dialogName) => web.classify(click, { url: 'https://app.example/files', target: { role: 'button', name, dialogName } })
const onDesktop = (name, dialogName) => desktop.classify(click, { frontmostBundleId: FIXTURE, target: { origin: FIXTURE, role: 'AXButton', name, fingerprint: name, defaultButtonRead: true, dialogName } })

test('CU-766: the filed row asks delete on both routes', () => {
  assert.ok(classes(onWeb('Vaciar', '¿Seguro que quieres vaciar la papelera?')).includes('delete'))
  assert.ok(classes(onDesktop('Vaciar', '¿Seguro que quieres vaciar la papelera?')).includes('delete'))
})

test('CU-766: informal and other common frames reduce the title to its act', () => {
  for (const [name, title] of [
    ['Eliminar', '¿Estás seguro de que quieres eliminar este archivo?'],
    ['Eliminar', '¿De verdad quieres eliminar la carpeta?'],
    ['Supprimer', 'Es-tu sûr de vouloir supprimer ce fichier ?'],
    ['Supprimer', 'Veux-tu supprimer ce fichier ?'],
    ['Excluir', 'Tem certeza que deseja excluir este arquivo?'],
    ['Удалить', 'Ты уверен, что хочешь удалить этот файл?'],
    ['Eliminare', 'È sicuro di voler eliminare questo file?'],
  ]) {
    assert.ok(classes(onWeb(name, title)).includes('delete'), `web ${title}`)
    assert.ok(classes(onDesktop(name, title)).includes('delete'), `desktop ${title}`)
  }
})

test('CU-766: a harmless act under the same frames stays free', () => {
  for (const [name, title] of [
    ['Guardar', '¿Seguro que quieres guardar los cambios?'],
    ['Continuer', 'Veux-tu continuer ?'],
    ['Abrir', '¿Quieres abrir el archivo?'],
    ['Salvar', 'Tem certeza que deseja salvar as alterações?'],
  ]) {
    assert.deepEqual(classes(onWeb(name, title)), [], `web ${title}`)
    assert.deepEqual(classes(onDesktop(name, title)), [], `desktop ${title}`)
  }
})

test('CU-766 r2: a German passive question and a French "Faut-il" question read their act', () => {
  for (const [name, title] of [
    ['Leeren', 'Soll der Papierkorb jetzt wirklich geleert werden?'],
    ['Löschen', 'Soll diese Datei wirklich gelöscht werden?'],
    ['Vider', 'Faut-il vraiment vider la corbeille maintenant ?'],
    ['Supprimer', 'Doit-on supprimer ce dossier ?'],
  ]) {
    assert.ok(classes(onWeb(name, title)).includes('delete'), `web ${title}`)
    assert.ok(classes(onDesktop(name, title)).includes('delete'), `desktop ${title}`)
  }
  for (const [name, title] of [['Speichern', 'Soll das Dokument jetzt gespeichert werden?'], ['Continuer', 'Faut-il continuer maintenant ?'], ['Leeren', 'Soll der Papierkorb nicht geleert werden?'],
    // r3: emptying a search field or a cache is not a delete (cu-researcher's r2 over-asks).
    ['Leeren', 'Soll das Suchfeld geleert werden?'], ['Leeren', 'Muss der Cache geleert werden?']]) {
    assert.deepEqual(classes(onWeb(name, title)), [], `web ${title}`)
  }
})

test('CU-766 r3: a statement or a "kann ... werden" possibility states no pending act', () => {
  const desc = (name, dialogName, dialogDescription) => web.classify(click, { url: 'https://app.example/files', target: { role: 'button', name, dialogName, dialogDescription } })
  for (const d of ['Der Filter kann später entfernt werden.', 'Diese Dateien können jederzeit gelöscht werden.', 'Der Papierkorb muss nicht geleert werden.']) {
    assert.deepEqual(classes(desc('OK', 'Hinweis', d)), [], d)
  }
  assert.ok(classes(desc('OK', 'Hinweis', 'Die Datei wird gelöscht werden.')).includes('delete'))
})
