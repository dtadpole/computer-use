import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { browserAvailable } from '../../_vendor_/browser-use/lib.mjs'
import { skipUnless } from '../../_vendor_/browser-use/_tools_/verify-runner/lib.mjs'
import { fixtureClient } from '../../_tools_/fixture-site/client.mjs'
import { startFixtureServer } from '../../_tools_/fixture-site/server.mjs'
import { lastEventId, launchDriver, recorderEvents, VERIFY_VIEWPORT } from '../../_tools_/verify-kit/driver.mjs'
import { decodePng } from '../../_tools_/verify-kit/png.mjs'
import { loadSut } from '../../_tools_/verify-kit/sut.mjs'

/**
 * ULTIMATE_GOAL perception row: every step returns a screenshot at a declared resolution; when it is downscaled,
 * the model's coordinates are mapped back, and a click lands on the intended pixel.
 *
 * At frame scale 1 and 0.75, for each of the input recorder's two targets - centred on odd CSS pixels, so a
 * rounding error shows - the check (1) reads the screenshot the model would see and finds the target's red at the
 * frame point the model would click, then (2) clicks that frame point through the driver and reads, from the
 * page's own event log, that the press landed on that target within 1 CSS pixel of its centre. Both halves rest
 * on evidence the driver did not write (D-012): the PNG pixels and the page's events.
 */

const sut = await loadSut()
const RED = [215, 0, 21]

let ready = browserAvailable()
let unjudged = ready ? '' : 'no Chrome or Chromium on this machine'
let fixture
let client
let recorderUrl

before(async () => {
  fixture = await startFixtureServer({ seed: 'perception-mapping-verifier' })
  client = fixtureClient(fixture)
  recorderUrl = new URL('/tasks/input-recorder/', fixture.url).href
})

after(() => fixture?.close())

for (const [scale, frame] of [[1, {}], [0.75, { maxWidth: 768 }]]) {
  test(`scale ${scale}: the target is drawn at the frame point, and a click there lands on it within 1 CSS pixel`, { timeout: 60_000 }, async (t) => {
    if (!skipUnless(t, ready, unjudged)) return
    await client.reset()
    const launched = await launchDriver(sut, { startUrl: recorderUrl, frame, runId: `verify-perception-${scale}` })
    if (launched.refused) {
      ready = false
      unjudged = launched.refused
    }
    if (!skipUnless(t, ready, unjudged)) return
    const { env } = launched
    try {
      const { targets } = (await client.taskState('input-recorder')).expected
      await recorderEvents(client)
      const image = decodePng((await env.screenshot()).data)
      assert.deepEqual([image.width, image.height], [Math.round(VERIFY_VIEWPORT.width * scale), Math.round(VERIFY_VIEWPORT.height * scale)], 'the screenshot is not at the declared resolution')
      for (const target of targets) {
        assert.ok(target.x % 2 === 1 && target.y % 2 === 1, 'the probe targets must sit on odd pixels')
        const point = { x: Math.round(target.x * scale), y: Math.round(target.y * scale) }
        const [r, g, b] = image.pixel(point.x, point.y)
        assert.ok(Math.abs(r - RED[0]) <= 8 && g <= 8 && Math.abs(b - RED[2]) <= 8, `the model's image shows [${r}, ${g}, ${b}] at frame ${point.x},${point.y}, not ${target.name}'s red`)
        const since = await lastEventId(client)
        await env.perform({ type: 'click', x: point.x, y: point.y, button: 'left' })
        const press = (await recorderEvents(client, { since })).find((event) => event.type === 'mousedown')
        assert.ok(press, `no press reached the page for frame ${point.x},${point.y}`)
        assert.equal(press.target, target.name, `the press hit ${press.target}, not ${target.name}`)
        assert.ok(Math.abs(press.x - target.x) <= 1 && Math.abs(press.y - target.y) <= 1, `frame ${point.x},${point.y} landed on CSS ${press.x},${press.y}; ${target.name} is centred on ${target.x},${target.y}`)
      }
    } finally {
      await env.close()
    }
  })
}
