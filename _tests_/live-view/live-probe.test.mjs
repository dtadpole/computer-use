import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { launchDesktopEnvironment } from '../../_environments_/macos-desktop/environment.mjs'
import { connectStdio } from '../../_environments_/macos-desktop/helper-link.mjs'
import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createRunControl } from '../../_tools_/agent-core/lib.mjs'
import { startRun } from '../../_tools_/agent-core/run.mjs'
import { privateCuHome } from '../../_tools_/computer-use-mcp/desktop-proof.mjs'
import { BUNDLE_ID } from '../../_tools_/desktop-fixture/build.mjs'
import {
  CHECK_NAMES, DOM_SNAPSHOT, MARKER, PROBE, TASK_TEXT, UNOBSERVABLE, UsageError, WATCH_REFUSED, announcedRefusal, checkLine, cliArgs, cliStderrSink,
  controlLinkFile, createPrivateHome, homeRefusal, judgeControl, judgeScreen, judgeSnapshot, judgeWatch, main, parseProbeArgs, probeLiveView, probePlan,
  readEvents, readFrame, runWatchChecks, summaryLine, until, waitForControlLink, watchEvents, watchScreen,
} from '../../_tools_/live-view/live-probe.mjs'
import { startLiveView } from '../../_tools_/live-view/server.mjs'
import { consentView, initialView, pageFor, reduce } from '../../_tools_/live-view/ui-logic.mjs'
import { cleanEnvironment } from '../../_tools_/verify-kit/sut.mjs'
import { scratchLocks, spawnFake, stdioLink, stopFake } from '../macos-desktop/harness.mjs'

// CU-156: the arguments test pins the DEFAULT seat (cu-verifier); the seat follows CU_VERIFY_SEAT, which a gate
// exports, so an ambient value must not leak in.
const ambientSeat = process.env.CU_VERIFY_SEAT
before(() => { delete process.env.CU_VERIFY_SEAT })
after(() => { if (ambientSeat === undefined) delete process.env.CU_VERIFY_SEAT; else process.env.CU_VERIFY_SEAT = ambientSeat })

/**
 * The live probe's pure parts (arguments, refusals, the line format, the judges) and its check runners driven against
 * the live view in process: the macOS desktop driver on the fake helper (a Node child, never CUHelper.app), agent
 * core's real run control and, end to end, agent core's startRun with a scripted plan. There is no Chrome (the
 * other live-view suites start none). The watch page is rendered here as app.js renders it, from the served HTML and
 * ui-logic's pageFor. Scratch directories live under /tmp, because the probe accepts only an --out there. The
 * owner's ~/.computer-use is never touched, only compared by path.
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const WORLD = {
  grants: { screen: true, accessibility: true, postEvents: true, listenEvents: false },
  displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 1280, height: 800 }, scale: 1 }],
  apps: [{ bundleId: BUNDLE_ID, pid: 900, rect: { x: 0, y: 0, width: 1280, height: 800 } }],
}
/** The probe's pace for a fake run: the same steps, seconds instead of tens of seconds. */
const FAST = { leadWaitsMs: [2500], tailWaitsMs: [5000, 5000], frames: 3, scopeTimeoutMs: 5000, linkTimeoutMs: 10_000, holdMs: 200, stateTimeoutMs: 3000, inputTimeoutMs: 10_000, endTimeoutMs: 15_000, domTimeoutMs: 3000 }
const scratch = (prefix) => mkdtempSync(`/tmp/${prefix}`)

/** The served page's element tree: tag, id and hidden attribute, enough to render it as app.js does. */
function parsePage(html) {
  const VOID = new Set(['meta', 'link', 'img', 'input', 'br'])
  const root = { tag: 'root', id: null, hidden: false, parent: null, children: [] }
  let current = root
  for (const match of html.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g)) {
    const [whole, closing, tag, attrs] = match
    if (closing) {
      current = current.parent ?? root
      continue
    }
    const after = match.index + whole.length
    const node = { tag: tag.toLowerCase(), id: /\sid="([^"]*)"/.exec(attrs)?.[1] ?? null, hidden: /(^|\s)hidden(\s|=|$)/.test(attrs), parent: current, children: [], text: html.slice(after, html.indexOf('<', after)).trim() }
    current.children.push(node)
    if (!VOID.has(node.tag)) current = node
  }
  return root
}

const nodesOf = (node) => [node, ...node.children.flatMap(nodesOf)]

/**
 * The watch page without a browser, in DOM_SNAPSHOT's shape: app.js's render sets `hidden` and `disabled` by
 * pageFor and fills #consents from consentView. The attribute alone hides (app.css: `[hidden] { display: none
 * !important }`), and so does a hidden ancestor.
 */
function emulatedSnapshot(html, events) {
  const view = events.reduce(reduce, initialView())
  const page = pageFor(view)
  const root = parsePage(html)
  for (const node of nodesOf(root)) if (node.id !== null && node.id in page.hidden) node.hidden = page.hidden[node.id]
  const consents = nodesOf(root).find((node) => node.id === 'consents')
  for (const request of view.pending) {
    const row = { tag: 'div', id: null, hidden: false, parent: consents, children: [], text: '' }
    consents.children.push(row)
    for (const choice of consentView(request, page.controls.consent).choices) row.children.push({ tag: 'button', id: null, hidden: false, parent: row, children: [], text: choice.label })
  }
  const visible = (node) => !node.hidden && (node.parent === null || visible(node.parent))
  const within = (node, ancestor) => node.parent !== null && (node.parent === ancestor || within(node.parent, ancestor))
  const controls = nodesOf(root).filter((node) => ['button', 'input', 'select', 'textarea'].includes(node.tag))
    .map((node) => ({ id: node.id, tag: node.tag, text: node.text, visible: visible(node), disabled: page.disabled[node.id] === true, inConsents: within(node, consents) }))
  return { state: view.state, kind: view.kind ?? null, who: view.source === 'control' ? '(control)' : view.source === 'view' ? '(watching)' : '', title: page.title, controls, consentRows: view.pending.length }
}

/** `openDom` for the probe without Chrome: the served page and its own event stream, rendered by emulatedSnapshot. */
async function emulatedOpenDom(url) {
  const link = new URL(url)
  const html = await (await fetch(new URL('/', link), { headers: { authorization: `Bearer ${link.searchParams.get('token')}` } })).text()
  const stream = watchEvents(link)
  return async (expected) => {
    await until(() => stream.seen.length > 0 && stream.seen.reduce(reduce, initialView()).state === expected, 3000, `the page in ${expected}`).catch(() => {})
    return emulatedSnapshot(html, stream.seen)
  }
}

/** The live view with the desktop driver on a fresh fake helper, its scope empty until `env.addApp`. */
async function fakeDesktop(locks, { attach = true } = {}) {
  const control = createRunControl({ runId: 'probe-1' })
  const live = await startLiveView({ control, runId: 'probe-1', linkPath: null })
  let child = null
  const env = await launchDesktopEnvironment({
    seat: 'cu-developer-two', apps: [BUNDLE_ID], control, runLock: locks.next(),
    connect: async () => {
      const started = await stdioLink(WORLD)
      child = started.child
      return started.link
    },
  })
  if (attach) live.attach(env)
  return {
    control, live, env, link: new URL(live.controlUrl), watch: new URL(live.viewUrl),
    cleanup: async () => {
      await live.close()
      await env.close()
      if (child !== null) await stopFake(child)
    },
  }
}

test('profile cleanup never throws and never costs the results: it waits for Chrome, retries, and reports (ENOTEMPTY seen live)', async () => {
  const { removeProfile } = await import('../../_tools_/live-view/live-probe.mjs')
  const { mkdtempSync, mkdirSync, writeFileSync, chmodSync, existsSync, rmSync } = await import('node:fs')
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')
  const { EventEmitter } = await import('node:events')
  const out = mkdtempSync(join(tmpdir(), 'cu-probe-clean-'))
  try {
    const profile = join(out, 'chrome-profile')
    mkdirSync(join(profile, 'Default'), { recursive: true })
    writeFileSync(join(profile, 'Default', 'Cookies'), 'x')
    // A Chrome that exits shortly after close: cleanup waits for it, then removes the profile.
    const chrome = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null, kill: () => true })
    setTimeout(() => { chrome.exitCode = 0; chrome.emit('exit', 0) }, 50)
    assert.equal(await removeProfile(profile, { chrome, out }), 'removed')
    assert.equal(existsSync(profile), false)
    // A path outside --out is never touched.
    const outside = mkdtempSync(join(tmpdir(), 'cu-probe-outside-'))
    try {
      assert.equal(await removeProfile(outside, { out }), 'skipped: not under --out')
      assert.equal(existsSync(outside), true)
    } finally { rmSync(outside, { recursive: true, force: true }) }
    // A removal that fails is reported, not thrown (a directory the probe may not write).
    const stuck = join(out, 'stuck-profile')
    mkdirSync(join(stuck, 'inner'), { recursive: true })
    writeFileSync(join(stuck, 'inner', 'f'), 'x')
    chmodSync(join(stuck, 'inner'), 0o500)
    const outcome = await removeProfile(stuck, { out })
    chmodSync(join(stuck, 'inner'), 0o700)
    assert.match(outcome, /^left in place: /)
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
})

test('arguments: --out is required, --announced is yes or no, unknown flags and bad seats are refused, = and space forms read alike', () => {
  assert.deepEqual(parseProbeArgs(['--announced', 'yes', '--out', '/tmp/p']), { announced: true, out: '/tmp/p', seat: 'cu-verifier', help: false })
  assert.deepEqual(parseProbeArgs(['--out=/tmp/p', '--announced=no', '--seat=cu-developer-two']), { announced: false, out: '/tmp/p', seat: 'cu-developer-two', help: false })
  assert.equal(parseProbeArgs(['--out', '/tmp/p']).announced, false, 'not announced unless it says yes')
  for (const argv of [[], ['--announced', 'yes'], ['--out', '/tmp/p', '--announced', 'maybe'], ['--out', '/tmp/p', '--anounced', 'yes'], ['--out', '/tmp/p', '--seat', 'owner'], ['--out'], ['/tmp/p'], ['--out', '--announced']]) {
    assert.throws(() => parseProbeArgs(argv), UsageError, JSON.stringify(argv))
  }
  assert.equal(parseProbeArgs(['--help']).help, true)
})

test('without --announced yes the probe refuses before anything: exit 3, one summary line naming the flag, no directory, no warning', async () => {
  const out = `/tmp/cu-live-probe-never-${process.pid}`
  for (const argv of [['--out', out], ['--out', out, '--announced', 'no']]) {
    const lines = []
    const warnings = []
    const code = await main(argv, { write: (line) => lines.push(line), warn: (line) => warnings.push(line), start: () => assert.fail('the probe started') })
    assert.equal(code, 3)
    assert.equal(lines.length, 1)
    const summary = JSON.parse(lines[0])
    assert.deepEqual([summary.probe, summary.summary, summary.ok, summary.checks], [PROBE, true, false, 0])
    assert.match(summary.refused, /--announced yes \(D-024\); nothing was started/)
    assert.equal(existsSync(out), false, 'a refused probe made its --out')
    assert.equal(warnings.some((line) => line.includes('CU Fixture window')), false, 'the warning belongs to a probe that starts')
  }
  assert.equal(announcedRefusal({ announced: true }), null)
  const usage = []
  assert.equal(await main(['--announced', 'yes'], { write: (line) => usage.push(line), warn: () => {}, start: () => assert.fail('the probe started') }), 64)
  assert.match(JSON.parse(usage[0]).refused, /^usage: --out/)
})

test('CU_HOME: the default ~/.computer-use is refused by its path alone; so is a home outside --out, an --out outside /tmp, a link on the way, or a home the probe did not make', async () => {
  const dir = scratch('cu-live-probe-home-')
  try {
    const out = join(dir, 'out')
    const home = privateCuHome(out)
    assert.equal(home, join(out, 'user', '.computer-use'), "desktop-proof's private home")
    assert.equal(homeRefusal({ home, out }), null, 'a fresh home under --out')
    assert.match(homeRefusal({ home: join(homedir(), '.computer-use'), out }), /is the default ~\/\.computer-use, a person's own.*nothing was started/)
    assert.match(homeRefusal({ home, out, defaultHome: home }), /is the default/, 'whatever the default resolves to, by path, before any check of the disk')
    assert.match(homeRefusal({ home: join(dir, 'elsewhere', '.computer-use'), out }), /is not under --out/)
    assert.match(homeRefusal({ home, out, tmpRoot: join(dir, 'not-tmp') }), /outside .*not-tmp/)
    mkdirSync(join(dir, 'someone'), { recursive: true })
    mkdirSync(out, { recursive: true })
    symlinkSync(join(dir, 'someone'), join(out, 'user'))
    assert.match(homeRefusal({ home, out }), /is a symbolic link/)
    rmSync(join(out, 'user'))
    mkdirSync(home, { recursive: true })
    assert.match(homeRefusal({ home, out }), /did not create it \(no \.cu-live-probe\)/)
    createPrivateHome(home)
    assert.equal(statSync(home).mode & 0o777, 0o700)
    assert.ok(existsSync(join(home, MARKER)))
    assert.equal(homeRefusal({ home, out }), null, "the probe's own marked home may be reused")

    // Through main: refused before the warning and before anything would start.
    const outside = await main(['--announced', 'yes', '--out', join(homedir(), 'cu-live-probe-out')], { write: () => {}, warn: () => {}, start: () => assert.fail('the probe started') })
    assert.equal(outside, 3, '--out under the home directory')
    const foreign = join(dir, 'foreign')
    mkdirSync(privateCuHome(foreign), { recursive: true })
    const lines = []
    assert.equal(await main(['--announced', 'yes', '--out', foreign], { write: (line) => lines.push(line), warn: () => {}, start: () => assert.fail('the probe started') }), 3)
    assert.match(JSON.parse(lines[0]).refused, /did not create it/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('line format: one JSON object per line - probe, check, name, ok, evidence, unobservable - no token anywhere; the summary is ok only for three passes', () => {
  const token = 'f'.repeat(32)
  const line = checkLine({ check: 2, name: 'watch-link', ok: true, evidence: { url: `http://127.0.0.1:1/?token=${token}`, raw: token, nested: [{ t: `x${token}y` }] }, unobservable: ['one'] }, [token])
  assert.equal(line.includes('\n'), false)
  assert.equal(line.includes(token), false)
  const parsed = JSON.parse(line)
  assert.deepEqual(Object.keys(parsed), ['probe', 'check', 'name', 'ok', 'evidence', 'unobservable'])
  assert.deepEqual([parsed.probe, parsed.check, parsed.name, parsed.ok, parsed.evidence.url, parsed.evidence.raw, parsed.evidence.nested[0].t], [PROBE, 2, 'watch-link', true, 'http://127.0.0.1:1/?token=[redacted]', '[redacted]', 'x[redacted]y'])
  assert.equal(JSON.parse(checkLine({ check: 1, name: 'screen', ok: 'yes' })).ok, false, 'only true passes')
  const pass = (check) => ({ check, name: CHECK_NAMES[check - 1], ok: true })
  assert.equal(JSON.parse(summaryLine([pass(1), pass(2), pass(3)], { runId: 'r' })).ok, true)
  assert.deepEqual(JSON.parse(summaryLine([pass(1), pass(2), pass(3)], { runId: 'r' })), { probe: PROBE, summary: true, ok: true, passed: 3, failed: 0, checks: 3, runId: 'r' })
  assert.equal(JSON.parse(summaryLine([pass(1), pass(2)])).ok, false, 'a missing check fails the probe')
  assert.equal(JSON.parse(summaryLine([pass(1), pass(2), { ...pass(3), ok: false }])).failed, 1)
})

test('links: the watch URL is the CLI\'s watch line, the control line is dropped unkept, and the control link comes only from the run\'s mode-600 file in the private home', async () => {
  const watch = []
  const sink = cliStderrSink({ onWatch: (url) => watch.push(url) })
  sink.push('starting\nlive view (watch): http://127.0.0.1:5/?token=viewtoken\nlive view (con')
  sink.push('trol): http://127.0.0.1:5/?token=controltoken\nerror: token=controltoken leaked?\n')
  assert.deepEqual(watch, ['http://127.0.0.1:5/?token=viewtoken'])
  assert.equal(sink.controlLinesDropped, 1)
  assert.equal(sink.tail().includes('controltoken'), false, 'the control token survived in the tail')
  assert.match(sink.tail(), /starting\nerror: token=\[redacted\]/)

  const dir = scratch('cu-live-probe-link-')
  try {
    const home = join(dir, 'home')
    assert.equal(controlLinkFile(home), null, 'no control directory yet')
    mkdirSync(join(home, 'control'), { recursive: true })
    const waiting = waitForControlLink(home, { timeoutMs: 2000 })
    await sleep(50)
    writeFileSync(join(home, 'control', '20261105T000000Z-abcdef'), 'http://127.0.0.1:5/?token=controltoken\n', { mode: 0o600 })
    assert.deepEqual(await waiting, { runId: '20261105T000000Z-abcdef', path: join(home, 'control', '20261105T000000Z-abcdef'), mode: '600', url: 'http://127.0.0.1:5/?token=controltoken' })
    chmodSync(join(home, 'control', '20261105T000000Z-abcdef'), 0o644)
    assert.throws(() => controlLinkFile(home), /mode 644, not 600/)
    chmodSync(join(home, 'control', '20261105T000000Z-abcdef'), 0o600)
    writeFileSync(join(home, 'control', 'second'), 'x', { mode: 0o600 })
    assert.throws(() => controlLinkFile(home), /holds 2 control links/)
    rmSync(join(home, 'control', 'second'))
    symlinkSync(join(home, 'control', '20261105T000000Z-abcdef'), join(dir, 'link'))
    rmSync(join(home, 'control', '20261105T000000Z-abcdef'))
    symlinkSync(join(dir, 'link'), join(home, 'control', 'run'))
    assert.throws(() => controlLinkFile(home), /not a regular file/)
    rmSync(join(home, 'control', 'run'))
    await assert.rejects(waitForControlLink(home, { timeoutMs: 2000, exited: Promise.resolve(1) }), /ended before its live view wrote a control link/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the run: lead waits, the one click of the scripted plan, tail waits and a final; the CLI runs it unattended with the live view on, its runs in the private home', () => {
  const click = { type: 'click', button: 'left', x: 1200, y: 640 }
  const plan = probePlan({ frame: { width: 5120, height: 2880 }, turns: [{ actions: [click] }, { final: 'done' }] })
  assert.deepEqual(plan.frame, { width: 5120, height: 2880 })
  assert.deepEqual(plan.turns.map((turn) => (turn.actions ?? []).map((action) => action.type)), [['wait', 'wait'], ['click'], ['wait', 'wait'], []])
  assert.deepEqual(plan.turns[1].actions[0], click)
  assert.equal(plan.turns.flatMap((turn) => turn.actions ?? []).filter((action) => action.type !== 'wait').length, 1, 'one synthetic input')
  assert.ok(plan.turns.flatMap((turn) => turn.actions ?? []).every((action) => action.type !== 'wait' || action.duration_ms <= 10_000), 'every wait within agent core\'s limit')
  assert.equal(typeof plan.turns[3].final, 'string')
  assert.throws(() => probePlan({ turns: [{ actions: [click, click] }] }), /not one click/)
  assert.throws(() => probePlan(null), /not one click/)
  const args = cliArgs({ cli: '/x/cli.mjs', seat: 'cu-verifier', planPath: '/tmp/o/user/.computer-use/plan.json', runsDir: '/tmp/o/user/.computer-use/runs' })
  assert.deepEqual(args.slice(0, 7), ['/x/cli.mjs', 'run', '--env', 'macos-desktop', '--app', BUNDLE_ID, '--seat'])
  const flag = (name) => args[args.indexOf(name) + 1]
  assert.deepEqual([flag('--model'), flag('--consent'), flag('--runs-dir'), flag('--task')], ['scripted', 'unattended', '/tmp/o/user/.computer-use/runs', TASK_TEXT])
  assert.equal(args.includes('--no-live'), false)
  assert.doesNotThrow(() => new Function(`return ${DOM_SNAPSHOT}`), 'the page script parses')
})

const frame = (at, scope, extra = {}) => ({ receivedAt: at + 1, type: 'image/png', bytes: 100, at, scope, width: 1280, height: 800, ...extra })
const timeline = [
  { type: 'hello', at: 1000, receivedAt: 1001, environmentKind: null, environmentState: null },
  { type: 'attached', at: 1100, receivedAt: 1101, environmentKind: 'desktop', environmentState: { scope: [] } },
  { type: 'environment_state', at: 2000, receivedAt: 2001, environmentState: { scope: [BUNDLE_ID] } },
]

test('judge 1: watched from before the first approved app, no frame before it, every frame under a non-empty approved scope - else it fails and says which', () => {
  const screens = (frames, openedAt = 1002) => [{ name: 'control-link', openedAt, frames }]
  const good = judgeScreen({ events: timeline, screens: screens([frame(2100, [BUNDLE_ID]), frame(2600, [BUNDLE_ID])]), frameSize: { width: 1280, height: 800 } })
  assert.equal(good.ok, true, JSON.stringify(good.evidence))
  assert.deepEqual([good.evidence.framesBeforeScope, good.evidence.framesOutsideScope, good.evidence.frameMetadata, good.evidence.watchedBeforeScope], [0, 0, 'x-cu-frame-at and x-cu-scope on every part', ['control-link']])
  assert.ok(good.unobservable.includes(UNOBSERVABLE.windows), 'the frames\' windows are named as not observable')

  const early = judgeScreen({ events: timeline, screens: screens([frame(1500, []), frame(2100, [BUNDLE_ID])]) })
  assert.deepEqual([early.ok, early.evidence.framesBeforeScope, early.evidence.framesOutsideScope], [false, 1, 1])
  const foreign = judgeScreen({ events: timeline, screens: screens([frame(2100, [BUNDLE_ID, 'ai.reflection.cu.ledger'])]) })
  assert.deepEqual([foreign.ok, foreign.evidence.framesOutsideScope], [false, 1])
  const late = judgeScreen({ events: timeline, screens: screens([frame(2100, [BUNDLE_ID])], 2500) })
  assert.deepEqual([late.ok, late.evidence.watchedBeforeScope], [false, []], 'opened after the app joined: the time before was not watched')
  assert.equal(judgeScreen({ events: timeline, screens: screens([]) }).ok, false, 'no frame at all')
  assert.equal(judgeScreen({ events: timeline, screens: screens([frame(2100, [BUNDLE_ID], { width: 2000 })]), frameSize: { width: 1280, height: 800 } }).ok, false, 'larger than the run\'s frame')
  const bare = judgeScreen({ events: timeline, screens: screens([frame(null, null, { receivedAt: 2100 })]) })
  assert.deepEqual([bare.ok, bare.evidence.frameMetadata], [true, 'none'])
  assert.ok(bare.unobservable.includes(UNOBSERVABLE.noMetadata), 'without metadata the arrival-time judgement is named')
  assert.equal(judgeScreen({ events: timeline, screens: screens([frame(null, null, { receivedAt: 1900 })]) }).ok, false, 'without metadata, a frame that arrived before the scope')
})

test('judge 2 and 3 from their evidence: a visible control-token button or consent answer fails the page; each control step must move the state with the control link as its source', () => {
  const controls = (extra = []) => [{ id: 'pause', tag: 'button', visible: true, disabled: false, inConsents: false }, { id: 'stop', tag: 'button', visible: true, disabled: false, inConsents: false }, { id: 'resume', tag: 'button', visible: false, disabled: true, inConsents: false }, ...extra]
  const snap = (extra, fields = {}) => ({ expected: 'running', state: 'running', kind: 'desktop', who: '(watching)', controls: controls(extra), consentRows: 0, ...fields })
  assert.equal(judgeSnapshot(snap()).ok, true)
  assert.deepEqual(judgeSnapshot(snap()).designPermitted, [{ id: 'pause', disabled: false }, { id: 'stop', disabled: false }])
  assert.deepEqual(judgeSnapshot(snap([{ id: 'take-over', tag: 'button', text: 'Take over', visible: true, inConsents: false }])).forbiddenVisible, [{ id: 'take-over', tag: 'button', text: 'Take over' }])
  assert.equal(judgeSnapshot(snap([{ id: null, tag: 'button', text: 'Approve once', visible: true, inConsents: true }])).ok, false)
  assert.equal(judgeSnapshot(snap([], { who: '(control)' })).ok, false)
  assert.equal(judgeSnapshot(snap([], { screen: { naturalWidth: 0, naturalHeight: 0 } })).ok, false, 'a browser that shows no frame')
  assert.deepEqual(judgeSnapshot(snap([], { screen: { naturalWidth: 1280, naturalHeight: 800 } })).screen, { naturalWidth: 1280, naturalHeight: 800 })
  const replies = WATCH_REFUSED.map(({ command }) => ({ command, status: 403, error: command === 'consent' ? 'consent_not_accepted_from_caller' : 'not_allowed_for_sender', state: 'running' }))
  const evidence = { replies, input: { status: 403 }, stateEventsDuring: [], snapshots: [snap()], domError: null }
  assert.equal(judgeWatch(evidence).ok, true)
  assert.equal(judgeWatch({ ...evidence, replies: replies.map((r, i) => (i === 0 ? { ...r, status: 409 } : r)) }).ok, false, '409 is not the sender refusal')
  assert.equal(judgeWatch({ ...evidence, stateEventsDuring: [{ state: 'taken_over' }] }).ok, false)
  assert.equal(judgeWatch({ ...evidence, snapshots: [] }).ok, false, 'an unread page proves nothing')

  const moved = (state, prior) => ({ status: 200, state, event: { prior, state, source: 'control', at: 1 } })
  const control = {
    steps: { pause: moved('paused', 'running'), resume: moved('running', 'paused'), take_over: moved('taken_over', 'running'), hand_back: moved('running', 'taken_over'), stop: moved('finished', 'running') },
    inputsWhilePaused: 0, firstInputAfterResume: { type: 'click', done: 'done' }, remoteInput: { status: 409, error: 'unsupported_on_desktop', namedRefusal: true }, inputsWhileTakenOver: 0,
    end: { status: 'cancelled', controlLinkRemoved: true, eventStreamClosed: true }, error: null,
  }
  const judged = judgeControl(control)
  assert.equal(judged.ok, true, JSON.stringify(judged.evidence.parts))
  assert.equal(judged.evidence.parts.settleMsOnThatInput, null, 'not observed live, not judged')
  assert.deepEqual(judged.unobservable, [UNOBSERVABLE.settle])
  assert.equal(judgeControl({ ...control, settle: { firstAfterResume: null, laterWithSettle: 0 } }).ok, false, 'observed and missing')
  assert.equal(judgeControl({ ...control, firstInputAfterResume: null }).ok, false)
  assert.equal(judgeControl({ ...control, remoteInput: { status: 409, error: 'not_taken_over' } }).ok, false)
  assert.equal(judgeControl({ ...control, steps: { ...control.steps, pause: { ...moved('paused', 'running'), event: { ...moved('paused').event, source: 'local_input' } } } }).ok, false)
  assert.equal(judgeControl({ ...control, end: { ...control.end, controlLinkRemoved: false } }).ok, false)
})

test('check 1 on the fake helper: opened before the environment is attached, nothing until addApp, then PNG parts under the approved scope; a view that sends frames outside the scope fails', async () => {
  const locks = scratchLocks()
  const run = await fakeDesktop(locks, { attach: false })
  try {
    const events = watchEvents(run.link)
    const screens = [watchScreen(run.link, 'control-link')]
    await until(() => events.seen.length > 0 && screens[0].openedAt !== null, 3000, 'the streams')
    run.live.attach(run.env)
    screens.push(watchScreen(run.watch, 'watch-link'))
    await sleep(300)
    assert.equal(screens.reduce((sum, screen) => sum + screen.frames.length, 0), 0, 'a frame before any app was approved')
    await run.env.addApp(BUNDLE_ID)
    await until(() => screens.every((screen) => screen.frames.length >= 3), 5000, 'frames')
    for (const screen of screens) screen.close()
    events.close()
    const judged = judgeScreen({ events: events.seen, screens, frameSize: { width: 1280, height: 800 } })
    assert.equal(judged.ok, true, JSON.stringify(judged.evidence))
    assert.deepEqual([judged.evidence.emptyScopeFirst, judged.evidence.frameMetadata, judged.evidence.frameTypes, judged.evidence.frameSizes], [true, 'x-cu-frame-at and x-cu-scope on every part', ['image/png'], ['1280x800']])
  } finally {
    await run.cleanup()
    locks.remove()
  }

  // A plain desktop object whose frames come while its scope is empty, then while another app is in it.
  let state = { scope: [], pauseArmed: true, localInput: null, secureInput: false, grants: { screen: true } }
  let onFrame = null
  const env = { kind: 'desktop', state: () => state, on: () => () => {}, async startScreencast(options) { onFrame = options.onFrame; return async () => {} } }
  const control = createRunControl({ runId: 'probe-2' })
  const live = await startLiveView({ control, runId: 'probe-2', linkPath: null })
  try {
    const link = new URL(live.controlUrl)
    const events = watchEvents(link)
    const screens = [watchScreen(link, 'control-link')]
    await until(() => events.seen.length > 0 && screens[0].openedAt !== null, 3000, 'the streams')
    live.attach(env)
    await until(() => onFrame !== null, 3000, 'the screencast')
    // A few ms apart, so each part's time differs from the scope change after it.
    onFrame({ data: Buffer.from('frame-before'), mimeType: 'image/png' })
    await sleep(5)
    state = { ...state, scope: [BUNDLE_ID] }
    onFrame({ data: Buffer.from('frame-in-scope'), mimeType: 'image/png' })
    await sleep(5)
    state = { ...state, scope: [BUNDLE_ID, 'ai.reflection.cu.ledger'] }
    onFrame({ data: Buffer.from('frame-with-ledger'), mimeType: 'image/png' })
    await until(() => screens[0].frames.length === 3, 3000, 'three parts')
    screens[0].close()
    events.close()
    const judged = judgeScreen({ events: events.seen, screens })
    assert.deepEqual([judged.ok, judged.evidence.framesBeforeScope, judged.evidence.framesOutsideScope], [false, 1, 2])
    assert.deepEqual(screens[0].frames.map((f) => f.scope), [[], [BUNDLE_ID], [BUNDLE_ID, 'ai.reflection.cu.ledger']], 'each part names the scope it was written under')
  } finally {
    await live.close()
  }
})

test('check 2 on the fake helper: the watch link is refused 403 for every control-only command with the state unchanged, and its page shows Pause and Stop only; the control link in its place fails', async () => {
  const locks = scratchLocks()
  const run = await fakeDesktop(locks)
  try {
    await run.env.addApp(BUNDLE_ID)
    const events = watchEvents(run.link)
    await until(() => events.seen.length > 0, 3000, 'the stream')
    const watched = await runWatchChecks({ watch: run.watch, events, openDom: emulatedOpenDom })
    const judged = judgeWatch(watched.evidence)
    assert.equal(judged.ok, true, JSON.stringify(judged.evidence))
    assert.deepEqual(judged.evidence.replies.map((r) => [r.command, r.status, r.state]), WATCH_REFUSED.map(({ command }) => [command, 403, 'running']))
    assert.deepEqual(judged.evidence.snapshots[0].designPermitted.map((c) => c.id), ['pause', 'stop'])
    assert.equal(run.control.state, 'running')

    // A pending consent question: the watcher's page shows its text and no answer; the control link's shows answers.
    void run.control.requestConsent({ kind: 'action', class: 'new_app', app: 'ai.reflection.cu.ledger', what: 'use CU Ledger', lifetimes: ['once', 'run', 'always'] }, { timeoutMs: 0 })
    const watchPage = await (await emulatedOpenDom(run.watch.href))('awaiting_consent')
    const asWatcher = judgeSnapshot({ expected: 'awaiting_consent', ...watchPage })
    assert.deepEqual([asWatcher.ok, asWatcher.consentRows, asWatcher.consentControls], [true, 1, 0])
    const controlPage = judgeSnapshot({ expected: 'awaiting_consent', ...(await (await emulatedOpenDom(run.link.href))('awaiting_consent')) })
    assert.equal(controlPage.ok, false)
    assert.ok(controlPage.consentControls >= 3 && controlPage.forbiddenVisible.some((c) => c.id === 'take-over'), JSON.stringify(controlPage))
    run.control.send({ command: 'stop', reason: 'test' }, { source: 'control' })
    events.close()
  } finally {
    await run.cleanup()
    locks.remove()
  }

  const moreLocks = scratchLocks()
  const second = await fakeDesktop(moreLocks)
  try {
    await second.env.addApp(BUNDLE_ID)
    const events = watchEvents(second.link)
    await until(() => events.seen.length > 0, 3000, 'the stream')
    const misused = judgeWatch((await runWatchChecks({ watch: second.link, events, openDom: emulatedOpenDom })).evidence)
    assert.equal(misused.ok, false, 'the control link passed as a watch link')
    assert.equal(misused.evidence.replies[0].status, 200)
    events.close()
  } finally {
    await second.cleanup()
    moreLocks.remove()
  }
})

test('checks 1-3 end to end on agent core\'s startRun and the fake helper: the control link from the run\'s own file in a private CU_HOME, all three pass, and the click after the resume carries settleMs', { timeout: 60_000 }, async (t) => {
  const dir = scratch('cu-live-probe-run-')
  const home = join(dir, 'home')
  mkdirSync(home, { recursive: true, mode: 0o700 })
  const locks = scratchLocks()
  const child = spawnFake(WORLD)
  const priorHome = process.env.CU_HOME
  // The live view writes the control link under $CU_HOME, as in the CLI child the probe starts.
  process.env.CU_HOME = home
  let handle = null
  try {
    const appApprovals = createAppApprovals({ path: join(home, 'app-approvals.json') })
    appApprovals.grantAlways(BUNDLE_ID, { by: 'tty' })
    const plan = probePlan({ turns: [{ actions: [{ type: 'click', button: 'left', x: 200, y: 100 }] }, { final: 'done' }] }, FAST)
    const starting = startRun({
      environment: 'macos-desktop', seat: 'cu-developer-two', apps: [BUNDLE_ID], appApprovals, env: cleanEnvironment(), task: TASK_TEXT, runsDirectory: join(home, 'runs'),
      live: true, model: createScriptedAdapter(plan), bounds: { maxSteps: 6, maxWallMs: 60_000 },
      // The real helper takes a moment to launch through LaunchServices; the fake's hello waits as long.
      environmentOptions: { connect: async () => { await sleep(400); return connectStdio(child, { token: 'test-token', helloTimeoutMs: 5000 }) }, runLock: locks.next() },
    })
    void starting.then((started) => { handle = started })
    const link = await waitForControlLink(home, { timeoutMs: 10_000 })
    assert.equal(link.path, join(home, 'control', link.runId))
    const runDir = join(home, 'runs', link.runId)
    const { results, tokens } = await probeLiveView({
      link, watchUrl: starting.then((started) => started.viewUrl), watchSource: "startRun's handle", openDom: emulatedOpenDom,
      actions: () => readEvents(runDir), inputRequests: () => child.requests.filter((request) => request.type === 'input'),
      ended: async () => ({ ...(await (await starting).done), exitCode: null }), frameSize: () => readFrame(runDir), timing: FAST,
    })
    const lines = results.map((result) => checkLine(result, tokens))
    for (const line of lines) t.diagnostic(line)
    for (const [index, result] of results.entries()) assert.equal(result.ok, true, lines[index])
    assert.deepEqual(results.map((result) => result.name), CHECK_NAMES)
    assert.ok(lines.every((line) => !tokens.some((token) => line.includes(token))), 'a token in a printed line')
    const [screen, watch, control] = results
    assert.ok(screen.evidence.watchedBeforeScope.includes('control-link'), 'the control file let the probe watch before the first app joined')
    assert.equal(screen.evidence.framesBeforeScope, 0)
    assert.deepEqual(watch.evidence.snapshots.map((snapshot) => snapshot.expected), ['running', 'paused', 'taken_over'])
    assert.equal(control.evidence.settle.firstAfterResume, 1500, 'the click after the resume asked the helper to settle')
    assert.equal(control.evidence.firstInputAfterResume.type, 'click')
    assert.deepEqual([control.evidence.end.status, control.evidence.end.controlLinkRemoved, control.evidence.link.mode], ['cancelled', true, '600'])
    assert.equal(child.requests.filter((request) => request.type === 'input').length, 1, 'one synthetic input in the whole run')
  } finally {
    if (handle !== null) await handle.done.catch(() => {})
    if (priorHome === undefined) delete process.env.CU_HOME
    else process.env.CU_HOME = priorHome
    await stopFake(child)
    locks.remove()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('check 3 reads a live run\'s settle from the trajectory: the first input after the resume names effect.settleMs (CU-28)', async () => {
  const { inputActions, judgeControl } = await import('../../_tools_/live-view/live-probe.mjs')
  const t = (ms) => new Date(Date.UTC(2026, 10, 5, 16, 0, 0, ms)).toISOString()
  const events = [
    { kind: 'action', step: 1, index: 0, status: 'attempted', action: { type: 'click' }, t: t(100) },
    { kind: 'action', step: 1, index: 0, status: 'done', effect: { mapping: {}, settleMs: 1500 }, t: t(200) },
    { kind: 'action', step: 2, index: 0, status: 'attempted', action: { type: 'wait' }, t: t(300) },
    { kind: 'action', step: 2, index: 0, status: 'done', effect: {}, t: t(400) },
  ]
  const [click] = inputActions(events)
  assert.deepEqual([click.type, click.done, click.settleMs], ['click', 'done', 1500], 'waits are local; the click carries its settle')
  assert.equal(inputActions([{ ...events[0] }, { ...events[1], effect: { mapping: {} } }])[0].settleMs, null)
  // judgeControl reads evidence.settle, whatever its source.
  const base = { error: null, steps: {}, settle: { source: 'trajectory effect.settleMs', firstAfterResume: 1500, laterWithSettle: 0 } }
  assert.equal(judgeControl(base).evidence.parts.settleMsOnThatInput, true)
  assert.equal(judgeControl({ ...base, settle: { ...base.settle, firstAfterResume: null } }).evidence.parts.settleMsOnThatInput, false, 'a settled input without settleMs fails')
  assert.equal(judgeControl({ ...base, settle: { ...base.settle, laterWithSettle: 1 } }).evidence.parts.settleMsOnThatInput, false, 'only the first input after the resume settles')
  assert.deepEqual(judgeControl(base).unobservable, [])
})
