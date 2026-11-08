/**
 * One desktop run for the consent checks: the macos-desktop driver on the fake helper (this tree's copy, the
 * instrument), agent core's loop with a scripted model, and a controller. Resolves to the run result, the events the
 * run recorded (its own events.jsonl) and every request the helper received - outside evidence only (D-012).
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { sutRoot } from '../../_tools_/verify-kit/sut.mjs'
import { verifySeat } from '../../_tools_/verify-kit/seat.mjs'

/** CU-156: the seat this verifier's browsers and runs use - CU_VERIFY_SEAT, else cu-verifier (verify-kit/seat.mjs). */
const SEAT = verifySeat()

const root = sutRoot()
const PATHS = {
  env: join(root, '_environments_/macos-desktop/environment.mjs'),
  link: join(root, '_environments_/macos-desktop/helper-link.mjs'),
  loop: join(root, '_tools_/agent-core/loop.mjs'),
  scripted: join(root, '_tools_/agent-core/adapter-scripted.mjs'),
  consent: join(root, '_tools_/agent-core/consent.mjs'),
  control: join(root, '_tools_/agent-core/control.mjs'),
  approvals: join(root, '_tools_/agent-core/app-approvals.mjs'),
}
const FAKE = fileURLToPath(new URL('../../_tests_/macos-desktop/fake-helper.mjs', import.meta.url))
export const ready = [...Object.values(PATHS), FAKE].every(existsSync)
export const FIXTURE = 'ai.reflection.cu.fixture'
export const LEDGER = 'ai.reflection.cu.ledger'
// A fake-helper run touches no display, so it never holds the team-wide desktop-run lock (D-024).
const NO_DISPLAY_LOCK = async () => ({ release() {} })

export const load = async () => Object.fromEntries(await Promise.all(Object.entries(PATHS).map(async ([key, path]) => [key, await import(pathToFileURL(path))])))

/**
 * Run `turns` (scripted model turns) in `world` with `scope` approved; `controller(mods)` builds the controller and
 * `answer(controller)` may respond to asks while the run goes. One run control is shared by the driver and the loop,
 * as startRun shares it; `during(control, environment)` may act on it while the run goes (a cancel, say).
 */
export async function desktopRun({ world, scope = [FIXTURE], turns, controller, answer, during, bounds = { maxSteps: 4 }, helper = null, helperEnv = {}, keepRun = false, preApprovals = [], approveStart = true, driverOptions = {} }) {
  const mods = await load()
  // `helper` swaps in a stand-in (a leaky proxy, say) that runs the fake itself; CU_LEAKY_TARGET names the fake.
  const child = spawn(process.execPath, [helper ?? FAKE], { stdio: ['pipe', 'pipe', 'pipe'], env: { PATH: process.env.PATH, FAKE_HELPER_CONFIG: JSON.stringify(world), FAKE_HELPER_TOKEN: 'cu-verifier', CU_LEAKY_TARGET: FAKE, ...helperEnv } })
  const requests = []
  let buffer = ''
  child.stderr.on('data', (chunk) => {
    buffer += chunk
    for (let at = buffer.indexOf('\n'); at !== -1; at = buffer.indexOf('\n')) {
      const line = buffer.slice(0, at)
      buffer = buffer.slice(at + 1)
      if (line.startsWith('REQ ')) requests.push(JSON.parse(line.slice(4)))
    }
  })
  const runs = mkdtempSync(`/tmp/cu-verifier-runs-${process.pid}-`)
  try {
    const control = mods.control.createRunControl()
    const env = await mods.env.launchDesktopEnvironment({ ...driverOptions, apps: scope, seat: SEAT, runLock: NO_DISPLAY_LOCK, control, frame: { maxLongEdge: 1568, maxPixels: 1_150_000 }, connect: () => mods.link.connectStdio(child, { token: 'cu-verifier', helloTimeoutMs: 5000 }) })
    const ctl = controller ? controller(mods) : mods.consent.unattendedController()
    // The person approved the start apps 'always' before the run, in a store of this run's own (D-012): start apps
    // need a human answer (P11), and an unattended check must not stop at that question.
    const appApprovals = mods.approvals.createAppApprovals({ path: join(runs, 'app-approvals.json') })
    if (approveStart) for (const app of scope) appApprovals.grantAlways(app, { by: 'api' })
    const started = Date.now()
    const running = mods.loop.runTask({ environment: env, model: mods.scripted.createScriptedAdapter({ turns }), apps: scope, appApprovals, preApprovals, controller: ctl, control, task: 'a desktop run check', runsDirectory: runs, bounds })
    if (answer) await answer(ctl)
    if (during) await during(control, env)
    const result = await running
    const wallMs = Date.now() - started
    await new Promise((resolve) => setTimeout(resolve, 100))
    const eventsFile = join(result.trajectoryDir ?? '', 'events.jsonl')
    const events = existsSync(eventsFile) ? readFileSync(eventsFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line)) : []
    const runJson = existsSync(join(result.trajectoryDir ?? '', 'run.json')) ? JSON.parse(readFileSync(join(result.trajectoryDir, 'run.json'), 'utf8')) : null
    return { result, events, requests, inputs: requests.filter((r) => r.type === 'input'), runJson, wallMs, runDir: result.trajectoryDir ?? null }
  } finally {
    child.kill()
    if (!keepRun && /^\/tmp\/cu-verifier-runs-\d+-[A-Za-z0-9]{6}$/.test(runs)) rmSync(runs, { recursive: true, force: true })
  }
}

/** A world of one 1280x800 display: CU Fixture on the left half, `right` (an app) on the right half, plus `elements`. */
export const twoApps = (right, elements = []) => ({
  grants: { screen: true, accessibility: true, listenEvents: false },
  displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 1280, height: 800 }, scale: 1 }],
  apps: [{ bundleId: FIXTURE, pid: 900, rect: { x: 0, y: 0, width: 640, height: 800 } }, { bundleId: right, pid: 901, rect: { x: 640, y: 0, width: 640, height: 800 } }],
  elements,
})
