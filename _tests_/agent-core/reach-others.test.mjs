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

// CU-261 (cu-researcher; cu-coordinator: High): actions that reach other people or commit shared work.
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-261-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
const store = createAppApprovals({ path: join(tmp, 'a.json') })
store.grantAlways(FIXTURE, { by: 'api' })
const desktop = createAppPolicy({ scope: [FIXTURE], approvals: store })
const web = createPolicy({ sitePolicy: () => 'allow' })
const click = { type: 'click', x: 1, y: 1, button: 'left' }
const button = (name) => ({ origin: FIXTURE, role: 'AXButton', name, fingerprint: name, defaultButtonRead: true })
const judged = (v) => (v.decision === 'allow' ? 'allow' : v.class)
const onDesktop = (name) => judged(desktop.classify(click, { frontmostBundleId: FIXTURE, target: button(name) }))
const onWeb = (name) => judged(web.classify(click, { url: 'https://meet.example/', target: { role: 'button', name } }))

test('CU-261: calls, meetings, invitations, posts and shared-work commits ask submit - desktop and web', () => {
  for (const name of ['Call', 'Answer', 'FaceTime', 'Video Call', 'Audio call', 'Start Call', 'Join Meeting', 'Join call', 'Join with video',
    'Join now', 'Start meeting', 'Accept Invitation', 'Decline invitation', 'RSVP', 'Tweet', 'Approve', 'Merge', 'Merge pull request',
    'Squash and merge', 'Confirm merge', 'Deploy', 'Deploy to production', 'Run workflow']) {
    assert.equal(onDesktop(name), 'submit', `desktop ${name}`)
    assert.equal(onWeb(name), 'submit', `web ${name}`)
  }
})

test('CU-261: switching a camera or microphone on asks permission', () => {
  for (const name of ['Turn on camera', 'Turn on microphone', 'Turn On Video', 'Start Video', 'Unmute']) assert.equal(onDesktop(name), 'permission', name)
})

test('CU-261 with cu-researcher\'s 13:23Z sweep: unsubscribe, report spam and leave group submit; Revert to Saved deletes; signing out everywhere asks permission', () => {
  for (const name of ['Cancel Meeting', 'Cancel Event', 'Cancel meeting…', 'Send Cancellation']) {
    assert.equal(onDesktop(name), 'submit', `desktop ${name} (cu-researcher on #98)`)
    assert.equal(onWeb(name), 'submit', `web ${name}`)
  }
  for (const name of ['Unsubscribe', 'Report Spam', 'Report Junk', 'Leave Group', 'Leave conversation', 'Leave channel']) assert.equal(onDesktop(name), 'submit', name)
  for (const name of ['Revert to Saved', 'Revert All Changes']) assert.equal(onDesktop(name), 'delete', name)
  for (const name of ['Sign Out of All Devices', 'Log out everywhere']) assert.equal(onDesktop(name), 'permission', name)
  for (const name of ['Revert', 'Sign Out', 'Report', 'Leave']) assert.equal(onDesktop(name), 'allow', `${name} alone`)
})

test('CU-286 (real-app wordings): Ask to join and Start huddle submit; Allow always and Remember this decision ask permission - desktop and web; the deliberate exclusions stay free', () => {
  for (const name of ['Ask to join', 'Ask to Join', 'Start huddle', 'Start a huddle', 'Join huddle']) {
    assert.equal(onDesktop(name), 'submit', `desktop ${name}`)
    assert.equal(onWeb(name), 'submit', `web ${name}`)
  }
  for (const name of ['Allow always', 'Allow Always', 'Remember this decision', 'Remember decision']) {
    assert.equal(onDesktop(name), 'permission', `desktop ${name}`)
    assert.equal(onWeb(name), 'permission', `web ${name}`)
  }
  for (const name of ['Join', "Don't show again", 'Trust this computer', 'Allow', 'Huddles', 'Huddle notes', 'Remember me', 'Ask a question']) assert.equal(onDesktop(name), 'allow', `${name} stays free (a deliberate exclusion or no match)`)
})

test('CU-261 named limits: a bare Accept, Connect, Join or Follow, and Call or Merge inside a longer name, stay free', () => {
  for (const name of ['Accept', 'Accept all cookies', 'Connect', 'Join', 'Follow', 'Call Stack', 'Merge Cells', 'Merge All Windows', 'Approved', 'Recall', 'Answers']) {
    assert.equal(onDesktop(name), 'allow', name)
  }
})

test('CU-261 through the loop: a click on Join Meeting is declined unattended, nothing posted', async () => {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control })
  environment.inspectPoint = async () => button('Join Meeting')
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [click] }, { final: 'done' }] })
  const result = await runTask({ task: 'check the calendar', environment, model, control, runsDirectory: join(tmp, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
  const action = readRun(result.trajectoryDir).events.find((e) => e.kind === 'action')
  assert.deepEqual([action.decision, action.class], ['confirm', 'submit'])
  assert.equal(environment.log.filter((x) => (x.action ?? x)?.type).length, 0)
})
