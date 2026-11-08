import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { createMcpServer, parseServerArgs } from '../../_tools_/computer-use-mcp/server.mjs'
import { alwaysApproved, clickPlan, FIXTURE } from './desktop-fake.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SERVER = join(HERE, '..', '..', '_tools_', 'computer-use-mcp', 'server.mjs')
const DESKTOP_SERVER = join(HERE, 'desktop-server.mjs')

/** A server child over stdio: `request(method, params)`, `callTool(name, args)` -> `{ isError, json, text, images }`, `close()`. */
function serverProcess(script, args, env) {
  const child = spawn(process.execPath, [script, ...args], { stdio: ['pipe', 'pipe', 'pipe'], env })
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
  const exited = new Promise((resolve) => child.once('exit', (code) => resolve(code)))
  const request = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++
    const timer = setTimeout(() => reject(new Error(`${method}: no answer in 20 s; stderr: ${stderr.slice(-500)}`)), 20_000)
    waiting.set(id, (message) => { clearTimeout(timer); resolve(message) })
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
  return {
    request,
    async callTool(name, args) {
      const { result } = await request('tools/call', { name, arguments: args })
      const text = result.content.filter((block) => block.type === 'text').map((block) => block.text).join('\n')
      let json = null
      try { json = JSON.parse(text) } catch { json = null }
      return { isError: result.isError === true, text, json, images: result.content.filter((block) => block.type === 'image') }
    },
    async close() {
      child.stdin.end()
      const timer = setTimeout(() => child.kill('SIGKILL'), 10_000)
      const code = await exited
      clearTimeout(timer)
      return code
    },
  }
}

function harness(manager = {}) {
  const sent = []
  const server = createMcpServer({ manager })
  return { sent, call: (message) => server.handle(message, (reply) => sent.push(reply)) }
}

test('initialize echoes a supported protocol version, falls back otherwise, and declares tools', async () => {
  const { sent, call } = harness()
  await call({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } })
  await call({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '2099-01-01' } })
  assert.equal(sent[0].result.protocolVersion, '2025-06-18')
  assert.equal(sent[1].result.protocolVersion, '2025-11-25')
  assert.deepEqual(sent[0].result.capabilities, { tools: { listChanged: false } })
  assert.equal(sent[0].result.serverInfo.name, 'computer-use')
})

test("server/discover and unknown methods answer -32601 (DSH's client then falls back to initialize); notifications get no answer", async () => {
  const { sent, call } = harness()
  await call({ jsonrpc: '2.0', id: 1, method: 'server/discover', params: {} })
  await call({ jsonrpc: '2.0', method: 'notifications/initialized' })
  await call({ jsonrpc: '2.0', id: 2, method: 'ping' })
  await call({ id: 3, method: 'tools/list' })
  assert.deepEqual(sent.map((reply) => reply.error?.code ?? 'ok'), [-32601, 'ok', -32600])
})

test('tools/call: results, tool errors as isError, and no answer for a cancelled call', async () => {
  let release
  const manager = {
    start: async () => ({ run_id: 'r1', view_url: 'http://127.0.0.1:1/?token=view', state: 'running' }),
    status: ({ runId }, { signal }) => new Promise((resolve) => { release = resolve; signal.addEventListener('abort', () => resolve({ content: [] })) }),
  }
  const { sent, call } = harness(manager)
  await call({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'computer_use_start', arguments: { task: 't', start_url: 'http://127.0.0.1:4000/' } } })
  assert.equal(JSON.parse(sent[0].result.content[0].text).run_id, 'r1')
  await call({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'computer_use_control', arguments: { run_id: 'r1', command: 'take_over' } } })
  assert.equal(sent[1].result.isError, true)
  assert.match(sent[1].result.content[0].text, /control token/)
  await call({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'no_such_tool', arguments: {} } })
  assert.equal(sent[2].result.isError, true)
  const waiting = call({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'computer_use_status', arguments: { run_id: 'r1', wait_seconds: 50 } } })
  await new Promise((resolve) => setTimeout(resolve, 10))
  await call({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 4, reason: 'SdkError: Request timed out' } })
  await waiting
  assert.equal(sent.length, 3, 'the cancelled call is not answered')
  void release
})

test('server arguments', () => {
  assert.deepEqual(parseServerArgs(['--seat', 'cu-mcp', '--viewport', '1280x800', '--key-file', '/k']), { seat: 'cu-mcp', runsDirectory: undefined, keyFile: '/k', viewport: { width: 1280, height: 800 } })
  assert.throws(() => parseServerArgs(['--viewport', 'big']))
  assert.throws(() => parseServerArgs(['stray']))
})

test('as a process: starts cheaply, lists tools over stdio, and exits when stdin closes', async () => {
  const began = Date.now()
  const child = spawn(process.execPath, [SERVER, '--seat', 'cu-test-seat'], { stdio: ['pipe', 'pipe', 'pipe'], env: { PATH: process.env.PATH, HOME: process.env.HOME } })
  let out = ''
  child.stdout.on('data', (chunk) => { out += chunk })
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {} } }) + '\n')
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n')
  for (let i = 0; i < 100 && out.split('\n').filter(Boolean).length < 2; i += 1) await new Promise((resolve) => setTimeout(resolve, 20))
  const replies = out.split('\n').filter(Boolean).map((line) => JSON.parse(line))
  assert.equal(replies[1].result.tools.length, 4)
  assert.match(JSON.stringify(replies[1].result), /macos-desktop/, 'the tools offer a desktop run (M9)')
  assert.ok(Date.now() - began < 2000, 'cheap start-up: no browser before a call')
  child.stdin.end()
  const code = await new Promise((resolve) => child.on('exit', resolve))
  assert.equal(code, 0)
  assert.ok(Date.now() - began < 5000)
})

test('as a process: a desktop run goes end to end - tools, run manager, startRun, the macos-desktop driver - on the fake helper', { timeout: 60_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cu-mcp-process-'))
  // CU_HOME holds the always store with the fixture in it: the approval a person gave earlier, read by agent core itself.
  const cuHome = join(dir, 'home')
  alwaysApproved(join(cuHome, 'app-approvals.json'))
  const server = serverProcess(DESKTOP_SERVER, ['--seat', 'cu-test-seat', '--runs-dir', join(dir, 'runs')], { PATH: process.env.PATH, HOME: process.env.HOME, CU_HOME: cuHome })
  try {
    const init = await server.request('initialize', { protocolVersion: '2025-11-25', capabilities: {} })
    assert.match(init.result.instructions, /macos-desktop/)
    const started = await server.callTool('computer_use_start', { task: 'click once in CU Fixture', environment: 'macos-desktop', apps: [FIXTURE], model: 'scripted', plan: clickPlan(dir), live_view: false })
    assert.equal(started.isError, false, started.text)
    assert.equal(started.json.environment, 'macos-desktop')
    let status
    for (let i = 0; i < 30; i += 1) {
      status = await server.callTool('computer_use_status', { run_id: started.json.run_id, wait_seconds: 1 })
      if (status.json?.state === 'finished') break
    }
    assert.equal(status.json.state, 'finished')
    assert.equal(status.json.result.status, 'completed', status.json.result.error)
    assert.equal(status.json.result.finalMessage, 'Done: clicked.')
    assert.ok(status.json.result.actions.done >= 1, 'the click was done')
    assert.equal(status.images.length, 1, 'the final screenshot came back as an image')
    assert.equal(status.images[0].mimeType, 'image/png')
    assert.deepEqual(Buffer.from(status.images[0].data, 'base64'), readFileSync(status.json.result.finalScreenshot))
    const runDir = status.json.trajectory.run_dir
    assert.ok(existsSync(join(runDir, 'run.json')) && existsSync(join(runDir, 'events.jsonl')))
    assert.equal(JSON.parse(readFileSync(join(runDir, 'run.json'), 'utf8')).environment.kind, 'desktop')
    assert.match(status.json.trajectory.replay_command, new RegExp(`replay ${started.json.run_id}$`))
  } finally {
    assert.equal(await server.close(), 0)
    rmSync(dir, { recursive: true, force: true })
  }
})

test('as a process: bad desktop input is refused by name as a tool error, and nothing approves an app', { timeout: 30_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cu-mcp-process-'))
  const server = serverProcess(SERVER, ['--seat', 'cu-test-seat', '--runs-dir', join(dir, 'runs')], { PATH: process.env.PATH, HOME: process.env.HOME, CU_HOME: join(dir, 'home') })
  try {
    await server.request('initialize', { protocolVersion: '2025-11-25', capabilities: {} })
    const cases = [
      [{ task: 't', environment: 'linux-desktop', apps: [FIXTURE] }, /unknown environment 'linux-desktop'/],
      [{ task: 't', environment: 'macos-desktop' }, /apps is required for a macos-desktop run/],
      [{ task: 't', environment: 'macos-desktop', apps: ['com.googlecode.iterm2'] }, /com\.googlecode\.iterm2 is excluded \(terminal\)/],
      [{ task: 't', environment: 'macos-desktop', apps: [FIXTURE], approve_apps: [FIXTURE] }, /'approve_apps' is refused/],
      [{ task: 't', environment: 'macos-desktop', apps: [FIXTURE], pre_approve: ['new_app'] }, /'new_app' is refused/],
    ]
    for (const [args, pattern] of cases) {
      const reply = await server.callTool('computer_use_start', args)
      assert.equal(reply.isError, true, JSON.stringify(args))
      assert.match(reply.text, pattern)
    }
    assert.ok(!existsSync(join(dir, 'runs')), 'no run was recorded for a refused start')
  } finally {
    assert.equal(await server.close(), 0)
    rmSync(dir, { recursive: true, force: true })
  }
})

test('tools/call: null params read as none; a non-object params or arguments is -32602, never a TypeError or a misleading refusal (CU-67)', async () => {
  const server = createMcpServer({ manager: { shutdown: async () => {} } })
  const ask = (message) => new Promise((resolve) => { server.handle(message, resolve).then(() => setImmediate(() => resolve(null))) })
  const none = await ask({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: null })
  assert.deepEqual(none.result, { content: [{ type: 'text', text: "unknown tool 'undefined'" }], isError: true }, 'null params are no params')
  const invalid = { code: -32602, message: 'invalid params: tools/call takes { name, arguments } with arguments an object' }
  for (const params of ['computer_use_status', [1], 5]) {
    assert.deepEqual(await ask({ jsonrpc: '2.0', id: 2, method: 'tools/call', params }), { jsonrpc: '2.0', id: 2, error: invalid }, JSON.stringify(params))
  }
  for (const args of ['task', ['run_id'], 5, true]) {
    assert.deepEqual(await ask({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'computer_use_status', arguments: args } }), { jsonrpc: '2.0', id: 3, error: invalid }, JSON.stringify(args))
  }
  const nullArgs = await ask({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'computer_use_status', arguments: null } })
  assert.equal(nullArgs.result.content[0].text, 'run_id is required', 'null arguments are no arguments')
  await assert.doesNotReject(server.handle({ jsonrpc: '2.0', method: 'notifications/cancelled', params: null }, () => assert.fail('a notification is not answered')))
})
