import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { test } from 'node:test'

import { createFakeEnvironment } from '../../_tools_/agent-core/lib.mjs'
import { createRunManager } from '../../_tools_/computer-use-mcp/runs.mjs'
import { createMcpServer, parseServerArgs, serveStdio } from '../../_tools_/computer-use-mcp/server.mjs'
import { checkControl, checkRespond, checkStart, checkStatus, ToolInputError } from '../../_tools_/computer-use-mcp/tools.mjs'

/**
 * Every error path of the four tools and the server, as the client (DSH's MCP client, the heddle plugin) sees it:
 * the branches the other files of this suite leave untested (CU-58). A refused input is a ToolInputError whose message
 * is the model's whole explanation, so each assertion names the message, not just the failure.
 */

const FIXTURE = 'ai.reflection.cu.fixture'
const START = 'http://127.0.0.1:43117/'
const refused = (pattern) => (error) => error instanceof ToolInputError && pattern.test(error.message)

function manager({ launchEnvironment } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cu-mcp-errors-'))
  const plan = join(dir, 'plan.json')
  writeFileSync(plan, JSON.stringify({ turns: [{ final: 'done' }] }))
  const runs = createRunManager({
    seat: 'cu-test-seat',
    runsDirectory: join(dir, 'runs'),
    launchEnvironment: launchEnvironment ?? (async (options) => createFakeEnvironment({ control: options.control })),
  })
  return { dir, plan, runs, cleanup: async () => { await runs.shutdown(); rmSync(dir, { recursive: true, force: true }) } }
}

/** One message through the protocol core; resolves with its reply, or with null when none comes. */
function exchange(server, message) {
  return new Promise((resolve) => {
    server.handle(message, resolve).then(() => setImmediate(() => resolve(null)))
  })
}

const call = (server, name, args, id = 7) => exchange(server, { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } })

test('start: the remaining input checks refuse by name - lists, start_url, an app also excluded, a plan, live_view', () => {
  const browser = (extra) => () => checkStart({ task: 't', start_url: START, ...extra })
  assert.throws(browser({ allow_sites: ['127.0.0.1', 3] }), refused(/^allow_sites must be a list of strings$/))
  assert.throws(browser({ secrets: 'CU_SECRET' }), refused(/^secrets must be a list of strings$/))
  assert.throws(browser({ pre_approve: ['  '] }), refused(/^pre_approve must be a list of strings$/))
  for (const url of ['not a url', '/relative/path', 'file:///etc/passwd', 'ftp://127.0.0.1/', 'javascript:alert(1)']) {
    assert.throws(() => checkStart({ task: 't', start_url: url }), refused(/^start_url must be an absolute http\(s\) URL$/), url)
  }
  assert.throws(() => checkStart({ task: 't', environment: 'macos-desktop', apps: [FIXTURE], exclude_apps: [FIXTURE] }),
    refused(new RegExp(`^apps: ${FIXTURE.replaceAll('.', '\\.')} is also in exclude_apps$`)))
  assert.throws(() => checkStart({ task: 't', environment: 'macos-desktop', apps: [FIXTURE], exclude_apps: [3] }), refused(/^exclude_apps must be a list of strings$/))
  for (const plan of [undefined, 'plan.json', '  ']) {
    assert.throws(browser({ model: 'scripted', plan }), refused(/^model scripted needs plan, an absolute path$/), String(plan))
  }
  for (const liveView of ['yes', 1, null]) {
    assert.throws(browser({ live_view: liveView }), refused(/^live_view must be true or false$/), String(liveView))
  }
})

test('status, respond and control: run_id is required; respond needs a question and a non-empty answer; control names its commands', () => {
  for (const runId of [undefined, '', '   ', 7]) {
    assert.throws(() => checkStatus({ run_id: runId }), refused(/^run_id is required$/))
    assert.throws(() => checkControl({ run_id: runId, command: 'pause' }), refused(/^run_id is required$/))
    assert.throws(() => checkRespond({ run_id: runId, question_id: 'q', answer: 'a' }), refused(/^run_id, question_id and a non-empty answer are required$/))
  }
  for (const input of [{ question_id: 'q', answer: '   ' }, { question_id: 'q', answer: 5 }, { answer: 'a' }, { question_id: '', answer: 'a' }]) {
    assert.throws(() => checkRespond({ run_id: 'r', ...input }), refused(/^run_id, question_id and a non-empty answer are required$/), JSON.stringify(input))
  }
  for (const command of [undefined, 'restart', 'PAUSE', '']) {
    assert.throws(() => checkControl({ run_id: 'r', command }), refused(/^command must be one of pause, resume, stop, guide$/), String(command))
  }
})

test('over the protocol, each tool\'s refusal is an isError text result with the message verbatim, never a JSON-RPC error', async () => {
  const { runs, cleanup } = manager()
  const server = createMcpServer({ manager: runs })
  try {
    const cases = [
      ['computer_use_start', {}, /^task is required$/],
      ['computer_use_status', { run_id: 'r-none' }, /^no run 'r-none' in this server$/],
      ['computer_use_respond', { run_id: 'r-none', question_id: 'q', answer: 'a' }, /^no run 'r-none' in this server$/],
      ['computer_use_control', { run_id: 'r-none', command: 'pause' }, /^no run 'r-none' in this server$/],
      ['computer_use_launch', {}, /^unknown tool 'computer_use_launch'$/],
    ]
    for (const [name, args, message] of cases) {
      const reply = await call(server, name, args)
      assert.equal(reply.id, 7, name)
      assert.equal(reply.error, undefined, `${name}: a tool error is a result`)
      assert.equal(reply.result.isError, true, name)
      assert.equal(reply.result.content.length, 1, name)
      assert.equal(reply.result.content[0].type, 'text', name)
      assert.match(reply.result.content[0].text, message, name)
    }
    const nameless = await exchange(server, { jsonrpc: '2.0', id: 8, method: 'tools/call' })
    assert.match(nameless.result.content[0].text, /^unknown tool 'undefined'$/, 'a call without params names no tool')
  } finally {
    await cleanup()
  }
})

test('a failure that is not an input refusal reaches the client as "error: <message>", still a tool result', async () => {
  const failing = {
    start: async () => { throw new Error('disk full') },
    status: async () => { throw 'helper gone' }, // eslint-disable-line no-throw-literal
    respond: () => { throw new TypeError('bad state') },
    control: () => { throw new ToolInputError('pause refused: already paused (state paused)') },
    shutdown: async () => {},
  }
  const server = createMcpServer({ manager: failing })
  const text = async (name, args) => {
    const reply = await call(server, name, args)
    assert.equal(reply.result.isError, true, name)
    return reply.result.content[0].text
  }
  assert.equal(await text('computer_use_start', { task: 't', start_url: START }), 'error: disk full')
  assert.equal(await text('computer_use_status', { run_id: 'r' }), 'error: helper gone')
  assert.equal(await text('computer_use_respond', { run_id: 'r', question_id: 'q', answer: 'a' }), 'error: bad state')
  assert.equal(await text('computer_use_control', { run_id: 'r', command: 'pause' }), 'pause refused: already paused (state paused)', 'a refusal passes verbatim, without the error: prefix')
})

test('JSON-RPC errors: -32600 for a non-2.0 message, -32601 for an unknown method, nothing for a notification', async () => {
  const server = createMcpServer({ manager: { shutdown: async () => {} } })
  assert.deepEqual(await exchange(server, { jsonrpc: '1.0', id: 3, method: 'ping' }), { jsonrpc: '2.0', id: 3, error: { code: -32600, message: 'invalid request' } })
  assert.deepEqual(await exchange(server, null), { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'invalid request' } })
  assert.deepEqual(await exchange(server, [1, 2]), { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'invalid request' } })
  assert.deepEqual(await exchange(server, { jsonrpc: '2.0', id: 4, method: 'resources/list' }),
    { jsonrpc: '2.0', id: 4, error: { code: -32601, message: 'method not found: resources/list' } })
  assert.equal(await exchange(server, { jsonrpc: '2.0', method: 'resources/list' }), null, 'a notification is never answered, even an unknown one')
  assert.equal(await exchange(server, { jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 99 } }), null, 'cancelling an unknown call is a no-op')
})

test('over stdio, a line that is not JSON gets -32700 with id null, and the server goes on serving', async () => {
  const input = new PassThrough()
  const output = new PassThrough()
  const lines = []
  output.on('data', (chunk) => lines.push(...String(chunk).split('\n').filter(Boolean).map((line) => JSON.parse(line))))
  let shutDown = false
  const served = serveStdio({ input, output, manager: { shutdown: async () => { shutDown = true } } })
  input.write('{"jsonrpc":"2.0","id":1,"method":\n')
  input.write('   \n')
  input.write('{"jsonrpc":"2.0","id":2,"method":"ping"}\n')
  input.end()
  await served
  assert.deepEqual(lines, [
    { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } },
    { jsonrpc: '2.0', id: 2, result: {} },
  ], 'a blank line is skipped; the ping after the bad line is answered')
  assert.equal(shutDown, true, 'closing input still shuts the manager down')
})

test('the command line: a flag without a value, a bare word or a bad --viewport stops the server before it serves', () => {
  assert.throws(() => parseServerArgs(['--seat']), /^Error: unexpected argument '--seat'$/)
  assert.throws(() => parseServerArgs(['seat', 'cu-mcp']), /^Error: unexpected argument 'seat'$/)
  assert.throws(() => parseServerArgs(['--Seat', 'cu-mcp']), /^Error: unexpected argument '--Seat'$/)
  for (const viewport of ['big', '99x99', '1280x', '12800x800']) {
    assert.throws(() => parseServerArgs(['--viewport', viewport]), /^Error: --viewport must be WIDTHxHEIGHT$/, viewport)
  }
})

test('a browser that cannot start refuses the start with its code, records the run, and does not hold the one-run slot', async () => {
  const failure = Object.assign(new Error('no Chrome at /Applications/Google Chrome.app'), { code: 'chrome_missing' })
  const { dir, plan, runs, cleanup } = manager({ launchEnvironment: async () => { throw failure } })
  try {
    const spec = checkStart({ task: 'do the thing', start_url: START, model: 'scripted', plan, live_view: false })
    await assert.rejects(runs.start(spec), refused(/^the browser could not start: chrome_missing: no Chrome at \/Applications\/Google Chrome\.app$/))
    const recorded = readdirSync(join(dir, 'runs'))
    assert.equal(recorded.length, 1, 'the failed start left its trajectory')
    assert.ok(existsSync(join(dir, 'runs', recorded[0])))
    await assert.rejects(runs.start(spec), refused(/^the browser could not start/), 'the second start is tried, not refused as one run at a time')
  } finally {
    await cleanup()
  }
})
