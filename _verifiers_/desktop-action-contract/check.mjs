import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { after, before, test } from 'node:test'

import { skipUnless } from '../../_vendor_/browser-use/_tools_/verify-runner/lib.mjs'
import { sutRoot } from '../../_tools_/verify-kit/sut.mjs'
import { verifySeat } from '../../_tools_/verify-kit/seat.mjs'

/** CU-156: the seat this verifier's browsers and runs use - CU_VERIFY_SEAT, else cu-verifier (verify-kit/seat.mjs). */
const SEAT = verifySeat()

/**
 * ULTIMATE_GOAL 2.0 action-contract row, driver half: the GA action set becomes OS input events, and unsupported
 * actions are refused by name with nothing sent. The macos-desktop driver runs against the fake helper (this tree's
 * copy, the instrument); every judgement reads the events the helper received. A display at scale 1 whose frame fits
 * the limits keeps screenshot and global points equal, so expected points are the action's own. The batch half
 * (a malformed batch posts nothing) needs agent core's desktop policy (C5) and follows it.
 */

const root = sutRoot()
const ENV = join(root, '_environments_/macos-desktop/environment.mjs')
const LINK = join(root, '_environments_/macos-desktop/helper-link.mjs')
const FAKE = fileURLToPath(new URL('../../_tests_/macos-desktop/fake-helper.mjs', import.meta.url))
const ready = [ENV, LINK, FAKE].every(existsSync)
const FIXTURE = 'ai.reflection.cu.fixture'
// A fake-helper run touches no display, so it never holds the team-wide desktop-run lock (D-024) from real runs.
const NO_DISPLAY_LOCK = async () => ({ release() {} })
const COMMAND = 0x0010_0000
const SHIFT = 0x0002_0000
const KEY_S = 0x01

let driver
before(async () => {
  if (!ready) return
  const { launchDesktopEnvironment } = await import(pathToFileURL(ENV))
  const { connectStdio } = await import(pathToFileURL(LINK))
  const display = { id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 1280, height: 800 }, scale: 1 }
  const world = { grants: { screen: true, accessibility: true, listenEvents: false }, displays: [display], apps: [{ bundleId: FIXTURE, pid: 900, rect: { x: 0, y: 0, width: 1280, height: 800 } }] }
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
  const env = await launchDesktopEnvironment({ apps: [FIXTURE], seat: SEAT, runLock: NO_DISPLAY_LOCK, frame: { maxLongEdge: 1568, maxPixels: 1_150_000 }, connect: () => connectStdio(child, { token: 'cu-verifier', helloTimeoutMs: 5000 }) })
  // P11 (app-policy 0.3.4): the driver acts only in apps added after launch; a no-op on a driver without addApp.
  await env.addApp?.(FIXTURE)
  driver = { env, requests, child }
})
after(() => {
  driver?.env.close()
  driver?.child.kill()
})

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Perform one action; resolves to `{ events, requests, error }` - what the helper received for it. */
async function act(action) {
  const before = driver.requests.length
  let error = null
  try {
    await driver.env.perform(action)
  } catch (caught) {
    error = caught
  }
  await pause(30)
  const requests = driver.requests.slice(before)
  return { events: requests.filter((r) => r.type === 'input').flatMap((r) => r.events), requests, error }
}

/** Downs without ups, by button and by key code (D-028: every down has its up). */
function unreleased(events) {
  const held = new Map()
  for (const event of events) {
    const key = event.kind === 'down' || event.kind === 'up' ? `button:${event.button}` : event.kind === 'keyDown' || event.kind === 'keyUp' ? `key:${event.keyCode}` : null
    if (key === null) continue
    const count = (held.get(key) ?? 0) + (event.kind === 'down' || event.kind === 'keyDown' ? 1 : -1)
    held.set(key, count)
  }
  return [...held].filter(([, count]) => count !== 0).map(([key]) => key)
}

const guard = (t) => skipUnless(t, ready, 'the macos-desktop driver or fake helper has not landed')

test('click: move, down and up at the point, one click; the right button stays right', async (t) => {
  if (!guard(t)) return
  const left = await act({ type: 'click', button: 'left', x: 300, y: 200 })
  assert.equal(left.error, null)
  assert.deepEqual(left.events.map((e) => [e.kind, e.button ?? null, e.x, e.y, e.clickCount ?? null]), [['move', null, 300, 200, null], ['down', 'left', 300, 200, 1], ['up', 'left', 300, 200, 1]])
  const right = await act({ type: 'click', button: 'right', x: 50, y: 60 })
  assert.deepEqual(right.events.filter((e) => e.kind !== 'move').map((e) => [e.kind, e.button]), [['down', 'right'], ['up', 'right']])
})

test('double and triple click count up 1, 2 (, 3), as macOS needs to see a double click', async (t) => {
  if (!guard(t)) return
  for (const [type, counts] of [['double_click', [1, 2]], ['triple_click', [1, 2, 3]]]) {
    const { events, error } = await act({ type, x: 400, y: 300 })
    assert.equal(error, null, type)
    assert.deepEqual(events.filter((e) => e.kind === 'down').map((e) => e.clickCount), counts, type)
    assert.deepEqual(unreleased(events), [], type)
  }
})

test('move posts only a move; drag holds the button along the path and releases at its end', async (t) => {
  if (!guard(t)) return
  const move = await act({ type: 'move', x: 640, y: 400 })
  assert.deepEqual(move.events.map((e) => e.kind), ['move'])
  const drag = await act({ type: 'drag', path: [{ x: 100, y: 100 }, { x: 260, y: 180 }, { x: 500, y: 180 }] })
  assert.equal(drag.error, null)
  const kinds = drag.events.map((e) => e.kind)
  assert.equal(kinds.filter((k) => k === 'down').length, 1)
  assert.equal(kinds.at(-1), 'up')
  assert.ok(kinds.includes('drag'), 'no drag events between down and up')
  assert.deepEqual([drag.events.at(-1).x, drag.events.at(-1).y], [500, 180], 'released away from the end of the path')
  assert.deepEqual(unreleased(drag.events), [])
})

test('scroll: a wheel event at the point, in CGEvent\'s sign (scrolling down is a negative delta)', async (t) => {
  if (!guard(t)) return
  const down = await act({ type: 'scroll', x: 640, y: 400, scroll_x: 0, scroll_y: 300 })
  const wheel = down.events.find((e) => e.kind === 'scroll')
  assert.ok(wheel, 'no scroll event')
  assert.deepEqual([wheel.x, wheel.y], [640, 400])
  assert.ok(wheel.deltaY < 0, `scroll_y 300 became deltaY ${wheel.deltaY}`)
  const right = (await act({ type: 'scroll', x: 640, y: 400, scroll_x: 200, scroll_y: 0 })).events.find((e) => e.kind === 'scroll')
  assert.ok(right.deltaX < 0 && right.deltaY === 0, `scroll_x 200 became ${right.deltaX}, ${right.deltaY}`)
})

test('keypress: a chord holds its modifier, the key carries the Command flag, and every key comes up', async (t) => {
  if (!guard(t)) return
  const save = await act({ type: 'keypress', keys: ['META', 'S'] })
  assert.equal(save.error, null)
  const s = save.events.find((e) => e.kind === 'keyDown' && e.keyCode === KEY_S)
  assert.ok(s, 'no key-down for S')
  assert.ok((s.flags & COMMAND) !== 0, `S went down with flags ${s.flags}`)
  assert.deepEqual(unreleased(save.events), [])
  const shifted = await act({ type: 'keypress', keys: ['SHIFT', 'TAB'] })
  assert.ok(shifted.events.some((e) => e.kind === 'keyDown' && (e.flags & SHIFT) !== 0))
  assert.deepEqual(unreleased(shifted.events), [])
})

test('type: the text arrives whole, chunk edges included; a newline is the Enter key', async (t) => {
  if (!guard(t)) return
  const text = 'abcdefghijklmno pqrst, uvw xyz 0123456789 done'
  const { events, error } = await act({ type: 'type', text })
  assert.equal(error, null)
  assert.equal(events.filter((e) => e.kind === 'text').map((e) => e.text).join(''), text)
  const lines = await act({ type: 'type', text: 'one\ntwo' })
  assert.deepEqual(lines.events.filter((e) => e.kind === 'text').map((e) => e.text), ['one', 'two'])
  assert.deepEqual(unreleased(lines.events), [])
  assert.equal(lines.events.filter((e) => e.kind === 'keyDown').length, 1, 'the newline is one Enter press')
})

test('wait sends nothing; screenshot captures and sends no input', async (t) => {
  if (!guard(t)) return
  const wait = await act({ type: 'wait', duration_ms: 1 })
  assert.equal(wait.error, null)
  assert.equal(wait.requests.length, 0)
  const shot = await act({ type: 'screenshot' })
  assert.equal(shot.events.length, 0)
})

test('unsupported actions are refused by name and nothing is sent: navigate, an unknown action', async (t) => {
  if (!guard(t)) return
  for (const [action, name] of [[{ type: 'navigate', url: 'https://example.com' }, 'navigate'], [{ type: 'teleport', x: 1, y: 1 }, 'teleport']]) {
    const { error, requests } = await act(action)
    assert.ok(error, `${name} was accepted`)
    assert.ok(new RegExp(name, 'i').test(`${error.message} ${JSON.stringify(error.details ?? {})}`), `the refusal does not name ${name}: ${error.message}`)
    assert.equal(requests.filter((r) => r.type === 'input').length, 0, `input was sent for ${name}`)
  }
})

/** Whether the driver under test lets clipboard chords through (D-031 replaced the D-025 refusal). */
const driverAllowsClipboard = () => !readFileSync(join(sutRoot(), '_environments_/macos-desktop/keys.mjs'), 'utf8').includes('PASTEBOARD_REFUSAL')

test('copy, cut and paste chords go to the helper as Command chords (D-031), as Command-A does', async (t) => {
  if (!guard(t)) return
  const selectAll = await act({ type: 'keypress', keys: ['META', 'A'] })
  assert.equal(selectAll.error, null, `Command-A was refused: ${selectAll.error?.message}`)
  if (!skipUnless(t, driverAllowsClipboard(), 'the driver under test still refuses clipboard chords (D-025); D-031 allows them - judged once that refusal is gone')) return
  // Command (kVK 55) held with the Command flag around the main key's down and up, then released: kVK C 8, X 7, V 9.
  const COMMAND = 0x100000
  for (const [key, code] of [['C', 8], ['X', 7], ['V', 9]]) {
    const { error, requests } = await act({ type: 'keypress', keys: ['META', key] })
    assert.equal(error, null, `Command-${key} was refused: ${error?.message}`)
    const inputs = requests.filter((r) => r.type === 'input')
    assert.equal(inputs.length, 1, `Command-${key} did not reach the helper`)
    const events = inputs[0].events.map((e) => [e.kind, e.keyCode, (e.flags & COMMAND) !== 0])
    assert.deepEqual(events, [['keyDown', 55, true], ['keyDown', code, true], ['keyUp', code, true], ['keyUp', 55, false]], `Command-${key} reached the helper as ${JSON.stringify(events)}`)
  }
})
