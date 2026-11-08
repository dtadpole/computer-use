import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test } from 'node:test'

import { skipUnless } from '../../_vendor_/browser-use/_tools_/verify-runner/lib.mjs'
import { filesHolding, filesUnder } from '../../_tools_/verify-kit/desktop-evidence.mjs'
import { cleanEnvironment, sutRoot } from '../../_tools_/verify-kit/sut.mjs'
import { desktopRun, FIXTURE, LEDGER, ready, twoApps } from '../desktop-consent/harness.mjs'
import { verifySeat } from '../../_tools_/verify-kit/seat.mjs'

/** CU-156: the seat this verifier's browsers and runs use - CU_VERIFY_SEAT, else cu-verifier (verify-kit/seat.mjs). */
const SEAT = verifySeat()

/**
 * ULTIMATE_GOAL 2.0 trajectory row, agent-core half before the grant (C7): nothing outside approved apps is recorded,
 * and secure values never are. A leaky stand-in helper plants a marker in every out-of-scope element and window, so
 * the check judges agent core's own layer, not the helper's; every file of the run directory is searched. The
 * pixel half (no capture of an unapproved app) needs the real helper and the owner's grant.
 */

const LEAKY = fileURLToPath(new URL('./leaky-helper.mjs', import.meta.url))
const guard = (t) => skipUnless(t, ready, 'the desktop loop (C5/C7), driver or fake helper has not landed')
const click = (x, y) => ({ type: 'click', button: 'left', x, y })
const cleanup = (run) => run.runDir && rmSync(dirname(run.runDir), { recursive: true, force: true })

test('an out-of-scope app\'s element titles are in no run file, even when the helper leaks them', async (t) => {
  if (!guard(t)) return
  const marker = 'MARKER-OUTSIDE-7731'
  const run = await desktopRun({ world: twoApps(LEDGER), helper: LEAKY, helperEnv: { CU_LEAKY_MARKER: marker, CU_LEAKY_SCOPE: FIXTURE, CU_LEAKY_WINDOWS: '0' }, keepRun: true, turns: [{ actions: [click(900, 300)] }, { actions: [click(300, 300)] }, { final: 'done' }] })
  try {
    assert.ok(run.runDir, 'the run left no directory')
    assert.ok(run.events.some((e) => e.kind === 'consent' && e.phase === 'request' && e.request?.class === 'new_app'), 'the out-of-scope click raised no new_app request (the leak did not reach the run)')
    const holding = filesHolding(run.runDir, marker)
    assert.deepEqual(holding.map((p) => p.slice(run.runDir.length + 1)), [], `the planted title is recorded (${filesUnder(run.runDir).length} files searched)`)
  } finally {
    cleanup(run)
  }
})

test('an out-of-scope window the helper slips into its capture replies leaves its title in no run file: refused or scrubbed', async (t) => {
  if (!guard(t)) return
  const marker = 'MARKER-WINDOW-4419'
  const leakLog = join(mkdtempSync('/tmp/cu-verifier-leak-'), 'leaks.log')
  const run = await desktopRun({ world: twoApps(LEDGER), helper: LEAKY, helperEnv: { CU_LEAKY_MARKER: marker, CU_LEAKY_SCOPE: FIXTURE, CU_LEAKY_ELEMENTS: '0', CU_LEAKY_LOG: leakLog }, keepRun: true, turns: [{ actions: [click(200, 300)] }, { final: 'done' }] })
  try {
    // The leak must have been presented to the driver; whether it then refused the frame or carried on, no title lands.
    const leaks = existsSync(leakLog) ? readFileSync(leakLog, 'utf8').split('\n').filter((l) => l === 'window').length : 0
    assert.ok(leaks > 0, 'the helper never slipped the out-of-scope window into a reply (nothing was tested)')
    assert.ok(run.runDir, 'the run left no directory')
    const holding = filesHolding(run.runDir, marker)
    assert.deepEqual(holding.map((p) => p.slice(run.runDir.length + 1)), [], `the leaked window's title is recorded (${filesUnder(run.runDir).length} files searched)`)
  } finally {
    cleanup(run)
    rmSync(dirname(leakLog), { recursive: true, force: true })
  }
})

/** A run that types into a secure field whose value is a marker. */
async function secureRun() {
  const field = { bundleId: FIXTURE, pid: 900, role: 'AXTextField', subrole: 'AXSecureTextField', title: 'Password', secure: true, value: 'MARKER-SECRET-5512', frame: { x: 100, y: 100, width: 200, height: 24 } }
  const world = { ...twoApps(LEDGER, [{ rect: field.frame, element: field }]), focused: field }
  return desktopRun({ world, keepRun: true, turns: [{ actions: [click(150, 110), { type: 'type', text: 'hunter2' }] }, { final: 'done' }] })
}

test('typing into a secure field is handed to the person: nothing sent, and the field\'s value is in no run file', async (t) => {
  if (!guard(t)) return
  const run = await secureRun()
  try {
    const typed = run.events.filter((e) => e.kind === 'action' && e.action?.type === 'type').at(-1)
    assert.ok(typed, 'no record of the type action')
    assert.equal(typed.decision, 'handoff', `typing into a secure field was ${typed.decision}`)
    assert.ok(!run.inputs.some((r) => r.events.some((e) => e.kind === 'text')), 'text reached the helper for a secure field')
    assert.deepEqual(filesHolding(run.runDir, 'MARKER-SECRET-5512').map((p) => p.slice(run.runDir.length + 1)), [], 'the secure value is recorded')
  } finally {
    cleanup(run)
  }
})

test('text meant for a secure field is redacted as a credential in the run files (the model transcript aside)', async (t) => {
  if (!guard(t)) return
  const run = await secureRun()
  try {
    const leaked = filesHolding(run.runDir, 'hunter2').map((p) => p.slice(run.runDir.length + 1)).filter((p) => !p.startsWith('transcript'))
    assert.deepEqual(leaked, [], 'the text meant for the secure field is recorded unredacted')
  } finally {
    cleanup(run)
  }
})

test('a completed action records how it was mapped (frame scale and origin)', async (t) => {
  if (!guard(t)) return
  const run = await desktopRun({ world: twoApps(LEDGER), turns: [{ actions: [click(300, 300)] }, { final: 'done' }] })
  const done = run.events.filter((e) => e.kind === 'action' && e.status === 'done')
  assert.ok(done.length >= 1, 'no completed action')
  const text = JSON.stringify(done.at(-1))
  assert.match(text, /"mapping"/, `no mapping on the done record: ${text.slice(0, 200)}`)
  assert.match(text, /originPt/, 'the mapping has no origin')
})

const FAKE = fileURLToPath(new URL('../../_tests_/macos-desktop/fake-helper.mjs', import.meta.url))

test('a named secret, typed with a person\'s approval and echoed back by the model, is scrubbed from events.jsonl, run.json, the result and every line startRun hands to onEvent', { timeout: 30_000 }, async (t) => {
  if (!guard(t)) return
  const imp = (path) => import(pathToFileURL(join(sutRoot(), path)))
  const [{ startRun }, { createScriptedAdapter }, { connectStdio }, { createAppApprovals }, { apiController }] = await Promise.all(['_tools_/agent-core/run.mjs', '_tools_/agent-core/adapter-scripted.mjs', '_environments_/macos-desktop/helper-link.mjs', '_tools_/agent-core/app-approvals.mjs', '_tools_/agent-core/consent.mjs'].map(imp))
  const SECRET = 'S3cr3t-Value-42'
  const field = { bundleId: FIXTURE, pid: 900, role: 'AXTextField', subrole: null, title: 'Name', frame: { x: 100, y: 100, width: 300, height: 30 }, secure: false }
  const world = { grants: { screen: true, accessibility: true, postEvents: true, listenEvents: false }, displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 1280, height: 800 }, scale: 1 }], apps: [{ bundleId: FIXTURE, pid: 900, rect: { x: 0, y: 0, width: 1280, height: 800 } }], elements: [{ rect: { x: 100, y: 100, width: 300, height: 30 }, element: field }], focused: field }
  const child = spawn(process.execPath, [FAKE], { stdio: ['pipe', 'pipe', 'pipe'], env: { PATH: process.env.PATH, FAKE_HELPER_CONFIG: JSON.stringify(world), FAKE_HELPER_TOKEN: 'cu-verifier' } })
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
    const appApprovals = createAppApprovals({ path: join(runs, 'app-approvals.json') })
    appApprovals.grantAlways(FIXTURE, { by: 'api' })
    const lines = []
    const handle = await startRun({
      environment: 'macos-desktop', seat: SEAT, apps: [FIXTURE], appApprovals, env: cleanEnvironment(), live: false, task: 'type the PIN into Name', runsDirectory: runs,
      controller: apiController(), onEvent: (line) => lines.push(JSON.stringify(line)), resolveSecret: (name) => (name === 'pin' ? SECRET : null),
      model: createScriptedAdapter({ turns: [{ actions: [click(200, 115)] }, { actions: [{ type: 'type', text: '{{secret:pin}}' }] }, { final: `Done. I typed ${SECRET} into Name.` }] }),
      environmentOptions: { connect: () => connectStdio(child, { token: 'cu-verifier', helloTimeoutMs: 5000 }), runLock: async () => ({ release() {} }) },
    })
    // Typing a secret is a credential action: it asks, and the person approves it here.
    handle.control.subscribe((event) => {
      if (event.type === 'consent_request') queueMicrotask(() => handle.control.send({ command: 'consent', id: event.request.id, approved: true, lifetime: 'once' }, { source: 'api' }))
    })
    const result = await handle.done
    const typed = requests.filter((r) => r.type === 'input').flatMap((r) => r.events).map((e) => e.text ?? '').join('')
    assert.ok(typed.includes(SECRET), 'the secret never reached the helper, so nothing here is proven')
    const file = readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8')
    assert.ok(!file.includes(SECRET) && file.includes('[secret]'), 'events.jsonl holds the secret, or nothing was scrubbed')
    assert.ok(!readFileSync(join(result.trajectoryDir, 'run.json'), 'utf8').includes(SECRET), 'run.json holds the secret')
    assert.ok(!String(result.finalMessage).includes(SECRET), `the result hands the secret back: ${result.finalMessage}`)
    assert.deepEqual(lines.filter((l) => l.includes(SECRET)).map((l) => JSON.parse(l).kind), [], 'onEvent was handed the secret')
    assert.ok(lines.some((l) => l.includes('[secret]')), 'no onEvent line shows the scrubbed echo')
  } finally {
    child.kill()
    if (/^\/tmp\/cu-verifier-runs-\d+-[A-Za-z0-9]{6}$/.test(runs)) rmSync(runs, { recursive: true, force: true })
  }
})
