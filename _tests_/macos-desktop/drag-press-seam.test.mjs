import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { connectStdio } from '../../_environments_/macos-desktop/helper-link.mjs'
import { createAppApprovals, createScriptedAdapter, startRun } from '../../_tools_/agent-core/lib.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'
import { cleanEnvironment } from '../../_tools_/verify-kit/sut.mjs'
import { scratchLocks, spawnFake, stopFake } from './harness.mjs'

// CU-140 seam: agent core's own startRun over the real macOS driver on the fake helper. A long press - mouse_down, a
// wait, mouse_up, composed into one held drag (CU-64) - on a named destructive control is asked like its click, and
// unattended nothing presses it.

const FIXTURE = 'com.example.fixture'
const locks = scratchLocks()

async function longPressOn(element) {
  const dir = mkdtempSync(join(tmpdir(), 'cu-drag-seam-'))
  const child = spawnFake({ elements: [{ rect: { x: 200, y: 200, width: 200, height: 60 }, element: { bundleId: FIXTURE, pid: 501, frame: { x: 200, y: 200, width: 200, height: 60 }, secure: false, ...element } }] })
  let handle = null
  try {
    const appApprovals = createAppApprovals({ path: join(dir, 'app-approvals.json') })
    appApprovals.grantAlways(FIXTURE, { by: 'tty' })
    handle = await startRun({
      environment: 'macos-desktop', seat: 'cu-developer-one', apps: [FIXTURE], appApprovals, env: cleanEnvironment(), task: 'finish up',
      runsDirectory: join(dir, 'runs'), live: false, consent: { mode: 'unattended' }, bounds: { maxSteps: 3, maxWallMs: 30_000 },
      model: createScriptedAdapter({ turns: [{ actions: [{ type: 'move', x: 250, y: 220 }, { type: 'mouse_down' }, { type: 'wait', duration_ms: 1700 }, { type: 'mouse_up' }] }, { final: 'done\nOUTCOME: not_done' }] }),
      environmentOptions: { connect: () => connectStdio(child, { token: 'test-token', helloTimeoutMs: 5000 }), runLock: locks.next() },
    })
    const result = await handle.done
    const press = readRun(result.trajectoryDir).events.find((e) => e.kind === 'action' && e.action?.type === 'drag')
    const buttons = child.requests.filter((r) => r.type === 'input').flatMap((r) => r.events ?? []).filter((e) => /down|up/i.test(String(e.type ?? e.kind ?? '')))
    return { press, buttons }
  } finally {
    if (handle !== null) await handle.done.catch(() => {})
    await stopFake(child)
    rmSync(dir, { recursive: true, force: true })
  }
}

test('a long press on a named Delete is asked through the real driver and, unattended, never pressed', async () => {
  const { press, buttons } = await longPressOn({ role: 'AXButton', title: 'Delete archive (hold)' })
  assert.ok(press, 'the press was composed into one held drag')
  assert.deepEqual([press.decision, press.class, press.target?.name], ['confirm', 'delete', 'Delete archive (hold)'])
  assert.equal(buttons.length, 0, 'no button went down or up')
})

test('a long press on a benign control is allowed', async () => {
  const { press } = await longPressOn({ role: 'AXButton', title: 'Arm - hold to arm' })
  assert.equal(press.decision, 'allow')
})
