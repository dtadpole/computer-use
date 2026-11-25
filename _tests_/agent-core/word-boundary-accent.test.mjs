import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-825 (P1 class; found in #1491 r2): under the u flag \b is ASCII-only, so a \b right after a final accented letter never
// matched - es singular future 'se eliminará' / 'se borrará', fr masculine 'supprimé' / 'effacé' (sweep table OK'd by cu-researcher 23:22Z).
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-825-'))
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


test('CU-825: the filed row, verbatim, asks delete on both routes', () => {
  asks([['Vaciar', 'Papelera', 'Se eliminará todo el contenido de forma permanente.']])
})

test('CU-825: the es singular future and the fr masculine participle read', () => {
  asks([
    ['Vaciar', 'Papelera', 'La papelera se borrará.'],
    ['Vider', 'Corbeille', 'Le dossier de la corbeille sera supprimé.'],
    ['Vider', 'Corbeille', 'Le fichier de la corbeille sera effacé.'],
  ])
})

test('CU-825: negated, past, past-event and conditional twins stay free', () => {
  free([
    ['Vaciar', 'Papelera', 'No se eliminará nada de la papelera.'],
    ['Vider', 'Corbeille', 'Le fichier de la corbeille ne sera pas supprimé.'],
    ['Vaciar', 'Papelera', 'Todo se eliminó de la papelera.'],
    ['Vider', 'Corbeille', 'Le fichier de la corbeille a été supprimé.'],
    ['Vaciar', 'Papelera', 'El contenido de la papelera se eliminó por error ayer.'],
    ['Vider', 'Corbeille', 'Le fichier de la corbeille a été supprimé par erreur hier.'],
    ['Vaciar', 'Papelera', 'Si se elimina el contenido de la papelera, no se podrá recuperar.'],
  ])
})
