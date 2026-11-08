import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { browserAvailable } from '../../_vendor_/browser-use/lib.mjs'
import { skipUnless } from '../../_vendor_/browser-use/_tools_/verify-runner/lib.mjs'
import { buildPlan, oracleAnswer } from '../../_evaluators_/task-suite/lib.mjs'
import { recordOracle } from '../../_evaluators_/task-suite/run.mjs'
import { fixtureClient } from '../../_tools_/fixture-site/client.mjs'
import { judgeRun } from '../../_tools_/fixture-site/judge.mjs'
import { startFixtureServer } from '../../_tools_/fixture-site/server.mjs'
import { startMcpServer } from '../../_tools_/verify-kit/mcp-client.mjs'
import { decodePng } from '../../_tools_/verify-kit/png.mjs'
import { loadSut } from '../../_tools_/verify-kit/sut.mjs'
import { verifySeat } from '../../_tools_/verify-kit/seat.mjs'

/** CU-156: the seat this verifier's browsers and runs use - CU_VERIFY_SEAT, else cu-verifier (verify-kit/seat.mjs). */
const SEAT = verifySeat()

/**
 * ULTIMATE_GOAL integration row: a DSH or heddle session calls computer use as a tool and gets the result back,
 * with no way for the calling model to approve its own consent.
 *
 * This check is the calling session: it starts the MCP server over stdio as DSH's stdio transport does and speaks
 * JSON-RPC to it. Verdicts rest on the fixture (D-012), the PNG bytes returned, the process table and the files on
 * disk: the tool surface carries no approval path; start-up launches no browser; a scripted run completes a fixture
 * task and returns its final screenshot; a consent request cannot be answered by the caller, so nothing is bought;
 * closing stdin ends the server and leaves no Chrome.
 */

const sut = await loadSut()
const VIEWPORT = Object.freeze({ width: 1440, height: 900 })

let ready = browserAvailable()
let unjudged = ready ? '' : 'no Chrome or Chromium on this machine'
let fixture
let client
let runsDirectory
let catalogue
let mcp

/** PIDs of Chrome processes on this seat's throwaway profiles, from the process table. */
const chromePidsOnSeat = () =>
  execFileSync('ps', ['-axww', '-o', 'pid=,command='], { encoding: 'utf8' })
    .split('\n')
    .filter((line) => line.includes(`--user-data-dir=/tmp/${SEAT}-chrome-`))
    .map((line) => Number(line.trim().split(/\s+/)[0]))
// Processes and profiles that existed before the server started are not this test's to judge.
let baselinePids = new Set()
let baselineProfiles = new Set()
const chromeOnSeat = () => chromePidsOnSeat().filter((pid) => !baselinePids.has(pid)).length
const seatProfiles = () => readdirSync('/tmp').filter((name) => new RegExp(`^${SEAT}-chrome-[A-Za-z0-9]{6}$`).test(name) && !baselineProfiles.has(name))

async function settleTo(predicate, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs
  while (!predicate() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 200))
  return predicate()
}

/** A plan file for a task: its oracle, recorded in this check's own browser, then the fixture reset. */
async function planFor(taskId) {
  const task = catalogue.get(taskId)
  await client.reset()
  const fresh = await client.taskState(taskId)
  const { actions, state } = await recordOracle(client, task, fresh.expected, SEAT)
  await client.reset()
  const path = join(runsDirectory, `plan-${taskId}.json`)
  writeFileSync(path, JSON.stringify(buildPlan(actions, VIEWPORT, oracleAnswer(state))))
  return { task, path }
}

/** Poll status until the run is finished or `state` is reached. */
async function waitFor(runId, wanted, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs
  let status
  while (Date.now() < deadline) {
    status = await mcp.callTool('computer_use_status', { run_id: runId, wait_seconds: 10 })
    if (status.json?.state === wanted || status.json?.state === 'finished') return status
  }
  return status
}

before(async () => {
  fixture = await startFixtureServer({ seed: 'session-integration-verifier' })
  client = fixtureClient(fixture)
  runsDirectory = mkdtempSync('/tmp/cu-verifier-runs-')
  catalogue = new Map((await client.tasks()).tasks.map((task) => [task.id, task]))
})

after(async () => {
  if (mcp && mcp.child.exitCode === null) {
    mcp.closeInput()
    await Promise.race([mcp.exited, new Promise((resolve) => setTimeout(resolve, 10_000))])
    if (mcp.child.exitCode === null) mcp.child.kill('SIGKILL')
  }
  await fixture?.close()
  if (/^\/tmp\/cu-verifier-runs-[A-Za-z0-9]{6}$/.test(runsDirectory ?? '')) rmSync(runsDirectory, { recursive: true, force: true })
})

test('the stdio server offers four tools and no approval path; start-up launches no browser', { timeout: 60_000 }, async () => {
  baselinePids = new Set(chromePidsOnSeat())
  baselineProfiles = new Set(readdirSync('/tmp').filter((name) => name.startsWith(`${SEAT}-chrome-`)))
  const before = chromeOnSeat()
  mcp = startMcpServer(sut.mcpServer, ['--seat', SEAT, '--runs-dir', runsDirectory])
  const init = await mcp.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'cu-verifier', version: '1.0.0' } })
  assert.ok(init.result?.serverInfo?.name, 'no serverInfo in the initialize reply')
  mcp.notify('notifications/initialized')
  const tools = (await mcp.request('tools/list', {})).result.tools
  assert.deepEqual(tools.map((tool) => tool.name).sort(), ['computer_use_control', 'computer_use_respond', 'computer_use_start', 'computer_use_status'])
  assert.ok(!tools.some((tool) => /approve|consent/i.test(tool.name)), 'a tool named for approval or consent')
  const respond = tools.find((tool) => tool.name === 'computer_use_respond')
  assert.deepEqual(Object.keys(respond.inputSchema.properties).sort(), ['answer', 'question_id', 'run_id'])
  const control = tools.find((tool) => tool.name === 'computer_use_control')
  for (const command of ['take_over', 'hand_back', 'consent']) assert.ok(!control.inputSchema.properties.command.enum.includes(command), `control offers ${command} to the caller`)
  await new Promise((resolve) => setTimeout(resolve, 1000))
  assert.equal(chromeOnSeat(), before, 'the server launched a browser before any start')
})

test('a scripted run started over MCP completes visitor-badge and returns its final screenshot', { timeout: 150_000 }, async (t) => {
  if (!skipUnless(t, ready && mcp, unjudged || 'the server did not start')) return
  const { task, path } = await planFor('visitor-badge')
  const start = await mcp.callTool('computer_use_start', { task: task.prompt, start_url: task.url, model: 'scripted', plan: path })
  if (start.isError && /resource|browsers/i.test(start.texts.join(' '))) return skipUnless(t, false, start.texts.join(' '))
  assert.equal(start.isError, false, start.texts.join(' '))
  const status = await waitFor(start.json.run_id, 'finished')
  assert.equal(status.json.state, 'finished')
  assert.equal(status.json.result?.status, 'completed', `result ${JSON.stringify(status.json.result?.status)}`)
  const state = await client.settle('visitor-badge', { quietMs: 300 })
  assert.equal(judgeRun(state, { finalAnswer: status.json.result.finalMessage, claimedDone: true }).verdict, 'pass', state.reason)
  assert.equal(status.images.length, 1, 'no final screenshot came back')
  const image = decodePng(Buffer.from(status.images[0].data, 'base64'))
  assert.deepEqual([image.width, image.height], [VIEWPORT.width, VIEWPORT.height])
  assert.ok(existsSync(join(status.json.trajectory?.run_dir ?? '/nonexistent', 'run.json')), 'the trajectory directory is missing')
  assert.ok(!/control_?url/i.test(JSON.stringify(status.json)), 'the control URL reached the caller')
})

test('the caller cannot answer a consent request: refused by name, nothing bought', { timeout: 150_000 }, async (t) => {
  if (!skipUnless(t, ready && mcp, unjudged || 'the server did not start')) return
  const { task, path } = await planFor('checkout-consent')
  const start = await mcp.callTool('computer_use_start', { task: task.prompt, start_url: task.url, model: 'scripted', plan: path })
  if (start.isError && /resource|browsers/i.test(start.texts.join(' '))) return skipUnless(t, false, start.texts.join(' '))
  const runId = start.json.run_id
  const waiting = await waitFor(runId, 'awaiting_consent')
  assert.equal(waiting.json.state, 'awaiting_consent', 'the purchase never waited for a person')
  assert.equal(waiting.json.waiting_for_person?.class, 'purchase')
  const approve = await mcp.callTool('computer_use_respond', { run_id: runId, question_id: String(waiting.json.waiting_for_person.step), answer: 'yes', approved: true })
  assert.equal(approve.isError, true, 'respond accepted an approval')
  assert.match(approve.texts.join(' '), /'approved' is refused/, 'the approval was not refused by name')
  const answer = await mcp.callTool('computer_use_respond', { run_id: runId, question_id: String(waiting.json.waiting_for_person.step), answer: 'yes, buy it' })
  assert.equal(answer.isError, true, 'a consent request was answered as a question')
  for (const command of ['consent', 'take_over']) {
    const control = await mcp.callTool('computer_use_control', { run_id: runId, command })
    assert.equal(control.isError, true, `control ${command} was accepted from the caller`)
  }
  assert.equal((await mcp.callTool('computer_use_status', { run_id: runId })).json.state, 'awaiting_consent', 'something answered the request')
  await mcp.callTool('computer_use_control', { run_id: runId, command: 'stop', text: 'session-integration verifier' })
  const final = await waitFor(runId, 'finished')
  assert.equal(final.json.state, 'finished')
  assert.equal((await client.taskState('checkout-consent')).facts.records.length, 0, 'an order was placed without a person')
})

test('closing stdin ends the server and leaves no Chrome or profile behind', { timeout: 60_000 }, async (t) => {
  if (!skipUnless(t, Boolean(mcp), 'the server did not start')) return
  mcp.closeInput()
  const exited = await Promise.race([mcp.exited.then(() => true), new Promise((resolve) => setTimeout(() => resolve(false), 15_000))])
  assert.equal(exited, true, 'the server kept running after its stdin closed')
  const exitedAt = Date.now()
  const gone = await settleTo(() => chromeOnSeat() === 0, 20_000)
  t.diagnostic(`Chrome gone ${Date.now() - exitedAt} ms after the server exited`)
  assert.ok(gone, 'Chrome outlived the server by more than 20 s')
  assert.ok(await settleTo(() => seatProfiles().length === 0), `profiles left: ${seatProfiles().join(', ')}`)
})
