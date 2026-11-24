import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-753 (High; cu-researcher's sweep 6, follow-up to CU-493): approving a sign-in or a device-code grant with a generic button
// acted unasked - Allow in 'Allow sign-in on a new device?', Continue on 'Enter the code shown on your TV'. Both hand the account
// to another device: PERMISSION, by the control's own name or by the dialog / zone / form words around a generic finishing
// control. The person's own sign-in, a sign-in setting and pairing headphones stay free.
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-753-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
const store = createAppApprovals({ path: join(tmp, 'a.json') })
store.grantAlways(FIXTURE, { by: 'api' })
const desktop = createAppPolicy({ scope: [FIXTURE], approvals: store })
const web = createPolicy({ sitePolicy: () => 'allow' })
const click = { type: 'click', x: 1, y: 1, button: 'left' }
const classes = (v) => (v.decision === 'allow' ? [] : (v.classes ?? [v.class]))
const inDialog = (name, dialogName, dialogDescription = '') => web.classify(click, { url: 'https://accounts.example/security', target: { role: 'button', name, dialogName, dialogDescription } })
const inDesktopDialog = (name, dialogName, dialogDescription = '') => desktop.classify(click, { frontmostBundleId: FIXTURE, target: { origin: FIXTURE, role: 'AXButton', name, fingerprint: name, defaultButtonRead: true, dialogName, dialogDescription } })
const onPage = (name, zoneWords, formEntries = []) => web.classify(click, { url: 'https://tv.example/activate', target: { tag: 'button', role: 'button', name, zoneWords, formEntries } })
const named = (name) => web.classify(click, { url: 'https://accounts.example/devices', target: { role: 'button', name } })

test('CU-753: the filed rows ask permission', () => {
  assert.ok(classes(inDialog('Allow', 'Allow sign-in on a new device?', 'A Windows PC near Berlin is trying to sign in.')).includes('permission'))
  assert.ok(classes(inDesktopDialog('Allow', 'Allow sign-in on a new device?')).includes('permission'))
  assert.ok(classes(onPage('Continue', ['Enter the code shown on your TV'], ['Code'])).includes('permission'))
})

test('CU-753: the class - sign-in approvals and device-code grants, by name or by the words around a generic control', () => {
  for (const [name, title, description] of [
    ['Yes, it\'s me', 'Is this you signing in?', 'Someone is trying to sign in from Chrome on Windows.'],
    ['Approve', 'New sign-in request', 'Approve the sign-in on your other device.'],
    ['Confirm', 'Did you just try to sign in?', ''],
    ['Yes', 'Someone is trying to log in to your account', ''],
  ]) assert.ok(classes(inDialog(name, title, description)).includes('permission'), `${name} / ${title}`)
  for (const [name, zone] of [
    ['Next', ['Enter the 8-digit code displayed on your television']],
    ['Submit', ['Type the activation code that appears on your console']],
    ['Activate', ['Enter the code from your streaming device']],
  ]) assert.ok(classes(onPage(name, zone, ['Code'])).includes('permission'), `${name} / ${zone[0]}`)
  for (const name of ['Approve sign-in', 'Approve this login request', 'Authorize this device', 'Link TV', 'Activate your device', 'Sign in on your TV']) {
    assert.ok(classes(named(name)).includes('permission'), name)
  }
})

test('CU-753: the person\'s own sign-in, sign-in settings, Bluetooth pairing and plain codes stay free', () => {
  // ('Sign in with Google' asks permission and 'Link your bank account' credential on main already - other rules, unchanged here.)
  for (const name of ['Sign in', 'Allow sign-in with passkeys', 'Pair new device', 'Connect device', 'Pair headphones']) {
    assert.deepEqual(classes(named(name)), [], name)
  }
  assert.deepEqual(classes(onPage('Continue', ['Enter the code we sent to your email'], ['Code'])), [])
  assert.deepEqual(classes(onPage('Sign in', ['Sign in to your account'], ['Email', 'Password'])), [])
  assert.deepEqual(classes(inDialog('OK', 'Signed in', 'You are now signed in on this device.')), [])
})

test('CU-753 r2: sign-in request titles and "Was this you?" ask permission; a plain sign-in title stays free', () => {
  for (const [name, title] of [['Allow', 'Sign-in requested'], ['Allow', 'New login'], ['Yes', 'Was this you?'], ['Approve', 'New sign-in from Chrome on Windows'], ['Yes', 'Login attempt detected']]) {
    assert.ok(classes(inDialog(name, title)).includes('permission'), `web ${title}`)
    assert.ok(classes(inDesktopDialog(name, title)).includes('permission'), `desktop ${title}`)
  }
  for (const [name, title] of [['Continue', 'Sign in'], ['OK', 'Login'], ['Yes', 'Stay signed in?'], ['OK', 'Sign-in successful']]) {
    assert.deepEqual(classes(inDialog(name, title)), [], `web ${title}`)
  }
})
