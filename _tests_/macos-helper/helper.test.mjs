/**
 * The macOS helper, built from source and driven as the driver drives it - over its Unix socket and over stdio -
 * with no grant and no prompt: every serving check runs `--simulate-ungranted` (so even a host that holds grants
 * never captures or posts) or `--dry-run` over a declared world. The one live-mode check is the peer check, which
 * refuses this test's process before the helper says anything. The Swift unit tests (UnitTests.swift) run as one
 * check. Nothing is launched through LaunchServices and nothing appears on the display.
 */

import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'

import { buildAll, HELPER_DIR } from './build.mjs'
import { decodePng, solidPng } from '../../_tools_/verify-kit/png.mjs'

let built
const scratch = []

before(() => {
  built = buildAll()
})

after(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true })
})

/** A fresh private directory under /tmp (short, so the socket path fits sun_path). */
function privateDir() {
  const dir = mkdtempSync('/tmp/cuh-')
  chmodSync(dir, 0o700)
  scratch.push(dir)
  return dir
}

function tokenFile(dir, token = 'a'.repeat(64), mode = 0o600) {
  const path = join(dir, 'token')
  writeFileSync(path, `${token}\n`, { mode })
  chmodSync(path, mode)
  return path
}

/** One JSON-lines peer over any readable/writable pair. */
function lineChannel(readable, writable) {
  const replies = new Map()
  const events = []
  const loose = []
  let hello = null
  let helloWaiter = null
  let buffer = ''
  let nextId = 1
  readable.on('data', (chunk) => {
    buffer += chunk.toString('utf8')
    for (let at = buffer.indexOf('\n'); at !== -1; at = buffer.indexOf('\n')) {
      const line = buffer.slice(0, at)
      buffer = buffer.slice(at + 1)
      if (line.trim() === '') continue
      const message = JSON.parse(line)
      if (message.type === 'hello' && message.id === undefined) {
        hello = message
        helloWaiter?.(message)
      } else if (message.id !== undefined) {
        replies.get(message.id)?.(message)
        replies.delete(message.id)
      } else if (message.event !== undefined) events.push(message)
      else loose.push(message)
    }
  })
  return {
    events,
    loose,
    // Bounded (CU-334): a helper that refuses this test's process as its peer, or dies, sends no hello. The test then
    // fails naming that, instead of hanging the gate until its alarm.
    hello: (timeoutMs = 30_000) => (hello !== null ? Promise.resolve(hello) : new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no hello within ${timeoutMs} ms - the helper refused this peer or exited (see its stderr)`)), timeoutMs)
      helloWaiter = (message) => { clearTimeout(timer); resolve(message) }
    })),
    request(type, fields = {}, timeoutMs = 60_000) {
      const id = nextId++
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { replies.delete(id); reject(new Error(`no reply to ${type} within ${timeoutMs} ms`)) }, timeoutMs)
        replies.set(id, (message) => { clearTimeout(timer); resolve(message) })
        writable.write(`${JSON.stringify({ id, type, ...fields })}\n`)
      })
    },
    raw(text) {
      writable.write(text)
    },
  }
}

/** The child's exit code - at once if it already exited (a listener added after the exit would never fire), else when
 * it exits; bounded (CU-334) so a helper that never exits fails the test instead of hanging the gate. */
function exitOf(child, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve(child.exitCode)
    const timer = setTimeout(() => reject(new Error(`the helper did not exit within ${timeoutMs} ms`)), timeoutMs)
    child.once('exit', (code) => { clearTimeout(timer); resolve(code) })
  })
}

/** Listen on a private socket, spawn the helper against it, resolve once it connected or exited. */
async function socketHelper(extraArgs = [], { dirMode = 0o700, tokenMode = 0o600 } = {}) {
  const dir = privateDir()
  const token = tokenFile(dir, 'b'.repeat(64), tokenMode)
  chmodSync(dir, dirMode)
  const socketPath = join(dir, 'h.sock')
  const server = net.createServer()
  await new Promise((resolve) => server.listen(socketPath, resolve))
  const connected = new Promise((resolve) => server.once('connection', resolve))
  const child = spawn(built.executable, ['--socket', socketPath, '--token-file', token, ...extraArgs], { stdio: ['ignore', 'ignore', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', (chunk) => { stderr += chunk })
  const outcome = await Promise.race([connected.then((socket) => ({ socket })), exitOf(child).then((code) => ({ code }))])
  if (outcome.socket === undefined) {
    server.close()
    return { child, code: outcome.code, stderr: () => stderr }
  }
  const channel = lineChannel(outcome.socket, outcome.socket)
  return { child, channel, socket: outcome.socket, server, socketDir: dir, stderr: () => stderr, close: () => { outcome.socket.destroy(); server.close() } }
}

function stdioHelper(extraArgs = []) {
  const dir = privateDir()
  const child = spawn(built.executable, ['--stdio', '--token-file', tokenFile(dir, 'c'.repeat(64)), ...extraArgs], { stdio: ['pipe', 'pipe', 'pipe'] })
  return { child, dir, channel: lineChannel(child.stdout, child.stdin) }
}

function pngSize(buffer) {
  assert.equal(buffer.subarray(1, 4).toString('latin1'), 'PNG')
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

const SIZE = { width: 640, height: 400 }

describe('build', () => {
  it('builds CUHelper.app with the fixed bundle id, LSUIElement and a valid ad-hoc signature', () => {
    assert.ok(existsSync(built.executable))
    const plist = JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', join(built.app, 'Contents', 'Info.plist')]).toString())
    assert.equal(plist.CFBundleIdentifier, 'com.reflection.cu-helper')
    assert.equal(plist.CFBundleExecutable, 'CUHelper')
    assert.equal(plist.LSUIElement, true)
    assert.equal(plist.CFBundleShortVersionString, '0.2.70')
    const details = execFileSync('/bin/sh', ['-c', `codesign -dv "${built.app}" 2>&1`]).toString()
    assert.match(details, /Identifier=com\.reflection\.cu-helper/)
    assert.match(details, /Signature=adhoc/)
    execFileSync('codesign', ['--verify', '--strict', built.app])
  })

  it('links no other prompting call than the two of --request-grants, and nothing that touches the pasteboard', () => {
    const imported = execFileSync('nm', ['-u', built.executable]).toString().split('\n').map((line) => line.trim())
    for (const name of ['_CGRequestPostEventAccess', '_CGRequestListenEventAccess', '_IOHIDRequestAccess', '_CGWindowListCreateImage']) {
      assert.ok(!imported.includes(name), `${name} must not be linked`)
    }
    // The owner's --request-grants (RequestGrants.swift) is the one place these two are called; the source test pins it.
    for (const name of ['_CGRequestScreenCaptureAccess', '_AXIsProcessTrustedWithOptions']) assert.ok(imported.includes(name), `${name} is --request-grants'`)
    // CU-151: the one pasteboard symbol is the NSPasteboard class, for its change count (the source test pins the single
    // expression); no pasteboard type constant or function - nothing that names content - is linked.
    assert.deepEqual(imported.filter((name) => /NSPasteboard/.test(name)), ['_OBJC_CLASS_$_NSPasteboard'], 'only the class, for changeCount')
    for (const name of ['_CGPreflightScreenCaptureAccess', '_AXIsProcessTrusted', '_CGPreflightListenEventAccess', '_CGPreflightPostEventAccess', '_IsSecureEventInputEnabled']) {
      assert.ok(imported.includes(name), `${name} is how the helper reads state`)
    }
  })

  it('keeps test code out of the shipped binary', () => {
    assert.doesNotMatch(execFileSync('nm', [built.executable]).toString(), /UnitTests|Harness/)
    assert.ok(!readFileSync(join(HELPER_DIR, 'build.sh'), 'utf8').includes('UnitTests'))
  })
})

describe('install.sh (the owner\'s install step)', () => {
  it('builds at <CU_HOME>/helper, keeps the directories private and reports the prompt-free self-test', () => {
    const home = privateDir()
    const output = execFileSync('bash', [join(HELPER_DIR, 'install.sh'), '--cu-home', home, '--no-open'], { env: { ...process.env, CU_HELPER_IDENTITY: '' }, stdio: ['ignore', 'pipe', 'pipe'], timeout: 100_000 }).toString()
    assert.ok(existsSync(join(home, 'helper', 'CUHelper.app', 'Contents', 'MacOS', 'CUHelper')))
    assert.equal(execFileSync('stat', ['-f', '%Lp', join(home, 'helper')]).toString().trim(), '700')
    assert.match(output, /designated requirement: cdhash H"[0-9a-f]{40}"/)
    assert.match(output, /self-test: pass \(40 checks, 0 capability calls\)/)
    assert.match(output, /grants: accessibility (on|off), listenEvents (on|off), postEvents (on|off), screen (on|off)/)
  })

  it('removes the bundle and says why when codesign cannot sign with the named identity', () => {
    const home = privateDir()
    // A stand-in codesign first on PATH: it fails for any named identity, as the real one does when the certificate
    // is missing or its key is refused, and is never asked to touch a keychain.
    const shim = privateDir()
    writeFileSync(join(shim, 'codesign'), '#!/bin/sh\nfor a in "$@"; do [ "$prev" = "--sign" ] && [ "$a" != "-" ] && { echo "$a: no identity found" >&2; exit 1; }; prev="$a"; done\nexec /usr/bin/codesign "$@"\n', { mode: 0o755 })
    let failure
    try {
      execFileSync('bash', [join(HELPER_DIR, 'install.sh'), '--cu-home', home, '--no-open'], { env: { ...process.env, PATH: `${shim}:${process.env.PATH}`, CU_HELPER_IDENTITY: 'CU Helper Signing' }, stdio: ['ignore', 'pipe', 'pipe'], timeout: 100_000 })
    } catch (error) {
      failure = error
    }
    assert.ok(failure && failure.status !== 0, 'install.sh fails')
    assert.match(failure.stderr.toString(), /could not sign with 'CU Helper Signing'; removed the unsigned/)
    assert.ok(!existsSync(join(home, 'helper', 'CUHelper.app')), 'no half-built bundle is left where the owner grants')
    assert.match(failure.stderr.toString(), /must be in this user's login keychain/)
  })

  it('says to sign from the desktop session when codesign cannot reach the keychain prompt (errSecInternalComponent)', () => {
    const home = privateDir()
    const shim = privateDir()
    writeFileSync(join(shim, 'codesign'), '#!/bin/sh\nfor a in "$@"; do [ "$prev" = "--sign" ] && [ "$a" != "-" ] && { echo "$PWD: errSecInternalComponent" >&2; exit 1; }; prev="$a"; done\nexec /usr/bin/codesign "$@"\n', { mode: 0o755 })
    let failure
    try {
      execFileSync('bash', [join(HELPER_DIR, 'install.sh'), '--cu-home', home, '--no-open'], { env: { ...process.env, PATH: `${shim}:${process.env.PATH}`, CU_HELPER_IDENTITY: 'CU Helper Signing' }, stdio: ['ignore', 'pipe', 'pipe'], timeout: 100_000 })
    } catch (error) {
      failure = error
    }
    assert.ok(failure && failure.status !== 0, 'install.sh fails')
    const stderr = failure.stderr.toString()
    assert.match(stderr, /errSecInternalComponent/, "codesign's own line still shows")
    assert.match(stderr, /desktop session \(over Screen Sharing, not SSH\)/)
    assert.match(stderr, /security unlock-keychain/)
    assert.doesNotMatch(stderr, /must be in this user's login keychain/)
    assert.ok(!existsSync(join(home, 'helper', 'CUHelper.app')))
  })

  it('refuses a relative CU_HOME and unknown arguments', () => {
    for (const args of [['--cu-home', 'relative'], ['--grant-everything']]) {
      assert.throws(() => execFileSync('bash', [join(HELPER_DIR, 'install.sh'), ...args], { stdio: 'ignore' }), (error) => error.status === 2, args.join(' '))
    }
  })
})

describe('Swift unit tests', () => {
  it('pass', () => {
    let output
    try {
      output = execFileSync(built.unitTests, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 }).toString()
    } catch (error) {
      output = error.stdout?.toString() ?? ''
    }
    const report = JSON.parse(output.trim().split('\n').at(-1))
    assert.deepEqual(report.failures, [])
    assert.equal(report.failed, 0)
    assert.ok(report.passed >= 160, `only ${report.passed} checks ran`)
  })
})

describe('--selftest', () => {
  it('passes with no capability call and reports identity and preflights', () => {
    const report = JSON.parse(execFileSync(built.executable, ['--selftest']).toString())
    assert.equal(report.selftest, 'pass')
    assert.deepEqual(report.failures, [])
    assert.equal(report.capabilityCalls, 0)
    assert.ok(report.checks >= 36)
    assert.equal(report.runningBundleId, 'com.reflection.cu-helper')
    assert.equal(report.eventTag, 0x43555345)
    assert.deepEqual(Object.keys(report.preflight).sort(), ['accessibility', 'listenEvents', 'postEvents', 'screen'])
    assert.equal(report.signing.identifier, 'com.reflection.cu-helper')
    assert.equal(report.signing.adhoc, true)
    assert.match(report.signing.designatedRequirement, /^cdhash H"[0-9a-f]{40}"$/)
    assert.equal(report.launchedByLaunchd, false)
    assert.ok(report.displays.length >= 1)
  })

  it('writes --out with mode 600 and never over an existing file', () => {
    const out = join(privateDir(), 'report.json')
    execFileSync(built.executable, ['--selftest', '--out', out])
    assert.equal(JSON.parse(readFileSync(out, 'utf8')).selftest, 'pass')
    assert.equal(execFileSync('stat', ['-f', '%Lp', out]).toString().trim(), '600')
    assert.throws(() => execFileSync(built.executable, ['--selftest', '--out', out], { stdio: 'ignore' }), (error) => error.status === 2)
  })
})

describe('socket transport, grants forced off', () => {
  it('speaks first with exactly the hello the driver accepts, then refuses every gated request as not_granted', async () => {
    const helper = await socketHelper(['--simulate-ungranted'])
    try {
      const hello = await helper.channel.hello()
      assert.deepEqual(Object.keys(hello).sort(), ['displays', 'grants', 'helperVersion', 'protocol', 'token', 'type'])
      assert.equal(hello.token, 'b'.repeat(64))
      assert.equal(existsSync(join(helper.socketDir, 'token')), false, 'the token file beside the socket is gone once read (B4)')
      assert.equal(hello.protocol, 1)
      assert.deepEqual(hello.grants, { screen: false, accessibility: false, postEvents: false, listenEvents: false })
      assert.ok(hello.displays.every((d) => Number.isInteger(d.id) && d.sizePt.width > 0 && d.scale > 0 && typeof d.originPt.x === 'number'))
      const gated = [['capture', { maxSize: SIZE }, 'screen'], ['watch', { fps: 1 }, 'screen'], ['input', { mode: 'global', events: [{ kind: 'keyDown', keyCode: 0, flags: 0 }] }, 'accessibility'],
        ['hitTest', { xPt: 1, yPt: 1 }, 'accessibility'], ['focused', {}, 'accessibility'], ['screenText', { maxChars: 10 }, 'accessibility']]
      for (const [type, fields, grant] of gated) {
        const reply = await helper.channel.request(type, fields)
        assert.deepEqual([reply.ok, reply.code, reply.grant], [false, 'not_granted', grant], type)
      }
      const excluded = await helper.channel.request('scope', { bundleIds: ['com.googlecode.iterm2'] })
      assert.deepEqual([excluded.code, excluded.bundleId], ['excluded', 'com.googlecode.iterm2'])
      const scope = await helper.channel.request('scope', { bundleIds: ['ai.reflection.cu.fixture'] })
      assert.equal(scope.ok, true)
      assert.deepEqual(scope.bundleIds, ['ai.reflection.cu.fixture'])
      assert.equal(scope.display, null, 'no display without the Accessibility grant')
      const armed = await helper.channel.request('pauseOnLocalInput', { on: true })
      assert.deepEqual([armed.armed, armed.via], [true, ['idleCounter']])
      assert.equal((await helper.channel.request('nonsense')).code, 'unknown_request')
      const field = await helper.channel.request('capture', { maxSize: SIZE, colour: 'red' })
      assert.deepEqual([field.code, field.field], ['unknown_field', 'colour'])
      helper.channel.raw('this is not json\n')
      assert.equal((await helper.channel.request('bye')).ok, true)
      assert.deepEqual(helper.channel.loose.map((line) => [line.ok, line.code]), [[false, 'invalid_argument']], 'a line that is not JSON is refused without an id')
      assert.equal(await exitOf(helper.child), 0)
    } finally {
      helper.close?.()
      helper.child.kill()
    }
  })

  it('exits when the driver closes the connection', async () => {
    const helper = await socketHelper(['--simulate-ungranted'])
    await helper.channel.hello()
    helper.socket.end()
    assert.equal(await exitOf(helper.child), 0)
    helper.close()
  })

  it('refuses a token file others can read (read after connecting, B3), or a socket others can reach', async () => {
    const token = await socketHelper(['--simulate-ungranted'], { tokenMode: 0o644 })
    const said = []
    token.socket?.on('data', (chunk) => said.push(chunk))
    assert.equal(token.code ?? await exitOf(token.child), 2)
    assert.match(token.stderr(), /token file must be a mode-600 file/)
    assert.equal(Buffer.concat(said).length, 0, 'no hello')
    token.close?.()
    const dir = await socketHelper(['--simulate-ungranted'], { dirMode: 0o755 })
    assert.equal(dir.code, 2)
    assert.match(dir.stderr(), /socket directory must be a mode-700 directory/)
  })

  it('gives up when no driver is there within 10 s (D-029 one run)', async () => {
    const dir = privateDir()
    const child = spawn(built.executable, ['--socket', join(dir, 'none.sock'), '--token-file', tokenFile(dir), '--simulate-ungranted'], { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += chunk })
    const started = Date.now()
    assert.equal(await exitOf(child), 2)
    assert.ok(Date.now() - started >= 9_500, 'it waits the window')
    assert.match(stderr, /no driver connected within 10 s/)
  })

  it('refuses unknown arguments, a missing token and stdio for a run that could hold grants', () => {
    for (const args of [['--stdio'], ['--socket', '/tmp/x', '--token-file', '/tmp/t', '--grant-everything'], ['--stdio', '--token-file', '/tmp/t']]) {
      assert.throws(() => execFileSync(built.executable, args, { stdio: 'ignore' }), (error) => error.status === 64, args.join(' '))
    }
  })
})

describe('the peer boundary (D-029)', () => {
  it('serves a run that starts with no grant with every grant forced off, unchecked', async () => {
    if (JSON.parse(execFileSync(built.executable, ['--selftest']).toString()).preflight.screen) return // this host holds a grant: the refusal below covers it
    const helper = await socketHelper([])
    try {
      const hello = await helper.channel.hello()
      assert.deepEqual(hello.grants, { screen: false, accessibility: false, postEvents: false, listenEvents: false })
      assert.equal((await helper.channel.request('capture', { maxSize: SIZE })).code, 'not_granted')
      await helper.channel.request('bye')
      assert.equal(await exitOf(helper.child), 0)
    } finally {
      helper.close?.()
      helper.child.kill()
    }
  })

  it('refuses a driver that is not agent core\'s entry point before saying anything', async () => {
    // The pins name the real driver, as launch.mjs passes them; this test's own process is not that driver.
    const cli = join(HELPER_DIR, '..', '..', '..', '_tools_', 'agent-core', 'cli.mjs')
    const helper = await socketHelper(['--enforce-boundary', '--lock-path', join(privateDir(), 'helper.lock'), '--driver-node', process.execPath, '--driver-entry', cli])
    try {
      const said = []
      helper.socket.on('data', (chunk) => said.push(chunk))
      assert.equal(await exitOf(helper.child), 3)
      // This test's process is node running a test file (with the runner's flags): not an allowed entry point.
      assert.match(helper.stderr(), /peer pid \d+ refused: the peer/)
      assert.equal(Buffer.concat(said).length, 0, 'no hello, no token, nothing')
    } finally {
      helper.close?.()
      helper.child.kill()
    }
  })

  it('lets one helper that can hold grants run at a time', async () => {
    // A private lock, so this test and another seat's boundary helper never meet on the shared one.
    const lockPath = join(privateDir(), 'helper.lock')
    const holder = spawn('/usr/bin/lockf', ['-k', '-t', '0', lockPath, '/bin/sleep', '5'], { stdio: 'ignore' })
    try {
      await new Promise((resolve) => setTimeout(resolve, 300))
      const dir = privateDir()
      const child = spawn(built.executable, ['--socket', join(dir, 'h.sock'), '--token-file', tokenFile(dir), '--enforce-boundary', '--lock-path', lockPath], { stdio: ['ignore', 'ignore', 'pipe'] })
      let stderr = ''
      child.stderr.on('data', (chunk) => { stderr += chunk })
      assert.equal(await exitOf(child), 4)
      assert.match(stderr, /another helper is running/)
    } finally {
      holder.kill()
    }
  })
})

describe('dry run over stdio', () => {
  const world = {
    displays: [{ id: 3, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 640, height: 400 }, scale: 2 }],
    apps: [
      { bundleId: 'com.example.notes', pid: 700, rect: { x: 400, y: 0, width: 240, height: 120 }, title: 'Private notes' },
      { bundleId: 'ai.reflection.cu.fixture', pid: 501, rect: { x: 0, y: 0, width: 640, height: 400 }, title: 'CU Fixture' },
    ],
    frontmost: 'ai.reflection.cu.fixture',
  }

  function writeWorld(extra = {}) {
    const dir = privateDir()
    const path = join(dir, 'world.json')
    writeFileSync(path, JSON.stringify({ ...world, ...extra }))
    return { dir, path }
  }

  it('builds tagged events at the planned global points and records nothing it did not build', async () => {
    const { dir, path } = writeWorld()
    const eventsPath = join(dir, 'events.jsonl')
    const { child, channel } = stdioHelper(['--dry-run', '--world', path, '--events-out', eventsPath])
    try {
      const hello = await channel.hello()
      assert.equal(hello.mode, 'dry-run')
      assert.equal(hello.displays[0].scale, 2)
      await channel.request('scope', { bundleIds: ['ai.reflection.cu.fixture'] })
      await channel.request('pauseOnLocalInput', { on: true })
      const click = await channel.request('input', {
        mode: 'global', bundleId: 'ai.reflection.cu.fixture',
        events: [
          { kind: 'move', x: 100, y: 200, flags: 0 },
          { kind: 'down', button: 'left', x: 100, y: 200, clickCount: 1, flags: 0 },
          { kind: 'up', button: 'left', x: 100, y: 200, clickCount: 1, flags: 0 },
          { kind: 'text', text: 'hi' },
        ],
      })
      assert.equal(click.done, true)
      const refused = await channel.request('input', { mode: 'global', events: [{ kind: 'move', x: 500, y: 50, flags: 0 }] })
      assert.deepEqual([refused.code, refused.bundleId], ['out_of_scope', 'com.example.notes'])
      const lines = readFileSync(eventsPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
      assert.equal(lines.length, 5)
      assert.ok(lines.every((line) => line.event.tag === 0x43555345 && line.mode === 'global'))
      assert.deepEqual(lines.slice(0, 3).map((line) => [line.event.type, line.event.x, line.event.y]), [[5, 100, 200], [1, 100, 200], [2, 100, 200]])
      assert.equal(lines[3].event.text, 'hi')
      assert.equal(execFileSync('stat', ['-f', '%Lp', eventsPath]).toString().trim(), '600')
      const shot = await channel.request('capture', { display: 3, maxSize: SIZE })
      assert.deepEqual(pngSize(Buffer.from(shot.png, 'base64')), SIZE)
      assert.equal(shot.scale, 2)
      assert.ok(!JSON.stringify(shot).includes('Private notes'), 'no unapproved title in a capture reply')
      const element = await channel.request('hitTest', { xPt: 500, yPt: 50 })
      assert.deepEqual(element.element, { bundleId: 'com.example.notes', pid: 700, role: null, subrole: null, title: null, frame: null, secure: false, opaque: false, editable: null })
      await channel.request('bye')
      assert.equal(await exitOf(child), 0)
    } finally {
      child.kill()
    }
  })

  it('reports a person mid-batch as local_input with a localInput event, and releases what it held', async () => {
    const { dir, path } = writeWorld({ localInputAfter: 2 })
    const eventsPath = join(dir, 'events.jsonl')
    const { child, channel } = stdioHelper(['--dry-run', '--world', path, '--events-out', eventsPath])
    try {
      await channel.hello()
      await channel.request('scope', { bundleIds: ['ai.reflection.cu.fixture'] })
      await channel.request('pauseOnLocalInput', { on: true })
      const reply = await channel.request('input', {
        mode: 'global',
        events: [{ kind: 'down', button: 'left', x: 10, y: 10, clickCount: 1, flags: 0 }, { kind: 'drag', button: 'left', x: 40, y: 10, flags: 0 }, { kind: 'up', button: 'left', x: 40, y: 10, clickCount: 1, flags: 0 }],
      })
      assert.deepEqual([reply.ok, reply.done, reply.failedAt, reply.code], [true, false, 2, 'local_input'])
      assert.ok(channel.events.some((event) => event.event === 'localInput' && event.kind === 'key'))
      const types = readFileSync(eventsPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line).event.type)
      assert.deepEqual(types, [1, 6, 10, 11, 2], 'down, drag, then the release: Escape cancels the drag, then every down has its up (R86, Q-D12)')
      await channel.request('bye')
    } finally {
      child.kill()
    }
  })

  it('releases what it holds when it is told to quit (SIGTERM), before it goes', async () => {
    const { dir, path } = writeWorld()
    const eventsPath = join(dir, 'events.jsonl')
    const { child, channel } = stdioHelper(['--dry-run', '--world', path, '--events-out', eventsPath])
    try {
      await channel.hello()
      await channel.request('scope', { bundleIds: ['ai.reflection.cu.fixture'] })
      await channel.request('pauseOnLocalInput', { on: true })
      const held = await channel.request('input', { mode: 'global', events: [{ kind: 'keyDown', keyCode: 0x38, flags: 0x20000 }, { kind: 'down', button: 'left', x: 10, y: 10, clickCount: 1, flags: 0x20000 }] })
      assert.equal(held.done, true)
      child.kill('SIGTERM')
      assert.equal(await exitOf(child), 0)
      const types = readFileSync(eventsPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line).event.type)
      assert.deepEqual(types, [12, 1, 2, 12], 'Shift and the button go down, then up again in reverse on the way out (R86)')
    } finally {
      child.kill()
    }
  })

  it('refuses a world it cannot read, and an events file that exists', () => {
    const { dir, path } = writeWorld()
    writeFileSync(path, '{"displays":[{"id":1}]}')
    assert.throws(() => execFileSync(built.executable, ['--stdio', '--token-file', tokenFile(dir), '--dry-run', '--world', path], { stdio: 'ignore', input: '' }), (error) => error.status === 2)
    const good = writeWorld()
    const existing = join(good.dir, 'exists.jsonl')
    writeFileSync(existing, '')
    assert.throws(() => execFileSync(built.executable, ['--stdio', '--token-file', tokenFile(good.dir), '--dry-run', '--world', good.path, '--events-out', existing], { stdio: 'ignore', input: '' }), (error) => error.status === 2)
  })
})

describe('dry run over the socket', () => {
  it('captures by file in the run directory, named by path and sha256, as the driver reads them', async () => {
    const dir = privateDir()
    const worldPath = join(dir, 'world.json')
    writeFileSync(worldPath, JSON.stringify({ displays: [{ id: 2, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 320, height: 200 }, scale: 1 }] }))
    const helper = await socketHelper(['--dry-run', '--world', worldPath])
    try {
      await helper.channel.hello()
      await helper.channel.request('scope', { bundleIds: ['com.example.fixture'] })
      const shot = await helper.channel.request('capture', { maxSize: { width: 320, height: 200 }, simulateScale: 2 })
      assert.equal(shot.png, undefined)
      assert.match(shot.path, /\/capture-\d+-1\.png$/)
      assert.equal(execFileSync('stat', ['-f', '%Lp', shot.path]).toString().trim(), '600')
      const bytes = readFileSync(shot.path)
      assert.equal(createHash('sha256').update(bytes).digest('hex'), shot.sha256)
      assert.deepEqual(pngSize(bytes), { width: 320, height: 200 })
      assert.equal(shot.scale, 2)
      await helper.channel.request('bye')
    } finally {
      helper.close?.()
      helper.child.kill()
    }
  })
})

describe('contract with the driver link (helper-link.mjs)', () => {
  it('the driver accepts the hello and maps the refusals', async () => {
    const { createHelperServer } = await import('../../_environments_/macos-desktop/helper-link.mjs')
    // The driver checks its peer too (red team B5): the real helper at its absolute path, by its code requirement.
    const server = await createHelperServer({ parentDir: privateDir(), helperExecutable: built.executable })
    const child = spawn(built.executable, ['--socket', server.socketPath, '--token-file', server.tokenPath, '--simulate-ungranted'], { stdio: 'ignore' })
    try {
      const link = await server.accept({ timeoutMs: 10_000 })
      assert.equal(link.hello.protocol, 1)
      await assert.rejects(link.request('capture', { maxSize: SIZE }), (error) => error.code === 'not_granted')
      await assert.rejects(link.request('scope', { bundleIds: ['com.apple.Terminal'] }), (error) => error.code === 'blocked_by_policy')
      const scope = await link.request('scope', { bundleIds: ['ai.reflection.cu.fixture'] })
      assert.deepEqual(scope.bundleIds, ['ai.reflection.cu.fixture'])
      await link.request('bye', {})
      assert.equal(await exitOf(child), 0)
    } finally {
      child.kill()
      await server.close()
    }
  })
})

// CU-51: Retina scale 2 and two displays, proven in the dry run (the Mac has one scale-1 display today). The main
// display is Retina at the origin; a scale-1 display sits to its left (negative x) and is taller, so the strip below
// the main display (x 0..1440, y 900..1080) is on no display - the dead zone a click must never be clamped into.
describe('multi-display dry run (CU-51)', () => {
  const FIXTURE = 'ai.reflection.cu.fixture'
  const NOTES = 'com.example.notes'
  const MAIN = { id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 1440, height: 900 }, scale: 2 }
  const LEFT = { id: 2, originPt: { x: -1920, y: 0 }, sizePt: { width: 1920, height: 1080 }, scale: 1 }

  function twoDisplays(dir, extra = {}) {
    writeFileSync(join(dir, 'fixture.png'), solidPng(800, 600, [0, 200, 0]))
    writeFileSync(join(dir, 'status.png'), solidPng(40, 20, [255, 0, 255]))
    return {
      grants: { screen: true, accessibility: true, postEvents: true, listenEvents: false },
      displays: [MAIN, LEFT],
      apps: [
        { bundleId: NOTES, pid: 700, rect: { x: -1000, y: 300, width: 300, height: 200 } },
        { bundleId: FIXTURE, pid: 800, rect: { x: -1800, y: 100, width: 800, height: 600 }, image: join(dir, 'fixture.png') },
      ],
      frontmost: FIXTURE,
      ...extra,
    }
  }

  async function withHelper(world, body) {
    const dir = privateDir()
    const path = join(dir, 'world.json')
    const eventsPath = join(dir, 'events.jsonl')
    writeFileSync(path, JSON.stringify(typeof world === 'function' ? world(dir) : world))
    const { child, channel } = stdioHelper(['--dry-run', '--world', path, '--events-out', eventsPath])
    const events = () => (existsSync(eventsPath) ? readFileSync(eventsPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)).filter((line) => line.event) : [])
    try {
      const hello = await channel.hello()
      assert.equal(hello.mode, 'dry-run')
      return await body(channel, events, hello)
    } finally {
      child.kill()
    }
  }

  it('hello lists both displays with their global origins and scales', async () => {
    await withHelper((dir) => twoDisplays(dir), async (channel, events, hello) => {
      assert.deepEqual(hello.displays.map((d) => [d.id, d.main, d.originPt.x, d.originPt.y, d.sizePt.width, d.sizePt.height, d.scale]),
        [[1, true, 0, 0, 1440, 900, 2], [2, false, -1920, 0, 1920, 1080, 1]])
    })
  })

  it('captures the negative-origin display at its own points: size, origin, the approved window where it is and the unapproved one black', async () => {
    await withHelper((dir) => twoDisplays(dir), async (channel) => {
      await channel.request('scope', { bundleIds: [FIXTURE] })
      const shot = await channel.request('capture', { display: 2, maxSize: { width: 1920, height: 1080 } })
      assert.deepEqual([shot.display, shot.widthPx, shot.heightPx, shot.scale, shot.originPt.x, shot.originPt.y, shot.sizePt.width, shot.sizePt.height], [2, 1920, 1080, 1, -1920, 0, 1920, 1080])
      assert.deepEqual(shot.windows.map((w) => [w.bundleId, w.frame.x, w.frame.y]), [[FIXTURE, -1800, 100]], 'window frames are not in global points')
      const image = decodePng(Buffer.from(shot.png, 'base64'))
      const at = (x, y) => image.pixel(Math.round((x - shot.originPt.x) * image.width / shot.sizePt.width), Math.round((y - shot.originPt.y) * image.height / shot.sizePt.height)).slice(0, 3)
      assert.deepEqual(at(-1500, 200), [0, 200, 0], 'CU Fixture is not drawn at its global place on the left display')
      assert.deepEqual(at(-850, 400), [0, 0, 0], 'the unapproved window on the left display is not black')
    })
  })

  it('captures the Retina display at twice its points and a region at twice the region', async () => {
    await withHelper((dir) => twoDisplays(dir, { apps: [{ bundleId: FIXTURE, pid: 800, rect: { x: 100, y: 100, width: 800, height: 600 }, image: join(dir, 'fixture.png') }] }), async (channel) => {
      await channel.request('scope', { bundleIds: [FIXTURE] })
      const full = await channel.request('capture', { display: 1, maxSize: { width: 4000, height: 4000 } })
      assert.deepEqual([full.widthPx, full.heightPx, full.scale], [2880, 1800, 2])
      const region = await channel.request('capture', { display: 1, maxSize: { width: 4000, height: 4000 }, region: { x: 200, y: 150, width: 300, height: 200 } })
      assert.deepEqual([region.widthPx, region.heightPx, region.originPt.x, region.originPt.y], [600, 400, 200, 150])
      const image = decodePng(Buffer.from(region.png, 'base64'))
      assert.deepEqual(image.pixel(300, 200).slice(0, 3), [0, 200, 0], 'the Retina region is not CU Fixture')
    })
  })

  it('refuses a capture region that leaves the display, and one on the other display', async () => {
    await withHelper((dir) => twoDisplays(dir), async (channel) => {
      await channel.request('scope', { bundleIds: [FIXTURE] })
      const spanning = await channel.request('capture', { display: 1, maxSize: { width: 800, height: 800 }, region: { x: -100, y: 100, width: 300, height: 200 } })
      assert.equal(spanning.code, 'invalid_argument', JSON.stringify(spanning))
      const elsewhere = await channel.request('capture', { display: 1, maxSize: { width: 800, height: 800 }, region: { x: -1500, y: 100, width: 300, height: 200 } })
      assert.equal(elsewhere.code, 'invalid_argument', JSON.stringify(elsewhere))
    })
  })

  it('leaves the left display\'s menu bar out: its status item never shows, while the main display keeps only the app\'s own titles', async () => {
    const world = (dir) => twoDisplays(dir, {
      menuBar: [{ bundleId: FIXTURE, frame: { x: 10, y: 2, width: 60, height: 20 } }],
      menuBarStrip: { x: 0, y: 0, width: 1440, height: 24 },
      // With separate Spaces the left display draws a bar too; its status item is in the marker colour.
      statusItems: [{ frame: { x: -100, y: 2, width: 40, height: 20 }, image: join(dir, 'status.png') }, { frame: { x: 1300, y: 2, width: 40, height: 20 }, image: join(dir, 'status.png') }],
    })
    await withHelper(world, async (channel) => {
      await channel.request('scope', { bundleIds: [FIXTURE] })
      const markers = (shot) => {
        const image = decodePng(Buffer.from(shot.png, 'base64'))
        let count = 0
        for (let y = 0; y < Math.ceil(30 * image.height / shot.sizePt.height); y += 1) {
          for (let x = 0; x < image.width; x += 1) {
            const [r, g, b] = image.pixel(x, y)
            if (r > 200 && g < 60 && b > 200) count += 1
          }
        }
        return { count, image }
      }
      const left = markers(await channel.request('capture', { display: 2, maxSize: { width: 1920, height: 1080 } }))
      assert.equal(left.count, 0, `${left.count} status-item pixels reached the left display's capture`)
      const mainShot = await channel.request('capture', { display: 1, maxSize: { width: 1440, height: 900 } })
      const main = markers(mainShot)
      assert.equal(main.count, 0, `${main.count} status-item pixels reached the main display's capture`)
      assert.ok(main.image.pixel(40, 12).slice(0, 3).every((v) => v > 200), 'the approved app\'s own menu title is not shown on the main display')
    })
  })

  it('watch takes a region (CU-83): every frame shows that region at the display scale; a region off the display is refused', async () => {
    await withHelper((dir) => twoDisplays(dir, { apps: [{ bundleId: FIXTURE, pid: 800, rect: { x: 100, y: 100, width: 800, height: 600 }, image: join(dir, 'fixture.png') }] }), async (channel) => {
      await channel.request('scope', { bundleIds: [FIXTURE] })
      const refused = await channel.request('watch', { fps: 5, region: { x: -500, y: 100, width: 300, height: 200 } })
      assert.deepEqual([refused.code, refused.field], ['invalid_argument', 'region'], JSON.stringify(refused))
      const started = await channel.request('watch', { fps: 5, maxSize: { width: 4000, height: 4000 }, region: { x: 100, y: 100, width: 800, height: 600 } })
      assert.notEqual(started.ok, false, JSON.stringify(started))
      const deadline = Date.now() + 5000
      while (!channel.events.some((e) => e.event === 'frame') && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50))
      await channel.request('unwatch')
      const frame = channel.events.find((e) => e.event === 'frame')
      assert.ok(frame, 'no frame arrived')
      assert.deepEqual([frame.originPt.x, frame.originPt.y, frame.sizePt.width, frame.sizePt.height, frame.widthPx, frame.heightPx], [100, 100, 800, 600, 1600, 1200])
    })
  })

  it('refuses a click in the dead zone between displays of different sizes and builds nothing', async () => {
    await withHelper((dir) => twoDisplays(dir), async (channel, events) => {
      await channel.request('scope', { bundleIds: [FIXTURE] })
      await channel.request('pauseOnLocalInput', { on: true })
      const reply = await channel.request('input', { mode: 'global', bundleId: FIXTURE, events: [
        { kind: 'move', x: 500, y: 1000, flags: 0 }, { kind: 'down', button: 'left', x: 500, y: 1000, clickCount: 1, flags: 0 }, { kind: 'up', button: 'left', x: 500, y: 1000, clickCount: 1, flags: 0 },
      ] })
      assert.notEqual(reply.done, true, JSON.stringify(reply))
      assert.deepEqual(events(), [], 'events were built for a point on no display')
    })
  })

  it('stops a held drag whose path crosses the dead zone before it gets there, with nothing left held', async () => {
    await withHelper((dir) => twoDisplays(dir, { apps: [{ bundleId: FIXTURE, pid: 800, rect: { x: -1900, y: 0, width: 1900, height: 1080 } }, { bundleId: 'ai.reflection.cu.ledger', pid: 801, rect: { x: 0, y: 0, width: 1440, height: 900 } }] }), async (channel, events) => {
      await channel.request('scope', { bundleIds: [FIXTURE, 'ai.reflection.cu.ledger'] })
      await channel.request('pauseOnLocalInput', { on: true })
      const reply = await channel.request('input', { mode: 'global', bundleId: FIXTURE, events: [
        { kind: 'move', x: -300, y: 1000, flags: 0 }, { kind: 'down', button: 'left', x: -300, y: 1000, clickCount: 1, flags: 0 },
        { kind: 'move', x: 300, y: 1000, flags: 0 }, { kind: 'move', x: 300, y: 600, flags: 0 }, { kind: 'up', button: 'left', x: 300, y: 600, clickCount: 1, flags: 0 },
      ] })
      assert.notEqual(reply.done, true, JSON.stringify(reply))
      const built = events()
      assert.ok(!built.some(({ event }) => event.x >= 0 && event.y > 900), `an event was built in the dead zone: ${JSON.stringify(built.map(({ event }) => [event.type, event.x, event.y]))}`)
      const downs = built.filter(({ event }) => event.type === 1).length
      const ups = built.filter(({ event }) => event.type === 2).length
      assert.equal(downs, ups, 'a button was left held')
    })
  })

  it('names the display that holds a straddling window\'s centre as the scope\'s display, as live', async () => {
    await withHelper((dir) => twoDisplays(dir, { apps: [{ bundleId: FIXTURE, pid: 800, rect: { x: -1000, y: 100, width: 1200, height: 600 } }] }), async (channel) => {
      const scope = await channel.request('scope', { bundleIds: [FIXTURE] })
      assert.equal(scope.display, 2, JSON.stringify(scope))
    })
  })
})

// CU-76: a system-presented privacy/permission prompt is the person's. The dry run declares the three shapes the
// helper recognises from structure: a window owned by a system prompt process (UserNotificationCenter), another
// process's view drawn inside an approved window whose executable is in the system, and an AXSystemDialog sheet in the
// approved app's own process. Targets carry systemPrompt, input to one is refused system_prompt, captures report one.
describe('system prompts (CU-76)', () => {
  const FIXTURE = 'ai.reflection.cu.fixture'
  const UNC = 'com.apple.UserNotificationCenter'
  const VIEW = 'com.apple.example.permissionViewService'
  const PANEL = 'com.apple.appkit.xpc.openAndSavePanelService'
  const base = (extra = {}) => ({
    grants: { screen: true, accessibility: true, postEvents: true, listenEvents: false },
    displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 1920, height: 1080 }, scale: 1 }],
    apps: [
      { bundleId: FIXTURE, pid: 800, rect: { x: 100, y: 100, width: 800, height: 600 } },
      { bundleId: VIEW, pid: 900, rect: { x: 5000, y: 5000, width: 10, height: 10 }, executable: '/System/Library/PrivateFrameworks/Example.framework/XPCServices/PermissionView.xpc/Contents/MacOS/PermissionView' },
      { bundleId: PANEL, pid: 901, rect: { x: 5000, y: 5000, width: 10, height: 10 }, executable: '/System/Library/Frameworks/AppKit.framework/Versions/C/XPCServices/com.apple.appkit.xpc.openAndSavePanelService.xpc/Contents/MacOS/com.apple.appkit.xpc.openAndSavePanelService' },
    ],
    elements: [
      // An AXSystemDialog sheet in CU Fixture's own process: its button.
      { rect: { x: 200, y: 200, width: 80, height: 24 }, element: { bundleId: FIXTURE, pid: 800, role: 'AXButton', title: 'Allow', ancestors: [{ role: 'AXSheet', subrole: 'AXSystemDialog' }, { role: 'AXWindow' }] } },
      // A system view service's content drawn inside CU Fixture's window.
      { rect: { x: 400, y: 200, width: 80, height: 24 }, element: { bundleId: VIEW, pid: 900, role: 'AXButton', title: 'Allow Paste' } },
      // An ordinary button of CU Fixture.
      { rect: { x: 600, y: 200, width: 80, height: 24 }, element: { bundleId: FIXTURE, pid: 800, role: 'AXButton', title: 'Record', ancestors: [{ role: 'AXWindow' }] } },
    ],
    frontmost: FIXTURE,
    ...extra,
  })
  const click = (x, y) => [{ kind: 'move', x, y, flags: 0 }, { kind: 'down', button: 'left', x, y, clickCount: 1, flags: 0 }, { kind: 'up', button: 'left', x, y, clickCount: 1, flags: 0 }]

  async function withWorld(world, body) {
    const dir = privateDir()
    const path = join(dir, 'world.json')
    const eventsPath = join(dir, 'events.jsonl')
    writeFileSync(path, JSON.stringify(world))
    const { child, channel } = stdioHelper(['--dry-run', '--world', path, '--events-out', eventsPath])
    const built = () => (existsSync(eventsPath) ? readFileSync(eventsPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)).filter((line) => line.event) : [])
    try {
      await channel.hello()
      await channel.request('scope', { bundleIds: [FIXTURE] })
      await channel.request('pauseOnLocalInput', { on: true })
      return await body(channel, built)
    } finally {
      child.kill()
    }
  }

  it('marks a target in an AXSystemDialog sheet, in a system view service inside the window, and in a prompt process window - never an ordinary one', async () => {
    const world = base({ apps: [...base().apps, { bundleId: UNC, pid: 950, rect: { x: 1200, y: 100, width: 260, height: 300 }, layer: 8 }] })
    await withWorld(world, async (channel) => {
      const at = async (x, y) => (await channel.request('hitTest', { xPt: x, yPt: y })).element
      const dialog = await at(210, 210)
      assert.deepEqual([dialog.bundleId, dialog.role, dialog.systemPrompt], [FIXTURE, 'AXButton', true], JSON.stringify(dialog))
      const view = await at(410, 210)
      assert.equal(view.systemPrompt, true, JSON.stringify(view))
      assert.equal(view.title, null, 'a foreign view is owner-only')
      const owner = await at(1300, 200)
      assert.deepEqual([owner.bundleId, owner.systemPrompt, owner.title], [UNC, true, null])
      const plain = await at(610, 210)
      assert.equal(plain.systemPrompt, undefined, JSON.stringify(plain))
    })
  })

  it('refuses a click on a system prompt with system_prompt and builds nothing; an ordinary button still takes it', async () => {
    await withWorld(base(), async (channel, built) => {
      for (const [x, y] of [[210, 210], [410, 210]]) {
        const refused = await channel.request('input', { mode: 'global', bundleId: FIXTURE, events: click(x, y) })
        assert.equal(refused.code, 'system_prompt', JSON.stringify(refused))
        assert.match(refused.message, /system permission prompt/)
      }
      assert.deepEqual(built(), [], 'events were built for a click on a system prompt')
      const ok = await channel.request('input', { mode: 'global', bundleId: FIXTURE, events: click(610, 210) })
      assert.equal(ok.done, true, JSON.stringify(ok))
    })
  })

  it('refuses keys while a system prompt has the keyboard focus, and types when an ordinary field has it', async () => {
    const prompt = base({ focused: { bundleId: FIXTURE, pid: 800, role: 'AXButton', title: 'Allow', ancestors: [{ role: 'AXSheet', subrole: 'AXSystemDialog' }] } })
    await withWorld(prompt, async (channel, built) => {
      for (const events of [[{ kind: 'keyDown', keyCode: 36, flags: 0 }, { kind: 'keyUp', keyCode: 36, flags: 0 }], [{ kind: 'text', text: 'yes' }]]) {
        const refused = await channel.request('input', { mode: 'global', bundleId: FIXTURE, events })
        assert.equal(refused.code, 'system_prompt', JSON.stringify(refused))
      }
      assert.deepEqual(built(), [])
      assert.equal((await channel.request('focused')).element.systemPrompt, true)
    })
    const field = base({ focused: { bundleId: FIXTURE, pid: 800, role: 'AXTextField', title: 'Invoice' } })
    await withWorld(field, async (channel) => {
      const typed = await channel.request('input', { mode: 'global', bundleId: FIXTURE, events: [{ kind: 'text', text: 'INV-1' }] })
      assert.equal(typed.done, true, JSON.stringify(typed))
    })
  })

  it('refuses keys while a prompt can take them even with the focus elsewhere (an AXSystemDialog window of the front app); an alert merely overlapping the window does not stop typing', async () => {
    const field = { bundleId: FIXTURE, pid: 800, role: 'AXTextField', title: 'Invoice' }
    const sheet = base({ focused: field, apps: [{ bundleId: FIXTURE, pid: 800, rect: { x: 100, y: 100, width: 800, height: 600 }, subrole: 'AXSystemDialog' }] })
    await withWorld(sheet, async (channel, built) => {
      const refused = await channel.request('input', { mode: 'global', bundleId: FIXTURE, events: [{ kind: 'keyDown', keyCode: 36, flags: 0 }, { kind: 'keyUp', keyCode: 36, flags: 0 }] })
      assert.equal(refused.code, 'system_prompt', JSON.stringify(refused))
      assert.deepEqual(built(), [])
    })
    // cu-verifier: this Mac's notification alerts sat over task windows through dozens of runs that typed fine.
    const over = base({ focused: field, apps: [...base().apps, { bundleId: UNC, pid: 950, rect: { x: 700, y: 150, width: 260, height: 300 }, layer: 8 }] })
    await withWorld(over, async (channel) => {
      assert.equal((await channel.request('input', { mode: 'global', bundleId: FIXTURE, events: [{ kind: 'text', text: 'ok' }] })).done, true, 'an alert overlapping the approved window blocked typing')
    })
  })

  it('the open/save panel service drawn inside the window is not a system prompt (it is attributed, CU-39)', async () => {
    const world = base({ elements: [{ rect: { x: 400, y: 200, width: 80, height: 24 }, element: { bundleId: PANEL, pid: 901, role: 'AXButton', title: 'Save' } }] })
    await withWorld(world, async (channel) => {
      const hit = (await channel.request('hitTest', { xPt: 410, yPt: 210 })).element
      assert.equal(hit.systemPrompt, undefined, JSON.stringify(hit))
    })
  })

  it('a capture reports systemPrompt only while a prompt can take keys: the front app is a prompt process, or the front approved app shows an AXSystemDialog window - not for an alert merely overlapping', async () => {
    const unc = { bundleId: UNC, pid: 950, rect: { x: 800, y: 150, width: 260, height: 300 }, layer: 8 }
    const shot = async (channel) => (await channel.request('capture', { display: 1, maxSize: { width: 1920, height: 1080 } })).systemPrompt
    await withWorld(base({ apps: [...base().apps, unc] }), async (channel) => assert.equal(await shot(channel), false, 'an overlapping alert that is not in front'))
    await withWorld(base({ apps: [...base().apps, unc], frontmost: UNC }), async (channel) => assert.equal(await shot(channel), true, 'a prompt process in front'))
    await withWorld(base({ apps: [{ bundleId: FIXTURE, pid: 800, rect: { x: 100, y: 100, width: 800, height: 600 }, subrole: 'AXSystemDialog' }] }), async (channel) => assert.equal(await shot(channel), true, 'the front app shows a system dialog'))
  })
})

// CU-64: the hold step - nothing posted, the keys stay down for ms, interruptible by the person's input or another app
// in front, everything released in reverse; the held-keys marker for a helper killed mid-hold; the cursor request.
describe('holds and the cursor (CU-64)', () => {
  const FIXTURE = 'ai.reflection.cu.fixture'
  const SHIFT = 56
  const world = (extra = {}) => ({
    grants: { screen: true, accessibility: true, postEvents: true, listenEvents: false },
    displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 1920, height: 1080 }, scale: 1 }],
    apps: [{ bundleId: FIXTURE, pid: 800, rect: { x: 100, y: 100, width: 800, height: 600 } }, { bundleId: 'com.example.notes', pid: 700, rect: { x: 1000, y: 100, width: 400, height: 300 } }],
    frontmost: FIXTURE,
    ...extra,
  })
  const shiftHold = (ms) => [{ kind: 'keyDown', keyCode: SHIFT, flags: 0x20000 }, { kind: 'hold', ms }, { kind: 'keyUp', keyCode: SHIFT, flags: 0 }]

  async function withHelper(declared, body, { marker } = {}) {
    const dir = privateDir()
    const path = join(dir, 'world.json')
    const eventsPath = join(dir, 'events.jsonl')
    const markerPath = marker ?? join(dir, 'held-keys.json')
    writeFileSync(path, JSON.stringify(declared))
    const { child, channel } = stdioHelper(['--dry-run', '--world', path, '--events-out', eventsPath, '--held-marker', markerPath])
    const posted = () => (existsSync(eventsPath) ? readFileSync(eventsPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)).filter((line) => line.event).map((line) => line.event) : [])
    try {
      const hello = await channel.hello()
      await channel.request('scope', { bundleIds: [FIXTURE] })
      await channel.request('pauseOnLocalInput', { on: true })
      return await body({ channel, posted, markerPath, hello, child })
    } finally {
      child.kill()
    }
  }
  // A modifier goes out as a flagsChanged event (type 12): its flags say whether it is down.
  const keys = (events) => events.filter((e) => e.type === 12 || e.keyCode !== undefined).map((e) => (e.type === 12 ? ['flags', e.flags] : [e.type, e.keyCode]))
  const SHIFT_DOWN_UP = [['flags', 0x20000], ['flags', 0]]

  it('a hold keeps the key down for its time, posts nothing itself, then the up; the marker exists only while it holds', async () => {
    await withHelper(world(), async ({ channel, posted, markerPath }) => {
      const started = Date.now()
      const pending = channel.request('input', { mode: 'global', bundleId: FIXTURE, events: shiftHold(800) })
      await new Promise((r) => setTimeout(r, 300))
      const during = existsSync(markerPath) ? JSON.parse(readFileSync(markerPath, 'utf8')) : null
      const reply = await pending
      const took = Date.now() - started
      assert.equal(reply.done, true, JSON.stringify(reply))
      assert.ok(took >= 780, `the hold ended after ${took} ms`)
      assert.deepEqual(keys(posted()), SHIFT_DOWN_UP, 'a down, then its up - nothing posted for the hold')
      assert.deepEqual(during && [during.keys, during.buttons], [[SHIFT], []], `the marker during the hold: ${JSON.stringify(during)}`)
      assert.ok(!existsSync(markerPath), 'the marker outlived the hold')
    })
  })

  it('the person acting mid-hold stops it within a slice: Shift comes up, the reply says local_input with the held keys, the marker is gone', async () => {
    await withHelper(world({ localInputAfter: 1 }), async ({ channel, posted, markerPath }) => {
      const started = Date.now()
      const reply = await channel.request('input', { mode: 'global', bundleId: FIXTURE, events: shiftHold(5000) })
      const took = Date.now() - started
      assert.deepEqual([reply.done, reply.code, reply.failedAt], [false, 'local_input', 1], JSON.stringify(reply))
      assert.deepEqual(reply.heldKeys, [SHIFT])
      assert.ok(took < 1000, `a 5 s hold stopped after ${took} ms`)
      assert.deepEqual(keys(posted()), SHIFT_DOWN_UP, 'Shift was not released')
      assert.ok(!existsSync(markerPath), 'the marker outlived the release')
    })
  })

  it('R4: the person acting 300 ms into a 5 s hold stops it inside the hold within ~100 ms: local_input, heldKeys, Shift up', async () => {
    await withHelper(world({ localInputAfterMs: 300 }), async ({ channel, posted, markerPath }) => {
      const started = Date.now()
      const reply = await channel.request('input', { mode: 'global', bundleId: FIXTURE, events: shiftHold(5000) })
      const took = Date.now() - started
      assert.deepEqual([reply.done, reply.code, reply.failedAt, reply.heldKeys], [false, 'local_input', 1, [SHIFT]], JSON.stringify(reply))
      assert.ok(took >= 280 && took < 450, `the hold stopped after ${took} ms (the person acted at 300 ms)`)
      assert.deepEqual(keys(posted()), SHIFT_DOWN_UP)
      assert.ok(!existsSync(markerPath))
    })
  })

  it('a drag marks its held button from the down on: a helper killed mid-path leaves the button in the marker, and the next start releases it', async () => {
    const dir = privateDir()
    const marker = join(dir, 'held-keys.json')
    const drag = [
      { kind: 'move', x: 200, y: 200, flags: 0 }, { kind: 'down', button: 'left', x: 200, y: 200, clickCount: 1, flags: 0 },
      { kind: 'drag', button: 'left', x: 300, y: 200, flags: 0 }, { kind: 'hold', ms: 4000 },
      { kind: 'drag', button: 'left', x: 400, y: 200, flags: 0 }, { kind: 'up', button: 'left', x: 400, y: 200, clickCount: 1, flags: 0 },
    ]
    await withHelper(world(), async ({ channel, child }) => {
      channel.request('input', { mode: 'global', bundleId: FIXTURE, events: drag }).catch(() => {})
      await new Promise((r) => setTimeout(r, 500))
      const during = JSON.parse(readFileSync(marker, 'utf8'))
      assert.deepEqual([during.keys, during.buttons], [[], ['left']], JSON.stringify(during))
      child.kill('SIGKILL')
      await exitOf(child)
    }, { marker })
    assert.ok(existsSync(marker), 'the killed helper left no marker')
    await withHelper(world(), async ({ channel, posted }) => {
      const event = channel.events.find((e) => e.event === 'releasedStale')
      assert.deepEqual(event && [event.buttons, event.posted], [['left'], 1], JSON.stringify(channel.events))
      assert.ok(posted().some((e) => e.type === 2), 'the left button did not come up')
      assert.ok(!existsSync(marker))
    }, { marker })
  })

  it('another app coming to the front mid-hold stops it (the keys would apply to that app): released, out_of_scope', async () => {
    await withHelper(world({ frontmostAfter: { steps: 1, bundleId: 'com.example.notes' } }), async ({ channel, posted }) => {
      const reply = await channel.request('input', { mode: 'global', bundleId: FIXTURE, events: shiftHold(5000) })
      assert.deepEqual([reply.done, reply.code, reply.failedAt, reply.bundleId], [false, 'out_of_scope', 1, 'com.example.notes'], JSON.stringify(reply))
      assert.deepEqual(keys(posted()), SHIFT_DOWN_UP)
    })
  })

  it('more than 10 s of holding in one request is refused before anything is posted', async () => {
    await withHelper(world(), async ({ channel, posted }) => {
      const reply = await channel.request('input', { mode: 'global', bundleId: FIXTURE, events: [...shiftHold(6000).slice(0, 2), { kind: 'hold', ms: 4500 }, shiftHold(1)[2]] })
      assert.equal(reply.code, 'invalid_argument', JSON.stringify(reply))
      assert.deepEqual(posted(), [])
    })
  })

  it('at start, a marker left by a helper that is gone is released first and reported after the first request; a live owner\'s marker is left alone', async () => {
    const dir = privateDir()
    const marker = join(dir, 'held-keys.json')
    writeFileSync(marker, JSON.stringify({ pid: 999999, keys: [SHIFT, 59], buttons: ['left'] }))
    await withHelper(world(), async ({ hello, posted, channel }) => {
      assert.equal(hello.releasedStale, undefined, 'the hello keeps the fields the driver checks')
      // withHelper has sent scope and pauseOnLocalInput by now: the event follows the first request, never before it.
      const event = channel.events.find((e) => e.event === 'releasedStale')
      assert.deepEqual(event && [event.keys, event.buttons, event.posted], [[SHIFT, 59], ['left'], 3], JSON.stringify(channel.events))
      const released = posted()
      assert.equal(released.filter((e) => e.type === 12 && e.flags === 0).length, 2, `both modifiers released: ${JSON.stringify(released)}`)
      assert.ok(released.some((e) => e.type === 2), 'the left button came up')
      assert.ok(!existsSync(marker), 'the stale marker stays')
    }, { marker })
    // Released by a helper that died before its first request: the next one reports it without posting the ups again.
    writeFileSync(marker, JSON.stringify({ pid: 999999, keys: [SHIFT], buttons: [], released: true }))
    await withHelper(world(), async ({ posted, channel }) => {
      const event = channel.events.find((e) => e.event === 'releasedStale')
      assert.deepEqual(event && [event.keys, event.posted], [[SHIFT], 0], JSON.stringify(channel.events))
      assert.deepEqual(posted(), [], 'the ups were posted twice')
      assert.ok(!existsSync(marker))
    }, { marker })
    writeFileSync(marker, JSON.stringify({ pid: process.pid, keys: [SHIFT], buttons: [] }))
    await withHelper(world(), async ({ hello, posted, channel }) => {
      assert.ok(!channel.events.some((e) => e.event === 'releasedStale'))
      assert.deepEqual(posted(), [])
      assert.ok(existsSync(marker), "another live helper's marker was taken")
    }, { marker })
  })

  it('a helper killed after posting the stale ups but before its first request leaves a released marker: the next one posts no ups and reports once', async () => {
    const dir = privateDir()
    const marker = join(dir, 'held-keys.json')
    const worldPath = join(dir, 'world.json')
    writeFileSync(worldPath, JSON.stringify(world()))
    writeFileSync(marker, JSON.stringify({ pid: 999999, keys: [SHIFT], buttons: [] }))
    // The first helper: hello only, no request - it posts the ups at start, then dies before the driver accepts it.
    const firstEvents = join(dir, 'first.jsonl')
    const first = stdioHelper(['--dry-run', '--world', worldPath, '--events-out', firstEvents, '--held-marker', marker])
    await first.channel.hello()
    const deadline = Date.now() + 3000
    while (!(existsSync(marker) && JSON.parse(readFileSync(marker, 'utf8')).released) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20))
    assert.equal(JSON.parse(readFileSync(marker, 'utf8')).released, true, 'the marker was not rewritten released')
    assert.ok(readFileSync(firstEvents, 'utf8').includes('"type":12'), 'the first helper did not post the ups')
    assert.ok(!first.channel.events.some((e) => e.event === 'releasedStale'), 'the report went out before any request')
    first.child.kill('SIGKILL')
    await exitOf(first.child)
    // The next helper: no ups again, one report after its first request, marker gone.
    await withHelper(world(), async ({ channel, posted }) => {
      const reports = channel.events.filter((e) => e.event === 'releasedStale')
      assert.deepEqual(reports.map((e) => [e.keys, e.posted]), [[[SHIFT], 0]], JSON.stringify(channel.events))
      assert.deepEqual(posted(), [], 'the ups were posted again')
      assert.ok(!existsSync(marker))
    }, { marker })
  })

  it('cursor answers the pointer in global points and the display it is on', async () => {
    await withHelper(world(), async ({ channel }) => {
      const reply = await channel.request('cursor')
      assert.deepEqual([reply.xPt, reply.yPt, reply.display], [1, 1, 1], JSON.stringify(reply))
    })
  })
})

// CU-82: bringing the target forward races macOS activation. The target counts as in front only when two reads 50 ms
// apart agree, within 1.5 s, whatever the activation call answered; the first step waits up to 300 ms through a flip back.
describe('activation settles before input (CU-82)', () => {
  const FIXTURE = 'ai.reflection.cu.fixture'
  const NOTES = 'com.example.notes'
  const world = (extra = {}) => ({
    grants: { screen: true, accessibility: true, postEvents: true, listenEvents: false },
    displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 1920, height: 1080 }, scale: 1 }],
    apps: [{ bundleId: FIXTURE, pid: 800, rect: { x: 100, y: 100, width: 800, height: 600 } }, { bundleId: NOTES, pid: 700, rect: { x: 1000, y: 100, width: 400, height: 300 } }],
    frontmost: NOTES,
    ...extra,
  })
  const key = [{ kind: 'keyDown', keyCode: 0, flags: 0 }, { kind: 'keyUp', keyCode: 0, flags: 0 }]
  async function run(declared) {
    const dir = privateDir()
    const path = join(dir, 'world.json')
    const eventsPath = join(dir, 'events.jsonl')
    writeFileSync(path, JSON.stringify(declared))
    const { child, channel } = stdioHelper(['--dry-run', '--world', path, '--events-out', eventsPath])
    // CU-103: the dry run logs each front read during the input; read once the child has closed, so none arrives late.
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += chunk })
    const closed = new Promise((done) => child.once('close', done))
    let result
    try {
      await channel.hello()
      await channel.request('scope', { bundleIds: [FIXTURE] })
      await channel.request('pauseOnLocalInput', { on: true })
      const started = Date.now()
      const reply = await channel.request('input', { mode: 'global', bundleId: FIXTURE, events: key })
      const posted = existsSync(eventsPath) ? readFileSync(eventsPath, 'utf8').trim().split('\n').filter(Boolean).length : 0
      result = { reply, took: Date.now() - started, posted }
    } finally {
      child.kill()
      await closed
    }
    const frontReads = [...stderr.matchAll(/dry-run: front read (\S+)/g)].map((m) => m[1])
    return { ...result, frontReads }
  }

  it('an app that comes forward 900 ms after the call (longer than the call waits) still takes the input', async () => {
    const { reply, took, posted } = await run(world({ activationLagMs: 900 }))
    assert.equal(reply.done, true, JSON.stringify(reply))
    assert.ok(took >= 900 && took < 1500, `took ${took} ms`)
    assert.equal(posted, 2)
  })

  it('one read with the target in front is not settled: it blinks forward once, gives the front back for 600 ms, then stays - the input waits for it', async () => {
    const { reply, took, posted } = await run(world({ activationBlinkMs: 600 }))
    assert.equal(reply.done, true, JSON.stringify(reply))
    assert.ok(took >= 600, `settled after ${took} ms - on a single read`)
    assert.equal(posted, 2)
  })

  it('a flip back to the previous app right at the first step is waited through, not refused', async () => {
    const { reply, posted, frontReads } = await run(world({ activationFlip: true }))
    assert.equal(reply.done, true, JSON.stringify(reply))
    assert.equal(posted, 2)
    // CU-103: the flip really happened - the first step's check found the previous app, exactly once, then the target.
    assert.equal(frontReads[0], NOTES, `the first read during the input found ${frontReads[0]}: ${frontReads.join(', ')}`)
    assert.equal(frontReads.filter((id) => id === NOTES).length, 1, `reads: ${frontReads.join(', ')}`)
    assert.ok(frontReads.slice(1).every((id) => id === FIXTURE), `after the flip only the target: ${frontReads.join(', ')}`)
  })

  it('an app that never comes forward is refused out_of_scope after the settle, with nothing posted', async () => {
    const { reply, took, posted } = await run(world({ activationWorks: false }))
    assert.deepEqual([reply.code, reply.bundleId], ['out_of_scope', NOTES], JSON.stringify(reply))
    assert.ok(took >= 1400 && took < 2500, `took ${took} ms`)
    assert.equal(posted, 0)
  })
})

// CU-101: no approved window on screen - no capture is attempted; the reply is a blank frame of the asked size, marked
// noAppWindow, with no windows; input aimed at it stays refused (what is really there is not an approved app).
describe('no approved window on screen (CU-101)', () => {
  const FIXTURE = 'ai.reflection.cu.fixture'
  const NOTES = 'com.example.notes'
  const world = (apps) => ({
    grants: { screen: true, accessibility: true, postEvents: true, listenEvents: false },
    displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 1920, height: 1080 }, scale: 1 }],
    apps, frontmost: apps[0]?.bundleId,
  })
  const notes = { bundleId: NOTES, pid: 700, rect: { x: 1000, y: 100, width: 400, height: 300 } }
  const fixture = { bundleId: FIXTURE, pid: 800, rect: { x: 100, y: 100, width: 800, height: 600 } }
  async function withHelper(declared, body) {
    const dir = privateDir()
    const path = join(dir, 'world.json')
    const eventsPath = join(dir, 'events.jsonl')
    writeFileSync(path, JSON.stringify(declared))
    const { child, channel } = stdioHelper(['--dry-run', '--world', path, '--events-out', eventsPath])
    const posted = () => (existsSync(eventsPath) ? readFileSync(eventsPath, 'utf8').trim().split('\n').filter(Boolean).length : 0)
    try {
      await channel.hello()
      await channel.request('scope', { bundleIds: [FIXTURE] })
      await channel.request('pauseOnLocalInput', { on: true })
      return await body({ channel, posted })
    } finally {
      child.kill()
    }
  }

  it('a capture with no approved window is a blank frame of the asked size, noAppWindow, windows []', async () => {
    await withHelper(world([notes]), async ({ channel }) => {
      const reply = await channel.request('capture', { maxSize: { width: 640, height: 400 } })
      assert.equal(reply.ok, true, JSON.stringify(reply))
      assert.equal(reply.noAppWindow, true)
      assert.deepEqual(reply.windows, [])
      // The asked frame size (captures are fitted to the frame's pixels, CU-74).
      assert.deepEqual([reply.widthPx, reply.heightPx], [640, 400])
      assert.deepEqual(pngSize(Buffer.from(reply.png, 'base64')), { width: 640, height: 400 })
    })
  })

  it('input aimed at the blank frame stays refused - at its centre and on the other app - with nothing posted', async () => {
    await withHelper(world([notes]), async ({ channel, posted }) => {
      await channel.request('capture', { maxSize: { width: 640, height: 400 } })
      for (const [x, y] of [[960, 540], [1200, 250]]) {
        const reply = await channel.request('input', { mode: 'global', events: [{ kind: 'move', x, y, flags: 0 }, { kind: 'down', button: 'left', x, y, clickCount: 1, flags: 0 }, { kind: 'up', button: 'left', x, y, clickCount: 1, flags: 0 }] })
        assert.equal(reply.code, 'out_of_scope', `${x},${y}: ${JSON.stringify(reply)}`)
      }
      assert.equal(posted(), 0)
    })
  })

  it('with an approved window on screen the reply is the real frame, unmarked', async () => {
    await withHelper(world([fixture, notes]), async ({ channel }) => {
      const reply = await channel.request('capture', { maxSize: { width: 640, height: 400 } })
      assert.equal(reply.noAppWindow, undefined, JSON.stringify(Object.keys(reply)))
      assert.deepEqual(reply.windows.map((w) => w.bundleId), [FIXTURE])
    })
  })
})
