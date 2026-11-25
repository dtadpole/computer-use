import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-804 (P1; follow-up to CU-800, widened by cu-coordinator 09:39Z): a bare emptying verb ('Empty', 'Leegmaken') under a dialog
// that asks to permanently DELETE the items in the trash - in the title or the description, a verb the button does not echo -
// acts unasked, in English too.
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-804-'))
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

test('CU-804: the filed rows, verbatim, ask delete on both routes', () => {
  for (const [name, title, description] of [
    ['Leegmaken', 'Prullenmand', 'Weet u zeker dat u de onderdelen in de prullenmand permanent wilt verwijderen?'],
    ['Empty', 'Trash', 'Are you sure you want to permanently delete the items in the Trash?'],
    ['Empty', 'Are you sure you want to permanently delete the items in the Trash?'],
  ]) {
    assert.ok(classes(onWeb(name, title, description)).includes('delete'), `web ${name} | ${title} | ${description ?? ''}`)
    assert.ok(classes(onDesktop(name, title, description)).includes('delete'), `desktop ${name} | ${title} | ${description ?? ''}`)
  }
})

test('CU-804: the class - other covered languages, title or description, a pending statement', () => {
  for (const [name, title, description] of [
    ['Leeren', 'Papierkorb', 'Möchten Sie die Objekte im Papierkorb wirklich endgültig löschen?'],
    ['Vider', 'Corbeille', 'Voulez-vous vraiment supprimer définitivement les éléments de la corbeille ?'],
    ['Vaciar', '¿Seguro que quieres eliminar definitivamente los elementos de la papelera?'],
    ['Svuota', 'Cestino', 'Vuoi eliminare definitivamente gli elementi nel cestino?'],
    ['Legen', 'Weet je zeker dat je de items in de prullenbak wilt verwijderen?'],
    ['Empty', 'Trash', 'All items in the Trash will be permanently erased.'],
  ]) {
    assert.ok(classes(onWeb(name, title, description)).includes('delete'), `web ${name} | ${title} | ${description ?? ''}`)
  }
})

test('CU-804: near rows stay free of delete - another button, no trash, the past, a negation', () => {
  for (const [name, title, description] of [
    ['Open', 'Trash', 'Are you sure you want to permanently delete the items in the Trash?'],
    ['Empty', 'Search', 'Are you sure you want to permanently delete your search history?'],
    ['Empty', 'Trash', 'The items in the Trash were deleted.'],
    ['Empty', 'Trash', 'The items in the Trash will not be deleted.'],
  ]) {
    assert.ok(!classes(onWeb(name, title, description)).includes('delete'), `web ${name} | ${title} | ${description ?? ''}`)
  }
})
