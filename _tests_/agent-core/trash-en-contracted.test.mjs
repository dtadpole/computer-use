import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy, modalStatementNames } from '../../_tools_/agent-core/policy.mjs'

// CU-859 (under-ask): a contracted English pending auxiliary went free in a pending trash / delete statement while its full form
// asked - 'It will be deleted.' asked, "It'll be deleted.", "It’ll be deleted.", "They're going to be deleted." and "It's going to be
// deleted." did not. The marker table cu-researcher OK'd (held out) reads, through ONE set of shared English fragments in every
// English pending cell (EN_BE / EN_WILL / EN_WOULD / EN_GOING_TO / EN_ABOUT_TO in policy.mjs), with both apostrophes:
//   A. "'s / 're (just / now / right) about to be / get" as 'is / are about to ...' (and EN_IMMINENT_AUX alike);
//   B. "'ll" as 'will';
//   C. "'s / 're going to" as 'is / are going to';
//   D. "'d" as 'would' only before a bare 'be' ("'d been", "'d have been" stay as today).
// Never 've, 'm, "'s been", 'gonna', and no negated form. Rows use deleted / erased: a 'removed from the Trash' row asks in any tense
// through the trash-locative echo, so it shows nothing here.
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-859-'))
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

test("CU-859 A: 's / 're about to be / get asks as 'is / are about to' does, both apostrophes", () => {
  asks([
    ['Empty', 'Trash', "It's about to be deleted."],
    ['Empty', 'Trash', 'It’s about to be deleted.'],
    ['Empty', 'Trash', 'It is about to be deleted.'],
    ['Empty', 'Trash', "They're about to be erased."],
    ['Empty', 'Trash', 'They’re about to be erased.'],
    ['Empty', 'Trash', 'They are about to be erased.'],
    ['Empty', 'Trash', "The file's just about to be deleted."],
    ['Empty', 'Trash', 'The file is just about to be deleted.'],
    ['Empty', 'Trash', "These items're about to get deleted."],
    ['Empty', 'Trash', 'These items are about to get deleted.'],
    // the same 's / 're before the other imminent auxiliary of EN_IMMINENT_AUX
    ['Empty', 'Trash', "It's on the verge of being deleted."],
    ['Empty', 'Trash', 'It is on the verge of being deleted.'],
  ])
})

test("CU-859 B: 'll asks as 'will' does, both apostrophes, after a pronoun or a subject noun", () => {
  asks([
    ['Empty', 'Trash', "It'll be deleted."],
    ['Empty', 'Trash', 'It’ll be deleted.'],
    ['Empty', 'Trash', 'It will be deleted.'],
    ['Empty', 'Trash', "They'll be permanently erased."],
    ['Empty', 'Trash', 'They’ll be permanently erased.'],
    ['Empty', 'Trash', 'They will be permanently erased.'],
    ['Empty', 'Trash', "She says all items'll be erased."],
    ['Empty', 'Trash', 'She says all items will be erased.'],
    ['Empty', 'Trash', "He knows your files'll be deleted."],
    ['Empty', 'Trash', 'He knows your files will be deleted.'],
    ['Empty', 'Trash', "Your files'll be deleted."],
    ['Empty', 'Trash', 'Your files’ll be deleted.'],
    ['Empty', 'Trash', 'Your files will be deleted.'],
  ])
})

test("CU-859 B: the emptying verb after 'll asks as after 'will' (TRASH_PENDING_AUX)", () => {
  asks([
    ['Empty', 'Trash', "It'll be emptied."],
    ['Empty', 'Trash', 'It’ll be emptied.'],
    ['Empty', 'Trash', 'It will be emptied.'],
    ['Empty', 'Trash', "They'll be emptied now."],
    ['Empty', 'Trash', 'They will be emptied now.'],
  ])
  // 'would' was never an emptying auxiliary, so neither is its 'd.
  free([
    ['Empty', 'Trash', 'It would be emptied.'],
    ['Empty', 'Trash', "It'd be emptied."],
  ])
})

test("CU-859 C: 's / 're going to asks as 'is / are going to' does, both apostrophes", () => {
  asks([
    ['Empty', 'Trash', "It's going to be deleted."],
    ['Empty', 'Trash', 'It’s going to be deleted.'],
    ['Empty', 'Trash', 'It is going to be deleted.'],
    ['Empty', 'Trash', "They're going to be deleted."],
    ['Empty', 'Trash', 'They’re going to be deleted.'],
    ['Empty', 'Trash', 'They are going to be deleted.'],
    ['Empty', 'Trash', "These items're going to be erased."],
    ['Empty', 'Trash', 'These items are going to be erased.'],
    ['Empty', 'Trash', "The file's going to be permanently deleted."],
    ['Empty', 'Trash', 'The file is going to be permanently deleted.'],
  ])
})

test("CU-859 D: 'd before a bare 'be' asks as 'would be' does, both apostrophes", () => {
  asks([
    ['Empty', 'Trash', "It'd be deleted."],
    ['Empty', 'Trash', 'It’d be deleted.'],
    ['Empty', 'Trash', 'It would be deleted.'],
    ['Empty', 'Trash', "They'd be permanently erased."],
    ['Empty', 'Trash', 'They would be permanently erased.'],
  ])
})

test("CU-859: 've, 'm, 's been, 'd been, 'd have been, 'd better and 'gonna' are no markers and stay free", () => {
  free([
    ['Empty', 'Trash', "They've been deleted."],
    ['Empty', 'Trash', 'They’ve been erased.'],
    ['Empty', 'Trash', 'They have been deleted.'],
    ['Empty', 'Trash', "I'm going to delete all items."],
    ['Empty', 'Trash', 'I am going to delete all items.'],
    ['Empty', 'Trash', "It's been deleted."],
    ['Empty', 'Trash', 'It’s been erased.'],
    ['Empty', 'Trash', 'It has been deleted.'],
    ['Empty', 'Trash', "It'd been deleted."],
    ['Empty', 'Trash', 'It’d been erased.'],
    ['Empty', 'Trash', 'It had been deleted.'],
    // the table keeps "'d have been" as it was ('would have been' asks only because the bare 'would' is a marker)
    ['Empty', 'Trash', "It'd have been deleted."],
    ['Empty', 'Trash', 'It’d have been erased.'],
    // 'd + 'better' is 'had better': no bare 'be' follows the clitic
    ['Empty', 'Trash', "It'd better be deleted."],
    ['Empty', 'Trash', 'It had better be deleted.'],
    ['Empty', 'Trash', "It's gonna be deleted."],
    ['Empty', 'Trash', 'They’re gonna be erased.'],
  ])
})

test('CU-859: the negated contractions stay free, as their full-form twins do', () => {
  free([
    ['Empty', 'Trash', "It won't be deleted."],
    ['Empty', 'Trash', 'It won’t be erased.'],
    ['Empty', 'Trash', 'It will not be deleted.'],
    ['Empty', 'Trash', "It'll not be deleted."],
    ['Empty', 'Trash', 'It’ll never be erased.'],
    ['Empty', 'Trash', 'It will never be erased.'],
    ['Empty', 'Trash', "It isn't going to be deleted."],
    ['Empty', 'Trash', "It's not going to be deleted."],
    ['Empty', 'Trash', 'It is not going to be deleted.'],
    ['Empty', 'Trash', "They aren't about to be deleted."],
    ['Empty', 'Trash', 'They’re not about to be erased.'],
    ['Empty', 'Trash', 'They are not about to be erased.'],
    ['Empty', 'Trash', "It wouldn't be deleted."],
    ['Empty', 'Trash', "It'd not be deleted."],
    ['Empty', 'Trash', 'It would not be deleted.'],
    // a negation the four-word window reads before the clitic frees it as before the full word
    ['Empty', 'Trash', "No items'll be deleted."],
    ['Empty', 'Trash', 'No items will be deleted.'],
    ['Empty', 'Trash', "No items're about to be deleted."],
    ['Empty', 'Trash', 'No items are about to be deleted.'],
  ])
  // The window does not reach a 'No' before 'is / are going to be' (four words) - 'No file is going to be erased.' asks already on
  // the CU-852 head - so the contracted twin is pinned only to behave as its full form does.
  for (const [n, t, a, b] of [['Empty', 'Trash', "No file's going to be erased.", 'No file is going to be erased.'], ['Empty', 'Trash', "No items're going to be deleted.", 'No items are going to be deleted.']]) {
    assert.equal(classes(onWeb(n, t, a)).includes('delete'), classes(onWeb(n, t, b)).includes('delete'), `web ${a} / ${b}`)
    assert.equal(classes(onDesktop(n, t, a)).includes('delete'), classes(onDesktop(n, t, b)).includes('delete'), `desktop ${a} / ${b}`)
  }
})

test("CU-859: a modal title states its act through the contraction (MODAL_FUTURE / MODAL_GONE / MODAL_LEAD)", () => {
  asks([
    ['OK', "Your account'll be deleted."],
    ['OK', 'Your account’ll be deleted.'],
    ['OK', 'Your account will be deleted.'],
    ['Continue', "Your files're going to be erased."],
    ['Continue', 'Your files are going to be erased.'],
  ])
  assert.ok(modalStatementNames("Your account'll be deleted").includes('Delete Your account'))
  assert.ok(modalStatementNames('Your account’ll be deleted').includes('Delete Your account'))
  assert.ok(modalStatementNames("Your files're going to be erased").includes('Erase Your files'))
  assert.ok(modalStatementNames('Your project’s going to be deleted').includes('Delete Your project'))
  assert.ok(modalStatementNames("Your data'd be erased").includes('Erase Your data'))
  assert.ok(modalStatementNames("Your data'll be gone").includes('Delete Your data'))
  assert.ok(modalStatementNames("Once you confirm, your data'll be lost").includes('Delete your data'))
  assert.ok(modalStatementNames("This'll permanently erase the volume").includes('Erase the volume'))
  assert.ok(modalStatementNames('It’ll erase every device').includes('Erase every device'))
  // the full forms read as before
  assert.ok(modalStatementNames('Your account will be deleted').includes('Delete Your account'))
  assert.ok(modalStatementNames('This will permanently erase the volume').includes('Erase the volume'))
  // no act: the past perfect, the present perfect, 'gonna', a full word glued to its subject
  assert.deepEqual(modalStatementNames("Your account'd been deleted"), [])
  assert.deepEqual(modalStatementNames("Your account's been deleted"), [])
  assert.deepEqual(modalStatementNames("Your account's gonna be deleted"), [])
  assert.deepEqual(modalStatementNames('Your accountwill be deleted'), [])
})

test("CU-859 fold: the description lead-in 'You’re about to' is stripped with the curly apostrophe as with the straight one", () => {
  asks([
    ['OK', 'Warning', 'You’re about to reset this device.'],
    ['OK', 'Warning', "You're about to reset this device."],
    ['OK', 'Warning', 'You are about to reset this device.'],
  ])
})
