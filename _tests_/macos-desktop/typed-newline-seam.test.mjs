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

// CU-142 seam: agent core's own startRun over the real macOS driver on the fake helper. A typed newline is ENTER on the
// focused element - and after a tab it is judged on the focus the app settled on (CU-135's split), so 'x\thi\n' from a
// name field into a 'Send a message' field asks submit, and unattended nothing is sent.

const FIXTURE = 'com.example.fixture'
const locks = scratchLocks()
const element = (fields) => ({ bundleId: FIXTURE, pid: 501, frame: { x: 300, y: 300, width: 200, height: 24 }, secure: false, ...fields })

async function typeInto(text, focusedReads) {
  const dir = mkdtempSync(join(tmpdir(), 'cu-newline-seam-'))
  const child = spawnFake({ focusedReads: focusedReads.map(element) })
  let handle = null
  try {
    const appApprovals = createAppApprovals({ path: join(dir, 'app-approvals.json') })
    appApprovals.grantAlways(FIXTURE, { by: 'tty' })
    handle = await startRun({
      environment: 'macos-desktop', seat: 'cu-developer-one', apps: [FIXTURE], appApprovals, env: cleanEnvironment(), task: 'reply',
      runsDirectory: join(dir, 'runs'), live: false, consent: { mode: 'unattended' }, bounds: { maxSteps: 3, maxWallMs: 30_000 },
      model: createScriptedAdapter({ turns: [{ actions: [{ type: 'type', text }] }, { final: 'done\nOUTCOME: not_done' }] }),
      environmentOptions: { connect: () => connectStdio(child, { token: 'test-token', helloTimeoutMs: 5000 }), runLock: locks.next() },
    })
    const result = await handle.done
    const parts = readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action' && ['type', 'keypress'].includes(e.action?.type))
    return { parts, inputs: child.requests.filter((r) => r.type === 'input').length }
  } finally {
    if (handle !== null) await handle.done.catch(() => {})
    await stopFake(child)
    rmSync(dir, { recursive: true, force: true })
  }
}

test('a typed newline into a field named like send asks submit through the real driver; unattended nothing is sent', async () => {
  const { parts, inputs } = await typeInto('hi there\n', [{ role: 'AXTextField', title: 'Send a message' }])
  assert.deepEqual(parts.map((e) => [e.action.type, e.decision, e.class]), [['type', 'confirm', 'submit']])
  assert.equal(inputs, 0)
})

test('after a tab the typed newline is judged on the settled focus (CU-135\'s split)', async () => {
  const name = { role: 'AXTextField', title: 'Name' }
  const send = { role: 'AXTextField', title: 'Send a message' }
  // The x's read, the Tab's read, one stale read of the name field, then the focus the app settled on.
  const { parts, inputs } = await typeInto('x\thi\n', [name, name, name, send])
  const last = parts[parts.length - 1]
  assert.deepEqual([last.action.type, last.action.text, last.decision, last.class, last.target?.name], ['type', 'hi\n', 'confirm', 'submit', 'Send a message'])
  assert.equal(inputs, 2, 'the x and the tab went, the reply did not')
})
