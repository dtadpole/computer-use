import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  ALERT_TO, alertRouteProblem, childEnv, cliArgs, cuHomeRefusal, DEFAULT_INBOX, FALLBACK_AFTER_KILL_MS, HUMAN_FIX, idleRefusal, killRefusal,
  NORMAL_RELEASE_MS, parseArgs, runDirFinder, runG1, sendAlert, socketArgument, step4Refusal, trajectoryFailures, versionAtLeast,
} from '../../_tools_/desktop-checks/g1-held-keys.mjs'
import { SHIFT_MASK, shiftDown } from '../../_tools_/desktop-checks/probes.mjs'

/**
 * CU-94: the G1 live check's logic on fakes - a virtual clock, a fake session (Shift up or down), a fake marker, fake
 * CLI runs (A holds, B releases, the fallback presses) and a fake ps. Each guard cu-verifier asked for is a test: the
 * step-4 booking, the idle gate, the private CU_HOME, the alert route, the copied consent, the kill identity (comm
 * whole, the socket a whole argument under the check's run directory, the pid ps answers for, run A neither ended nor
 * reporting local input), Shift DOWN after the kill, the fallback and its alert, --rehearse.
 */

const START = 1_000_000

function world(overrides = {}) {
  const w = {
    t: START, shift: false, marker: null, idle: 900, killed: [], alerts: [], logs: [], runs: [], fixtureLog: [],
    helperVersion: '0.2.31', holdKey: true, markerPid: 4242, psPid: undefined, comm: undefined, socket: undefined,
    releaseOnB: true, shiftOnKill: true, localInputDuringA: false, fallbackWorks: true, aEndsBeforeKill: false, bHangs: false,
    markerStaysAfterB: false, noProcess: false, ...overrides,
  }
  const handles = {}
  const make = (label) => {
    const handle = { ended: false, notices: [], runDir: () => `/runs/run-${label}` }
    handle.done = new Promise((resolve) => { handle.finish = (code) => { if (!handle.ended) { handle.ended = true; resolve({ code }) } } })
    handle.end = () => handle.finish(143)
    return handle
  }
  const deps = {
    now: () => w.t,
    // Yields to the event loop, and a loop that never ends fails fast instead of spinning: the bounds are the point.
    sleep: async (ms) => {
      w.t += ms
      if (w.t - START > 10 * 60 * 1000) throw new Error('the virtual clock ran past 10 minutes: a wait without a bound')
      if (w.aEndsBeforeKill && handles.A && !handles.A.ended && w.t - w.holdAt >= 500) handles.A.finish(1)
      if (w.localInputMidHold && handles.A && w.t - w.holdAt >= 500) w.midHoldInput = true
      if (w.markerChangesTo !== undefined && handles.A && w.t - w.holdAt >= 500 && w.marker?.pid === w.markerPid) w.marker = { pid: w.markerChangesTo, keys: [56], buttons: [] }
      if (w.holdEndsAt !== undefined && handles.A && !handles.A.ended && w.t >= w.holdEndsAt) { w.shift = false; w.marker = null; handles.A.finish(0) }
      await new Promise((done) => setImmediate(done))
    },
    sessionFlags: async () => (w.shift ? SHIFT_MASK : 0),
    hidIdleSeconds: async () => w.idle,
    readMarker: () => w.marker,
    // /tmp is /private/tmp: with realHome set, the home's real path differs from the path as given.
    realpath: (path) => (w.realHome && path.startsWith(w.home) ? w.realHome + path.slice(w.home.length) : path),
    processInfo: async (pid) => (w.noProcess ? null : {
      pid: w.psPid ?? pid,
      comm: pid === w.markerChangesTo ? '/usr/libexec/something-else' : (w.comm ?? join(w.realHome ?? w.home, 'helper', 'CUHelper.app', 'Contents', 'MacOS', 'CUHelper')),
      // As in reality, the helper's socket lies under the CU_HOME its run's CLI child was given.
      args: `${w.comm ?? 'CUHelper'} --socket ${w.socket ?? join(w.childHome, 'run', 'helper-abc123', 'helper.sock')} --token-file /x/token --driver-node /n --driver-entry /e`,
    }),
    kill: (pid) => {
      w.killed.push(pid)
      if (!w.shiftOnKill) w.shift = false
      handles.A.notices.push('The helper was lost while the run held SHIFT; it may still be down. Press and release it before going on.')
      handles.A.finish(1)
    },
    startFixture: async () => {
      if (w.fixtureFails) throw new Error('the fixture build failed')
      w.fixtureLog.push('start')
      return { pid: 777, close: async () => { w.fixtureLog.push('close') } }
    },
    windowsOnScreen: async (pid) => {
      w.windowPolls = (w.windowPolls ?? 0) + 1
      if (pid !== 777) return 0
      if (w.fixtureWindowOnPoll !== undefined) return w.windowPolls >= w.fixtureWindowOnPoll ? 1 : 0
      return w.fixtureWindows ?? 1
    },
    runCli: (spec) => {
      w.fixtureLog.push(`run ${spec.label}`)
      w.runs.push(spec)
      if (spec.label === 'A') w.childHome = spec.cuHome
      const handle = make(spec.label)
      handles[spec.label] = handle
      if (spec.label === 'A') {
        w.shift = true
        w.holdAt = w.t
        w.marker = { pid: w.markerPid, keys: [56], buttons: [] }
        if (w.localInputDuringA) { w.shift = w.shiftAfterAbort ?? false; w.marker = null; setImmediate(() => handle.finish(0)) }
        if (w.rehearsalHold) w.holdEndsAt = w.t + 5000
      } else if (spec.label === 'B') {
        if (!w.bHangs && w.releaseOnB) {
          w.marker = { pid: w.markerPid, keys: [56], buttons: [], released: true }
          w.shift = false
          setImmediate(() => { if (!w.markerStaysAfterB) w.marker = null; handle.notices.push('Released before this run\'s input: SHIFT, left down by an earlier helper that stopped.'); handle.finish(0) })
        } else if (!w.bHangs) setImmediate(() => handle.finish(0))
      } else if (spec.label === 'fallback') {
        // The run lock: a fallback run cannot start its helper while run A or run B is still live.
        const locked = [handles.A, handles.B].some((other) => other && !other.ended)
        if (locked) w.fallbackLocked = true
        if (w.fallbackWorks && !locked) { w.shift = false; w.marker = null }
        setImmediate(() => handle.finish(w.fallbackWorks ? 0 : 1))
      }
      return handle
    },
    readEvents: (path) => {
      if (path.includes('run-A')) {
        return [
          ...(w.localInputDuringA || w.midHoldInput ? [{ kind: 'local_input', inputKind: 'key' }] : []),
          ...(w.killed.length ? [{ kind: 'action', action: { type: 'hold_key' }, status: 'failed', code: 'helper_lost', heldAtLoss: { keys: ['SHIFT'], buttons: [] }, notice: 'The helper was lost while the run held SHIFT; it may still be down.' }] : []),
        ]
      }
      if (path.includes('run-B')) return [{ kind: 'released_stale', keys: ['SHIFT'], buttons: [], posted: 1 }]
      return []
    },
    ownerHome: async () => '/Users/someone/.computer-use',
    helperVersion: async () => w.helperVersion,
    offersHoldKey: async () => w.holdKey,
    linkHelper: async ({ cuHome }) => { if (w.noHelper) throw new Error('no installed helper at /Users/someone/.computer-use/helper/CUHelper.app'); w.linked = cuHome },
    copyApprovals: async () => (w.noConsent ? { refusal: 'the task needs CU Fixture approved always by the owner at a terminal (by tty)' } : { copiedFrom: '/Users/someone/.computer-use/app-approvals.json' }),
    alertRoute: () => w.alertRouteProblem ?? null,
    alert: (message, route) => w.alerts.push({ message, route }),
    log: (line) => w.logs.push(line),
  }
  return { w, deps, handles }
}

function scratchHome() {
  const dir = mkdtempSync(join(tmpdir(), 'cu-g1-test-'))
  return { dir, home: join(dir, 'home'), remove: () => rmSync(dir, { recursive: true, force: true }) }
}

const base = (home) => ({ seat: 'cu-verifier', cuHome: home, noStep4Booked: true, home: '/Users/someone', alertRoster: '/r/TEAM.yaml' })
const labels = (w) => w.runs.map((spec) => spec.label)

async function check(overrides, options = {}) {
  const s = scratchHome()
  const made = world(overrides)
  made.w.home = s.home
  try {
    return { ...made, report: await runG1({ ...base(s.home), ...options }, made.deps), home: s.home }
  } finally {
    s.remove()
  }
}

test('the guards before any input: booking, idle, Shift down, the home, a stale marker, the alert route, helper, hold_key, consent', async () => {
  for (const [overrides, options, pattern] of [
    [{}, { noStep4Booked: undefined }, /no step-4 booking/],
    [{}, { noStep4Booked: undefined, step4At: new Date(START + 20 * 60 * 1000).toISOString() }, /within 30 minutes/],
    [{ idle: 120 }, {}, /used 120 s ago/],
    [{ shift: true }, {}, /already down/],
    [{}, { cuHome: '/Users/someone/.computer-use' }, /not be the owner/],
    [{}, { cuHome: '/tmp/cu g1/home' }, /no whitespace/],
    [{ marker: { pid: 1 } }, {}, /marker is already/],
    [{ alertRouteProblem: 'no roster at /r/TEAM.yaml' }, {}, /could not reach a person/],
    [{ helperVersion: '0.2.29' }, {}, /older than 0\.2\.31/],
    [{ holdKey: false }, {}, /does not offer hold_key/],
    [{ noHelper: true }, {}, /could not be linked/],
    [{ noConsent: true }, {}, /approved always by the owner/],
  ]) {
    const { w, report } = await check(overrides, options)
    assert.equal(report.verdict, 'refused', JSON.stringify({ overrides, options }))
    assert.match(report.reasons.join(' '), pattern)
    assert.deepEqual([w.runs.length, w.killed.length], [0, 0], 'nothing started or killed')
  }
})

test('the pass: run A (a CLI run with the private marker) holds, its helper is killed, Shift reads DOWN, run B releases it', async () => {
  const { w, report, home } = await check({})
  assert.equal(report.verdict, 'pass', report.reasons.join('; '))
  assert.deepEqual(w.killed, [4242])
  assert.deepEqual(labels(w), ['A', 'B'])
  assert.equal(w.runs[0].heldMarkerPath, join(home, 'helper', 'held-keys.json'), 'the private marker, never the owner\'s')
  assert.equal(w.runs[0].cuHome, home)
  assert.deepEqual(w.runs[0].turns[0].actions, [{ type: 'hold_key', keys: ['SHIFT'], duration_ms: 5000 }])
  assert.deepEqual(report.flags.map((f) => [f.label, f.shift]).slice(0, 2), [['before', false], ['after kill', true]])
  assert.equal(report.flags.filter((f) => f.label === 'waiting for release').at(-1).shift, false)
  assert.ok(report.timings.shiftUp - report.timings.kill <= NORMAL_RELEASE_MS)
  assert.ok(report.timings.bHelper !== undefined, 'run B\'s helper start was seen in the marker')
})

test('the kill identity, re-read right before the kill: each mismatch means no kill and no run B', async () => {
  const cases = [
    [{ socket: '/tmp/someone-else/run/helper-x/helper.sock' }, /socket/],
    [{ comm: '/usr/bin/python3' }, /not the installed helper/],
    [{ comm: '/Users/someone/.computer-use/helper/CUHelper.app/Contents/MacOS/CUHelperX' }, /not the installed helper/],
    [{ psPid: 999 }, /ps answered for pid 999/],
    [{ noProcess: true }, /no process 4242/],
    [{ aEndsBeforeKill: true }, /run A (has ended|ended before its hold)/],
  ]
  for (const [overrides, pattern] of cases) {
    const { w, report } = await check(overrides)
    assert.deepEqual(w.killed, [], JSON.stringify(overrides))
    assert.match(report.reasons.join(' '), pattern, JSON.stringify(overrides))
    assert.ok(!labels(w).includes('B'), 'no run B')
    assert.notEqual(report.verdict, 'pass')
  }
  // A comm equal only by substring is not the helper; the socket is a whole argument, never a substring of args.
  assert.match(killRefusal({ marker: { pid: 7 }, info: { pid: 7, comm: '/x/CUHelper/../CUHelper', args: '--socket /h/run/s' }, executable: '/x/CUHelper', runDir: '/h/run' }), /not the installed helper/)
  assert.match(killRefusal({ marker: { pid: 7 }, info: { pid: 7, comm: '/x/CUHelper', args: '--token-file /h/run/s --socket /elsewhere/s' }, executable: '/x/CUHelper', runDir: '/h/run' }), /not under \/h\/run\//)
  assert.equal(killRefusal({ marker: { pid: 7 }, info: { pid: 7, comm: '/x/CUHelper', args: '/x/CUHelper --socket /h/run/helper-1/helper.sock' }, executable: '/x/CUHelper', runDir: '/h/run' }), null)
})

test('local input in run A: no kill, no second run; Shift down after it is put back up by a fallback run', async () => {
  const clean = await check({ localInputDuringA: true })
  assert.deepEqual([clean.w.killed.length, labels(clean.w), clean.report.verdict], [0, ['A'], 'aborted'])
  assert.match(clean.report.reasons.join(' '), /local input before the kill: no kill, no second run/)
  const stuck = await check({ localInputDuringA: true, shiftAfterAbort: true })
  assert.deepEqual([stuck.w.killed.length, labels(stuck.w)], [0, ['A', 'fallback']])
  assert.deepEqual(stuck.w.runs[1].turns[0].actions, [{ type: 'keypress', keys: ['SHIFT'] }])
  assert.equal(stuck.w.shift, false)
})

test('Shift not down right after the kill: inconclusive, never a pass (the hazard was not reproduced)', async () => {
  const { report } = await check({ shiftOnKill: false })
  assert.equal(report.verdict, 'inconclusive', report.reasons.join('; '))
  assert.match(report.reasons.join(' '), /not reproduced/)
})

test('run B does not release: the fallback run presses Shift; if that fails too, the alert names the human fix through the inbox route', async () => {
  const saved = await check({ releaseOnB: false })
  assert.deepEqual(labels(saved.w), ['A', 'B', 'fallback'])
  assert.equal(saved.w.shift, false)
  assert.equal(saved.report.verdict, 'fail', 'the next helper did not release: a failure even though Shift is up')
  const stuck = await check({ releaseOnB: false, fallbackWorks: false })
  assert.equal(stuck.report.shiftLeftDown, true)
  assert.equal(stuck.report.verdict, 'fail')
  assert.equal(stuck.w.alerts.length, 1)
  assert.ok(stuck.w.alerts[0].message.includes(HUMAN_FIX))
  assert.deepEqual(stuck.w.alerts[0].route, { roster: '/r/TEAM.yaml', inbox: DEFAULT_INBOX, seat: 'cu-verifier' })
})

test('a run B that hangs cannot keep Shift down: it is ended and the fallback comes within the bound from the kill', async () => {
  for (const fallbackWorks of [true, false]) {
    const { w, report, handles } = await check({ bHangs: true, fallbackWorks })
    const first = report.flags.find((f) => f.label === 'during fallback' || f.label === 'after fallback')
    assert.ok(first.at - report.timings.kill <= FALLBACK_AFTER_KILL_MS + 1500, `fallback ${first.at - report.timings.kill} ms after the kill`)
    assert.equal(handles.B.ended, true, 'the hung run B was ended (it holds the run lock)')
    assert.equal(w.fallbackLocked, undefined, 'and ended before the fallback run needed the lock')
    assert.equal(report.verdict, 'fail')
    if (fallbackWorks) assert.equal(w.shift, false)
    else assert.equal(w.alerts.length, 1)
  }
})

test('a marker still there after run B fails the check, even with Shift up', async () => {
  const { w, report } = await check({ markerStaysAfterB: true })
  assert.equal(w.shift, false)
  assert.equal(report.verdict, 'fail')
  assert.match(report.reasons.join(' '), /marker is still there after run B/)
})

test('--rehearse: run A holds, the identity is read and reported, nothing is killed, no run B, Shift read after the hold', async () => {
  const { w, report } = await check({ rehearsalHold: true }, { rehearse: true })
  assert.equal(report.verdict, 'rehearsed', report.reasons.join('; '))
  assert.deepEqual([w.killed.length, labels(w)], [0, ['A']])
  assert.deepEqual(report.rehearsal, { wouldKill: true, refusal: null })
  assert.match(report.reasons.join(' '), /rehearsal: would kill 4242 \(comm \S+CUHelper, socket \S+\/run\/helper-abc123\/helper\.sock; expected \S+ and \S+\/run\/\)/, 'comm and socket as read')
  assert.equal(report.pids.marker, 4242)
  assert.equal(report.flags.at(-1).label, 'after the rehearsal hold')
  assert.equal(report.flags.at(-1).shift, false)
  const odd = await check({ rehearsalHold: true, socket: '/tmp/other/run/s' }, { rehearse: true })
  assert.equal(odd.report.verdict, 'inconclusive')
  assert.equal(odd.report.rehearsal.wouldKill, false)
  assert.deepEqual(odd.w.killed, [])
})

test('the alert route and the alert itself: an urgent inbox message to the coordinator naming the fix, or a loud failure', () => {
  assert.match(alertRouteProblem(undefined), /--alert-roster/)
  assert.match(alertRouteProblem({ roster: '/r', inbox: '/i' }, (p) => p === '/r'), /no inbox tool/)
  assert.equal(alertRouteProblem({ roster: '/r', inbox: '/i' }, () => true), null)
  const calls = []
  const out = []
  assert.equal(sendAlert('Shift may still be held', { roster: '/r/TEAM.yaml', inbox: '/i/session-inbox.py', seat: 'cu-verifier' }, { run: (cmd, args) => calls.push([cmd, ...args]), write: (t) => out.push(t) }), true)
  assert.deepEqual(calls[0].slice(0, 9), ['python3', '/i/session-inbox.py', 'send', '--roster', '/r/TEAM.yaml', '--from', 'cu-verifier', '--to', ALERT_TO])
  assert.ok(calls[0].includes('alert') && calls[0].some((a) => a.includes(HUMAN_FIX)))
  assert.equal(sendAlert('x', { roster: '/r', inbox: '/i', seat: 's' }, { run: () => { throw new Error('inbox down') }, write: (t) => out.push(t) }), false)
  assert.match(out.join(''), /not delivered[\s\S]*press and release Shift once/)
})

test('the CLI run: the exact command line, and an environment without what loads code into node, with the private CU_HOME', () => {
  assert.deepEqual(cliArgs({ cli: '/c/cli.mjs', task: 'G1 check run A', fixture: 'ai.reflection.cu.fixture', seat: 'cu-verifier', planPath: '/h/plan-A.json', runsDirectory: '/h/runs', heldMarkerPath: '/h/helper/held-keys.json' }), [
    '/c/cli.mjs', 'run', '--env', 'macos-desktop', '--task', 'G1 check run A', '--app', 'ai.reflection.cu.fixture', '--seat', 'cu-verifier', '--model', 'scripted',
    '--plan', '/h/plan-A.json', '--consent', 'unattended', '--runs-dir', '/h/runs', '--no-live', '--held-marker', '/h/helper/held-keys.json',
  ])
  assert.deepEqual(childEnv({ PATH: '/bin', NODE_OPTIONS: '--require x', DYLD_INSERT_LIBRARIES: 'y', LD_X: 'z', NODE_PATH: '/n', HOME: '/u', CU_HOME: '/owner' }, '/h'), { PATH: '/bin', HOME: '/u', CU_HOME: '/h' })
})

test('the small rules: versions, the booking window, idle, the home, the socket argument, Shift bit, trajectory checks, arguments', () => {
  assert.equal(versionAtLeast('0.2.31', '0.2.31'), true)
  assert.equal(versionAtLeast('0.2.30', '0.2.31'), false)
  assert.equal(versionAtLeast(null, '0.2.31'), false)
  assert.equal(step4Refusal({ step4At: '2026-11-06T20:00:00Z', now: Date.parse('2026-11-06T19:00:00Z') }), null)
  assert.match(step4Refusal({ step4At: '2026-11-06T18:40:00Z', now: Date.parse('2026-11-06T19:00:00Z') }), /within 30 minutes/, 'a step 4 that just ran counts too')
  assert.equal(idleRefusal(300), null)
  assert.match(idleRefusal(299), /299 s/)
  assert.equal(cuHomeRefusal('/tmp/cu-g1/home', '/Users/x'), null)
  assert.match(cuHomeRefusal('/Users/x/.computer-use/', '/Users/x'), /not be the owner/)
  assert.equal(socketArgument('/x/CUHelper --socket /h/run/a/helper.sock --token-file /t'), '/h/run/a/helper.sock')
  assert.equal(socketArgument('/x/CUHelper --token-file /t'), null)
  assert.equal(shiftDown(SHIFT_MASK | 0x100), true)
  assert.equal(shiftDown(0x100), false)
  assert.equal(trajectoryFailures({ eventsA: [], eventsB: [], noticesA: [], noticesB: [] }).length, 4)
  assert.deepEqual(parseArgs(['--seat', 'cu-verifier', '--cu-home', '/tmp/h', '--no-step4-booked', '--rehearse', '--alert-roster', '/r']), { seat: 'cu-verifier', cuHome: '/tmp/h', noStep4Booked: true, rehearse: true, alertRoster: '/r' })
  assert.throws(() => parseArgs(['--kill-anything']), /unknown argument/)
})

test('the marker is re-read right before the kill: a marker that names another process by then is never acted on', async () => {
  const { w, report } = await check({ markerChangesTo: 5555 })
  assert.deepEqual(w.killed, [], 'neither the old pid nor the new one')
  assert.match(report.reasons.join(' '), /pid 5555 is \/usr\/libexec\/something-else/)
})

test('local input that arrives during the wait before the kill is caught by the re-check: no kill, no run B', async () => {
  const { w, report } = await check({ localInputMidHold: true })
  assert.deepEqual(w.killed, [])
  assert.match(report.reasons.join(' '), /run A reported local input/)
  assert.ok(!labels(w).includes('B'))
})

test('one canonical home: a home whose real path differs (/tmp is /private/tmp) still kills, all of it under the real path', async () => {
  const s = scratchHome()
  const made = world({})
  made.w.home = s.home
  made.w.realHome = `/private${s.home}`
  try {
    const report = await runG1(base(s.home), made.deps)
    assert.equal(report.verdict, 'pass', report.reasons.join('; '))
    assert.deepEqual(made.w.killed, [4242])
    assert.equal(made.w.runs[0].cuHome, made.w.realHome, 'the children get the canonical home as CU_HOME')
    assert.equal(made.w.runs[0].heldMarkerPath, join(made.w.realHome, 'helper', 'held-keys.json'))
    assert.equal(report.identity.runDir, join(made.w.realHome, 'run'))
  } finally {
    s.remove()
  }
})

test('a helper whose socket lies under the home as given, not its real path, is refused (the canonical home is compared)', async () => {
  const s = scratchHome()
  const made = world({})
  made.w.home = s.home
  made.w.realHome = `/private${s.home}`
  made.w.socket = join(s.home, 'run', 'helper-abc123', 'helper.sock')
  try {
    const report = await runG1(base(s.home), made.deps)
    assert.deepEqual(made.w.killed, [])
    assert.match(report.reasons.join(' '), /socket .* is not under/)
  } finally {
    s.remove()
  }
})

test('CU Fixture is launched visible before run A and closed on every way out; no window or no launch refuses before any run', async () => {
  const pass = await check({})
  assert.equal(pass.report.verdict, 'pass', pass.report.reasons.join('; '))
  assert.deepEqual(pass.w.fixtureLog, ['start', 'run A', 'run B', 'close'])
  const aborted = await check({ localInputDuringA: true })
  assert.equal(aborted.w.fixtureLog.at(-1), 'close', 'closed after an abort')
  const rehearsed = await check({ rehearsalHold: true }, { rehearse: true })
  assert.deepEqual(rehearsed.w.fixtureLog, ['start', 'run A', 'close'], 'closed after a rehearsal')
  const unseen = await check({ fixtureWindows: 0 })
  assert.equal(unseen.report.verdict, 'refused')
  assert.match(unseen.report.reasons.join(' '), /no window on screen after 3 s/)
  assert.ok(unseen.w.windowPolls >= 25, `looked ${unseen.w.windowPolls} times over the 3 s before refusing`)
  // The window reaching the window server a moment after open() (16:30:08Z): found on the 5th look, the check goes on.
  const late = await check({ fixtureWindowOnPoll: 5 })
  assert.equal(late.report.verdict, 'pass', late.report.reasons.join('; '))
  assert.equal(late.w.windowPolls, 5)
  assert.deepEqual(unseen.w.fixtureLog, ['start', 'close'], 'nothing run, the fixture closed')
  const unbuilt = await check({ fixtureFails: true })
  assert.equal(unbuilt.report.verdict, 'refused')
  assert.match(unbuilt.report.reasons.join(' '), /CU Fixture could not be launched/)
  assert.deepEqual([unbuilt.w.runs.length, unbuilt.w.fixtureLog], [0, []])
})

test('each CLI run reads its own run directory - found by its header\'s task and kept - never the newest new one (the real check\'s false fail)', () => {
  const s = scratchHome()
  try {
    const runs = join(s.dir, 'runs')
    mkdirSync(runs, { recursive: true })
    const dirFor = (name, task, at) => {
      mkdirSync(join(runs, name))
      writeFileSync(join(runs, name, 'run.json'), JSON.stringify({ task: { text: task, meta: null } }))
      utimesSync(join(runs, name), at, at)
    }
    mkdirSync(join(runs, 'older-run'))
    const findA = runDirFinder({ runsDirectory: runs, before: new Set(['older-run']), task: 'G1 check run A' })
    assert.equal(findA(), null, 'nothing yet')
    dirFor('20261106T173553Z-aaaaaa', 'G1 check run A', 1000)
    const findB = runDirFinder({ runsDirectory: runs, before: new Set(['older-run', '20261106T173553Z-aaaaaa']), task: 'G1 check run B' })
    dirFor('20261106T173555Z-bbbbbb', 'G1 check run B', 2000)
    // Read at the end, as the check does: run A's directory is the older one, and must still be run A's.
    assert.equal(findA(), join(runs, '20261106T173553Z-aaaaaa'))
    assert.equal(findB(), join(runs, '20261106T173555Z-bbbbbb'))
    dirFor('20261106T173601Z-cccccc', 'G1 check run fallback', 3000)
    assert.equal(findA(), join(runs, '20261106T173553Z-aaaaaa'), 'kept once found')
    // A directory whose header is not written yet is skipped, not guessed.
    mkdirSync(join(runs, 'no-header-yet'))
    assert.equal(runDirFinder({ runsDirectory: runs, before: new Set(), task: 'G1 check run D' })(), null)
  } finally {
    s.remove()
  }
})
