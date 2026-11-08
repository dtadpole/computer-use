import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { chmodSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { after, test } from 'node:test'

import { launchDesktopEnvironment } from '../../_environments_/macos-desktop/environment.mjs'
import { EnvironmentError } from '../../_environments_/macos-desktop/errors.mjs'
import { connectStdio } from '../../_environments_/macos-desktop/helper-link.mjs'
import { anyPeerIsHelper, FAKE_HELPER, pause, scratch, scratchLocks, spawnFake, stopFake } from './harness.mjs'

/**
 * The helper's command line as the driver builds it and the fake helper judges it, with the Swift helper's rules
 * (Arguments.swift, PeerCheck.swift): the driver names itself with `--driver-node` and `--driver-entry`, and asks for
 * `--enforce-boundary` and `--lock-path` only when told; the fake refuses an unknown flag or a bad value as the real
 * helper does (exit 64, before any connection), applies an enforced boundary on the socket - lock, then the peer
 * needing both driver arguments - and never takes the real helper's shared lock. Nothing here runs `open` or the app.
 */

const code = (expected) => (error) => error instanceof EnvironmentError && error.code === expected
const FIXTURE = 'com.example.fixture'
const SEAT = 'cu-developer-two'
const UNGRANTED = { screen: false, accessibility: false, postEvents: false, listenEvents: false }
const root = scratch()
const locks = scratchLocks()
after(() => {
  root.remove()
  locks.remove()
})
let dirs = 0

/** A fresh mode-700 directory, short enough for a socket path. */
function privateDir() {
  dirs += 1
  const dir = join(root.dir, `d${dirs}`)
  mkdirSync(dir, { mode: 0o700 })
  chmodSync(dir, 0o700)
  return dir
}

/** The fake with `args`, its stdout collected so a test can prove a refused fake said nothing. */
function fakeWith(args, config = {}) {
  const child = spawnFake(config, { args })
  child.out = ''
  child.stdout.on('data', (chunk) => { child.out += chunk.toString() })
  return child
}

test('the fake refuses what the real helper refuses: an unknown flag, a bad value or a broken combination exits 64 before any hello', async () => {
  const cases = [
    [['--nope'], "unknown argument '--nope'"],
    [['--driver-node', 'relative/node'], '--driver-node needs an absolute path'],
    [['--driver-entry'], '--driver-entry needs a value'],
    [['--max-run-seconds', '0'], '--max-run-seconds must be a number from 1 to 14400'],
    [['--idle-seconds', 'soon'], '--idle-seconds must be a number from 10 to 3600'],
    [['--lock-path', '/tmp/cu-fake.lock'], '--lock-path belongs to --enforce-boundary'],
    [['--world', '/tmp/world.json'], '--world and --events-out belong to --dry-run'],
    [['--socket', '/tmp/cu-fake.sock'], '--token-file <path> is required'],
    [['--stdio'], '--stdio needs --dry-run or --simulate-ungranted'],
    [['--exclude', 'not a bundle id'], '--exclude needs a bundle id or a prefix ending in .*'],
  ]
  for (const [args, why] of cases) {
    const child = fakeWith(args)
    assert.equal(await child.exited, 64, args.join(' '))
    assert.deepEqual(child.log, [`args refused: ${why}`], args.join(' '))
    assert.equal(child.out, '', 'no hello, nothing on the wire')
  }
})

test('the real helper\'s serving flags are accepted with valid values: --exclude and --simulate-ungranted act, the rest are checked', async () => {
  const dir = privateDir()
  const tokenFile = join(dir, 'token')
  writeFileSync(tokenFile, 'file-token\n', { mode: 0o600 })
  const child = fakeWith([
    '-psn_0_4242', '--stdio', '--simulate-ungranted', '--token-file', tokenFile, '--driver-node', process.execPath, '--driver-entry', FAKE_HELPER,
    '--max-run-seconds', '60', '--idle-seconds', '30', '--idle-tolerance-ms', '5', '--idle-synthetic-resets', '--inter-event-ms', '0',
    '--exclude', 'com.example.blocked.*',
  ])
  const link = await connectStdio(child, { token: 'file-token', helloTimeoutMs: 5000 })
  try {
    assert.deepEqual(link.hello.grants, UNGRANTED, '--simulate-ungranted: every grant off')
    await assert.rejects(link.request('scope', { bundleIds: ['com.example.blocked.child'] }), (e) => code('blocked_by_policy')(e) && e.details.bundleId === 'com.example.blocked.child')
    assert.deepEqual((await link.request('scope', { bundleIds: [FIXTURE] })).bundleIds, [FIXTURE])
    assert.deepEqual(child.log, [`peer ok pid=${process.pid}`, 'token read'], 'no boundary over stdio, as in the real helper')
  } finally {
    link.close()
    await stopFake(child)
  }
})

/** Stands in for /usr/bin/open: starts the fake with exactly the arguments open would hand the bundle, then exits 0. */
function openStandIn(config = {}) {
  const started = { calls: [], helper: null }
  started.spawn = (command, args) => {
    started.calls.push({ command, args })
    started.helper = spawnFake(config, { args: args.slice(args.indexOf('--args') + 1) })
    const child = new EventEmitter()
    child.stderr = new PassThrough()
    setImmediate(() => child.emit('exit', 0, null))
    return child
  }
  return started
}

test('enforceBoundary end to end: open gets --enforce-boundary after the driver arguments, the fake enforces it and accepts this driver', async () => {
  const home = privateDir()
  const open = openStandIn()
  try {
    const env = await launchDesktopEnvironment({ apps: [FIXTURE], seat: SEAT, runLock: locks.next(), cuHome: home, runDir: join(home, 'run'), spawn: open.spawn, connectTimeoutMs: 8000, enforceBoundary: true, ...anyPeerIsHelper() })
    try {
      const { args } = open.calls[0]
      assert.deepEqual(args.slice(args.indexOf('--driver-node')).filter((a) => a.startsWith('--')), ['--driver-node', '--driver-entry', '--enforce-boundary'])
      assert.deepEqual(open.helper.log, ['boundary enforced lock=none', `peer ok pid=${process.pid}`, 'token read'], 'no lock taken: the fake never touches the shared one')
      await env.addApp(FIXTURE)
      await env.perform({ type: 'click', x: 1, y: 1, button: 'left' })
    } finally {
      await env.close()
    }
    assert.equal(await open.helper.exited, 0)
  } finally {
    if (open.helper !== null) await stopFake(open.helper)
  }
})

test('enforceBoundary with lockPath, no grant held: the fake takes the private lock, checks the peer, says hello; the lock goes with it', async () => {
  const home = privateDir()
  const lockPath = join(privateDir(), 'helper.lock')
  const open = openStandIn({ grants: UNGRANTED })
  try {
    // With no grant the run cannot see anything, so the launch fails not_granted - after the hello, which is the
    // proof the enforced peer check let this driver through.
    await assert.rejects(launchDesktopEnvironment({ apps: [FIXTURE], seat: SEAT, runLock: locks.next(), cuHome: home, runDir: join(home, 'run'), spawn: open.spawn, connectTimeoutMs: 8000, enforceBoundary: true, lockPath, ...anyPeerIsHelper() }),
      (e) => code('not_granted')(e) && e.details.grant === 'screen')
    const { args } = open.calls[0]
    assert.deepEqual(args.slice(-3), ['--enforce-boundary', '--lock-path', lockPath])
    assert.equal(await open.helper.exited, 0, 'bye')
    assert.deepEqual(open.helper.log, ['boundary enforced lock=private', `peer ok pid=${process.pid}`, 'token read'])
    assert.equal(existsSync(lockPath), false, 'the private lock is removed at exit')
  } finally {
    if (open.helper !== null) await stopFake(open.helper)
  }
})

test('an enforced boundary refuses a launch that does not name the driver: peer refused, and the driver sees no_hello with what it could check', async () => {
  const home = privateDir()
  let helper = null
  // A launcher that drops the driver arguments, as an old or foreign launcher would.
  const launch = async ({ socketPath, tokenPath, driverNode, driverEntry, enforceBoundary }) => {
    assert.deepEqual([typeof driverNode, typeof driverEntry, enforceBoundary], ['string', 'string', true], 'the seam is given them')
    helper = spawnFake({}, { socketPath, tokenPath, args: ['--enforce-boundary'] })
  }
  try {
    await assert.rejects(launchDesktopEnvironment({ apps: [FIXTURE], seat: SEAT, runLock: locks.next(), cuHome: home, runDir: join(home, 'run'), launch, connectTimeoutMs: 8000, enforceBoundary: true, ...anyPeerIsHelper() }),
      (e) => code('helper_lost')(e) && e.details.reason === 'no_hello' && Array.isArray(e.details.driver.environment) && Number.isInteger(e.details.driver.nodeOptions))
    assert.equal(await helper.exited, 3)
    assert.deepEqual(helper.log, ['boundary enforced lock=none', `peer refused pid=${process.pid}`], 'refused by pid only; the token never read')
    assert.deepEqual(readdirSync(join(home, 'run')), [])
  } finally {
    if (helper !== null) await stopFake(helper)
  }
  // So is a driver argument that names nothing: the real helper compares real paths, and there is none.
  const dir = privateDir()
  const socketPath = join(dir, 's.sock')
  const tokenPath = join(dir, 'token')
  writeFileSync(tokenPath, 'abc\n', { mode: 0o600 })
  const received = []
  const server = net.createServer((socket) => {
    socket.on('data', (chunk) => received.push(chunk))
    socket.on('error', () => {})
  })
  await new Promise((resolve) => server.listen(socketPath, resolve))
  try {
    const missing = spawnFake({}, { socketPath, tokenPath, args: ['--enforce-boundary', '--driver-node', process.execPath, '--driver-entry', '/nonexistent/cli.mjs'] })
    assert.equal(await missing.exited, 3)
    assert.deepEqual(missing.log, ['boundary enforced lock=none', `peer refused pid=${process.pid}`])
    await pause(20)
    assert.deepEqual(received, [], 'closed without a byte')
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('one helper per private lock: a second fake on the same --lock-path exits 4 while the first serves; a granted fake may not use one', async () => {
  const dir = privateDir()
  const socketPath = join(dir, 's.sock')
  const tokenPath = join(dir, 'token')
  writeFileSync(tokenPath, 'abc\n', { mode: 0o600 })
  const lockPath = join(dir, 'helper.lock')
  const sockets = new Set()
  const server = net.createServer((socket) => {
    sockets.add(socket)
    socket.on('error', () => {})
  })
  await new Promise((resolve) => server.listen(socketPath, resolve))
  const boundaryArgs = ['--enforce-boundary', '--lock-path', lockPath, '--driver-node', process.execPath, '--driver-entry', FAKE_HELPER]
  try {
    const first = spawnFake({ grants: UNGRANTED, connectWindowMs: 5000 }, { socketPath, tokenPath, args: boundaryArgs })
    while (!first.log.includes('token read')) await pause(5)
    assert.equal(existsSync(lockPath), true, 'held while the first serves')
    const second = spawnFake({ grants: UNGRANTED }, { socketPath, tokenPath, args: boundaryArgs })
    assert.equal(await second.exited, 4)
    assert.deepEqual(second.log, ['boundary enforced lock=private', 'another helper is running; one helper serves one run at a time'])
    for (const socket of sockets) socket.destroy()
    assert.equal(await first.exited, 0)
    assert.equal(existsSync(lockPath), false, 'released when the first ends')
    // The real helper refuses a private lock once it holds a grant: a granted helper always takes the shared lock.
    const granted = spawnFake({}, { socketPath, tokenPath, args: boundaryArgs })
    assert.equal(await granted.exited, 64)
    assert.deepEqual(granted.log, ['args refused: --lock-path is only for runs without a grant; a granted helper always takes the shared lock'])
  } finally {
    for (const socket of sockets) socket.destroy()
    await new Promise((resolve) => server.close(resolve))
  }
})
