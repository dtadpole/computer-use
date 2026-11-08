#!/usr/bin/env node
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { dshRow, heddleRow, TOOL_NAMES } from '../../_tools_/computer-use-mcp/install-rows.mjs'
import { DESKTOP_TASKS, expectedFor, taskState } from '../../_tools_/desktop-fixture/tasks.mjs'
import { judgeRun } from '../../_tools_/fixture-site/judge.mjs'
import apply, { IMAGE_NOTE } from '../../_tools_/heddle-plugin/computer-use.mjs'
import { createMcpClient } from '../../_tools_/heddle-plugin/mcp-client.mjs'
import { alwaysApproved, FIXTURE } from './desktop-fake.mjs'

/**
 * A no-model end-to-end example (CU-57): one CU Fixture read task taken through the whole client cycle, the way DSH
 * (its MCP client, with the owner's install row) or heddle (the plugin, with its row) drives computer use, and judged
 * by the fixture's own judge. The cycle: initialize and list the tools; start with environment and apps; answer the
 * agent's question with computer_use_respond; pause, see it paused, resume; poll to the end; read the result, the
 * trajectory and the final screenshot; judge the answer.
 *
 * What stands in, and why it is honest: the model is a scripted plan (no key is read: the row's key file does not
 * exist), the desktop is the fake helper behind desktop-server.mjs (the one seam the shipped command line cannot set;
 * every other argument is the install row's own), and the app's facts are empty - the fake has no app to change and
 * the plan's only action is a wait - so the judge's verdict turns on the answer, as on a real read task. The fixture's
 * oracle plans are semantic (its private channel), so they are not replayed here: this proves the integration
 * surfaces, not an app outcome. Run it: `node _tests_/computer-use-mcp/no-model-example.mjs dsh|heddle [--wrong]`.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')
const DESKTOP_SERVER = join(HERE, 'desktop-server.mjs')
export const TASK_ID = 'read-balance'

/** The flow-style `args: [...]` or `serverArgs: [...]` list of an install row, as strings. */
export function rowList(row, key) {
  const match = new RegExp(`${key}: \\[(.*)\\]`).exec(row)
  if (match === null) throw new Error(`no ${key} in the row`)
  return match[1].split(',').map((part) => part.trim().replace(/^'|'$/g, ''))
}

/**
 * The server's arguments for one way in, from the owner's install row itself: for DSH the row's `args` with its
 * server.mjs swapped for the fake-helper entry, for heddle the plugin row's `serverArgs` after that entry. Both get a
 * private runs directory.
 */
export function serverArgs(via, { keyFile, runsDir }) {
  const options = { project: REPO, seat: 'cu-example', keyFile }
  if (via === 'dsh') {
    const [entry, ...rest] = rowList(dshRow(options), 'args')
    if (!entry.endsWith('/_tools_/computer-use-mcp/server.mjs')) throw new Error(`the DSH row starts ${entry}, not server.mjs`)
    return [DESKTOP_SERVER, ...rest, '--runs-dir', runsDir]
  }
  if (via === 'heddle') return [DESKTOP_SERVER, ...rowList(heddleRow(options), 'serverArgs'), '--runs-dir', runsDir]
  throw new Error(`unknown way in '${via}': dsh or heddle`)
}

/** One way in as `call(name, args)` -> `{ isError, text, json, images }`, plus how the final screenshot reaches the model. */
function connect(via, client) {
  const parse = (text) => { try { return JSON.parse(text) } catch { return null } }
  if (via === 'dsh') {
    return {
      call: async (name, args) => {
        const result = await client.callTool(name, args)
        const text = result.content.filter((part) => part.type === 'text').map((part) => part.text).join('\n')
        return { isError: result.isError === true, text, json: parse(text), images: result.content.filter((part) => part.type === 'image') }
      },
      // DSH's MCP client hands a tool result's image part to the model with that result.
      screenshotToModel: (last) => last.images.map((image) => Buffer.from(image.data, 'base64')),
      toolNames: TOOL_NAMES.map((name) => `mcp__cu__${name}`),
    }
  }
  const tools = new Map()
  let listener = null
  apply({ tools: { register: ({ spec, run }) => tools.set(spec.name, { spec, run }) }, on: (event, fn) => { if (event === 'model/request') listener = fn } }, { client })
  return {
    call: async (name, args) => {
      const result = await tools.get(name).run(args, { session: { id: 'example' } })
      return { isError: result.error !== undefined, text: result.output, json: parse(result.output), images: [] }
    },
    // heddle's tool results are text: the plugin sends the screenshot once, with the session's next model request.
    screenshotToModel: () => {
      const next = { sessionId: 'example', messages: [{ role: 'user', content: 'next' }] }
      const request = listener(next, () => next) // heddle calls `next()` without arguments
      const parts = request.messages[1]?.content ?? []
      return parts[0]?.text === IMAGE_NOTE ? parts.filter((part) => part.type === 'image').map((part) => Buffer.from(part.data, 'base64')) : []
    },
    toolNames: [...tools.keys()],
  }
}

async function until(call, runId, done, log) {
  for (let i = 0; i < 60; i += 1) {
    const status = await call('computer_use_status', { run_id: runId, wait_seconds: 1 })
    if (status.isError) throw new Error(`status failed: ${status.text}`)
    if (done(status.json)) return status
  }
  log('status: gave up waiting')
  throw new Error('the run did not reach the state the example waits for')
}

/**
 * Run the example once. `answer` overrides the scripted model's final answer (a wrong one must fail the judge).
 * Returns `{ transcript, final, verdict, screenshots, toolNames, rowArgs }`; nothing outlives the call.
 */
export async function runExample({ via = 'dsh', seed = 'cu-57', answer } = {}) {
  const dir = mkdtempSync(join(tmpdir(), `cu-example-${via}-`))
  const transcript = []
  const log = (line) => transcript.push(`${via}: ${line}`)
  const expected = expectedFor(TASK_ID, seed)
  // D-057: a read task's answer is the closing ANSWER line, judged strictly.
  const finalAnswer = answer ?? `The ${expected.account} account's balance is ${expected.balance}.\nANSWER: ${expected.balance}`
  const plan = join(dir, 'plan.json')
  writeFileSync(plan, JSON.stringify({ turns: [
    { ask: 'Should I give the balance exactly as shown, with its currency sign?' },
    { actions: [{ type: 'wait', duration_ms: 1500 }] },
    { final: finalAnswer },
  ] }))
  const cuHome = join(dir, 'home')
  alwaysApproved(join(cuHome, 'app-approvals.json')) // the approval a person gave earlier; no tool call approves anything
  const rowArgs = serverArgs(via, { keyFile: join(dir, 'no-such-key'), runsDir: join(dir, 'runs') })
  const client = createMcpClient({ args: rowArgs, env: { PATH: process.env.PATH, HOME: process.env.HOME, CU_HOME: cuHome } })
  try {
    const { call, screenshotToModel, toolNames } = connect(via, client)
    log(`tools the model sees: ${toolNames.join(', ')}`)
    const started = await call('computer_use_start', {
      task: DESKTOP_TASKS[TASK_ID].prompt(expected), environment: 'macos-desktop', apps: [FIXTURE], model: 'scripted', plan, live_view: false,
    })
    if (started.isError) throw new Error(`start refused: ${started.text}`)
    const runId = started.json.run_id
    log(`computer_use_start -> run ${runId} (${started.json.environment}, view_url ${started.json.view_url})`)

    const asked = await until(call, runId, (body) => body.question !== null || body.state === 'finished', log)
    const question = asked.json.question
    log(`computer_use_status -> question ${question.question_id}: ${question.text}`)
    const responded = await call('computer_use_respond', { run_id: runId, question_id: question.question_id, answer: 'Yes, exactly as shown.' })
    log(`computer_use_respond -> ${responded.text}`)

    const paused = await call('computer_use_control', { run_id: runId, command: 'pause' })
    log(`computer_use_control pause -> ${paused.text}`)
    const whilePaused = await call('computer_use_status', { run_id: runId })
    log(`computer_use_status -> ${whilePaused.json.state}`)
    const resumed = await call('computer_use_control', { run_id: runId, command: 'resume' })
    log(`computer_use_control resume -> ${resumed.text}`)

    const final = await until(call, runId, (body) => body.state === 'finished', log)
    const { result, trajectory } = final.json
    log(`computer_use_status -> finished ${result.status}: ${result.finalMessage}`)
    log(`trajectory ${trajectory.run_dir} (replay: ${trajectory.replay_command})`)
    const screenshots = screenshotToModel(final)
    log(`final screenshot to the model: ${screenshots.length} image(s)`)

    // The fixture's own judge: the app's facts (none can change on the fake) and the answer the run gave.
    const state = taskState(TASK_ID, expected, { events: [] })
    const verdict = judgeRun(state, { finalAnswer: result.finalMessage ?? '', claimedDone: result.status === 'completed', asked: true })
    log(`judge: ${verdict.verdict}`)
    return {
      transcript,
      started: started.json,
      question,
      responded: responded.json,
      paused: paused.json,
      pausedState: whilePaused.json.state,
      resumed: resumed.json,
      final: final.json,
      trajectoryOk: existsSync(join(trajectory.run_dir, 'run.json')) && existsSync(join(trajectory.run_dir, 'events.jsonl')),
      screenshotMatches: screenshots.length === 1 && screenshots[0].equals(readFileSync(result.finalScreenshot)),
      screenshots: screenshots.length,
      verdict,
      expected,
      toolNames,
      rowArgs,
    }
  } finally {
    await client.close({ graceMs: 10_000 })
    rmSync(dir, { recursive: true, force: true })
  }
}

// Started as a program, through any symlink (macOS /tmp is one): process.argv[1] keeps the link while import.meta.url
// is the real file, so the two are compared as real paths; compared as given, a start via /tmp did nothing (CU-79).
const startedAsProgram = () => {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}
if (process.argv[1] && startedAsProgram()) {
  const via = process.argv[2] ?? 'dsh'
  const wrong = process.argv.includes('--wrong')
  const outcome = await runExample({ via, ...(wrong ? { answer: 'The balance is $0.00.\nANSWER: $0.00' } : {}) })
  for (const line of outcome.transcript) console.log(line)
  const ok = outcome.verdict.verdict === (wrong ? 'wrong-answer' : 'pass')
  process.exitCode = ok ? 0 : 1
}
