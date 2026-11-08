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

// CU-125 seam (cu-developer-two, the CU-95/CU-102/CU-110 lesson): agent core's own startRun over the real macOS driver
// on the fake helper. A first action cursor_position must be told the helper's pointer (the fake's, 100,100) - agent
// core's memory would say 'unknown' - so a driver that stopped offering cursor_position cannot pass unnoticed.

const FIXTURE = 'com.example.fixture'

test('a model run asks the helper for the cursor through the real driver: the first cursor_position is the fake\'s pointer', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cu-cursor-seam-'))
  const locks = scratchLocks()
  const child = spawnFake({})
  let handle = null
  try {
    const appApprovals = createAppApprovals({ path: join(dir, 'app-approvals.json') })
    appApprovals.grantAlways(FIXTURE, { by: 'tty' })
    handle = await startRun({
      environment: 'macos-desktop', seat: 'cu-developer-one', apps: [FIXTURE], appApprovals, env: cleanEnvironment(), task: 'where is the pointer',
      runsDirectory: join(dir, 'runs'), live: false, bounds: { maxSteps: 3, maxWallMs: 30_000 },
      model: createScriptedAdapter({ turns: [{ actions: [{ type: 'cursor_position' }] }, { final: 'done\nOUTCOME: done' }] }),
      environmentOptions: { connect: () => connectStdio(child, { token: 'test-token', helloTimeoutMs: 5000 }), runLock: locks.next() },
    })
    assert.equal(handle.started, true)
    const result = await handle.done
    const event = readRun(result.trajectoryDir).events.find((e) => e.kind === 'action' && e.action?.type === 'cursor_position')
    assert.ok(event, 'the cursor_position action is recorded')
    assert.deepEqual([event.status, event.cursor, event.source], ['done', { x: 100, y: 100 }, 'helper'])
    assert.ok(child.requests.some((r) => r.type === 'cursor'), 'the helper was asked')
    assert.equal(child.requests.filter((r) => r.type === 'input').length, 0, 'no input reached the helper')
  } finally {
    if (handle !== null) await handle.done.catch(() => {})
    await stopFake(child)
    rmSync(dir, { recursive: true, force: true })
  }
})
