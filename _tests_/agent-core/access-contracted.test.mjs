import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy, modalStatementNames } from '../../_tools_/agent-core/policy.mjs'

// CU-876 (under-ask): the access statement (MODAL_ACCESS in policy.mjs) read only whole-word auxiliaries, so a contraction attached
// to the subject went free while its full form asked 'Grant access' - 'They will be able to read your files.' asked, "They'll be
// able to read your files." and "The app'd like access to your contacts." did not. The marker table cu-researcher OK'd (held out)
// reads, through the shared English fragments of CU-859, with both apostrophes:
//   A. the 'will' before 'be able to <access verb>' as EN_WILL ('ll as 'will');
//   B. the request's 'would like' as EN_WOULD_LIKE ('d as 'would' only directly before 'like').
// Unchanged: 'is going to be able to' (never read), negated forms, the access-verb list and the gives / grants / allows arm.
// Each row is pressed on the web and the desktop route, as the generic confirm 'OK' and as the access button 'Allow'.
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-876-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
const store = createAppApprovals({ path: join(tmp, 'a.json') })
store.grantAlways(FIXTURE, { by: 'api' })
const desktop = createAppPolicy({ scope: [FIXTURE], approvals: store })
const web = createPolicy({ sitePolicy: () => 'allow' })
const click = { type: 'click', x: 1, y: 1, button: 'left' }
const classes = (v) => (v.decision === 'allow' ? [] : (v.classes ?? [v.class]))
const onWeb = (name, dialogName, description) => web.classify(click, { url: 'https://app.example/connect', target: { role: 'button', name, dialogName, ...(description ? { dialogDescription: description } : {}) } })
const onDesktop = (name, dialogName, description) => desktop.classify(click, { frontmostBundleId: FIXTURE, target: { origin: FIXTURE, role: 'AXButton', name, fingerprint: name, defaultButtonRead: true, dialogName, ...(description ? { dialogDescription: description } : {}) } })
const BUTTONS = ['OK', 'Allow']
// asks: 'Grant access' is read from the sentence, and both buttons ask permission on both routes, with the sentence as the
// description and as the title.
const asks = (sentences) => {
  for (const s of sentences) {
    assert.ok(modalStatementNames(s).includes('Grant access'), `names ${s}`)
    for (const n of BUTTONS) {
      assert.ok(classes(onWeb(n, 'Connect', s)).includes('permission'), `web ${n} | Connect | ${s}`)
      assert.ok(classes(onDesktop(n, 'Connect', s)).includes('permission'), `desktop ${n} | Connect | ${s}`)
      assert.ok(classes(onWeb(n, s)).includes('permission'), `web ${n} | ${s}`)
      assert.ok(classes(onDesktop(n, s)).includes('permission'), `desktop ${n} | ${s}`)
    }
  }
}
// free: no 'Grant access' is read, and 'Allow' (which asks only when access is stated) stays free on both routes.
const free = (sentences) => {
  for (const s of sentences) {
    assert.ok(!modalStatementNames(s).includes('Grant access'), `names ${s}`)
    assert.deepEqual(classes(onWeb('Allow', 'Connect', s)), [], `web Allow | Connect | ${s}`)
    assert.deepEqual(classes(onDesktop('Allow', 'Connect', s)), [], `desktop Allow | Connect | ${s}`)
  }
}
// twins: a contracted form and its full form get the same classes, every button, both routes.
const twins = (pairs) => {
  for (const [a, b] of pairs) {
    for (const n of BUTTONS) {
      assert.deepEqual(classes(onWeb(n, 'Connect', a)).sort(), classes(onWeb(n, 'Connect', b)).sort(), `web ${n} | ${a} / ${b}`)
      assert.deepEqual(classes(onDesktop(n, 'Connect', a)).sort(), classes(onDesktop(n, 'Connect', b)).sort(), `desktop ${n} | ${a} / ${b}`)
    }
  }
}

test("CU-876 A: 'll before 'be able to <access verb>' asks Grant access as 'will' does, both apostrophes", () => {
  asks([
    "They'll be able to read your files.",
    'They’ll be able to read your files.',
    "It'll be able to see your location.",
    'It’ll be able to see your location.',
    "Example app'll be able to control this computer.",
    'Example app’ll be able to control this computer.',
    "The extension'll be able to change your settings.",
    'The extension’ll be able to change your settings.',
    "She'll be able to edit your documents.",
    "Your team'll be able to post as you.",
    'Anyone’ll be able to view this repository.',
    "It'll be able to manage your calendar.",
    'It’ll be able to delete your messages.',
    "They'll be able to access your photos.",
  ])
})

test("CU-876 A: the full twins ask as before", () => {
  asks([
    'They will be able to read your files.',
    'It will be able to see your location.',
    'Example app will be able to control this computer.',
    'The extension will be able to change your settings.',
    'She will be able to edit your documents.',
    'Your team will be able to post as you.',
    'Anyone will be able to view this repository.',
    'It will be able to manage your calendar.',
    'It will be able to delete your messages.',
    'They will be able to access your photos.',
  ])
})

test("CU-876 B: 'd directly before 'like' asks Grant access as 'would like' does, both apostrophes", () => {
  asks([
    "The app'd like access to your contacts.",
    'The app’d like access to your contacts.',
    "Maps'd like to access your location.",
    'Maps’d like to access your location.',
    "We'd like full access to your calendar.",
    'We’d like access to your photos.',
    "Example'd like to access your microphone.",
  ])
  // the full twins ask as before
  asks([
    'The app would like access to your contacts.',
    'Maps would like to access your location.',
    'We would like full access to your calendar.',
    'We would like access to your photos.',
    'Example would like to access your microphone.',
  ])
})

test("CU-876: what stays as today - 'is going to be able to', negations, 'd been / 'd have / 'd be, a non-access verb", () => {
  free([
    // 'is going to be able to' was never read, in either form
    "It's going to be able to read your files.",
    'It’s going to be able to read your files.',
    'It is going to be able to read your files.',
    // negated forms, contracted and full
    "They won't be able to read your files.",
    'They won’t be able to read your files.',
    'They will not be able to read your files.',
    "They'll not be able to read your files.",
    'They’ll not be able to read your files.',
    "The app wouldn't like access.",
    'The app would not like access.',
    "The app'd not like access.",
    // 'd before anything but 'like' is no request and no 'will'
    "They'd been able to read your files.",
    'They’d been able to read your files.',
    "They'd have access to your files.",
    "The app'd have liked access to your contacts.",
    "They'd be able to read your files.",
    'They would be able to read your files.',
    "The app'd love access to your contacts.",
    "The app'd likely need access.",
    'The app would likely need access.',
    // a clitic before 'be able to' and a verb outside the access list
    "They'll be able to print the page.",
    'They’ll be able to print the page.',
    'They will be able to print the page.',
    "It'll be able to sync later.",
    // a full word glued to its subject
    'Your appwill be able to read your files.',
  ])
})

test('CU-876: a contracted form and its full form get the same classes (asks and frees alike)', () => {
  twins([
    ["They'll be able to read your files.", 'They will be able to read your files.'],
    ['It’ll be able to see your location.', 'It will be able to see your location.'],
    ["The app'd like access to your contacts.", 'The app would like access to your contacts.'],
    ['Maps’d like to access your location.', 'Maps would like to access your location.'],
    ["They won't be able to read your files.", 'They will not be able to read your files.'],
    ["They'll not be able to read your files.", 'They will not be able to read your files.'],
    ["The app wouldn't like access to your contacts.", 'The app would not like access to your contacts.'],
    ["The app'd not like access to your contacts.", 'The app would not like access to your contacts.'],
    ["They'll be able to print the page.", 'They will be able to print the page.'],
    ["It's going to be able to read your files.", 'It is going to be able to read your files.'],
  ])
})

test('CU-876: a statement about not confirming still describes the other button (CU-757)', () => {
  assert.deepEqual(classes(onWeb('Allow', 'Keep this layout?', "If you cancel, the app'll be able to read your old settings.")), [])
  assert.deepEqual(classes(onWeb('Allow', 'Keep this layout?', 'If you cancel, the app will be able to read your old settings.')), [])
})
