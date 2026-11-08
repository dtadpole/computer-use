import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'

import { checkoutLine, main } from '../../_tools_/agent-core/cli.mjs'

// CU-94: `run --held-marker PATH`, the held-keys marker seam the G1 live check uses to keep the helper's marker under
// its private CU_HOME. Nothing here launches a driver: the CLI gets a startRun seam.

const FIXTURE = 'ai.reflection.cu.fixture'
let dir
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cu-held-marker-cli-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

function setup() {
  const plan = join(dir, 'plan.json')
  writeFileSync(plan, JSON.stringify({ turns: [{ final: 'ok' }] }))
  const seen = []
  const startRun = async (options) => { seen.push(options); return { viewUrl: null, controlUrl: null, done: Promise.resolve({ status: 'completed' }) } }
  const desktop = ['run', '--env', 'macos-desktop', '--seat', 'cu-verifier', '--task', 't', '--app', FIXTURE, '--plan', plan, '--consent', 'unattended', '--no-live']
  return { plan, seen, startRun, desktop }
}

test('--held-marker PATH reaches the driver as environmentOptions.heldMarkerPath on a desktop run', async () => {
  const { seen, startRun, desktop } = setup()
  assert.equal(await main([...desktop, '--held-marker', '/tmp/cu-g1-x/home/user/held-keys.json'], { write: () => {}, startRun }), 0)
  assert.deepEqual(seen[0].environmentOptions, { heldMarkerPath: '/tmp/cu-g1-x/home/user/held-keys.json' })
})

test('without --held-marker a desktop run keeps the helper\'s default marker (no heldMarkerPath at all)', async () => {
  const { seen, startRun, desktop } = setup()
  await main(desktop, { write: () => {}, startRun })
  // Not even an undefined key: with no other seam set, a plain desktop run passes no environmentOptions at all.
  assert.equal(seen[0].environmentOptions, undefined)
})

test('a relative --held-marker is refused: it would land in whatever directory the CLI ran from', async () => {
  const { startRun, desktop } = setup()
  await assert.rejects(main([...desktop, '--held-marker', 'held-keys.json'], { startRun }), /--held-marker must be an absolute path/)
})

test('--held-marker on a browser run is refused', async () => {
  const { plan, startRun } = setup()
  await assert.rejects(main(['run', '--env', 'chrome-browser', '--task', 't', '--start-url', 'http://127.0.0.1:1/', '--seat', 'cu-verifier', '--plan', plan, '--held-marker', '/tmp/m.json'], { startRun }), /--held-marker is for --env macos-desktop/)
})

test('CU-106: a desktop run prints the checkout it comes from - the commit, uncommitted changes said, unknown when git could not tell', () => {
  assert.equal(checkoutLine({ commit: 'a'.repeat(40), dirty: false }), `checkout: ${'a'.repeat(40)}\n`)
  assert.equal(checkoutLine({ commit: 'b'.repeat(40), dirty: true }), `checkout: ${'b'.repeat(40)} (uncommitted changes)\n`)
  assert.equal(checkoutLine({ commit: null, dirty: true }), 'checkout: unknown (uncommitted changes)\n')
})
