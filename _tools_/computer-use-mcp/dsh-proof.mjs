#!/usr/bin/env node
/**
 * Proof from DSH (responsibilities 2.0.0, item 2): one headless DSH session, in an isolated HOME and DSH_HOME under
 * /tmp, loads this MCP server from a patch overlay and drives a fixture task through it. A developer check (D-012): it
 * reports, it does not verify.
 *
 *   node dsh-proof.mjs [--install yes] [--task visitor-badge] [--model claude-gateway/claude-sonnet-5-5] [--session-model claude-sonnet-5-5] [--out /tmp/cu-developer-two-m4/dsh]
 *   node dsh-proof.mjs --env macos-desktop --announced yes [--task badge-form] [--seed m9-proof] [--install yes] [--model ...] [--session-model ...] [--out /tmp/cu-developer-two-m9/dsh]
 *
 * Browser (the default): the fixture site serves the task and judges the outcome from its own state.
 * Desktop (Linear CU-15, desktop-proof.mjs): the desktop suite's own attempt opens the task in the visible CU Fixture
 * app. The session is told to call computer_use_start with environment macos-desktop and the task's bundle ids, and
 * the fixture's private channel judges. It refuses without --announced yes (D-024). Before anything starts, it makes a
 * private CU_HOME under the isolated HOME and links the installed helper into it (a symlink: the grant belongs to that
 * signed bundle). It then copies the owner's tty 'always' records for the task's app(s), and no other, verbatim from
 * the operator's $CU_HOME/app-approvals.json (D-033). If one is missing it refuses (exit 3): it never asks for an
 * approval (C1). A live desktop run also needs a helper whose peer check accepts the checkout the server runs from (CU-2).
 *
 * With --install yes it tests the owner's install row instead: install-rows.mjs's DSH row, as is, in the isolated
 * $DSH_HOME/cordis.patch.yml; the overlay then carries only the model route the owner already has.
 * Never touches ~/.dsh: DSH_HOME and HOME point under --out, which must be under /tmp. The gateway key is read from
 * its file at run time and passed only in the DSH child's environment (D-007); the MCP server gets the file's path.
 * Writes <out>/proof.json and <out>/final.png; prints proof.json. Hard cap 9 minutes.
 */
import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DEFAULT_PATHS, localConfig, localPath, resolveModel } from '../agent-core/local-config.mjs'
import { fixtureClient } from '../fixture-site/client.mjs'
import { judgeRun } from '../fixture-site/judge.mjs'
import { startFixtureServer } from '../fixture-site/server.mjs'
import { attemptDesktop, desktopProofFields, desktopRefusal, desktopWarning, parseProofArgs, prepareDesktop, screenshotReached, sessionEnv } from './desktop-proof.mjs'
import { dshRow } from './install-rows.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
// This machine's DSH and gateway key file: the local config's paths (or CU_DSH_BIN, CU_KEY_FILE), else the
// home-relative defaults (agent-core/local-config.mjs).
const LOCAL = localConfig()
const DSH_BIN = localPath('dshBin', DEFAULT_PATHS.dshBin, LOCAL)
const KEY_FILE = localPath('keyFile', DEFAULT_PATHS.keyFile, LOCAL)
const GATEWAY = 'http://127.0.0.1:8088'

const options = parseProofArgs(process.argv.slice(2))
const { desktop, install, model: runModel, sessionModel } = options
/** The session model as the gateway knows it: a local-config alias resolves to its real id (it stays out of proof.json). */
const gatewaySessionModel = resolveModel(sessionModel, LOCAL)
const refusal = desktopRefusal(options)
if (refusal !== null) {
  process.stderr.write(`dsh-proof: ${refusal}\n`)
  process.exit(2)
}
const out = resolve(options.out ?? (desktop ? '/tmp/cu-developer-two-m9/dsh' : '/tmp/cu-developer-two-m4/dsh'))
if (!out.startsWith('/tmp/')) throw new Error('--out must be under /tmp')
for (const sub of ['user', 'dsh-home', 'runs']) mkdirSync(join(out, sub), { recursive: true })

// Desktop: the private CU_HOME, the helper linked and the owner's approvals copied, before anything starts.
const prepared = desktop ? prepareDesktop({ out, taskId: options.task }) : null
if (prepared?.refusal) {
  process.stderr.write(`dsh-proof: ${prepared.refusal}\n`)
  process.exit(3)
}
if (prepared) process.stderr.write(`${prepared.note}\n`)

const patch = `# [cu] M4 DSH proof overlay: the session model through the gateway, and the computer-use MCP server as "cu".
- id: llm-pi-ai
  config:
    providers:
      conclave:
        displayName: Conclave gateway
        apiKeyEnv: CU_GATEWAY_KEY
        api: anthropic-messages
        baseURL: ${GATEWAY}
        models:
          - id: ${gatewaySessionModel}
            name: ${sessionModel}
            input: [text, image]
            reasoning: true
            contextWindow: 1000000
            maxTokens: 32000
- id: agent-default-model
  config:
    provider: conclave
    model: ${gatewaySessionModel}
${install ? '' : `- insert:
    - id: mcp-computer-use
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: cu
        transport: stdio
        command: ${process.execPath}
        args: ['${join(HERE, 'server.mjs')}', '--seat', 'cu-developer-two', '--runs-dir', '${join(out, 'runs')}', '--key-file', '${KEY_FILE}', '--viewport', '1280x800']
        failOnStartupError: true
`}`
writeFileSync(join(out, 'patch.yml'), patch)
if (install) writeFileSync(join(out, 'dsh-home', 'cordis.patch.yml'), dshRow())

const key = readFileSync(KEY_FILE, 'utf8').trim()
// Built from nothing, as before; desktop adds only CU_HOME, which DSH's MCP client passes on to the server.
const env = sessionEnv({ HOME: join(out, 'user'), PATH: `${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin`, DSH_HOME: join(out, 'dsh-home'), CU_GATEWAY_KEY: key }, { cuHome: prepared?.cuHome })
// The install row keeps the server's default runs directory, under the (isolated) HOME: the private CU_HOME's.
const runsRoot = install ? join(out, 'user', '.computer-use', 'runs') : join(out, 'runs')

/** One headless DSH session on `prompt`; its output is kept under <out>, the key redacted. */
async function runDsh(prompt) {
  const began = Date.now()
  const child = spawn(process.execPath, [DSH_BIN, '--profile', 'headless', '--patch', join(out, 'patch.yml'), '--json', prompt], { cwd: out, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })
  const cap = setTimeout(() => child.kill('SIGTERM'), 9 * 60_000)
  const exit = await new Promise((resolveExit) => child.on('exit', (code, signal) => resolveExit({ code, signal })))
  clearTimeout(cap)
  writeFileSync(join(out, 'dsh.jsonl'), stdout)
  writeFileSync(join(out, 'dsh.err'), stderr.replaceAll(key, '<key>'))
  const events = stdout.split('\n').filter(Boolean).map((line) => { try { return JSON.parse(line) } catch { return null } }).filter(Boolean)
  return { exit, seconds: Math.round((Date.now() - began) / 1000), events }
}

/** What the session shows: its tool calls, and whether the final screenshot reached it as an image attachment. */
function dshFacts(session) {
  const events = session?.events ?? []
  // DSH keeps image blocks content-addressed under attachments/v1/objects (no extension): find the final screenshot there.
  const objects = join(out, 'dsh-home', 'attachments', 'v1', 'objects')
  const attachments = existsSync(objects) ? readdirSync(objects, { recursive: true }).map(String).filter((name) => /^[0-9a-f]{2}\/[0-9a-f]{64}$/.test(name)) : []
  const finalBytes = existsSync(join(out, 'final.png')) ? readFileSync(join(out, 'final.png')) : null
  // DSH may store the block re-encoded (PNG -> WebP), so the match is by bytes, else by pixel size; the evidence says which.
  const reach = finalBytes === null ? { reached: false, identical: false, attachment: null } : screenshotReached(finalBytes, attachments.map((name) => readFileSync(join(objects, name))))
  const imageReachedSession = reach.reached
  const lastStatus = events.filter((event) => event.type === 'tool_result' && typeof event.result === 'string' && event.result.includes('"run_id"')).at(-1)
  let statusBody = null
  try { statusBody = lastStatus ? JSON.parse(lastStatus.result) : null } catch { statusBody = null }
  return {
    dsh: { exit: session?.exit ?? null, seconds: session?.seconds ?? null, sessionModel, toolCalls: events.filter((event) => event.type === 'tool_call').map((event) => event.tool), imageAttachments: attachments.length, finalScreenshotReachedSession: imageReachedSession, finalScreenshotAttachment: reach.attachment === null ? null : { ...reach.attachment, identical: reach.identical } },
    statusBody,
    sessionReply: events.filter((event) => event.type === 'text').map((event) => event.text).join('').slice(-1500),
  }
}

async function browserProof() {
  const fixture = await startFixtureServer({ port: 0, seed: 11 })
  const client = fixtureClient(fixture)
  const { tasks } = await client.tasks()
  const task = tasks.find((candidate) => candidate.id === options.task)
  if (!task) throw new Error(`no fixture task ${options.task}`)
  const prompt = [
    'Use the computer-use tools to do one task in a browser, then report.',
    `1. Call mcp__cu__computer_use_start with task ${JSON.stringify(task.prompt)}, start_url ${JSON.stringify(task.url)}, model ${JSON.stringify(runModel)}, max_steps 15, max_minutes 6, max_cost_usd 1.`,
    '2. Call mcp__cu__computer_use_status with that run_id and wait_seconds 45, again and again, until state is "finished".',
    "3. Reply with: the result's status and finalMessage, the trajectory run_dir and replay_url, and one sentence on what the final screenshot shows.",
  ].join('\n')
  const session = await runDsh(prompt)
  const runIds = existsSync(runsRoot) ? readdirSync(runsRoot) : []
  const runDir = runIds.length > 0 ? join(runsRoot, runIds.sort().at(-1)) : null
  const result = runDir && existsSync(join(runDir, 'run.json')) ? JSON.parse(readFileSync(join(runDir, 'run.json'), 'utf8')).result ?? null : null
  if (result?.finalScreenshot && existsSync(result.finalScreenshot)) copyFileSync(result.finalScreenshot, join(out, 'final.png'))
  const state = await client.settle(task.id)
  const verdict = judgeRun(state, { finalAnswer: result?.finalMessage ?? null, claimedDone: result?.status === 'completed' })
  const { dsh, statusBody, sessionReply } = dshFacts(session)
  await fixture.close()
  return {
    when: new Date().toISOString(),
    install,
    dsh,
    task: { id: task.id, url: task.url },
    run: result && { runId: result.runId, status: result.status, finalMessage: result.finalMessage, steps: result.steps, costUsd: result.usage?.costUsd ?? null, finalScreenshot: result.finalScreenshot, trajectoryDir: result.trajectoryDir, replayUrl: statusBody?.trajectory?.replay_url ?? null },
    verdict,
    sessionReply,
  }
}

async function desktopProof() {
  process.stderr.write(`${desktopWarning({ taskId: prepared.task.id, apps: prepared.apps })}\n`)
  const attempt = await attemptDesktop({ prepared, seed: options.seed, model: runModel, runsRoot, out, toolPrefix: 'mcp__cu__', runSession: runDsh })
  const { dsh, sessionReply } = dshFacts(attempt.session)
  return { when: new Date().toISOString(), install, dsh, ...desktopProofFields({ prepared, attempt, seed: options.seed }), sessionReply }
}

const proof = desktop ? await desktopProof() : await browserProof()
writeFileSync(join(out, 'proof.json'), JSON.stringify(proof, null, 2))
console.log(JSON.stringify(proof, null, 2))
process.exit(0)
