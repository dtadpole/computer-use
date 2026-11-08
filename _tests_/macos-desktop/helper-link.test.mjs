import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { PassThrough } from 'node:stream'
import { test } from 'node:test'

import { EnvironmentError } from '../../_environments_/macos-desktop/errors.mjs'
import {
  awaitHello, checkRequest, CORE_REQUEST_FIELDS, createHelperServer, helloProblem, HelperLink, LineFramer, PROTOCOL_VERSION, REQUEST_FIELDS,
  SEAM_FIELDS, SEAM_REQUESTS, SETTLE_CAP_MS, SETTLE_MS,
} from '../../_environments_/macos-desktop/helper-link.mjs'
import * as helperLink from '../../_environments_/macos-desktop/helper-link.mjs'
import { logged, pause, scratch, spawnFake, stdioLink, stopFake } from './harness.mjs'

const code = (expected) => (error) => error instanceof EnvironmentError && error.code === expected
const goodHello = (token = 't') => ({
  type: 'hello', token, protocol: PROTOCOL_VERSION, helperVersion: '0.2.44',
  grants: { screen: false, accessibility: false }, displays: [{ id: 1, originPt: { x: 0, y: 0 }, sizePt: { width: 10, height: 10 }, scale: 1 }],
})

test('framing: lines split across chunks and several per chunk; an over-long line is refused', () => {
  const framer = new LineFramer({ maxBytes: 16 })
  assert.deepEqual(framer.push(Buffer.from('{"a"')), [])
  assert.deepEqual(framer.push(Buffer.from(':1}\n{"b":2}\n{"c"')), ['{"a":1}', '{"b":2}'])
  assert.deepEqual(framer.push(Buffer.from(':3}\n')), ['{"c":3}'])
  assert.throws(() => framer.push(Buffer.from('x'.repeat(17))), /too long/)
  const multibyte = new LineFramer()
  const bytes = Buffer.from('{"t":"é"}\n')
  assert.deepEqual([...multibyte.push(bytes.subarray(0, 7)), ...multibyte.push(bytes.subarray(7))], ['{"t":"é"}'], 'a character split across chunks survives')
})

test('requests and fields outside the protocol are refused by name before anything is sent', () => {
  assert.deepEqual(Object.keys(REQUEST_FIELDS).sort(), ['bye', 'capture', 'confirmPhysical', 'cursor', 'focused', 'hitTest', 'input', 'menuKey', 'panelSelection', 'pauseOnLocalInput', 'scope', 'screenText', 'selection', 'simulateLocalInput', 'unwatch', 'watch'])
  // CU-203: the lock's own request, apart from the requests a run uses.
  assert.deepEqual([...helperLink.LOCK_REQUESTS.confirmPhysical], ['seat', 'task', 'timeoutMs'])
  assert.equal(Object.hasOwn(CORE_REQUEST_FIELDS, 'confirmPhysical'), false)
  assert.throws(() => checkRequest('screenshot', {}), (e) => code('invalid_argument')(e) && /'screenshot'/.test(e.message))
  assert.throws(() => checkRequest('capture', { quality: 1 }), (e) => code('invalid_argument')(e) && e.details.field === 'quality')
  assert.doesNotThrow(() => checkRequest('hitTest', { xPt: 1, yPt: 2 }))
  // CU-236: menuKey carries the chord's planned keyDown and nothing else.
  assert.deepEqual([...CORE_REQUEST_FIELDS.menuKey], ['keyCode', 'flags'])
  assert.throws(() => checkRequest('menuKey', { key: 'D', modifiers: 1 }), (e) => code('invalid_argument')(e) && e.details.field === 'key')
  // The design's test seams are protocol too, kept in one table apart from the requests a run uses.
  assert.deepEqual(REQUEST_FIELDS.capture, ['display', 'maxSize', 'region', 'simulateScale'])
  assert.deepEqual(REQUEST_FIELDS.simulateLocalInput, ['kind', 'via'])
  assert.deepEqual([...CORE_REQUEST_FIELDS.capture], ['display', 'maxSize', 'region'])
  assert.equal(Object.hasOwn(CORE_REQUEST_FIELDS, 'simulateLocalInput'), false)
  assert.deepEqual([SEAM_FIELDS, SEAM_REQUESTS], [{ capture: ['simulateScale'] }, { simulateLocalInput: ['kind', 'via'] }])
  // The settle (design 0.4.1-0.4.2) is in the Swift table since helper 0.2.8, so it is a core input field like any
  // other: accepted on input only, and no table of fields ahead of Swift remains.
  assert.deepEqual([...CORE_REQUEST_FIELDS.input], ['events', 'mode', 'bundleId', 'settleMs'])
  assert.deepEqual(REQUEST_FIELDS.input, ['events', 'mode', 'bundleId', 'settleMs'])
  assert.equal(Object.hasOwn(helperLink, 'PENDING_FIELDS'), false)
  assert.doesNotThrow(() => checkRequest('input', { events: [], mode: 'global', bundleId: 'com.example.fixture', settleMs: 1500 }))
  assert.throws(() => checkRequest('capture', { settleMs: 1500 }), (e) => code('invalid_argument')(e) && e.details.field === 'settleMs')
  assert.throws(() => checkRequest('input', { events: [], mode: 'global', settle: 1500 }), (e) => code('invalid_argument')(e) && e.details.field === 'settle')
  assert.deepEqual([SETTLE_MS, SETTLE_CAP_MS], [1500, 60_000])
})

test('hello: the token, protocol, grants and displays are checked; an unknown field is refused by name', () => {
  assert.equal(helloProblem(goodHello('secret'), 'secret'), null)
  assert.match(helloProblem(goodHello('wrong'), 'secret'), /wrong token/)
  assert.match(helloProblem({ ...goodHello('secret'), protocol: 2 }, 'secret'), /protocol 2/)
  assert.match(helloProblem({ ...goodHello('secret'), debug: true }, 'secret'), /no field 'debug'/)
  assert.match(helloProblem({ ...goodHello('secret'), grants: { screen: 'yes', accessibility: false } }, 'secret'), /grants/)
  assert.match(helloProblem({ ...goodHello('secret'), displays: [{ id: 1 }] }, 'secret'), /display/)
  assert.match(helloProblem({ type: 'other' }, 'secret'), /not a hello/)
})

test('stdio: the fake helper says hello; requests carry rising ids and replies resolve them by id', async () => {
  const { child, link } = await stdioLink({ grants: { screen: true, accessibility: true } })
  try {
    assert.equal(link.hello.token, undefined, 'the token is not kept')
    assert.equal(link.hello.helperVersion, '0.2.49')
    const [scope, armed] = await Promise.all([
      link.request('scope', { bundleIds: ['com.example.fixture'] }),
      link.request('pauseOnLocalInput', { on: true }),
    ])
    assert.deepEqual(scope.bundleIds, ['com.example.fixture'])
    assert.equal(armed.armed, true)
    await logged(child, 2)
    assert.deepEqual(child.requests.map((r) => [r.id, r.type]), [[1, 'scope'], [2, 'pauseOnLocalInput']])
    await assert.rejects(link.request('nope', {}), code('invalid_argument'))
  } finally {
    link.close()
    await stopFake(child)
  }
})

test('stdio: the helper refuses an unknown field by name, and a missing grant names the grant', async () => {
  const { child, link } = await stdioLink({ grants: { screen: false, accessibility: false } })
  try {
    // Bypass the driver's own check to see the helper's refusal.
    link.writable.write(`${JSON.stringify({ id: 99, type: 'focused', extra: 1 })}\n`)
    const viaHelper = new Promise((resolve) => link.pending.set(99, { type: 'focused', resolve, reject: resolve, timer: null }))
    const refusal = await viaHelper
    assert.equal(refusal.code, 'invalid_argument')
    assert.equal(refusal.details.field, 'extra')
    await assert.rejects(link.request('capture', { maxSize: { width: 10, height: 10 } }), (e) => code('not_granted')(e) && e.details.grant === 'screen' && /Screen Recording/.test(e.message))
    await assert.rejects(link.request('focused', {}), (e) => code('not_granted')(e) && e.details.grant === 'accessibility')
  } finally {
    link.close()
    await stopFake(child)
  }
})

test('a wrong token is refused and the link closed', async () => {
  await assert.rejects(stdioLink({ quirks: { badToken: true } }), (e) => code('helper_lost')(e) && /wrong token/.test(e.message))
  await assert.rejects(stdioLink({}, { token: 'a', helloToken: 'b' }), (e) => code('helper_lost')(e) && e.details.refused === 'the hello carried a wrong token')
  await assert.rejects(stdioLink({ quirks: { protocol: 9 } }), code('helper_lost'))
})

test('a reply to an id never sent ends the link with helper_lost', async () => {
  const { child, link } = await stdioLink({ quirks: { replyUnknownIdOn: 'focused' } })
  const lost = new Promise((resolve) => link.once('lost', resolve))
  try {
    await assert.rejects(link.request('focused', {}), (e) => code('helper_lost')(e) && /never sent/.test(e.message))
    assert.match((await lost).reason, /9999/)
    await assert.rejects(link.request('scope', { bundleIds: ['a.b'] }), code('helper_lost'))
  } finally {
    await stopFake(child)
  }
})

test('helper_lost: the helper exiting, a garbage line or a reported internal failure ends the link; nothing is retried', async () => {
  for (const quirks of [{ exitOn: 'focused' }, { garbageOn: 'focused' }, { failOn: 'focused' }]) {
    const { child, link } = await stdioLink({ quirks })
    try {
      await assert.rejects(link.request('focused', {}), code('helper_lost'), JSON.stringify(quirks))
      assert.equal(link.lost, true)
      await logged(child, 1)
      assert.equal(child.requests.filter((r) => r.type === 'focused').length, 1, 'sent once, never retried')
    } finally {
      await stopFake(child)
    }
  }
})

test('a failed reply ends the link with the helper\'s own message in the reason, folded to one line and capped', async () => {
  // A capture fails for several reasons the helper names; the code alone ('failed') hid which one during a live outage.
  const { child, link } = await stdioLink({ quirks: { failOn: 'focused' } })
  try {
    await assert.rejects(link.request('focused', {}), (e) => code('helper_lost')(e) && /the helper failed the focused request \(failed: the fake failed on purpose\)/.test(e.message))
    assert.match(link.lostReason, /\(failed: the fake failed on purpose\)/)
  } finally {
    await stopFake(child)
  }
  assert.equal(helperLink.helperSaid('no display is active'), ': no display is active')
  assert.equal(helperLink.helperSaid('  two\n  lines\t here '), ': two lines here')
  assert.equal(helperLink.helperSaid(undefined), '')
  assert.equal(helperLink.helperSaid('   '), '')
  const long = helperLink.helperSaid('x'.repeat(500))
  assert.equal(long.length, 2 + helperLink.HELPER_MESSAGE_MAX)
  assert.ok(long.endsWith('\u2026'))
})

test('a request timing out rejects timeout and cuts the helper off', async () => {
  const { child, link } = await stdioLink({ quirks: { silentOn: 'focused' } }, { requestTimeoutMs: 100 })
  try {
    await assert.rejects(link.request('focused', {}), code('timeout'))
    assert.equal(link.lost, true)
    assert.equal(await child.exited, 0, 'the fake exits when its input closes')
  } finally {
    await stopFake(child)
  }
})

test('nothing but a hello may come first, and a second hello ends the link', async () => {
  const readable = new PassThrough()
  const writable = new PassThrough()
  const link = new HelperLink({ readable, writable })
  const refused = awaitHello(link, { token: 't', timeoutMs: 1000 })
  readable.write('{"id":1,"ok":true}\n')
  await assert.rejects(refused, code('helper_lost'))
  const other = new HelperLink({ readable: new PassThrough(), writable: new PassThrough() })
  const ok = awaitHello(other, { token: 't', timeoutMs: 1000 })
  other.readable.write(`${JSON.stringify(goodHello('t'))}\n`)
  await ok
  other.readable.write(`${JSON.stringify(goodHello('t'))}\n`)
  await pause(10)
  assert.match(other.lostReason, /second hello/)
})

test('socket: a private run directory, a mode-600 token, a wrong hello refused, the real helper accepted, then cleaned up', async () => {
  const tmp = scratch()
  // Every peer passes the peer check here (peer-check.test.mjs judges that); this test is about the hello.
  const exe = `${tmp.dir}/CUHelper.app/Contents/MacOS/CUHelper`
  const logLines = []
  const server = await createHelperServer({
    parentDir: `${tmp.dir}/run`, helloTimeoutMs: 3000, helperExecutable: exe,
    identifyPeer: async () => ({ pid: 4242, path: exe }), verifyPeer: async () => true, peerLog: (line) => logLines.push(line),
  })
  const children = []
  try {
    assert.equal(server.peerCheck, 'require', 'the peer check is on unless switched off')
    assert.equal(statSync(server.dir).mode & 0o777, 0o700)
    assert.equal(statSync(server.tokenPath).mode & 0o777, 0o600)
    assert.equal(statSync(server.socketPath).mode & 0o077, 0)
    const token = readFileSync(server.tokenPath, 'utf8')
    assert.match(token, /^[0-9a-f]{64}\n$/)
    const accepting = server.accept({ timeoutMs: 8000 })
    const impostor = spawnFake({ quirks: { badToken: true } }, { socketPath: server.socketPath, tokenPath: server.tokenPath })
    children.push(impostor)
    await impostor.exited
    assert.deepEqual(server.refusals, [{ reason: 'hello', pid: 4242 }])
    assert.equal(server.refused, 1)
    assert.equal(existsSync(server.tokenPath), true, 'a refused hello leaves the token for the real helper')
    const helper = spawnFake({}, { socketPath: server.socketPath, tokenPath: server.tokenPath })
    children.push(helper)
    const link = await accepting
    assert.equal(existsSync(server.tokenPath), false, 'the token file is deleted once a valid hello arrives')
    assert.deepEqual(server.peer, { pid: 4242, path: exe, verified: true })
    assert.equal(logLines.some((line) => line.includes(token.trim())), false, 'the log never carries the token')
    const reply = await link.request('scope', { bundleIds: ['com.example.fixture'] })
    assert.deepEqual(reply.bundleIds, ['com.example.fixture'])
    const lost = new Promise((resolve) => link.once('lost', resolve))
    helper.kill()
    assert.match((await lost).reason, /closed/)
    await assert.rejects(link.request('focused', {}), code('helper_lost'))
  } finally {
    await server.close()
    for (const child of children) await stopFake(child)
    assert.equal(existsSync(server.dir), false, 'the run directory is removed')
    tmp.remove()
  }
})

test('socket: no helper within the deadline is a timeout; an over-long socket path or a bad peer option is refused', async () => {
  const tmp = scratch()
  try {
    const server = await createHelperServer({ parentDir: tmp.dir, peerCheck: 'off' })
    await assert.rejects(server.accept({ timeoutMs: 50 }), code('timeout'))
    await server.close()
    await assert.rejects(createHelperServer({ parentDir: `${tmp.dir}/${'d'.repeat(90)}`, peerCheck: 'off' }), code('invalid_argument'))
    await assert.rejects(createHelperServer({ parentDir: 'relative/run', peerCheck: 'off' }), code('invalid_argument'))
    // The peer check is the default, and it cannot run without knowing which executable the helper is.
    await assert.rejects(createHelperServer({ parentDir: tmp.dir }), (e) => code('invalid_argument')(e) && /helper executable/.test(e.message))
    for (const bad of [{ peerCheck: 'maybe' }, { helperExecutable: 'relative/CUHelper' }, { helperRequirement: '' }, { helperRequirement: 'a\nb' }, { identifyPeer: 'lsof' }, { verifyPeer: null }]) {
      await assert.rejects(createHelperServer({ parentDir: tmp.dir, helperExecutable: '/x/CUHelper', ...bad }), code('invalid_argument'), JSON.stringify(bad))
    }
    assert.deepEqual(readdirSync(tmp.dir).filter((name) => name.startsWith('helper-')), [], 'a refused option leaves no run directory behind')
  } finally {
    tmp.remove()
  }
})
