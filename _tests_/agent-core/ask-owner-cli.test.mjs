import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'

import { main } from '../../_tools_/agent-core/cli.mjs'

// CU-203: `run --ask-owner` lets a desktop run refused while the owner uses the Mac show his confirmation prompt
// (physical-confirmation.md). The flag only asks - the lock admits on his hardware click alone. No driver launches here.

const FIXTURE = 'ai.reflection.cu.fixture'
let dir
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cu-ask-owner-cli-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

function setup() {
  const plan = join(dir, 'plan.json')
  writeFileSync(plan, JSON.stringify({ turns: [{ final: 'ok' }] }))
  const seen = []
  const startRun = async (options) => { seen.push(options); return { viewUrl: null, controlUrl: null, done: Promise.resolve({ status: 'completed' }) } }
  const desktop = ['run', '--env', 'macos-desktop', '--seat', 'cu-verifier', '--task', 'Fill the badge form', '--app', FIXTURE, '--plan', plan, '--consent', 'unattended', '--no-live']
  return { plan, seen, startRun, desktop }
}

test('CU-203: --ask-owner reaches the driver as askOwner, with the task text the prompt quotes', async () => {
  const { seen, startRun, desktop } = setup()
  assert.equal(await main([...desktop, '--ask-owner'], { write: () => {}, startRun }), 0)
  assert.deepEqual(seen[0].environmentOptions, { askOwner: true, task: 'Fill the badge form' })
})

test('CU-203: without --ask-owner nothing asks (no environmentOptions at all)', async () => {
  const { seen, startRun, desktop } = setup()
  await main(desktop, { write: () => {}, startRun })
  assert.equal(seen[0].environmentOptions, undefined)
})

test('CU-203: --ask-owner on a browser run is refused', async () => {
  const { plan, startRun } = setup()
  await assert.rejects(main(['run', '--env', 'chrome-browser', '--task', 't', '--start-url', 'http://127.0.0.1:1/', '--seat', 'cu-verifier', '--plan', plan, '--ask-owner'], { startRun }), /--ask-owner is for --env macos-desktop/)
})
