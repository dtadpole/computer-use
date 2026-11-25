import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-786 (P1; follow-up to CU-780): a localized trash verb under the trash's STATE asked through a state verb other than 'sein'
// ('Bleibt der Papierkorb danach ganz geleert?'), and under the 'worth' advisability family ('¿Valdría la pena vaciar ...?').
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-786-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
const store = createAppApprovals({ path: join(tmp, 'a.json') })
store.grantAlways(FIXTURE, { by: 'api' })
const desktop = createAppPolicy({ scope: [FIXTURE], approvals: store })
const web = createPolicy({ sitePolicy: () => 'allow' })
const click = { type: 'click', x: 1, y: 1, button: 'left' }
const classes = (v) => (v.decision === 'allow' ? [] : (v.classes ?? [v.class]))
const onWeb = (name, dialogName) => web.classify(click, { url: 'https://app.example/files', target: { role: 'button', name, dialogName } })
const onDesktop = (name, dialogName) => desktop.classify(click, { frontmostBundleId: FIXTURE, target: { origin: FIXTURE, role: 'AXButton', name, fingerprint: name, defaultButtonRead: true, dialogName } })

test('CU-786: the filed rows, verbatim, ask delete on both routes', () => {
  for (const [name, title] of [
    ['Leeren', 'Bleibt der Papierkorb danach ganz geleert?'],
    ['Vaciar', '¿Valdría la pena vaciar la papelera?'],
  ]) {
    assert.ok(classes(onWeb(name, title)).includes('delete'), `web ${title}`)
    assert.ok(classes(onDesktop(name, title)).includes('delete'), `desktop ${title}`)
  }
})

test('CU-786: the class - other state verbs and languages, the worth family in other languages', () => {
  for (const [name, title] of [
    ['Leeren', 'Gilt der Papierkorb danach als geleert?'],
    ['Leeren', 'Scheint der Papierkorb jetzt geleert zu sein?'],
    ['Vaciar', '¿La papelera queda vaciada del todo?'],
    ['Vider', 'La corbeille restera-t-elle vidée ?'],
    ['Svuota', 'Il Cestino rimane svuotato dopo?'],
    ['Esvaziar', 'A lixeira fica esvaziada depois?'],
    ['Legen', 'Blijft de prullenbak daarna geleegd?'],
    ['Vider', 'Vaudrait-il la peine de vider la corbeille maintenant ?'],
    ['Svuota', 'Varrebbe la pena svuotare il Cestino adesso?'],
    ['Esvaziar', 'Valeria a pena esvaziar a lixeira agora?'],
  ]) {
    assert.ok(classes(onWeb(name, title)).includes('delete'), `web ${title}`)
  }
})

test('CU-786: near rows stay free of delete - a cache or field, the past, a negation, a harmless verb', () => {
  for (const [name, title] of [
    ['Leeren', 'Bleibt der Cache danach ganz geleert?'],
    ['Leeren', 'Bleibt das Suchfeld geleert?'],
    ['Vaciar', '¿La papelera fue vaciada ayer?'],
    ['Vider', 'La corbeille a-t-elle été vidée ?'],
    ['Vaciar', '¿La papelera no queda vaciada?'],
    ['Guardar', '¿Valdría la pena guardar los cambios?'],
    ['Enregistrer', 'Vaudrait-il la peine de enregistrer le document ?'],
    ['Vaciar', '¿El formulario queda vaciado?'],
  ]) {
    assert.ok(!classes(onWeb(name, title)).includes('delete'), `web ${title}`)
  }
})
