import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-747 (High; cu-researcher's sweep 5): final-step controls (Finish / Complete / Next / End) and a bare verb that repeats its
// dialog title's verb ('Reset' under 'Reset this device to factory settings?', 'Empty' under 'Empty the Trash?') never read their
// risk dialog and acted unasked. Both now read the dialog as the generic confirms do (CU-507); a harmless dialog stays free.
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-747-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
const store = createAppApprovals({ path: join(tmp, 'a.json') })
store.grantAlways(FIXTURE, { by: 'api' })
const desktop = createAppPolicy({ scope: [FIXTURE], approvals: store })
const web = createPolicy({ sitePolicy: () => 'allow' })
const click = { type: 'click', x: 1, y: 1, button: 'left' }
const onWeb = (name, dialogName, dialogDescription = '') => web.classify(click, { url: 'https://app.example/settings', target: { role: 'button', name, dialogName, dialogDescription } })
const onDesktop = (name, dialogName, dialogDescription = '') => desktop.classify(click, { frontmostBundleId: FIXTURE, target: { origin: FIXTURE, role: 'AXButton', name, fingerprint: name, defaultButtonRead: true, dialogName, dialogDescription } })
const classes = (v) => (v.decision === 'allow' ? [] : (v.classes ?? [v.class]))

test('CU-747: final-step controls in a deletion or payment dialog ask its class, on the web and the desktop', () => {
  for (const [name, title, description, cls] of [
    ['Finish', 'Delete your account', 'Your account and all its data will be permanently deleted.', 'delete'],
    ['Complete', 'Delete workspace', 'This workspace and its files are deleted.', 'delete'],
    ['Next', 'Delete 12 photos?', 'These photos will be deleted from all your devices.', 'delete'],
    ['Finish', 'Confirm payment', 'Pay $49.00 to Example Store now.', 'purchase'],
    ['End', 'Erase all content and settings?', '', 'delete'],
  ]) {
    assert.ok(classes(onWeb(name, title, description)).includes(cls), `web ${name} / ${title}`)
    assert.ok(classes(onDesktop(name, title, description)).includes(cls), `desktop ${name} / ${title}`)
  }
})

test('CU-747: a bare verb that echoes the dialog title asks the title class', () => {
  for (const [name, title, cls] of [['Reset', 'Reset this device to factory settings?', 'delete'], ['Empty', 'Empty the Trash?', 'delete'], ['Erase', 'Erase this disk?', 'delete'], ['Reset now', 'Reset all settings and data?', 'delete']]) {
    assert.ok(classes(onWeb(name, title)).includes(cls), `web ${name} / ${title}`)
    assert.ok(classes(onDesktop(name, title)).includes(cls), `desktop ${name} / ${title}`)
  }
})

test('CU-747: harmless dialogs and non-echoing buttons stay free', () => {
  for (const [name, title, description] of [
    ['Finish', 'Setup complete', 'Your Mac is ready to use.'],
    ['Next', 'Welcome', 'Choose your country or region.'],
    ['Complete', 'Profile', 'Add a photo to complete your profile.'],
    ['Save', 'Save changes?', ''],
    ['Reset', 'Reset zoom level?', ''],
    ['Empty', 'Search results', 'No results found.'],
  ]) {
    assert.deepEqual(classes(onWeb(name, title, description)), [], `web ${name} / ${title}`)
  }
  // A final-step word outside any dialog stays as it was.
  assert.deepEqual(classes(web.classify(click, { url: 'https://app.example/onboarding', target: { role: 'button', name: 'Next' } })), [])
})

test('CU-747 r2: the localized bare verbs echo their trash title and ask delete, desktop and web', () => {
  for (const [name, title] of [['Vider', 'Vider la corbeille ?'], ['Leeren', 'Papierkorb leeren?'], ['空にする', 'ゴミ箱を空にしますか？'], ['倒空', '要倒空废纸篓吗？'], ['Vaciar', '¿Vaciar la papelera?'], ['Svuota', 'Vuoi svuotare il cestino?']]) {
    assert.ok(classes(onDesktop(name, title)).includes('delete'), `desktop ${name} / ${title}`)
    assert.ok(classes(onWeb(name, title)).includes('delete'), `web ${name} / ${title}`)
  }
})

test('CU-747 r2: a title that names a state is no act to echo', () => {
  assert.deepEqual(classes(onDesktop('Empty', 'Empty folder', 'This folder has no items.')), [])
  assert.deepEqual(classes(onWeb('Empty', 'Empty state', 'Nothing here yet.')), [])
})

