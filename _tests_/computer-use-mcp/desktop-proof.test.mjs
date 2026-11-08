import assert from 'node:assert/strict'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { appsFor, missingApprovals } from '../../_evaluators_/desktop-suite/lib.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { DESKTOP_TASKS } from '../../_tools_/desktop-fixture/tasks.mjs'
import { checkStart } from '../../_tools_/computer-use-mcp/tools.mjs'
import * as proof from '../../_tools_/computer-use-mcp/desktop-proof.mjs'

const {
  DESKTOP_CAPS, approvalRefusal, approvalStore, approvalsNote, copyOwnerApprovals, desktopProofFields, desktopPrompt, desktopRefusal,
  desktopStartArgs, desktopWarning, linkInstalledHelper, newRunDir, ownerRecord, parseProofArgs, prepareDesktop, privateCuHome, readRunResult,
  sessionEnv,
} = proof

const TOOLS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '_tools_')
const FIXTURE = 'ai.reflection.cu.fixture'
const LEDGER = 'ai.reflection.cu.ledger'
const MODEL = 'claude-gateway/claude-sonnet-5-5'
const APPROVAL_WORDING = /approv|consent|always|grant|permission|allow|pre_approve|lifetime/i
const LOADERS = ['NODE_OPTIONS', 'NODE_PATH', 'NODE_REPL_EXTERNAL_MODULE', 'NODE_ICU_DATA', 'DYLD_INSERT_LIBRARIES', 'LD_PRELOAD']
/** The owner's records as approve-always wrote them at 13:42Z (D-033), plus an app the proofs never use. */
const OWNER = Object.freeze({
  fixture: { bundleId: FIXTURE, grantedAt: '2026-11-05T13:42:10.123Z', by: 'tty' },
  ledger: { bundleId: LEDGER, grantedAt: '2026-11-05T13:42:14.456Z', by: 'tty' },
  other: { bundleId: 'com.apple.TextEdit', grantedAt: '2026-11-04T09:00:00.000Z', by: 'live' },
})
/** Words that would send someone to make an approval from the proof, which only the owner does (C1). */
const ASKS_FOR_APPROVAL = /approve-always|\[y\/N\]|answer y|in your own terminal|CU_HOME=/

/** A scratch directory under /tmp, removed afterwards; its name stays short so a CU_HOME inside fits the socket limit. */
function scratch(t) {
  const dir = mkdtempSync('/tmp/cu-dp-')
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

/** A fake installed helper: a directory named CUHelper.app, nothing in it runs. */
function fakeHelper(dir) {
  const source = join(dir, 'installed', 'helper', 'CUHelper.app')
  mkdirSync(join(source, 'Contents', 'MacOS'), { recursive: true })
  return source
}

/**
 * A stand-in for the operator's CU_HOME under the scratch directory, never the real ~/.computer-use: the fake helper,
 * and, unless `apps` is null, an always store in agent core's own format holding `apps`. Returns its path.
 */
function ownerHome(dir, apps) {
  fakeHelper(dir)
  const home = join(dir, 'installed')
  if (apps !== null) writeFileSync(join(home, 'app-approvals.json'), JSON.stringify({ schema: 'cu-app-approvals/v1', apps }, null, 2) + '\n', { mode: 0o600 })
  return home
}

/** The private store's bytes, or null when there is none. */
function privateBytes(home) {
  const path = join(home, 'app-approvals.json')
  return existsSync(path) ? readFileSync(path, 'utf8') : null
}

test('arguments: the browser stays the default, as before; --env macos-desktop picks badge-form; --announced is yes or no', () => {
  const browser = parseProofArgs([])
  assert.deepEqual([browser.env, browser.desktop, browser.task, browser.install, browser.announced, browser.out], ['chrome-browser', false, 'visitor-badge', false, false, null])
  assert.deepEqual([browser.model, browser.sessionModel], [MODEL, 'claude-sonnet-5-5'])
  assert.equal(parseProofArgs(['--install', 'yes', '--task', 'filters-search']).task, 'filters-search', 'a browser task is checked by the fixture site, not here')
  assert.equal(parseProofArgs(['--install', 'maybe']).install, false, 'a browser command line means what it meant')
  const desktop = parseProofArgs(['--env', 'macos-desktop', '--announced', 'yes', '--out', '/tmp/x'])
  assert.deepEqual([desktop.env, desktop.desktop, desktop.task, desktop.announced, desktop.out], ['macos-desktop', true, 'badge-form', true, '/tmp/x'])
  assert.equal(parseProofArgs(['--env', 'macos-desktop', '--task', 'multi-app-transfer']).task, 'multi-app-transfer')
  assert.equal(parseProofArgs(['--env', 'macos-desktop', '--announced', 'no']).announced, false)
  assert.throws(() => parseProofArgs(['--env', 'windows']), /--env is chrome-browser .* or macos-desktop/)
  assert.throws(() => parseProofArgs(['--env', 'macos-desktop', '--announced', 'true']), /--announced is yes or no/)
  assert.throws(() => parseProofArgs(['--env', 'macos-desktop', '--task', 'visitor-badge']), /no desktop task 'visitor-badge': one of badge-form/)
})

test('a desktop run without --announced yes is refused before anything starts; the browser never needs it', () => {
  assert.match(desktopRefusal(parseProofArgs(['--env', 'macos-desktop'])), /--announced yes.*D-024.*nothing was started/)
  assert.match(desktopRefusal(parseProofArgs(['--env', 'macos-desktop', '--announced', 'no'])), /--announced yes/)
  assert.equal(desktopRefusal(parseProofArgs(['--env', 'macos-desktop', '--announced', 'yes'])), null)
  assert.equal(desktopRefusal(parseProofArgs([])), null)
})

test('the DSH desktop prompt: environment, the task\'s bundle ids, the task, model and caps, then the status poll; no start_url', () => {
  const task = 'In CU Fixture, create a visitor badge for Mira Okafor.'
  const prompt = desktopPrompt({ toolPrefix: 'mcp__cu__', task, apps: [FIXTURE], model: MODEL })
  const args = JSON.parse(/computer_use_start with exactly these arguments: (\{.*\})$/m.exec(prompt)[1])
  assert.deepEqual(args, { environment: 'macos-desktop', apps: [FIXTURE], task, model: MODEL, max_steps: 20, max_minutes: 6, max_cost_usd: 1 })
  assert.match(prompt, /^1\. Call mcp__cu__computer_use_start /m)
  assert.match(prompt, /^2\. Call mcp__cu__computer_use_status with that run_id and wait_seconds 45, again and again, until state is "finished"\.$/m)
  assert.match(prompt, /replay_command/)
  assert.doesNotMatch(prompt, /start_url|allow_sites|replay_url/)
  assert.deepEqual(DESKTOP_CAPS, { maxSteps: 20, maxMinutes: 6, maxCostUsd: 1 })
})

test('no desktop prompt carries approval wording, for any task in the catalogue, and the server accepts every start it names', () => {
  for (const [id, task] of Object.entries(DESKTOP_TASKS)) {
    const apps = appsFor(task)
    const frame = desktopPrompt({ toolPrefix: 'mcp__cu__', task: '<TASK>', apps, model: MODEL })
    assert.doesNotMatch(frame, APPROVAL_WORDING, `${id}: the proof's own words never approve anything`)
    const spec = checkStart(desktopStartArgs({ task: `the task of ${id}`, apps, model: MODEL }))
    assert.deepEqual([spec.environment, spec.apps, spec.startUrl, spec.preApprove, spec.maxSteps], ['macos-desktop', apps, null, [], 20], id)
  }
  assert.deepEqual(appsFor(DESKTOP_TASKS['multi-app-transfer']), [FIXTURE, LEDGER], 'a two-app task names both bundle ids')
  assert.match(desktopPrompt({ task: 't', apps: [FIXTURE, LEDGER], model: MODEL }), /"apps":\["ai\.reflection\.cu\.fixture","ai\.reflection\.cu\.ledger"\]/)
})

test('the warning is one line that names the fixture app(s) getting the input', () => {
  const line = desktopWarning({ taskId: 'badge-form', apps: [FIXTURE] })
  assert.doesNotMatch(line, /\n/)
  assert.match(line, /input|clicks and keys/)
  assert.match(line, /CU Fixture \(ai\.reflection\.cu\.fixture\) only/)
  assert.match(line, /6 minutes/)
  assert.match(desktopWarning({ taskId: 'multi-app-transfer', apps: [FIXTURE, LEDGER] }), /CU Fixture .* and CU Ledger \(ai\.reflection\.cu\.ledger\)/)
})

test('the session environment never carries a loader variable; desktop adds CU_HOME and nothing else', () => {
  const fields = { HOME: '/tmp/o/user', PATH: '/usr/bin:/bin', DSH_HOME: '/tmp/o/dsh-home', CU_GATEWAY_KEY: 'k' }
  assert.deepEqual(sessionEnv(fields), fields, 'the browser environment is exactly the fields it names')
  const desktop = sessionEnv({ ...fields, ...Object.fromEntries(LOADERS.map((name) => [name, 'x'])) }, { cuHome: '/tmp/o/user/.computer-use' })
  assert.deepEqual(Object.keys(desktop).sort(), [...Object.keys(fields), 'CU_HOME'].sort())
  assert.equal(desktop.CU_HOME, '/tmp/o/user/.computer-use')
})

test('the private CU_HOME sits in the isolated HOME under /tmp; an --out too long for the helper socket is refused', () => {
  assert.equal(privateCuHome('/tmp/cu-developer-two-m9/dsh'), '/tmp/cu-developer-two-m9/dsh/user/.computer-use')
  assert.equal(privateCuHome('/tmp/cu-developer-two-m9/heddle'), '/tmp/cu-developer-two-m9/heddle/user/.computer-use')
  assert.throws(() => privateCuHome('/var/folders/x'), /under \/tmp/)
  assert.throws(() => privateCuHome(`/tmp/${'a'.repeat(60)}`), /too long/)
})

test('the helper is linked into the private CU_HOME as a symlink, never copied; reruns keep it; a non-link is refused and kept', (t) => {
  const dir = scratch(t)
  const source = fakeHelper(dir)
  const home = join(dir, 'out', 'user', '.computer-use')
  mkdirSync(home, { recursive: true })
  const { link } = linkInstalledHelper({ cuHome: home, source })
  assert.equal(link, join(home, 'helper', 'CUHelper.app'))
  assert.equal(lstatSync(link).isSymbolicLink(), true)
  assert.equal(readlinkSync(link), source)
  assert.equal(realpathSync(link), realpathSync(source), 'the very bundle the owner granted')
  assert.equal(statSync(join(home, 'helper')).mode & 0o777, 0o700)
  assert.equal(statSync(home).mode & 0o777, 0o700)
  assert.deepEqual(linkInstalledHelper({ cuHome: home, source }), { link, source }, 'idempotent')

  const other = fakeHelper(join(dir, 'elsewhere'))
  rmSync(link)
  symlinkSync(other, link)
  linkInstalledHelper({ cuHome: home, source })
  assert.equal(readlinkSync(link), source, 'a stale link is replaced')

  rmSync(link)
  mkdirSync(join(link, 'Contents'), { recursive: true })
  writeFileSync(join(link, 'Contents', 'Info.plist'), 'a copy')
  assert.throws(() => linkInstalledHelper({ cuHome: home, source }), /not a symlink/)
  assert.equal(existsSync(join(link, 'Contents', 'Info.plist')), true, 'never deleted')
})

test('no installed helper, a relative path or the installed CU_HOME itself: refused, and nothing is made', (t) => {
  const dir = scratch(t)
  const home = join(dir, 'user', '.computer-use')
  mkdirSync(home, { recursive: true })
  assert.throws(() => linkInstalledHelper({ cuHome: home, source: join(dir, 'missing', 'CUHelper.app') }), /no installed helper at .*install\.sh/)
  assert.equal(existsSync(join(home, 'helper')), false)
  assert.throws(() => linkInstalledHelper({ cuHome: home, source: 'helper/CUHelper.app' }), /absolute/)
  const installed = join(dir, 'installed')
  const source = fakeHelper(dir)
  assert.equal(source, join(installed, 'helper', 'CUHelper.app'))
  assert.throws(() => linkInstalledHelper({ cuHome: installed, source }), /is the installed one/)
})

test('a single-app task copies only CU Fixture\'s tty record, verbatim; CU Ledger and every other app in the owner\'s store stay out', (t) => {
  const dir = scratch(t)
  // An unknown field rides along: the copy is the record as the owner's store holds it, whatever agent core writes.
  const fixture = { ...OWNER.fixture, note: 'kept as is' }
  const sourceHome = ownerHome(dir, [OWNER.other, OWNER.ledger, fixture])
  const home = join(dir, 'o', 'user', '.computer-use')
  const copied = copyOwnerApprovals({ task: DESKTOP_TASKS['badge-form'], sourceHome, home })
  assert.deepEqual(copied, { apps: [FIXTURE], copiedFrom: join(sourceHome, 'app-approvals.json'), records: [fixture], missing: [], store: 'read' })
  assert.equal(privateBytes(home), JSON.stringify({ schema: 'cu-app-approvals/v1', apps: [fixture] }, null, 2) + '\n', 'agent core\'s format, the copy alone')
  // The record's own bytes, as agent core lays it out in the owner's file, recur unchanged in the private one.
  const block = JSON.stringify({ apps: [fixture] }, null, 2).split('\n').slice(2, -2).join('\n')
  assert.ok(readFileSync(join(sourceHome, 'app-approvals.json'), 'utf8').includes(block))
  assert.ok(privateBytes(home).includes(block))
  assert.doesNotMatch(privateBytes(home), /ledger|TextEdit/)
  assert.equal(statSync(join(home, 'app-approvals.json')).mode & 0o777, 0o600)

  const both = copyOwnerApprovals({ task: DESKTOP_TASKS['multi-app-transfer'], sourceHome, home })
  assert.deepEqual([both.apps, both.records], [[FIXTURE, LEDGER], [fixture, OWNER.ledger]], 'a two-app task copies both, in the task\'s order')
  const again = copyOwnerApprovals({ task: DESKTOP_TASKS['badge-form'], sourceHome, home })
  assert.deepEqual(approvalStore(home).list().apps, [fixture], 'a rerun with one app replaces the earlier copy of CU Ledger')
  assert.deepEqual(again.records, [fixture])
})

test('a record agent core itself wrote is copied byte for byte, and the private store reads back through agent core as approving exactly the task\'s apps', (t) => {
  const dir = scratch(t)
  const sourceHome = ownerHome(dir, null)
  const owner = createAppApprovals({ path: join(sourceHome, 'app-approvals.json'), now: () => new Date('2026-11-05T13:42:10.123Z') })
  owner.grantAlways(FIXTURE, { by: 'tty' })
  owner.grantAlways(LEDGER, { by: 'tty' })
  const sourceBytes = readFileSync(owner.path, 'utf8')

  const home = join(dir, 'o', 'user', '.computer-use')
  const task = DESKTOP_TASKS['badge-form']
  const { records } = copyOwnerApprovals({ task, sourceHome, home })
  assert.deepEqual(records, [owner.list().apps[0]])
  const back = createAppApprovals({ path: join(home, 'app-approvals.json') })
  assert.deepEqual(back.list(), { apps: records, corrupt: false })
  assert.deepEqual([back.covers(FIXTURE), back.covers(LEDGER), back.covers('com.apple.TextEdit')], [true, false, false])
  assert.deepEqual(missingApprovals([task], back), [], 'the desktop suite\'s own check finds nothing missing')
  assert.deepEqual(missingApprovals([DESKTOP_TASKS['multi-app-transfer']], back), [LEDGER], 'and nothing beyond the task')
  assert.equal(readFileSync(owner.path, 'utf8'), sourceBytes, 'the owner\'s store is only read')

  copyOwnerApprovals({ task: DESKTOP_TASKS['multi-app-transfer'], sourceHome, home })
  assert.equal(privateBytes(home), sourceBytes, 'both apps: the private store is the owner\'s file, byte for byte')
})

test('a record not given at a terminal, or not an always one, is not copied; the proof refuses and writes nothing', (t) => {
  const dir = scratch(t)
  for (const [i, [record, why]] of [
    [{ ...OWNER.fixture, by: 'live' }, 'its record is by live, not tty'],
    [{ ...OWNER.fixture, by: 'api' }, 'its record is by api, not tty'],
    [{ ...OWNER.fixture, lifetime: 'run' }, 'its record\'s lifetime is run'],
  ].entries()) {
    const sourceHome = ownerHome(join(dir, `s${i}`), [record, OWNER.ledger])
    const home = join(dir, `o${i}`, 'user', '.computer-use')
    const copied = copyOwnerApprovals({ task: DESKTOP_TASKS['badge-form'], sourceHome, home })
    assert.deepEqual([copied.records, copied.missing, copied.store], [[], [{ bundleId: FIXTURE, why }], 'read'], why)
    assert.equal(privateBytes(home), null, `${why}: nothing written`)
    assert.match(approvalRefusal(copied), new RegExp(`CU Fixture \\(ai\\.reflection\\.cu\\.fixture: ${why}\\)`))
  }
  assert.deepEqual(ownerRecord([{ ...OWNER.fixture, lifetime: 'always' }], FIXTURE), { record: { ...OWNER.fixture, lifetime: 'always' } })
  assert.deepEqual(ownerRecord([{ ...OWNER.fixture, bundleId: 'AI.Reflection.CU.Fixture' }], FIXTURE).record.bundleId, 'AI.Reflection.CU.Fixture', 'ids compare as agent core compares them; the copy keeps the owner\'s spelling')

  // Two apps, one not copyable: not even the good one is copied, and an earlier private store is removed.
  const sourceHome = ownerHome(join(dir, 'two'), [OWNER.fixture, { ...OWNER.ledger, by: 'live' }])
  const home = join(dir, 'o-two', 'user', '.computer-use')
  copyOwnerApprovals({ task: DESKTOP_TASKS['badge-form'], sourceHome, home })
  assert.notEqual(privateBytes(home), null)
  const refused = copyOwnerApprovals({ task: DESKTOP_TASKS['multi-app-transfer'], sourceHome, home })
  assert.deepEqual([refused.records, refused.missing.map((entry) => entry.bundleId)], [[], [LEDGER]])
  assert.equal(privateBytes(home), null, 'an old copy never outlives a refusal')
})

test('no owner store, no record for the app, or an unreadable store: refused with the C1 wording, naming the app(s), suggesting no approval step', (t) => {
  const dir = scratch(t)
  const task = DESKTOP_TASKS['badge-form']
  const cases = [
    ['absent', ownerHome(join(dir, 'a'), null), /there is no owner always store at \/tmp\/cu-dp-[^ ]+\/a\/installed\/app-approvals\.json/],
    ['read', ownerHome(join(dir, 'b'), [OWNER.ledger, OWNER.other]), /the owner's always store \/tmp\/[^ ]+\/b\/installed\/app-approvals\.json holds no such record/],
  ]
  const corrupt = ownerHome(join(dir, 'c'), null)
  writeFileSync(join(corrupt, 'app-approvals.json'), '{ "schema": "cu-app-approvals/v1", "apps": [')
  cases.push(['unreadable', corrupt, /the owner's always store \/tmp\/[^ ]+\/c\/installed\/app-approvals\.json is unreadable/])
  for (const [store, sourceHome, where] of cases) {
    const home = join(sourceHome, '..', 'o', 'user', '.computer-use')
    const copied = copyOwnerApprovals({ task, sourceHome, home })
    assert.deepEqual([copied.store, copied.records, copied.missing], [store, [], [{ bundleId: FIXTURE, why: null }]], store)
    assert.equal(privateBytes(home), null)
    const refusal = approvalRefusal(copied)
    assert.match(refusal, /^the task needs CU Fixture \(ai\.reflection\.cu\.fixture\) approved 'always' by the owner at a terminal \(by tty\), and /)
    assert.match(refusal, where)
    assert.match(refusal, /a new approval comes only from the owner \(C1\), asked through cu-coordinator\. Nothing was started$/)
    assert.doesNotMatch(refusal, ASKS_FOR_APPROVAL)
    assert.doesNotMatch(refusal, /\n/)
  }
  const both = approvalRefusal(copyOwnerApprovals({ task: DESKTOP_TASKS['multi-app-transfer'], sourceHome: cases[0][1], home: join(dir, 'm') }))
  assert.match(both, /CU Fixture \(ai\.reflection\.cu\.fixture\) and CU Ledger \(ai\.reflection\.cu\.ledger\) approved/)
})

test('prepareDesktop: CU_HOME, then the helper link, then the copies; one source CU_HOME for both; a refusal is exit 3 in both proofs', (t) => {
  const dir = scratch(t)
  const sourceHome = ownerHome(dir, [OWNER.fixture, OWNER.ledger])
  const out = join(dir, 'o')
  const ready = prepareDesktop({ out, taskId: 'badge-form', sourceHome })
  const home = join(out, 'user', '.computer-use')
  assert.deepEqual([ready.cuHome, ready.apps, ready.refusal, ready.approvals.records], [home, [FIXTURE], null, [OWNER.fixture]])
  assert.equal(readlinkSync(ready.helper.link), join(sourceHome, 'helper', 'CUHelper.app'), 'the helper and the store come from the same CU_HOME')
  assert.equal(ready.note, `desktop proof: copied 1 owner approval record(s) verbatim from ${join(sourceHome, 'app-approvals.json')} into ${join(home, 'app-approvals.json')}: ${FIXTURE} (by tty, granted ${OWNER.fixture.grantedAt}); no other app`)
  assert.equal(ready.note, approvalsNote(ready.approvals, home))

  const refused = prepareDesktop({ out: join(dir, 'p'), taskId: 'badge-form', sourceHome: ownerHome(join(dir, 'empty'), [OWNER.ledger]) })
  assert.deepEqual([refused.note, refused.approvals.records], [null, []])
  assert.match(refused.refusal, /CU Fixture .*\(C1\)/)

  assert.throws(() => prepareDesktop({ out: join(dir, 'q'), taskId: 'badge-form', sourceHome: join(dir, 'none') }), /no installed helper/)
  assert.equal(existsSync(join(dir, 'q', 'user', '.computer-use', 'app-approvals.json')), false, 'no copy before the helper is known to be there')
  assert.throws(() => copyOwnerApprovals({ task: DESKTOP_TASKS['badge-form'], sourceHome, home: sourceHome }), /is the installed one/)

  // The proofs map a refusal to exit 3 before any session, and nothing in them asks for an approval any more.
  for (const file of ['computer-use-mcp/dsh-proof.mjs', 'heddle-plugin/heddle-proof.mjs', 'computer-use-mcp/desktop-proof.mjs']) {
    const text = readFileSync(join(TOOLS, file), 'utf8')
    assert.doesNotMatch(text, /approve-always|askOnTerminal|seedApprovals|grantAlways|\/dev\/tty/, file)
    if (file !== 'computer-use-mcp/desktop-proof.mjs') assert.match(text, /if \(prepared\?\.refusal\) \{\n {2}process\.stderr\.write\(`[a-z-]+: \$\{prepared\.refusal\}\\n`\)\n {2}process\.exit\(3\)\n\}/, file)
  }
  assert.doesNotMatch(readFileSync(join(TOOLS, 'computer-use-mcp/desktop-proof.mjs'), 'utf8'), /child_process/, 'the shared module spawns nothing')
  for (const gone of ['APPROVE_ALWAYS', 'approveAlwaysCommand', 'askOnTerminal', 'seedApprovals', 'installedHelper']) assert.equal(gone in proof, false, gone)
})

test('proof.json evidence: desktop.approvals names the source, the copied records verbatim and the apps', (t) => {
  const dir = scratch(t)
  const sourceHome = ownerHome(dir, [OWNER.ledger, OWNER.fixture, OWNER.other])
  const prepared = prepareDesktop({ out: join(dir, 'o'), taskId: 'multi-app-transfer', sourceHome })
  const row = { verdict: 'pass', reason: 'r', compromised: false }
  const fields = desktopProofFields({ prepared, attempt: { row, result: null }, seed: 'm9-proof' })
  assert.deepEqual(fields.desktop.approvals, { copiedFrom: join(sourceHome, 'app-approvals.json'), records: [OWNER.fixture, OWNER.ledger], apps: [FIXTURE, LEDGER] })
  assert.deepEqual(fields.task, { id: 'multi-app-transfer', apps: [FIXTURE, LEDGER], seed: 'm9-proof' })
  assert.equal(fields.desktop.cuHome, join(dir, 'o', 'user', '.computer-use'))
  assert.match(prepared.note, /copied 2 owner approval record\(s\) verbatim from .*: ai\.reflection\.cu\.fixture \(by tty, granted 2026-11-05T13:42:10\.123Z\), ai\.reflection\.cu\.ledger \(by tty, granted 2026-11-05T13:42:14\.456Z\); no other app$/)
  assert.doesNotMatch(prepared.note, /\n|TextEdit/)
})

test('the run is the newest new directory under the runs root, read from its run.json', (t) => {
  const dir = scratch(t)
  assert.equal(newRunDir(join(dir, 'none')), null)
  for (const id of ['20261105T100000Z-aaaaaa', '20261105T110000Z-bbbbbb']) mkdirSync(join(dir, id))
  const before = ['20261105T100000Z-aaaaaa', '20261105T110000Z-bbbbbb']
  assert.equal(newRunDir(dir, before), null, 'an earlier proof\'s run is never taken for this one')
  mkdirSync(join(dir, '20261105T120000Z-cccccc'))
  writeFileSync(join(dir, '20261105T120000Z-cccccc', 'run.json'), JSON.stringify({ result: { runId: '20261105T120000Z-cccccc', status: 'completed' } }))
  const runDir = newRunDir(dir, before)
  assert.equal(runDir, join(dir, '20261105T120000Z-cccccc'))
  assert.deepEqual(readRunResult(runDir), { runId: '20261105T120000Z-cccccc', status: 'completed' })
  assert.equal(readRunResult(join(dir, '20261105T100000Z-aaaaaa')), null)
  assert.equal(readRunResult(null), null)
})

test('the final screenshot reached a DSH session if an attachment is identical or a same-size re-encoding (DSH stores WebP)', async () => {
  const { imageInfo, screenshotReached } = await import('../../_tools_/computer-use-mcp/desktop-proof.mjs')
  const png = (w, h) => { const b = Buffer.alloc(40); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b }
  const webpX = (w, h) => { const b = Buffer.alloc(40); b.write('RIFF', 0, 'ascii'); b.write('WEBP', 8, 'ascii'); b.write('VP8X', 12, 'ascii'); b.writeUIntLE(w - 1, 24, 3); b.writeUIntLE(h - 1, 27, 3); return b }
  const webpL = (w, h) => { const b = Buffer.alloc(40); b.write('RIFF', 0, 'ascii'); b.write('WEBP', 8, 'ascii'); b.write('VP8L', 12, 'ascii'); b.writeUInt32LE(((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14), 21); return b }
  const webp = (w, h) => { const b = Buffer.alloc(40); b.write('RIFF', 0, 'ascii'); b.write('WEBP', 8, 'ascii'); b.write('VP8 ', 12, 'ascii'); b.writeUInt16LE(w, 26); b.writeUInt16LE(h, 28); return b }
  assert.deepEqual([imageInfo(png(1920, 1080)).width, imageInfo(webpX(1920, 1080)).height, imageInfo(webpL(1920, 1080)).width, imageInfo(webp(1920, 1080)).height], [1920, 1080, 1920, 1080])
  assert.equal(imageInfo(Buffer.from('not an image at all, just some text')), null)
  const final = png(1920, 1080)
  assert.deepEqual(screenshotReached(final, [Buffer.from(final)]), { reached: true, identical: true, attachment: imageInfo(final) })
  const reencoded = screenshotReached(final, [webpX(1920, 1080)])
  assert.deepEqual([reencoded.reached, reencoded.identical, reencoded.attachment.format], [true, false, 'webp'])
  assert.deepEqual(screenshotReached(final, [webpX(1280, 720)]), { reached: false, identical: false, attachment: null }, 'another size never counts')
  assert.deepEqual(screenshotReached(final, []), { reached: false, identical: false, attachment: null })
})
