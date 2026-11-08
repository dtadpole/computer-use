import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { after, test } from 'node:test'

import { launchDesktopEnvironment } from '../../_environments_/macos-desktop/environment.mjs'
import { EnvironmentError } from '../../_environments_/macos-desktop/errors.mjs'
import { awaitHello, connectStdio, createHelperServer, HelperLink } from '../../_environments_/macos-desktop/helper-link.mjs'
import { acquireDesktopRun, ENTRY_NAME } from '../../_environments_/macos-desktop/run-lock.mjs'
import { anyPeerIsHelper, pause, scratch, spawnFake, stdioLink, stopFake } from './harness.mjs'

/**
 * The helper peer boundary (helper-boundary.md, D-029) as the fake helper models it and the driver meets it: the
 * helper connects, checks its peer, and only then reads the token file and says hello; a refusal closes the socket
 * without a byte, and the driver fails the launch at once with `helper_lost` `no_hello`, releasing the desktop-run lock
 * and leaving no run directory. And the helper serves one run: it exits when no driver accepts in time, on `bye` and
 * on socket loss. No real helper is involved. The driver's own peer check (B5) stays on, with a seam that takes every
 * peer for the helper, so these tests judge the helper's side alone.
 */

const code = (expected) => (error) => error instanceof EnvironmentError && error.code === expected
const FIXTURE = 'com.example.fixture'
const SEAT = 'cu-developer-two'
const root = scratch()
after(() => root.remove())
let dirs = 0
const fresh = () => join(root.dir, `t${(dirs += 1)}`)

/** A desktop-run lock in its own directory that records acquire and release, and says whether it is still held. */
function recordingLock() {
  const dir = fresh()
  const log = []
  const runLock = async (args) => {
    const slot = await acquireDesktopRun({ ...args, dir })
    log.push('acquire')
    return { release: () => { log.push('release'); slot.release() } }
  }
  return { log, runLock, held: () => existsSync(join(dir, ENTRY_NAME)) }
}

/**
 * The socket path with the fake started by the `launch` seam (never `open`). `onLaunch` sees the token before the fake
 * runs, so a test can check that nothing leaks it.
 */
async function launchOverSocket(config, { onLaunch = () => {}, ...options } = {}) {
  const home = fresh()
  const runDir = join(home, 'run')
  const lock = recordingLock()
  const started = { helper: null }
  const launch = async ({ socketPath, tokenPath }) => {
    onLaunch({ socketPath, tokenPath, token: readFileSync(tokenPath, 'utf8').trim() })
    started.helper = spawnFake(config, { socketPath, tokenPath })
  }
  const begun = Date.now()
  const result = launchDesktopEnvironment({ apps: [FIXTURE], seat: SEAT, runLock: lock.runLock, cuHome: home, runDir, launch, connectTimeoutMs: 8000, ...anyPeerIsHelper(), ...options })
  return { result, lock, runDir, started, begun }
}

test('the fake keeps the real helper\'s order: connect, peer check, then the token, then hello', async () => {
  const { result, runDir, started, lock } = await launchOverSocket({})
  const env = await result
  try {
    assert.deepEqual(started.helper.log, [`peer ok pid=${process.pid}`, 'token read'], 'the peer is checked before the token file is read')
    assert.deepEqual(lock.log, ['acquire'])
  } finally {
    await env.close()
  }
  assert.equal(await started.helper.exited, 0, 'the helper exits after bye')
  assert.deepEqual(readdirSync(runDir), [])
  assert.deepEqual(lock.log, ['acquire', 'release'])
})

test('peer refused on the socket path: helper_lost no_hello at once, the token never read, the lock released, no run directory left', async () => {
  let seen = null
  const { result, lock, runDir, started, begun } = await launchOverSocket({ quirks: { peerRefused: true } }, { onLaunch: (args) => { seen = args } })
  let error = null
  try {
    await result
  } catch (caught) {
    error = caught
  }
  assert.equal(code('helper_lost')(error), true, String(error))
  assert.equal(error.details.reason, 'no_hello')
  assert.ok(Date.now() - begun < 5000, 'failed at once, not at the 8 s connect deadline')
  const told = `${error.message} ${JSON.stringify(error.details)}`
  for (const secret of [seen.token, seen.socketPath, seen.tokenPath, runDir]) assert.equal(told.includes(secret), false, 'neither the token nor a path is named')
  const helper = started.helper
  assert.equal(await helper.exited, 3)
  assert.deepEqual(helper.log, [`peer refused pid=${process.pid}`], 'refused by pid only; the token file was never read')
  assert.deepEqual(helper.requests, [], 'nothing was asked of a refused helper')
  assert.deepEqual(lock.log, ['acquire', 'release'])
  assert.equal(lock.held(), false, 'the desktop-run lock is released')
  assert.deepEqual(readdirSync(runDir), [], 'the socket directory is removed')
})

test('a helper that connects and dies before hello is no_hello too; an impostor\'s wrong hello still waits for the real helper', async () => {
  // Stands in for a helper that exits before its hello: the connection opens, then ends without a byte.
  const home = fresh()
  const lock = recordingLock()
  const launch = async ({ socketPath }) => {
    const socket = net.connect(socketPath, () => socket.end())
    socket.on('error', () => {})
  }
  await assert.rejects(
    launchDesktopEnvironment({ apps: [FIXTURE], seat: SEAT, runLock: lock.runLock, cuHome: home, runDir: join(home, 'run'), launch, connectTimeoutMs: 8000, ...anyPeerIsHelper() }),
    (e) => code('helper_lost')(e) && e.details.reason === 'no_hello',
  )
  assert.deepEqual([lock.log, lock.held(), readdirSync(join(home, 'run'))], [['acquire', 'release'], false, []])
  // A wrong token is not our helper refusing us, so the server keeps waiting for the one that is.
  const server = await createHelperServer({ parentDir: join(fresh(), 'run'), helloTimeoutMs: 3000, ...anyPeerIsHelper() })
  const children = []
  try {
    const accepting = server.accept({ timeoutMs: 8000 })
    const impostor = spawnFake({ quirks: { badToken: true } }, { socketPath: server.socketPath, tokenPath: server.tokenPath })
    children.push(impostor)
    await impostor.exited
    assert.equal(server.refused, 1)
    const helper = spawnFake({}, { socketPath: server.socketPath, tokenPath: server.tokenPath })
    children.push(helper)
    const link = await accepting
    assert.deepEqual((await link.request('scope', { bundleIds: [FIXTURE] })).bundleIds, [FIXTURE])
  } finally {
    await server.close()
    for (const child of children) await stopFake(child)
  }
})

test('peer refused over stdio: the fake exits 3 before any hello, and the launch fails no_hello with the lock released', async () => {
  const lock = recordingLock()
  let child = null
  const connect = async () => {
    child = spawnFake({ quirks: { peerRefused: true } })
    return connectStdio(child, { token: 'test-token', helloTimeoutMs: 5000 })
  }
  await assert.rejects(launchDesktopEnvironment({ apps: [FIXTURE], seat: SEAT, runLock: lock.runLock, connect }), (e) => code('helper_lost')(e) && e.details.reason === 'no_hello')
  assert.equal(await child.exited, 3)
  assert.deepEqual(child.log, [`peer refused pid=${process.pid}`])
  assert.deepEqual([lock.log, lock.held()], [['acquire', 'release'], false])
})

test('one run: the fake exits 4 when no driver accepts its hello within the window, and 0 on socket loss', async () => {
  // A listener that takes the connection but never sends a request: no driver ever accepts.
  const dir = fresh()
  mkdirSync(dir, { mode: 0o700 })
  chmodSync(dir, 0o700)
  const socketPath = join(dir, 's.sock')
  const tokenPath = join(dir, 'token')
  writeFileSync(tokenPath, 'abc\n', { mode: 0o600 })
  const hellos = []
  const sockets = new Set()
  const silent = net.createServer((socket) => {
    sockets.add(socket)
    socket.on('data', (chunk) => hellos.push(JSON.parse(chunk.toString().trim()).type))
    socket.on('error', () => {})
  })
  await new Promise((resolve) => silent.listen(socketPath, resolve))
  try {
    const waiting = spawnFake({ connectWindowMs: 150 }, { socketPath, tokenPath })
    assert.equal(await waiting.exited, 4)
    assert.deepEqual(waiting.log, [`peer ok pid=${process.pid}`, 'token read', 'no driver accepted within 150 ms'])
    assert.deepEqual(hellos, ['hello'])
    // The window is no reason to stay once the socket is gone.
    const dropped = spawnFake({ connectWindowMs: 5000 }, { socketPath, tokenPath })
    while (hellos.length < 2) await pause(5)
    for (const socket of sockets) socket.destroy()
    assert.equal(await dropped.exited, 0)
  } finally {
    for (const socket of sockets) socket.destroy()
    await new Promise((resolve) => silent.close(resolve))
  }
  // Over stdio the same window holds, and the driver's first request ends it.
  const idle = spawnFake({ connectWindowMs: 150 })
  assert.equal(await idle.exited, 4)
  const { child, link } = await stdioLink({ connectWindowMs: 150 })
  try {
    await link.request('scope', { bundleIds: [FIXTURE] })
    await pause(300)
    assert.equal(child.exitCode, null, 'accepted: the run has begun, and the window no longer applies')
  } finally {
    link.close()
    await stopFake(child)
  }
})

test('awaitHello: a transport that ends first is no_hello; a protocol break first names the break instead', async () => {
  const ended = new HelperLink({ readable: new PassThrough(), writable: new PassThrough() })
  const first = awaitHello(ended, { token: 'secret-token', timeoutMs: 1000 })
  ended.readable.end()
  await assert.rejects(first, (e) => code('helper_lost')(e) && e.details.reason === 'no_hello' && !e.message.includes('secret-token') && !e.message.includes('/'))
  const garbled = new HelperLink({ readable: new PassThrough(), writable: new PassThrough() })
  const second = awaitHello(garbled, { token: 't', timeoutMs: 1000 })
  garbled.readable.write('not json\n')
  await assert.rejects(second, (e) => code('helper_lost')(e) && e.details.reason === undefined && /not JSON/.test(e.details.refused))
})

test('a missing socket ends the fake at once rather than leaving it to wait', async () => {
  const dir = fresh()
  const fake = spawnFake({}, { socketPath: join(root.dir, `none-${dirs}.sock`), tokenPath: join(dir, 'token') })
  assert.equal(await fake.exited, 2)
  assert.deepEqual(fake.log, [], 'no peer, so no peer check and no token read')
})
