import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-829 (P1; cu-developer-two's #1499 note): a title naming the trash lends it only to sentences with an item noun, and the
// content noun of most covered languages was missing - 'Vider' | 'Corbeille' | 'Le contenu sera supprimé.' acted unasked.
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-829-'))
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


test('CU-829: the filed row, verbatim, asks delete on both routes', () => {
  asks([['Vider', 'Corbeille', 'Le contenu sera supprimé.']])
})

test('CU-829: the content noun lends the title\'s trash in es / it / de', () => {
  asks([
    ['Vaciar', 'Papelera', 'El contenido se eliminará.'],
    ['Svuota', 'Cestino', 'Il contenuto verrà eliminato.'],
    ['Leeren', 'Papierkorb', 'Der Inhalt wird endgültig gelöscht.'],
  ])
})

test('CU-829: negated, past, past-event, no-trash-title, wrong-button and a common-word sentence stay free', () => {
  free([
    ['Vider', 'Corbeille', 'Le contenu ne sera pas supprimé.'],
    ['Vider', 'Corbeille', 'Le contenu a été supprimé.'],
    ['Vider', 'Corbeille', 'Le contenu a été supprimé par erreur hier.'],
    ['Leeren', 'Papierkorb', 'Der Inhalt wurde gestern versehentlich gelöscht.'],
    ['Vider', 'Notification', 'Le contenu sera supprimé.'],
    ['Annuler', 'Corbeille', 'Le contenu sera supprimé.'],
    // cu-researcher's over-ask check: the common ko 내용 (a description) stays out of the list.
    ['비우기', '휴지통', '이 작업의 내용 설명이 삭제됩니다.'],
  ])
})
