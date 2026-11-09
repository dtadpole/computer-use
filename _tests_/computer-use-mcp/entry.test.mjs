import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { CLEAN_EXEC_MARKER, execClean, isEntryPoint, needsCleanExec, withoutLoaders } from '../../_tools_/computer-use-mcp/server.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SERVER = join(HERE, '..', '..', '_tools_', 'computer-use-mcp', 'server.mjs')
const LOADER = /^(DYLD_|LD_)|^(NODE_OPTIONS|NODE_PATH|NODE_REPL_EXTERNAL_MODULE|NODE_ICU_DATA)$/
// What a DSH shell hands its children, minus DYLD_* (macOS may strip those before node sees them) and NODE_ICU_DATA
// (a bad path stops node starting): each is a loader the helper refuses, and none changes how this server runs.
const DSH_LIKE = { NODE_PATH: '/nonexistent/node_modules', NODE_OPTIONS: '', LD_PRELOAD: '/nonexistent/x.so', NODE_REPL_EXTERNAL_MODULE: '/nonexistent/repl.js' }

/**
 * `node [nodeArgs] <script> args` over stdio pipes, as an MCP client starts the server: `request(method)`, `report()`
 * (the test hook's file: which process serves, and with what), `exited` -> `{ code, signal }`, `cleanup()`.
 */
function startServer(script, { args = ['--seat', 'cu-test-seat'], env = {}, nodeArgs = [], detached = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cu-mcp-entry-'))
  const reportFile = join(dir, 'process.json')
  const child = spawn(process.execPath, [...nodeArgs, script, ...args], {
    stdio: ['pipe', 'pipe', 'pipe'],
    detached,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, CU_MCP_TEST_PROCESS_REPORT: reportFile, ...env },
  })
  const waiting = new Map()
  let nextId = 1
  let buffer = ''
  let stderr = ''
  child.stderr.on('data', (chunk) => { stderr += chunk })
  child.stdout.on('data', (chunk) => {
    buffer += chunk
    for (let at = buffer.indexOf('\n'); at !== -1; at = buffer.indexOf('\n')) {
      const message = JSON.parse(buffer.slice(0, at))
      buffer = buffer.slice(at + 1)
      waiting.get(message.id)?.(message)
      waiting.delete(message.id)
    }
  })
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })))
  const request = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++
    const timer = setTimeout(() => reject(new Error(`${method}: no answer in 10 s; stderr: ${stderr.slice(-500)}`)), 10_000)
    waiting.set(id, (message) => { clearTimeout(timer); resolve(message) })
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
  // The report is written before the server reads stdin, so it exists once any reply has come back.
  const report = () => JSON.parse(readFileSync(reportFile, 'utf8'))
  let servingPid = null
  return {
    child,
    exited,
    request,
    report: () => {
      const read = report()
      servingPid = read.pid
      return read
    },
    stderr: () => stderr,
    /** Never leaves a process behind, whatever the test did. */
    cleanup() {
      for (const pid of [child.pid, servingPid]) if (pid && alive(pid)) process.kill(pid, 'SIGKILL')
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

/** stderr is its own pipe and may trail the exit: wait up to 2 s for `pattern` to show. */
async function settledStderr(server, pattern) {
  for (let i = 0; i < 100 && !pattern.test(server.stderr()); i += 1) await new Promise((resolve) => setTimeout(resolve, 20))
}

function alive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function gone(pid, withinMs = 3000) {
  for (const began = Date.now(); Date.now() - began < withinMs; await new Promise((resolve) => setTimeout(resolve, 20))) {
    if (!alive(pid)) return true
  }
  return false
}

/** initialize and tools/list answered: a working MCP round trip through whatever process the client started. */
async function roundTrip(server) {
  const init = await server.request('initialize', { protocolVersion: '2025-11-25', capabilities: {} })
  assert.equal(init.result?.serverInfo?.name, 'computer-use', JSON.stringify(init))
  assert.equal(init.result.protocolVersion, '2025-11-25')
  const list = await server.request('tools/list')
  assert.equal(list.result.tools.length, 4)
}

/** The process that answered was the clean child of the one the client started: no flags, no loader variable. */
function assertCleanChild(server, script = SERVER) {
  const report = server.report()
  assert.equal(report.reexecuted, true)
  assert.notEqual(report.pid, server.child.pid, 'a child serves, not the process the client started')
  assert.equal(report.ppid, server.child.pid)
  assert.deepEqual(report.execArgv, [], 'no node flags before the entry')
  assert.deepEqual(report.argv.slice(1), [script, '--seat', 'cu-test-seat'], 'the entry as node got it, then the original arguments')
  assert.deepEqual(report.envNames.filter((name) => LOADER.test(name)), [], 'every loader variable deleted')
  assert.ok(!report.envNames.includes(CLEAN_EXEC_MARKER), 'the marker is read once and not passed on')
  for (const kept of ['PATH', 'HOME', 'CU_MCP_TEST_PROCESS_REPORT']) assert.ok(report.envNames.includes(kept), `${kept} kept`)
  return report
}

test('isEntryPoint compares realpaths; the clean re-exec decision and environment', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cu-mcp-entry-'))
  try {
    symlinkSync(SERVER, join(dir, 'server.mjs'))
    const url = pathToFileURL(SERVER).href
    assert.equal(isEntryPoint(join(dir, 'server.mjs'), url), true, 'a symlink to server.mjs is server.mjs')
    assert.equal(isEntryPoint(SERVER, url), true)
    assert.equal(isEntryPoint(join(dir, 'missing.mjs'), url), false, 'false on any error')
    assert.equal(isEntryPoint(undefined, url), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  const env = { PATH: '/usr/bin', HOME: '/h', NODE_PATH: '/x', NODE_OPTIONS: '', DYLD_INSERT_LIBRARIES: '/y', LD_PRELOAD: '/z', NODE_ICU_DATA: '/i', NODE_REPL_EXTERNAL_MODULE: '/r', NODE_ENV: 'test' }
  assert.deepEqual(withoutLoaders(env), { PATH: '/usr/bin', HOME: '/h', NODE_ENV: 'test' }, 'deleted, not emptied; other variables kept')
  assert.equal(needsCleanExec(env, []), true)
  assert.equal(needsCleanExec({ PATH: '/usr/bin' }, ['--no-warnings']), true, 'node flags before the entry are refused too')
  assert.equal(needsCleanExec({ PATH: '/usr/bin' }, []), false, 'already clean: no child')
  assert.equal(needsCleanExec({ ...env, [CLEAN_EXEC_MARKER]: '1' }, ['--no-warnings']), false, 'the marked child never execs again')
})

test('started through a symlinked path (cu-verifier: it exited at once), the server answers initialize', { timeout: 30_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cu-mcp-link-'))
  try {
    symlinkSync(SERVER, join(dir, 'server.mjs'))
    symlinkSync(dirname(SERVER), join(dir, 'tools-link'))
    for (const script of [join(dir, 'server.mjs'), join(dir, 'tools-link', 'server.mjs')]) {
      const server = startServer(script)
      try {
        await roundTrip(server)
        assert.equal(server.report().pid, server.child.pid, 'clean already: it serves itself')
        server.child.stdin.end()
        assert.deepEqual(await server.exited, { code: 0, signal: null })
      } finally {
        server.cleanup()
      }
    }
    // Symlinked and from a DSH shell: the child gets the same symlinked entry and still knows it is the program.
    const server = startServer(join(dir, 'server.mjs'), { env: DSH_LIKE })
    try {
      await roundTrip(server)
      assertCleanChild(server, join(dir, 'server.mjs'))
    } finally {
      server.cleanup()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('from a DSH-like environment (NODE_PATH and other loaders) it re-execs once; the clean child serves through the parent', { timeout: 30_000 }, async () => {
  const server = startServer(SERVER, { env: DSH_LIKE })
  try {
    await roundTrip(server)
    const { pid } = assertCleanChild(server)
    assert.doesNotMatch(server.stderr(), /without a clean re-exec/)
    server.child.stdin.end()
    assert.deepEqual(await server.exited, { code: 0, signal: null }, 'stdin close reaches the child; its exit code comes back')
    assert.ok(await gone(pid), 'the serving child is gone too')
  } finally {
    server.cleanup()
  }
})

test('node flags before the entry (--no-warnings) are dropped by the re-exec', { timeout: 30_000 }, async () => {
  const server = startServer(SERVER, { nodeArgs: ['--no-warnings'] })
  try {
    await roundTrip(server)
    assertCleanChild(server)
    server.child.stdin.end()
    assert.deepEqual(await server.exited, { code: 0, signal: null })
  } finally {
    server.cleanup()
  }
})

test('already clean, it serves in the process the client started: no child', { timeout: 30_000 }, async () => {
  const server = startServer(SERVER)
  try {
    await roundTrip(server)
    const report = server.report()
    assert.equal(report.pid, server.child.pid)
    assert.equal(report.reexecuted, false)
    assert.deepEqual(report.execArgv, [])
    server.child.stdin.end()
    assert.deepEqual(await server.exited, { code: 0, signal: null })
  } finally {
    server.cleanup()
  }
})

test('a set marker keeps an unclean start in one process and says desktop runs will fail', { timeout: 30_000 }, async () => {
  const server = startServer(SERVER, { env: { NODE_PATH: '/nonexistent', [CLEAN_EXEC_MARKER]: '1' } })
  try {
    await roundTrip(server)
    const report = server.report()
    assert.equal(report.pid, server.child.pid, 'no loop and no second process')
    // stderr is its own pipe (asynchronous on macOS), so the warning may land after the replies.
    for (let i = 0; i < 100 && !/desktop runs will fail/.test(server.stderr()); i += 1) await new Promise((resolve) => setTimeout(resolve, 20))
    assert.match(server.stderr(), /without a clean re-exec \(NODE_PATH\).*desktop runs will fail/)
  } finally {
    server.cleanup()
  }
})

test('SIGTERM to the parent is forwarded: both processes end promptly, with the orderly stop exit code', { timeout: 30_000 }, async () => {
  const server = startServer(SERVER, { env: DSH_LIKE })
  try {
    await roundTrip(server)
    const { pid } = assertCleanChild(server)
    const began = Date.now()
    server.child.kill('SIGTERM')
    // CU-239: once under gate load the parent ended by SIGTERM itself; the message carries the parent's own account of its path.
    const exited = await server.exited
    assert.deepEqual(exited, { code: 0, signal: null }, `parent ended ${JSON.stringify(exited)}; serving child ${pid}; stderr: ${server.stderr().slice(-600)}`)
    await settledStderr(server, /forwarding SIGTERM to the serving child/)
    assert.match(server.stderr(), new RegExp(`forwarding SIGTERM to the serving child \\(pid ${pid}\\)`), 'the parent says it forwarded')
    assert.doesNotMatch(server.stderr(), /ended by SIGTERM/, 'the child stopped in order, not by the signal')
    assert.ok(await gone(pid), 'the serving child is gone')
    assert.ok(Date.now() - began < 3000, `ended in ${Date.now() - began} ms`)
  } finally {
    server.cleanup()
  }
})

test('a Ctrl-C to the process group reaches the child twice (direct and forwarded) and still ends in an orderly stop', { timeout: 30_000 }, async () => {
  const server = startServer(SERVER, { env: DSH_LIKE, detached: true })
  try {
    await roundTrip(server)
    const { pid } = assertCleanChild(server)
    process.kill(-server.child.pid, 'SIGINT')
    assert.deepEqual(await server.exited, { code: 0, signal: null }, 'the repeat did not kill the child mid-stop')
    assert.ok(await gone(pid))
  } finally {
    try { process.kill(-server.child.pid, 'SIGKILL') } catch { /* the group is gone */ }
    server.cleanup()
  }
})

test('a child ended by a signal ends the parent by the same signal', { timeout: 30_000 }, async () => {
  const server = startServer(SERVER, { env: DSH_LIKE })
  try {
    await roundTrip(server)
    const { pid } = assertCleanChild(server)
    process.kill(pid, 'SIGKILL')
    assert.deepEqual(await server.exited, { code: null, signal: 'SIGKILL' })
    // CU-239: the parent names the path it took before it re-raises.
    await settledStderr(server, /ended by SIGKILL/)
    assert.match(server.stderr(), new RegExp(`the serving child \\(pid ${pid}\\) ended by SIGKILL; ending the same way`))
    assert.doesNotMatch(server.stderr(), /forwarding/, 'nothing was forwarded: the parent got no signal')
  } finally {
    server.cleanup()
  }
})

/**
 * CU-239's unit seams: execClean against a stand-in process and spawn, so the order of its steps is visible. The
 * process records stderr lines, exit and kill calls, each with how many listeners it held for the signal at that moment;
 * the spawn records the listeners the parent held when the child came to exist.
 */
function fakeParent() {
  const proc = new EventEmitter()
  Object.assign(proc, { pid: 4242, lines: [], exits: [], kills: [] })
  proc.stderr = { write: (line) => proc.lines.push(line) }
  proc.exit = (code) => proc.exits.push({ code, listening: proc.listenerCount('SIGTERM') + proc.listenerCount('SIGINT') })
  proc.kill = (pid, signal) => proc.kills.push({ pid, signal, listening: proc.listenerCount(signal) })
  const spawned = []
  const spawnChild = (file, args, options) => {
    const child = Object.assign(new EventEmitter(), { pid: 777, signals: [] })
    child.kill = (signal) => child.signals.push(signal)
    spawned.push({ file, args, options, child, listening: { SIGTERM: proc.listenerCount('SIGTERM'), SIGINT: proc.listenerCount('SIGINT') } })
    return child
  }
  const start = () => execClean({ argv: ['/bin/node', '/cu/server.mjs', '--seat', 'cu-test-seat'], env: { PATH: '/usr/bin', NODE_PATH: '/x', NODE_OPTIONS: '' }, execPath: '/bin/node', spawnChild, proc })
  return { proc, spawned, start }
}

test('CU-239: the parent listens for SIGTERM and SIGINT before the child exists, so a signal at once after the spawn is forwarded', () => {
  const { proc, spawned, start } = fakeParent()
  const child = start()
  assert.equal(spawned.length, 1)
  // The child answers the client directly; a client that is quick, or a parent stalled under load, can send SIGTERM
  // before the statement after spawn runs. With no listener then, node's default action ends the parent (CU-239).
  assert.deepEqual(spawned[0].listening, { SIGTERM: 1, SIGINT: 1 }, 'both listeners were in place when the child came to exist')
  assert.equal(spawned[0].file, '/bin/node')
  assert.deepEqual(spawned[0].args, ['/cu/server.mjs', '--seat', 'cu-test-seat'])
  assert.deepEqual(spawned[0].options, { stdio: 'inherit', env: { PATH: '/usr/bin', [CLEAN_EXEC_MARKER]: '1' } })
  proc.emit('SIGTERM', 'SIGTERM')
  assert.deepEqual(child.signals, ['SIGTERM'], 'forwarded to the child')
  assert.deepEqual(proc.lines, ['computer-use-mcp: forwarding SIGTERM to the serving child (pid 777)\n'])
  assert.deepEqual(proc.exits, [], 'the parent waits for the child')
  child.emit('exit', 0, null)
  assert.deepEqual(proc.exits, [{ code: 0, listening: 2 }], "the child's orderly code, and the listeners still held until the exit")
  assert.deepEqual(proc.kills, [])
})

test("CU-239: a child that exits by a code keeps the parent's listeners to the end; one ended by a signal has them removed, then re-raised", () => {
  const coded = fakeParent()
  coded.start().emit('exit', 3, null)
  assert.deepEqual(coded.proc.exits, [{ code: 3, listening: 2 }], 'no window without listeners before the exit')
  const unknown = fakeParent()
  unknown.start().emit('exit', null, null)
  assert.deepEqual(unknown.proc.exits, [{ code: 1, listening: 2 }], 'no code and no signal: 1')
  for (const [signal, number] of [['SIGTERM', 15], ['SIGKILL', 9]]) {
    const { proc, start } = fakeParent()
    start().emit('exit', null, signal)
    assert.deepEqual(proc.kills, [{ pid: 4242, signal, listening: 0 }], `${signal}: listeners gone, so the re-raise takes the default action`)
    assert.equal(proc.listenerCount('SIGINT'), 0)
    assert.equal(proc.exitCode, 128 + number, 'the fallback code for a signal that does not end node by default')
    assert.deepEqual(proc.exits, [])
    assert.deepEqual(proc.lines, [`computer-use-mcp: the serving child (pid 777) ended by ${signal}; ending the same way\n`])
  }
})

test('CU-239: a re-exec that never started ends the parent with 1; a failed forward to a live child does not', () => {
  const never = fakeParent()
  const child = never.start()
  child.pid = undefined
  child.emit('error', new Error('spawn EAGAIN'))
  assert.deepEqual(never.proc.exits, [{ code: 1, listening: 2 }])
  assert.deepEqual(never.proc.lines, ['computer-use-mcp: the clean re-exec failed: spawn EAGAIN\n'])
  const live = fakeParent()
  live.start().emit('error', new Error('kill ESRCH'))
  assert.deepEqual(live.proc.exits, [], 'the child is still serving')
})
