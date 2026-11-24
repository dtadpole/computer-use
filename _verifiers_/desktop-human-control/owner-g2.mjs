// Runbook step 4, Part 2 (G2, CU-119; launcher CU-727): your input during a key hold, with the owner present. A scripted
// run in CU Fixture clicks the name field, then holds one key down for a few seconds at a time, with short gaps, for
// about a minute. The owner, at the Mac mini, presses any key once while a hold is on: the held key must come up at
// once and the run pause (sender local_input) before any further synthetic event; the page names the held key and
// offers Resume; the owner then presses Stop. Live only - a scripted stand-in cannot act during a hold (CU-343), so a
// dry run of this launcher (no press) proves the plan, the logging and the watch link only.
// The control URL is withheld from this process, as in owner-step4.mjs: only the watch URL and the run id are kept;
// the owner gets the control link with `cli.mjs control-link <run-id>` in their own Terminal.
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync, createWriteStream } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
// The checkout this file lives in (override with CU_ROOT); the owner's own store and helper under $HOME.
const ROOT = process.env.CU_ROOT ?? fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '')
const OWNER = join(homedir(), '.computer-use')
// CU-203, the in-person mode, as in owner-step4.mjs: CU_ASK_OWNER=1 starts the run with --ask-owner.
const ASK_OWNER = process.env.CU_ASK_OWNER === '1'
// The held key (cu-verifier names it on the page; a modifier types nothing while held), each hold's length, the gap
// after it and the number of holds. hold_key's duration is capped by agent core (actions.mjs WAIT_MAX_MS, 10 s).
const KEY = process.env.HOLD_KEY ?? 'shift'
const HOLD_MS = Number(process.env.HOLD_MS ?? 6000)
const GAP_MS = Number(process.env.GAP_MS ?? 3000)
const HOLDS = Number(process.env.HOLDS ?? 7)
const { buildFixtureApp } = await import(`${ROOT}/_tools_/desktop-fixture/build.mjs`)
const { launchFixture } = await import(`${ROOT}/_tools_/desktop-fixture/client.mjs`)
const { cleanEnvironment } = await import(`${ROOT}/_tools_/verify-kit/sut.mjs`)
const { fitFactor, sizeAt } = await import(`${ROOT}/_environments_/macos-desktop/coords.mjs`)
const { verifySeat } = await import(`${ROOT}/_tools_/verify-kit/seat.mjs`)
const SEAT = verifySeat()
const runsDir = mkdtempSync('/tmp/cu-verifier-runs-g2-')
// A private CU_HOME holding a copy of the owner's own tty 'always' record for CU Fixture (D-033, D-038), and the
// installed helper linked in. The owner's control-link command must name the same CU_HOME.
const home = mkdtempSync('/tmp/cu-verifier-home-g2-')
mkdirSync(join(home, 'helper'))
symlinkSync(join(OWNER, 'helper', 'CUHelper.app'), join(home, 'helper', 'CUHelper.app'))
const ownerStore = JSON.parse(readFileSync(join(OWNER, 'app-approvals.json'), 'utf8'))
const record = ownerStore.apps.filter((a) => a.bundleId === 'ai.reflection.cu.fixture' && a.by === 'tty')
if (record.length !== 1) throw new Error('the owner store has no tty record for CU Fixture')
writeFileSync(join(home, 'app-approvals.json'), JSON.stringify({ schema: ownerStore.schema, apps: record }))
const log = createWriteStream(join(runsDir, 'g2.log'))
const note = (o) => { const line = JSON.stringify({ t: new Date().toISOString(), ...o }); console.log(line); log.write(line + '\n') }
const fixture = await launchFixture(buildFixtureApp().executable, { offscreen: false, seat: SEAT })
try {
  await fixture.open('badge-form', {})
  const screen = await fixture.call('screen', {})
  const factor = fitFactor({ width: screen.width, height: screen.height }, screen.scale, {})
  const frame = sizeAt({ width: screen.width, height: screen.height }, factor)
  const w = (await fixture.call('windows', {})).main
  const t = (await fixture.targets()).name
  const at = { x: Math.round((w.x + t.cx) * factor), y: Math.round((w.y + t.cy) * factor) }
  const turns = [{ actions: [{ type: 'click', button: 'left', ...at }] }]
  for (let i = 0; i < HOLDS; i += 1) {
    turns.push({ actions: [{ type: 'hold_key', keys: [KEY], duration_ms: HOLD_MS }] }, { actions: [{ type: 'wait', duration_ms: GAP_MS }] })
  }
  turns.push({ final: 'done' })
  const plan = join(runsDir, 'plan.json')
  writeFileSync(plan, JSON.stringify({ frame, turns }))
  note({ part: 2, key: KEY, holdMs: HOLD_MS, gapMs: GAP_MS, holds: HOLDS, plan })
  // Printed before the run starts (cu-coordinator, D-034): a scripted plan makes no model call.
  note({ expectedCostUsd: 0, why: 'scripted model - no model call' })
  const child = spawn(process.execPath, [`${ROOT}/_tools_/agent-core/cli.mjs`, 'run', '--env', 'macos-desktop', '--app', 'ai.reflection.cu.fixture', '--seat', SEAT, '--task', 'Hold a key in the name field for a while.', '--model', 'scripted', '--plan', plan, '--consent', 'unattended', '--runs-dir', runsDir, ...(ASK_OWNER ? ['--ask-owner'] : []), '--max-steps', String(HOLDS * 2 + 10), '--max-minutes', process.env.MAX_MINUTES ?? '10'], { env: { ...cleanEnvironment(), CU_HOME: home }, stdio: ['ignore', 'pipe', 'pipe'] })
  // Captured at once (owner-step4.mjs, 2026-11-06 07:59Z): a run refused fast can exit before the run-id loop ends.
  const exited = new Promise((r) => child.once('exit', r))
  let stdout = ''
  child.stdout.on('data', (c) => (stdout += c))
  child.stderr.on('data', (c) => {
    for (const line of String(c).split('\n')) {
      if (/live view \(control\)/.test(line)) continue // withheld: the owner gets it from control-link
      if (/live view \(watch\)/.test(line)) note({ watch: line.replace(/^.*?: /, '') })
    }
  })
  for (let i = 0; i < 40; i += 1) { const dirs = readdirSync(runsDir).filter((d) => /^\d{8}T/.test(d)); if (dirs.length) { note({ runId: dirs[0], controlLinkCommand: `CU_HOME=${home} node ${ROOT}/_tools_/agent-core/cli.mjs control-link ${dirs[0]}` }); break } await new Promise((r) => setTimeout(r, 250)) }
  const code = await exited
  let result = {}
  try { result = JSON.parse(stdout) } catch { try { result = JSON.parse(stdout.trim().split('\n').filter((l) => l.startsWith('{')).pop()) } catch {} }
  await new Promise((r) => setTimeout(r, 1500)) // let the app settle before reading its log
  const input = (await fixture.state()).input ?? []
  // For cu-verifier's record (owner-checklist-parts.md, Part 2): the run directory holds the events in order - the
  // owner's press, the helper's key-up for the held key (or the held-keys marker cleared), the pause with sender
  // local_input, and no synthetic event after the press until a resume.
  note({ exit: code, status: result.status, steps: result.steps, actions: result.actions, fixtureEvents: input.length, runsDir })
} finally {
  await fixture.close().catch(() => {})
  log.end()
}
