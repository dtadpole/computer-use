import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { PANEL_SERVICE, createAppPolicy, protectedPath, systemShortcut } from '../../_tools_/agent-core/app-policy.mjs'
import { parsePreApproval } from '../../_tools_/agent-core/cli.mjs'
import { createExclusions } from '../../_tools_/agent-core/exclusions.mjs'

const FIXTURE = 'ai.reflection.cu.fixture'
const click = { type: 'click', button: 'left', x: 10, y: 10 }
const target = (name, origin = FIXTURE, extra = {}) => ({ origin, role: 'AXButton', name, fingerprint: name, ...extra })
const keypress = (...keys) => ({ type: 'keypress', keys })
const ctx = (extra = {}) => ({ frontmostBundleId: FIXTURE, target: null, ...extra })

// Start apps are not approvals (P11): tests approve the way a person does, through a temp always store.
const tmp = mkdtempSync(join(tmpdir(), 'cu-app-policy-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
let stores = 0
function approvedStore(...ids) {
  const store = createAppApprovals({ path: join(tmp, `app-approvals-${stores += 1}.json`) })
  for (const id of ids) store.grantAlways(id, { by: 'api' })
  return store
}
const approvedPolicy = (options = {}) => createAppPolicy({ scope: [FIXTURE], approvals: approvedStore(FIXTURE), ...options })

test('the order of checks: excluded blocks, auth prompts hand off, unapproved apps confirm new_app, classes, allow', () => {
  const policy = approvedPolicy()
  const front = policy.classify(click, { frontmostBundleId: 'com.apple.Terminal', target: target('ls') })
  assert.deepEqual([front.decision, front.rule], ['handoff', 'excluded_front:terminal'], 'an excluded app in front is the person\'s')
  assert.equal(policy.classify(click, ctx({ target: target('Fill', 'com.1password.1password') })).rule, 'excluded:password_manager')
  assert.equal(policy.classify(click, { frontmostBundleId: null, target: null }).rule, 'excluded:unknown', 'no frontmost app fails closed')
  assert.equal(policy.classify(click, ctx({ target: target('OK'), authPrompt: true })).decision, 'handoff')
  const fresh = policy.classify(click, { frontmostBundleId: 'com.apple.TextEdit', target: target('Bold', 'com.apple.TextEdit') })
  assert.deepEqual([fresh.decision, fresh.class, fresh.app], ['confirm', 'new_app', 'com.apple.TextEdit'])
  const del = policy.classify(click, ctx({ target: target('Delete all') }))
  assert.deepEqual([del.decision, del.class], ['confirm', 'delete'])
  assert.equal(policy.classify(click, ctx({ target: target('Show details') })).decision, 'allow')
  assert.equal(policy.classify(click, ctx()).decision, 'allow', 'empty space in an approved app')
})

test('E10: a target that names no app is blocked excluded:unknown (fail closed)', () => {
  const policy = approvedPolicy()
  for (const origin of [undefined, null, '', '  ']) {
    const verdict = policy.classify(click, ctx({ target: { role: 'AXButton', name: 'OK', origin } }))
    assert.deepEqual([verdict.decision, verdict.rule], ['block', 'excluded:unknown'], String(origin))
  }
  assert.equal(policy.classify(keypress('A'), ctx({ target: { role: 'AXTextField', name: 'Title' } })).rule, 'excluded:unknown', 'a focused element too')
})

test('classes on accessibility targets: secure fields and secure input hand off; held dialogs; sensitive text; opaque targets', () => {
  const policy = approvedPolicy({ preApprovals: [{ class: 'credential' }] })
  const typeSecure = policy.classify({ type: 'type', text: 'hunter2' }, ctx({ target: target('Password', FIXTURE, { role: 'AXTextField', secure: true }) }))
  assert.deepEqual([typeSecure.decision, typeSecure.rule], ['handoff', 'secure_field'], 'never pre-approvable, even with a credential pre-approval')
  assert.equal(policy.classify(keypress('A'), ctx({ secureInput: true })).decision, 'handoff')
  assert.equal(policy.classify(click, ctx({ target: target('Password', FIXTURE, { secure: true }) })).decision, 'allow', 'clicking into the field is not typing')
  const opaque = policy.classify(click, ctx({ target: target('', FIXTURE, { role: 'AXGroup', opaque: true }) }))
  assert.deepEqual([opaque.decision, opaque.class], ['confirm', 'unknown_target'])
  const pre = approvedPolicy({ preApprovals: [{ class: 'unknown_target', app: FIXTURE }] })
  assert.equal(pre.classify(click, ctx({ target: target('', FIXTURE, { opaque: true }) })).decision, 'allow', 'pre-approvable per app')
  assert.equal(policy.classify({ type: 'type', text: 'ana@example.test' }, ctx({ target: target('Email', FIXTURE, { role: 'AXTextField' }) })).class, 'sensitive_data')
  const sheet = policy.classify(keypress('ENTER'), ctx({ dialog: { type: 'confirm', message: 'Delete 3 files?' } }))
  assert.deepEqual(sheet.classes, ['delete', 'page_dialog'])
})

test('P4: a credential on the desktop is never pre-approvable; other class pre-approvals still apply', () => {
  const policy = approvedPolicy({ preApprovals: [{ class: 'credential' }, { class: 'submit' }] })
  const field = target('Token', FIXTURE, { role: 'AXTextField' })
  const secret = policy.classify({ type: 'type', text: '{{secret:api_token}}' }, ctx({ target: field }))
  assert.deepEqual([secret.decision, secret.class], ['confirm', 'credential'])
  assert.equal(policy.classify(click, ctx({ target: target('Send') })).decision, 'allow', 'the submit pre-approval is kept')
})

test('P5: on an opaque target, Return or Space with any modifiers and typed line breaks ask unknown_target', () => {
  const policy = approvedPolicy()
  const opaque = ctx({ target: target('', FIXTURE, { role: 'AXGroup', opaque: true }) })
  for (const action of [keypress('ENTER'), keypress('META', 'ENTER'), keypress('SPACE'), keypress('SHIFT', 'SPACE'), keypress('return'),
    { type: 'type', text: 'ok\n' }, { type: 'type', text: 'a\rb' }]) {
    assert.equal(policy.classify(action, opaque).class, 'unknown_target', JSON.stringify(action))
  }
  assert.equal(policy.classify(keypress('ARROWDOWN'), opaque).decision, 'allow', 'an arrow is no printable key')
  // CU-363: a printable key or typed text on an opaque target fires no menu item and lands in no text entry - an app
  // shortcut, asked once per key (a named over-ask).
  for (const action of [keypress('A'), { type: 'type', text: 'plain words' }]) {
    assert.equal(policy.classify(action, opaque).rule, 'page:shortcut', JSON.stringify(action))
  }
})

test('P11: start apps are candidates only; the scope grows only on a human approval', () => {
  const policy = createAppPolicy({ scope: [FIXTURE] })
  assert.deepEqual([policy.startApps(), policy.scope()], [[FIXTURE], []])
  const first = policy.classify(click, ctx())
  assert.deepEqual([first.decision, first.class, first.app], ['confirm', 'new_app', FIXTURE], 'the first action in a start app asks')
  for (const answer of [undefined, null, { approved: false, answeredBy: 'live' }, { approved: 'yes', answeredBy: 'live' },
    { approved: true, answeredBy: 'unattended' }, { approved: true, answeredBy: 'dsh_gate' }, { approved: true, answeredBy: 'timeout' },
    { approved: true, answeredBy: 'caller' }, { approved: true }]) {
    assert.equal(policy.grantScope(FIXTURE, answer), false, JSON.stringify(answer))
  }
  assert.deepEqual(policy.scope(), [], 'nothing changed')
  assert.equal(policy.classify(click, ctx()).class, 'new_app')
  assert.equal(policy.grantScope('com.apple.Terminal', { approved: true, answeredBy: 'live' }), false, 'an excluded app never enters the scope')
  for (const answeredBy of ['live', 'tty', 'api']) {
    const fresh = createAppPolicy({ scope: [FIXTURE] })
    assert.equal(fresh.grantScope(FIXTURE, { approved: true, lifetime: 'once', answeredBy }), true, answeredBy)
    assert.equal(fresh.classify(click, ctx()).decision, 'allow', answeredBy)
  }
})

test('approvals: the always store, granting scope mid-run, no approval lifts an exclusion', () => {
  const store = { covers: (id) => id === 'com.apple.TextEdit' || id === FIXTURE }
  const policy = createAppPolicy({ scope: [FIXTURE], approvals: store })
  assert.equal(policy.classify(click, { frontmostBundleId: 'com.apple.TextEdit', target: target('Bold', 'com.apple.TextEdit') }).decision, 'allow')
  assert.equal(policy.classify(click, { frontmostBundleId: 'com.apple.Notes', target: null }).class, 'new_app')
  assert.equal(policy.grantScope('com.apple.Notes', { approved: true, answeredBy: 'live' }), true)
  assert.equal(policy.classify(click, { frontmostBundleId: 'com.apple.Notes', target: null }).decision, 'allow')
  assert.deepEqual(policy.scope(), ['com.apple.notes'])
  assert.equal(policy.classify(click, ctx({ target: target('ls', 'com.apple.Terminal') })).decision, 'block', 'no approval lifts an exclusion')
})

test('D-031: copy, cut and paste are allowed in an approved app; navigate stays blocked; a run-config exclusion applies', () => {
  const policy = createAppPolicy({ scope: [FIXTURE, 'ai.reflection.cu.ledger'], approvals: approvedStore(FIXTURE), exclusions: createExclusions({ extra: ['ai.reflection.cu.ledger'] }) })
  for (const key of ['C', 'X', 'V']) assert.equal(policy.classify(keypress('META', key), ctx()).decision, 'allow', key)
  assert.equal(policy.classify(keypress('v', 'cmd'), ctx()).decision, 'allow', 'any dialect')
  for (const name of ['Paste', 'Copy', 'Cut', 'Paste and Match Style', 'Move Item Here']) {
    assert.equal(policy.classify(click, ctx({ target: target(name, FIXTURE, { role: 'AXMenuItem' }) })).decision, 'allow', name)
  }
  assert.equal(policy.classify(click, ctx({ target: target('Insert', FIXTURE, { role: 'AXMenuItem', identifier: 'paste:', cmdChar: 'V' }) })).decision, 'allow')
  assert.equal(policy.classify(keypress('META', 'S'), ctx()).decision, 'allow')
  assert.equal(policy.classify({ type: 'navigate', url: 'https://example.com' }, ctx()).rule, 'desktop:navigate')
  assert.equal(policy.classify(click, ctx({ target: target('Open', 'ai.reflection.cu.ledger') })).rule, 'excluded:config', 'scope cannot include an excluded stand-in')
  assert.equal(policy.classify(keypress('META', 'V'), ctx({ frontmostBundleId: 'com.apple.Notes' })).class, 'new_app', 'pasting into an unapproved app still asks first')
})

test('P9: system-wide shortcuts are blocked by name whatever the modifier order; app chords pass', () => {
  const policy = approvedPolicy()
  const cases = [
    [['META', 'SHIFT', 'Q'], 'log out'], [['Q', 'SHIFT', 'META'], 'log out'], [['META', 'ALT', 'SHIFT', 'Q'], 'log out'],
    [['CTRL', 'META', 'Q'], 'lock screen'], [['META', 'CTRL', 'Q'], 'lock screen'],
    [['META', 'SHIFT', '3'], 'screenshot'], [['SHIFT', 'META', '4'], 'screenshot'], [['META', 'SHIFT', '5'], 'screenshot'],
    [['META', 'SHIFT', '6'], 'screenshot'], [['CTRL', 'META', 'SHIFT', '3'], 'screenshot'], [['CTRL', 'SHIFT', 'META', '4'], 'screenshot'],
    [['META', '#'], 'screenshot'],
    [['META', 'SPACE'], 'Spotlight'], [['SPACE', 'META'], 'Spotlight'], [['cmd', 'space'], 'Spotlight'],
    [['META', 'ALT', 'ESCAPE'], 'Force Quit'], [['ALT', 'META', 'ESCAPE'], 'Force Quit'],
    [['META', 'TAB'], 'app switcher'], [['META', 'SHIFT', 'TAB'], 'app switcher'],
    [['CTRL', 'ARROWUP'], 'Mission Control or Spaces'], [['CTRL', 'ARROWDOWN'], 'Mission Control or Spaces'],
    [['ARROWLEFT', 'CTRL'], 'Mission Control or Spaces'], [['CTRL', 'ARROWRIGHT'], 'Mission Control or Spaces'],
    [['F11'], 'Show Desktop'], [['META', 'F5'], 'VoiceOver'], [['CTRL', 'F2'], 'system keyboard focus'],
    // CU-242: the input source (an owner setting that outlives the run), the Character Viewer and Look Up.
    [['CTRL', 'SPACE'], 'input source'], [['CTRL', 'ALT', 'SPACE'], 'input source'], [['CTRL', 'SHIFT', 'SPACE'], 'input source'],
    [['CTRL', 'META', 'SPACE'], 'Character Viewer'], [['META', 'CTRL', 'SPACE'], 'Character Viewer'], [['CTRL', 'META', 'D'], 'Look Up'],
    // CU-242 additions (cu-coordinator 12:10Z): owner settings the system's hotkeys toggle.
    [['META', 'ALT', 'D'], 'Dock hiding'], [['CTRL', 'F1'], 'keyboard access'], [['CTRL', 'F7'], 'Tab focus mode'],
    [['CTRL', 'ALT', 'META', '8'], 'Invert colours'], [['ALT', 'META', '8'], 'Zoom'], [['ALT', 'META', '='], 'Zoom'], [['ALT', 'META', '-'], 'Zoom'],
  ]
  for (const [keys, name] of cases) {
    const verdict = policy.classify(keypress(...keys), ctx())
    assert.deepEqual([verdict.decision, verdict.rule], ['block', 'system_shortcut'], keys.join('+'))
    assert.match(verdict.reason, new RegExp(name), keys.join('+'))
    assert.equal(systemShortcut(keypress(...keys)), name, keys.join('+'))
    // CU-244: a hold of the same chord is refused the same way, whoever calls app-policy.
    const held = { type: 'hold_key', keys, duration_ms: 500 }
    assert.deepEqual([policy.classify(held, ctx()).decision, policy.classify(held, ctx()).rule], ['block', 'system_shortcut'], `held ${keys.join('+')}`)
    assert.equal(systemShortcut(held), name, `held ${keys.join('+')}`)
  }
  for (const keys of [['META', 'Q'], ['META', 'S'], ['META', 'SHIFT', 'T'], ['META', '3'], ['SPACE'], ['TAB'], ['CTRL', 'TAB'],
    ['META', 'ARROWLEFT'], ['ALT', 'ARROWRIGHT'], ['ESCAPE'], ['META', 'ESCAPE'], ['F5'], ['CTRL', 'A'], ['ALT', 'SPACE'], ['SHIFT', 'SPACE'], ['META', 'D'], ['CTRL', 'D'], ['ALT', 'D'], ['F1'], ['META', '='], ['META', '8']]) {
    assert.equal(policy.classify(keypress(...keys), ctx()).decision, 'allow', keys.join('+'))
  }
  // CU-363: Shift+3 types '#' - with no text entry focused it is an app shortcut, asked once per key (a named over-ask).
  assert.equal(policy.classify(keypress('SHIFT', '3'), ctx()).rule, 'page:shortcut', 'SHIFT+3')
})

test('P10: opening an app, script or installer confirms launch_code, never pre-approvable', () => {
  const policy = approvedPolicy({ preApprovals: [{ class: 'launch_code' }, { class: 'launch_code', app: FIXTURE }, { class: 'unknown_target' }] })
  const file = (name) => ctx({ target: target(name, FIXTURE, { role: 'AXImage' }) })
  const double = { type: 'double_click', button: 'left', x: 10, y: 10 }
  for (const ext of ['app', 'command', 'sh', 'zsh', 'bash', 'pkg', 'mpkg', 'dmg', 'tool', 'workflow', 'scpt', 'applescript', 'terminal', 'jar', 'py', 'rb', 'pl']) {
    for (const name of [`Thing.${ext}`, `THING.${ext.toUpperCase()}`]) {
      const verdict = policy.classify(double, file(name))
      assert.deepEqual([verdict.decision, verdict.class, verdict.rule], ['confirm', 'launch_code', 'target:launch_code'], name)
    }
  }
  assert.equal(policy.classify({ ...double, type: 'triple_click' }, file('setup.sh')).class, 'launch_code', 'a triple click opens too')
  for (const keys of [['META', 'O'], ['O', 'META'], ['META', 'ARROWDOWN'], ['ARROWDOWN', 'META'], ['cmd', 'down']]) {
    assert.equal(policy.classify(keypress(...keys), file('Installer.pkg')).class, 'launch_code', keys.join('+'))
  }
  assert.equal(policy.classify(click, file('Installer.pkg')).decision, 'allow', 'a single click selects')
  assert.equal(policy.classify(keypress('ARROWDOWN'), file('Installer.pkg')).decision, 'allow', 'moving the selection')
  assert.equal(policy.classify(keypress('META', 'O'), file('notes.txt')).decision, 'allow')
  for (const name of ['notes.txt', 'Report.apple', 'Thing.app.zip', 'bash', '']) assert.equal(policy.classify(double, file(name)).decision, 'allow', name)
  const both = policy.classify(double, file('Delete Everything.command'))
  assert.deepEqual([both.class, both.classes], ['launch_code', ['launch_code', 'delete']], 'other classes are still recorded')
})

test('launch_code also covers installer bundles and locations, and a hidden extension through the AX file name or URL', () => {
  const policy = createAppPolicy({ scope: [FIXTURE], preApprovals: [{ class: 'launch_code' }] })
  policy.grantScope(FIXTURE, { approved: true, answeredBy: 'api' })
  const open = (target) => policy.classify({ type: 'double_click', x: 5, y: 5 }, { frontmostBundleId: FIXTURE, target: { origin: FIXTURE, role: 'AXImage', fingerprint: 'f', ...target } })
  for (const name of ['Tool.scptd', 'Pane.prefPane', 'Profile.mobileconfig', 'Site.webloc']) assert.equal(open({ name }).class, 'launch_code', name)
  assert.equal(open({ name: 'Payload', filename: 'Payload.app' }).class, 'launch_code', 'hidden extension via the file name')
  assert.equal(open({ name: 'Payload', url: 'file:///Users/x/Payload.app/' }).class, 'launch_code', 'hidden extension via the URL')
  assert.equal(open({ name: 'Notes.txt' }).decision, 'allow')
})

test('an approved app\'s terminal panel takes clicks but no typing (E5, Q-D9)', () => {
  const policy = createAppPolicy({ scope: [FIXTURE] })
  policy.grantScope(FIXTURE, { approved: true, answeredBy: 'api' })
  const panel = { origin: FIXTURE, role: 'AXTextArea', name: 'Terminal 1', fingerprint: 't1' }
  assert.equal(policy.classify({ type: 'type', text: 'rm -rf ~\n' }, { frontmostBundleId: FIXTURE, target: panel }).rule, 'terminal_view')
  assert.equal(policy.classify({ type: 'keypress', keys: ['ENTER'] }, { frontmostBundleId: FIXTURE, target: { ...panel, name: '', description: 'Debug Console' } }).rule, 'terminal_view')
  assert.equal(policy.classify({ type: 'click', button: 'left', x: 1, y: 1 }, { frontmostBundleId: FIXTURE, target: panel }).decision, 'allow')
  assert.equal(policy.classify({ type: 'type', text: 'hello' }, { frontmostBundleId: FIXTURE, target: { origin: FIXTURE, role: 'AXTextField', name: 'Search', fingerprint: 's' } }).decision, 'allow')
})

test('REPL and notebook code cells count as terminal views: no typing, no run chords', () => {
  const policy = createAppPolicy({ scope: [FIXTURE] })
  policy.grantScope(FIXTURE, { approved: true, answeredBy: 'api' })
  for (const name of ['Code cell 3', 'Python REPL', 'Interactive', 'Jupyter Notebook', 'irb']) {
    const cell = { origin: FIXTURE, role: 'AXTextArea', name, fingerprint: name }
    assert.equal(policy.classify({ type: 'type', text: 'import os' }, { frontmostBundleId: FIXTURE, target: cell }).rule, 'terminal_view', name)
    assert.equal(policy.classify({ type: 'keypress', keys: ['SHIFT', 'ENTER'] }, { frontmostBundleId: FIXTURE, target: cell }).rule, 'terminal_view', `${name} run chord`)
  }
})


// Per-app pre-approvals: `class@bundle.id` covers that app only, never every app on the desktop.
const APP_X = 'com.example.appx'
const APP_Y = 'com.example.appy'
const twoApps = (preApprove) => createAppPolicy({ scope: [APP_X, APP_Y], approvals: approvedStore(APP_X, APP_Y), preApprovals: preApprove.map(parsePreApproval) })
const inApp = (app, extra = {}) => ({ frontmostBundleId: app, target: null, ...extra })

test('a per-app pre-approval (class@bundle.id) covers that app only; one without an app covers every app', () => {
  const scoped = twoApps([`submit@${APP_X}`])
  const inX = scoped.classify(click, inApp(APP_X, { target: target('Submit', APP_X) }))
  assert.deepEqual([inX.decision, inX.class, inX.rule], ['allow', 'submit', `preapproved:submit@${APP_X}`])
  const inY = scoped.classify(click, inApp(APP_Y, { target: target('Submit', APP_Y) }))
  assert.deepEqual([inY.decision, inY.class, inY.rule], ['confirm', 'submit', 'class:submit'], 'submit@X does not pre-approve submit in Y')
  const yTargetXFront = scoped.classify(click, inApp(APP_X, { target: target('Submit', APP_Y) }))
  assert.equal(yTargetXFront.decision, 'confirm', 'the target\'s app decides, not the frontmost one')
  assert.equal(twoApps([`submit@${APP_X.toUpperCase()}`]).classify(click, inApp(APP_X, { target: target('Submit', APP_X) })).decision, 'allow', 'bundle ids compare case-insensitively')
  assert.deepEqual(createAppPolicy({ scope: [APP_X], approvals: approvedStore(APP_X), preApprovals: [{ class: 'submit', app: APP_X }] })
    .classify(click, inApp(APP_X, { target: target('Send', APP_X) })).decision, 'allow', '{ class, app } works as well')
  for (const empty of ['submit@', 'submit@  ']) {
    assert.equal(twoApps([empty]).classify(click, inApp(APP_X, { target: target('Submit', APP_X) })).decision, 'confirm', `'${empty}' names no real app and covers none`)
  }

  const everywhere = twoApps(['submit'])
  for (const app of [APP_X, APP_Y]) {
    const verdict = everywhere.classify(click, inApp(app, { target: target('Submit', app) }))
    assert.deepEqual([verdict.decision, verdict.rule], ['allow', 'pre_approved'], `an app-less submit applies in ${app}`)
  }
})

test('without a target the frontmost app decides; app-scoped pre-approvals must cover every class the action needs', () => {
  const policy = twoApps([`page_dialog@${APP_X}`, `sensitive_data@${APP_X}`])
  const held = { type: 'confirm', message: 'Keep these changes?' }
  const inX = policy.classify(keypress('ENTER'), inApp(APP_X, { dialog: held }))
  assert.deepEqual([inX.decision, inX.rule], ['allow', `preapproved:page_dialog@${APP_X}`])
  assert.equal(policy.classify(keypress('ENTER'), inApp(APP_Y, { dialog: held })).decision, 'confirm')
  const both = policy.classify(keypress('ENTER'), inApp(APP_X, { dialog: { type: 'confirm', message: 'Delete 3 files?' } }))
  assert.deepEqual([both.decision, both.class, both.classes], ['confirm', 'delete', ['delete', 'page_dialog']], 'delete is never pre-approved, so the action still asks')
  const typed = policy.classify({ type: 'type', text: 'ana@example.test' }, inApp(APP_X, { target: target('Email', APP_X, { role: 'AXTextField' }) }))
  assert.deepEqual([typed.decision, typed.class], ['allow', 'sensitive_data'], 'the class is kept, so the loop still redacts the text')
})

test('unknown_target@bundle.id covers opaque targets in that app only; an app-less one covers every app', () => {
  const opaqueIn = (app) => inApp(app, { target: target('', app, { role: 'AXGroup', opaque: true }) })
  const scoped = twoApps([`unknown_target@${APP_X}`])
  assert.equal(scoped.classify(click, opaqueIn(APP_X)).decision, 'allow')
  const inY = scoped.classify(click, opaqueIn(APP_Y))
  assert.deepEqual([inY.decision, inY.class, inY.rule], ['confirm', 'unknown_target', 'target:opaque'], 'unknown_target@X does not cover Y')
  const everywhere = twoApps(['unknown_target'])
  for (const app of [APP_X, APP_Y]) assert.equal(everywhere.classify(click, opaqueIn(app)).decision, 'allow', app)
})

test('credential and launch_code stay never pre-approvable on the desktop, scoped to an app or not', () => {
  const policy = twoApps([`credential@${APP_X}`, `launch_code@${APP_X}`, `delete@${APP_X}`, `purchase@${APP_X}`, 'credential', 'launch_code'])
  const secret = policy.classify({ type: 'type', text: '{{secret:api_token}}' }, inApp(APP_X, { target: target('Token', APP_X, { role: 'AXTextField' }) }))
  assert.deepEqual([secret.decision, secret.class], ['confirm', 'credential'])
  const open = policy.classify({ type: 'double_click', button: 'left', x: 10, y: 10 }, inApp(APP_X, { target: target('Setup.app', APP_X, { role: 'AXImage' }) }))
  assert.deepEqual([open.decision, open.class], ['confirm', 'launch_code'])
  assert.equal(policy.classify(click, inApp(APP_X, { target: target('Delete all', APP_X) })).class, 'delete')
  assert.equal(policy.classify(click, inApp(APP_X, { target: target('Buy now', APP_X) })).class, 'purchase')
})

test('on the desktop too, typing a value the task itself names is not sensitive_data (CU-42 through the app policy)', () => {
  const policy = createAppPolicy({ scope: [FIXTURE] })
  policy.grantScope(FIXTURE, { approved: true, answeredBy: 'api' })
  const field = target('', FIXTURE, { role: 'AXTextField' })
  const task = 'In CU Fixture, send a message to hr@example.com.'
  const typed = { type: 'type', text: 'hr@example.com' }
  assert.notEqual(policy.classify(typed, ctx({ target: field, task })).class, 'sensitive_data')
  assert.equal(policy.classify({ type: 'type', text: 'boss@corp.example' }, ctx({ target: field, task })).class, 'sensitive_data')
})

test('inside an attributed file panel: navigation passes, every commit is file_choice, Quick Look, menus, drag out and file operations are refused (Q-D13)', () => {
  const policy = createAppPolicy({ scope: [FIXTURE] })
  policy.grantScope(FIXTURE, { approved: true, answeredBy: 'api' })
  const inPanel = (name, role = 'AXButton') => target(name, FIXTURE, { role, hostedBy: PANEL_SERVICE })
  const at = (action, t) => policy.classify(action, ctx({ target: t }))
  for (const name of ['Save', 'Open', 'Choose', 'Upload', 'Attach', 'Export']) assert.equal(at(click, inPanel(name)).class, 'file_choice', name)
  assert.equal(at({ type: 'double_click', x: 1, y: 1 }, inPanel('report.pdf', 'AXCell')).class, 'file_choice', 'double click on a file')
  assert.equal(at(keypress('ENTER'), inPanel('', 'AXTextField')).class, 'file_choice', 'Return commits')
  assert.equal(at({ type: 'type', text: 'report.pdf\n' }, inPanel('', 'AXTextField')).class, 'file_choice', 'a typed line break commits')
  assert.equal(at({ type: 'type', text: 'report.pdf' }, inPanel('', 'AXTextField')).decision, 'allow', 'typing a name is navigation')
  assert.equal(at(click, inPanel('Documents', 'AXRow')).decision, 'allow', 'sidebar navigation passes')
  assert.equal(at(keypress('META', 'SHIFT', 'G'), inPanel('', 'AXTextField')).decision, 'allow', 'Go to Folder passes')
  const refused = [
    [{ type: 'click', button: 'right', x: 1, y: 1 }, 'panel:context_menu'],
    [{ type: 'click', button: 'left', x: 1, y: 1, keys: ['CTRL'] }, 'panel:context_menu'],
    [{ type: 'drag', path: [{ x: 1, y: 1 }, { x: 50, y: 50 }] }, 'panel:drag_out'],
    [keypress('SPACE'), 'panel:quick_look'],
    [keypress('META', 'Y'), 'panel:quick_look'],
    [keypress('META', 'BACKSPACE'), 'panel:file_operation'],
    [keypress('META', 'R'), 'panel:file_operation'],
    [keypress('META', 'SHIFT', 'N'), 'panel:file_operation'],
  ]
  for (const [action, rule] of refused) {
    const v = at(action, inPanel('report.pdf', 'AXCell'))
    assert.equal(v.decision, 'block', rule)
    assert.equal(v.rule, rule)
  }
  // CU-244: the keypress-gated panel refusals hold for a key hold too.
  for (const [keys, rule] of [[['SPACE'], 'panel:quick_look'], [['META', 'BACKSPACE'], 'panel:file_operation'], [['META', 'SHIFT', '.'], 'panel:protected_place']]) {
    const v = at({ type: 'hold_key', keys, duration_ms: 300 }, inPanel('report.pdf', 'AXCell'))
    assert.deepEqual([v.decision, v.rule], ['block', rule], `held ${keys.join('+')}`)
  }
  assert.notEqual(at(click, target('Save')).class, 'file_choice', "the app's own Save button is not a file choice")
})

test('protected destinations are refused even with approval; ordinary folders are not (Q-D13)', () => {
  const home = '/Users/someone'
  for (const path of [`${home}/.ssh/id_ed25519`, `${home}/Library/LaunchAgents/x.plist`, '/Library/LaunchDaemons/y.plist', `${home}/Library/Keychains/login.keychain-db`,
    '/Applications/Foo.app', `${home}/Downloads/Tool.app/Contents/MacOS/tool`, `${home}/.zshrc`, `${home}/Documents/../.ssh/config`]) {
    assert.equal(protectedPath(path, home), true, path)
  }
  for (const path of [`${home}/Documents/report.pdf`, `${home}/Desktop/notes.txt`, `${home}/.zshrc.backup.txt`]) assert.equal(protectedPath(path, home), false, path)
})

test('a target the helper could not describe (owner only, no role or title) asks each time and is never pre-approved (CU-39 live)', () => {
  const policy = createAppPolicy({ scope: [FIXTURE], preApprovals: [{ class: 'unknown_target', app: FIXTURE }] })
  policy.grantScope(FIXTURE, { approved: true, answeredBy: 'api' })
  const ownerOnly = { origin: FIXTURE, role: null, name: null, pid: 1, opaque: false, fingerprint: 'x' }
  const v = policy.classify(click, ctx({ target: ownerOnly }))
  assert.equal(v.decision, 'confirm')
  assert.equal(v.class, 'unknown_target')
  assert.equal(v.rule, 'target:undescribed')
  assert.equal(v.askEachTime, true)
  assert.equal(policy.classify(keypress('ENTER'), ctx({ target: ownerOnly })).rule, 'target:undescribed', 'Return on it asks too')
  assert.equal(policy.classify(click, ctx({ target: target('Create') })).decision, 'allow', 'a described target is unaffected')
  assert.equal(policy.classify(click, ctx({ target: null })).decision, 'allow', 'empty space is unaffected')
})

test('an in-process panel marked by the helper (panel save|open) gets the file_choice rules; panel unknown asks each time (CU-39 live)', () => {
  const policy = createAppPolicy({ scope: [FIXTURE] })
  policy.grantScope(FIXTURE, { approved: true, answeredBy: 'api' })
  const marked = (name, panel, role = 'AXButton') => target(name, FIXTURE, { role, panel })
  const at = (action, t) => policy.classify(action, ctx({ target: t }))
  assert.equal(at(click, marked('Save', 'save')).class, 'file_choice', 'the save panel\'s Save')
  assert.equal(at({ type: 'double_click', x: 1, y: 1 }, marked('report.pdf', 'open', 'AXCell')).class, 'file_choice', 'double click in an open panel')
  assert.equal(at(keypress('ENTER'), marked('', 'save', 'AXTextField')).class, 'file_choice', 'Return in the name field')
  assert.equal(at({ type: 'click', button: 'right', x: 1, y: 1 }, marked('report.pdf', 'open', 'AXCell')).rule, 'panel:context_menu')
  assert.equal(at(keypress('SPACE'), marked('report.pdf', 'open', 'AXCell')).rule, 'panel:quick_look')
  assert.equal(at(click, marked('Documents', 'open', 'AXRow')).decision, 'allow', 'navigation passes')
  const unknown = at(click, marked('Save', 'unknown'))
  assert.equal(unknown.rule, 'panel:unknown')
  assert.equal(unknown.askEachTime, true)
  assert.equal(at({ type: 'type', text: 'report' }, marked('', 'unknown', 'AXTextField')).decision, 'allow', 'typing without a commit is not asked')
  assert.notEqual(at(click, target('Save')).class, 'file_choice', 'an unmarked Save in the app is not a file choice')
})

test('inside a panel, navigation into a protected place it cannot report is refused; elsewhere it is not (CU-39 live)', () => {
  const policy = createAppPolicy({ scope: [FIXTURE] })
  policy.grantScope(FIXTURE, { approved: true, answeredBy: 'api' })
  const inPanel = (name = '', role = 'AXRow') => target(name, FIXTURE, { role, panel: 'save' })
  const at = (action, t) => policy.classify(action, ctx({ target: t }))
  assert.equal(at(keypress('CMD', 'SHIFT', 'A'), inPanel()).rule, 'panel:protected_place', 'Applications')
  assert.equal(at(keypress('CMD', 'SHIFT', 'U'), inPanel()).rule, 'panel:protected_place', 'Utilities')
  assert.equal(at(keypress('CMD', 'SHIFT', '.'), inPanel()).rule, 'panel:protected_place', 'hidden files')
  assert.equal(at(keypress('CMD', '>'), inPanel()).rule, 'panel:protected_place', 'hidden files, shifted spelling')
  assert.equal(at(click, inPanel('Applications')).rule, 'panel:protected_place')
  assert.equal(at({ type: 'double_click', x: 1, y: 1 }, inPanel('Library')).rule, 'panel:protected_place')
  assert.equal(at(click, inPanel('Documents')).decision, 'allow', 'an ordinary folder passes')
  assert.equal(at(keypress('CMD', 'SHIFT', 'D'), inPanel()).decision, 'allow', 'Desktop is not protected')
  assert.notEqual(at(keypress('CMD', 'SHIFT', 'A'), target('Create')).rule, 'panel:protected_place', 'outside a panel the rule does not apply')
})


test('CU-494 round 2 (cu-developer-three 11:09Z): an app-scoped grant never covers a High submit or install row; ordinary submits stay covered', () => {
  const pre = approvedPolicy({ preApprovals: [{ class: 'submit', app: FIXTURE }, { class: 'install', app: FIXTURE }] })
  for (const name of ['Change salary', 'Update compensation', 'Send to all contacts', 'Install now', 'Add to Chrome']) {
    const v = pre.classify(click, ctx({ target: target(name) }))
    if (v.decision !== 'allow' || !String(v.rule ?? '').startsWith('preapproved:')) assert.equal(v.decision, 'confirm', name)
    assert.ok(!String(v.rule ?? '').startsWith('preapproved:'), `${name} is not carried by an app-scoped grant`)
  }
  const plain = pre.classify(click, ctx({ target: target('Submit') }))
  assert.equal(plain.decision, 'allow', 'an ordinary Submit stays pre-approvable per app')
})
