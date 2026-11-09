import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { apiController } from '../../_tools_/agent-core/consent.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'
import { createSitePolicy } from '../../_tools_/agent-core/sites.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'

// CU-302 (design note 0.1, D-088): the browser fills a saved login on load, so a 'Sign in' click submits the owner's
// saved password unasked. The browser driver reports, on the targets that submit a form, the descriptors of that form's
// fields matching :autofill (CU-319: never a value); a click, Space or Return there asks by those fields' names and is
// never pre-approved. A failed read asks credential; no field at all (an older driver, the desktop) is unchanged.

const policy = createPolicy({ sitePolicy: () => 'allow' })
const WEB = 'https://shop.example/login'
const click = { type: 'click', x: 10, y: 10, button: 'left' }
const key = (...keys) => ({ type: 'keypress', keys })
const verdict = (v) => (v.decision === 'allow' ? 'allow' : `${v.class}/${v.rule}`)
const judge = (action, target, url = WEB, p = policy) => verdict(p.classify(action, { url, target }))
const password = { tag: 'input', inputType: 'password', name: 'Password', autocomplete: 'current-password' }
const email = { tag: 'input', inputType: 'email', name: 'Email', autocomplete: 'username' }
const signIn = (autofilledFields, extra = {}) => ({ tag: 'button', role: 'button', name: 'Sign in', inputType: 'submit', autofilledFields, ...extra })

test('CU-302: a click, Space or Return that submits a form holding an autofilled password asks credential', () => {
  assert.equal(judge(click, signIn([email, password])), 'credential/autofill:credential', 'a Sign in click')
  assert.equal(judge(key('SPACE'), signIn([password])), 'credential/autofill:credential', 'Space on the focused button')
  const field = { tag: 'input', inputType: 'email', role: 'textbox', name: 'Email', editable: true, autofilledFields: [email, password] }
  assert.equal(judge(key('ENTER'), field), 'credential/autofill:credential', 'Return in a field of that form (implicit submit)')
  assert.equal(judge(click, signIn([{ tag: 'input', inputType: 'password', name: '' }])), 'credential/autofill:credential', 'an unnamed password field, by its type')
})

test('CU-302 (cu-verifier): a field the browser autofilled and the run then edited still asks - one typed character never launders a saved secret', () => {
  assert.equal(judge(click, signIn([{ ...password, edited: true }])), 'credential/autofill:credential')
})

test('CU-302 (cu-verifier\'s pin): typing into an autofilled password asks by itself, and the submit asks again', () => {
  assert.equal(judge({ type: 'type', text: 'x' }, { tag: 'input', inputType: 'password', role: 'textbox', name: 'Password', editable: true }), 'credential/class:credential', 'the edit itself asks')
  // The driver keeps reporting a field once seen autofilled, marked edited (#200). Asked again at the submit by choice:
  // the edit's approval covered a keystroke, not sending the rest of the saved secret.
  assert.equal(judge(click, signIn([{ ...password, edited: true }])), 'credential/autofill:credential', 'Sign in afterwards')
  assert.equal(judge(click, signIn([{ tag: 'input', inputType: 'text', name: 'Username', autocomplete: 'username', edited: true }])), 'allow', 'an edited username alone stays free')
})

test('CU-302 (cu-researcher N1): a saved card is named as one in the reason', () => {
  const v = policy.classify(click, { url: WEB, target: signIn([{ tag: 'input', inputType: 'text', name: '', autocomplete: 'cc-number' }]) })
  assert.equal(v.class, 'credential', 'cc-* autocomplete is a credential field, as D-061 has it everywhere')
  assert.match(v.reason, /saved card/)
  assert.match(policy.classify(click, { url: WEB, target: signIn([password]) }).reason, /saved login/)
})

test('CU-302: an autofilled card or D-061 field asks too; an autofilled username alone does not', () => {
  assert.equal(judge(click, signIn([{ tag: 'input', inputType: 'text', name: 'Card number', autocomplete: 'cc-number' }])), 'credential/autofill:credential', 'cc-* autocomplete is a credential field')
  assert.equal(judge(click, signIn([{ tag: 'input', inputType: 'text', name: 'Card number' }])), 'sensitive_data/autofill:sensitive_data', 'a card-number name')
  assert.equal(judge(click, signIn([{ tag: 'input', inputType: 'text', name: 'Username', autocomplete: 'username' }])), 'allow', 'a username is not a secret')
})

test('CU-302: never pre-approved - a caller\'s credential pre-approval covers its own secrets, not saved ones', () => {
  const lenient = createPolicy({ sitePolicy: () => 'allow', preApprovals: [{ class: 'credential' }, { class: 'submit' }, { class: 'sensitive_data' }] })
  assert.equal(judge(click, signIn([password]), WEB, lenient), 'credential/autofill:credential')
  assert.equal(judge({ type: 'type', text: 'hunter2' }, { tag: 'input', inputType: 'password', role: 'textbox', name: 'Password', editable: true }, WEB, lenient), 'allow', 'a typed caller secret stays pre-approvable')
})

test('CU-302: a failed autofill read asks credential; no report, the desktop and non-submit actions are unchanged', () => {
  assert.equal(judge(click, signIn(null, { autofillRead: false })), 'credential/autofill:credential', 'the read threw')
  assert.equal(judge(click, signIn(undefined)), 'allow', 'an older driver: today\'s judgement')
  assert.equal(judge(click, signIn([])), 'allow', 'nothing autofilled')
  assert.equal(judge(click, { role: 'AXButton', name: 'Sign in', autofilledFields: [password] }, 'desktop://'), 'allow', 'the desktop reads no :autofill (Q2 decides its signal)')
  assert.equal(judge({ type: 'scroll', x: 1, y: 1, scroll_x: 0, scroll_y: 50 }, signIn([password])), 'allow', 'a scroll submits nothing')
  assert.equal(judge(key('TAB'), signIn([password])), 'allow', 'Tab submits nothing')
})

test('CU-302 in the loop: unattended, a Sign in click on an autofilled form is declined and never performed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cu-302-'))
  try {
    const START = 'http://127.0.0.1:43117/tasks/demo/'
    const control = createRunControl()
    const environment = createFakeEnvironment({ url: START, control })
    environment.inspectPoint = async () => ({ ...signIn([email, password]), origin: 'http://127.0.0.1:43117', fingerprint: 's' })
    const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [click] }, { final: 'done' }] })
    const result = await runTask({ task: 'open my orders', environment, model, sitePolicy: createSitePolicy({ startUrl: START }), control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false } })
    const event = readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action').pop()
    assert.deepEqual([event.decision, event.class, event.rule], ['confirm', 'credential', 'autofill:credential'])
    assert.equal(environment.log.length, 0, 'unattended, the click never reached the page')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('CU-302 in the loop (cu-verifier): a form autofilled between the ask and the post is asked again for the new class', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cu-302-late-'))
  try {
    const START = 'http://127.0.0.1:43117/tasks/demo/'
    const control = createRunControl()
    const environment = createFakeEnvironment({ url: START, control })
    let reads = 0
    const send = { tag: 'button', role: 'button', name: 'Send', inputType: 'submit', origin: 'http://127.0.0.1:43117', fingerprint: 's' }
    environment.inspectPoint = async () => { reads += 1; return reads === 1 ? send : { ...send, autofilledFields: [password] } }
    const api = apiController()
    const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [click] }, { final: 'done' }] })
    const answers = (async () => {
      const first = await api.waitForRequest(2000)
      assert.equal(first.class, 'submit')
      api.respond({ id: first.id, approved: true })
      await new Promise((r) => setTimeout(r, 10))
      const second = await api.waitForRequest(2000)
      assert.equal(second.class, 'credential')
      assert.match(second.what, /new since it was approved/)
      api.respond({ id: second.id, approved: false })
    })()
    await runTask({ task: 'send the form', environment, model, sitePolicy: createSitePolicy({ startUrl: START }), control, controller: api, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false } })
    await answers
    assert.equal(environment.log.length, 0, 'the saved password was never submitted')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
