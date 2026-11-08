import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, before, test } from 'node:test'

import { browserAvailable } from '../../_vendor_/browser-use/lib.mjs'
import { skipUnless } from '../../_vendor_/browser-use/_tools_/verify-runner/lib.mjs'
import { buildPlan, oracleAnswer } from '../../_evaluators_/task-suite/lib.mjs'
import { recordOracle } from '../../_evaluators_/task-suite/run.mjs'
import { fixtureClient } from '../../_tools_/fixture-site/client.mjs'
import { judgeRun } from '../../_tools_/fixture-site/judge.mjs'
import { startFixtureServer } from '../../_tools_/fixture-site/server.mjs'
import { loadSut } from '../../_tools_/verify-kit/sut.mjs'
import { verifySeat } from '../../_tools_/verify-kit/seat.mjs'

/** CU-156: the seat this verifier's browsers and runs use - CU_VERIFY_SEAT, else cu-verifier (verify-kit/seat.mjs). */
const SEAT = verifySeat()

/**
 * Live, opt-in (not run by verify.sh): a real headless DSH session, in an isolated HOME and DSH_HOME under /tmp,
 * loads the computer-use MCP server from a patch overlay and is asked to do a fixture task with it. The session
 * model is billed (an announced batch, D-016); the run model is the scripted oracle plan.
 *
 *   node --test _verifiers_/session-integration/live-dsh-session.mjs
 *
 * Evidence, all outside the session's own account (D-012): the fixture's verdict; DSH's tool-call events naming the
 * server's tools; the final screenshot's bytes found in the isolated DSH home's attachment store, so the image reached
 * the session; the trajectory link in what the session was given. The gateway key is read by the DSH child's own
 * shell at run time and never passes through this check (D-007).
 */

const sut = await loadSut()
// This machine's DSH binary and gateway key file: CU_DSH_BIN and CU_KEY_FILE (the names agent core's local config
// reads too), else the home-relative defaults. The verifier's own code, not agent core's (D-012).
const DSH_BIN = process.env.CU_DSH_BIN || join(homedir(), '.volta/tools/image/packages/@deepseek-ai/dsh/lib/node_modules/@deepseek-ai/dsh/lib/bin.js')
const KEY_FILE = process.env.CU_KEY_FILE || join(homedir(), '.heddle/keys/conclave.api.key')
const GATEWAY = 'http://127.0.0.1:8088'
const SESSION_MODEL = 'claude-sonnet-5-5'
const VIEWPORT = Object.freeze({ width: 1440, height: 900 })

let ready = browserAvailable() && existsSync(DSH_BIN) && existsSync(KEY_FILE)
const unjudged = ready ? '' : 'no Chrome, no DSH binary, or no gateway key file on this machine'
let fixture
let client
let out

before(async () => {
  fixture = await startFixtureServer({ seed: 'session-integration-dsh' })
  client = fixtureClient(fixture)
  out = mkdtempSync('/tmp/cu-verifier-dsh-')
  for (const sub of ['user', 'dsh-home', 'runs']) mkdirSync(join(out, sub), { recursive: true })
})

after(async () => {
  await fixture?.close()
  if (/^\/tmp\/cu-verifier-dsh-[A-Za-z0-9]{6}$/.test(out ?? '')) rmSync(out, { recursive: true, force: true })
})

/** Redact anything key-shaped before text is shown (the check never knows the key, so it redacts by shape). */
const redact = (text) => String(text).replace(/\b(sk-[A-Za-z0-9_-]{8,}|[A-Za-z0-9_-]{40,})\b/g, '[redacted]')

test('a headless DSH session calls the MCP server, the task passes, and the screenshot and trajectory link reach it', { timeout: 600_000 }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  const task = (await client.tasks()).tasks.find((candidate) => candidate.id === 'visitor-badge')
  await client.reset()
  const { actions, state } = await recordOracle(client, task, (await client.taskState(task.id)).expected, SEAT)
  await client.reset()
  const planPath = join(out, 'plan.json')
  writeFileSync(planPath, JSON.stringify(buildPlan(actions, VIEWPORT, oracleAnswer(state))))
  const patchPath = join(out, 'patch.yml')
  writeFileSync(
    patchPath,
    `# cu-verifier's own DSH session: the session model through the gateway, the computer-use MCP server as "cu".
- id: llm-pi-ai
  config:
    providers:
      conclave:
        displayName: Conclave gateway
        apiKeyEnv: CU_GATEWAY_KEY
        api: anthropic-messages
        baseURL: ${GATEWAY}
        models:
          - id: ${SESSION_MODEL}
            name: ${SESSION_MODEL}
            input: [text, image]
            reasoning: true
            contextWindow: 1000000
            maxTokens: 32000
- id: agent-default-model
  config:
    provider: conclave
    model: ${SESSION_MODEL}
- insert:
    - id: mcp-computer-use
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: cu
        transport: stdio
        command: ${process.execPath}
        args: ['${sut.mcpServer}', '--seat', '${SEAT}', '--runs-dir', '${join(out, 'runs')}']
        failOnStartupError: true
`,
  )
  const prompt = [
    'Use the computer-use tools to do one browser task, then report.',
    `1. Call mcp__cu__computer_use_start with task ${JSON.stringify(task.prompt)}, start_url ${JSON.stringify(task.url)}, model "scripted", plan ${JSON.stringify(planPath)}.`,
    '2. Call mcp__cu__computer_use_status with that run_id and wait_seconds 45, again, until state is "finished".',
    "3. Reply with the result's status, the trajectory run_dir and replay_url, and the badge code shown in the final screenshot.",
  ].join('\n')
  // The child's own shell reads the key at run time; this process never holds it (D-007).
  const env = { HOME: join(out, 'user'), PATH: `${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin`, DSH_HOME: join(out, 'dsh-home'), CU_KEY_FILE: KEY_FILE, CU_NODE: process.execPath, CU_DSH: DSH_BIN, CU_PATCH: patchPath, CU_PROMPT: prompt }
  const child = spawn('/bin/sh', ['-c', 'CU_GATEWAY_KEY="$(cat "$CU_KEY_FILE")" exec "$CU_NODE" "$CU_DSH" --profile headless --patch "$CU_PATCH" --json "$CU_PROMPT"'], { cwd: out, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => (stdout += chunk))
  child.stderr.on('data', (chunk) => (stderr = (stderr + chunk).slice(-3000)))
  const cap = setTimeout(() => child.kill('SIGTERM'), 9 * 60_000)
  const exit = await new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })))
  clearTimeout(cap)
  const events = stdout.split('\n').filter(Boolean).map((line) => { try { return JSON.parse(line) } catch { return null } }).filter(Boolean)
  assert.equal(exit.code, 0, `DSH exited ${JSON.stringify(exit)}: ${redact(stderr.slice(-400))}`)
  const calls = events.filter((event) => event.type === 'tool_call').map((event) => event.tool)
  assert.ok(calls.includes('mcp__cu__computer_use_start'), `tool calls: ${calls.join(', ')}`)
  assert.ok(calls.includes('mcp__cu__computer_use_status'), `tool calls: ${calls.join(', ')}`)
  const finalState = await client.settle(task.id, { quietMs: 300 })
  const runs = readdirSync(join(out, 'runs')).filter((name) => /^\d{8}T\d{6}Z-[0-9a-f]{6}$/.test(name)).sort()
  assert.equal(runs.length, 1, `runs: ${runs.join(', ')}`)
  const result = JSON.parse(readFileSync(join(out, 'runs', runs[0], 'run.json'), 'utf8')).result
  assert.equal(judgeRun(finalState, { finalAnswer: result?.finalMessage ?? '', claimedDone: result?.status === 'completed' }).verdict, 'pass', finalState.reason)
  const finalBytes = readFileSync(result.finalScreenshot)
  const objects = join(out, 'dsh-home', 'attachments', 'v1', 'objects')
  const stored = existsSync(objects) ? readdirSync(objects, { recursive: true }).map(String).filter((name) => /^[0-9a-f]{2}\/[0-9a-f]{64}$/.test(name)) : []
  assert.ok(stored.some((name) => readFileSync(join(objects, name)).equals(finalBytes)), `the final screenshot is not among the session's ${stored.length} attachment(s)`)
  const given = events.filter((event) => event.type === 'tool_result' && typeof event.result === 'string' && event.result.includes('"replay_url"'))
  assert.ok(given.length > 0, 'the session was never given a trajectory link')

  // The badge code is drawn at random when the badge is made and is shown only on the page. It is in no file of the
  // run (so no text the server returns can carry it); a reply that holds it was read off the screenshot.
  const code = finalState.facts.records.at(-1)?.code
  assert.match(String(code), /^[A-Z2-9]{5}$/, 'the fixture drew no badge code')
  const runDir = join(join(out, 'runs'), runs[0])
  const runFiles = readdirSync(runDir, { recursive: true }).map((name) => join(runDir, String(name))).filter((path) => statSync(path).isFile())
  assert.deepEqual(runFiles.filter((path) => readFileSync(path).includes(code)), [], 'the code is in a run file, so text could have carried it')
  assert.ok(events.filter((event) => event.type === 'text').map((event) => event.text).join('').includes(code), `the session's reply does not hold the code shown only in the screenshot: ${events.filter((event) => event.type === 'text').map((event) => event.text).join('').slice(-300)}`)
  t.diagnostic(`DSH ${Math.round(events.length)} events; tools ${calls.join(', ')}; run ${runs[0]} ${result.status}`)
})
