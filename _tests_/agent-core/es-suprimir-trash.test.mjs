import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-821 (reopened by cu-verifier 00:07Z): the es verb suprimir was missing from every es future shape eliminar / borrar have -
// 'Los elementos se suprimirán de forma permanente.' acted unasked (table OK'd by cu-researcher 00:43Z).
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-821-'))
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


test('CU-821: cu-verifier\'s row, verbatim, asks delete on both routes', () => {
  asks([['Vaciar', 'Papelera', 'Los elementos se suprimirán de forma permanente.']])
})

test('CU-821: suprimir in the reflexive future and in ser + participle asks', () => {
  asks([
    ['Vaciar', 'Papelera', 'La papelera se suprimirá.'],
    ['Vaciar', 'Papelera', 'Los elementos de la papelera serán suprimidos.'],
  ])
})

test('CU-821: negated, past, past-event and conditional twins stay free', () => {
  free([
    ['Vaciar', 'Papelera', 'Los elementos no se suprimirán.'],
    ['Vaciar', 'Papelera', 'Los elementos se suprimieron.'],
    ['Vaciar', 'Papelera', 'Los elementos fueron suprimidos.'],
    ['Vaciar', 'Papelera', 'Algunos elementos se suprimieron por error ayer.'],
    ['Vaciar', 'Papelera', 'Si se suprimen los elementos, no se podrán recuperar.'],
  ])
})
