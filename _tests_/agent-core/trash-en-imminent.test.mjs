import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-852 (P1; under-ask): an English pending trash statement whose auxiliary is imminent - 'is / are about to be' + a covered
// delete participle ('All items are about to be deleted.') - went free under the emptying button while its 'will' twin asked.
// The table cu-researcher OK'd (r1 + r2, 01:15Z) adds 'is / are (just / now / right) about to be / get' and 'is / are on the
// point / verge of being' where CU-823 put 'is / are going to': the pending cell and the trash-locative cell. 'was / were' get no slot.
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-852-'))
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

test('CU-852: every imminent row of the table asks delete on both routes, each beside its \'will\' twin', () => {
  asks([
    // r1: 'is / are about to be / get'
    ['Empty', 'Trash', 'All items are about to be deleted.'],
    ['Empty', 'Trash', 'All items will be deleted.'],
    ['Empty', 'Trash', 'The file is about to be erased.'],
    ['Empty', 'Trash', 'The file will be erased.'],
    ['Empty', 'Trash', 'The items in the Trash are about to be permanently deleted.'],
    ['Empty', 'Trash', 'The items in the Trash will be permanently deleted.'],
    ['Empty', 'Trash', 'The file is about to be permanently removed.'],
    ['Empty', 'Trash', 'The file will be permanently removed.'],
    // the trash-locative cell only: 'purged' is no participle of the pending cell
    ['Empty', 'Trash', 'All items are about to be purged from the trash.'],
    ['Empty', 'Trash', 'All items will be purged from the trash.'],
    ['Empty', 'Trash', 'All files are about to be removed from your Trash.'],
    ['Empty', 'Trash', 'All files will be removed from your Trash.'],
    ['Empty', 'Trash', 'Everything in the bin is about to be destroyed forever.'],
    ['Empty', 'Trash', 'Everything in the bin will be destroyed forever.'],
    ['Empty', 'Trash', 'All items are about to get deleted.'],
    ['Empty', 'Trash', 'All items will get deleted.'],
    // r2: an optional just / now / right, and 'on the point / verge of being'
    ['Empty', 'Trash', 'The file is just about to be deleted.'],
    ['Empty', 'Trash', 'The file will be deleted.'],
    ['Empty', 'Trash', 'All items in the Trash are now about to be erased.'],
    ['Empty', 'Trash', 'All items in the Trash will now be erased.'],
    ['Empty', 'Trash', 'The items in the Trash are on the point of being permanently deleted.'],
    ['Empty', 'Trash', 'The items in the Trash will be permanently deleted.'],
    ['Empty', 'Trash', 'All files are on the verge of being removed from your Trash.'],
    ['Empty', 'Trash', 'All files will be removed from your Trash.'],
    ['Empty', 'Trash', 'The file is on the verge of being destroyed.'],
    ['Empty', 'Trash', 'The file will be destroyed.'],
    ['Empty', 'Trash', 'The items are right about to get deleted.'],
    ['Empty', 'Trash', 'The items will get deleted.'],
  ])
})

// The two locative past twins of the table ('All items were purged from the trash.', 'All files were on the verge of being
// removed from your Trash.') already ask on main through the trash-locative echo whatever the tense (CU-848's over-ask), so
// they are not pinned free here (test1 03:05Z: both ask on main and on the build alike).
test('CU-852: the negated, past-imminent, past-event, restored and non-trash twins stay free', () => {
  free([
    // r1
    ['Empty', 'Trash', 'All items are not about to be deleted.'],
    ['Empty', 'Trash', "All items aren't about to be deleted."],
    ['Empty', 'Trash', 'All items were about to be deleted.'],
    ['Empty', 'Trash', 'The file was about to be erased.'],
    ['Empty', 'Trash', 'All items were deleted.'],
    ['Empty', 'Trash', 'All items are about to be restored.'],
    ['Empty', 'Notes', 'All notes are about to be deleted.'],
    // r2
    ['Empty', 'Trash', 'The items are not on the verge of being deleted.'],
    ['Empty', 'Trash', 'The file is not just about to be deleted.'],
    ['Empty', 'Trash', 'The file was just about to be deleted.'],
    ['Empty', 'Trash', 'The items were on the point of being deleted.'],
    ['Empty', 'Trash', 'The items are on the verge of being restored.'],
    ['Empty', 'Notes', 'All notes are on the point of being deleted.'],
  ])
})

// 'The Trash is about to be emptied.' (Q4, the emptying verb) sits in no list: like every English 'Empty' row whose sentence
// carries a determiner and the emptying verb, it reaches the description-verb echo already on main (emptied-trash.test.mjs).
test('CU-852: out of scope stays free - a contraction, the active voice, another auxiliary', () => {
  free([
    ['Empty', 'Trash', "It's about to be deleted."],
    ['Empty', 'Trash', 'You are about to permanently delete the items in the Trash.'],
    ['Empty', 'Trash', 'All items are set to be deleted.'],
  ])
})
