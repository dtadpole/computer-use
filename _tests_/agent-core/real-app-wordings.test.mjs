import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-288 (cu-researcher's real-app wordings, round 2; cu-coordinator: High): a trial with its length, a one-time code
// named by its length, a booking, an upgrade or a renewal, and a tax filing.
const STORE = 'com.apple.AppStore'
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-288-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
const store = createAppApprovals({ path: join(tmp, 'a.json') })
for (const id of [STORE, FIXTURE]) store.grantAlways(id, { by: 'api' })
const desktop = createAppPolicy({ scope: [STORE, FIXTURE], approvals: store })
const web = createPolicy({ sitePolicy: () => 'allow' })
const click = { type: 'click', x: 1, y: 1, button: 'left' }
const button = (app, name) => ({ origin: app, role: 'AXButton', name, fingerprint: name, defaultButtonRead: true })
const onWeb = (name) => web.classify(click, { url: 'https://shop.example/', target: { role: 'button', name } })
const judged = (v) => (v.decision === 'allow' ? 'allow' : v.class)

test('CU-288: an App Store trial written with its length asks purchase', () => {
  for (const name of ['Start 7-day free trial', 'Start 1 month free trial', 'Try 1 month free', 'Try 3 months free', '30-day free trial']) {
    const v = desktop.classify(click, { frontmostBundleId: STORE, target: button(STORE, name) })
    assert.deepEqual([v.decision, v.class], ['confirm', 'purchase'], name)
  }
  assert.equal(desktop.classify(click, { frontmostBundleId: STORE, target: button(STORE, 'Trial Apps') }).decision, 'allow')
})

test('CU-288: a booking, an upgrade or a renewal asks purchase; a tax filing asks submit - desktop and web', () => {
  for (const [name, cls] of [['Book now', 'purchase'], ['Upgrade plan', 'purchase'], ['Upgrade now', 'purchase'], ['Renew subscription', 'purchase'],
    ['Renew now', 'purchase'], ['File return', 'submit'], ['File tax return', 'submit'], ['E-file', 'submit']]) {
    assert.equal(judged(onWeb(name)), cls, `web ${name}`)
    assert.equal(judged(desktop.classify(click, { frontmostBundleId: FIXTURE, target: button(FIXTURE, name) })), cls, `desktop ${name}`)
  }
  for (const name of ['Bookmark', 'Bookings', 'Upgrade guide', 'File', 'Returns policy', 'Notebook']) assert.equal(judged(onWeb(name)), 'allow', name)
})

test('CU-288: a one-time code named by its length asks sensitive_data when typed', () => {
  for (const name of ['6-digit code', 'Enter the six-digit code', 'Enter the 6 digit code we sent', '8-digit verification code']) {
    const v = web.classify({ type: 'type', text: '482913' }, { url: 'https://login.example/', target: { role: 'textbox', name, editable: true } })
    assert.equal(v.decision, 'confirm', name)
    assert.ok(v.classes?.includes('sensitive_data') || v.class === 'sensitive_data', `${name}: ${v.class}`)
  }
  const plain = web.classify({ type: 'type', text: 'hello' }, { url: 'https://login.example/', target: { role: 'textbox', name: 'Discount code', editable: true } })
  assert.equal(plain.decision, 'allow', 'a discount code is not a one-time code')
})

test('CU-288 on cu-researcher\'s review: any length and either form, in any app or page; Free trial info stays free', () => {
  for (const name of ['Start 14-day free trial', 'Start 2-week free trial', 'Try 3 months free', 'Try 6 months free', 'Start free trial', 'Try it free', 'Try free for 30 days', 'Get 3 months free']) {
    assert.equal(judged(onWeb(name)), 'purchase', `web ${name}`)
    assert.equal(judged(desktop.classify(click, { frontmostBundleId: STORE, target: button(STORE, name) })), 'purchase', `App Store ${name}`)
    assert.equal(judged(desktop.classify(click, { frontmostBundleId: FIXTURE, target: button(FIXTURE, name) })), 'purchase', `desktop ${name}`)
  }
  for (const name of ['Free trial info', 'Free trial ends soon', 'Trial version', 'Free']) {
    assert.equal(judged(onWeb(name)), 'allow', `web ${name}`)
    assert.equal(judged(desktop.classify(click, { frontmostBundleId: STORE, target: button(STORE, name) })), 'allow', `App Store ${name}`)
  }
})
