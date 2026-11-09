import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'
import { createSitePolicy } from '../../_tools_/agent-core/sites.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'

// CU-301 (design note 0.1): a printable key - one character key or Space, with Shift and/or Option at most, pressed or
// held - puts its character into the focused text entry as typing does, so the field-name rules judge it as 'type' of
// that character: a password, CVV, SSN or recovery phrase pressed key by key asks like typed text. Command or Control
// make a shortcut, judged as before.

const policy = createPolicy({ sitePolicy: () => 'allow' })
const WEB = 'https://shop.example/account'
const key = (...keys) => ({ type: 'keypress', keys })
const hold = (...keys) => ({ type: 'hold_key', keys, duration_ms: 300 })
const judge = (action, target, url = WEB) => {
  const v = policy.classify(action, { url, target })
  return v.decision === 'allow' ? 'allow' : v.decision === 'handoff' ? `handoff:${v.rule}` : v.class
}
const entry = (name, extra = {}) => ({ tag: 'input', inputType: 'text', role: 'textbox', name, editable: true, ...extra })

test('CU-301: a printable key into a field named for a D-061 class asks sensitive_data', () => {
  for (const name of ['CVV', 'Social security number', 'IBAN', 'Card number', 'Expiration date', 'One-time code', 'Passport number']) {
    for (const action of [key('1'), key('A'), key('SHIFT', 'A'), key('ALT', '2'), key('-'), key('SPACE'), hold('7')]) {
      assert.equal(judge(action, entry(name)), 'sensitive_data', `${name}: ${action.type} ${action.keys.join('+')}`)
    }
  }
  assert.equal(judge(key('W'), { tag: 'textarea', role: 'textbox', name: 'Recovery phrase', editable: true }), 'sensitive_data', 'a recovery phrase area')
})

test('CU-301: a printable key into a password field or a password-named entry asks credential', () => {
  assert.equal(judge(key('SHIFT', 'H'), entry('Password', { inputType: 'password', isPassword: true })), 'credential', 'a password input')
  assert.equal(judge(key('h'), entry('Choose a passphrase')), 'credential', 'a passphrase-named entry')
  assert.equal(judge(key('4'), entry('', { autocomplete: 'one-time-code' })), 'credential', 'a one-time-code field by autocomplete')
  assert.equal(judge(hold('a'), entry('Password', { inputType: 'password' })), 'credential', 'a held key')
})

test('CU-301 on the desktop: the class policy judges the key; secure and password fields still hand off in app-policy', () => {
  const FIXTURE = 'ai.reflection.cu.fixture'
  const apps = createAppPolicy({ scope: [FIXTURE] })
  apps.grantScope(FIXTURE, { approved: true, answeredBy: 'api' })
  const at = (action, target) => {
    const v = apps.classify(action, { frontmostBundleId: FIXTURE, target: { origin: FIXTURE, fingerprint: 't', ...target } })
    return v.decision === 'allow' ? 'allow' : v.decision === 'handoff' ? `handoff:${v.rule}` : v.class
  }
  assert.equal(at(key('A'), { role: 'AXTextField', name: 'IBAN', editable: true }), 'sensitive_data', 'an IBAN field')
  assert.equal(at(key('1'), { role: 'AXTextField', name: 'SSN', editable: true }), 'sensitive_data', 'an SSN field')
  assert.equal(at(key('A'), { role: 'AXTextField', name: 'Password', editable: true }), 'handoff:password_field', 'a password-named field')
  assert.equal(at(key('A'), { role: 'AXSecureTextField', name: 'Password', editable: true, secure: true }), 'handoff:secure_field', 'a secure field')
  assert.equal(at(key('A'), { role: 'AXTextArea', name: 'Notes', editable: true }), 'allow', 'a notes area')
})

test('CU-301 negatives: a field named for nothing, a non-entry, and chords keep their rules', () => {
  assert.equal(judge(key('A'), { tag: 'textarea', role: 'textbox', name: 'Notes', editable: true }), 'allow', 'a notes field')
  assert.equal(judge(key('B'), { tag: 'ul', role: 'list', name: 'Bank accounts' }), 'allow', 'a letter that selects in a list is not text')
  assert.equal(judge(key('I'), { tag: 'div', role: 'listbox', name: 'IBAN' }), 'allow', 'nor in a list box named for a class')
  assert.equal(judge(key('I'), { role: 'AXTable', name: 'IBAN' }, 'desktop://'), 'allow', 'nor in a desktop table')
  assert.equal(judge(key('1'), { tag: 'input', role: 'textbox', name: 'CVV', editable: false }), 'allow', 'a read-only field takes no text')
  const password = entry('Password', { inputType: 'password' })
  assert.equal(judge(key('META', 'A'), password), 'allow', 'Command-A selects; a chord is not text')
  assert.equal(judge(key('CTRL', 'A'), password), 'allow', 'Control-A moves the caret')
  for (const named of [key('TAB'), key('BACKSPACE'), key('ARROWLEFT'), key('ESCAPE')]) {
    assert.equal(judge(named, password), 'allow', `${named.keys[0]} types nothing`)
  }
  assert.equal(judge(key('A'), null), 'allow', 'no focus, no field')
})

test('CU-301 in the loop: a password pressed key by key into a password field is declined unattended, nothing typed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cu-301-'))
  try {
    const START = 'http://127.0.0.1:43117/tasks/demo/'
    const control = createRunControl()
    const environment = createFakeEnvironment({ url: START, control })
    environment.focusedElement = async () => ({ ...entry('Password', { inputType: 'password', isPassword: true }), origin: 'http://127.0.0.1:43117', fingerprint: 'p' })
    const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [key('H'), key('U'), key('N'), key('T'), key('E'), key('R'), key('2')] }, { final: 'done' }] })
    const result = await runTask({ task: 'sign in', environment, model, sitePolicy: createSitePolicy({ startUrl: START }), control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false } })
    const first = readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action')[0]
    assert.deepEqual([first.decision, first.class], ['confirm', 'credential'])
    assert.equal(environment.log.length, 0, 'unattended, no key reached the field')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
