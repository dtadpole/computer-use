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
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'

// CU-398 (High): a click or Return/Space on an Apple-menu item (appleMenu, marked by the helper by structure) is blocked
// as system_shortcut like its chord; so is a loginwindow confirmation button. An app's own 'Restart Level' stays as today.
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-398-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
const store = createAppApprovals({ path: join(tmp, 'approvals.json') })
store.grantAlways(FIXTURE, { by: 'api' })
const policy = createAppPolicy({ scope: [FIXTURE], approvals: store })
const click = { type: 'click', x: 10, y: 10, button: 'left' }
const item = (name, extra = {}) => ({ origin: FIXTURE, role: 'AXMenuItem', name, ...extra })

test('CU-398: a click, Return or Space on an Apple-menu item blocks as system_shortcut', () => {
  for (const name of ['Restart\u2026', 'Shut Down\u2026', 'Log Out Alex\u2026', 'Force Quit\u2026', 'Sleep', 'Lock Screen', 'Report.pdf']) {
    const verdict = policy.classify(click, { frontmostBundleId: FIXTURE, target: item(name, { appleMenu: true }) })
    assert.deepEqual([verdict.decision, verdict.rule], ['block', 'system_shortcut'], name)
  }
  for (const keys of [['RETURN'], ['SPACE']]) {
    const verdict = policy.classify({ type: 'keypress', keys }, { frontmostBundleId: FIXTURE, target: item('Restart\u2026', { appleMenu: true }) })
    assert.deepEqual([verdict.decision, verdict.rule], ['block', 'system_shortcut'], keys[0])
  }
  const confirm = policy.classify(click, { frontmostBundleId: FIXTURE, target: { origin: 'com.apple.loginwindow', role: 'AXButton', name: 'Restart' } })
  assert.deepEqual([confirm.decision, confirm.rule], ['block', 'system_shortcut'], 'the loginwindow confirmation')
})

test('CU-398 negatives: the same names without appleMenu follow the existing rules; arrows in the Apple menu are not activation', () => {
  for (const name of ['Restart Level', 'Restart\u2026', 'Log Out']) assert.notEqual(policy.classify(click, { frontmostBundleId: FIXTURE, target: item(name) }).rule, 'system_shortcut', name)
  assert.notEqual(policy.classify({ type: 'keypress', keys: ['ARROWDOWN'] }, { frontmostBundleId: FIXTURE, target: item('Restart\u2026', { appleMenu: true }) }).rule, 'system_shortcut')
})

test('CU-398 through the loop (D-103): a click whose inspected target is an Apple-menu item is blocked, nothing performed', async () => {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control, frontmost: FIXTURE, targets: () => item('Shut Down\u2026', { appleMenu: true }) })
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [click] }, { final: 'done' }] })
  const result = await runTask({ task: 'tidy', environment, model, control, runsDirectory: join(tmp, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
  const ev = readRun(result.trajectoryDir).events.find((e) => e.kind === 'action' && e.action?.type === 'click')
  assert.equal(ev.rule, 'system_shortcut')
  assert.notEqual(ev.status, 'done')
})
