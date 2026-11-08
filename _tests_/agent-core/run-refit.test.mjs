import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { startRun } from '../../_tools_/agent-core/run.mjs'

// CU-68: agent core opts every desktop run into the driver's frame re-fit at the first app's join (it rewrites the
// header and locks the frame before model.open); a caller's environmentOptions can still opt out.

const FIXTURE = 'ai.reflection.cu.fixture'
let runsDirectory
beforeEach(() => { runsDirectory = mkdtempSync(join(tmpdir(), 'cu-refit-')) })
afterEach(() => { rmSync(runsDirectory, { recursive: true, force: true }) })

async function launchOptions(extra = {}) {
  let seen = null
  const launch = async (options) => { seen = options; return createFakeEnvironment({ kind: 'desktop', control: options.control }) }
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ final: 'done' }] })
  const run = await startRun({ environment: 'macos-desktop', seat: 'cu-developer-one', task: 'look', runsDirectory, live: false, env: {}, apps: [FIXTURE], model, launch, ...extra })
  await run.done
  return seen
}

test('a desktop run is launched with refitFrameAtFirstApp: true', async () => {
  assert.equal((await launchOptions()).refitFrameAtFirstApp, true)
})

test('a caller can opt out through environmentOptions', async () => {
  assert.equal((await launchOptions({ environmentOptions: { refitFrameAtFirstApp: false } })).refitFrameAtFirstApp, false)
})
