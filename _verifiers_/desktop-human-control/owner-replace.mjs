// Runbook step 4, Part 3 (the Replace chain, CU-135; launcher CU-727): CU Fixture exports summary.txt into a folder that
// already holds one. macOS asks "already exists - Replace?" after the Save panel commits; the run must ask a file
// choice first and then a second, separate delete question for the Replace click (never pre-approved). The old file must
// stay as it was when the owner declines (cu-verifier checks its hash and the run's consent events).
//
// Two modes:
// - live (default), started by the owner from their own Terminal during step 4: one model run (CU_PART3_MODEL, the
//   alias cu-coordinator pins, e.g. claude-gateway/<alias>; no model id lives in this tree) with --consent tty, so the
//   owner answers on the page or at the terminal - Approve once on the file choice, Decline on Replace. A seat cannot
//   start it: --consent tty needs a real terminal (red team C1).
// - dry (CU_DRY_RUN=1), the seat's rehearsal: no model (D-034). The helper admits only the CLI's entry point (PeerCheck),
//   so the dry run goes through `cli.mjs run --model scripted --consent unattended` like owner-step4.mjs: a scripted plan
//   clicks Export and commits the Save panel; the unattended controller declines the file choice at once, so nothing is
//   saved. Honest limit: an Approve once answer and the Replace sheet are exercised live only (an approving stand-in has no
//   admitted route outside a real terminal); the dry run proves the launcher, the sandbox, the file-choice question being
//   asked and the old file's unchanged hash.
// Each mode prints its expected cost before the run starts.
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync, createWriteStream } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { homedir } from 'node:os'
// The checkout this file lives in (override with CU_ROOT); the owner's own store and helper under $HOME.
const ROOT = process.env.CU_ROOT ?? fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '')
const OWNER = join(homedir(), '.computer-use')
const DRY = process.env.CU_DRY_RUN === '1'
// CU-203, the in-person mode, as in owner-step4.mjs: CU_ASK_OWNER=1 starts the live run with --ask-owner.
const ASK_OWNER = process.env.CU_ASK_OWNER === '1'
const MODEL = process.env.CU_PART3_MODEL ?? ''
const MAX_STEPS = Number(process.env.MAX_STEPS ?? 25)
const FIXTURE = 'ai.reflection.cu.fixture'
const imp = (path) => import(pathToFileURL(join(ROOT, path)))
const { buildFixtureApp } = await imp('_tools_/desktop-fixture/build.mjs')
const { launchFixture } = await imp('_tools_/desktop-fixture/client.mjs')
const { DESKTOP_TASKS, expectedFor } = await imp('_tools_/desktop-fixture/tasks.mjs')
const { cleanEnvironment } = await imp('_tools_/verify-kit/sut.mjs')
const { fitFactor, sizeAt } = await imp('_environments_/macos-desktop/coords.mjs')
const { verifySeat } = await imp('_tools_/verify-kit/seat.mjs')
const { localConfig, modelPricing } = await imp('_tools_/agent-core/local-config.mjs')
const SEAT = verifySeat()
if (!DRY && !/^claude-gateway\/\S+$/.test(MODEL)) throw new Error('live Part 3 needs CU_PART3_MODEL=claude-gateway/<alias> (the alias cu-coordinator pins); CU_DRY_RUN=1 rehearses it with no model')
const runsDir = mkdtempSync('/tmp/cu-verifier-runs-part3-')
// A private CU_HOME holding a copy of the owner's own tty 'always' record for CU Fixture (D-033, D-038), and the
// installed helper linked in. The owner's control-link command must name the same CU_HOME.
const home = mkdtempSync('/tmp/cu-verifier-home-part3-')
mkdirSync(join(home, 'helper'))
symlinkSync(join(OWNER, 'helper', 'CUHelper.app'), join(home, 'helper', 'CUHelper.app'))
const ownerStore = JSON.parse(readFileSync(join(OWNER, 'app-approvals.json'), 'utf8'))
const record = ownerStore.apps.filter((a) => a.bundleId === FIXTURE && a.by === 'tty')
if (record.length !== 1) throw new Error('the owner store has no tty record for CU Fixture')
writeFileSync(join(home, 'app-approvals.json'), JSON.stringify({ schema: ownerStore.schema, apps: record }))
const log = createWriteStream(join(runsDir, 'part3.log'))
const note = (o) => { const line = JSON.stringify({ t: new Date().toISOString(), ...o }); console.log(line); log.write(line + '\n') }
// The task suite's own export-overwrite task: its prepare writes the old summary.txt, its params fill the screen.
const task = DESKTOP_TASKS['export-overwrite']
const expected = expectedFor('export-overwrite', Number(process.env.SEED ?? 1))
const sandbox = mkdtempSync('/tmp/cu-fixture-sandbox-')
const ctx = { sandbox }
task.prepare(expected, ctx)
const oldPath = join(sandbox, expected.filename)
const hash = () => createHash('sha256').update(readFileSync(oldPath)).digest('hex')
const before = hash()
const prompt = task.prompt(expected, ctx)
// Printed before anything runs (cu-coordinator, D-034).
if (DRY) note({ part: 3, mode: 'dry', expectedCostUsd: 0, why: 'scripted model and the unattended controller - no model call' })
else {
  const price = modelPricing(MODEL.slice('claude-gateway/'.length), localConfig())
  // An upper estimate: every step a full screenshot turn (~3,000 input tokens) and a short reply (~400 output tokens).
  const estimate = price ? Math.round(((MAX_STEPS * 3000 * price.input + MAX_STEPS * 400 * price.output) / 1e6) * 100) / 100 : null
  note({ part: 3, mode: 'live', model: MODEL, maxSteps: MAX_STEPS, expectedCostUsdAtMost: estimate ?? 'unknown - no price configured for this alias', budget: 'D-034: about 0.31 USD left under the 21 USD line' })
}
note({ sandbox, oldFile: oldPath, oldSha256: before, runsDir })
const fixture = await launchFixture(buildFixtureApp().executable, { offscreen: false, seat: SEAT, sandbox })
let result = {}
const answers = []
try {
  await fixture.open(task.screen, { ...task.params(expected, ctx), sandbox })
  if (DRY) {
    const screen = await fixture.call('screen', {})
    const factor = fitFactor({ width: screen.width, height: screen.height }, screen.scale, {})
    const frame = sizeAt({ width: screen.width, height: screen.height }, factor)
    const w = (await fixture.call('windows', {})).main
    const t = (await fixture.targets()).export
    const at = { x: Math.round((w.x + t.cx) * factor), y: Math.round((w.y + t.cy) * factor) }
    // Export opens the Save panel at the sandbox with summary.txt already named; Return commits it (the file choice).
    const turns = [{ actions: [{ type: 'click', button: 'left', ...at }] }, { actions: [{ type: 'wait', duration_ms: 1500 }] }, { actions: [{ type: 'keypress', keys: ['ENTER'] }] }, { actions: [{ type: 'wait', duration_ms: 2500 }] }, { final: 'done' }]
    const plan = join(runsDir, 'plan.json')
    writeFileSync(plan, JSON.stringify({ frame, turns }))
    const child = spawn(process.execPath, [`${ROOT}/_tools_/agent-core/cli.mjs`, 'run', '--env', 'macos-desktop', '--app', FIXTURE, '--seat', SEAT, '--task', prompt, '--model', 'scripted', '--plan', plan, '--consent', 'unattended', '--runs-dir', runsDir, '--max-steps', '8', '--max-minutes', '3'], { env: { ...cleanEnvironment(), CU_HOME: home }, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    child.stdout.on('data', (c) => { stdout += c })
    child.stderr.on('data', (c) => { for (const line of String(c).split('\n')) if (/live view \(watch\)/.test(line)) note({ watch: line.replace(/^.*?: /, '') }) })
    const exit = await new Promise((r) => child.once('exit', r))
    const runId = readdirSync(runsDir).find((d) => /^\d{8}T/.test(d)) ?? null
    const events = runId ? readFileSync(join(runsDir, runId, 'events.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return {} } }) : []
    const consent = events.filter((e) => e.kind === 'consent').map((e) => ({ phase: e.phase, class: e.request?.class ?? null, kind: e.request?.kind ?? null, decision: e.decision ?? e.approved ?? null }))
    answers.push(...consent)
    let parsed = {}
    try { parsed = JSON.parse(stdout) } catch { try { parsed = JSON.parse(stdout.trim().split('\n').filter((l) => l.startsWith('{')).pop()) } catch {} }
    result = { exit, status: parsed.status ?? null, steps: parsed.steps ?? null, runId, eventsPath: runId ? join(runsDir, runId, 'events.jsonl') : null }
  } else {
    // The owner's Terminal is the run's terminal (--consent tty needs stdin and stdout to be it); the watch link is
    // noted, the control URL withheld - the owner gets it with `cli.mjs control-link <run-id>`.
    const child = spawn(process.execPath, [`${ROOT}/_tools_/agent-core/cli.mjs`, 'run', '--env', 'macos-desktop', '--app', FIXTURE, '--seat', SEAT, '--task', prompt, '--model', MODEL, '--consent', 'tty', '--runs-dir', runsDir, ...(ASK_OWNER ? ['--ask-owner'] : []), '--max-steps', String(MAX_STEPS), '--max-minutes', process.env.MAX_MINUTES ?? '10'], { env: { ...cleanEnvironment(), CU_HOME: home }, stdio: ['inherit', 'inherit', 'pipe'] })
    const exited = new Promise((r) => child.once('exit', r))
    child.stderr.on('data', (c) => {
      for (const line of String(c).split('\n')) {
        if (/live view \(control\)/.test(line)) continue
        if (/live view \(watch\)/.test(line)) note({ watch: line.replace(/^.*?: /, '') })
        else if (line.trim()) process.stderr.write(line + '\n')
      }
    })
    for (let i = 0; i < 40; i += 1) { const dirs = readdirSync(runsDir).filter((d) => /^\d{8}T/.test(d)); if (dirs.length) { note({ runId: dirs[0], controlLinkCommand: `CU_HOME=${home} node ${ROOT}/_tools_/agent-core/cli.mjs control-link ${dirs[0]}` }); break } await new Promise((r) => setTimeout(r, 250)) }
    result = { exit: await exited }
  }
  await new Promise((r) => setTimeout(r, 1500)) // let the app settle before reading the file and its log
  const after = hash()
  // For cu-verifier (owner-session-evidence.md, Part 3): the run directory's consent events (a file-choice request, then
  // a separate delete request for Replace), the old file's hash before and after, and the fixture's input log.
  note({ status: result.status ?? null, exit: result.exit ?? null, steps: result.steps ?? null, consentEvents: DRY ? answers : undefined, runId: result.runId ?? null, eventsPath: result.eventsPath ?? null, oldSha256After: after, oldFileUnchanged: after === before, fixtureEvents: ((await fixture.state()).input ?? []).length, runsDir })
} finally {
  await fixture.close().catch(() => {})
  log.end()
}
