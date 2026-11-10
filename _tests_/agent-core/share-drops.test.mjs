import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'

// CU-392 (High pending a live row): a Finder file dropped onto a share destination - AirDrop, a person in its window, a
// Shared folder, a Drop Box, a server volume - sends it away even inside Finder; it asks. Through the real loop (D-103).
const FINDER = 'com.apple.finder'
const drop = async (dropTarget) => {
  const tmp = mkdtempSync(join(tmpdir(), 'cu-392-'))
  try {
    const control = createRunControl()
    const environment = createFakeEnvironment({ kind: 'desktop', control, frontmost: FINDER, targets: ({ x }) => (x < 200 ? { origin: FINDER, role: 'AXRow', name: 'report.pdf' } : { origin: FINDER, ...dropTarget }) })
    const approvals = createAppApprovals({ path: join(tmp, 'a.json') })
    approvals.grantAlways(FINDER, { by: 'api' })
    const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'drag', path: [{ x: 100, y: 100 }, { x: 600, y: 400 }] }] }, { final: 'done' }] })
    const result = await runTask({ task: 'tidy', environment, model, control, runsDirectory: join(tmp, 'runs'), build: { commit: 'test', dirty: false }, apps: [FINDER], appApprovals: approvals })
    return readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action' && e.action?.type === 'drag').at(-1).status
  } finally { rmSync(tmp, { recursive: true, force: true }) }
}

test('CU-392: a Finder file dropped on AirDrop, a person in the AirDrop window, Shared, a Drop Box or a server volume is declined', async () => {
  for (const target of [{ role: 'AXRow', name: 'AirDrop' }, { role: 'AXCell', name: 'Pat\u2019s MacBook', windowTitle: 'AirDrop' }, { role: 'AXRow', name: 'Shared' }, { role: 'AXRow', name: 'Drop Box' }, { role: 'AXRow', name: 'Network' }]) {
    assert.equal(await drop(target), 'declined', JSON.stringify(target))
  }
})

test('CU-392 negatives: a Finder file moved into an ordinary folder stays a free move', async () => {
  for (const name of ['Projects', 'Documents', 'Desktop']) assert.equal(await drop({ role: 'AXRow', name }), 'done', name)
})
