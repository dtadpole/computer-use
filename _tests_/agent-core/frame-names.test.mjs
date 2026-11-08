import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'
import { createSitePolicy } from '../../_tools_/agent-core/sites.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'

// CU-297 (design note 0.1): the browser driver's focus read stops at a cross-origin frame's host element, so text typed
// into a hosted payment or sign-in field meets { tag: 'iframe', name: <the frame's title> } - not a text entry. On a web
// page (1) that title meets the field-name rules as an entry's name would, and (2) a Return or typed line break there
// asks submit (the frame's form and submit button are unread - CU-190's web twin).

const policy = createPolicy({ sitePolicy: () => 'allow' })
const WEB = 'https://shop.example/checkout'
const frame = (name, tag = 'iframe') => ({ tag, role: 'Iframe', name, editable: false, origin: 'https://shop.example' })
const type = (text) => ({ type: 'type', text })
const key = (...keys) => ({ type: 'keypress', keys })
const judge = (action, target, extra = {}, url = WEB) => {
  const v = policy.classify(action, { url, target, ...extra })
  return v.decision === 'allow' ? 'allow' : v.class
}

test('CU-297 rule 1: text typed into a frame named for a payment or sign-in field asks by that name', () => {
  assert.equal(judge(type('123'), frame('Secure Credit Card Frame - CVV')), 'sensitive_data', 'Braintree CVV')
  assert.equal(judge(type('1234'), frame('Secure CVC input frame')), 'sensitive_data', 'Stripe CVC')
  assert.equal(judge(type('12/29'), frame('Secure Credit Card Frame - Expiration Date')), 'sensitive_data', 'Braintree expiry')
  assert.equal(judge(type('12 / 29'), frame('Secure expiration date input frame')), 'sensitive_data', 'Stripe expiry')
  assert.equal(judge(type('correct-horse'), frame('Password')), 'credential', 'a framed password field')
  for (const tag of ['frame', 'object', 'embed', 'fencedframe']) {
    assert.equal(judge(type('123'), frame('CVV', tag)), 'sensitive_data', `a ${tag} host`)
  }
})

test('CU-297 rule 1: a keystroke paste into such a frame is judged by the same name', () => {
  const paste = key('META', 'V')
  assert.equal(judge(paste, frame('Secure CVC input frame'), { paste: { fromOwner: false, text: '' } }), 'sensitive_data', 'a paste into the CVC frame')
  assert.equal(judge(paste, frame('Password'), { paste: { fromOwner: false, text: '' } }), 'credential', 'a paste into a framed password')
})

test('CU-297 rule 1 negatives: a frame named for nothing takes text; the value rules still judge; the desktop is unchanged', () => {
  assert.equal(judge(type('hello there'), frame('Comments')), 'allow', 'a comments frame')
  assert.equal(judge(type('Great product, fast delivery'), frame('Rich Text Area')), 'allow', 'an editor frame')
  const card = ['4242', '4242', '4242', '4242'].join(' ')
  assert.equal(judge(type(card), frame('Secure card number input frame')), 'sensitive_data', 'a card number by its value')
  assert.equal(judge(type('123'), { role: 'AXGroup', name: 'CVV', tag: 'iframe' }, {}, 'desktop://'), 'allow', 'the desktop reads no frame host')
  assert.equal(judge(type('123'), null), 'allow', 'a null focus has no name to judge')
})

test('CU-297 rule 2: a Return or typed line break in a frame host asks submit; a null focus keeps today\'s rule', () => {
  for (const action of [key('ENTER'), key('SHIFT', 'ENTER'), key('KP_ENTER'), type('done\n'), { type: 'hold_key', keys: ['ENTER'] }]) {
    assert.equal(judge(action, frame('Secure payment input frame')), 'submit', JSON.stringify(action))
  }
  assert.equal(judge(key('ENTER'), null), 'allow', 'no focus: a body has no form')
  assert.equal(judge(key('TAB'), frame('Secure payment input frame')), 'allow', 'Tab moves on')
  assert.equal(judge(key('ENTER'), { ...frame('Notes'), defaultButton: null, defaultButtonRead: true }, {}, 'desktop://'), 'allow', 'the desktop keeps its default-button reading')
  // A held confirm reads no focus: the Return answers the dialog alone.
  const held = policy.classify(key('ENTER'), { url: WEB, target: null, dialog: { type: 'confirm', message: 'Leave this page?' } })
  assert.deepEqual(held.classes, ['page_dialog'])
})

test('CU-297 in the loop: unattended, a CVV typed into its hosted frame is declined and never typed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cu-297-'))
  try {
    const START = 'http://127.0.0.1:43117/tasks/demo/'
    const control = createRunControl()
    const environment = createFakeEnvironment({ url: START, control })
    environment.focusedElement = async () => ({ ...frame('Secure Credit Card Frame - CVV'), origin: 'http://127.0.0.1:43117', fingerprint: 'f' })
    const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [type('123')] }, { final: 'done' }] })
    const result = await runTask({ task: 'pay the invoice', environment, model, sitePolicy: createSitePolicy({ startUrl: START }), control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false } })
    const event = readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action').pop()
    assert.deepEqual([event.decision, event.class], ['confirm', 'sensitive_data'])
    assert.equal(environment.log.length, 0, 'unattended, nothing was typed')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
