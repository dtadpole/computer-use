import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, test } from 'node:test'

import { SEAM_REQUESTS } from '../../_environments_/macos-desktop/helper-link.mjs'
import { ACTION_TYPES } from '../../_environments_/macos-desktop/input-plan.mjs'
import { holdDesktop, holdTokenMatch, releaseHold } from '../../_environments_/macos-desktop/run-lock.mjs'
import { EXTENSION_ACTIONS, GA_ACTIONS, validateBatch } from '../../_tools_/agent-core/actions.mjs'
import { TOOLSET_MODELS } from '../../_tools_/agent-core/adapter-claude.mjs'
import { createScriptedAdapter, isScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { HOLD_TOKEN_VARIABLE, main, parseStandInTurns, STAND_IN_VARIABLE, StandInRefusal, standInGate, UsageError } from '../../_tools_/agent-core/cli.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask, STAND_IN_NOTE, standInTurnsOf } from '../../_tools_/agent-core/loop.mjs'
import { startRun } from '../../_tools_/agent-core/run.mjs'
import { fakeLauncher, logged, quiet, scratchLocks, stopFake } from '../macos-desktop/harness.mjs'

/**
 * CU-342 (human-control.md, the owner-input stand-in): a rehearsal of the owner's pause posts one labelled untagged key
 * event after each named turn. cli.mjs run alone reads CU_STAND_IN_OWNER_INPUT and CU_DESKTOP_HOLD_TOKEN and refuses to
 * start unless every gate holds - the scripted adapter it built, a private CU_HOME, the seat's own live hold token,
 * unattended consent, macos-desktop. Nothing here launches CUHelper.app or touches the team's lock: the CLI gets a
 * startRun seam and scratch lock directories, and the driver runs against the fake helper (macos-desktop/harness.mjs).
 */

const REPO = fileURLToPath(new URL('../../', import.meta.url))
const SEAT = 'cu-developer-three'
const FIXTURE = 'com.example.fixture'
const root = mkdtempSync(join(tmpdir(), 'cu-342-'))
const locks = scratchLocks()
after(() => { locks.remove(); rmSync(root, { recursive: true, force: true }) })

// The private home a rehearsal uses, and the directory standing in for the default ~/.computer-use (a seam), so no row
// here reads the real home.
const privateHome = join(root, 'private-home')
const defaultHome = join(root, 'default-home')
mkdirSync(defaultHome)
let lockCount = 0
/** A fresh scratch lock directory, with `seat` holding it unless `seat` is null; resolves `{ dir, token }`. */
async function freshLock(seat = SEAT, extra = {}) {
  lockCount += 1
  const dir = join(root, `lock-${lockCount}`)
  mkdirSync(dir)
  if (seat === null) return { dir, token: null }
  const hold = await holdDesktop({ seat, minutes: 10, reason: 'CU-342 test', dir, ...extra })
  return { dir, token: hold.token }
}
const own = await freshLock()
/** Another 16-hex token than `token`, built at run time. */
const otherThan = (token) => token.replace(/^./, (c) => (c === 'a' ? 'b' : 'a'))

const plan = join(root, 'plan.json')
writeFileSync(plan, JSON.stringify({ turns: [{ final: 'ok' }] }))
const ARGV = ['run', '--env', 'macos-desktop', '--seat', SEAT, '--task', 'rehearse', '--app', FIXTURE, '--plan', plan, '--consent', 'unattended', '--no-live']
const REAL_MODEL_ARGV = ['run', '--env', 'macos-desktop', '--seat', SEAT, '--task', 'rehearse', '--app', FIXTURE, '--model', `claude-gateway/${TOOLSET_MODELS[0]}`, '--consent', 'unattended', '--no-live']
const BROWSER_ARGV = ['run', '--task', 'rehearse', '--start-url', 'http://127.0.0.1:1/', '--seat', SEAT, '--plan', plan, '--consent', 'unattended', '--no-live']
/** Every gate met: the turns, a private home and the seat's own live hold token. */
const gatesMet = (extra = {}) => ({ [STAND_IN_VARIABLE]: '3,9', CU_HOME: privateHome, [HOLD_TOKEN_VARIABLE]: own.token, ...extra })
const without = (env, name) => Object.fromEntries(Object.entries(env).filter(([key]) => key !== name))

/** `cli.mjs run` with a startRun seam; `starts` collects what each start was given. */
function cli(argv, env, seams = {}) {
  const starts = []
  const fakeStart = async (options) => {
    starts.push(options)
    return { viewUrl: null, controlUrl: null, done: Promise.resolve({ status: 'completed' }) }
  }
  const run = main(argv, { write: () => {}, env, startRun: fakeStart, runLockDir: own.dir, defaultCuHome: defaultHome, ...seams })
  return { run, starts }
}
/** A refusal that is a UsageError naming the variable and the gate. */
const refusedBy = (gate) => (error) => {
  assert.ok(error instanceof StandInRefusal && error instanceof UsageError, String(error))
  assert.equal(error.gate, gate, error.message)
  assert.match(error.message, new RegExp(STAND_IN_VARIABLE))
  assert.match(error.message, new RegExp(`the ${gate} gate`))
  return true
}
/** The CLI refuses at `gate` and starts nothing; resolves the refusal's message. */
async function cliRefuses(argv, env, gate, seams) {
  const { run, starts } = cli(argv, env, seams)
  const error = await run.then(() => null, (e) => e)
  assert.ok(error !== null, `refused by the ${gate} gate`)
  refusedBy(gate)(error)
  assert.equal(starts.length, 0, 'nothing started')
  return error.message
}

/** The gate called directly with every gate met but what `extra` overrides. */
const gate = (extra = {}) => standInGate({
  env: gatesMet(), model: createScriptedAdapter({ turns: [] }), consent: 'unattended', environment: 'macos-desktop', seat: SEAT, runLockDir: own.dir, defaultHome, ...extra,
})

test('every gate met: cli.mjs run hands startRun standInTurns, sorted and distinct; unset or empty hands none', async () => {
  for (const [value, turns] of [['3,9', [3, 9]], ['9, 3,3', [3, 9]], ['1', [1]]]) {
    const { run, starts } = cli(ARGV, gatesMet({ [STAND_IN_VARIABLE]: value }))
    assert.equal(await run, 0)
    assert.deepEqual(starts[0].standInTurns, turns, value)
  }
  for (const env of [without(gatesMet(), STAND_IN_VARIABLE), gatesMet({ [STAND_IN_VARIABLE]: '' })]) {
    const { run, starts } = cli(ARGV, env)
    assert.equal(await run, 0)
    assert.equal(Object.hasOwn(starts[0], 'standInTurns'), false, 'no stand-in without the variable')
  }
  // Unset, none of the other gates is consulted: a model run, the default home, no token, tty consent all start.
  const { run, starts } = cli(REAL_MODEL_ARGV, {})
  assert.equal(await run, 0)
  assert.equal(Object.hasOwn(starts[0], 'standInTurns'), false)
  for (const bad of ['0', '-1', 'three', '3,,9', '3.5', ' ', '3;9', '1234567']) {
    await cliRefuses(ARGV, gatesMet({ [STAND_IN_VARIABLE]: bad }), 'turns')
    assert.throws(() => parseStandInTurns(bad), refusedBy('turns'))
  }
  assert.deepEqual(await gate(), [3, 9])
})

test('(a) a model-driven run with the variable set refuses, naming it; an object that only claims to be the scripted adapter refuses too', async () => {
  await cliRefuses(REAL_MODEL_ARGV, gatesMet(), 'scripted-adapter')
  const real = createScriptedAdapter({ turns: [] })
  assert.equal(isScriptedAdapter(real), true)
  for (const forged of [{ ...real }, { id: 'scripted', model: 'scripted', capabilities: real.capabilities, open: real.open }, Object.create(real), null, undefined, 'scripted']) {
    assert.equal(isScriptedAdapter(forged), false)
    await assert.rejects(gate({ model: forged }), refusedBy('scripted-adapter'))
  }
})

test('(b) the default CU_HOME refuses, and so does any path that resolves to it: a symlink, a link to a link, a linked parent', async () => {
  await cliRefuses(ARGV, without(gatesMet(), 'CU_HOME'), 'private-home')
  const link = join(root, 'home-link')
  symlinkSync(defaultHome, link)
  const linkToLink = join(root, 'home-link-link')
  symlinkSync(link, linkToLink)
  const parentLink = join(root, 'root-link')
  symlinkSync(root, parentLink)
  const dangling = join(root, 'dangling-home')
  symlinkSync(join(root, 'nowhere', 'home'), dangling)
  // The default by its path is refused on the path alone, before any file is looked at; a link to it after resolving.
  for (const home of [defaultHome, `${defaultHome}/`, join(defaultHome, '.')]) {
    assert.match(await cliRefuses(ARGV, gatesMet({ CU_HOME: home }), 'private-home'), /CU_HOME is the default/, home)
  }
  for (const home of [link, linkToLink, join(parentLink, 'default-home')]) {
    assert.match(await cliRefuses(ARGV, gatesMet({ CU_HOME: home }), 'private-home'), /resolves to the default .* through a link/, home)
  }
  assert.match(await cliRefuses(ARGV, gatesMet({ CU_HOME: dangling }), 'private-home'), /cannot be resolved/)
  // The real default, without the seam: refused on the path alone, so no row here looks at the real home.
  assert.match(await cliRefuses(ARGV, gatesMet({ CU_HOME: join(homedir(), '.computer-use') }), 'private-home', { defaultCuHome: undefined }), /CU_HOME is the default/)
  await assert.rejects(standInGate({ env: without(gatesMet(), 'CU_HOME'), model: createScriptedAdapter({ turns: [] }), consent: 'unattended', environment: 'macos-desktop', seat: SEAT, runLockDir: own.dir }), refusedBy('private-home'))
  // A private home passes, created or not yet.
  assert.deepEqual(await gate({ env: gatesMet({ CU_HOME: join(root, 'not-yet', 'home') }) }), [3, 9])
})

test('(c) the hold token: missing, malformed, wrong, nested, expired, released, another seat\'s or no hold at all refuses', async () => {
  await cliRefuses(ARGV, without(gatesMet(), HOLD_TOKEN_VARIABLE), 'hold-token')
  for (const token of ['', 'not-a-token', own.token.toUpperCase(), `${own.token}0`, otherThan(own.token)]) {
    await cliRefuses(ARGV, gatesMet({ [HOLD_TOKEN_VARIABLE]: token }), 'hold-token')
  }
  // A nested holder's token is not the hold's own.
  const nestedLock = await freshLock()
  const nested = await holdDesktop({ seat: SEAT, minutes: 5, dir: nestedLock.dir })
  assert.equal(nested.nested, true)
  await cliRefuses(ARGV, gatesMet({ [HOLD_TOKEN_VARIABLE]: nested.token }), 'hold-token', { runLockDir: nestedLock.dir })
  assert.equal(holdTokenMatch({ seat: SEAT, token: nested.token, dir: nestedLock.dir }).reason, 'nested_token')
  assert.equal(holdTokenMatch({ seat: SEAT, token: nestedLock.token, dir: nestedLock.dir }).ok, true, 'the hold\'s own token still matches')
  // Another seat holds the Mac: its token, used for this seat's run, refuses.
  const foreign = await freshLock('cu-developer-one')
  await cliRefuses(ARGV, gatesMet({ [HOLD_TOKEN_VARIABLE]: foreign.token }), 'hold-token', { runLockDir: foreign.dir })
  assert.equal(holdTokenMatch({ seat: SEAT, token: foreign.token, dir: foreign.dir }).reason, 'other_seat')
  // Another seat's token from elsewhere, while this seat holds here.
  await cliRefuses(ARGV, gatesMet({ [HOLD_TOKEN_VARIABLE]: foreign.token }), 'hold-token')
  // Expired: a ten-minute hold read eleven minutes on; and one taken twenty minutes ago for one minute.
  await assert.rejects(gate({ now: () => Date.now() + 11 * 60_000 }), refusedBy('hold-token'))
  const old = await freshLock(SEAT, { now: () => Date.now() - 20 * 60_000, minutes: 1 })
  await cliRefuses(ARGV, gatesMet({ [HOLD_TOKEN_VARIABLE]: old.token }), 'hold-token', { runLockDir: old.dir })
  // Released.
  const released = await freshLock()
  assert.equal(await releaseHold({ seat: SEAT, token: released.token, dir: released.dir }), true)
  await cliRefuses(ARGV, gatesMet({ [HOLD_TOKEN_VARIABLE]: released.token }), 'hold-token', { runLockDir: released.dir })
  // No hold at all; a malformed hold file.
  const empty = await freshLock(null)
  await cliRefuses(ARGV, gatesMet(), 'hold-token', { runLockDir: empty.dir })
  writeFileSync(join(empty.dir, 'hold.json'), '{ not json')
  await cliRefuses(ARGV, gatesMet(), 'hold-token', { runLockDir: empty.dir })
  assert.deepEqual([holdTokenMatch({ seat: SEAT, token: own.token, dir: own.dir }).ok, holdTokenMatch({ seat: 'cu-developer-one', token: own.token, dir: own.dir }).reason], [true, 'other_seat'])
  // The refusal never prints a token.
  const { run } = cli(ARGV, gatesMet({ [HOLD_TOKEN_VARIABLE]: otherThan(own.token) }))
  const error = await run.catch((e) => e)
  assert.equal(error.message.includes(own.token) || error.message.includes(otherThan(own.token)), false)
})

test('(d) consent must be unattended, and (e) the run a macos-desktop one', async () => {
  await cliRefuses([...ARGV.slice(0, -3), '--consent', 'other', '--no-live'], gatesMet(), 'unattended')
  await assert.rejects(gate({ consent: 'tty' }), refusedBy('unattended'))
  await assert.rejects(gate({ consent: undefined }), refusedBy('unattended'))
  await cliRefuses(BROWSER_ARGV, gatesMet(), 'macos-desktop')
  for (const environment of [undefined, 'chrome-browser']) await assert.rejects(gate({ environment }), refusedBy('macos-desktop'))
})

test('(d) the MCP server never reads the variable or the hold token; among the code only cli.mjs names the variable', () => {
  const mcp = join(REPO, '_tools_', 'computer-use-mcp')
  const sources = readdirSync(mcp).filter((name) => name.endsWith('.mjs'))
  assert.ok(sources.includes('server.mjs') && sources.includes('runs.mjs'))
  for (const name of sources) {
    const text = readFileSync(join(mcp, name), 'utf8')
    for (const word of [STAND_IN_VARIABLE, HOLD_TOKEN_VARIABLE, 'standInTurns', 'simulateLocalInput']) assert.equal(text.includes(word), false, `${name} names ${word}`)
  }
  const naming = []
  for (const dir of [join(REPO, '_tools_', 'agent-core'), join(REPO, '_environments_', 'macos-desktop'), mcp]) {
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.mjs'))) {
      if (readFileSync(join(dir, name), 'utf8').includes(STAND_IN_VARIABLE)) naming.push(name)
    }
  }
  assert.deepEqual(naming, ['cli.mjs'])
})

// The real desktop driver against the fake helper, on scratch locks.
const launchOnFake = fakeLauncher(locks, { apps: [FIXTURE] })
const world = (extra = {}) => ({
  displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 800, height: 600 }, scale: 1 }],
  apps: [{ bundleId: FIXTURE, pid: 601, title: 'Fixture', rect: { x: 0, y: 0, width: 800, height: 600 } }],
  frontmost: FIXTURE,
  ...extra,
})
const WAIT = { type: 'wait', duration_ms: 0 }
let runs = 0
/** A store under the scratch root that always approves the fixture, so the unattended start admits it. */
function approvals() {
  runs += 1
  const store = createAppApprovals({ path: join(root, `approvals-${runs}.json`) })
  store.grantAlways(FIXTURE, { by: 'api' })
  return store
}
const readEvents = (dir) => readFileSync(join(dir, 'events.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))

/**
 * One runTask on the real driver over the fake helper. A person (this test) resumes every local-input pause from the
 * live view's control channel shortly after it comes. Resolves the result, its events, the control's state changes,
 * the driver's localInput reports and the fake's requests.
 */
async function rehearse({ config = world(), turns, standInTurns }) {
  const control = createRunControl()
  const states = []
  const { env, child } = await launchOnFake(config, { control })
  const reports = []
  env.on('localInput', (event) => reports.push(event?.kind ?? null))
  control.subscribe((event) => {
    if (event.type !== 'state') return
    states.push({ state: event.state, source: event.source, stopHeld: event.state === 'paused' ? env.localInputAt !== null : null })
    if (event.state === 'paused') setTimeout(() => control.send({ command: 'resume' }, { source: 'control' }), 5)
  })
  await logged(child, 3)
  try {
    const model = createScriptedAdapter({ frame: { width: env.frame.width, height: env.frame.height }, turns })
    const result = await runTask({
      task: 'rehearse the owner\'s pause', environment: env, model, control, runsDirectory: join(root, 'runs'), build: { commit: 'test', dirty: false },
      apps: [FIXTURE], appApprovals: approvals(), ...(standInTurns !== undefined ? { standInTurns } : {}),
    })
    await quiet(child)
    return { result, events: readEvents(result.trajectoryDir), states, reports, requests: child.requests.slice(), header: JSON.parse(readFileSync(join(result.trajectoryDir, 'run.json'), 'utf8')) }
  } finally {
    await env.close()
    await stopFake(child)
  }
}
const seamRequests = (requests) => requests.filter((r) => r.type === 'simulateLocalInput').map(({ id, ...rest }) => rest)

test('(e) every gate met, on the real driver and the fake helper: exactly one untagged key per named turn, each labelled first', async () => {
  const { result, events, states, requests, header } = await rehearse({ turns: [{ actions: [WAIT] }, { actions: [WAIT] }, { actions: [WAIT] }, { final: 'done\nOUTCOME: done' }], standInTurns: [3, 1] })
  assert.equal(result.status, 'completed', result.error)
  assert.deepEqual(seamRequests(requests), [{ type: 'simulateLocalInput', kind: 'pointer', via: 'untagged' }, { type: 'simulateLocalInput', kind: 'pointer', via: 'untagged' }])
  const notes = events.filter((e) => e.kind === 'note' && e.message === STAND_IN_NOTE)
  assert.deepEqual(notes.map((e) => e.step), [1, 3], 'one note after turn 1 and one after turn 3')
  assert.equal(STAND_IN_NOTE, "STAND-IN owner input (CU-342, an untagged pointer move): not the owner's")
  const pauses = events.filter((e) => e.kind === 'local_input')
  assert.equal(pauses.length, 2)
  notes.forEach((note, i) => assert.ok(note.seq < pauses[i].seq, 'the label comes before the pause it explains'))
  assert.deepEqual(states.filter((s) => s.state === 'paused').map((s) => s.source), ['local_input', 'local_input'])
  assert.deepEqual(header.standInTurns, [1, 3], 'the run record says it was a rehearsal')
  // On the fake environment too: one call per named turn, right after it - the plan has been asked exactly that often.
  const control = createRunControl()
  const calls = []
  let asked = 0
  const env = createFakeEnvironment({ kind: 'desktop', control, frontmost: FIXTURE })
  env.simulateLocalInput = async (args) => { calls.push({ args, asked }); return { at: null, detectedBy: 'tap' } }
  const model = createScriptedAdapter((input, { index }) => { asked += 1; return index < 4 ? { actions: [WAIT] } : { final: 'done' } })
  const fake = await runTask({ task: 'rehearse', environment: env, model, control, runsDirectory: join(root, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: approvals(), standInTurns: [2, 4, 9] })
  assert.equal(fake.status, 'completed')
  assert.deepEqual(calls, [{ args: { kind: 'pointer', via: 'untagged' }, asked: 2 }, { args: { kind: 'pointer', via: 'untagged' }, asked: 4 }], 'turn 9 never came')
})

test('(f) the stand-in\'s pause is the ordinary local-input pause: the same control source, stop and trajectory record as a person\'s key on the fake helper', async () => {
  const standIn = await rehearse({ turns: [{ actions: [WAIT] }, { actions: [WAIT] }, { final: 'done' }], standInTurns: [1] })
  // The fake helper's person: a key pressed during the next posted input (quirk localInputAfter), no stand-in at all.
  const person = await rehearse({ config: world({ quirks: { localInputAfter: 0 } }), turns: [{ actions: [{ type: 'click', button: 'left', x: 100, y: 100 }] }, { actions: [WAIT] }, { final: 'done' }] })
  assert.equal(seamRequests(person.requests).length, 0)
  for (const [run, kind] of [[standIn, 'pointer'], [person, 'key']]) {
    assert.equal(run.result.status, 'completed', run.result.error)
    assert.deepEqual(run.states.filter((s) => s.state === 'paused'), [{ state: 'paused', source: 'local_input', stopHeld: true }], 'paused by local_input with the driver\'s stop held')
    // CU-342 (cu-verifier, R1c): the seam posts one untagged pointer move, so the stand-in is heard as a pointer.
    assert.deepEqual(run.reports, [kind], `the driver heard one ${kind}`)
  }
  const record = (run) => run.events.filter((e) => e.kind === 'local_input').map(({ seq, t, step, inputKind, ...rest }) => rest)
  assert.deepEqual(record(standIn), record(person), 'the same record but for the input kind')
  assert.deepEqual(standIn.events.filter((e) => e.kind === 'local_input').map((e) => e.inputKind), ['pointer'])
  // Only the label tells them apart.
  assert.equal(standIn.events.filter((e) => e.message === STAND_IN_NOTE).length, 1)
  assert.equal(person.events.filter((e) => e.message === STAND_IN_NOTE).length, 0)
})

test('(g) CU_STAND_IN_OWNER_INPUT in process.env without the standInTurns option posts nothing: runTask, startRun and the driver read no variable', async () => {
  const saved = { stand: process.env[STAND_IN_VARIABLE], token: process.env[HOLD_TOKEN_VARIABLE] }
  process.env[STAND_IN_VARIABLE] = '1,2'
  process.env[HOLD_TOKEN_VARIABLE] = own.token
  try {
    const turns = [{ actions: [WAIT] }, { actions: [WAIT] }, { final: 'done' }]
    const onFake = await rehearse({ turns })
    assert.equal(onFake.result.status, 'completed', onFake.result.error)
    assert.deepEqual(seamRequests(onFake.requests), [])
    assert.equal(onFake.events.some((e) => e.message === STAND_IN_NOTE || e.kind === 'local_input'), false)
    assert.equal(Object.hasOwn(onFake.header, 'standInTurns'), false)
    for (const through of ['runTask', 'startRun']) {
      const calls = []
      const spyEnv = (control) => {
        const env = createFakeEnvironment({ kind: 'desktop', control, frontmost: FIXTURE })
        env.simulateLocalInput = async (args) => { calls.push(args); return { at: null, detectedBy: 'tap' } }
        return env
      }
      const model = createScriptedAdapter({ turns })
      const result = through === 'runTask'
        ? await runTask({ task: 'rehearse', environment: spyEnv(createRunControl()), model, runsDirectory: join(root, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: approvals() })
        : await (await startRun({ environment: 'macos-desktop', seat: SEAT, env: {}, apps: [FIXTURE], task: 'rehearse', model, runsDirectory: join(root, 'runs'), live: false, appApprovals: approvals(), launch: async (options) => spyEnv(options.control) })).done
      assert.equal(result.status, 'completed', `${through}: ${result.error}`)
      assert.deepEqual(calls, [], through)
    }
  } finally {
    for (const [name, value] of [[STAND_IN_VARIABLE, saved.stand], [HOLD_TOKEN_VARIABLE, saved.token]]) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
})

test('a stand-in the environment cannot post fails at the start, never mid-run; malformed standInTurns are refused', async () => {
  const opened = { n: 0 }
  const spyModel = () => {
    const model = createScriptedAdapter({ turns: [{ actions: [WAIT] }, { final: 'never' }] })
    return { ...model, async open(options) { opened.n += 1; return model.open(options) } }
  }
  const env = createFakeEnvironment({ kind: 'desktop', frontmost: FIXTURE })
  await assert.rejects(runTask({ task: 'rehearse', environment: env, model: spyModel(), runsDirectory: join(root, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: approvals(), standInTurns: [1] }), /simulateLocalInput/)
  assert.deepEqual([opened.n, env.log.length, env.screenshotCount], [0, 0, 0])
  let launched = null
  const run = await startRun({
    environment: 'macos-desktop', seat: SEAT, env: {}, apps: [FIXTURE], task: 'rehearse', model: spyModel(), runsDirectory: join(root, 'runs'), live: false, appApprovals: approvals(), standInTurns: [1],
    launch: async (options) => { launched = createFakeEnvironment({ kind: 'desktop', control: options.control, frontmost: FIXTURE }); return launched },
  })
  const result = await run.done
  assert.equal(result.status, 'error')
  assert.match(result.error, /^stand_in_unsupported: /)
  assert.deepEqual([opened.n, launched.log.length, launched.screenshotCount, launched.closed, run.started], [0, 0, 0, true, false])
  for (const bad of [[0], [1.5], [-1], '3', [3, '9'], {}]) {
    assert.throws(() => standInTurnsOf(bad), TypeError, JSON.stringify(bad))
    await assert.rejects(startRun({ environment: 'macos-desktop', seat: SEAT, env: {}, apps: [FIXTURE], task: 'x', model: spyModel(), live: false, standInTurns: bad, launch: async () => { throw new Error('no launch expected') } }), TypeError)
  }
  assert.deepEqual(standInTurnsOf([9, 3, 3]), [3, 9])
  assert.deepEqual([standInTurnsOf(undefined), standInTurnsOf(null)], [[], []])
})

test('(h) no model action reaches simulateLocalInput: no action type names it, perform refuses it, and a scripted turn holding it posts nothing', async () => {
  const vocabulary = [...GA_ACTIONS, ...EXTENSION_ACTIONS, ...ACTION_TYPES]
  for (const type of vocabulary) {
    assert.doesNotMatch(type, /simulate|local|seam|untagged/i, type)
    assert.equal(Object.hasOwn(SEAM_REQUESTS, type), false, type)
  }
  const seamAction = { type: 'simulateLocalInput', kind: 'pointer', via: 'untagged' }
  assert.equal(validateBatch([seamAction], { frame: { width: 800, height: 600 }, extensions: EXTENSION_ACTIONS }).ok, false)
  // The driver's perform dispatches by the canonical type through planAction, never by a method name.
  const environmentSource = readFileSync(join(REPO, '_environments_', 'macos-desktop', 'environment.mjs'), 'utf8')
  const performBody = environmentSource.slice(environmentSource.indexOf('  async perform(action) {'), environmentSource.indexOf('\n  }\n', environmentSource.indexOf('  async perform(action) {')))
  assert.ok(performBody.includes('planAction(action'), 'the perform body was found')
  assert.equal(/this\s*\[/.test(performBody), false, 'no dynamic method dispatch in perform')
  for (const adapter of ['adapter-claude.mjs', 'adapter-responses.mjs', 'adapter-scripted.mjs', 'actions.mjs']) {
    const text = readFileSync(join(REPO, '_tools_', 'agent-core', adapter), 'utf8')
    assert.equal(/simulateLocalInput|SEAM_REQUESTS/.test(text), false, `${adapter} offers the seam to no model`)
  }
  // The real driver on the fake helper: perform refuses it with nothing sent.
  const { env, child } = await launchOnFake(world())
  try {
    await logged(child, 3)
    await assert.rejects(env.perform(seamAction), (e) => e.code === 'unsupported_action' || e.code === 'invalid_argument')
    await quiet(child)
    assert.deepEqual(seamRequests(child.requests), [])
  } finally {
    await env.close()
    await stopFake(child)
  }
  // Through runTask: a model turn holding it is refused before any effect, and the helper never hears of it.
  const run = await rehearse({ turns: [{ actions: [seamAction] }, { final: 'done' }] })
  assert.deepEqual(seamRequests(run.requests), [])
  assert.equal(run.events.some((e) => e.kind === 'local_input' || e.message === STAND_IN_NOTE), false)
  assert.ok(run.result.actions.refused >= 1, JSON.stringify(run.result.actions))
})
