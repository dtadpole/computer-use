import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { before, test } from 'node:test'

import { skipUnless } from '../../_vendor_/browser-use/_tools_/verify-runner/lib.mjs'
import { SYNTHETIC_TAG } from '../../_tools_/verify-kit/desktop-evidence.mjs'
import { decodePng, solidPng } from '../../_tools_/verify-kit/png.mjs'
import { buildCUHelper } from '../../_tools_/verify-kit/helper-build.mjs'
import { startStdioHelper } from '../../_tools_/verify-kit/helper-client.mjs'
import { sutRoot } from '../../_tools_/verify-kit/sut.mjs'

/**
 * The real helper's input rules before the grant, through its dry run (helper/dry-run.md): CUHelper built from the
 * code under test runs every rule over a declared world and writes the CGEvents it built, read back from the events.
 * Judged here: the CUSE tag and global points (action contract), the point re-check (consent), and that every down
 * has its up when a person acts, secure input turns on, or the driver says bye (human control, D-028). Nothing is
 * posted or captured; no grant is used.
 */

const FIXTURE = 'ai.reflection.cu.fixture'
const LEDGER = 'ai.reflection.cu.ledger'
const NOTES = 'com.example.notes'
let helper
before(() => {
  helper = buildCUHelper(sutRoot())
})
const guard = (t) => {
  if (!skipUnless(t, Boolean(helper.executable), helper.why)) return false
  const [major, minor] = helper.version ?? [0, 0]
  return skipUnless(t, major > 0 || minor >= 2, `CUHelper ${helper.version?.join('.') ?? '?'} has no dry run (0.2.0)`)
}

// Main display Retina at the origin; a secondary display to its left (negative x); CU Ledger on the main display,
// CU Fixture on the secondary one, an unapproved Notes window beside the Ledger.
const WORLD = {
  grants: { screen: true, accessibility: true, postEvents: true, listenEvents: false },
  displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 1440, height: 900 }, scale: 2 }, { id: 2, originPt: { x: -1920, y: 0 }, sizePt: { width: 1920, height: 1080 }, scale: 1 }],
  apps: [{ bundleId: LEDGER, pid: 801, rect: { x: 100, y: 100, width: 600, height: 500 } }, { bundleId: NOTES, pid: 700, rect: { x: 800, y: 100, width: 500, height: 500 } }, { bundleId: FIXTURE, pid: 800, rect: { x: -1800, y: 100, width: 800, height: 600 } }],
  frontmost: LEDGER,
}
const move = (x, y) => ({ kind: 'move', x, y, flags: 0 })
const down = (x, y, flags = 0) => ({ kind: 'down', button: 'left', x, y, clickCount: 1, flags })
const up = (x, y, flags = 0) => ({ kind: 'up', button: 'left', x, y, clickCount: 1, flags })

/** One dry-run helper over `world` (or `world(dir)`, to place images in its directory); `body(helper, eventsLines)` runs with it; cleans up. */
async function dryRun(world, body, extraArgs = []) {
  const dir = mkdtempSync('/tmp/cu-verifier-dryrun-')
  if (typeof world === 'function') world = world(dir)
  const worldPath = join(dir, 'world.json')
  const tokenPath = join(dir, 'token')
  const eventsPath = join(dir, 'events.jsonl')
  writeFileSync(worldPath, JSON.stringify(world))
  writeFileSync(tokenPath, 'cu-verifier-dryrun', { mode: 0o600 })
  const h = await startStdioHelper(helper.executable, ['--stdio', '--token-file', tokenPath, '--dry-run', '--world', worldPath, '--events-out', eventsPath, ...extraArgs])
  const lines = () => (existsSync(eventsPath) ? readFileSync(eventsPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)) : [])
  try {
    assert.equal(h.hello.mode, 'dry-run', 'the helper is not in its dry run')
    return await body(h, lines)
  } finally {
    await h.close().catch(() => {})
    if (/^\/tmp\/cu-verifier-dryrun-[A-Za-z0-9]{6}$/.test(dir)) rmSync(dir, { recursive: true, force: true })
  }
}

/** What a built event stream leaves held: buttons and keys down without their up, and modifier flags not back to 0. */
function unreleased(lines) {
  const held = new Map()
  let flags = 0
  for (const { event } of lines) {
    const pair = { 1: ['left', 1], 2: ['left', -1], 3: ['right', 1], 4: ['right', -1], 25: [`other${event.button}`, 1], 26: [`other${event.button}`, -1], 10: [`key${event.keyCode}`, 1], 11: [`key${event.keyCode}`, -1] }[event.type]
    if (pair) held.set(pair[0], (held.get(pair[0]) ?? 0) + pair[1])
    if (event.type === 12) flags = event.flags ?? 0
  }
  return [...[...held].filter(([, count]) => count > 0).map(([name]) => name), ...(flags !== 0 ? [`flags ${flags}`] : [])]
}

test('every built event carries the CUSE tag, and clicks land at their global points on a Retina main and a negative-origin secondary display', { timeout: 60_000 }, async (t) => {
  if (!guard(t)) return
  await dryRun(WORLD, async (h, lines) => {
    await h.request('scope', { bundleIds: [FIXTURE, LEDGER] })
    await h.request('pauseOnLocalInput', { on: true })
    const main = await h.request('input', { mode: 'global', bundleId: LEDGER, events: [move(300, 300), down(300, 300), up(300, 300)] })
    assert.equal(main.done, true, JSON.stringify(main))
    // Naming CU Fixture brings it to the front first (input's bundleId; the world lets activation work).
    const left = await h.request('input', { mode: 'global', bundleId: FIXTURE, events: [move(-1500, 400), down(-1500, 400), up(-1500, 400)] })
    assert.equal(left.done, true, JSON.stringify(left))
    const built = lines()
    assert.ok(built.length >= 6, `${built.length} events built`)
    assert.ok(built.every((line) => line.event.tag === SYNTHETIC_TAG), `an event without the CUSE tag: ${JSON.stringify(built.find((line) => line.event.tag !== SYNTHETIC_TAG))}`)
    assert.deepEqual(built.slice(0, 3).map(({ event }) => [event.type, event.x, event.y]), [[5, 300, 300], [1, 300, 300], [2, 300, 300]], 'the Retina click is not at its points')
    assert.deepEqual(built.slice(-3).map(({ event }) => [event.type, event.x, event.y]), [[5, -1500, 400], [1, -1500, 400], [2, -1500, 400]], 'the secondary-display click is not at its points')
  })
})

test('input at a point over an app outside the scope is refused out_of_scope, naming only its owner, and nothing is built', { timeout: 60_000 }, async (t) => {
  if (!guard(t)) return
  await dryRun(WORLD, async (h, lines) => {
    await h.request('scope', { bundleIds: [FIXTURE, LEDGER] })
    await h.request('pauseOnLocalInput', { on: true })
    const reply = await h.request('input', { mode: 'global', bundleId: LEDGER, events: [move(900, 300), down(900, 300), up(900, 300)] })
    assert.equal(reply.code, 'out_of_scope', JSON.stringify(reply))
    assert.equal(reply.bundleId, NOTES)
    assert.deepEqual(lines(), [], 'events were built for a point over an unapproved app')
  })
})

test('a person acting mid-click stops the input as local_input, and the held button is released: every down has its up', { timeout: 60_000 }, async (t) => {
  if (!guard(t)) return
  await dryRun({ ...WORLD, localInputAfter: 2 }, async (h, lines) => {
    await h.request('scope', { bundleIds: [FIXTURE, LEDGER] })
    await h.request('pauseOnLocalInput', { on: true })
    const reply = await h.request('input', { mode: 'global', bundleId: LEDGER, events: [move(300, 300), down(300, 300), up(310, 300)] })
    assert.deepEqual([reply.done, reply.code], [false, 'local_input'], JSON.stringify(reply))
    const built = lines()
    assert.ok(built.some(({ event }) => event.type === 1), 'the button never went down')
    assert.deepEqual(unreleased(built), [], 'input left held after the person acted')
    assert.ok(built.every((line) => line.event.tag === SYNTHETIC_TAG), 'the release is not tagged')
  })
})

test('secure input turning on mid-typing stops before the next key step, sends no text after, and releases the held modifier', { timeout: 60_000 }, async (t) => {
  if (!guard(t)) return
  await dryRun({ ...WORLD, secureInputAfter: 1 }, async (h, lines) => {
    await h.request('scope', { bundleIds: [FIXTURE, LEDGER] })
    await h.request('pauseOnLocalInput', { on: true })
    const reply = await h.request('input', { mode: 'global', bundleId: LEDGER, events: [{ kind: 'keyDown', keyCode: 0x38, flags: 0x20000 }, { kind: 'text', text: 'pw' }, { kind: 'keyUp', keyCode: 0x38, flags: 0 }] })
    assert.deepEqual([reply.done, reply.code, reply.failedAt], [false, 'secure_input', 1], JSON.stringify(reply))
    const built = lines()
    assert.ok(!built.some(({ event }) => typeof event.text === 'string' && event.text.length > 0), 'text was built after secure input turned on')
    assert.deepEqual(unreleased(built), [], 'the modifier was left held')
  })
})

test('a modifier and a button held when the driver says bye are released before the helper goes', { timeout: 60_000 }, async (t) => {
  if (!guard(t)) return
  await dryRun(WORLD, async (h, lines) => {
    await h.request('scope', { bundleIds: [FIXTURE, LEDGER] })
    await h.request('pauseOnLocalInput', { on: true })
    const held = await h.request('input', { mode: 'global', bundleId: LEDGER, events: [{ kind: 'keyDown', keyCode: 0x38, flags: 0x20000 }, down(300, 300, 0x20000)] })
    assert.equal(held.done, true, JSON.stringify(held))
    assert.notDeepEqual(unreleased(lines()), [], 'nothing was held before bye (the check would prove nothing)')
    await h.request('bye').catch(() => {})
    await Promise.race([h.exited, new Promise((resolve) => setTimeout(resolve, 5000))])
    assert.deepEqual(unreleased(lines()), [], 'input left held after bye')
  })
})

test('a capture shows no pixel of an app outside the scope: an unapproved window over CU Fixture is black, its marker colour nowhere', { timeout: 60_000 }, async (t) => {
  if (!guard(t)) return
  const world = (dir) => {
    writeFileSync(join(dir, 'fixture.png'), solidPng(800, 600, [0, 200, 0]))
    writeFileSync(join(dir, 'notes.png'), solidPng(400, 300, [255, 0, 255]))
    return {
      grants: { screen: true, accessibility: true, postEvents: true, listenEvents: false },
      displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 1000, height: 800 }, scale: 1 }],
      // Top-most first: the unapproved Notes window lies over CU Fixture.
      apps: [{ bundleId: NOTES, pid: 700, rect: { x: 300, y: 200, width: 400, height: 300 }, image: join(dir, 'notes.png') }, { bundleId: FIXTURE, pid: 800, rect: { x: 100, y: 100, width: 800, height: 600 }, image: join(dir, 'fixture.png') }],
      frontmost: FIXTURE,
    }
  }
  await dryRun(world, async (h) => {
    await h.request('scope', { bundleIds: [FIXTURE] })
    const shot = await h.request('capture', { display: 1, maxSize: { width: 1000, height: 800 } })
    assert.ok(shot.png, `no image in the capture reply: ${JSON.stringify(shot).slice(0, 200)}`)
    const image = decodePng(Buffer.from(shot.png, 'base64'))
    let marker = 0
    let fixture = 0
    for (let y = 0; y < image.height; y += 4) {
      for (let x = 0; x < image.width; x += 4) {
        const [r, g, b] = image.pixel(x, y)
        if (r > 200 && g < 60 && b > 200) marker += 1
        if (r < 60 && g > 150 && b < 60) fixture += 1
      }
    }
    assert.equal(marker, 0, `${marker} sampled pixels of the unapproved app reached the capture`)
    assert.ok(fixture > 0, 'CU Fixture itself is not in the capture (the check would prove nothing)')
    const sx = image.width / 1000
    const sy = image.height / 800
    assert.deepEqual(image.pixel(Math.round(500 * sx), Math.round(350 * sy)).slice(0, 3), [0, 0, 0], 'the unapproved window is not black')
  })
})

/** Whether the helper under test models the menu bar in its dry run (helper 0.2.6, PR #267). */
const modelsMenuBar = () => readFileSync(join(sutRoot(), '_environments_/macos-desktop/helper/Sources/DryRun.swift'), 'utf8').includes('menuBarStrip')

test('the menu bar is masked as live: only the approved front app\'s own items show; other apps\' items and status items stay black, and the strip is black with an unapproved app in front', { timeout: 60_000 }, async (t) => {
  if (!guard(t)) return
  if (!skipUnless(t, modelsMenuBar(), 'the dry run does not model the menu bar yet (helper 0.2.6, PR #267)')) return
  const world = (front) => (dir) => {
    writeFileSync(join(dir, 'fixture.png'), solidPng(1000, 776, [0, 200, 0]))
    writeFileSync(join(dir, 'status.png'), solidPng(40, 20, [255, 0, 255]))
    return {
      grants: { screen: true, accessibility: true, postEvents: true, listenEvents: false },
      displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 1000, height: 800 }, scale: 1 }],
      apps: [{ bundleId: FIXTURE, pid: 800, rect: { x: 0, y: 24, width: 1000, height: 776 }, image: join(dir, 'fixture.png') }, { bundleId: NOTES, pid: 700, rect: { x: 0, y: 900, width: 10, height: 10 } }],
      frontmost: front,
      menuBar: [{ bundleId: FIXTURE, frame: { x: 10, y: 2, width: 60, height: 20 } }, { bundleId: NOTES, frame: { x: 100, y: 2, width: 60, height: 20 } }],
      statusItems: [{ frame: { x: 900, y: 2, width: 40, height: 20 }, image: join(dir, 'status.png') }],
    }
  }
  const strip = async (front) => {
    let seen = null
    await dryRun(world(front), async (h) => {
      await h.request('scope', { bundleIds: [FIXTURE] })
      const shot = await h.request('capture', { display: 1, maxSize: { width: 1000, height: 800 } })
      const image = decodePng(Buffer.from(shot.png, 'base64'))
      const at = (x, y) => image.pixel(Math.round(x * image.width / 1000), Math.round(y * image.height / 800)).slice(0, 3)
      let marker = 0
      for (let y = 0; y < Math.round(24 * image.height / 800); y += 1) {
        for (let x = 0; x < image.width; x += 2) {
          const [r, g, b] = image.pixel(x, y)
          if (r > 200 && g < 60 && b > 200) marker += 1
        }
      }
      seen = { own: at(40, 12), other: at(130, 12), status: at(920, 12), gap: at(500, 12), marker }
    })
    return seen
  }
  const approvedFront = await strip(FIXTURE)
  assert.equal(approvedFront.marker, 0, `${approvedFront.marker} status-item pixels reached the capture`)
  assert.ok(approvedFront.own.every((v) => v > 200), `the approved front app's own menu item is not shown: ${approvedFront.own}`)
  assert.deepEqual(approvedFront.other, [0, 0, 0], 'another app\'s menu item is not black')
  assert.deepEqual(approvedFront.status, [0, 0, 0], 'the status item is not black')
  assert.deepEqual(approvedFront.gap, [0, 0, 0], 'the strip between items is not black')
  const unapprovedFront = await strip(NOTES)
  assert.equal(unapprovedFront.marker, 0, 'with an unapproved app in front a status item reached the capture')
  assert.deepEqual(unapprovedFront.own, [0, 0, 0], 'with an unapproved app in front the menu bar was drawn')
})

/** Whether the helper under test settles after a person's resume (helper 0.2.8, design 0.4.2, PR #516). */
const settles = () => readFileSync(join(sutRoot(), '_environments_/macos-desktop/helper/dry-run.md'), 'utf8').includes('handsOnMs')

test('settleMs is honoured only after local input the helper saw: ignored otherwise; waits for hands-off then posts; capped posts nothing; spent once used (design 0.4.2)', { timeout: 90_000 }, async (t) => {
  if (!guard(t)) return
  if (!skipUnless(t, settles(), 'the helper under test has no settle yet (helper 0.2.8, PR #516)')) return
  const settleLines = (lines) => lines().filter((line) => line.settle).map((line) => line.settle)
  const posted = (lines) => lines().filter((line) => line.event).length
  const seeLocalInput = (h) => h.request('simulateLocalInput', { kind: 'key', via: 'idle' })
  const ready = async (h) => {
    await h.request('scope', { bundleIds: [FIXTURE, LEDGER] })
    await h.request('pauseOnLocalInput', { on: true })
  }
  // (a) No local input seen: the flag is ignored and the input posts at once - a driver cannot clear the guard at will.
  await dryRun(WORLD, async (h, lines) => {
    await ready(h)
    const reply = await h.request('input', { mode: 'global', bundleId: LEDGER, events: [move(300, 300)], settleMs: 500 })
    assert.equal(reply.done, true, JSON.stringify(reply))
    assert.deepEqual(settleLines(lines).map((s) => s.outcome), ['ignored'], 'a settle with no local input seen was not ignored')
    assert.equal(posted(lines), 1)
  })
  // (b) After local input, the person busy 600 ms more: the settle waits for settleMs of hands-off, then posts.
  await dryRun({ ...WORLD, handsOnMs: 600 }, async (h, lines) => {
    await ready(h)
    await seeLocalInput(h)
    const reply = await h.request('input', { mode: 'global', bundleId: LEDGER, events: [move(300, 300)], settleMs: 400 })
    assert.equal(reply.done, true, JSON.stringify(reply))
    const [first] = settleLines(lines)
    assert.equal(first?.outcome, 'settled', JSON.stringify(settleLines(lines)))
    assert.ok(first.waitedMs >= 400, `the settle waited ${first.waitedMs} ms, less than settleMs`)
    assert.equal(posted(lines), 1, 'the input did not post after the settle')
    // (d) Spent: the next settleMs, with no new local input, is ignored.
    await h.request('input', { mode: 'global', bundleId: LEDGER, events: [move(310, 300)], settleMs: 400 })
    assert.deepEqual(settleLines(lines).map((s) => s.outcome), ['settled', 'ignored'], 'a spent settle was honoured again')
  })
  // (c) The person never stops: past the cap nothing posts and the input reports local_input at step 0.
  await dryRun({ ...WORLD, handsOnMs: 20_000 }, async (h, lines) => {
    await ready(h)
    await seeLocalInput(h)
    const reply = await h.request('input', { mode: 'global', bundleId: LEDGER, events: [move(300, 300)], settleMs: 1000 })
    assert.deepEqual([reply.done, reply.failedAt, reply.code], [false, 0, 'local_input'], JSON.stringify(reply))
    assert.deepEqual(settleLines(lines).map((s) => s.outcome), ['capped'])
    assert.equal(posted(lines), 0, 'something posted though the person never stopped')
  }, ['--settle-cap-ms', '300'])
})

/** Whether the helper under test declares the same-named-app seams (helper 0.2.13, design 0.4.9, PR #583). */
const sameNamedSeams = () => readFileSync(join(sutRoot(), '_environments_/macos-desktop/helper/dry-run.md'), 'utf8').includes('sckBundleId')

/** Two apps sharing the executable 'cu-fixture': unapproved CU Ledger's window over CU Fixture's, misnamed as given. */
const sameNamedWorld = (ledgerExtra) => (dir) => {
  writeFileSync(join(dir, 'fixture.png'), solidPng(800, 600, [0, 200, 0]))
  writeFileSync(join(dir, 'ledger.png'), solidPng(400, 300, [255, 0, 255]))
  return {
    grants: { screen: true, accessibility: true, postEvents: true, listenEvents: false },
    displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 1000, height: 800 }, scale: 1 }],
    apps: [
      { bundleId: LEDGER, pid: 801, executable: 'cu-fixture', rect: { x: 300, y: 200, width: 400, height: 300 }, image: join(dir, 'ledger.png'), ...ledgerExtra },
      { bundleId: FIXTURE, pid: 800, executable: 'cu-fixture', rect: { x: 100, y: 100, width: 800, height: 600 }, image: join(dir, 'fixture.png') },
    ],
    frontmost: FIXTURE,
  }
}

test('R6b: an unapproved app sharing an approved app\'s executable stays black in every capture, even when ScreenCaptureKit names it the approved app', { timeout: 60_000 }, async (t) => {
  if (!guard(t)) return
  if (!skipUnless(t, sameNamedSeams(), 'the helper under test has no same-named-app seams yet (helper 0.2.13, PR #583)')) return
  await dryRun(sameNamedWorld({ sckBundleId: FIXTURE }), async (h) => {
    await h.request('scope', { bundleIds: [FIXTURE] })
    for (let i = 1; i <= 3; i += 1) {
      const shot = await h.request('capture', { display: 1, maxSize: { width: 1000, height: 800 } })
      assert.ok(shot.png, `capture ${i}: no image: ${JSON.stringify(shot).slice(0, 160)}`)
      const image = decodePng(Buffer.from(shot.png, 'base64'))
      let marker = 0
      let fixture = 0
      for (let y = 0; y < image.height; y += 4) {
        for (let x = 0; x < image.width; x += 4) {
          const [r, g, b] = image.pixel(x, y)
          if (r > 200 && g < 60 && b > 200) marker += 1
          if (r < 60 && g > 150 && b < 60) fixture += 1
        }
      }
      assert.equal(marker, 0, `capture ${i} shows the unapproved same-named app's pixels`)
      assert.ok(fixture > 0, `capture ${i} shows none of CU Fixture (the control)`)
    }
  })
})

test('R9: a click on an unapproved same-named app is refused out_of_scope naming it, even when Accessibility names the approved app; CU Fixture itself still takes the click', { timeout: 60_000 }, async (t) => {
  if (!guard(t)) return
  if (!skipUnless(t, sameNamedSeams(), 'the helper under test has no same-named-app seams yet (helper 0.2.13, PR #583)')) return
  await dryRun(sameNamedWorld({ axOwner: FIXTURE }), async (h, lines) => {
    await h.request('scope', { bundleIds: [FIXTURE] })
    await h.request('pauseOnLocalInput', { on: true })
    const reply = await h.request('input', { mode: 'global', bundleId: FIXTURE, events: [move(500, 350), down(500, 350), up(500, 350)] })
    assert.equal(reply.code, 'out_of_scope', JSON.stringify(reply))
    assert.equal(reply.bundleId, LEDGER, 'the refusal does not name the app actually under the point')
    assert.deepEqual(lines().filter((line) => line.event), [], 'events were built for a point over the unapproved app')
    const fine = await h.request('input', { mode: 'global', bundleId: FIXTURE, events: [move(150, 150), down(150, 150), up(150, 150)] })
    assert.equal(fine.done, true, `a click on CU Fixture itself was refused: ${JSON.stringify(fine)}`)
  })
})

// R10 (CU-44): an aborted drag must not drop. CU Ledger's window appears over the rest of the path after the first
// held move, so the next move is refused mid-path; the helper must cancel with Escape before the button comes up.
const abortsDrags = () => readFileSync(join(sutRoot(), '_environments_/macos-desktop/helper/Sources/DryRun.swift'), 'utf8').includes('coverAfter')
const drag = (x, y) => ({ kind: 'drag', button: 'left', x, y, flags: 0 })

test('R10: a drag refused mid-path is cancelled with Escape before the button comes up, so nothing drops; the reply says cancelledDrag', { timeout: 60_000 }, async (t) => {
  if (!guard(t)) return
  if (!skipUnless(t, abortsDrags(), 'the helper under test has no coverAfter seam yet (helper 0.2.19, PR #58)')) return
  const world = {
    grants: WORLD.grants,
    displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 1440, height: 900 }, scale: 1 }],
    apps: [{ bundleId: FIXTURE, pid: 900, rect: { x: 100, y: 100, width: 800, height: 500 } }],
    frontmost: FIXTURE,
    // After move, down and the first held move (3 posted events), CU Ledger covers x 400-900 of the path.
    coverAfter: { steps: 3, bundleId: LEDGER, pid: 801, rect: { x: 400, y: 100, width: 500, height: 500 } },
  }
  await dryRun(world, async (h, lines) => {
    await h.request('scope', { bundleIds: [FIXTURE] })
    await h.request('pauseOnLocalInput', { on: true })
    const reply = await h.request('input', { mode: 'global', bundleId: FIXTURE, events: [move(200, 300), down(200, 300), drag(300, 300), drag(500, 300), drag(700, 300), up(700, 300)] })
    assert.deepEqual([reply.done, reply.code], [false, 'out_of_scope'], `the drag was not refused mid-path: ${JSON.stringify(reply)}`)
    assert.equal(reply.cancelledDrag, true, `the reply does not say the drag was cancelled: ${JSON.stringify(reply)}`)
    const built = lines().map(({ event }) => event)
    const escape = built.findIndex((e) => e.type === 10 && e.keyCode === 53)
    const buttonUp = built.findIndex((e) => e.type === 2)
    assert.ok(escape >= 0, 'no Escape was built: the held button came up mid-drag, which drops')
    assert.ok(buttonUp > escape, `the button came up (event ${buttonUp}) before Escape (event ${escape})`)
    assert.ok(!built.some((e) => e.type === 6 && e.x >= 400), 'a held move was built over the window that covered the path')
    assert.deepEqual(unreleased(lines()), [], 'input left held after the aborted drag')
    assert.ok(lines().every((line) => line.event.tag === SYNTHETIC_TAG), 'the cancel or the release is not tagged')
  })
})

// R12 (CU-46): during a dragging session AppKit gives the source app a full-display window at the dragging level (500).
// The owner check may pass over only THAT window (the drag source's, while our button is held); any other app's
// dragging-level window counts. Three worlds, each refused naming CU Ledger.
const modelsDragImage = () => readFileSync(join(sutRoot(), '_environments_/macos-desktop/helper/Sources/DryRun.swift'), 'utf8').includes('dragImage')
const r12World = (extra) => ({
  grants: WORLD.grants,
  displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 1440, height: 900 }, scale: 1 }],
  frontmost: FIXTURE,
  dragImage: true,
  ...extra,
})

test('R12: the drag source\'s own drag image is passed over, so a window appearing mid-drag is refused, naming it; another app\'s dragging-level window always counts (CU-46)', { timeout: 90_000 }, async (t) => {
  if (!guard(t)) return
  if (!skipUnless(t, modelsDragImage(), 'the helper under test does not model the drag image yet (helper 0.2.21, PR #72)')) return
  // World 1: our drag (drag image on); CU Ledger's window appears over the path's tail after the first held move.
  await dryRun(r12World({ apps: [{ bundleId: FIXTURE, pid: 900, rect: { x: 100, y: 100, width: 800, height: 500 } }], coverAfter: { steps: 3, bundleId: LEDGER, pid: 801, rect: { x: 400, y: 100, width: 500, height: 500 } } }), async (h, lines) => {
    await h.request('scope', { bundleIds: [FIXTURE] })
    await h.request('pauseOnLocalInput', { on: true })
    const reply = await h.request('input', { mode: 'global', bundleId: FIXTURE, events: [move(200, 300), down(200, 300), drag(300, 300), drag(500, 300), drag(700, 300), up(700, 300)] })
    assert.deepEqual([reply.done === true, reply.code, reply.bundleId], [false, 'out_of_scope', LEDGER], `world 1 (window appearing mid-drag): ${JSON.stringify(reply)}`)
    assert.ok(!lines().some(({ event }) => event.type === 6 && event.x >= 400), 'world 1: a held move was built over the window that appeared')
    assert.deepEqual(unreleased(lines()), [], 'world 1: input left held')
  })
  // World 2: another app's window at the dragging level over a click target, no drag of ours.
  const layered = { apps: [{ bundleId: LEDGER, pid: 801, rect: { x: 450, y: 250, width: 100, height: 100 }, layer: 500 }, { bundleId: FIXTURE, pid: 900, rect: { x: 100, y: 100, width: 800, height: 500 } }] }
  await dryRun(r12World(layered), async (h, lines) => {
    await h.request('scope', { bundleIds: [FIXTURE] })
    await h.request('pauseOnLocalInput', { on: true })
    const reply = await h.request('input', { mode: 'global', bundleId: FIXTURE, events: [move(500, 300), down(500, 300), up(500, 300)] })
    assert.deepEqual([reply.done === true, reply.code, reply.bundleId], [false, 'out_of_scope', LEDGER], `world 2 (another app's layer-500 window, no drag): ${JSON.stringify(reply)}`)
    assert.deepEqual(lines().filter((line) => line.event), [], 'world 2: events were built under the other app\'s window')
    const fine = await h.request('input', { mode: 'global', bundleId: FIXTURE, events: [move(200, 200), down(200, 200), up(200, 200)] })
    assert.equal(fine.done, true, `world 2: a click on CU Fixture itself was refused: ${JSON.stringify(fine)}`)
  })
  // World 3: the same layer-500 window of another app, crossed during our drag.
  await dryRun(r12World(layered), async (h, lines) => {
    await h.request('scope', { bundleIds: [FIXTURE] })
    await h.request('pauseOnLocalInput', { on: true })
    const reply = await h.request('input', { mode: 'global', bundleId: FIXTURE, events: [move(200, 300), down(200, 300), drag(350, 300), drag(500, 300), drag(700, 300), up(700, 300)] })
    assert.deepEqual([reply.done === true, reply.code, reply.bundleId], [false, 'out_of_scope', LEDGER], `world 3 (another app's layer-500 window during our drag): ${JSON.stringify(reply)}`)
    assert.deepEqual(unreleased(lines()), [], 'world 3: input left held')
  })
})

// R13 (CU-39, D-045): an approved app's window may show another process's content (a remote open/save panel). The
// helper reports that process as elementOwner and never lends it the window's approval: an unapproved element owner
// fails closed. the in-process panel marker comes from PanelMarker.kind over the element's ancestry (the same code live uses).
const PANEL_SERVICE = 'com.apple.appkit.xpc.openAndSavePanelService'
const modelsElementOwner = () => readFileSync(join(sutRoot(), '_environments_/macos-desktop/helper/Sources/DryRun.swift'), 'utf8').includes('elementOwner')
const r13World = (fixtureExtra, extraApps = [], focused) => ({
  grants: WORLD.grants,
  displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 1440, height: 900 }, scale: 1 }],
  frontmost: FIXTURE,
  apps: [{ bundleId: FIXTURE, pid: 900, rect: { x: 100, y: 100, width: 800, height: 500 }, ...fixtureExtra }, ...extraApps],
  ...(focused ? { focused } : {}),
})
// The panel service is declared as its own process, off the display, so elementOwner resolves to it.
const SERVICE_APP = { bundleId: PANEL_SERVICE, pid: 777, rect: { x: 5000, y: 5000, width: 10, height: 10 } }

test('R13: another process\'s content in an approved window is reported (elementOwner) and fails closed unless that process is approved; panel marks reach hitTest and focused (CU-39)', { timeout: 90_000 }, async (t) => {
  if (!guard(t)) return
  if (!skipUnless(t, modelsElementOwner(), 'the helper under test does not model elementOwner yet (helper 0.2.22, PR #87)')) return
  // (a) CU Fixture's window showing the unapproved panel service's content.
  await dryRun(r13World({ elementOwner: PANEL_SERVICE }, [SERVICE_APP]), async (h, lines) => {
    await h.request('scope', { bundleIds: [FIXTURE] })
    await h.request('pauseOnLocalInput', { on: true })
    const hit = (await h.request('hitTest', { xPt: 300, yPt: 300 })).element
    assert.equal(hit?.elementOwner?.bundleId, PANEL_SERVICE, `(a) hitTest does not name the content's process: ${JSON.stringify(hit)}`)
    assert.ok(hit?.title == null && hit?.panel == null, `(a) foreign content was described (title or panel): ${JSON.stringify(hit)}`)
    const reply = await h.request('input', { mode: 'global', bundleId: FIXTURE, events: [move(300, 300), down(300, 300), up(300, 300)] })
    assert.deepEqual([reply.done === true, reply.code, reply.bundleId], [false, 'out_of_scope', PANEL_SERVICE], `(a) a click on unapproved content in an approved window: ${JSON.stringify(reply)}`)
    assert.deepEqual(lines().filter((line) => line.event), [], '(a) events were built over unapproved content')
  })
  // (b) the same window, the content's process approved too: the window's owner, as before.
  await dryRun(r13World({ elementOwner: PANEL_SERVICE }, [SERVICE_APP]), async (h) => {
    await h.request('scope', { bundleIds: [FIXTURE, PANEL_SERVICE] })
    await h.request('pauseOnLocalInput', { on: true })
    const reply = await h.request('input', { mode: 'global', bundleId: FIXTURE, events: [move(300, 300), down(300, 300), up(300, 300)] })
    assert.equal(reply.done, true, `(b) both processes approved, yet refused: ${JSON.stringify(reply)}`)
  })
  // (c1-c4) the panel marker, through PanelMarker.kind over a declared ancestry (a declared 'panel' key is stripped).
  await dryRun(r13World({ panel: 'save' }, [], { bundleId: FIXTURE, pid: 900, role: 'AXTextField', title: 'Save As:' }), async (h) => {
    await h.request('scope', { bundleIds: [FIXTURE] })
    assert.equal((await h.request('hitTest', { xPt: 300, yPt: 300 })).element?.panel, 'save', '(c1) a save-panel sheet: hitTest not marked')
    assert.equal((await h.request('focused', {})).element?.panel, 'save', '(c1) a save-panel sheet: focused not marked')
  })
  const el = (ancestors, extra = {}) => ({ bundleId: FIXTURE, pid: 900, role: 'AXButton', title: 'Choose', ancestors, ...extra })
  const elementsWorld = (element) => ({ ...r13World({}), elements: [{ rect: { x: 250, y: 250, width: 100, height: 100 }, element }] })
  const markAt = async (element) => {
    let panel
    await dryRun(elementsWorld(element), async (h) => {
      await h.request('scope', { bundleIds: [FIXTURE] })
      panel = (await h.request('hitTest', { xPt: 300, yPt: 300 })).element?.panel ?? null
    })
    return panel
  }
  assert.equal(await markAt(el([{ role: 'AXGroup' }, { role: 'AXSheet', identifier: 'open-panel' }, { role: 'AXWindow' }])), 'open', '(c2) an element under an open-panel sheet: not marked open')
  assert.equal(await markAt(el([{ role: 'AXGroup' }], { ancestorsEnd: 'error' })), 'unknown', '(c3) the walk ended in an AX error: not unknown')
  assert.equal(await markAt(el(Array.from({ length: 40 }, () => ({ role: 'AXGroup' })))), 'unknown', '(c3) 40 ancestors (the limit): not unknown')
  assert.equal(await markAt(el([{ role: 'AXGroup', identifier: 'Save' }, { role: 'AXWindow' }], { panel: 'save' })), null, '(c4) a title-like identifier, or a declared panel key, marked a panel')
  // (d) an ordinary window: neither field.
  await dryRun(r13World({}, [], { bundleId: FIXTURE, pid: 900, role: 'AXTextField', title: 'Name' }), async (h) => {
    await h.request('scope', { bundleIds: [FIXTURE] })
    const hit = (await h.request('hitTest', { xPt: 300, yPt: 300 })).element
    const focused = (await h.request('focused', {})).element
    assert.ok(hit?.panel == null && hit?.elementOwner == null && focused?.panel == null, `(d) an ordinary window was marked: ${JSON.stringify({ hit, focused })}`)
  })
})

// R14 (CU-39, D-045): what an open/save panel would commit, canonicalised through the helper's own PanelPath (the same
// code live): a folder reached through a symlink is resolved; a name typed as a path ('/...') is that path, standardised
// and resolved through symlinks; with no readable folder a plain name is unknown (null), never a guess; control and
// format characters are escaped; with no panel in front, nothing. Worlds use paths under this test's own /tmp folder
// only - the '~' expansion is proven by macos-helper's unit checks with an injected home, never the owner's.
const modelsPanelSelection = () => readFileSync(join(sutRoot(), '_environments_/macos-desktop/helper/Sources/DryRun.swift'), 'utf8').includes('declaredPanelSelection')

test('R14: panelSelection canonicalises a panel\'s commit target - symlinks resolved, typed paths taken as paths, unknown stays unknown, names escaped (CU-39)', { timeout: 120_000 }, async (t) => {
  if (!guard(t)) return
  if (!skipUnless(t, modelsPanelSelection(), 'the helper under test has no panelSelection yet (helper 0.2.23, PR #65)')) return
  const fs = await import('node:fs')
  const tmp = fs.mkdtempSync('/tmp/cu-verifier-r14-')
  try {
    fs.mkdirSync(join(tmp, 'real', 'sub'), { recursive: true })
    fs.symlinkSync(join(tmp, 'real'), join(tmp, 'link'))
    const realDir = fs.realpathSync(join(tmp, 'real'))
    const realSub = fs.realpathSync(join(tmp, 'real', 'sub'))
    const select = async (selection, panel = 'save') => {
      let reply
      const world = {
        grants: WORLD.grants,
        displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 1440, height: 900 }, scale: 1 }],
        frontmost: FIXTURE,
        apps: [{ bundleId: FIXTURE, pid: 900, rect: { x: 100, y: 100, width: 800, height: 500 }, ...(panel ? { panel } : {}) }],
        panelSelection: selection,
      }
      await dryRun(world, async (h) => {
        await h.request('scope', { bundleIds: [FIXTURE] })
        reply = await h.request('panelSelection', {})
      })
      return reply
    }
    // (a) a folder reached through a symlink: the folder and the path are resolved.
    const a = await select({ directory: join(tmp, 'link'), fileName: 'report.txt' })
    assert.deepEqual([a.directory, a.path, a.name], [realDir, join(realDir, 'report.txt'), 'report.txt'], `(a) symlinked folder: ${JSON.stringify(a)}`)
    // (b) a typed absolute path with '..' segments: that path, standardised, not a name in the folder.
    const b = await select({ directory: join(tmp, 'link'), fileName: `${tmp}/real/../real/sub/z.txt` })
    assert.equal(b.path, join(realSub, 'z.txt'), `(b) typed absolute path with '..': ${JSON.stringify(b)}`)
    // (b2) a typed absolute path through the symlink: resolved through it.
    const b2 = await select({ directory: join(tmp, 'real'), fileName: `${tmp}/link/sub/z.txt` })
    assert.equal(b2.path, join(realSub, 'z.txt'), `(b2) typed path through a symlink: ${JSON.stringify(b2)}`)
    // (c) no readable folder and a plain name: unknown, never a guess.
    const c = await select({ fileName: 'plain.txt' })
    assert.deepEqual([c.path ?? null, c.directory ?? null, c.name], [null, null, 'plain.txt'], `(c) no folder: ${JSON.stringify(c)}`)
    // (d) a bidi override in the name: escaped, never raw.
    const d = await select({ directory: join(tmp, 'link'), fileName: 'report\u202Efdp.exe' })
    assert.ok(typeof d.path === 'string' && d.path.endsWith('report\\u{202E}fdp.exe') && !d.path.includes('\u202E'), `(d) bidi override not escaped: ${JSON.stringify(d)}`)
    // (e) no panel in front: nothing to commit.
    const e = await select({ directory: join(tmp, 'link'), fileName: 'report.txt' }, null)
    assert.deepEqual([e.path ?? null, e.directory ?? null, e.name ?? null], [null, null, null], `(e) no panel in front: ${JSON.stringify(e)}`)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

// CU-55 (D-049): two displays and Retina scale 2 (helper 0.2.26, CU-51). The verifier's own world: a Retina main display
// at the origin and a scale-1 display to its left, sharing the edge x = 0.
const MAIN2 = { id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 1000, height: 800 }, scale: 2 }
const LEFT1 = { id: 2, originPt: { x: -1200, y: 0 }, sizePt: { width: 1200, height: 800 }, scale: 1 }
const GRANTED = { screen: true, accessibility: true, postEvents: true, listenEvents: false }
/** The helper under test's patch version (0.2.N), or -1 when unknown. */
const patch = () => (helper.version?.[0] === 0 && helper.version?.[1] === 2 ? helper.version?.[2] ?? -1 : helper.version?.[0] > 0 ? 999 : -1)
const MAGENTA = ([r, g, b]) => r > 200 && g < 60 && b > 200

test('R15: a capture of a Retina display is its points times its scale, and the approved window sits where its global points say; the scale-1 display stays at its points (CU-55)', { timeout: 60_000 }, async (t) => {
  if (!guard(t)) return
  await dryRun((dir) => {
    writeFileSync(join(dir, 'fixture.png'), solidPng(600, 400, [0, 200, 0]))
    return { grants: GRANTED, displays: [MAIN2, LEFT1], apps: [{ bundleId: FIXTURE, pid: 800, rect: { x: 100, y: 100, width: 600, height: 400 }, image: join(dir, 'fixture.png') }], frontmost: FIXTURE }
  }, async (h) => {
    await h.request('scope', { bundleIds: [FIXTURE] })
    const retina = await h.request('capture', { display: 1, maxSize: { width: 4000, height: 4000 } })
    assert.deepEqual([retina.widthPx, retina.heightPx, retina.scale], [2000, 1600, 2], `the Retina capture is not its points x 2: ${JSON.stringify({ widthPx: retina.widthPx, heightPx: retina.heightPx, scale: retina.scale })}`)
    const image = decodePng(Buffer.from(retina.png, 'base64'))
    assert.deepEqual([image.width, image.height], [2000, 1600], 'the PNG is not the size the reply states')
    assert.deepEqual(image.pixel(400 * 2, 300 * 2).slice(0, 3), [0, 200, 0], 'CU Fixture is not at its global points x 2 on the Retina display')
    assert.deepEqual(image.pixel(850 * 2, 300 * 2).slice(0, 3), [0, 0, 0], 'outside CU Fixture the Retina capture is not black')
    const left = await h.request('capture', { display: 2, maxSize: { width: 4000, height: 4000 } })
    assert.deepEqual([left.widthPx, left.heightPx, left.scale], [1200, 800, 1], 'the scale-1 display is not captured at its points')
  })
})

test('R16: with a menu bar on every display (separate Spaces), only the display holding the approved app\'s menu-bar strip shows the bar - another display\'s status item never reaches its capture (CU-55, CU-51)', { timeout: 60_000 }, async (t) => {
  if (!guard(t)) return
  if (!skipUnless(t, patch() >= 26, `CUHelper ${helper.version?.join('.') ?? '?'} predates the per-display menu bar (0.2.26, CU-51)`)) return
  await dryRun((dir) => {
    writeFileSync(join(dir, 'fixture.png'), solidPng(1000, 776, [0, 200, 0]))
    writeFileSync(join(dir, 'status.png'), solidPng(40, 20, [255, 0, 255]))
    return {
      grants: GRANTED, displays: [MAIN2, LEFT1], frontmost: FIXTURE,
      apps: [{ bundleId: FIXTURE, pid: 800, rect: { x: 0, y: 24, width: 1000, height: 776 }, image: join(dir, 'fixture.png') }],
      menuBar: [{ bundleId: FIXTURE, frame: { x: 10, y: 2, width: 60, height: 20 } }],
      menuBarStrip: { x: 0, y: 0, width: 1000, height: 24 },
      // The left display's own bar: a status item in the marker colour on its top band; one on the main bar too.
      statusItems: [{ frame: { x: -300, y: 2, width: 40, height: 20 }, image: join(dir, 'status.png') }, { frame: { x: 900, y: 2, width: 40, height: 20 }, image: join(dir, 'status.png') }],
    }
  }, async (h) => {
    await h.request('scope', { bundleIds: [FIXTURE] })
    const count = (shot) => {
      const image = decodePng(Buffer.from(shot.png, 'base64'))
      let n = 0
      for (let y = 0; y < image.height; y += 2) for (let x = 0; x < image.width; x += 2) if (MAGENTA(image.pixel(x, y))) n += 1
      return { n, image }
    }
    const left = count(await h.request('capture', { display: 2, maxSize: { width: 1200, height: 800 } }))
    assert.equal(left.n, 0, `${left.n} sampled status-item pixels reached the left display's capture`)
    const main = count(await h.request('capture', { display: 1, maxSize: { width: 2000, height: 1600 } }))
    assert.equal(main.n, 0, `${main.n} sampled status-item pixels reached the main display's capture`)
    assert.ok(main.image.pixel(40 * 2, 12 * 2).slice(0, 3).every((v) => v > 200), 'the approved app\'s own menu item is not shown on the display holding its strip')
  })
})

test('R17: a window straddling the displays\' shared edge belongs to the display holding its centre, and each side of it takes a click (CU-55; the dry run models the live rule: CGGetDisplaysWithPoint at the centre of the first scope app\'s focused window)', { timeout: 60_000 }, async (t) => {
  if (!guard(t)) return
  if (!skipUnless(t, patch() >= 26, `CUHelper ${helper.version?.join('.') ?? '?'} predates the centre rule (0.2.26, CU-51)`)) return
  // x -700..200: most of it, and its centre (x -250), on the left display; the main display is declared first.
  await dryRun({ grants: GRANTED, displays: [MAIN2, LEFT1], apps: [{ bundleId: FIXTURE, pid: 800, rect: { x: -700, y: 100, width: 900, height: 400 } }], frontmost: FIXTURE }, async (h, lines) => {
    const scope = await h.request('scope', { bundleIds: [FIXTURE] })
    assert.equal(scope.display, 2, `the straddling window's display is ${JSON.stringify(scope.display)}, not the one holding its centre (2)`)
    await h.request('pauseOnLocalInput', { on: true })
    for (const x of [-300, 100]) {
      const reply = await h.request('input', { mode: 'global', bundleId: FIXTURE, events: [move(x, 300), down(x, 300), up(x, 300)] })
      assert.equal(reply.done, true, `a click at x ${x} on the straddling window was not done: ${JSON.stringify(reply)}`)
    }
    assert.deepEqual(lines().filter(({ event }) => event.type === 1).map(({ event }) => [event.x, event.y]), [[-300, 300], [100, 300]], 'the clicks are not at their global points on both sides')
  })
})

test('R18: on the secondary display, input over an unapproved window is refused naming that window\'s app, nothing is built, and the approved window beside it still takes a click (CU-55)', { timeout: 60_000 }, async (t) => {
  if (!guard(t)) return
  await dryRun({
    grants: GRANTED, displays: [MAIN2, LEFT1], frontmost: FIXTURE,
    apps: [{ bundleId: NOTES, pid: 700, rect: { x: -600, y: 200, width: 300, height: 200 } }, { bundleId: FIXTURE, pid: 800, rect: { x: -1100, y: 100, width: 800, height: 500 } }],
  }, async (h, lines) => {
    await h.request('scope', { bundleIds: [FIXTURE] })
    await h.request('pauseOnLocalInput', { on: true })
    const refused = await h.request('input', { mode: 'global', bundleId: FIXTURE, events: [move(-450, 300), down(-450, 300), up(-450, 300)] })
    assert.equal(refused.code, 'out_of_scope', JSON.stringify(refused))
    assert.equal(refused.bundleId, NOTES, 'the refusal does not name the covering app on the secondary display')
    assert.deepEqual(lines(), [], 'events were built for a point over an unapproved app on the secondary display')
    const done = await h.request('input', { mode: 'global', bundleId: FIXTURE, events: [move(-1000, 300), down(-1000, 300), up(-1000, 300)] })
    assert.equal(done.done, true, `the approved window beside it did not take the click: ${JSON.stringify(done)}`)
  })
})
