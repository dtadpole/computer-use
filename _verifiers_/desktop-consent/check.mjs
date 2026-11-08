import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { test } from 'node:test'

import { skipUnless } from '../../_vendor_/browser-use/_tools_/verify-runner/lib.mjs'
import { cleanEnvironment, sutRoot } from '../../_tools_/verify-kit/sut.mjs'
import { desktopRun, FIXTURE, LEDGER, ready, twoApps } from './harness.mjs'

/**
 * ULTIMATE_GOAL 2.0 consent-and-safety row, run half before the grant: per-app approval (once, not remembered);
 * never operated - an excluded app is blocked without asking, and twice ends the run; system-wide chords refused (P9),
 * clipboard chords allowed (D-031);
 * consequential actions pause. Each check is a real agent-core run of the desktop driver on the fake helper, judged
 * from the run's own events.jsonl and run.json and the requests the helper received.
 */

const guard = (t) => skipUnless(t, ready, 'the desktop loop (C5), driver or fake helper has not landed')
const click = (x, y) => ({ type: 'click', button: 'left', x, y })
/** The final record of each action (a run writes 'attempted' and then the outcome). */
const actionsOf = (events) => [...new Map(events.filter((e) => e.kind === 'action').map((e) => [`${e.step}:${e.index}`, e])).values()]
const asks = (events) => events.filter((e) => e.kind === 'consent' && e.phase === 'request')

test('an excluded app under the pointer is blocked without asking, nothing is sent, and twice ends the run', async (t) => {
  if (!guard(t)) return
  // Even a person who would approve everything is never asked: any request is approved at once.
  const approveAll = async (ctl) => {
    for (let i = 0; i < 3; i += 1) {
      const request = await ctl.waitForRequest(1500)
      if (!request) return
      ctl.respond({ id: request.id, approved: true, lifetime: 'once' })
    }
  }
  const run = await desktopRun({ world: twoApps('com.apple.Terminal'), controller: (mods) => mods.consent.apiController(), answer: approveAll, turns: [{ actions: [click(900, 300)] }, { actions: [click(950, 320)] }, { final: 'done' }] })
  assert.equal(asks(run.events).length, 0, 'the person was asked about an excluded app')
  const records = actionsOf(run.events)
  assert.ok(records.length >= 2 && records.every((r) => r.decision === 'block' && /^excluded:/.test(r.rule) && r.attempted === false), JSON.stringify(records.map((r) => [r.decision, r.rule, r.attempted])))
  assert.equal(run.inputs.length, 0, 'input reached the helper')
  assert.equal(run.result.status, 'refused_by_policy')
  assert.deepEqual(run.runJson?.policy?.scope ?? run.runJson?.scope ?? [FIXTURE], [FIXTURE])
})

test('an app outside the run\'s scope is asked about (new_app), and a decline sends nothing', async (t) => {
  if (!guard(t)) return
  const run = await desktopRun({ world: twoApps(LEDGER), turns: [{ actions: [click(900, 300)] }, { final: 'done' }] })
  const [ask] = asks(run.events)
  assert.ok(ask, 'no consent request')
  assert.equal(ask.request.class, 'new_app')
  const [record] = actionsOf(run.events)
  assert.deepEqual([record.decision, record.status, record.attempted], ['confirm', 'declined', false])
  assert.equal(run.inputs.length, 0, 'input reached the helper after a decline')
})

test('approved once, the click goes through and the helper\'s scope grows; the next run asks again', async (t) => {
  if (!guard(t)) return
  const answerOnce = async (ctl) => {
    const request = await ctl.waitForRequest(5000)
    assert.ok(request, 'no consent request to answer')
    ctl.respond({ id: request.id, approved: true, lifetime: 'once' })
  }
  const approved = await desktopRun({ world: twoApps(LEDGER), controller: (mods) => mods.consent.apiController(), answer: answerOnce, turns: [{ actions: [click(900, 300)] }, { final: 'done' }] })
  const [record] = actionsOf(approved.events)
  assert.equal(record.status, 'done', `the approved click ended ${record.status}${record.code ? ` (${record.code})` : ''}`)
  assert.ok(approved.inputs.some((r) => r.events.some((e) => e.kind === 'down' && e.x === 900)), 'the approved click never reached the helper')
  assert.ok(approved.requests.some((r) => r.type === 'scope' && r.bundleIds.includes(LEDGER)), 'the helper\'s scope did not grow to the approved app')
  const next = await desktopRun({ world: twoApps(LEDGER), turns: [{ actions: [click(900, 300)] }, { final: 'done' }] })
  assert.equal(asks(next.events).length, 1, 'a once approval was remembered into the next run')
  assert.equal(next.inputs.length, 0)
})

test('system-wide chords stay refused (P9): the app switcher, Spotlight and log out are blocked as system shortcuts, nothing sent', async (t) => {
  if (!guard(t)) return
  for (const keys of [['META', 'TAB'], ['META', 'SPACE'], ['META', 'SHIFT', 'Q']]) {
    const run = await desktopRun({ world: twoApps(LEDGER), turns: [{ actions: [{ type: 'keypress', keys }] }, { final: 'done' }] })
    const [record] = actionsOf(run.events)
    assert.deepEqual([record?.decision, record?.rule], ['block', 'system_shortcut'], `${keys.join('+')} was not blocked as a system shortcut`)
    assert.equal(run.inputs.length, 0, `${keys.join('+')} reached the helper`)
  }
})

/** Whether the code under test allows clipboard chords (D-031): no clipboard rule in the policy and no pasteboard refusal in the driver. */
const allowsClipboard = () => {
  const read = (path) => readFileSync(join(sutRoot(), path), 'utf8')
  return !read('_tools_/agent-core/app-policy.mjs').includes("rule: 'clipboard'") && !read('_environments_/macos-desktop/keys.mjs').includes('PASTEBOARD_REFUSAL')
}

test('copy and cut pass and reach the helper (D-031); a paste passes after the run\'s own copy and asks with none first (CU-151)', async (t) => {
  if (!guard(t)) return
  if (!skipUnless(t, allowsClipboard(), 'the code under test still refuses clipboard chords (C9, D-025); D-031 allows them - judged once both refusals are gone')) return
  const chord = (key) => ({ type: 'keypress', keys: ['META', key] })
  for (const key of ['C', 'X']) {
    const run = await desktopRun({ world: twoApps(LEDGER), turns: [{ actions: [chord(key)] }, { final: 'done' }] })
    const [record] = actionsOf(run.events)
    assert.equal(record?.status, 'done', `Command-${key} ended ${record?.status} (${record?.rule ?? ''})`)
    assert.equal(run.inputs.length, 1, `Command-${key} did not reach the helper`)
  }
  // The run's own copy, then the paste (paste-consent.md): the paste inserts what the run put there. As a real helper
  // does (0.2.38+, D-069's floor), the fake reports the pasteboard change count beside a focused field, and the copy
  // raises it by one; with no count at all the paste is the owner's and asks (CU-220).
  const FIELD = { bundleId: FIXTURE, pid: 900, role: 'AXTextField', subrole: null, title: 'Notes', frame: { x: 150, y: 450, width: 200, height: 24 }, secure: false, editable: true }
  const counted = { ...twoApps(LEDGER, [{ rect: FIELD.frame, element: FIELD }]), focused: FIELD, changeCount: 41, phases: [{ afterInputs: 1, changeCount: 42 }] }
  const own = await desktopRun({ world: counted, turns: [{ actions: [chord('C'), chord('V')] }, { final: 'done' }] })
  assert.deepEqual(actionsOf(own.events).map((r) => r.status), ['done', 'done'], 'Command-C then Command-V')
  assert.equal(own.inputs.length, 2, 'the copy and the paste reached the helper')
  // A paste with no copy of the run's own first inserts the owner's pasteboard: asked (sensitive_data), declined unattended.
  const owner = await desktopRun({ world: counted, turns: [{ actions: [chord('V')] }, { final: 'done' }] })
  const [paste] = actionsOf(owner.events)
  assert.equal(paste?.status, 'declined', `Command-V alone ended ${paste?.status} (${paste?.rule ?? ''})`)
  assert.match(String(paste?.rule ?? paste?.class ?? ''), /sensitive_data/)
  assert.equal(owner.inputs.length, 0, 'the owner\'s pasteboard was pasted')
})

test('a consequential button in an approved app pauses for consent; declined, nothing is sent', async (t) => {
  if (!guard(t)) return
  const button = { rect: { x: 100, y: 100, width: 160, height: 30 }, element: { bundleId: FIXTURE, pid: 900, role: 'AXButton', title: 'Delete account' } }
  const run = await desktopRun({ world: twoApps(LEDGER, [button]), turns: [{ actions: [click(150, 110)] }, { final: 'done' }] })
  const [ask] = asks(run.events)
  assert.ok(ask, 'a Delete account click did not ask')
  assert.notEqual(ask.request.class, 'new_app', 'asked only because of the app, not the action')
  const [record] = actionsOf(run.events)
  assert.deepEqual([record.decision, record.status], ['confirm', 'declined'])
  assert.equal(run.inputs.length, 0)
})

/** Whether the agent core under test knows the terminal_view rule (E5, PR #218). */
const knowsTerminalView = () => {
  const source = join(sutRoot(), '_tools_/agent-core/app-policy.mjs')
  return existsSync(source) && readFileSync(source, 'utf8').includes('terminal_view')
}

test('a terminal panel inside an approved app takes a click but no typing: terminal_view, nothing typed (E5)', async (t) => {
  if (!guard(t)) return
  if (!skipUnless(t, knowsTerminalView(), 'agent core does not know the terminal_view rule yet (E5, PR #218)')) return
  const panel = { bundleId: FIXTURE, pid: 900, role: 'AXTextArea', title: 'Terminal 1', description: 'Terminal 1', frame: { x: 100, y: 400, width: 400, height: 200 } }
  const world = { ...twoApps(LEDGER, [{ rect: panel.frame, element: panel }]), focused: panel }
  const run = await desktopRun({ world, turns: [{ actions: [click(300, 500), { type: 'type', text: 'rm -rf /tmp/cu-verifier-x' }] }, { final: 'done' }] })
  const records = actionsOf(run.events)
  const clicked = records.find((r) => r.action?.type === 'click')
  const typed = records.find((r) => r.action?.type === 'type')
  assert.equal(clicked?.status, 'done', `the click on the panel ended ${clicked?.status} (${clicked?.rule ?? ''})`)
  assert.ok(typed, 'no record of the type action')
  assert.deepEqual([typed.decision, typed.rule], ['block', 'terminal_view'])
  assert.ok(run.inputs.some((r) => r.events.some((e) => e.kind === 'down')), 'the click never reached the helper')
  assert.ok(!run.inputs.some((r) => r.events.some((e) => e.kind === 'text')), 'text reached the helper for a terminal panel')
})

test('a piped y never approves: the CLI refuses --consent tty without a terminal, and a tty controller on a pipe declines (red team C1)', async (t) => {
  if (!guard(t)) return
  // The CLI, stdin and stdout piped. The seat is no [cu] seat key, so a CLI that did not refuse would still stop at the
  // driver's seat check, before any lock or helper launch: nothing can start either way.
  const dir = mkdtempSync('/tmp/cu-verifier-cli-')
  try {
    writeFileSync(join(dir, 'plan.json'), JSON.stringify({ turns: [{ final: 'done' }] }))
    const cli = join(sutRoot(), '_tools_/agent-core/cli.mjs')
    const run = spawnSync(process.execPath, [cli, 'run', '--env', 'macos-desktop', '--seat', 'verifier-probe', '--app', FIXTURE, '--task', 'probe', '--model', 'scripted', '--plan', join(dir, 'plan.json'), '--consent', 'tty', '--runs-dir', join(dir, 'runs')], { input: 'y\ny\ny\n', encoding: 'utf8', env: { ...cleanEnvironment(), CU_HOME: join(dir, 'home') }, timeout: 20_000 })
    assert.equal(run.status, 64, `--consent tty from a pipe was not refused (exit ${run.status}): ${(run.stderr + run.stdout).slice(0, 200)}`)
    assert.match(run.stderr, /terminal/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  // The controller, built on a pipe through which the caller answers y the moment a question is asked (the strongest
  // form of the attack): the new_app question is declined and nothing is sent.
  const pipe = new PassThrough()
  // A controller that does read the pipe can leave a question waiting on it forever; stop the run after 8 s then.
  const watchdog = (control) => new Promise((resolve) => {
    const timer = setTimeout(() => {
      stop()
      control.send({ command: 'stop', reason: 'the verifier ends a run left waiting' }, { source: 'api' })
      resolve()
    }, 8000)
    const stop = control.subscribe((event) => {
      if (event.type === 'consent_request') pipe.write('y\n')
      if (event.type === 'state' && event.state === 'finished') {
        clearTimeout(timer)
        stop()
        resolve()
      }
    })
    if (control.state === 'finished') {
      clearTimeout(timer)
      stop()
      resolve()
    }
  })
  const run = await desktopRun({ world: twoApps(LEDGER), controller: (mods) => mods.consent.ttyController({ input: pipe, output: new PassThrough() }), during: watchdog, turns: [{ actions: [click(900, 300)] }, { final: 'done' }] })
  const [ask] = asks(run.events)
  assert.ok(ask, 'no question was asked about the unapproved app')
  assert.equal(ask.request.class, 'new_app')
  const [record] = actionsOf(run.events)
  assert.equal(record.status, 'declined', `a piped y answered the question: the click ended ${record.status}`)
  assert.equal(run.inputs.length, 0, 'the click reached the helper on a piped y')
})

/** Whether the agent core under test binds a pre-approval to its app (PR #257). */
const bindsPreApprovals = () => readFileSync(join(sutRoot(), '_tools_/agent-core/app-policy.mjs'), 'utf8').includes('normalizeAppPreApproval')

test('a pre-approval named for one app covers only that app - as {class, app} and as the CLI\'s class@bundle.id ({class, origin})', async (t) => {
  if (!guard(t)) return
  if (!skipUnless(t, bindsPreApprovals(), 'agent core does not bind pre-approvals to their app yet (PR #257)')) return
  const opaque = (bundleId, pid, x) => ({ rect: { x, y: 100, width: 200, height: 200 }, element: { bundleId, pid, role: 'AXWindow', subrole: null, title: null, frame: { x, y: 100, width: 200, height: 200 }, secure: false, opaque: true } })
  const world = twoApps(LEDGER, [opaque(FIXTURE, 900, 100), opaque(LEDGER, 901, 740)])
  for (const [form, preApproval] of [['{class, app}', { class: 'unknown_target', app: FIXTURE }], ['class@bundle.id', { class: 'unknown_target', origin: FIXTURE }]]) {
    const run = await desktopRun({ world, scope: [FIXTURE, LEDGER], preApprovals: [preApproval], turns: [{ actions: [click(200, 200)] }, { actions: [click(840, 200)] }, { final: 'done' }], bounds: { maxSteps: 5 } })
    const [fixtureClick, ledgerClick] = actionsOf(run.events)
    assert.equal(fixtureClick?.status, 'done', `${form}: the pre-approved app's opaque click ended ${fixtureClick?.status} (${fixtureClick?.rule ?? ''})`)
    const asked = asks(run.events).map((e) => e.request.class)
    assert.ok(asked.includes('unknown_target'), `${form}: the other app's opaque click was not asked about (asked: ${asked.join(', ') || 'nothing'})`)
    assert.equal(ledgerClick?.status, 'declined', `${form}: the other app's opaque click ended ${ledgerClick?.status}`)
    assert.equal(run.inputs.filter((r) => r.events.some((e) => e.kind === 'down')).length, 1, `${form}: more than the pre-approved click reached the helper`)
  }
})

test('a start app the person has not approved is asked before the first capture: unattended, the run ends declined and the helper gets no scope, capture or input (P11)', async (t) => {
  if (!guard(t)) return
  const run = await desktopRun({ world: twoApps(LEDGER), approveStart: false, turns: [{ actions: [click(200, 200)] }, { final: 'done' }] })
  const startAsk = asks(run.events).find((e) => e.request.class === 'new_app' && e.request.app === FIXTURE)
  assert.ok(startAsk, `no new_app question named the start app (asked: ${JSON.stringify(asks(run.events).map((e) => [e.request.class, e.request.app]))})`)
  assert.equal(run.result.status, 'declined', `the run ended ${run.result.status}`)
  const scoped = run.requests.filter((r) => r.type === 'scope' && (r.bundleIds ?? []).length > 0)
  assert.deepEqual(scoped.map((r) => r.bundleIds), [], 'the helper was given a scope with no approval')
  assert.equal(run.requests.filter((r) => r.type === 'capture').length, 0, 'the screen was captured with no approved app')
  assert.equal(run.inputs.length, 0, 'input reached the helper with no approved app')
})
