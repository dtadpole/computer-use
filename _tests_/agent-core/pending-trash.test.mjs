import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-780 + CU-781 (P1, one class: a localized trash / delete verb in a statement or question that announces a pending act).
// CU-780: a state passive ('... restlos geleert sein?') and an advisability frame ('¿Conviene vaciar ...?') under the bare verb.
// CU-781: a German pending statement before a generic OK ('Der Papierkorb wird jetzt geleert.'), whose English twin asks.
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-780-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
const store = createAppApprovals({ path: join(tmp, 'a.json') })
store.grantAlways(FIXTURE, { by: 'api' })
const desktop = createAppPolicy({ scope: [FIXTURE], approvals: store })
const web = createPolicy({ sitePolicy: () => 'allow' })
const click = { type: 'click', x: 1, y: 1, button: 'left' }
const classes = (v) => (v.decision === 'allow' ? [] : (v.classes ?? [v.class]))
const onWeb = (name, dialogName, dialogDescription) => web.classify(click, { url: 'https://app.example/files', target: { role: 'button', name, dialogName, ...(dialogDescription ? { dialogDescription } : {}) } })
const onDesktop = (name, dialogName, dialogDescription) => desktop.classify(click, { frontmostBundleId: FIXTURE, target: { origin: FIXTURE, role: 'AXButton', name, fingerprint: name, defaultButtonRead: true, dialogName, ...(dialogDescription ? { dialogDescription } : {}) } })

test('CU-780 / CU-781: the filed rows, verbatim, ask delete on both routes', () => {
  for (const [name, title, description] of [
    ['Leeren', 'Soll der Papierkorb restlos geleert sein?'],
    ['Vaciar', '¿Conviene vaciar la papelera de inmediato?'],
    ['OK', 'Der Papierkorb wird jetzt geleert.'],
    ['OK', 'Papierkorb', 'Der Papierkorb wird jetzt geleert.'],
  ]) {
    assert.ok(classes(onWeb(name, title, description)).includes('delete'), `web ${title} ${description ?? ''}`)
    assert.ok(classes(onDesktop(name, title, description)).includes('delete'), `desktop ${title} ${description ?? ''}`)
  }
})

test('CU-780 / CU-781: the class - other advisability frames, the other word order, another deletion object', () => {
  for (const [name, title, description] of [
    ['Vider', 'Convient-il de vider la corbeille tout de suite ?'],
    ['Svuota', 'È meglio svuotare il Cestino subito?'],
    ['Vaciar', '¿Es aconsejable vaciar la papelera ahora?'],
    ['Vider', 'Est-il conseillé de vider la corbeille maintenant ?'],
    // r2 (cu-researcher's r1 set): the conditional advisability family and the 'Ist ... geleert?' state passive.
    ['Leeren', 'Ist der Papierkorb danach vollständig geleert?'],
    ['Vaciar', '¿Sería bueno vaciar la papelera ya?'],
    ['Vider', 'Vaudrait-il mieux vider la corbeille ?'],
    ['Svuota', 'Sarebbe meglio svuotare il Cestino adesso?'],
    ['OK', 'Hinweis', 'Jetzt werden alle Elemente im Papierkorb geleert.'],
    ['OK', 'Hinweis', 'Der Posteingang wird sofort geleert.'],
    // r2 (cu-developer-two's named row): the future passive.
    ['OK', 'Hinweis', 'Der Papierkorb wird geleert werden.'],
  ]) {
    assert.ok(classes(onWeb(name, title, description)).includes('delete'), `web ${title} ${description ?? ''}`)
  }
})

test('CU-780 / CU-781: near rows stay free - a cache or a field, the past, a possibility, a negation, a harmless verb', () => {
  for (const [name, title, description] of [
    ['OK', 'Hinweis', 'Der Cache wird jetzt geleert.'],
    ['OK', 'Hinweis', 'Das Suchfeld wird geleert.'],
    ['OK', 'Hinweis', 'Der Papierkorb wurde geleert.'],
    ['OK', 'Hinweis', 'Der Papierkorb kann jederzeit geleert werden.'],
    ['OK', 'Hinweis', 'Der Papierkorb wird nicht geleert.'],
    ['OK', 'Hinweis', 'Die Elemente werden später geleert werden können.'],
    ['Guardar', '¿Conviene guardar los cambios de inmediato?'],
    ['Guardar', '¿Es aconsejable guardar los cambios ahora?'],
    ['Guardar', '¿Sería bueno guardar los cambios ya?'],
    ['Leeren', 'Ist der Cache danach vollständig geleert?'],
    ['Leeren', 'Soll der Cache restlos geleert sein?'],
    // tidied / moved / put away is no delete (also in the CU-777 question shape).
    ['OK', 'Hinweis', 'Der Ordner wird jetzt aufgeräumt.'],
    ['OK', 'Hinweis', 'Die Dateien werden umgeräumt.'],
    ['Aufräumen', 'Soll der Ordner aufgeräumt werden?'],
    ['Wegräumen', 'Sollen die Dateien weggeräumt werden?'],
  ]) {
    assert.ok(!classes(onWeb(name, title, description)).includes('delete'), `web ${title} ${description ?? ''}`)
  }
})
