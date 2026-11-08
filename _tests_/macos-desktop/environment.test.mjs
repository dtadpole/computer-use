import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { chmodSync, existsSync, mkdirSync, readdirSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { after, test } from 'node:test'

import { createExclusions } from '../../_tools_/agent-core/exclusions.mjs'
import { createFakeEnvironment, createRunControl } from '../../_tools_/agent-core/lib.mjs'
import { launchDesktopEnvironment, SITE } from '../../_environments_/macos-desktop/environment.mjs'
import { EnvironmentError } from '../../_environments_/macos-desktop/errors.mjs'
import { launchApproved, logged, pause, scratch, scratchLocks, spawnFake, stdioLink, stopFake } from './harness.mjs'

const code = (expected) => (error) => error instanceof EnvironmentError && error.code === expected
const FIXTURE = 'com.example.fixture'
const CLAUDE = { maxLongEdge: 2576, maxTiles: 4784, tileSize: 28 }
const SEAT = 'cu-developer-two'
const locks = scratchLocks()
after(() => locks.remove())

/** Launch the driver on a fake helper over stdio; returns the env and the fake's child (with its request log). */
async function launchOnFake(config = {}, options = {}) {
  let child = null
  const connect = async () => {
    const started = await stdioLink(config)
    child = started.child
    return started.link
  }
  try {
    const env = await launchApproved(connect, { apps: [FIXTURE], frame: CLAUDE, seat: SEAT, runLock: locks.next(), ...options })
    return { env, child }
  } catch (error) {
    if (child !== null) await stopFake(child)
    throw error
  }
}

const inputs = (child) => child.requests.filter((r) => r.type === 'input')

test('options are checked before the run lock is taken or any helper is started', async () => {
  let connected = 0
  let locked = 0
  const connect = async () => { connected += 1 }
  const runLock = async () => { locked += 1; return { release() {} } }
  const base = { apps: [FIXTURE], seat: SEAT, connect, runLock }
  // Candidates may be none (P11: the scope starts empty either way), but each must be a bundle id, 32 at most.
  const tooMany = Array.from({ length: 33 }, (_, i) => `com.example.app${i}`)
  for (const apps of [['not a bundle id'], [42], FIXTURE, null, tooMany]) {
    await assert.rejects(launchDesktopEnvironment({ ...base, apps }), code('invalid_argument'), JSON.stringify(apps))
  }
  const open = scratch()
  const shared = join(open.dir, 'shared')
  mkdirSync(shared, { mode: 0o755 })
  chmodSync(shared, 0o755)
  const bad = [
    { mode: 'hid' }, { seat: undefined }, { seat: 'hd-developer' }, { runId: 'a/b' }, { runId: '' }, { simulateScale: 1 },
    { simulateScale: 5 }, { simulateScale: '2' }, { runLock: 'yes' }, { captureDir: 'relative' }, { captureDir: open.dir, connect: undefined },
    { captureDir: shared }, { runLockDir: open.dir }, { runLock: undefined, runLockDir: 'relative' }, { exclusions: {} },
    { peerCheck: 'maybe' }, { helperExecutable: 'relative/CUHelper' }, { helperRequirement: '' }, { identifyPeer: 'lsof' }, { verifyPeer: true },
    { peerLog: 'stderr' },
    // The pre-grant boundary flags: a boolean, a lock path only with it, and both only where a launch carries them.
    { enforceBoundary: 'yes' }, { lockPath: '/tmp/cu-test.lock' }, { enforceBoundary: false, lockPath: '/tmp/cu-test.lock' },
    { enforceBoundary: true, connect: undefined, lockPath: 'relative.lock' }, { enforceBoundary: true },
    // CU-94: the held-keys marker path, absolute and only where a launch carries it.
    { heldMarkerPath: '/tmp/cu-g1/held-keys.json' }, { heldMarkerPath: 'held-keys.json', connect: undefined },
    // The image limits: the launch fits the frame to them, so they are checked with the rest.
    { frame: 'big' }, { frame: [] }, { frame: { maxEdge: 100 } }, { frame: { maxLongEdge: 0 } }, { frame: { maxTiles: 10 } },
  ]
  try {
    for (const extra of bad) await assert.rejects(launchDesktopEnvironment({ ...base, ...extra }), code('invalid_argument'), JSON.stringify(extra))
    // A malformed exclusions object is refused; candidates are not checked against a good one (none is sent at launch).
    assert.equal(typeof createExclusions().isExcludedApp, 'function')
  } finally {
    open.remove()
  }
  assert.deepEqual([connected, locked], [0, 0])
})

test('launch: the local-input pause only; the first addApp sends scope, then the frame\'s capture', async () => {
  const { env, child } = await launchOnFake()
  try {
    assert.equal(env.kind, 'desktop')
    assert.equal(env.site, SITE)
    assert.equal(SITE, 'desktop:macos-local')
    await logged(child, 3)
    assert.deepEqual(child.requests.map((r) => r.type), ['pauseOnLocalInput', 'scope', 'capture'])
    assert.equal(child.requests[0].on, true)
    assert.deepEqual(child.requests[1].bundleIds, [FIXTURE])
    assert.deepEqual(child.requests[2].maxSize, { width: 800, height: 600 })
    assert.equal(env.frame.width, 800)
    assert.equal(env.frame.height, 600)
    assert.equal(env.pauseArmed, true)
    const state = env.state()
    assert.equal(typeof state.then, 'undefined', 'state() is synchronous')
    assert.equal(state.frontmostBundleId, FIXTURE)
    assert.deepEqual(state.scope, [FIXTURE])
    assert.equal(state.url, `app:${FIXTURE}`)
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('Retina: a scale-2 display gives a frame at its pixel size, and a click lands on the matching point', async () => {
  const config = {
    displays: [{ id: 7, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 400, height: 300 }, scale: 2 }],
    apps: [{ bundleId: FIXTURE, pid: 501, rect: { x: 0, y: 0, width: 400, height: 300 } }],
  }
  const { env, child } = await launchOnFake(config)
  try {
    assert.deepEqual([env.frame.width, env.frame.height, env.frame.scaleX, env.frame.devicePixelRatio, env.frame.display], [800, 600, 2, 2, 7])
    await env.perform({ type: 'click', x: 401, y: 100, button: 'left' })
    await logged(child, 5) // the target check's hitTest, then the input (D-036)
    const sent = inputs(child)[0]
    assert.deepEqual(sent.events[0], { kind: 'move', x: 201, y: 50, flags: 0 })
    assert.equal(sent.mode, 'global')
    assert.equal(sent.bundleId, FIXTURE)
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('every input action is one helper input request; wait, screenshot, zoom and cursor_position post nothing', async () => {
  const { env, child } = await launchOnFake()
  try {
    const posting = [
      { type: 'click', x: 10, y: 10, button: 'right' },
      { type: 'double_click', x: 10, y: 10 },
      { type: 'triple_click', x: 10, y: 10 },
      { type: 'move', x: 20, y: 20 },
      { type: 'drag', path: [{ x: 1, y: 1 }, { x: 60, y: 1 }] },
      { type: 'scroll', x: 5, y: 5, scroll_x: 0, scroll_y: 120 },
      { type: 'keypress', keys: ['cmd', 'a'] },
      { type: 'type', text: 'hello\n' },
    ]
    for (const action of posting) {
      const effect = await env.perform(action)
      assert.deepEqual([effect.navigated, effect.blocked, effect.popup, effect.dialog], [false, [], null, null], action.type)
    }
    // The target check hit-tests each pointer action once before its input, a drag twice (start and end; D-036).
    const hitTests = 7
    await logged(child, 3 + hitTests + posting.length)
    assert.equal(inputs(child).length, posting.length)
    assert.equal(child.requests.filter((r) => r.type === 'hitTest').length, hitTests, 'keys and text are not hit-tested')
    const before = child.requests.length
    await env.perform({ type: 'wait', duration_ms: 1 })
    await env.perform({ type: 'screenshot' })
    assert.deepEqual((await env.perform({ type: 'zoom', region: [0, 0, 100, 100] })).zoom, { region: [0, 0, 100, 100] })
    // CU-64: cursor_position asks the helper where the pointer is (the fake's at 100,100 points), and posts no input.
    assert.deepEqual((await env.perform({ type: 'cursor_position' })).cursor, { x: 100, y: 100 }, 'the real pointer, from the helper')
    await pause(20)
    assert.deepEqual(child.requests.slice(before).map((r) => r.type), ['cursor'], 'only the cursor query reached the helper - no input')
    await assert.rejects(env.perform({ type: 'navigate', url: 'https://example.com/' }), code('unsupported_action'))
    await assert.rejects(env.navigate({ url: 'https://example.com/' }), code('unsupported_action'))
    await assert.rejects(env.perform({ type: 'click', x: 800, y: 0, button: 'left' }), code('invalid_argument'))
    await pause(20)
    assert.equal(inputs(child).length, posting.length, 'refusals sent nothing')
    assert.equal(child.requests.length, before + 1, 'planning refusals send not even a hit test (the one request is the cursor query above)')
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('D-031: META+C and CTRL+V reach the helper as ordinary key events with the Command and Control flags', async () => {
  const { env, child } = await launchOnFake()
  try {
    const command = 0x10_0000 // CGEventFlags maskCommand
    const control = 0x4_0000 // maskControl
    for (const keys of [['META', 'C'], ['CTRL', 'V']]) {
      const effect = await env.perform({ type: 'keypress', keys })
      assert.deepEqual([effect.navigated, effect.blocked, effect.popup, effect.dialog], [false, [], null, null], keys.join('+'))
    }
    await logged(child, 5)
    const [copy, paste] = inputs(child)
    assert.deepEqual(copy.events, [
      { kind: 'keyDown', keyCode: 0x37, flags: command }, // kVK_Command
      { kind: 'keyDown', keyCode: 0x08, flags: command }, // kVK_ANSI_C
      { kind: 'keyUp', keyCode: 0x08, flags: command },
      { kind: 'keyUp', keyCode: 0x37, flags: 0 },
    ])
    assert.deepEqual(paste.events, [
      { kind: 'keyDown', keyCode: 0x3b, flags: control }, // kVK_Control
      { kind: 'keyDown', keyCode: 0x09, flags: control }, // kVK_ANSI_V
      { kind: 'keyUp', keyCode: 0x09, flags: control },
      { kind: 'keyUp', keyCode: 0x3b, flags: 0 },
    ])
    for (const sent of [copy, paste]) {
      assert.deepEqual([sent.mode, sent.bundleId], ['global', FIXTURE])
    }
    assert.equal(child.requests.some((r) => /paste|clipboard/i.test(r.type)), false, 'no pasteboard request: the helper never reads it')
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('not_granted: without Screen Recording the launch fails naming the grant; without Accessibility input does', async () => {
  await assert.rejects(launchOnFake({ grants: { screen: false, accessibility: true } }), (e) => code('not_granted')(e) && e.details.grant === 'screen' && /Screen Recording/.test(e.message))
  const { env, child } = await launchOnFake({ grants: { screen: true, accessibility: false } })
  try {
    await assert.rejects(env.perform({ type: 'click', x: 1, y: 1, button: 'left' }), (e) => code('not_granted')(e) && e.details.grant === 'accessibility' && /Accessibility/.test(e.message))
    await assert.rejects(env.inspectPoint({ x: 1, y: 1 }), (e) => code('not_granted')(e) && e.details.grant === 'accessibility')
    await assert.rejects(env.focusedElement(), code('not_granted'))
    await assert.rejects(env.pageText(), code('not_granted'))
    await env.screenshot()
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('scope: an excluded app is refused at launch; input over another app or with no approved app in front is out_of_scope', async () => {
  await assert.rejects(launchOnFake({}, { apps: ['com.apple.Terminal'] }), (e) => code('blocked_by_policy')(e) && e.details.reason === 'excluded')
  const config = {
    apps: [
      { bundleId: 'com.other.app', pid: 600, rect: { x: 400, y: 0, width: 400, height: 600 } },
      { bundleId: FIXTURE, pid: 501, rect: { x: 0, y: 0, width: 400, height: 600 } },
    ],
    frontmost: 'com.other.app',
    activationWorks: false,
  }
  const { env, child } = await launchOnFake(config)
  try {
    await assert.rejects(env.perform({ type: 'keypress', keys: ['ENTER'] }), (e) => code('out_of_scope')(e))
  } finally {
    await env.close()
    await stopFake(child)
  }
  const second = await launchOnFake({ ...config, frontmost: FIXTURE })
  try {
    await assert.rejects(second.env.perform({ type: 'click', x: 500, y: 10, button: 'left' }), code('out_of_scope'))
    await second.env.perform({ type: 'click', x: 100, y: 10, button: 'left' })
  } finally {
    await second.env.close()
    await stopFake(second.child)
  }
})

test('global input never runs without the local-input pause: a pause that cannot arm fails the launch', async () => {
  await assert.rejects(launchOnFake({ pauseArms: false }), (e) => code('blocked_by_policy')(e) && e.details.reason === 'pause_not_armed')
})

test('targets: AX elements map onto the policy target shape, in frame pixels; secure fields are passwords', async () => {
  const config = {
    displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 400, height: 300 }, scale: 2 }],
    apps: [
      { bundleId: FIXTURE, pid: 501, rect: { x: 0, y: 0, width: 300, height: 300 } },
      { bundleId: 'com.other.app', pid: 600, rect: { x: 300, y: 0, width: 100, height: 300 } },
    ],
    elements: [{ rect: { x: 10, y: 10, width: 100, height: 20 }, element: { bundleId: FIXTURE, pid: 501, role: 'AXButton', subrole: null, title: 'Save', frame: { x: 10, y: 10, width: 100, height: 20 }, secure: false } }],
    focused: { bundleId: FIXTURE, pid: 501, role: 'AXTextField', subrole: 'AXSecureTextField', title: 'Password', frame: { x: 10, y: 40, width: 100, height: 20 }, secure: true },
    screenText: 'Save\nPassword',
  }
  const { env, child } = await launchOnFake(config)
  try {
    const button = await env.inspectPoint({ x: 40, y: 40 })
    await logged(child, 4)
    assert.equal(child.requests.at(-1).xPt, 20)
    assert.deepEqual({ role: button.role, name: button.name, origin: button.origin, isPassword: button.isPassword }, { role: 'AXButton', name: 'Save', origin: FIXTURE, isPassword: false })
    assert.deepEqual(button.box, { x: 20, y: 20, width: 200, height: 40 })
    assert.match(button.fingerprint, /^[0-9a-f]{32}$/)
    assert.equal((await env.inspectPoint({ x: 40, y: 40 })).fingerprint, button.fingerprint, 'stable for the same element')
    assert.equal(await env.inspectPoint({ x: 400, y: 400 }), null, 'empty space')
    const other = await env.inspectPoint({ x: 700, y: 10 })
    assert.deepEqual([other.origin, other.name, other.role], ['com.other.app', null, null], 'outside the scope: bundle id only')
    const focused = await env.focusedElement()
    assert.deepEqual([focused.isPassword, focused.secure, focused.subrole], [true, true, 'AXSecureTextField'])
    assert.deepEqual(await env.pageText({ maxChars: 4 }), { text: 'Save', hiddenText: '', truncated: true })
    await assert.rejects(env.pageText({ maxChars: 0 }), code('invalid_argument'))
    await assert.rejects(env.inspectPoint({ x: 800, y: 0 }), code('invalid_argument'))
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('screenshots: same frame each time, a zoom at full resolution, display_changed instead of a remap', async () => {
  const { env, child } = await launchOnFake({ quirks: { displayChangeAfter: 3 } })
  try {
    const shot = await env.screenshot()
    assert.deepEqual([shot.width, shot.height, shot.mimeType, shot.url], [800, 600, 'image/png', `app:${FIXTURE}`])
    const zoom = await env.screenshot({ region: [100, 100, 300, 200] })
    assert.deepEqual([zoom.width, zoom.height], [200, 100])
    await logged(child, 5)
    assert.deepEqual(child.requests.at(-1).region, { x: 100, y: 100, width: 200, height: 100 })
    await assert.rejects(env.screenshot(), code('display_changed'))
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('local input: the action stops, listeners hear time and kind only, and the agent stays stopped until a person resumes', async () => {
  const control = createRunControl({ runId: 't' })
  const { env, child } = await launchOnFake({ quirks: { localInputAfter: 1 } }, { control })
  const heard = []
  env.on('localInput', (event) => heard.push(event))
  try {
    await assert.rejects(env.perform({ type: 'click', x: 5, y: 5, button: 'left' }), (e) => code('taken_over')(e) && e.details.reason === 'local_input' && e.details.failedAt === 1)
    await pause(20)
    assert.equal(heard.length, 1)
    assert.deepEqual(Object.keys(heard[0]).sort(), ['at', 'kind'])
    assert.equal(heard[0].kind, 'key')
    await logged(child, 5)
    const sent = inputs(child).length
    await assert.rejects(env.perform({ type: 'move', x: 5, y: 5 }), (e) => code('taken_over')(e))
    assert.equal(inputs(child).length, sent, 'nothing posted while stopped')
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
    assert.equal(env.state().localInput, null)
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('run control: taken over and stopped runs send no input', async () => {
  const control = createRunControl({ runId: 't' })
  const { env, child } = await launchOnFake({}, { control })
  try {
    assert.equal(env.signal, control.signal)
    control.send({ command: 'take_over' }, { source: 'control' })
    await assert.rejects(env.perform({ type: 'click', x: 1, y: 1, button: 'left' }), code('taken_over'))
    control.send({ command: 'hand_back' }, { source: 'control' })
    await env.perform({ type: 'click', x: 1, y: 1, button: 'left' })
    control.send({ command: 'stop', reason: 'test' }, { source: 'control' })
    await assert.rejects(env.perform({ type: 'click', x: 1, y: 1, button: 'left' }), code('cancelled'))
    await assert.rejects(env.perform({ type: 'wait', duration_ms: 1 }), code('cancelled'))
    await logged(child, 5)
    await pause(20)
    assert.equal(inputs(child).length, 1)
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('helper_lost: the helper dying ends every member with helper_lost and a crash event; close stays idempotent', async () => {
  const { env, child } = await launchOnFake({ quirks: { exitOn: 'input' } })
  const crashes = []
  env.on('crash', (event) => crashes.push(event))
  await assert.rejects(env.perform({ type: 'click', x: 1, y: 1, button: 'left' }), code('helper_lost'))
  await pause(20)
  assert.deepEqual(crashes.map((c) => c.code), ['helper_lost'])
  await assert.rejects(env.screenshot(), code('helper_lost'))
  await assert.rejects(env.inspectPoint({ x: 1, y: 1 }), code('helper_lost'))
  assert.equal(typeof env.state().url, 'string', 'state() still answers from cache')
  await env.close()
  await env.close()
  assert.equal(env.closed, true)
  await assert.rejects(env.screenshot(), code('closed'))
  await stopFake(child)
})

test('close: one bye, the helper exits, members refuse afterwards', async () => {
  const { env, child } = await launchOnFake()
  const crashes = []
  env.on('crash', (event) => crashes.push(event))
  await Promise.all([env.close(), env.close()])
  assert.equal(await child.exited, 0)
  await logged(child, 4)
  assert.equal(child.requests.filter((r) => r.type === 'bye').length, 1)
  assert.deepEqual(crashes, [], 'a requested close is not a crash')
  await assert.rejects(env.perform({ type: 'wait', duration_ms: 1 }), code('closed'))
  assert.throws(() => env.state(), code('closed'))
})

test('screencast: watch frames reach the viewer until it stops; remote input is refused', async () => {
  const { env, child } = await launchOnFake()
  try {
    const frames = []
    const stop = await env.startScreencast({ onFrame: (frame) => frames.push(frame), fps: 2 })
    for (const deadline = Date.now() + 2_000; frames.length === 0 && Date.now() < deadline;) await pause(20) // bounded poll, not a fixed wait (load)
    await stop()
    assert.equal(frames.length > 0, true)
    assert.equal(frames[0].mimeType, 'image/png')
    assert.deepEqual(frames[0].metadata, { deviceWidth: 800, deviceHeight: 600 })
    await logged(child, 5)
    assert.deepEqual(child.requests.filter((r) => r.type === 'watch' || r.type === 'unwatch').map((r) => r.type), ['watch', 'unwatch'])
    await assert.rejects(env.humanInput({ type: 'click' }), code('unsupported_action'))
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test("parity with agent-core's fake environment: same members (its test hooks aside), synchronous state()", async () => {
  const { env, child } = await launchOnFake()
  const fake = createFakeEnvironment()
  try {
    for (const [name, value] of Object.entries(fake)) {
      if (['emit', 'log', 'inputs', 'screenshotCount'].includes(name)) continue // the fake's own test hooks
      assert.equal(typeof env[name], typeof value, name)
    }
    const state = env.state()
    assert.equal(typeof state.then, 'undefined')
    for (const key of ['url', 'title', 'loading', 'tabs', 'dialog']) assert.equal(Object.hasOwn(state, key), true, key)
    assert.equal(typeof env.on('localInput', () => {}), 'function', 'on() returns an unsubscribe, as the fake does')
  } finally {
    await env.close()
    await fake.close()
    await stopFake(child)
  }
})

test('the socket path end to end: open is called through the spawn seam only, the fake helper connects, close cleans up', async () => {
  const tmp = scratch()
  const runDir = `${tmp.dir}/run`
  const calls = []
  let helper = null
  // Stands in for /usr/bin/open: records the call, then starts the fake helper with exactly the arguments open would
  // hand the bundle - so the fake's parser, the real helper's rules, judges them - and exits 0.
  const spawn = (command, args) => {
    calls.push({ command, args })
    helper = spawnFake({}, { args: args.slice(args.indexOf('--args') + 1) })
    const child = new EventEmitter()
    child.stderr = new PassThrough()
    setImmediate(() => child.emit('exit', 0, null))
    return child
  }
  try {
    // The real peer check runs (lsof names the fake's pid and executable); only the signature is a seam, and the
    // expected executable is node's, since the fake helper is a node process.
    const verified = []
    const peer = { helperExecutable: process.execPath, verifyPeer: async (args) => { verified.push(args); return true } }
    const env = await launchDesktopEnvironment({ apps: [FIXTURE], frame: CLAUDE, seat: SEAT, runLock: locks.next(), cuHome: tmp.dir, runDir, spawn, connectTimeoutMs: 8000, ...peer })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].command, '/usr/bin/open')
    const dir = join(runDir, readdirSync(runDir)[0])
    assert.deepEqual(calls[0].args, [
      '-g', '-n', '-a', `${tmp.dir}/helper/CUHelper.app`, '--args', '--socket', join(dir, 'helper.sock'), '--token-file', join(dir, 'token'),
      '--driver-node', realpathSync(process.execPath), '--driver-entry', realpathSync(process.argv[1]),
    ], 'this process named to the helper by real path, no boundary flags unless asked')
    assert.equal(readdirSync(runDir).length, 1, 'one private run directory')
    assert.deepEqual([env.server.peer.pid, env.server.peer.verified, verified.map((v) => v.pid)], [helper.pid, true, [helper.pid]])
    assert.equal(verified[0].requirement, 'identifier "com.reflection.cu-helper"')
    assert.deepEqual(helper.log, [`peer ok pid=${process.pid}`, 'token read'], 'the fake accepted the arguments')
    // P11: nothing is captured before the first approved app joins; the frame is known from the hello, and that join
    // confirms it with the first capture.
    assert.deepEqual([env.frame.width, env.frame.height], [800, 600])
    await logged(helper, 1)
    assert.deepEqual(helper.requests.map((r) => r.type), ['pauseOnLocalInput'])
    await env.addApp(FIXTURE)
    // On the socket path the fake returns captures as files in that directory; each is read, checked and deleted.
    const shot = await env.screenshot()
    assert.deepEqual([shot.width, shot.height], [800, 600])
    await logged(helper, 4)
    assert.equal(helper.requests.filter((r) => r.type === 'capture').length, 2)
    // The socket file went when the server stopped listening after the one helper, the token once its hello was valid.
    assert.deepEqual(readdirSync(join(runDir, readdirSync(runDir)[0])), [], 'no token and no capture file is left behind')
    await env.perform({ type: 'click', x: 1, y: 1, button: 'left' })
    await env.close()
    assert.equal(await helper.exited, 0)
    assert.deepEqual(readdirSync(runDir), [], 'the run directory is removed')
  } finally {
    if (helper !== null) await stopFake(helper)
    tmp.remove()
  }
  assert.equal(existsSync(tmp.dir), false)
})

test('the socket path checks its peer against the launched bundle\'s executable by default: a node process is dropped, the run times out', async () => {
  const tmp = scratch()
  const runDir = `${tmp.dir}/run`
  let helper = null
  const launched = []
  const logLines = []
  try {
    // Stands in for LaunchServices but starts the fake (a node process) instead of the bundle's executable.
    const launch = async (args) => {
      launched.push(args)
      helper = spawnFake({}, { socketPath: args.socketPath, tokenPath: args.tokenPath })
    }
    await assert.rejects(launchDesktopEnvironment({ apps: [FIXTURE], seat: SEAT, runLock: locks.next(), cuHome: tmp.dir, runDir, launch, connectTimeoutMs: 1500, peerLog: (line) => logLines.push(line) }), code('timeout'))
    assert.equal(launched[0].bundlePath, `${tmp.dir}/helper/CUHelper.app`)
    await helper.exited
    assert.deepEqual(helper.requests, [], 'the impostor never received a request')
    assert.deepEqual(logLines, [`macos-desktop: refused a helper connection: its peer is not the helper executable (peer pid ${helper.pid})`])
    assert.deepEqual(readdirSync(runDir), [], 'the run directory is removed')
  } finally {
    if (helper !== null) await stopFake(helper)
    tmp.remove()
  }
})

test('a helper that never connects is a timeout, and the run directory is still removed', async () => {
  const tmp = scratch()
  const runDir = `${tmp.dir}/run`
  try {
    const spawn = () => {
      const child = new EventEmitter()
      child.stderr = new PassThrough()
      setImmediate(() => child.emit('exit', 0, null))
      return child
    }
    await assert.rejects(launchDesktopEnvironment({ apps: [FIXTURE], seat: SEAT, runLock: locks.next(), cuHome: tmp.dir, runDir, spawn, connectTimeoutMs: 50 }), code('timeout'))
    assert.deepEqual(readdirSync(runDir), [])
  } finally {
    tmp.remove()
  }
})

test('local input while the run waits for consent sets no stop that outlives the wait; the next input while running pauses', async () => {
  const control = createRunControl({ runId: 't' })
  const { env, child } = await launchOnFake({}, { control, settleMs: 100 })
  try {
    const waiting = control.requestConsent({ id: 'c1', class: 'new_app', app: 'com.example.other', reason: 'test' }, { timeoutMs: 5_000 })
    assert.equal(control.state, 'awaiting_consent')
    // The person answers in the live view on this Mac: that click is local input while the agent is idle.
    await env.simulateLocalInput({ via: 'idle', kind: 'pointer' })
    assert.equal(env.state().localInput, null, 'no stop is set while the agent may not act')
    assert.equal(control.state, 'awaiting_consent', 'local input never answers or ends the wait')
    control.decline('c1', 'test')
    await waiting
    assert.equal(control.state, 'running')
    await env.perform({ type: 'click', x: 5, y: 5, button: 'left' })
    // The answer's click was local input, so the first input after the wait settled first (design 0.4.1).
    await logged(child, 6)
    assert.equal(inputs(child).at(-1).settleMs, 100)
    // Running again, the next local input pauses as before.
    await env.simulateLocalInput({ via: 'idle', kind: 'key' })
    assert.notEqual(env.state().localInput, null)
    assert.equal(control.state, 'paused')
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('heldMarkerPath reaches the helper launch on the socket path (CU-94)', async () => {
  const home = scratch()
  const seen = []
  try {
    await assert.rejects(launchDesktopEnvironment({
      apps: [FIXTURE], seat: SEAT, runLock: async () => ({ release() {} }), cuHome: home.dir, peerCheck: 'off', connectTimeoutMs: 500,
      heldMarkerPath: join(home.dir, 'helper', 'held-keys.json'),
      launch: async (args) => { seen.push(args); throw new EnvironmentError('helper_lost', 'stub launch: nothing started') },
    }), code('helper_lost'))
    assert.equal(seen.length, 1)
    assert.equal(seen[0].heldMarkerPath, join(home.dir, 'helper', 'held-keys.json'))
  } finally {
    home.remove()
  }
})
