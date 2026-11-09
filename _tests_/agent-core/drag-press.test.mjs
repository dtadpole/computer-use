import assert from 'node:assert/strict'
import { test } from 'node:test'

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'

// CU-377: a drag pressed on nothing at all is an unknown source and asks; these rows press a control (the frontmost app's).
const PRESS_ELEMENT = () => ({ origin: 'ai.reflection.cu.fixture', role: 'AXGroup', name: 'Canvas' })

// CU-140: a long press or a drag is judged by the target where the button goes down, like a click on it.

const policy = createPolicy({ sitePolicy: () => 'allow' })
const decide = (action, target) => policy.classify(action, { url: 'app:ai.reflection.cu.fixture', target })
const del = { role: 'AXButton', name: 'Delete archive (hold)' }

test('a long press on a destructive control is asked, as its click is', () => {
  assert.deepEqual([decide({ type: 'drag', path: [{ x: 5, y: 5, holdMs: 1700 }] }, del).decision, decide({ type: 'drag', path: [{ x: 5, y: 5, holdMs: 1700 }] }, del).class], ['confirm', 'delete'])
  assert.equal(decide({ type: 'drag', path: [{ x: 5, y: 5 }, { x: 40, y: 5 }, { x: 5, y: 5 }] }, del).class, 'delete', 'a drag released back over it')
})

test('a file, row or image at the press point is not judged by its name; S6\'s moves into folders ask nothing', () => {
  const into = (folder) => ({ url: 'app:ai.reflection.cu.fixture', target: { role: 'AXRow', name: 'remove-old-notes.txt' }, dropTarget: { role: 'AXRow', name: folder } })
  assert.equal(policy.classify({ type: 'drag', path: [{ x: 5, y: 5 }, { x: 300, y: 200 }] }, into('Notes')).decision, 'allow', 'dragging a destructively named file moves it')
  for (const folder of ['Archive', 'Q3', 'Drafts', 'Shared']) {
    const ctx = { url: 'app:ai.reflection.cu.fixture', target: { role: 'AXRow', name: 'doc-104' }, dropTarget: { role: 'AXRow', name: folder } }
    assert.equal(policy.classify({ type: 'drag', path: [{ x: 5, y: 5 }, { x: 300, y: 200 }] }, ctx).decision, 'allow', folder)
  }
  assert.equal(decide({ type: 'drag', path: [{ x: 5, y: 5 }, { x: 300, y: 200 }] }, { role: 'AXGroup', name: null }).decision, 'allow', 'a canvas stroke on an unnamed target is not asked')
})

test('a drag pressed on a Delete button and released elsewhere is asked; a drop onto a Trash or Delete zone is asked', () => {
  const pressed = { url: 'app:ai.reflection.cu.fixture', target: del, dropTarget: { role: 'AXGroup', name: 'Canvas' } }
  assert.equal(policy.classify({ type: 'drag', path: [{ x: 5, y: 5 }, { x: 300, y: 200 }] }, pressed).class, 'delete', 'the press happened')
  for (const zone of ['Trash', 'Bin', 'Delete zone', 'Remove']) {
    const ctx = { url: 'app:ai.reflection.cu.fixture', target: { role: 'AXRow', name: 'doc-104' }, dropTarget: { role: 'AXGroup', name: zone } }
    assert.equal(policy.classify({ type: 'drag', path: [{ x: 5, y: 5 }, { x: 300, y: 200 }] }, ctx).class, 'delete', zone)
  }
})

test('trash and bin match as whole words: a drop onto Binder or Cabinet is not asked (cu-verifier)', () => {
  for (const zone of ['Binder', 'Cabinet', 'Combine', 'Trashy notes']) {
    const ctx = { url: 'app:ai.reflection.cu.fixture', target: { role: 'AXRow', name: 'doc-104' }, dropTarget: { role: 'AXGroup', name: zone } }
    assert.equal(policy.classify({ type: 'drag', path: [{ x: 5, y: 5 }, { x: 300, y: 200 }] }, ctx).decision, 'allow', zone)
  }
})

test('a travelling drag whose drop point has no name is marked dropTargetUnnamed for the scan', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cu-drop-'))
  try {
    const FIXTURE = 'ai.reflection.cu.fixture'
    const control = createRunControl()
    const environment = createFakeEnvironment({ targets: PRESS_ELEMENT, kind: 'desktop', control })
    environment.inspectPoint = async ({ x }) => (x < 100 ? { origin: FIXTURE, role: 'AXRow', name: 'doc-104', fingerprint: 'row' } : { origin: FIXTURE, role: 'AXGroup', name: null, fingerprint: 'canvas' })
    const store = createAppApprovals({ path: join(dir, 'a.json') })
    store.grantAlways(FIXTURE, { by: 'api' })
    const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'drag', path: [{ x: 50, y: 50 }, { x: 600, y: 400 }] }] }, { final: 'done' }] })
    const result = await runTask({ task: 'move it', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
    const drag = readRun(result.trajectoryDir).events.find((e) => e.kind === 'action' && e.action?.type === 'drag')
    assert.equal(drag.dropTargetUnnamed, true)
    assert.equal(drag.decision, 'allow', 'blind, so unjudged - as today')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
