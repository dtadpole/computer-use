import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-777 (P1; cu-researcher's #1446 r2 set, a follow-up to CU-766): a localized bare verb acted unasked under an impersonal or
// modal frame ('Svuota' in 'Si deve proprio svuotare il Cestino?', 'Vaciar' in '¿Hay que vaciar la papelera ya?') or with a
// prefixed participle ('Entleeren' in '... entleert werden?'). The frames are removed whole; a prefixed participle echoes its verb.
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-777-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
const store = createAppApprovals({ path: join(tmp, 'a.json') })
store.grantAlways(FIXTURE, { by: 'api' })
const desktop = createAppPolicy({ scope: [FIXTURE], approvals: store })
const web = createPolicy({ sitePolicy: () => 'allow' })
const click = { type: 'click', x: 1, y: 1, button: 'left' }
const classes = (v) => (v.decision === 'allow' ? [] : (v.classes ?? [v.class]))
const onWeb = (name, dialogName) => web.classify(click, { url: 'https://app.example/files', target: { role: 'button', name, dialogName } })
const onDesktop = (name, dialogName) => desktop.classify(click, { frontmostBundleId: FIXTURE, target: { origin: FIXTURE, role: 'AXButton', name, fingerprint: name, defaultButtonRead: true, dialogName } })

test('CU-777: the filed rows ask delete on both routes', () => {
  for (const [name, title] of [['Svuota', 'Si deve proprio svuotare il Cestino?'], ['Vaciar', '¿Hay que vaciar la papelera ya?']]) {
    assert.ok(classes(onWeb(name, title)).includes('delete'), `web ${title}`)
    assert.ok(classes(onDesktop(name, title)).includes('delete'), `desktop ${title}`)
  }
})

test('CU-777: the class - impersonal / modal frames and prefixed participles', () => {
  for (const [name, title] of [
    ['Eliminare', 'Bisogna eliminare questi file?'],
    ['Eliminar', '¿Hay que eliminar estos archivos ya?'],
    ['Vider', 'Il faut vider la corbeille ?'],
    ['Entleeren', 'Soll der Papierkorb entleert werden?'],
    ['Ausleeren', 'Soll der Papierkorb jetzt ausgeleert werden?'],
  ]) {
    assert.ok(classes(onWeb(name, title)).includes('delete'), `web ${title}`)
    assert.ok(classes(onDesktop(name, title)).includes('delete'), `desktop ${title}`)
  }
})

test('CU-777: a harmless act under the same frames, and a cache, stay free', () => {
  for (const [name, title] of [['Guardar', '¿Hay que guardar los cambios ya?'], ['Salva', 'Si deve salvare il documento?'], ['Entleeren', 'Soll der Cache entleert werden?']]) {
    assert.deepEqual(classes(onWeb(name, title)), [], `web ${title}`)
  }
})
