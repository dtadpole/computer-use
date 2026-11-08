// Runbook step 4 (cu-verifier, CU-11): human control with the owner present. A long scripted run in CU Fixture (click a field,
// type one character, wait 4 s, ten times). The owner, at the Mac mini: presses a key (the run must pause before its
// next synthetic event), then in the live view resumes, takes over, hands back and stops. The control URL is withheld
// from this process: only the watch URL and the run id are kept; the owner gets the control link with
// `cli.mjs control-link <run-id>` in their own Terminal.
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync, createWriteStream } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
// The checkout this file lives in (override with CU_ROOT); the owner's own store and helper under $HOME.
const ROOT = process.env.CU_ROOT ?? fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '')
const OWNER = join(homedir(), '.computer-use')
// CU-203, the in-person mode: CU_ASK_OWNER=1 starts the run with --ask-owner, so the lock refusing it while the owner
// is at the Mac opens the helper's prompt; his deliberate click there starts it (owner-checklist.md). Over Screen Sharing
// leave it unset - the run then waits for 5 minutes hands-off.
const ASK_OWNER = process.env.CU_ASK_OWNER === '1'
const { buildFixtureApp } = await import(`${ROOT}/_tools_/desktop-fixture/build.mjs`)
const { launchFixture } = await import(`${ROOT}/_tools_/desktop-fixture/client.mjs`)
const { cleanEnvironment } = await import(`${ROOT}/_tools_/verify-kit/sut.mjs`)
const { fitFactor, sizeAt } = await import(`${ROOT}/_environments_/macos-desktop/coords.mjs`)
// The run's seat (CU-156): CU_VERIFY_SEAT or the default, never a literal.
const { verifySeat } = await import(`${ROOT}/_tools_/verify-kit/seat.mjs`)
const SEAT = verifySeat()
const runsDir = mkdtempSync('/tmp/cu-verifier-runs-step4-')
// A private CU_HOME holding a copy of the owner's own tty 'always' record for CU Fixture (D-033, D-038), and the
// installed helper linked in. The owner's control-link command must name the same CU_HOME.
const home = mkdtempSync('/tmp/cu-verifier-home-step4-')
mkdirSync(join(home, 'helper'))
symlinkSync(join(OWNER, 'helper', 'CUHelper.app'), join(home, 'helper', 'CUHelper.app'))
const ownerStore = JSON.parse(readFileSync(join(OWNER, 'app-approvals.json'), 'utf8'))
const record = ownerStore.apps.filter((a) => a.bundleId === 'ai.reflection.cu.fixture' && a.by === 'tty')
if (record.length !== 1) throw new Error('the owner store has no tty record for CU Fixture')
writeFileSync(join(home, 'app-approvals.json'), JSON.stringify({ schema: ownerStore.schema, apps: record }))
const log = createWriteStream(join(runsDir, 'step4.log'))
const note = (o) => { const line = JSON.stringify({ t: new Date().toISOString(), ...o }); console.log(line); log.write(line + '\n') }
const fixture = await launchFixture(buildFixtureApp().executable, { offscreen: false })
try {
  await fixture.open('badge-form', {})
  const screen = await fixture.call('screen', {})
  const factor = fitFactor({ width: screen.width, height: screen.height }, screen.scale, {})
  const frame = sizeAt({ width: screen.width, height: screen.height }, factor)
  const w = (await fixture.call('windows', {})).main
  const t = (await fixture.targets()).name
  const at = { x: Math.round((w.x + t.cx) * factor), y: Math.round((w.y + t.cy) * factor) }
  const turns = []
  // ~4.8 s per round while running (measured on 0.2.25, 2026-11-06): 40 rounds give ~3.2 active minutes, so run step 4
  // with ROUNDS=80 (~6.5 min) to leave the owner time to open the control link and act;
  // a pause or take-over stops the clock on rounds (the run waits), and --max-minutes caps the whole run.
  const ROUNDS = Number(process.env.ROUNDS ?? 40)
  for (let i = 0; i < ROUNDS; i += 1) {
    turns.push({ actions: [{ type: 'click', button: 'left', ...at }] }, { actions: [{ type: 'type', text: String.fromCharCode(97 + (i % 26)) }] }, { actions: [{ type: 'wait', duration_ms: 4000 }] })
  }
  turns.push({ final: 'done' })
  const plan = join(runsDir, 'plan.json')
  writeFileSync(plan, JSON.stringify({ frame, turns }))
  const child = spawn(process.execPath, [`${ROOT}/_tools_/agent-core/cli.mjs`, 'run', '--env', 'macos-desktop', '--app', 'ai.reflection.cu.fixture', '--seat', SEAT, '--task', 'Fill the name field slowly.', '--model', 'scripted', '--plan', plan, '--consent', 'unattended', '--runs-dir', runsDir, ...(ASK_OWNER ? ['--ask-owner'] : []), '--max-steps', String(ROUNDS * 3 + 10), '--max-minutes', process.env.MAX_MINUTES ?? '15'], { env: { ...cleanEnvironment(), CU_HOME: home }, stdio: ['ignore', 'pipe', 'pipe'] })
  // Captured at once: a run that fails fast (e.g. refused by the run lock) can exit before the run-id loop below ends,
  // and an 'exit' listener attached after that never fires (the script hung, 2026-11-06 07:59Z).
  const exited = new Promise((r) => child.once('exit', r))
  let stdout = ''
  child.stdout.on('data', (c) => (stdout += c))
  child.stderr.on('data', (c) => {
    for (const line of String(c).split('\n')) {
      if (/live view \(control\)/.test(line)) continue // withheld: the owner gets it from control-link
      if (/live view \(watch\)/.test(line)) note({ watch: line.replace(/^.*?: /, '') })
    }
  })
  // The run id is the run directory's name, created at start (before the lock, so also while its prompt waits).
  for (let i = 0; i < 40; i += 1) { const dirs = readdirSync(runsDir).filter((d) => /^\d{8}T/.test(d)); if (dirs.length) { note({ runId: dirs[0], controlLinkCommand: `CU_HOME=${home} node ${ROOT}/_tools_/agent-core/cli.mjs control-link ${dirs[0]}` }); break } await new Promise((r) => setTimeout(r, 250)) }
  const code = await exited
  let result = {}
  try { result = JSON.parse(stdout) } catch { try { result = JSON.parse(stdout.trim().split('\n').filter((l) => l.startsWith('{')).pop()) } catch {} }
  await new Promise((r) => setTimeout(r, 1500)) // let the app settle before reading its log
  const input = (await fixture.state()).input ?? []
  note({ exit: code, status: result.status, steps: result.steps, actions: result.actions, fixtureEvents: input.length, untagged: input.filter((e) => e.tag !== 1129665349).length, runsDir })
} finally {
  await fixture.close().catch(() => {})
  log.end()
}
