import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createRunControl } from '../../_tools_/agent-core/lib.mjs'
import { EnvironmentError } from '../../_environments_/macos-desktop/errors.mjs'
import { captureImage, connectStdio, LOCAL_INPUT_KINDS, LOCAL_INPUT_VIA, readCaptureFile } from '../../_environments_/macos-desktop/helper-link.mjs'
import { launchApproved, logged, pause, scratch, scratchLocks, spawnFake, stdioLink, stopFake } from './harness.mjs'
import { makePng } from './png.mjs'

/**
 * Design 0.2 alignment of the helper client and the fake helper: captures by path and sha256 in the run's private
 * directory (helper-and-protocol.md), the `simulateScale` capture seam (capture-and-scaling.md) and the
 * `simulateLocalInput` seam (human-control.md).
 */

const code = (expected) => (error) => error instanceof EnvironmentError && error.code === expected
const refusedFor = (pattern) => (error) => code('helper_lost')(error) && pattern.test(error.details?.refused ?? '')
const FIXTURE = 'com.example.fixture'
const SEAT = 'cu-developer-two'
const locks = scratchLocks()
const root = scratch()
after(() => {
  locks.remove()
  root.remove()
})
let dirs = 0

/** A fresh mode-700 directory, as the run directory is. */
function privateDir() {
  dirs += 1
  const dir = join(root.dir, `run-${dirs}`)
  mkdirSync(dir, { mode: 0o700 })
  chmodSync(dir, 0o700)
  return dir
}

const sha = (data) => createHash('sha256').update(data).digest('hex')

/** Launch on a fake over stdio; `child` is set even when the launch fails, so the test can stop it. */
async function launchOnFake(config = {}, options = {}) {
  const started = { child: null }
  const connect = async () => {
    const { child, link } = await stdioLink(config)
    started.child = child
    return link
  }
  try {
    const env = await launchApproved(connect, { apps: [FIXTURE], seat: SEAT, runLock: locks.next(), ...options })
    return { env, child: started.child }
  } catch (error) {
    if (started.child !== null) await stopFake(started.child)
    throw error
  }
}

test('readCaptureFile: a .png directly in the run directory is read, hash-checked and deleted', () => {
  const dir = privateDir()
  const png = makePng(3, 2)
  const path = join(dir, 'capture-1.png')
  writeFileSync(path, png, { mode: 0o600 })
  assert.deepEqual(readCaptureFile({ path, sha256: sha(png), runDir: dir }), png)
  assert.equal(existsSync(path), false, 'deleted after reading')
  writeFileSync(path, png)
  assert.throws(() => readCaptureFile({ path, sha256: sha(Buffer.from('other')), runDir: dir }), refusedFor(/sha256/))
  assert.equal(existsSync(path), false, 'deleted even when the hash is wrong')
  writeFileSync(path, png)
  assert.throws(() => readCaptureFile({ path, sha256: sha(png), runDir: dir, maxBytes: 10 }), refusedFor(/larger/))
  assert.equal(existsSync(path), false)
})

test('readCaptureFile: a path outside the run directory, an odd name or a symlink is refused, and nothing outside is deleted', () => {
  const dir = privateDir()
  const elsewhere = privateDir()
  const png = makePng(2, 2)
  const outside = join(elsewhere, 'capture.png')
  writeFileSync(outside, png)
  assert.throws(() => readCaptureFile({ path: outside, sha256: sha(png), runDir: dir }), (e) => refusedFor(/outside the run directory/)(e) && !e.message.includes(elsewhere), 'refused without naming the path')
  writeFileSync(join(dir, 'capture.png'), png)
  for (const path of [`${dir}/../${elsewhere.split('/').pop()}/capture.png`, `${dir}/sub/../capture.png`, `${dir}/./capture.png`, `${dir}//capture.png`]) {
    assert.throws(() => readCaptureFile({ path, sha256: sha(png), runDir: dir }), refusedFor(/normalised/), path)
  }
  assert.throws(() => readCaptureFile({ path: 'capture.png', sha256: sha(png), runDir: dir }), refusedFor(/absolute/))
  assert.equal(existsSync(outside), true, 'a file outside is never deleted')
  assert.equal(existsSync(join(dir, 'capture.png')), true, 'nor one named by a path that was refused')
  writeFileSync(join(dir, 'token'), 'secret\n')
  assert.throws(() => readCaptureFile({ path: join(dir, 'token'), sha256: sha('secret\n'), runDir: dir }), refusedFor(/\.png name/))
  assert.equal(readFileSync(join(dir, 'token'), 'utf8'), 'secret\n', 'the token is never read as a capture, nor deleted')
  const link = join(dir, 'capture-link.png')
  symlinkSync(outside, link)
  assert.throws(() => readCaptureFile({ path: link, sha256: sha(png), runDir: dir }), refusedFor(/symlink/))
  assert.equal(existsSync(link), false, 'the link itself is removed')
  assert.deepEqual(readFileSync(outside), png, 'its target is untouched')
  mkdirSync(join(dir, 'folder.png'))
  assert.throws(() => readCaptureFile({ path: join(dir, 'folder.png'), sha256: sha(png), runDir: dir }), refusedFor(/regular file/))
  assert.throws(() => readCaptureFile({ path: join(dir, 'x.png'), sha256: sha(png).toUpperCase(), runDir: dir }), refusedFor(/lowercase hex/))
  assert.throws(() => readCaptureFile({ path: join(dir, 'x.png'), sha256: sha(png), runDir: null }), refusedFor(/no run directory/))
})

test('captureImage: inline png or path, never both and never neither', () => {
  const png = makePng(2, 2)
  assert.deepEqual(captureImage({ png: png.toString('base64') }), png)
  assert.throws(() => captureImage({ png: png.toString('base64'), path: '/tmp/x.png', sha256: sha(png) }, { runDir: '/tmp' }), refusedFor(/both/))
  assert.throws(() => captureImage({ widthPx: 2 }), refusedFor(/no image/))
  assert.throws(() => captureImage({ png: 7 }), refusedFor(/base64/))
})

test('captures by path end to end: the fake writes into the run directory, the driver reads, checks and deletes each file', async () => {
  const dir = privateDir()
  const { env, child } = await launchOnFake({ runDir: dir }, { captureDir: dir })
  try {
    assert.equal(env.captureDir, dir)
    const forms = []
    const original = env.link.request.bind(env.link)
    env.link.request = async (type, fields, options) => {
      const reply = await original(type, fields, options)
      if (type === 'capture') forms.push([typeof reply.png, typeof reply.path, /^[0-9a-f]{64}$/.test(reply.sha256), reply.path?.startsWith(`${dir}/`)])
      return reply
    }
    const shot = await env.screenshot()
    assert.deepEqual([shot.width, shot.height, shot.data.length > 0], [800, 600, true])
    const zoom = await env.screenshot({ region: [0, 0, 100, 50] })
    assert.deepEqual([zoom.width, zoom.height], [100, 50])
    assert.deepEqual(readdirSync(dir), [], 'every capture file is deleted')
    assert.deepEqual(forms, [['undefined', 'string', true, true], ['undefined', 'string', true, true]], 'both came as files, not inline')
    await logged(child, 5)
    assert.equal(child.requests.filter((r) => r.type === 'capture').length, 3)
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('captures by path: a wrong hash, a file outside the run directory, a symlink or no run directory ends the run helper_lost', async () => {
  const dir = privateDir()
  await assert.rejects(launchOnFake({ runDir: dir, quirks: { captureBadHash: true } }, { captureDir: dir }), refusedFor(/sha256/))
  assert.deepEqual(readdirSync(dir), [], 'the refused file is deleted too')
  const elsewhere = privateDir()
  const outside = join(elsewhere, 'capture.png')
  await assert.rejects(launchOnFake({ runDir: dir, quirks: { captureOutside: outside } }, { captureDir: dir }), refusedFor(/outside/))
  assert.equal(existsSync(outside), true, 'nothing outside the run directory is deleted')
  const target = join(elsewhere, 'target.png')
  await assert.rejects(launchOnFake({ runDir: dir, quirks: { captureSymlinkTo: target } }, { captureDir: dir }), refusedFor(/symlink/))
  assert.equal(existsSync(target), true)
  assert.deepEqual(readdirSync(dir), [])
  await assert.rejects(launchOnFake({ runDir: dir }), refusedFor(/no run directory/), 'a path reply on a link with no run directory')
  await assert.rejects(launchOnFake({ runDir: dir, quirks: { captureBoth: true } }, { captureDir: dir }), refusedFor(/both/))
})

test('a refused capture mid-run ends the link: crash event, then helper_lost from every member', async () => {
  const dir = privateDir()
  const { env, child } = await launchOnFake({ runDir: dir }, { captureDir: dir })
  const crashes = []
  env.on('crash', (event) => crashes.push(event))
  try {
    // The next capture reply claims a hash its file does not have.
    const original = env.link.request.bind(env.link)
    env.link.request = async (type, fields, options) => {
      const reply = await original(type, fields, options)
      return type === 'capture' ? { ...reply, sha256: '0'.repeat(64) } : reply
    }
    await assert.rejects(env.screenshot(), refusedFor(/sha256/))
    await pause(10)
    assert.deepEqual(crashes.map((c) => c.code), ['helper_lost'])
    await assert.rejects(env.perform({ type: 'click', x: 1, y: 1, button: 'left' }), code('helper_lost'))
    assert.deepEqual(readdirSync(dir), [])
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('simulateScale: on a scale-1 display every capture renders at 2x, and the frame maps per axis at that factor', async () => {
  const config = {
    displays: [{ id: 3, main: true, originPt: { x: 100, y: 50 }, sizePt: { width: 400, height: 300 }, scale: 1 }],
    apps: [{ bundleId: FIXTURE, pid: 501, rect: { x: 100, y: 50, width: 400, height: 300 } }],
  }
  const plain = await launchOnFake(config)
  try {
    assert.deepEqual([plain.env.frame.width, plain.env.frame.scaleX], [400, 1], 'without the seam the frame is the display\'s own 1x')
  } finally {
    await plain.env.close()
    await stopFake(plain.child)
  }
  const { env, child } = await launchOnFake(config, { simulateScale: 2 })
  try {
    assert.deepEqual([env.frame.width, env.frame.height, env.frame.scaleX, env.frame.scaleY, env.frame.devicePixelRatio], [800, 600, 2, 2, 2])
    await env.perform({ type: 'click', x: 401, y: 101, button: 'left' })
    const zoom = await env.screenshot({ region: [200, 100, 400, 300] })
    assert.deepEqual([zoom.width, zoom.height], [200, 200], 'a zoom renders at the simulated scale too')
    await env.screenshot()
    await logged(child, 7) // the click is a hitTest and an input (D-036)
    const captures = child.requests.filter((r) => r.type === 'capture')
    assert.deepEqual(captures.map((r) => r.simulateScale), [2, 2, 2], 'every capture carries the seam')
    assert.deepEqual(captures[0].maxSize, { width: 800, height: 600 })
    assert.deepEqual(captures[1].region, { x: 200, y: 100, width: 100, height: 100 })
    const click = child.requests.find((r) => r.type === 'input')
    assert.deepEqual(click.events[0], { kind: 'move', x: 301, y: 101, flags: 0 }, 'origin + (401 / 2, 101 / 2), rounded')
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('simulateScale: with an image limit the factor is fractional and each axis keeps its own scale', async () => {
  const config = {
    displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 1000, height: 777 }, scale: 1 }],
    apps: [{ bundleId: FIXTURE, pid: 501, rect: { x: 0, y: 0, width: 1000, height: 777 } }],
  }
  const { env, child } = await launchOnFake(config, { simulateScale: 2, frame: { maxLongEdge: 1500 } })
  try {
    assert.deepEqual([env.frame.width, env.frame.height], [1500, 1165])
    assert.equal(env.frame.scaleX, 1.5)
    assert.equal(env.frame.scaleY, 1165 / 777)
    assert.notEqual(env.frame.scaleX, env.frame.scaleY)
    const box = await env.inspectPoint({ x: 1499, y: 1164 })
    assert.equal(box, null)
    await logged(child, 4)
    const hit = child.requests.find((r) => r.type === 'hitTest')
    assert.deepEqual([hit.xPt, hit.yPt], [Math.round(1499 / 1.5), Math.round(1164 / (1165 / 777))])
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('simulateScale: a helper that ignores it, or a value outside the seam, is refused', async () => {
  await assert.rejects(launchOnFake({ quirks: { ignoreSimulateScale: true } }, { simulateScale: 2 }), refusedFor(/simulateScale/))
  const { child, link } = await stdioLink({})
  try {
    await link.request('scope', { bundleIds: [FIXTURE] })
    for (const simulateScale of [1, 5, '2']) {
      await assert.rejects(link.request('capture', { maxSize: { width: 10, height: 10 }, simulateScale }), (e) => code('invalid_argument')(e) && e.details.field === 'simulateScale', String(simulateScale))
    }
    const reply = await link.request('capture', { maxSize: { width: 1600, height: 1200 }, simulateScale: 2 })
    assert.deepEqual([reply.widthPx, reply.heightPx, reply.scale], [1600, 1200, 2])
  } finally {
    link.close()
    await stopFake(child)
  }
})

test('simulateLocalInput via idle: the helper reports input, the run stops at once, listeners hear time and kind only', async () => {
  const control = createRunControl({ runId: 'seam' })
  const { env, child } = await launchOnFake({}, { control })
  const heard = []
  env.on('localInput', (event) => heard.push(event))
  try {
    const result = await env.simulateLocalInput({ via: 'idle', kind: 'pointer' })
    assert.equal(result.detectedBy, 'idle')
    assert.equal(typeof result.at, 'string', 'the stop already holds when the call resolves')
    assert.deepEqual(heard, [{ at: result.at, kind: 'pointer' }])
    assert.equal(env.state().localInput, result.at)
    await assert.rejects(env.perform({ type: 'click', x: 1, y: 1, button: 'left' }), (e) => code('taken_over')(e))
    await logged(child, 4)
    assert.deepEqual(child.requests.at(-1), { id: child.requests.at(-1).id, type: 'simulateLocalInput', kind: 'pointer', via: 'idle' })
    assert.equal(child.requests.filter((r) => r.type === 'input').length, 0, 'nothing was posted after the pause')
    // Before C4 the driver's own stop holds and run control stays running; with C4 (run control accepts local_input
    // for pause only) the run is paused and local input can never resume it. Either way only a person brings it back.
    if (control.state === 'paused') {
      assert.equal(control.send({ command: 'resume' }, { source: 'local_input' }).ok, false, 'local input never resumes')
      assert.equal(control.send({ command: 'resume' }, { source: 'control' }).ok, true)
    } else {
      assert.equal(control.state, 'running')
      control.send({ command: 'take_over' }, { source: 'control' })
      control.send({ command: 'hand_back' }, { source: 'control' })
    }
    assert.equal(env.state().localInput, null, 'only a person brings the run back')
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('simulateLocalInput via tap follows the tap\'s grant rule (helper 0.2.2): Accessibility or Input Monitoring; untagged needs accessibility and is seen by the tap', async () => {
  // Neither grant: no tap, so `tap` is refused naming Accessibility - the grant that installs the active tap.
  const noTap = await launchOnFake({ grants: { accessibility: false, listenEvents: false } })
  try {
    await assert.rejects(noTap.env.simulateLocalInput({ via: 'tap' }), (e) => code('not_granted')(e) && e.details.grant === 'accessibility' && /Accessibility/.test(e.message))
    assert.equal(noTap.env.state().localInput, null, 'a refused seam reports nothing')
    await assert.rejects(noTap.env.simulateLocalInput({ via: 'untagged' }), (e) => code('not_granted')(e) && e.details.grant === 'accessibility')
  } finally {
    await noTap.env.close()
    await stopFake(noTap.child)
  }
  // Accessibility alone installs the active pass-through tap; Input Monitoring alone a listen-only one. Either reports.
  for (const grants of [{ accessibility: true, listenEvents: false }, { accessibility: false, listenEvents: true }]) {
    const withTap = await launchOnFake({ grants })
    try {
      assert.equal((await withTap.env.simulateLocalInput({ via: 'tap', kind: 'key' })).detectedBy, 'tap', JSON.stringify(grants))
    } finally {
      await withTap.env.close()
      await stopFake(withTap.child)
    }
  }
  const untaggedTap = await launchOnFake({ grants: { accessibility: true, listenEvents: false } })
  try {
    assert.equal((await untaggedTap.env.simulateLocalInput({ via: 'untagged' })).detectedBy, 'tap')
    const before = untaggedTap.child.requests.length
    await assert.rejects(untaggedTap.env.simulateLocalInput({ via: 'untagged' }), code('taken_over'), 'a stopped run posts no untagged event either')
    await pause(20)
    assert.equal(untaggedTap.child.requests.length, before)
  } finally {
    await untaggedTap.env.close()
    await stopFake(untaggedTap.child)
  }
  // Without Accessibility, a listen-only tap still sees the person, but nothing may be posted untagged.
  const noAx = await launchOnFake({ grants: { accessibility: false, listenEvents: true } })
  try {
    await assert.rejects(noAx.env.simulateLocalInput({ via: 'untagged' }), (e) => code('not_granted')(e) && e.details.grant === 'accessibility')
  } finally {
    await noAx.env.close()
    await stopFake(noAx.child)
  }
  // An untagged event is synthetic input: with no app in scope the helper refuses it, as the Swift helper does.
  const unscoped = await launchOnFake({}, { approve: [] })
  try {
    await assert.rejects(unscoped.env.simulateLocalInput({ via: 'untagged' }), (e) => code('out_of_scope')(e) && e.details.reason === 'no_scope')
    assert.equal(unscoped.env.state().localInput, null)
  } finally {
    await unscoped.env.close()
    await stopFake(unscoped.child)
  }
})

test('pauseOnLocalInput reports its guards as helper 0.2.2 does: idleCounter, plus eventTap whenever a tap is installed', async () => {
  const cases = [
    [{ accessibility: true, listenEvents: false }, ['idleCounter', 'eventTap'], 'the active pass-through tap'],
    [{ accessibility: true, listenEvents: true }, ['idleCounter', 'eventTap'], 'active wins; still one tap'],
    [{ accessibility: false, listenEvents: true }, ['idleCounter', 'eventTap'], 'a listen-only tap'],
    [{ accessibility: false, listenEvents: false }, ['idleCounter'], 'no tap without either grant'],
  ]
  for (const [grants, via, why] of cases) {
    const { child, link } = await stdioLink({ grants })
    try {
      assert.deepEqual(await link.request('pauseOnLocalInput', { on: true }), { armed: true, via }, why)
      assert.deepEqual(await link.request('pauseOnLocalInput', { on: false }), { armed: false, via: [] }, 'disarmed: no guard')
    } finally {
      link.close()
      await stopFake(child)
    }
  }
  // `--simulate-ungranted` forces every grant off, so no tap either.
  const forced = spawnFake({}, { args: ['--simulate-ungranted'] })
  const link = await connectStdio(forced, { token: 'test-token', helloTimeoutMs: 5000 })
  try {
    assert.deepEqual(link.hello.grants, { screen: false, accessibility: false, postEvents: false, listenEvents: false })
    assert.deepEqual(await link.request('pauseOnLocalInput', { on: true }), { armed: true, via: ['idleCounter'] })
  } finally {
    link.close()
    await stopFake(forced)
  }
})

test('simulateLocalInput: bad via or kind is refused by name on both sides; without the pause armed there is no guard to report', async () => {
  assert.deepEqual([LOCAL_INPUT_VIA, LOCAL_INPUT_KINDS], [['tap', 'idle', 'untagged'], ['key', 'pointer']])
  const { env, child } = await launchOnFake()
  try {
    await assert.rejects(env.simulateLocalInput({ via: 'hid' }), (e) => code('invalid_argument')(e) && e.details.field === 'via')
    await assert.rejects(env.simulateLocalInput({ via: 'idle', kind: 'scroll' }), (e) => code('invalid_argument')(e) && e.details.field === 'kind')
    await assert.rejects(env.simulateLocalInput(), (e) => code('invalid_argument')(e) && e.details.field === 'via')
    await logged(child, 3)
    assert.equal(child.requests.some((r) => r.type === 'simulateLocalInput'), false, 'refused before sending')
  } finally {
    await env.close()
    await stopFake(child)
  }
  const { child: raw, link } = await stdioLink({})
  try {
    await link.request('pauseOnLocalInput', { on: true })
    for (const [fields, field] of [[{ kind: 'key', via: 'hid' }, 'via'], [{ kind: 'scroll', via: 'idle' }, 'kind']]) {
      await assert.rejects(link.request('simulateLocalInput', fields), (e) => code('invalid_argument')(e) && e.details.field === field)
    }
  } finally {
    link.close()
    await stopFake(raw)
  }
  const unarmed = await launchOnFake({ pauseArms: false }, { mode: 'pid' })
  try {
    assert.equal(unarmed.env.pauseArmed, false)
    await assert.rejects(unarmed.env.simulateLocalInput({ via: 'idle' }), (e) => code('blocked_by_policy')(e) && e.details.reason === 'pause_not_armed')
  } finally {
    await unarmed.env.close()
    await stopFake(unarmed.child)
  }
})
