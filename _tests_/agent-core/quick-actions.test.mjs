import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'

// CU-382 (Medium): a Finder Quick Action runs an owner's Automator workflow, like a Service - it asks; a menu whose
// context could not be walked asks unknown.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const FINDER = 'com.apple.finder'
const judge = (action, target, extra = {}) => { const v = policy.classify(action, { url: `app:${FINDER}`, target, ...extra }); return v.decision === 'allow' ? 'allow' : `${v.class}/${v.rule}` }

test('CU-382: a click on a Quick Actions item, a preview-pane button or a chord bound to one asks', () => {
  assert.equal(judge({ type: 'click', x: 1, y: 1, button: 'left' }, { origin: FINDER, role: 'AXMenuItem', name: 'Resize Images', quickActions: true }), 'permission/quick_action')
  assert.equal(judge({ type: 'click', x: 1, y: 1, button: 'left' }, { origin: FINDER, role: 'AXButton', name: 'Convert', quickActions: true }), 'permission/quick_action')
  assert.equal(judge({ type: 'keypress', keys: ['META', 'SHIFT', 'R'] }, { origin: FINDER, role: 'AXRow', name: 'photo' }, { boundMenuItem: { title: 'Resize Images', quickActions: true } }), 'permission/quick_action')
})

test('CU-382: an item in a menu whose context could not be walked asks unknown', () => {
  assert.equal(judge({ type: 'click', x: 1, y: 1, button: 'left' }, { origin: FINDER, role: 'AXMenuItem', name: 'Process', menuContextUnread: true }), 'unknown_target/menu:context_unread')
})

test('CU-382 negatives: an unmarked menu item keeps its rules', () => {
  for (const name of ['Rotate Left', 'Markup', 'Trim', 'Compress', 'Create PDF', 'More\u2026', 'Customize\u2026']) {
    assert.equal(judge({ type: 'click', x: 1, y: 1, button: 'left' }, { origin: FINDER, role: 'AXMenuItem', name, quickActions: true }), 'allow', name)
  }
  assert.equal(judge({ type: 'click', x: 1, y: 1, button: 'left' }, { origin: FINDER, role: 'AXMenuItem', name: 'Get Info' }), 'allow')
})

test('CU-382: a Quick Action asks each time (once only), and Open in Terminal asks', () => {
  const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: `app:${FINDER}`, target: { origin: FINDER, role: 'AXMenuItem', name: 'Resize Images', quickActions: true } })
  assert.equal(v.askEachTime, true)
  assert.equal(judge({ type: 'click', x: 1, y: 1, button: 'left' }, { origin: FINDER, role: 'AXMenuItem', name: 'Open in Terminal' }), 'permission/quick_action')
})

// D-103 (cu-researcher 08:07Z): the chord path end to end - the loop's bound item keeps the Quick Action mark and the
// policy finds it in the bound list by name, so a chord bound to a custom workflow asks and a built-in one stays free.
const chordTmp = mkdtempSync(join(tmpdir(), 'cu-382-chord-'))
after(() => rmSync(chordTmp, { recursive: true, force: true }))
const chordRun = async (label, answer) => {
  const FINDER = 'com.apple.finder'
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control, frontmost: FINDER, focused: { origin: FINDER, role: 'AXRow', name: 'report.pdf' } })
  environment.menuItemForChord = async () => answer
  const approvals = createAppApprovals({ path: join(chordTmp, `${label}.json`) })
  approvals.grantAlways(FINDER, { by: 'api' })
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'keypress', keys: ['META', 'SHIFT', 'U'] }] }, { final: 'done' }] })
  const result = await runTask({ task: 'tidy', environment, model, control, runsDirectory: join(chordTmp, label), build: { commit: 'test', dirty: false }, apps: [FINDER], appApprovals: approvals })
  return readRun(result.trajectoryDir).events.find((e) => e.kind === 'action' && e.action?.type === 'keypress')
}

test('CU-382 through the loop: a chord bound to a custom Quick Action asks; one bound to a built-in stays free', async () => {
  const custom = await chordRun('custom', { items: [{ name: 'Upload to S3', quickActions: true, keyEquivalent: { char: 'U', modifiers: 1 } }] })
  assert.equal(custom.rule, 'quick_action')
  assert.notEqual(custom.status, 'done')
  const single = await chordRun('single', { name: 'Upload to S3', quickActions: true, keyEquivalent: { char: 'U', modifiers: 1 } })
  assert.equal(single.rule, 'quick_action')
  const builtIn = await chordRun('builtin', { items: [{ name: 'Rotate Left', quickActions: true, keyEquivalent: { char: 'U', modifiers: 1 } }] })
  assert.notEqual(builtIn.rule, 'quick_action')
})
