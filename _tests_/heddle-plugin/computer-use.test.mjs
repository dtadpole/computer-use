import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { TOOLS } from '../../_tools_/computer-use-mcp/tools.mjs'
import apply, { fromMcpResult, IMAGE_NOTE } from '../../_tools_/heddle-plugin/computer-use.mjs'
import { createMcpClient } from '../../_tools_/heddle-plugin/mcp-client.mjs'
import { alwaysApproved, clickPlan, FIXTURE, WORLD } from '../computer-use-mcp/desktop-fake.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const FAKE = join(HERE, 'fake-mcp-server.mjs')
// The real MCP server's main with desktop runs on the fake helper (see that file): never CUHelper.app.
const DESKTOP_SERVER = join(HERE, '..', 'computer-use-mcp', 'desktop-server.mjs')

/** A fake heddle plugin context: records registrations and the model/request listener. */
function fakeContext() {
  const tools = new Map()
  let listener = null
  return {
    ctx: { tools: { register: ({ spec, run }) => tools.set(spec.name, { spec, run }) }, on: (event, fn) => { if (event === 'model/request') listener = fn } },
    tools,
    request: (req) => listener(req, () => req),
  }
}

function setUp() {
  const dir = mkdtempSync(join(tmpdir(), 'cu-heddle-plugin-'))
  const log = join(dir, 'server.log')
  const trace = join(dir, 'trace.jsonl')
  const fake = fakeContext()
  const { client } = apply(fake.ctx, { server: FAKE, serverArgs: [log], trace })
  return { ...fake, client, log, trace, cleanup: async () => { await client.close({ graceMs: 2000 }); rmSync(dir, { recursive: true, force: true }) } }
}

test('MCP results become heddle text output and one image part with its digest', () => {
  const { output, imagePart, isError } = fromMcpResult({ content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }, { type: 'image', data: Buffer.from('png').toString('base64'), mimeType: 'image/png' }] })
  assert.deepEqual([output, isError, imagePart.type, imagePart.bytes, imagePart.mimeType], ['a\nb', false, 'image', 3, 'image/png'])
  assert.match(imagePart.sha256, /^[0-9a-f]{64}$/)
  assert.equal(fromMcpResult({ content: [], isError: true }).isError, true)
})

test('the four tools are registered with the MCP schemas, and nothing starts before a call', async () => {
  const { tools, client, cleanup } = setUp()
  try {
    assert.deepEqual([...tools.keys()], ['computer_use_start', 'computer_use_status', 'computer_use_respond', 'computer_use_control'])
    assert.equal(tools.get('computer_use_status').spec.parameters.properties.wait_seconds.maximum, 50)
    assert.equal(client.started(), false)
  } finally {
    await cleanup()
  }
})

test('a status result reaches the model as text, and its screenshot is added once to the next main request', async () => {
  const { tools, request, trace, cleanup } = setUp()
  try {
    const result = await tools.get('computer_use_status').run({ run_id: 'r1' }, { session: { id: 's1' } })
    assert.deepEqual(result, { output: '{"run_id":"r1","state":"finished"}' })
    const title = request({ sessionId: 's1', purpose: 'title', messages: [] })
    assert.equal(title.messages.length, 0, 'a side request is left alone')
    const main = request({ sessionId: 's1', messages: [{ role: 'user', content: 'go' }] })
    assert.equal(main.messages.length, 2)
    assert.equal(main.messages[1].content[0].text, IMAGE_NOTE)
    assert.deepEqual([main.messages[1].content[1].type, main.messages[1].content[1].mimeType], ['image', 'image/png'])
    assert.equal(request({ sessionId: 's1', messages: [] }).messages.length, 0, 'only once')
    assert.equal(request({ sessionId: 's2', messages: [] }).messages.length, 0, 'never to another session')
    const events = readFileSync(trace, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
    assert.deepEqual(events.map((e) => e.event), ['image_held', 'image_sent'])
    assert.equal(events[0].sha256, events[1].sha256)
  } finally {
    await cleanup()
  }
})

test('tool errors come back as heddle errors; an aborted call is cancelled on the server', async () => {
  const { tools, log, cleanup } = setUp()
  try {
    const refused = await tools.get('computer_use_control').run({ run_id: 'r1', command: 'take_over' }, {})
    assert.equal(refused.error.code, 'tool_error')
    const abort = new AbortController()
    const started = tools.get('computer_use_start').run({ task: 't', start_url: 'http://127.0.0.1:1/' }, { signal: abort.signal })
    setTimeout(() => abort.abort(), 50)
    assert.equal((await started).error.code, 'cancelled')
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.ok(readFileSync(log, 'utf8').includes('notifications/cancelled'))
  } finally {
    await cleanup()
  }
})

test('the client closes the server by closing stdin', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cu-heddle-client-'))
  const client = createMcpClient({ args: [FAKE, join(dir, 'log')] })
  await client.callTool('computer_use_status', { run_id: 'x' })
  const pid = client.pid()
  await client.close({ graceMs: 2000 })
  assert.throws(() => process.kill(pid, 0), 'the server process is gone')
  assert.ok(existsSync(join(dir, 'log')))
  rmSync(dir, { recursive: true, force: true })
})

test('an idle server does not keep the host process alive: a host that made one call exits by itself', async () => {
  const { spawn } = await import('node:child_process')
  const clientUrl = new URL('../../_tools_/heddle-plugin/mcp-client.mjs', import.meta.url).href
  const script = `import { createMcpClient } from ${JSON.stringify(clientUrl)}
const client = createMcpClient({ args: [${JSON.stringify(FAKE)}] })
await client.callTool('computer_use_status', { run_id: 'x' })
console.log('called')`
  const began = Date.now()
  const host = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  host.stdout.on('data', (chunk) => { out += chunk })
  const code = await new Promise((resolve) => {
    const timer = setTimeout(() => { host.kill('SIGKILL'); resolve('hung') }, 8000)
    host.on('exit', (exitCode) => { clearTimeout(timer); resolve(exitCode) })
  })
  assert.equal(code, 0, 'the host exited on its own')
  assert.match(out, /called/)
  assert.ok(Date.now() - began < 8000)
})

test("computer_use_start's heddle schema documents the desktop fields: environment, apps and exclude_apps", async () => {
  const { tools, cleanup } = setUp()
  try {
    const { parameters, description } = tools.get('computer_use_start').spec
    assert.deepEqual(parameters, TOOLS[0].inputSchema, 'the MCP schema, unchanged')
    assert.deepEqual(parameters.properties.environment.enum, ['chrome-browser', 'macos-desktop'])
    assert.match(parameters.properties.apps.description, /bundle ids/)
    assert.match(parameters.properties.apps.description, /cannot approve/)
    assert.equal(parameters.properties.exclude_apps.type, 'array')
    assert.deepEqual(parameters.required, ['task'])
    assert.match(description, /macos-desktop/)
  } finally {
    await cleanup()
  }
})

test('a desktop start passes environment, apps and exclude_apps through to the server verbatim', async () => {
  const { tools, cleanup } = setUp()
  try {
    const args = { task: 'tidy the window', environment: 'macos-desktop', apps: [FIXTURE, 'com.apple.TextEdit'], exclude_apps: ['com.example.secret.*'], live_view: true }
    const result = await tools.get('computer_use_start').run(args, { session: { id: 's1' } })
    assert.equal(result.error, undefined)
    assert.deepEqual(JSON.parse(result.output).received, args)
  } finally {
    await cleanup()
  }
})

test('through the real server: a heddle desktop run on the fake helper ends with its final screenshot sent once to the next model request', { timeout: 60_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cu-heddle-desktop-'))
  const cuHome = join(dir, 'home')
  alwaysApproved(join(cuHome, 'app-approvals.json')) // the approval a person gave earlier; the plugin gives none
  const client = createMcpClient({ args: [DESKTOP_SERVER, '--seat', 'cu-test-seat', '--runs-dir', join(dir, 'runs')], env: { PATH: process.env.PATH, HOME: process.env.HOME, CU_HOME: cuHome } })
  const fake = fakeContext()
  apply(fake.ctx, { client })
  try {
    const started = await fake.tools.get('computer_use_start').run({ task: 'click once in CU Fixture', environment: 'macos-desktop', apps: [FIXTURE], model: 'scripted', plan: clickPlan(dir), live_view: false }, { session: { id: 'h1' } })
    assert.equal(started.error, undefined, started.output)
    const runId = JSON.parse(started.output).run_id
    let body
    for (let i = 0; i < 30; i += 1) {
      const status = await fake.tools.get('computer_use_status').run({ run_id: runId, wait_seconds: 1 }, { session: { id: 'h1' } })
      body = JSON.parse(status.output)
      if (body.state === 'finished') break
    }
    assert.equal(body.result.status, 'completed', body.result.error)
    assert.ok(existsSync(join(body.trajectory.run_dir, 'events.jsonl')))
    const main = fake.request({ sessionId: 'h1', messages: [{ role: 'user', content: 'go' }] })
    const image = main.messages[1].content[1]
    assert.deepEqual([main.messages[1].content[0].text, image.type, image.mimeType], [IMAGE_NOTE, 'image', 'image/png'])
    assert.deepEqual(Buffer.from(image.data, 'base64'), readFileSync(body.result.finalScreenshot), 'the final screenshot, byte for byte')
    assert.equal(fake.request({ sessionId: 'h1', messages: [] }).messages.length, 0, 'only once')
  } finally {
    await client.close({ graceMs: 10_000 })
    rmSync(dir, { recursive: true, force: true })
  }
})

test('CU-110 through the real server: with no app window on screen, the heddle session reads no_app_window naming the app and the fix - no image, never helper_lost', { timeout: 60_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cu-heddle-no-window-'))
  const cuHome = join(dir, 'home')
  alwaysApproved(join(cuHome, 'app-approvals.json'))
  // helper 0.2.32's blank capture on every request (a large count: the world crosses as JSON); a short first-capture wait.
  const world = JSON.stringify({ ...WORLD, quirks: { noAppWindow: 1_000_000 } })
  const client = createMcpClient({
    args: [DESKTOP_SERVER, '--seat', 'cu-test-seat', '--runs-dir', join(dir, 'runs')],
    env: { PATH: process.env.PATH, HOME: process.env.HOME, CU_HOME: cuHome, CU_TEST_FAKE_WORLD: world, CU_TEST_APP_WINDOW_WAIT_MS: '300' },
  })
  const fake = fakeContext()
  apply(fake.ctx, { client })
  try {
    const started = await fake.tools.get('computer_use_start').run({ task: 'click once in CU Fixture', environment: 'macos-desktop', apps: [FIXTURE], model: 'scripted', plan: clickPlan(dir), live_view: false }, { session: { id: 'h2' } })
    assert.equal(started.error, undefined, started.output)
    const runId = JSON.parse(started.output).run_id
    let status
    let body
    for (let i = 0; i < 30; i += 1) {
      status = await fake.tools.get('computer_use_status').run({ run_id: runId, wait_seconds: 1 }, { session: { id: 'h2' } })
      body = JSON.parse(status.output)
      if (body.state === 'finished') break
    }
    assert.equal(body.result.status, 'error')
    assert.match(body.result.error, /^no_app_window: no window of ai\.reflection\.cu\.fixture is on screen \(not running, every window closed, minimized or hidden, or on another Space or display\); open it and run again/)
    assert.doesNotMatch(status.output, /helper_lost|no app is in this run's scope/)
    const main = fake.request({ sessionId: 'h2', messages: [{ role: 'user', content: 'go' }] })
    assert.equal(main.messages.length, 1, 'no screenshot was held for the session: nothing blank reaches the model')
  } finally {
    await client.close({ graceMs: 10_000 })
    rmSync(dir, { recursive: true, force: true })
  }
})
