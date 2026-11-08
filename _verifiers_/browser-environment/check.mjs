import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { after, before, test } from 'node:test'

import { browserAvailable } from '../../_vendor_/browser-use/lib.mjs'
import { skipUnless } from '../../_vendor_/browser-use/_tools_/verify-runner/lib.mjs'
import { fixtureClient } from '../../_tools_/fixture-site/client.mjs'
import { startFixtureServer } from '../../_tools_/fixture-site/server.mjs'
import { loadSut } from '../../_tools_/verify-kit/sut.mjs'
import { verifySeat } from '../../_tools_/verify-kit/seat.mjs'

/** CU-156: the seat this verifier's browsers and runs use - CU_VERIFY_SEAT, else cu-verifier (verify-kit/seat.mjs). */
const SEAT = verifySeat()

/**
 * ULTIMATE_GOAL environment row: the agent operates an isolated Chrome with a fresh profile and a fixed viewport.
 *
 * The chrome-browser driver is launched through its public entry point with agent-core's own site policy,
 * resource gate (D-014) and run control, as the CLI does. Every verdict rests on evidence the driver did not
 * write (D-012): the OS process table for Chrome's flags and profile, the fixture's viewport probe for what the
 * page sees, the PNG header (parsed here) for the screenshot size, and the filesystem after close.
 *
 * The system under test comes from CU_VERIFY_SUT when set, so `prove-failing.mjs` can run this check against
 * deliberately broken builds (see mutants.mjs). A resource refusal (memory floor, team cap) is unjudged.
 */

const VIEWPORT = Object.freeze({ width: 1024, height: 768 })
const sut = await loadSut()

let ready = browserAvailable()
let unjudged = ready ? '' : 'no Chrome or Chromium on this machine'
let fixture
let client
let probeUrl
let first
let firstProfile

before(async () => {
  fixture = await startFixtureServer({ seed: 'browser-environment-verifier' })
  client = fixtureClient(fixture)
  probeUrl = new URL('/tasks/viewport-probe/', fixture.url).href
})

after(async () => {
  await first?.close().catch(() => {})
  await fixture?.close()
})

/** Launch the driver as the CLI does; a resource refusal marks the rest unjudged. */
async function launch(frame = {}) {
  try {
    return await sut.launchBrowserEnvironment({
      seat: SEAT,
      viewport: VIEWPORT,
      frame,
      startUrl: probeUrl,
      sitePolicy: sut.lib.createSitePolicy({ startUrl: probeUrl }),
      resourceGate: sut.lib.resourceGate,
      control: sut.lib.createRunControl({ runId: 'verify-browser-environment' }),
    })
  } catch (error) {
    if (error?.code === 'resource_refused') {
      ready = false
      unjudged = `the resource gate refused the launch: ${error.message}`
      return null
    }
    throw error
  }
}

/** The main Chrome processes (not helpers) whose profile is one of this seat's throwaway profiles. */
function chromeProcesses() {
  const table = execFileSync('ps', ['-axww', '-o', 'pid=,command='], { encoding: 'utf8' })
  return table
    .split('\n')
    .filter((line) => line.includes(`--user-data-dir=/tmp/${SEAT}-chrome-`) && !/\s--type=/.test(line))
    .map((line) => {
      const [, pid, command] = /^\s*(\d+)\s+(.*)$/.exec(line)
      return { pid: Number(pid), command, profile: /--user-data-dir=(\S+)/.exec(command)[1] }
    })
}

/** Width and height from a PNG's IHDR chunk; refuses anything that is not a PNG. */
function pngSize(data) {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'base64')
  assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'the screenshot is not a PNG')
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

/** The probe's report after the page loaded. */
async function probe() {
  const state = await client.settle('viewport-probe', { quietMs: 250 })
  assert.ok(state.reports >= 1, 'the viewport probe never reported')
  return state.facts.page
}

test('one Chrome on a fresh /tmp profile, headless, sandbox on, extensions off', { timeout: 60_000 }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  await client.reset()
  // A browser another check is still shutting down is not this launch's: only new processes are judged.
  const earlier = new Set(chromeProcesses().map((chrome) => chrome.pid))
  first = await launch()
  if (!skipUnless(t, ready, unjudged)) return
  const processes = chromeProcesses().filter((chrome) => !earlier.has(chrome.pid))
  assert.equal(processes.length, 1, `expected one new main Chrome for this seat, saw ${processes.length}`)
  const [chrome] = processes
  firstProfile = chrome.profile
  assert.match(firstProfile, new RegExp(`^/tmp/${SEAT}-chrome-[A-Za-z0-9]{6}$`))
  assert.ok(!/\s--no-sandbox(\s|=|$)/.test(chrome.command), 'Chrome runs with --no-sandbox (R1, D-012)')
  assert.ok(!/\s--disable-setuid-sandbox(\s|$)/.test(chrome.command), 'Chrome runs with its setuid sandbox disabled')
  assert.match(chrome.command, /\s--headless(=new)?(\s|$)/)
  assert.match(chrome.command, /\s--disable-extensions(\s|$)/)
})

test('the page sees the declared viewport at device scale factor 1, and no earlier marker', { timeout: 30_000 }, async (t) => {
  if (!skipUnless(t, ready && first, unjudged || 'the first launch did not happen')) return
  const page = await probe()
  assert.equal(page.innerWidth, VIEWPORT.width)
  assert.equal(page.innerHeight, VIEWPORT.height)
  assert.equal(page.devicePixelRatio, 1)
  assert.equal(page.markerFound, false, 'a fresh profile already held a storage marker')
})

test('at scale 1 the screenshot is exactly the viewport', { timeout: 30_000 }, async (t) => {
  if (!skipUnless(t, ready && first, unjudged || 'the first launch did not happen')) return
  const shot = await first.screenshot()
  assert.deepEqual(pngSize(shot.data), { width: VIEWPORT.width, height: VIEWPORT.height })
})

test('storage works within a run, and close removes Chrome and its profile', { timeout: 60_000 }, async (t) => {
  if (!skipUnless(t, ready && first, unjudged || 'the first launch did not happen')) return
  await client.reset()
  await first.navigate({ url: probeUrl })
  assert.equal((await probe()).markerFound, true, 'the probe cannot see its own marker, so "absent" would mean nothing')
  await first.close()
  first = undefined
  await new Promise((resolve) => setTimeout(resolve, 500))
  assert.equal(existsSync(firstProfile), false, `the profile ${firstProfile} outlived the run`)
  assert.equal(chromeProcesses().filter((chrome) => chrome.profile === firstProfile).length, 0, 'Chrome outlived close()')
})

test('the next run is fresh, and a downscaled frame captures at the declared scale', { timeout: 60_000 }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  await client.reset()
  const second = await launch({ maxWidth: 768 })
  if (!skipUnless(t, ready, unjudged)) return
  try {
    const page = await probe()
    assert.equal(page.markerFound, false, 'storage from the previous run survived into this one')
    assert.equal(page.innerWidth, VIEWPORT.width, 'the frame limit must not change what the page sees')
    const shot = await second.screenshot()
    assert.deepEqual(pngSize(shot.data), { width: 768, height: 576 }, 'the screenshot ignores the frame scale 0.75')
  } finally {
    await second.close()
  }
})
