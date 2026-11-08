import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zstdDecompressSync } from 'node:zlib'
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
 * Live, opt-in (not run by verify.sh): a real headless heddle session - heddle's origin/main exported under /tmp,
 * an isolated HEDDLE_HOME and HOME - loads the computer-use heddle plugin from a profile row and is asked to do a
 * fixture task through it. The session model is billed (an announced batch, D-016); the run model is the scripted
 * oracle plan.
 *
 *   node --test _verifiers_/session-integration/live-heddle-session.mjs
 *
 * Evidence outside the system's own account (D-012): the fixture's verdict; the tool names in heddle's own output;
 * the final screenshot's bytes (raw or base64) in a file heddle wrote under its isolated home or its output; the
 * trajectory link in heddle's output. The gateway key is read by the heddle child's own shell at run time (D-007).
 */

const sut = await loadSut()
const HERE = dirname(fileURLToPath(import.meta.url))
// This machine's heddle checkout and gateway key file: CU_HEDDLE_REPO and CU_KEY_FILE (the names agent core's local
// config reads too), else the home-relative defaults. The verifier's own code, not agent core's (D-012).
const HEDDLE_REPO = process.env.CU_HEDDLE_REPO || join(homedir(), 'heddle')
const KEY_FILE = process.env.CU_KEY_FILE || join(homedir(), '.heddle/keys/conclave.api.key')
const SESSION_MODEL = 'claude-sonnet-5-5'
const VIEWPORT = Object.freeze({ width: 1440, height: 900 })
const TOOL_NAMES = ['computer_use_start', 'computer_use_status', 'computer_use_respond', 'computer_use_control']
const PLUGIN = join(HERE, '../../_tools_/heddle-plugin/computer-use.mjs')

let ready = browserAvailable() && existsSync(join(HEDDLE_REPO, '.git')) && existsSync(KEY_FILE) && existsSync(PLUGIN)
const unjudged = ready ? '' : 'no Chrome, no heddle checkout, no plugin, or no gateway key file on this machine'
let fixture
let client
let out

before(async () => {
  fixture = await startFixtureServer({ seed: 'session-integration-heddle' })
  client = fixtureClient(fixture)
  out = mkdtempSync('/tmp/cu-verifier-heddle-')
  for (const sub of ['user', 'work', 'runs', join('heddle-home', 'profiles', 'cu-verify')]) mkdirSync(join(out, sub), { recursive: true })
})

after(async () => {
  await fixture?.close()
  if (/^\/tmp\/cu-verifier-heddle-[A-Za-z0-9]{6}$/.test(out ?? '')) rmSync(out, { recursive: true, force: true })
})

const redact = (text) => String(text).replace(/\b(sk-[A-Za-z0-9_-]{8,}|[A-Za-z0-9_-]{40,})\b/g, '[redacted]')
/**
 * A file's bytes, decompressed when heddle stored it as zstd. Its session transcripts append one zstd frame per line,
 * so every frame is decompressed: split at the frame magic, joining segments where a split fell inside a payload.
 */
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
function zstdFrames(bytes) {
  const starts = []
  for (let at = bytes.indexOf(ZSTD_MAGIC); at >= 0; at = bytes.indexOf(ZSTD_MAGIC, at + 1)) starts.push(at)
  const parts = []
  let i = 0
  while (i < starts.length) {
    let j = i + 1
    for (;;) {
      try {
        parts.push(zstdDecompressSync(bytes.subarray(starts[i], j < starts.length ? starts[j] : bytes.length)))
        break
      } catch (error) {
        if (j >= starts.length) throw error
        j += 1
      }
    }
    i = j
  }
  return Buffer.concat(parts)
}
const contentOf = (path) => (path.endsWith('.zstd') ? zstdFrames(readFileSync(path)) : readFileSync(path))
const filesUnder = (dir) => (existsSync(dir) ? readdirSync(dir, { recursive: true }).map((name) => join(dir, String(name))).filter((path) => statSync(path).isFile()) : [])

/** heddle's source at origin/main, exported under /tmp with its runtime dependencies; its repository is only read. */
function heddleSource() {
  const commit = execFileSync('git', ['-C', HEDDLE_REPO, 'rev-parse', 'origin/main']).toString().trim()
  const src = join('/tmp/cu-verifier-heddle-src', commit.slice(0, 12))
  if (!existsSync(join(src, 'node_modules'))) {
    mkdirSync(src, { recursive: true })
    execFileSync('bash', ['-c', `git -C ${HEDDLE_REPO} archive ${commit} | tar -x -C ${src}`])
    execFileSync('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: src, stdio: 'ignore' })
  }
  return { src, commit }
}

test('a headless heddle session calls computer use through the plugin, the task passes, and the screenshot and trajectory link reach it', { timeout: 600_000 }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  const { src, commit } = heddleSource()
  const task = (await client.tasks()).tasks.find((candidate) => candidate.id === 'visitor-badge')
  await client.reset()
  const { actions, state } = await recordOracle(client, task, (await client.taskState(task.id)).expected, SEAT)
  await client.reset()
  const planPath = join(out, 'plan.json')
  writeFileSync(planPath, JSON.stringify(buildPlan(actions, VIEWPORT, oracleAnswer(state))))
  const home = join(out, 'heddle-home')
  writeFileSync(join(home, 'heddle.json'), JSON.stringify({ endpoints: [{ name: 'conclave', inputModalities: ['text', 'image'], maxOutputTokens: 2000 }], default: 'conclave', exclude: ['scripted'] }, null, 2))
  writeFileSync(join(home, 'profiles', 'cu-verify', 'cordis.yml'), '[]\n')
  const row = (id, file, extra = '') => `    - id: ${id}\n      name: ${join(src, 'src', file)}\n${extra}`
  writeFileSync(
    join(home, 'profiles', 'cu-verify', 'heddle.patch.yml'),
    `# cu-verifier's own heddle session: a small headless tree plus the computer-use plugin.
- insert:
${row('console', 'plugins/console-exporter.ts')}${row('session', 'plugins/session.ts')}${row('model', 'plugins/model.ts', `      config:
        endpoints:
          - name: conclave
            kind: anthropic-messages
            baseUrl: http://127.0.0.1:8088/v1
            model: ${SESSION_MODEL}
`)}${row('context', 'context/service.ts', '      inject: [model, session]\n')}${row('sandbox', 'sandbox/service.ts', '      config:\n        mode: workspace-write\n')}${row('approvals', 'approvals/service.ts', '      config:\n        mode: allow\n')}${row('tools', 'plugins/tools.ts', `      inject: [approvals, sandbox]
      config:
        includeBuiltins: false
        allow: [${TOOL_NAMES.join(', ')}]
`)}    - id: computer-use
      name: ${PLUGIN}
      inject: [tools, approvals]
      config:
        server: ${sut.mcpServer}
        serverArgs: ['--seat', '${SEAT}', '--runs-dir', '${join(out, 'runs')}']
`,
  )
  const prompt = [
    'Use the computer-use tools to do one browser task, then report.',
    `1. Call computer_use_start with task ${JSON.stringify(task.prompt)}, start_url ${JSON.stringify(task.url)}, model "scripted", plan ${JSON.stringify(planPath)}.`,
    '2. Call computer_use_status with that run_id and wait_seconds 45, again, until state is "finished".',
    "3. Reply with the result's status, the trajectory run_dir and replay_url, and the badge code shown in the final screenshot.",
  ].join('\n')
  const env = { HOME: join(out, 'user'), HEDDLE_HOME: home, PATH: `${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin`, CU_KEY_FILE: KEY_FILE, CU_NODE: process.execPath, CU_CLI: join(src, 'src', 'cli.ts'), CU_PROMPT: prompt }
  const child = spawn('/bin/sh', ['-c', 'HEDDLE_CONCLAVE_API_KEY="$(cat "$CU_KEY_FILE")" exec "$CU_NODE" "$CU_CLI" --profile cu-verify --new --max-rounds 12 --json --turn "$CU_PROMPT"'], { cwd: join(out, 'work'), env, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => (stdout += chunk))
  child.stderr.on('data', (chunk) => (stderr = (stderr + chunk).slice(-3000)))
  const cap = setTimeout(() => child.kill('SIGTERM'), 9 * 60_000)
  const exit = await new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })))
  clearTimeout(cap)
  assert.equal(exit.code, 0, `heddle exited ${JSON.stringify(exit)}: ${redact(stderr.slice(-400))}`)
  for (const name of ['computer_use_start', 'computer_use_status']) assert.ok(stdout.includes(name), `heddle's output never names ${name}`)
  const finalState = await client.settle(task.id, { quietMs: 300 })
  const runs = readdirSync(join(out, 'runs')).filter((name) => /^\d{8}T\d{6}Z-[0-9a-f]{6}$/.test(name)).sort()
  assert.equal(runs.length, 1, `runs: ${runs.join(', ')}`)
  const result = JSON.parse(readFileSync(join(out, 'runs', runs[0], 'run.json'), 'utf8')).result
  assert.equal(judgeRun(finalState, { finalAnswer: result?.finalMessage ?? '', claimedDone: result?.status === 'completed' }).verdict, 'pass', finalState.reason)
  const png = readFileSync(result.finalScreenshot)
  const base64 = png.toString('base64')
  const written = [...filesUnder(home), ...filesUnder(join(out, 'work'))]
  const holding = written.filter((path) => { const bytes = contentOf(path); return bytes.includes(png) || bytes.includes(base64) })
  writeFileSync(join(out, 'heddle.out'), stdout)
  const inOutput = stdout.includes(base64)
  // heddle keeps no image in its transcript (seen 2026-11-01), so the screenshot's arrival is proven by what was read
  // off it, below; bytes found anywhere are reported as extra evidence.
  t.diagnostic(`screenshot bytes found in ${holding.length} heddle file(s)${inOutput ? ' and the output' : ''}`)
  assert.ok(/replay_url|\/runs\//.test(stdout) || holding.some((path) => readFileSync(path, 'utf8').includes('replay_url')), 'the session was never given a trajectory link')

  // The badge code is drawn at random when the badge is made and is shown only on the page. It is in no file of the
  // run (so no text the server returns can carry it); a reply that holds it was read off the screenshot.
  const code = finalState.facts.records.at(-1)?.code
  assert.match(String(code), /^[A-Z2-9]{5}$/, 'the fixture drew no badge code')
  const runDir = join(join(out, 'runs'), runs[0])
  const runFiles = readdirSync(runDir, { recursive: true }).map((name) => join(runDir, String(name))).filter((path) => statSync(path).isFile())
  assert.deepEqual(runFiles.filter((path) => readFileSync(path).includes(code)), [], 'the code is in a run file, so text could have carried it')
  assert.ok((() => { try { return String(JSON.parse(stdout).text ?? '') } catch { return '' } })().includes(code), `the session's reply does not hold the code shown only in the screenshot: ${(() => { try { return String(JSON.parse(stdout).text ?? '') } catch { return '' } })().slice(-300)}`)
  t.diagnostic(`heddle ${commit.slice(0, 9)}; run ${runs[0]} ${result.status}; screenshot found in ${holding.length} file(s)${inOutput ? ' and the output' : ''}`)
})
