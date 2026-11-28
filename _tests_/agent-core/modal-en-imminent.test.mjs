import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy, modalStatementNames } from '../../_tools_/agent-core/policy.mjs'
// CU-861 (under-ask, found in the CU-852 table): MODAL_FUTURE read 'will / would / is going to be' + a participle but not the
// imminent passive, so 'OK' | 'Account' | 'Your account is about to be deleted.' went free while its 'going to' and 'will' twins
// asked. The table cu-researcher OK'd (r1.1, 11:03Z 28 Nov; policy owner concur 10:50Z) adds EN_ABOUT_TO_BE ('is / are (just /
// now / right) about to be', 'on the point / verge of being', with the 's / 're clitics) as one more auxiliary slot, and every
// auxiliary match is read: the first whose participle is a risk verb names the act. Each row is pressed on both routes.
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-861-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
const store = createAppApprovals({ path: join(tmp, 'a.json') })
store.grantAlways(FIXTURE, { by: 'api' })
const desktop = createAppPolicy({ scope: [FIXTURE], approvals: store })
const web = createPolicy({ sitePolicy: () => 'allow' })
const click = { type: 'click', x: 1, y: 1, button: 'left' }
const classes = (v) => (v.decision === 'allow' ? [] : (v.classes ?? [v.class]))
const onWeb = (name, dialogName, description) => web.classify(click, { url: 'https://app.example/files', target: { role: 'button', name, dialogName, ...(description ? { dialogDescription: description } : {}) } })
const onDesktop = (name, dialogName, description) => desktop.classify(click, { frontmostBundleId: FIXTURE, target: { origin: FIXTURE, role: 'AXButton', name, fingerprint: name, defaultButtonRead: true, dialogName, ...(description ? { dialogDescription: description } : {}) } })
const both = (n, t, d) => [classes(onWeb(n, t, d)).sort(), classes(onDesktop(n, t, d)).sort()]
const label = (n, t, d) => `${n} | ${t} | ${d ?? ''}`
// each row asks, on both routes, exactly the classes its twin (which asks on main) asks
const twin = (pairs, cls) => {
  for (const [n, t, d, nt, tt, dt] of pairs) {
    const [w, k] = both(n, t, d)
    const [tw, tk] = both(nt ?? n, tt ?? t, dt)
    assert.ok(tw.length > 0, `twin asks: ${label(nt ?? n, tt ?? t, dt)}`)
    assert.deepEqual(w, tw, `web ${label(n, t, d)}`)
    assert.deepEqual(k, tk, `desktop ${label(n, t, d)}`)
    if (cls) assert.ok(w.includes(cls) && k.includes(cls), `${cls}: ${label(n, t, d)}`)
  }
}
// each row's classes equal its twin's on both routes (asked or not)
const parity = (pairs) => {
  for (const [n, t, d, dt] of pairs) {
    assert.deepEqual(both(n, t, d), both(n, t, dt), `parity ${label(n, t, d)} ~ ${dt}`)
  }
}
const free = (rows) => {
  for (const [n, t, d] of rows) {
    const [w, k] = both(n, t, d)
    assert.ok(!w.includes('delete') && !k.includes('delete'), `free ${label(n, t, d)}`)
  }
}

test('CU-861: the filed row asks delete in the neutral frames, beside its going-to and will twins', () => {
  twin([
    ['OK', 'Account', 'Your account is about to be deleted.', 'OK', 'Account', 'Your account is going to be deleted.'],
    ['OK', 'Notice', 'Your account is about to be deleted.', 'OK', 'Notice', 'Your account will be deleted.'],
  ], 'delete')
})

test('CU-861: A / B - the imminent passive asks as its going-to twin does', () => {
  twin([
    ['OK', 'Notice', 'Your account is about to be permanently deleted.', 'OK', 'Notice', 'Your account is going to be permanently deleted.'],
    ['OK', 'Account', 'Your account and all its data are about to be deleted.', 'OK', 'Account', 'Your account and all its data are going to be deleted.'],
    ['OK', "Your account's about to be deleted.", undefined, 'OK', "Your account's going to be deleted."],
    ['Continue', 'Notice', 'Your files’re about to be erased.', 'Continue', 'Notice', 'Your files’re going to be erased.'],
    ['Yes', 'Notice', 'The repository is just about to be erased.', 'Yes', 'Notice', 'The repository is going to be erased.'],
    ['OK', 'Account', 'Your account is on the verge of being deleted.', 'OK', 'Account', 'Your account is going to be deleted.'],
    ['Continue', 'Notice', 'The repository is on the point of being erased.', 'Continue', 'Notice', 'The repository will be erased.'],
    ['OK', 'Notice', 'Your files are right on the verge of being erased.', 'OK', 'Notice', 'Your files are going to be erased.'],
    ['OK', 'Notice', 'Once you confirm, your account is about to be deleted.', 'OK', 'Notice', 'Once you confirm, your account is going to be deleted.'],
  ], 'delete')
  // other risk acts ask exactly as their going-to twins do (the table's transfer row and the policy owner's session notice)
  parity([
    ['Continue', 'Notice', 'The workspace is about to be transferred to another account.', 'The workspace is going to be transferred to another account.'],
    ['Continue', 'Session timeout', 'Your session is about to be terminated.', 'Your session is going to be terminated.'],
  ])
})

test('CU-861: every auxiliary match is read - a first non-risk match no longer hides a later risk one', () => {
  // the policy owner's row: main reached 'will be deleted'; the new slot stops first at 'is about to be suspended'
  twin([
    ['OK', 'Notice', 'Your account is about to be suspended and will be deleted in 30 days.', 'OK', 'Notice', 'Your account will be deleted in 30 days.'],
    // the widening the policy owner listed: a later risk match after a first non-risk one with the old auxiliaries
    ['OK', 'Notice', 'Your files will be backed up and the old copies will be deleted.', 'OK', 'Notice', 'The old copies will be deleted.'],
  ], 'delete')
  // a later negated auxiliary stays free
  free([['OK', 'Notice', 'Your account will be suspended, but your files will not be deleted.']])
})

test('CU-861: subordinate and payment rows are pinned to their going-to twins', () => {
  parity([
    ['OK', 'Notice', 'Items that are about to be deleted are shown in red.', 'Items that are going to be deleted are shown in red.'],
    ['OK', 'Notice', "We'll email you when files are about to be deleted.", "We'll email you when files are going to be deleted."],
    ['OK', 'Notice', 'You are about to be charged $9.99.', 'You are going to be charged $9.99.'],
    ['OK', 'Notice', 'You are about to be signed out.', 'You are going to be signed out.'],
    // MODAL_FUTURE has no negation window (CU-908): the about-to row equals its going-to twin
    ['OK', 'Notice', 'No file is about to be erased.', 'No file is going to be erased.'],
    ['OK', 'Notice', 'Nothing is about to be deleted.', 'Nothing is going to be deleted.'],
  ])
  free([['OK', 'Notice', 'You are about to be signed out.']])
})

// (The table's active row 'This is about to erase the volume.' is not here: under 'OK' | 'Notice' it already asks on main, by
// another rule - outside CU-861; test1 at 58c1e05e1 showed it on both trees.)
test('CU-861: the negated, past, non-risk, first-person, get, lost, other-shape, Cancel and unless rows stay free', () => {
  free([
    ['OK', 'Account', 'Your account is not about to be deleted.'],
    ['OK', 'Account', "Your account isn't about to be deleted."],
    ['OK', 'Account', "Your account's not about to be deleted."],
    ['OK', 'Notice', 'Your files are not on the verge of being erased.'],
    ['OK', 'Account', 'Your account was about to be deleted.'],
    ['OK', 'Notice', 'Your files were on the point of being erased.'],
    ['OK', 'Account', 'Your account is about to be restored.'],
    ['OK', 'Notice', 'Your changes are about to be saved.'],
    ['OK', 'Notice', "I'm about to be charged $9.99."],
    ['OK', 'Account', 'Your account is about to get deleted.'],
    ['OK', 'Notice', 'Your data is about to be lost.'],
    ['OK', 'Account', 'Your account is gonna be deleted.'],
    ['OK', 'Account', 'Your account is set to be deleted.'],
    ['Cancel', 'Account', 'Your account is about to be deleted.'],
    ['OK', 'Save changes?', 'Unsaved work is about to be deleted unless you save it.'],
  ])
})

test('CU-861: modalStatementNames names the act and its subject', () => {
  assert.ok(modalStatementNames('Your account is about to be deleted.').includes('Delete Your account'))
  assert.ok(modalStatementNames("Your account's about to be deleted.").includes('Delete Your account'))
  assert.ok(modalStatementNames('The repository is on the point of being erased.').includes('Erase The repository'))
  assert.ok(modalStatementNames('Your account is about to be suspended and will be deleted in 30 days.').includes('Delete Your account is about to be suspended and'))
  assert.deepEqual(modalStatementNames('Your account is about to be restored.').filter((n) => /^(?:Delete|Erase|Remove|Restore)\b/.test(n)), [])
})
