import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, test } from 'node:test'

import { skipUnless } from '../../_vendor_/browser-use/_tools_/verify-runner/lib.mjs'
import { decodePng } from '../../_tools_/verify-kit/png.mjs'
import { sutRoot } from '../../_tools_/verify-kit/sut.mjs'
import { verifySeat } from '../../_tools_/verify-kit/seat.mjs'

/** CU-156: the seat this verifier's browsers and runs use - CU_VERIFY_SEAT, else cu-verifier (verify-kit/seat.mjs). */
const SEAT = verifySeat()

/**
 * ULTIMATE_GOAL 2.0 perception row, driver half: Retina and downscale are mapped back, so a click lands on the
 * intended point. The driver (macos-desktop) runs against the fake helper over stdio; the expected global point comes
 * only from the declared display geometry and the size of the screenshot the model is given, and the observed point
 * only from what the helper received. Retina is a declared scale-2 display (this Mac has one scale-1 display; the
 * live half, CU Fixture's landing log, follows the owner's grant).
 */

const root = sutRoot()
const ENV = join(root, '_environments_/macos-desktop/environment.mjs')
const LINK = join(root, '_environments_/macos-desktop/helper-link.mjs')
// The fake helper is the instrument, not the code under test: always this tree's copy, so a mutant's driver meets it.
const FAKE = fileURLToPath(new URL('../../_tests_/macos-desktop/fake-helper.mjs', import.meta.url))
const ready = [ENV, LINK, FAKE].every(existsSync)
const FIXTURE = 'ai.reflection.cu.fixture'
// A fake-helper run touches no display, so it never holds the team-wide desktop-run lock (D-024) from real runs.
const NO_DISPLAY_LOCK = async () => ({ release() {} })

/** Worlds: a display, and CU Fixture covering it so every point is over the approved app. */
const WORLDS = {
  'scale 1, main': { id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 1920, height: 1080 }, scale: 1 },
  'Retina, main': { id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 1512, height: 982 }, scale: 2 },
  'Retina, secondary left and above': { id: 2, main: false, originPt: { x: -1512, y: -200 }, sizePt: { width: 1512, height: 982 }, scale: 2 },
  'scale 1, 2560x1440': { id: 3, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 2560, height: 1440 }, scale: 1 },
}
/** Two adapters' image limits (Claude's and a smaller long edge). */
const LIMITS = { 'long edge 1568, 1.15 MP': { maxLongEdge: 1568, maxPixels: 1_150_000 }, 'long edge 1024': { maxLongEdge: 1024 } }

/** Start the driver on a fake helper holding one display; `requests` fills with what the helper received. */
async function driverOn(display, frame) {
  const { launchDesktopEnvironment } = await import(pathToFileURL(ENV))
  const { connectStdio } = await import(pathToFileURL(LINK))
  const world = { grants: { screen: true, accessibility: true, listenEvents: false }, displays: [display], apps: [{ bundleId: FIXTURE, pid: 900, rect: { ...display.originPt, ...display.sizePt } }] }
  const child = spawn(process.execPath, [FAKE], { stdio: ['pipe', 'pipe', 'pipe'], env: { PATH: process.env.PATH, FAKE_HELPER_CONFIG: JSON.stringify(world), FAKE_HELPER_TOKEN: 'cu-verifier' } })
  const requests = []
  let buffer = ''
  child.stderr.on('data', (chunk) => {
    buffer += chunk
    for (let at = buffer.indexOf('\n'); at !== -1; at = buffer.indexOf('\n')) {
      const line = buffer.slice(0, at)
      buffer = buffer.slice(at + 1)
      if (line.startsWith('REQ ')) requests.push(JSON.parse(line.slice(4)))
    }
  })
  const env = await launchDesktopEnvironment({ apps: [FIXTURE], seat: SEAT, runLock: NO_DISPLAY_LOCK, frame, connect: () => connectStdio(child, { token: 'cu-verifier', helloTimeoutMs: 5000 }) })
  // P11 (app-policy 0.3.4): the driver acts only in apps added after launch; a no-op on a driver without addApp.
  await env.addApp?.(FIXTURE)
  return { env, requests, stop: () => { env.close(); child.kill() } }
}

/** The size of the image the model is given, from the screenshot's PNG bytes. */
function imageSize(shot) {
  const data = Object.values(shot).find((value) => typeof value === 'string' && value.startsWith('iVBOR')) ?? shot.png ?? shot.data
  const image = decodePng(Buffer.isBuffer(data) ? data : Buffer.from(data, 'base64'))
  return { width: image.width, height: image.height }
}

/** Where a screenshot point is in global points, from geometry alone. */
const expectedGlobal = (point, display, size) => ({ x: display.originPt.x + (point.x * display.sizePt.width) / size.width, y: display.originPt.y + (point.y * display.sizePt.height) / size.height })

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

for (const [worldName, display] of Object.entries(WORLDS)) {
  describe(worldName, () => {
    for (const [limitName, frame] of Object.entries(LIMITS)) {
      test(`${limitName}: each click lands within one point of the intended spot, out-of-frame clicks send nothing`, { timeout: 30_000 }, async (t) => {
        if (!skipUnless(t, ready, 'the macos-desktop driver or fake helper has not landed')) return
        const { env, requests, stop } = await driverOn(display, frame)
        try {
          const size = imageSize(await env.screenshot())
          assert.ok(size.width <= display.sizePt.width * display.scale && size.height <= display.sizePt.height * display.scale, 'the image is larger than the display')
          const points = [{ x: 0, y: 0 }, { x: size.width - 1, y: size.height - 1 }, { x: Math.floor(size.width / 2), y: Math.floor(size.height / 2) }, { x: 137, y: 411 % size.height }, { x: size.width - 7, y: 3 }]
          for (const point of points) {
            const before = requests.length
            await env.perform({ type: 'click', x: point.x, y: point.y, button: 'left' })
            await pause(30)
            const sent = requests.slice(before).filter((r) => r.type === 'input').flatMap((r) => r.events)
            const pointed = sent.filter((e) => typeof e.x === 'number')
            assert.ok(pointed.some((e) => e.kind === 'down') && pointed.some((e) => e.kind === 'up'), `no down and up for ${JSON.stringify(point)}`)
            const want = expectedGlobal(point, display, size)
            for (const event of pointed) {
              assert.ok(Math.abs(event.x - want.x) <= 1 && Math.abs(event.y - want.y) <= 1, `${event.kind} for screenshot ${point.x},${point.y} went to ${event.x},${event.y}; geometry says ${want.x.toFixed(1)},${want.y.toFixed(1)}`)
            }
          }
          for (const outside of [{ x: size.width + 3, y: 10 }, { x: 10, y: size.height }, { x: -1, y: 5 }]) {
            const before = requests.length
            await assert.rejects(env.perform({ type: 'click', x: outside.x, y: outside.y, button: 'left' }), `a click at ${JSON.stringify(outside)} was accepted`)
            await pause(30)
            assert.equal(requests.slice(before).filter((r) => r.type === 'input').length, 0, `input was sent for ${JSON.stringify(outside)}`)
          }
        } finally {
          stop()
        }
      })
    }

    test('a zoom region is captured where the screenshot shows it', { timeout: 30_000 }, async (t) => {
      if (!skipUnless(t, ready, 'the macos-desktop driver or fake helper has not landed')) return
      const { env, requests, stop } = await driverOn(display, LIMITS['long edge 1568, 1.15 MP'])
      try {
        const size = imageSize(await env.screenshot())
        const region = [Math.floor(size.width / 4), Math.floor(size.height / 3), Math.floor(size.width / 2), Math.floor((2 * size.height) / 3)]
        const before = requests.length
        await env.screenshot({ region })
        const capture = requests.slice(before).find((r) => r.type === 'capture' && r.region)
        assert.ok(capture, 'no region capture was requested')
        const topLeft = expectedGlobal({ x: region[0], y: region[1] }, display, size)
        const bottomRight = expectedGlobal({ x: region[2], y: region[3] }, display, size)
        const got = capture.region
        for (const [name, have, want] of [['x', got.x, topLeft.x], ['y', got.y, topLeft.y], ['right', got.x + got.width, bottomRight.x], ['bottom', got.y + got.height, bottomRight.y]]) {
          assert.ok(Math.abs(have - want) <= 1, `region ${name} ${have}, geometry says ${want.toFixed(1)}`)
        }
      } finally {
        stop()
      }
    })
  })
}
