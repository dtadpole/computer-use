import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync } from 'node:fs'
import { test } from 'node:test'

import { EnvironmentError } from '../../_environments_/chrome-browser/errors.mjs'
import {
  childEnv, chromeArgs, findChrome, isOwnProfile, parseEndpoint, profilePrefix, removeProfile, sandboxProblem, startChrome,
} from '../../_environments_/chrome-browser/launch.mjs'

const SEAT = 'cu-test-seat'
const code = (expected) => (error) => error instanceof EnvironmentError && error.code === expected

/** A stand-in for Chrome's child process. */
function fakeChild({ stderrLines = [], exitWith } = {}) {
  const child = new EventEmitter()
  child.stderr = new EventEmitter()
  child.exitCode = null
  child.signalCode = null
  child.killed = []
  child.kill = (signal) => {
    child.killed.push(signal)
    if (child.exitCode === null && child.signalCode === null) {
      child.signalCode = signal
      setImmediate(() => child.emit('exit', null, signal))
    }
    return true
  }
  setImmediate(() => {
    for (const line of stderrLines) child.stderr.emit('data', Buffer.from(line))
    if (exitWith !== undefined) {
      child.exitCode = exitWith
      child.emit('exit', exitWith, null)
    }
  })
  return child
}

test('findChrome honours CU_CHROME only when it exists, else the first installed candidate', () => {
  assert.equal(findChrome({ env: { CU_CHROME: '/opt/chrome' }, exists: (p) => p === '/opt/chrome' }), '/opt/chrome')
  assert.throws(() => findChrome({ env: { CU_CHROME: '/nope' }, exists: () => false }), code('resource_refused'))
  assert.equal(findChrome({ env: {}, exists: (p) => p === '/usr/bin/google-chrome' }), '/usr/bin/google-chrome')
  assert.throws(() => findChrome({ env: {}, exists: () => false }), code('resource_refused'))
})

test('profiles live at /tmp/<seat>-chrome-XXXXXX and only such paths count as ours', () => {
  assert.equal(profilePrefix('cu-developer-two'), '/tmp/cu-developer-two-chrome-')
  assert.ok(isOwnProfile('/tmp/cu-developer-two-chrome-a1B2c3', 'cu-developer-two'))
  for (const other of ['/tmp/cu-developer-two-chrome-', '/tmp/cu-verifier-chrome-a1B2c3', '/tmp/cu-developer-two-chrome-a1B2c3/../x',
    '/Users/x/cu-developer-two-chrome-a1B2c3', '/tmp/cu-developer-two-chrome-a1B2c3d', '/']) {
    assert.ok(!isOwnProfile(other, 'cu-developer-two'), other)
  }
  for (const bad of ['developer-two', 'cu-', 'cu-Dev', '../cu-x', undefined]) assert.throws(() => profilePrefix(bad), code('invalid_argument'))
})

test('removeProfile refuses any other path and deletes our own', async () => {
  const removed = []
  await assert.rejects(removeProfile('/tmp/elsewhere', SEAT, { remove: (p) => removed.push(p) }), code('invalid_argument'))
  assert.deepEqual(removed, [])
  const dir = mkdtempSync(profilePrefix(SEAT))
  assert.ok(existsSync(dir))
  await removeProfile(dir, SEAT)
  assert.ok(!existsSync(dir))
})

test('Chrome command line: isolated, headless, never --no-sandbox; proxy flags only with a proxy', () => {
  const args = chromeArgs({ profile: '/tmp/cu-test-seat-chrome-abcdef', viewport: { width: 1280, height: 800 } })
  for (const flag of ['--headless=new', '--use-mock-keychain', '--disable-extensions', '--disable-sync', '--disable-background-networking',
    '--disable-component-update', '--force-device-scale-factor=1', '--user-data-dir=/tmp/cu-test-seat-chrome-abcdef', '--window-size=1280,800']) {
    assert.ok(args.includes(flag), flag)
  }
  assert.ok(!args.some((arg) => arg.includes('no-sandbox')))
  assert.ok(!args.some((arg) => arg.startsWith('--proxy-server')))
  const proxied = chromeArgs({ profile: '/tmp/p', proxyServer: '127.0.0.1:43001' })
  assert.ok(proxied.includes('--proxy-server=127.0.0.1:43001'))
  assert.ok(proxied.includes('--proxy-bypass-list=<-loopback>'), 'loopback must go through the proxy too')
  assert.ok(proxied.includes('--force-webrtc-ip-handling-policy=disable_non_proxied_udp'))
  assert.throws(() => chromeArgs({}), code('invalid_argument'))
})

test('the child environment inherits nothing from the host', () => {
  process.env.CU_TEST_SECRET = 'do-not-leak'
  const env = childEnv('/tmp/cu-test-seat-chrome-abcdef')
  assert.deepEqual(Object.keys(env).sort(), ['HOME', 'LANG', 'PATH', 'TMPDIR'])
  assert.equal(env.HOME, '/tmp/cu-test-seat-chrome-abcdef')
  assert.ok(env.TMPDIR.startsWith('/tmp/cu-test-seat-chrome-abcdef'))
  assert.ok(!Object.values(env).includes('do-not-leak'))
  delete process.env.CU_TEST_SECRET
})

test('endpoint and sandbox detection', () => {
  assert.equal(parseEndpoint('noise\nDevTools listening on ws://127.0.0.1:5555/devtools/browser/abc\n'), 'ws://127.0.0.1:5555/devtools/browser/abc')
  assert.equal(parseEndpoint('nothing yet'), null)
  assert.equal(sandboxProblem({ commandLine: ['--headless=new'], stderr: 'CVDisplayLink failed' }), null)
  assert.match(sandboxProblem({ commandLine: ['--no-sandbox'] }), /no-sandbox/)
  assert.match(sandboxProblem({ commandLine: ['--disable-setuid-sandbox'] }), /setuid/)
  assert.match(sandboxProblem({ stderr: 'FATAL: sandbox initialization failed: Operation not permitted' }), /sandbox/)
})

test('startChrome resolves with the endpoint and stop() kills Chrome and removes the profile, once', async () => {
  let spawned
  const running = await startChrome({
    seat: SEAT, binary: '/fake/chrome',
    spawn: (binary, args, options) => {
      spawned = { binary, args, options }
      return (spawned.child = fakeChild({ stderrLines: ['starting\n', 'DevTools listening on ws://127.0.0.1:4242/devtools/browser/x\n'] }))
    },
  })
  assert.equal(running.wsUrl, 'ws://127.0.0.1:4242/devtools/browser/x')
  assert.ok(isOwnProfile(running.profile, SEAT))
  assert.ok(existsSync(running.profile))
  assert.deepEqual(Object.keys(spawned.options.env).sort(), ['HOME', 'LANG', 'PATH', 'TMPDIR'])
  assert.ok(!spawned.args.includes('--no-sandbox'))
  await running.stop()
  await running.stop()
  assert.deepEqual(spawned.child.killed, ['SIGTERM'])
  assert.ok(!existsSync(running.profile))
})

test('a Chrome that dies on its sandbox is refused as sandbox_unavailable, and cleaned up', async () => {
  let profile
  await assert.rejects(startChrome({
    seat: SEAT, binary: '/fake/chrome',
    mkdtemp: (prefix) => (profile = mkdtempSync(prefix)),
    spawn: () => fakeChild({ stderrLines: ['FATAL: sandbox initialization failed\n'], exitWith: 1 }),
  }), code('sandbox_unavailable'))
  assert.ok(!existsSync(profile))
})

test('a Chrome that never prints an endpoint times out and is stopped', async () => {
  let child
  let profile
  await assert.rejects(startChrome({
    seat: SEAT, binary: '/fake/chrome', timeoutMs: 50,
    mkdtemp: (prefix) => (profile = mkdtempSync(prefix)),
    spawn: () => (child = fakeChild({ stderrLines: ['still starting\n'] })),
  }), code('timeout'))
  assert.deepEqual(child.killed, ['SIGTERM'])
  assert.ok(!existsSync(profile))
})

test('removeProfile removes again when Chrome\'s helpers recreate the folder after a removal', async () => {
  const path = '/tmp/cu-test-seat-chrome-zZ9yY8'
  let removals = 0
  let present = true
  const remove = () => { removals += 1; present = removals < 2 } // the first removal is undone by a late write
  const exists = () => present
  assert.equal(await removeProfile(path, SEAT, { remove, exists, settleMs: 1 }), true)
  assert.equal(removals, 2)
  const stubborn = await removeProfile(path, SEAT, { remove: () => {}, exists: () => true, settleMs: 1, attempts: 3 })
  assert.equal(stubborn, false, 'a folder that keeps coming back is reported, not hidden')
})
