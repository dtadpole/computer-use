import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'

// CU-258 (cu-researcher): an app's own standing-choice controls outlive the run, so they ask permission.
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-258-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
const store = createAppApprovals({ path: join(tmp, 'a.json') })
store.grantAlways(FIXTURE, { by: 'api' })
const desktop = createAppPolicy({ scope: [FIXTURE], approvals: store })
const web = createPolicy({ sitePolicy: () => 'allow' })
const click = { type: 'click', x: 1, y: 1, button: 'left' }
const button = (name, role = 'AXButton') => ({ origin: FIXTURE, role, name, fingerprint: name, defaultButtonRead: true })
const judged = (v) => (v.decision === 'allow' ? 'allow' : v.class)
const STANDING = ['Always Allow', 'Always Trust', 'Always Open', 'Allow access', "Don't ask again", 'Don\u2019t Ask Again', 'Do not ask again',
  'Remember my choice', 'Never for This Website', 'Set as Default', 'Make Default']

test('CU-258: a standing-choice control asks permission - desktop button or checkbox, and on a web page', () => {
  for (const name of STANDING) {
    assert.equal(judged(desktop.classify(click, { frontmostBundleId: FIXTURE, target: button(name) })), 'permission', `desktop ${name}`)
    assert.equal(judged(web.classify(click, { url: 'https://app.example/', target: { role: 'button', name } })), 'permission', `web ${name}`)
  }
  assert.equal(judged(desktop.classify(click, { frontmostBundleId: FIXTURE, target: button("Don't ask again", 'AXCheckBox') })), 'permission', 'a checkbox')
})

test('CU-258 negatives: a bare Allow, Always on Top and Remember Me stay free (named limit: a cookie banner\'s Allow)', () => {
  for (const name of ['Allow', 'Allow all cookies', 'Always on Top', 'Remember me', 'Default size', 'Ask again later']) {
    assert.equal(judged(desktop.classify(click, { frontmostBundleId: FIXTURE, target: button(name) })), 'allow', name)
  }
})

test('CU-258 through the loop: a click on Always Allow is declined unattended, nothing posted', async () => {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control })
  environment.inspectPoint = async () => button('Always Allow')
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [click] }, { final: 'done' }] })
  const result = await runTask({ task: 'continue', environment, model, control, runsDirectory: join(tmp, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
  const action = readRun(result.trajectoryDir).events.find((e) => e.kind === 'action')
  assert.deepEqual([action.decision, action.class], ['confirm', 'permission'])
  assert.equal(environment.log.filter((x) => (x.action ?? x)?.type).length, 0)
})

test('CU-289: storing a credential asks permission - desktop button and web page; Update password hands off; staying signed in and plain saves stay free', () => {
  for (const name of ['Save password', 'Save Passwords', 'Remember password', 'Save login', 'Save login info', 'Remember login', 'Save to Keychain']) {
    assert.equal(judged(desktop.classify(click, { frontmostBundleId: FIXTURE, target: button(name) })), 'permission', `desktop ${name}`)
    assert.equal(judged(web.classify(click, { url: 'https://app.example/', target: { role: 'button', name } })), 'permission', `web ${name}`)
  }
  const update = desktop.classify(click, { frontmostBundleId: FIXTURE, target: button('Update password') })
  assert.deepEqual([update.decision, update.rule], ['handoff', 'password_change'], 'Update password: the stricter hand-off stands')
  for (const name of ['Remember me', 'Save', 'Save draft', 'Save as draft', 'Save changes', 'Password', 'Forgot password?', 'Show password']) {
    assert.equal(judged(desktop.classify(click, { frontmostBundleId: FIXTURE, target: button(name) })), 'allow', name)
  }
})

