import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-790 (P1; follow-up to CU-780 / CU-786): a trash state question in the dialog DESCRIPTION (the title a bare 'Hinweis' or
// 'Papierkorb'), and the other emptying participles ('leer geräumt', 'ausgeräumt'), under the bare verb 'Leeren'.
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-790-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
const store = createAppApprovals({ path: join(tmp, 'a.json') })
store.grantAlways(FIXTURE, { by: 'api' })
const desktop = createAppPolicy({ scope: [FIXTURE], approvals: store })
const web = createPolicy({ sitePolicy: () => 'allow' })
const click = { type: 'click', x: 1, y: 1, button: 'left' }
const classes = (v) => (v.decision === 'allow' ? [] : (v.classes ?? [v.class]))
const extra = (description) => (description ? { dialogDescription: description } : {})
const onWeb = (name, dialogName, description) => web.classify(click, { url: 'https://app.example/files', target: { role: 'button', name, dialogName, ...extra(description) } })
const onDesktop = (name, dialogName, description) => desktop.classify(click, { frontmostBundleId: FIXTURE, target: { origin: FIXTURE, role: 'AXButton', name, fingerprint: name, defaultButtonRead: true, dialogName, ...extra(description) } })

test('CU-790: the six filed rows, verbatim, ask delete on both routes', () => {
  for (const [name, title, description] of [
    ['Leeren', 'Hinweis', 'Ist der Papierkorb danach geleert?'],
    ['Leeren', 'Hinweis', 'Bleibt der Papierkorb danach geleert?'],
    ['Leeren', 'Papierkorb', 'Ist der Papierkorb danach ganz geleert?'],
    ['Leeren', 'Ist der Mülleimer anschließend leer geräumt?'],
    ['Leeren', 'Bleibt der Mülleimer anschließend leer geräumt?'],
    ['Leeren', 'Ist der Mülleimer danach ausgeräumt?'],
  ]) {
    assert.ok(classes(onWeb(name, title, description)).includes('delete'), `web ${title} ${description ?? ''}`)
    assert.ok(classes(onDesktop(name, title, description)).includes('delete'), `desktop ${title} ${description ?? ''}`)
  }
})

test('CU-790: the class - a description in other languages and shapes, the run-together participle, a statement', () => {
  for (const [name, title, description] of [
    ['Vaciar', 'Aviso', '¿La papelera queda vaciada después?'],
    ['Vider', 'Corbeille', 'La corbeille restera-t-elle vidée ?'],
    ['Leeren', 'Hinweis', 'Soll der Papierkorb jetzt geleert werden?'],
    ['Leeren', 'Wird der Mülleimer danach leergeräumt?'],
    ['OK', 'Hinweis', 'Der Mülleimer wird jetzt leer geräumt.'],
    // r2 (the one fold): cu-researcher's r1 misses - the EMPTY adjective with a state verb, everything removed from the trash -
    // and cu-developer-two's 'leer gemacht'.
    ['Vaciar', 'Aviso', '¿La papelera quedará vacía después?'],
    ['Svuota', 'Avviso', 'Il Cestino resterà vuoto dopo?'],
    ['Leeren', 'Papierkorb', 'Ist danach alles aus dem Papierkorb entfernt?'],
    ['Leeren', 'Mülleimer', 'Wird der Mülleimer danach komplett leer gemacht sein?'],
    ['Vider', 'Attention', 'La corbeille restera-t-elle vide ensuite ?'],
    // r3 (cu-researcher's two named r1 items, finished): the German empty adjective, everything removed from the trash in any
    // covered language.
    ['Leeren', 'Hinweis', 'Bleibt der Papierkorb danach leer?'],
    ['Vider', 'Attention', 'Tous les éléments seront-ils retirés de la corbeille ?'],
    ['Vaciar', 'Aviso', '¿Se quitarán todos los elementos de la papelera?'],
    ['Empty', 'Notice', 'Will everything be removed from the trash?'],
    ['Svuota', 'Avviso', 'Gli elementi saranno rimossi dal cestino?'],
  ]) {
    assert.ok(classes(onWeb(name, title, description)).includes('delete'), `web ${title} ${description ?? ''}`)
  }
})

test('CU-790: near rows stay free of delete - a field or cache, another button, tidied, a harmless description', () => {
  for (const [name, title, description] of [
    ['Leeren', 'Hinweis', 'Bleibt das Suchfeld danach geleert?'],
    ['Leeren', 'Hinweis', 'Bleibt der Cache danach geleert?'],
    ['Öffnen', 'Hinweis', 'Ist der Papierkorb danach geleert?'],
    ['Leeren', 'Ist der Ordner danach aufgeräumt?'],
    ['Speichern', 'Hinweis', 'Die Datei wird jetzt gespeichert.'],
    ['Leeren', 'Hinweis', 'Ist der Papierkorb nicht geleert?'],
    ['Vider', 'Attention', 'Le formulaire sera-t-il vidé ensuite ?'],
    ['Leeren', 'Hinweis', 'Ist das Eingabefeld danach entleert?'],
    ['Leeren', 'Hinweis', 'Wird das Suchfeld danach leer gemacht sein?'],
    ['Schließen', 'Hinweis', 'Der Papierkorb ist leer.'],
    ['Leeren', 'Hinweis', 'Der Papierkorb ist leer.'],
    ['Leeren', 'Hinweis', 'Alles wurde aus dem Papierkorb entfernt.'],
    ['Vider', 'Attention', 'Tous les éléments ont été retirés de la corbeille.'],
    ['Leeren', 'Hinweis', 'Bleibt das Suchfeld danach leer?'],
    ['Vider', 'Attention', 'Tous les filtres seront-ils retirés du formulaire ?'],
    ['OK', 'Notice', 'Item removed from the trash.'],
  ]) {
    assert.ok(!classes(onWeb(name, title, description)).includes('delete'), `web ${title} ${description ?? ''}`)
  }
})
