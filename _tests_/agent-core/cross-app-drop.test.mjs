import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-377 (High pending a live row): a desktop drag into another app hands it what was pressed - it asks, failing closed
// when either end's app is unknown; a drag inside one app stays free.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const drag = (from, to, dragSource = 'file') => {
  const v = policy.classify({ type: 'drag', path: [{ x: 10, y: 10 }, { x: 400, y: 300 }] }, { url: 'app:com.apple.finder', target: from, dropTarget: to, dragSource })
  return v.decision === 'allow' ? 'allow' : v.class
}
const FILE = { origin: 'com.apple.finder', role: 'AXRow', name: 'report.pdf' }

test('CU-377: a file dragged from Finder into Slack or Mail asks; an unknown end asks too', () => {
  assert.equal(drag(FILE, { origin: 'com.tinyspeck.slackmacgap', role: 'AXGroup', name: 'Message' }), 'permission')
  assert.equal(drag(FILE, { origin: 'com.apple.mail', role: 'AXTextArea', name: '' }), 'permission')
  assert.equal(drag(FILE, null), 'permission', 'a drop point that could not be read')
  assert.equal(drag(null, { origin: 'com.apple.mail', role: 'AXGroup' }, 'unknown'), 'permission', 'an unknown source')
})

test('CU-377 negatives: a drag inside one app and a drag that does not travel stay as judged', () => {
  assert.equal(drag({ origin: 'com.tinyspeck.slackmacgap', role: 'AXRow', name: 'general' }, { origin: 'com.tinyspeck.slackmacgap', role: 'AXRow', name: 'random' }, 'other'), 'allow', 'a reorder inside Slack')
  assert.equal(drag({ origin: 'com.example.app', role: 'AXSlider', name: 'Volume' }, null, 'other'), 'allow', 'a non-file drag over an unread point keeps today')
  assert.equal(drag(FILE, { origin: 'com.apple.finder', role: 'AXRow', name: 'Projects' }), 'allow', 'a file moved inside Finder')
  const v = policy.classify({ type: 'drag', path: [{ x: 10, y: 10 }] }, { url: 'app:com.apple.finder', target: FILE, dropTarget: null })
  assert.equal(v.decision, 'allow', 'a press-and-hold that does not travel')
  assert.equal(policy.classify({ type: 'drag', path: [{ x: 1, y: 1 }, { x: 9, y: 9 }] }, { url: 'https://example.com/', target: FILE, dropTarget: null }).rule === 'class:permission', false, 'the browser route keeps its own drop block')
})

test('CU-377: Upload, Attach and Share file controls ask (a file leaving through another app)', () => {
  for (const name of ['Upload', 'Upload files', 'Attach', 'Share file']) {
    const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'app:com.tinyspeck.slackmacgap', target: { origin: 'com.tinyspeck.slackmacgap', role: 'AXButton', name } })
    assert.notEqual(v.decision, 'allow', name)
  }
})

test('CU-377 in the loop: a Finder row with no filename is a file source - dragged into Slack it asks, unattended declined', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { createScriptedAdapter } = await import('../../_tools_/agent-core/adapter-scripted.mjs')
  const { createRunControl } = await import('../../_tools_/agent-core/control.mjs')
  const { createFakeEnvironment } = await import('../../_tools_/agent-core/fake-env.mjs')
  const { runTask } = await import('../../_tools_/agent-core/loop.mjs')
  const { createAppApprovals } = await import('../../_tools_/agent-core/app-approvals.mjs')
  const { readRun } = await import('../../_tools_/agent-core/trajectory.mjs')
  const tmp = mkdtempSync(join(tmpdir(), 'cu-377-'))
  try {
    const FINDER = 'com.apple.finder'
    const SLACK = 'com.tinyspeck.slackmacgap'
    const control = createRunControl()
    const environment = createFakeEnvironment({ kind: 'desktop', control, frontmost: FINDER, targets: ({ x }) => (x < 200 ? { origin: FINDER, role: 'AXRow', name: 'report' } : { origin: SLACK, role: 'AXGroup', name: 'Message' }) })
    const approvals = createAppApprovals({ path: join(tmp, 'a.json') })
    for (const app of [FINDER, SLACK]) approvals.grantAlways(app, { by: 'api' })
    const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'drag', path: [{ x: 100, y: 100 }, { x: 600, y: 400 }] }] }, { final: 'done' }] })
    const result = await runTask({ task: 'share the report', environment, model, control, runsDirectory: join(tmp, 'runs'), build: { commit: 'test', dirty: false }, apps: [FINDER, SLACK], appApprovals: approvals })
    const dragged = readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action' && e.action?.type === 'drag').at(-1)
    assert.equal(dragged.status, 'declined')
  } finally { rmSync(tmp, { recursive: true, force: true }) }
})

test('CU-377 paste half: a file copied in Finder and pasted into Slack asks; a TextEdit copy pasted there stays as today', () => {
  const paste = (source) => { const v = policy.classify({ type: 'keypress', keys: ['META', 'V'] }, { url: 'app:com.tinyspeck.slackmacgap', frontmostBundleId: 'com.tinyspeck.slackmacgap', target: { origin: 'com.tinyspeck.slackmacgap', role: 'AXTextArea', name: 'Message', editable: true }, paste: { fromOwner: false, source } }); return v.decision === 'allow' ? 'allow' : v.class }
  assert.equal(paste({ origin: 'com.apple.finder', role: 'AXRow', name: 'report' }), 'permission')
  assert.equal(paste({ origin: 'com.apple.TextEdit', role: 'AXTextArea', name: 'Untitled' }), 'allow')
})
