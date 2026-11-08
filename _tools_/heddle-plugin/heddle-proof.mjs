#!/usr/bin/env node
/**
 * Proof from heddle (responsibilities 2.0.0, item 3): one headless heddle session, with an isolated HEDDLE_HOME and
 * HOME under /tmp, loads this plugin from a profile row and drives a fixture task through the computer-use MCP server.
 * The plugin's trace shows the final screenshot reached the model request.
 *
 *   node heddle-proof.mjs [--task visitor-badge] [--model claude-gateway/claude-sonnet-5-5] [--session-model claude-sonnet-5-5] [--out /tmp/cu-developer-two-m4/heddle]
 *   node heddle-proof.mjs --env macos-desktop --announced yes [--task badge-form] [--seed m9-proof] [--install yes] [--model ...] [--session-model ...] [--out /tmp/cu-developer-two-m9/heddle]
 *
 * Browser (the default): the fixture site serves the task and judges the outcome.
 * Desktop (Linear CU-15): the same mode as dsh-proof.mjs, from ../computer-use-mcp/desktop-proof.mjs. The desktop
 * suite's own attempt opens the task in the visible CU Fixture app. The session calls computer_use_start with
 * environment macos-desktop and the task's bundle ids, and the fixture's private channel judges. It refuses without
 * --announced yes (D-024). Before anything starts, it makes a private CU_HOME under the isolated HOME, links the
 * installed helper into it (a symlink: the grant belongs to that signed bundle), and copies the owner's tty 'always'
 * records for the task's app(s), and no other, verbatim from the operator's $CU_HOME/app-approvals.json (D-033). If
 * one is missing it refuses (exit 3): it never asks for an approval (C1). The plugin starts the server with heddle's
 * environment, so CU_HOME reaches it. A live desktop run also needs a helper whose peer check accepts the server's
 * checkout (CU-2).
 *
 * With --install yes it tests the owner's install instead: heddle's own shipped default profile, created from its
 * template in the isolated home, with install-rows.mjs's two edits (the plugin row, the tool names in the allow list);
 * a --patch overlay carries only the model endpoint the owner already has.
 * heddle runs from a `git archive` export of the heddle checkout's origin/main under /tmp (the local config's
 * `paths.heddleRepo`, else ~/heddle; heddle's repository is only read), with its runtime dependencies installed there.
 * The owner's heddle home is never used: only the gateway key file is read, at run time, into the child's environment
 * (D-007). Writes <out>/proof.json; prints it. Hard cap 9 minutes.
 */
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DEFAULT_PATHS, localConfig, localPath, resolveModel } from '../agent-core/local-config.mjs'
import { fixtureClient } from '../fixture-site/client.mjs'
import { judgeRun } from '../fixture-site/judge.mjs'
import { startFixtureServer } from '../fixture-site/server.mjs'
import { attemptDesktop, desktopProofFields, desktopRefusal, desktopWarning, parseProofArgs, prepareDesktop, sessionEnv } from '../computer-use-mcp/desktop-proof.mjs'
import { addToolsToAllow, heddleRow } from '../computer-use-mcp/install-rows.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
// This machine's heddle checkout and gateway key file: the local config's paths (or CU_HEDDLE_REPO, CU_KEY_FILE),
// else the home-relative defaults (agent-core/local-config.mjs).
const LOCAL = localConfig()
const HEDDLE_REPO = localPath('heddleRepo', DEFAULT_PATHS.heddleRepo, LOCAL)
const KEY_FILE = localPath('keyFile', DEFAULT_PATHS.keyFile, LOCAL)
const TOOL_NAMES = ['computer_use_start', 'computer_use_status', 'computer_use_respond', 'computer_use_control']
/**
 * heddle's round cap. A status poll returns early on any change, so a desktop run of up to 20 steps can take a poll
 * per step. The browser keeps its 12.
 */
const MAX_ROUNDS = { browser: '12', desktop: '24' }

const options = parseProofArgs(process.argv.slice(2))
const { desktop, install, model: runModel, sessionModel } = options
/** The session model as the gateway knows it: a local-config alias resolves to its real id (it stays out of proof.json). */
const gatewaySessionModel = resolveModel(sessionModel, LOCAL)
const refusal = desktopRefusal(options)
if (refusal !== null) {
  process.stderr.write(`heddle-proof: ${refusal}\n`)
  process.exit(2)
}
const out = resolve(options.out ?? (desktop ? '/tmp/cu-developer-two-m9/heddle' : '/tmp/cu-developer-two-m4/heddle'))
if (!out.startsWith('/tmp/')) throw new Error('--out must be under /tmp')
const home = join(out, 'heddle-home')
for (const sub of ['user', 'work', 'runs', join('heddle-home', 'profiles', 'cu-proof')]) mkdirSync(join(out, sub), { recursive: true })

// Desktop: the private CU_HOME, the helper linked and the owner's approvals copied, before anything starts.
const prepared = desktop ? prepareDesktop({ out, taskId: options.task }) : null
if (prepared?.refusal) {
  process.stderr.write(`heddle-proof: ${prepared.refusal}\n`)
  process.exit(3)
}
if (prepared) process.stderr.write(`${prepared.note}\n`)

// heddle's source: an export of origin/main under /tmp, never a write to its repository.
const commit = execFileSync('git', ['-C', HEDDLE_REPO, 'rev-parse', 'origin/main']).toString().trim()
const src = join('/tmp/cu-developer-two-heddle-src', commit.slice(0, 12))
if (!existsSync(join(src, 'node_modules'))) {
  mkdirSync(src, { recursive: true })
  execFileSync('bash', ['-c', `git -C ${HEDDLE_REPO} archive ${commit} | tar -x -C ${src}`])
  execFileSync('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: src, stdio: 'ignore' })
}

const trace = join(out, 'plugin-trace.jsonl')
writeFileSync(join(home, 'heddle.json'), JSON.stringify({ endpoints: [{ name: 'conclave', inputModalities: ['text', 'image'], maxOutputTokens: 2000 }], default: 'conclave', exclude: ['scripted'] }, null, 2))
writeFileSync(join(home, 'profiles', 'cu-proof', 'cordis.yml'), '[]\n')
const row = (id, file, extra = '') => `    - id: ${id}\n      name: ${join(src, 'src', file)}\n${extra}`
writeFileSync(join(home, 'profiles', 'cu-proof', 'heddle.patch.yml'), `# [cu] M4 heddle proof: the smallest headless tree plus the computer-use plugin (path C).
- insert:
${row('console', 'plugins/console-exporter.ts')}${row('session', 'plugins/session.ts')}${row('model', 'plugins/model.ts', `      config:
        endpoints:
          - name: conclave
            kind: anthropic-messages
            baseUrl: http://127.0.0.1:8088/v1
            model: ${gatewaySessionModel}
`)}${row('context', 'context/service.ts', '      inject: [model, session]\n')}${row('sandbox', 'sandbox/service.ts', '      config:\n        mode: workspace-write\n')}${row('approvals', 'approvals/service.ts', '      config:\n        mode: allow\n')}${row('tools', 'plugins/tools.ts', `      inject: [approvals, sandbox]
      config:
        includeBuiltins: false
        allow: [${TOOL_NAMES.join(', ')}]
`)}    - id: computer-use
      name: ${join(HERE, 'computer-use.mjs')}
      inject: [tools, approvals]
      config:
        serverArgs: ['--seat', 'cu-developer-two', '--runs-dir', '${join(out, 'runs')}', '--key-file', '${KEY_FILE}', '--viewport', '1280x800']
        trace: ${trace}
`)

const profile = install ? 'default' : 'cu-proof'
const extraArgs = []
if (install) {
  // heddle's own template, then exactly the owner's two edits.
  execFileSync(process.execPath, ['--input-type=module', '-e', `import { resetProfileFromTemplate } from ${JSON.stringify(join(src, 'src', 'config', 'profile-template.ts'))}; resetProfileFromTemplate('default', 'default', { checkout: ${JSON.stringify(src)} })`], { env: { ...process.env, HEDDLE_HOME: home, HOME: join(out, 'user') }, stdio: 'ignore' })
  const file = join(home, 'profiles', 'default', 'heddle.patch.yml')
  writeFileSync(file, `${addToolsToAllow(readFileSync(file, 'utf8')).trimEnd()}\n${heddleRow()}`)
  writeFileSync(join(out, 'model.patch.yml'), `- patch:\n    - id: model\n      config:\n        endpoints:\n          - name: conclave\n            kind: anthropic-messages\n            baseUrl: http://127.0.0.1:8088/v1\n            model: ${gatewaySessionModel}\n`)
  extraArgs.push('--patch', join(out, 'model.patch.yml'))
}

const key = readFileSync(KEY_FILE, 'utf8').trim()
// Built from nothing, as before; desktop adds only CU_HOME, which the plugin's server inherits from heddle.
const env = sessionEnv({ HOME: join(out, 'user'), HEDDLE_HOME: home, PATH: `${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin`, HEDDLE_CONCLAVE_API_KEY: key, CU_HEDDLE_TRACE: trace }, { cuHome: prepared?.cuHome })
// The install row keeps the server's default runs directory, under the (isolated) HOME: the private CU_HOME's.
const runsRoot = install ? join(out, 'user', '.computer-use', 'runs') : join(out, 'runs')

/** One headless heddle session on `prompt`; its output is kept under <out>, the key redacted. */
async function runHeddle(prompt) {
  const began = Date.now()
  const rounds = desktop ? MAX_ROUNDS.desktop : MAX_ROUNDS.browser
  const child = spawn(process.execPath, [join(src, 'src', 'cli.ts'), '--profile', profile, ...extraArgs, '--new', '--max-rounds', rounds, '--json', '--turn', prompt], { cwd: join(out, 'work'), env, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })
  const cap = setTimeout(() => child.kill('SIGTERM'), 9 * 60_000)
  const exit = await new Promise((resolveExit) => child.on('exit', (code, signal) => resolveExit({ code, signal })))
  clearTimeout(cap)
  writeFileSync(join(out, 'heddle.json.out'), stdout.replaceAll(key, '<key>'))
  writeFileSync(join(out, 'heddle.err'), stderr.replaceAll(key, '<key>'))
  let session = null
  try { session = JSON.parse(stdout) } catch { session = null }
  return { exit, seconds: Math.round((Date.now() - began) / 1000), session }
}

/** The session's block of proof.json, and whether the final screenshot (by sha256) was added to a model request. */
function heddleFacts(run, finalScreenshot) {
  let finalSha = null
  if (finalScreenshot && existsSync(finalScreenshot)) finalSha = createHash('sha256').update(readFileSync(finalScreenshot)).digest('hex')
  const traced = existsSync(trace) ? readFileSync(trace, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)) : []
  const session = run?.session ?? null
  return {
    heddle: { commit, exit: run?.exit ?? null, seconds: run?.seconds ?? null, sessionModel, rounds: session?.rounds ?? null, finishReason: session?.finishReason ?? null, toolCalls: session?.toolCalls ?? null },
    image: { finalScreenshotSha256: finalSha, sentToModel: traced.some((entry) => entry.event === 'image_sent' && entry.sha256 === finalSha), trace: traced.map(({ event, sha256, bytes }) => ({ event, sha256, bytes })) },
    sessionReply: String(session?.text ?? '').slice(-1500),
  }
}

async function browserProof() {
  const fixture = await startFixtureServer({ port: 0, seed: 13 })
  const client = fixtureClient(fixture)
  const task = (await client.tasks()).tasks.find((candidate) => candidate.id === options.task)
  if (!task) throw new Error(`no fixture task ${options.task}`)
  const prompt = [
    'Use the computer-use tools to do one task in a browser, then report.',
    `1. Call computer_use_start with task ${JSON.stringify(task.prompt)}, start_url ${JSON.stringify(task.url)}, model ${JSON.stringify(runModel)}, max_steps 15, max_minutes 6, max_cost_usd 1.`,
    '2. Call computer_use_status with that run_id and wait_seconds 45, again and again, until state is "finished".',
    "3. Reply with: the result's status and finalMessage, the trajectory run_dir and replay_url, and one sentence on what the final screenshot shows.",
  ].join('\n')
  const run = await runHeddle(prompt)
  const runIds = existsSync(runsRoot) ? readdirSync(runsRoot).sort() : []
  const runDir = runIds.length > 0 ? join(runsRoot, runIds.at(-1)) : null
  const result = runDir && existsSync(join(runDir, 'run.json')) ? JSON.parse(readFileSync(join(runDir, 'run.json'), 'utf8')).result ?? null : null
  if (result?.finalScreenshot && existsSync(result.finalScreenshot)) copyFileSync(result.finalScreenshot, join(out, 'final.png'))
  const { heddle, image, sessionReply } = heddleFacts(run, result?.finalScreenshot)
  const state = await client.settle(task.id)
  const verdict = judgeRun(state, { finalAnswer: result?.finalMessage ?? null, claimedDone: result?.status === 'completed' })
  await fixture.close()
  return {
    when: new Date().toISOString(),
    install,
    heddle,
    image,
    task: { id: task.id, url: task.url },
    run: result && { runId: result.runId, status: result.status, finalMessage: result.finalMessage, steps: result.steps, costUsd: result.usage?.costUsd ?? null, finalScreenshot: result.finalScreenshot, trajectoryDir: result.trajectoryDir },
    verdict,
    sessionReply,
  }
}

async function desktopProof() {
  process.stderr.write(`${desktopWarning({ taskId: prepared.task.id, apps: prepared.apps })}\n`)
  const attempt = await attemptDesktop({ prepared, seed: options.seed, model: runModel, runsRoot, out, toolPrefix: '', runSession: runHeddle })
  const { heddle, image, sessionReply } = heddleFacts(attempt.session, attempt.result?.finalScreenshot)
  return { when: new Date().toISOString(), install, heddle, image, ...desktopProofFields({ prepared, attempt, seed: options.seed }), sessionReply }
}

const proof = desktop ? await desktopProof() : await browserProof()
writeFileSync(join(out, 'proof.json'), JSON.stringify(proof, null, 2))
console.log(JSON.stringify(proof, null, 2))
process.exit(0)
