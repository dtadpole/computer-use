import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { ancestorsOf, fixtureLaunchAllowed, launchFixture } from '../../_tools_/desktop-fixture/client.mjs'

// CU-305 (fixture-launch-lock.md): CU Fixture starts only inside a desktop run (run.json held by this process or an
// ancestor) or under the caller's own hold (hold.json of the seat it declares). Every row uses a scratch lock and a fake
// executable, so this file never touches /tmp/cu-desktop-run and never starts the real app.

const scratch = mkdtempSync(join(tmpdir(), 'cu-fixture-lock-'))
after(() => rmSync(scratch, { recursive: true, force: true }))
const freshLock = () => mkdtempSync(join(scratch, 'lock-'))
// The real clock, so a launchFixture row (which reads the hold at the real time) sees the same hold as the check rows.
const NOW = Date.now()
const now = () => NOW
// keeperPid defaults to this test process: alive for the stubbed and the real liveness check alike.
const holdOf = (dir, seat, minutes = 10, keeper = { keeperPid: process.pid }) => writeFileSync(join(dir, 'hold.json'), `${JSON.stringify({ seat, since: new Date(NOW).toISOString(), heldAt: new Date(NOW).toISOString(), until: new Date(NOW + minutes * 60_000).toISOString(), reason: 'test', ...keeper })}\n`)
const runOf = (dir, entry) => writeFileSync(join(dir, 'run.json'), `${JSON.stringify({ seat: 'cu-integrator', runId: 'nightly-1', startedAt: new Date(NOW).toISOString(), ...entry })}\n`)
// A process tree: 5000 (this test) <- 4000 (node --test) <- 3000 (the nightly, holding the run) <- 1; 4500 a sibling
// (another child of 4000), 3600 a cousin (under 3500, another child of 3000), 7000 another tree.
const TREE = { 5000: 4000, 4000: 3000, 3000: 1, 4500: 4000, 3500: 3000, 3600: 3500, 7000: 1 }
const parentOf = (pid) => TREE[pid] ?? null
const alive = (pid) => pid !== 6666
const check = (dir, extra = {}) => fixtureLaunchAllowed({ lockDir: dir, pid: 5000, now, isAlive: alive, parentOf, ...extra })

/** A fake CU Fixture: answers hello and quit on stdin, and leaves a marker so a row can tell it ran. */
function fakeFixture() {
  const dir = mkdtempSync(join(scratch, 'fake-'))
  const marker = join(dir, 'started')
  const path = join(dir, 'fake-fixture')
  writeFileSync(path, `#!${process.execPath}
require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'yes')
const rl = require('node:readline').createInterface({ input: process.stdin })
rl.on('line', (line) => {
  const { id, method } = JSON.parse(line)
  process.stdout.write(JSON.stringify({ id, result: method === 'hello' ? { fixture: 'fake' } : { ok: true } }) + '\\n')
  if (method === 'quit') process.exit(0)
})
rl.on('close', () => process.exit(0))
`)
  chmodSync(path, 0o755)
  return { path, marker }
}

test('CU-305: with no run and no hold, the check refuses and launchFixture starts nothing', async () => {
  const dir = freshLock()
  const verdict = check(dir, { seat: 'cu-developer-two' })
  assert.equal(verdict.ok, false)
  assert.match(verdict.message, /CU-305/)
  assert.match(verdict.message, /no seat holds the Mac/)
  assert.match(verdict.message, /CU_DESKTOP_SEAT/)
  const fake = fakeFixture()
  // A launch that wrongly succeeds is closed again, so a broken guard fails this row instead of hanging the file.
  const outcome = await launchFixture(fake.path, { lockDir: dir, seat: 'cu-developer-two' }).then(async (app) => { await app.close(); return 'launched' }, (error) => error)
  assert.ok(outcome instanceof Error && outcome.code === 'fixture_unlocked' && /CU-305/.test(outcome.message), `refused, not ${outcome}`)
  assert.equal(existsSync(fake.marker), false, 'refused before anything was started')
})

test("CU-305: another seat's hold refuses; one's own hold launches; an expired hold refuses", async () => {
  const dir = freshLock()
  holdOf(dir, 'cu-verifier')
  const other = check(dir, { seat: 'cu-developer-two' })
  assert.equal(other.ok, false)
  assert.match(other.message, /held by cu-verifier/)
  assert.equal(check(dir, { seat: undefined }).ok, false, 'a process that declares no seat')
  assert.deepEqual(check(dir, { seat: 'cu-verifier' }), { ok: true, via: 'hold of cu-verifier' })
  const fake = fakeFixture()
  const app = await launchFixture(fake.path, { lockDir: dir, seat: 'cu-verifier', sandbox: mkdtempSync(join(scratch, 'sandbox-')) })
  assert.deepEqual(app.hello, { fixture: 'fake' })
  assert.equal(existsSync(fake.marker), true)
  await app.close()
  const expired = freshLock()
  holdOf(expired, 'cu-verifier', -1)
  assert.equal(check(expired, { seat: 'cu-verifier' }).ok, false, 'a hold whose minutes ran out')
  const stale = freshLock()
  holdOf(stale, 'cu-verifier', 10, { keeperPid: 6666 })
  assert.equal(check(stale, { seat: 'cu-verifier' }).ok, false, 'minutes left but its keeper is dead: a stale hold.json')
  holdOf(stale, 'cu-verifier', 10, {})
  assert.equal(check(stale, { seat: 'cu-verifier' }).ok, false, 'no keeper at all: not an enforced hold')
})

test('CU-305: the refusal names the seat it found holding and both ways in - no pid, path or time', () => {
  const dir = freshLock()
  holdOf(dir, 'cu-researcher')
  const { message } = check(dir, { seat: 'cu-developer-two' })
  assert.match(message, /held by cu-researcher/)
  assert.match(message, /run-lock\.mjs hold --seat S/)
  assert.match(message, /CU_DESKTOP_SEAT=S/)
  assert.match(message, /a process that holds the run/)
  assert.doesNotMatch(message, /\/tmp|(?<![-\d])\d{3,}(?!\d)|T\d\d:/, 'no lock path, pid or timestamp (CU-n and D-n references aside)')
})

test('CU-305: the declared seat defaults to CU_DESKTOP_SEAT, the variable a holder exports to its series', () => {
  const dir = freshLock()
  holdOf(dir, 'cu-developer-one')
  const saved = process.env.CU_DESKTOP_SEAT
  try {
    process.env.CU_DESKTOP_SEAT = 'cu-developer-one'
    assert.equal(fixtureLaunchAllowed({ lockDir: dir, now }).ok, true)
    process.env.CU_DESKTOP_SEAT = 'not a seat'
    assert.equal(fixtureLaunchAllowed({ lockDir: dir, now }).ok, false, 'a malformed seat declares nothing')
  } finally {
    if (saved === undefined) delete process.env.CU_DESKTOP_SEAT
    else process.env.CU_DESKTOP_SEAT = saved
  }
})

test("CU-305: a run held by this process's ancestor (the nightly's phase 2) launches; a sentinel, a dead pid or a stranger's run does not", () => {
  const dir = freshLock()
  runOf(dir, { pid: 3000 })
  assert.deepEqual(check(dir), { ok: true, via: 'run nightly-1 of cu-integrator' })
  runOf(dir, { pid: 5000 })
  assert.equal(check(dir).ok, true, 'the run is this process itself')
  runOf(dir, { pid: 3000, runId: 'hold', sentinel: true })
  assert.equal(check(dir).ok, false, "a hold's keeper sentinel is no run to be inside")
  runOf(dir, { pid: 6666 })
  assert.equal(check(dir).ok, false, 'a run whose process is gone')
  runOf(dir, { pid: 7000 })
  assert.equal(check(dir).ok, false, "another process tree's live run: not inside it")
  runOf(dir, { pid: 4500 })
  assert.equal(check(dir).ok, false, "a sibling's run (the gate's old holder shape): the walk, not 'any live run'")
  runOf(dir, { pid: 3600 })
  assert.equal(check(dir).ok, false, "a cousin's run")
  runOf(dir, { pid: 3000 })
  assert.equal(check(dir, { parentOf: () => null }).ok, false, 'a ps walk that fails finds no ancestor: refused, not admitted')
  const deep = (pid) => (pid < 5040 ? pid + 1 : 3000)
  assert.equal(check(dir, { pid: 5000, parentOf: deep }).ok, false, 'the run 41 steps up, past the 32-step walk: refused')
  writeFileSync(join(dir, 'run.json'), 'not json')
  assert.equal(check(dir).ok, false, 'an unreadable entry')
})

test('CU-305: ancestorsOf walks the parents nearest first, stops at 1, at a gap, at a loop and at its limit', () => {
  assert.deepEqual(ancestorsOf(5000, { parentOf }), [5000, 4000, 3000])
  assert.deepEqual(ancestorsOf(5000, { parentOf: (pid) => (pid === 5000 ? null : 1) }), [5000])
  assert.deepEqual(ancestorsOf(10, { parentOf: (pid) => (pid === 10 ? 11 : 10) }), [10, 11])
  assert.equal(ancestorsOf(100, { parentOf: (pid) => pid + 1, limit: 32 }).length, 32)
  assert.ok(ancestorsOf(process.pid).includes(process.ppid), 'the real ps walk finds this process\'s parent')
})
