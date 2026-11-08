import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import net from 'node:net'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { EnvironmentError } from '../../_environments_/macos-desktop/errors.mjs'
import {
  CODESIGN_BINARY, createHelperServer, HELPER_REQUIREMENT, identifyPeerByLsof, LSOF_BINARY, parseLsofFields, PEER_CHECKS, REFUSALS,
  verifyPeerSignature,
} from '../../_environments_/macos-desktop/helper-link.mjs'
import { logged, pause, scratch, spawnFake, stopFake } from './harness.mjs'

/**
 * Red team B5: a process of this user reads the mode-600 token file and connects to the helper socket before the
 * helper does. The server must identify the peer process before it reads a byte of its hello, drop anything that is
 * not the helper bundle's executable signed to the helper's requirement, keep waiting for the real helper, delete the
 * token once a valid hello arrives, and take exactly one helper per run.
 *
 * Most tests inject `identifyPeer` and `verifyPeer`, so no real signature decides anything. The default seams are
 * exercised against node children only: `lsof` and `codesign -d` / `codesign --verify` on the node binary, never on
 * CUHelper.app or anything outside this test's temp directory.
 */

const code = (expected) => (error) => error instanceof EnvironmentError && error.code === expected
const root = scratch()
after(() => root.remove())
let servers = 0
/** The helper executable these servers expect; it need not exist, since a test seam names the peer's path. */
const EXE = join(root.dir, 'CUHelper.app', 'Contents', 'MacOS', 'CUHelper')

async function serverWith(options = {}) {
  servers += 1
  const logLines = []
  const server = await createHelperServer({
    parentDir: join(root.dir, `run-${servers}`), helloTimeoutMs: 3000, helperExecutable: EXE, peerLog: (line) => logLines.push(line), ...options,
  })
  return { server, logLines }
}

/** An `identifyPeer` answering in connection order; past the list every peer is unknown. */
function inOrder(identities) {
  const queue = [...identities]
  return async () => (queue.length > 0 ? queue.shift() : null)
}

/** A `verifyPeer` that records its calls and passes only the given pids. */
function signedPids(...pids) {
  const calls = []
  return { calls, verifyPeer: async (args) => { calls.push(args); return pids.includes(args.pid) } }
}

const fakeOn = (server, config = {}) => spawnFake(config, { socketPath: server.socketPath, tokenPath: server.tokenPath })

/** A bare client: `{ refused, data }`, refused when the connection fails or is closed without a byte within 1 s. */
function probe(socketPath) {
  return new Promise((done) => {
    let data = ''
    let timer = null
    const finish = (refused) => {
      clearTimeout(timer)
      socket.destroy()
      done({ refused, data })
    }
    const socket = net.connect(socketPath)
    socket.on('data', (chunk) => { data += chunk })
    socket.on('error', () => finish(true))
    socket.on('close', () => finish(true))
    timer = setTimeout(() => finish(false), 1000)
  })
}

test('B5: an impostor that read the token and connected first is dropped before its hello; the real helper is then accepted', async () => {
  const signer = signedPids(222)
  const { server, logLines } = await serverWith({ identifyPeer: inOrder([{ pid: 111, path: '/private/tmp/impostor/node' }, { pid: 222, path: EXE }]), verifyPeer: signer.verifyPeer })
  const children = []
  try {
    const token = readFileSync(server.tokenPath, 'utf8').trim()
    const accepting = server.accept({ timeoutMs: 8000 })
    // The impostor reads the token file, as any process of this user can, and sends a hello with the right token.
    const impostor = fakeOn(server)
    children.push(impostor)
    await impostor.exited
    assert.deepEqual(server.refusals, [{ reason: 'peer_executable', pid: 111 }])
    assert.deepEqual(signer.calls, [], 'a wrong executable never reaches codesign')
    assert.equal(existsSync(server.tokenPath), true, 'the token waits for the real helper')
    const helper = fakeOn(server)
    children.push(helper)
    const link = await accepting
    assert.deepEqual(signer.calls, [{ pid: 222, path: EXE, requirement: HELPER_REQUIREMENT }])
    assert.deepEqual(server.peer, { pid: 222, path: EXE, verified: true })
    assert.equal(existsSync(server.tokenPath), false, 'the token file is deleted as soon as the valid hello arrives')
    assert.deepEqual((await link.request('scope', { bundleIds: ['com.example.fixture'] })).bundleIds, ['com.example.fixture'])
    await logged(helper, 1)
    assert.deepEqual(impostor.requests, [], 'the impostor never received a request')
    assert.deepEqual(logLines, [`macos-desktop: refused a helper connection: ${REFUSALS.peer_executable} (peer pid 111)`])
    assert.equal(logLines.join('\n').includes(token), false, 'nothing secret is logged')
    // One helper per run: after the valid hello nothing else gets in.
    const second = await probe(server.socketPath)
    assert.deepEqual(second, { refused: true, data: '' })
  } finally {
    await server.close()
    for (const child of children) await stopFake(child)
  }
})

test('B5: the right path with a failing signature is dropped; an unidentified peer is dropped under require, warned about under warn, never asked about under off', async () => {
  assert.deepEqual(PEER_CHECKS, ['require', 'warn', 'off'])
  const children = []
  const opened = []
  const start = async (options) => {
    const made = await serverWith(options)
    opened.push(made.server)
    return made
  }
  try {
    const unsigned = signedPids()
    const signature = await start({ identifyPeer: async () => ({ pid: 333, path: EXE }), verifyPeer: unsigned.verifyPeer })
    const a = fakeOn(signature.server)
    children.push(a)
    await a.exited
    assert.deepEqual(signature.server.refusals, [{ reason: 'peer_signature', pid: 333 }])
    assert.deepEqual(unsigned.calls, [{ pid: 333, path: EXE, requirement: HELPER_REQUIREMENT }])
    await assert.rejects(signature.server.accept({ timeoutMs: 50 }), code('timeout'))

    // require: no identity (lsof gone, a seam that throws, one that never answers, a malformed answer) is no entry.
    const never = () => new Promise(() => {})
    const unknown = [async () => null, async () => { throw new Error('lsof is missing') }, never, async () => ({ pid: 'x', path: 'relative' })]
    for (const identifyPeer of unknown) {
      const signer = signedPids(1)
      const required = await start({ identifyPeer, verifyPeer: signer.verifyPeer, peerCheckTimeoutMs: 200 })
      const child = fakeOn(required.server)
      children.push(child)
      await child.exited
      assert.deepEqual(required.server.refusals, [{ reason: 'peer_unknown', pid: null }])
      assert.deepEqual(signer.calls, [])
      assert.equal(existsSync(required.server.tokenPath), true)
    }

    // warn: a peer known to be wrong is still dropped; an unidentified one is accepted, with a warning.
    const warned = await start({ peerCheck: 'warn', identifyPeer: inOrder([{ pid: 444, path: '/elsewhere/node' }, null]), verifyPeer: async () => true })
    const wrong = fakeOn(warned.server)
    children.push(wrong)
    await wrong.exited
    children.push(fakeOn(warned.server))
    const link = await warned.server.accept({ timeoutMs: 8000 })
    assert.equal(link.hello.helperVersion, '0.2.49')
    assert.deepEqual(warned.server.refusals, [{ reason: 'peer_executable', pid: 444 }])
    assert.deepEqual(warned.server.peer, { pid: null, path: null, verified: false })
    assert.match(warned.logLines.at(-1), /warning: accepting a helper connection whose peer could not be identified/)

    // off: the token alone, as before B5.
    let asked = 0
    const off = await start({ peerCheck: 'off', identifyPeer: async () => { asked += 1; return null } })
    children.push(fakeOn(off.server))
    await off.server.accept({ timeoutMs: 8000 })
    assert.equal(asked, 0)
    assert.deepEqual(off.server.refusals, [])
  } finally {
    for (const server of opened) await server.close()
    for (const child of children) await stopFake(child)
  }
})

test('B5: exactly one helper per run - of two verified helpers connecting together one is accepted, the other closed without a request', async () => {
  let arrived = 0
  let bothHere
  const barrier = new Promise((resolve) => { bothHere = resolve })
  // Holds each check until both have connected, so both are genuine candidates when the first hello is taken.
  const identifyPeer = async () => {
    arrived += 1
    const pid = 500 + arrived
    if (arrived === 2) bothHere()
    await barrier
    return { pid, path: EXE }
  }
  const { server } = await serverWith({ identifyPeer, verifyPeer: async () => true })
  const a = fakeOn(server)
  const b = fakeOn(server)
  try {
    const link = await server.accept({ timeoutMs: 8000 })
    const loser = await Promise.race([a.exited.then(() => a), b.exited.then(() => b)])
    const winner = loser === a ? b : a
    await link.request('pauseOnLocalInput', { on: true })
    await logged(winner, 1)
    assert.deepEqual(loser.requests, [], 'the second helper never received a request')
    assert.deepEqual(winner.requests.map((r) => r.type), ['pauseOnLocalInput'])
    assert.deepEqual(server.refusals.map((r) => r.reason), ['one_helper'])
    assert.equal([501, 502].includes(server.peer.pid), true)
  } finally {
    await server.close()
    await stopFake(a)
    await stopFake(b)
  }
})

/**
 * A bare client of the socket: connects, writes `bytes` (maybe none), ends. Its identity is whatever the seam says,
 * and the seam answers only after the client has hung up, as when the real helper refuses faster than lsof can look.
 */
async function closingPeer(identity, bytes = '') {
  let closed
  const gone = new Promise((resolve) => { closed = resolve })
  // `finish`: its end is sent; a peer that spoke stays half-open until we read, so it never reaches `close` by itself.
  const { server, logLines } = await serverWith({ identifyPeer: async () => { await gone; await pause(30); return identity } })
  const client = net.connect(server.socketPath, () => {
    if (bytes !== '') client.write(bytes)
    client.end()
  })
  client.on('error', () => {})
  client.on('finish', closed)
  return { server, logLines }
}

test('B5 with D-029: a peer that closes without a byte before it is identified fails at once no_hello; a known impostor or one that spoke is only dropped', async () => {
  // Our helper refusing this driver closes before lsof can see it: as far as anyone can tell, no_hello, and at once.
  const refusing = await closingPeer(null)
  try {
    const begun = Date.now()
    await assert.rejects(refusing.server.accept({ timeoutMs: 8000 }), (e) => code('helper_lost')(e) && e.details.reason === 'no_hello')
    assert.ok(Date.now() - begun < 3000, 'failed at once, not at the deadline')
    assert.deepEqual(refusing.server.refusals, [{ reason: 'no_hello', pid: null }])
    await assert.rejects(refusing.server.accept({ timeoutMs: 8000 }), (e) => e.details.reason === 'no_hello', 'the failure stays')
  } finally {
    await refusing.server.close()
  }
  // Known not to be the helper: whatever it does, it is only dropped, and the server keeps waiting.
  const impostor = await closingPeer({ pid: 777, path: '/elsewhere/node' })
  try {
    await assert.rejects(impostor.server.accept({ timeoutMs: 400 }), code('timeout'))
    assert.deepEqual(impostor.server.refusals, [{ reason: 'peer_executable', pid: 777 }])
  } finally {
    await impostor.server.close()
  }
  // Unidentified but it spoke first (its bytes wait unread): not the silent refusal, so it is dropped, not no_hello.
  const talker = await closingPeer(null, '{"type":"hello"}\n')
  try {
    await assert.rejects(talker.server.accept({ timeoutMs: 400 }), code('timeout'))
    assert.deepEqual(talker.server.refusals, [{ reason: 'peer_unknown', pid: null }])
  } finally {
    await talker.server.close()
  }
})

test('the default identifyPeer (lsof, then codesign -d) names the connecting process by pid and real executable', async () => {
  const calls = []
  const accepting = await serverWith({ helperExecutable: process.execPath, verifyPeer: async (args) => { calls.push(args); return true } })
  const helper = fakeOn(accepting.server)
  try {
    await accepting.server.accept({ timeoutMs: 8000 })
    assert.equal(accepting.server.peer.pid, helper.pid, 'lsof matched the accepted socket to the fake helper process')
    assert.equal(realpathSync(accepting.server.peer.path), realpathSync(process.execPath))
    assert.deepEqual(calls.map((c) => c.pid), [helper.pid])
  } finally {
    await accepting.server.close()
    await stopFake(helper)
  }
  // A node process is not the helper bundle's executable: dropped by pid, and the server keeps waiting.
  const refusing = await serverWith({ verifyPeer: async () => true })
  const impostor = fakeOn(refusing.server)
  try {
    await impostor.exited
    assert.deepEqual(refusing.server.refusals, [{ reason: 'peer_executable', pid: impostor.pid }])
    await assert.rejects(refusing.server.accept({ timeoutMs: 50 }), code('timeout'))
  } finally {
    await refusing.server.close()
    await stopFake(impostor)
  }
})

test('identifyPeerByLsof: exactly one pid pointing at our socket is the peer; several, none, or no descriptor is unknown', async () => {
  const listing = ['p100', 'f14', 'd0xaaa', 'n/tmp/x/helper.sock', 'f15', 'd0xbbb', 'n->0xccc', 'p200', 'f3', 'd0xddd', 'n->0xaaa', 'p300', 'f4', 'd0xeee', 'n->0xfff', ''].join('\n')
  assert.deepEqual(parseLsofFields(listing)[0], { pid: 100, fd: '14', device: '0xaaa', name: '/tmp/x/helper.sock' })
  const calls = []
  const run = async (file, args) => {
    calls.push([file, ...args])
    if (file === LSOF_BINARY && args.includes('-U')) return { code: 0, stdout: listing, stderr: '' }
    if (file === CODESIGN_BINARY) return { code: 0, stdout: '', stderr: 'Executable=/Applications/CU Helper.app/Contents/MacOS/CUHelper\n' }
    return { code: 1, stdout: '', stderr: '' }
  }
  const socket = { _handle: { fd: 14 } }
  assert.deepEqual(await identifyPeerByLsof(socket, { run, selfPid: 100 }), { pid: 200, path: '/Applications/CU Helper.app/Contents/MacOS/CUHelper' })
  assert.deepEqual(calls, [[LSOF_BINARY, '-nP', '-U', '-F', 'pfdn'], [CODESIGN_BINARY, '-d', '200']])
  // codesign names no executable (unsigned code): the first txt file lsof lists for the pid.
  const unsigned = async (file, args) => {
    if (file === CODESIGN_BINARY) return { code: 1, stdout: '', stderr: 'code object is not signed at all\n' }
    if (args.includes('-U')) return { code: 0, stdout: listing, stderr: '' }
    return { code: 0, stdout: 'p200\nftxt\nn/usr/local/bin/impostor\nftxt\nn/usr/lib/dyld\n', stderr: '' }
  }
  assert.deepEqual(await identifyPeerByLsof(socket, { run: unsigned, selfPid: 100 }), { pid: 200, path: '/usr/local/bin/impostor' })
  const shared = async (file, args) => (file === LSOF_BINARY ? { code: 0, stdout: `${listing}p201\nf9\nd0xddd\nn->0xaaa\n`, stderr: '' } : run(file, args))
  assert.equal(await identifyPeerByLsof(socket, { run: shared, selfPid: 100 }), null, 'a peer end held by two processes is ambiguous')
  assert.equal(await identifyPeerByLsof({ _handle: { fd: 15 } }, { run, selfPid: 100 }), null, 'no process points at this socket')
  assert.equal(await identifyPeerByLsof({ _handle: { fd: 99 } }, { run, selfPid: 100 }), null, 'our descriptor is not listed')
  assert.equal(await identifyPeerByLsof({}, { run, selfPid: 100 }), null, 'no descriptor')
  assert.equal(await identifyPeerByLsof(socket, { run: async () => ({ code: null, stdout: '', stderr: '' }), selfPid: 100 }), null, 'lsof did not run')
  const seen = []
  assert.equal(await verifyPeerSignature({ pid: 42, requirement: HELPER_REQUIREMENT }, { run: async (file, args) => { seen.push([file, ...args]); return { code: 0 } } }), true)
  assert.deepEqual(seen, [[CODESIGN_BINARY, '--verify', `-R=${HELPER_REQUIREMENT}`, '42']])
  assert.equal(await verifyPeerSignature({ pid: 42, requirement: HELPER_REQUIREMENT }, { run: async () => ({ code: 3 }) }), false)
  assert.equal(HELPER_REQUIREMENT, 'identifier "com.reflection.cu-helper"')
})

test('the default verifyPeer checks the running pid with codesign: node never passes for the helper, and agrees with codesign on its binary', async () => {
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 20000)'], { stdio: 'ignore' })
  try {
    assert.equal(await verifyPeerSignature({ pid: child.pid, requirement: HELPER_REQUIREMENT }), false)
    const nodeRequirement = 'identifier "node"'
    const byPath = spawnSync(CODESIGN_BINARY, ['--verify', `-R=${nodeRequirement}`, process.execPath]).status === 0
    assert.equal(await verifyPeerSignature({ pid: child.pid, requirement: nodeRequirement }), byPath, 'by pid as by the binary on disk')
    assert.equal(await verifyPeerSignature({ pid: 0, requirement: nodeRequirement }), false)
    assert.equal(await verifyPeerSignature({ pid: child.pid, requirement: '' }), false)
  } finally {
    child.kill()
  }
})
