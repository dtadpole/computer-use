import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { acquireDesktopRun, CARRY_NAME, holdDesktop } from '../../_environments_/macos-desktop/run-lock.mjs'

// CU-772 (follow-up to CU-720): a fresh hold reads the same carry-aware owner idle as a run admission. Seen 24 Nov 13:34Z:
// a fresh hold was refused at 199 s (another team's run's last synthetic click) while a valid carry stood. Scratch locks,
// injected clock and readers (CU-117).

const dirs = []
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }) })
const scratch = () => { const d = mkdtempSync(join(tmpdir(), 'cu-hold-carry-')); dirs.push(d); return d }
const RUNNER = 'cu-developer-two'
const HOLDER = 'cu-researcher'
const T0 = Date.parse('2026-11-24T13:30:00.000Z')

// An armed run admitted at idle 400 s at T0, released at T0 + 90 s: the carry's base is T0 - 400 s.
async function afterArmedRun() {
  const dir = scratch()
  const clock = { at: T0 }
  const slot = await acquireDesktopRun({ seat: RUNNER, runId: '20261124T133000Z-carry', dir, commit: null, pid: 4242, isAlive: () => true, now: () => clock.at, idleSeconds: () => 400, minIdleSeconds: 0 })
  await slot.mark({ armed: true })
  clock.at = T0 + 90_000
  slot.release()
  assert.equal(existsSync(join(dir, CARRY_NAME)), true, 'the armed release wrote its carry')
  return { dir, clock }
}
const hold = (l, hid) => holdDesktop({ seat: HOLDER, minutes: 10, dir: l.dir, now: () => l.clock.at, isAlive: () => true, idleSeconds: () => hid })

test('CU-772: the seen case - a valid carry admits a fresh hold although HIDIdleTime counts the run\'s own last click', async () => {
  const l = await afterArmedRun()
  l.clock.at = T0 + 90_000 + 185_000
  // HID 199 s covers the 185 s since the release, so no event came since: the carried idle (400 + 275 s) stands in.
  const held = await hold(l, 199)
  assert.equal(held.seat, HOLDER)
})

test('CU-772: a run admission reads the same carry (unchanged from CU-720)', async () => {
  const l = await afterArmedRun()
  l.clock.at = T0 + 90_000 + 185_000
  const slot = await acquireDesktopRun({ seat: HOLDER, runId: '20261124T133500Z-next', dir: l.dir, commit: null, pid: 4343, isAlive: () => true, now: () => l.clock.at, idleSeconds: () => 199 })
  slot.release()
})

test('CU-772: an event since the release still refuses a fresh hold (owner_active)', async () => {
  const l = await afterArmedRun()
  l.clock.at = T0 + 90_000 + 185_000
  // HID 20 s is less than the 185 s since the release: someone touched the Mac after the run ended.
  await assert.rejects(hold(l, 20), (e) => e.code === 'resource_refused' && e.details?.reason === 'owner_active' && e.details?.idleSeconds === 20)
})

test('CU-772: a carry older than 6 h falls back to HIDIdleTime; no carry means HIDIdleTime alone', async () => {
  const l = await afterArmedRun()
  l.clock.at = T0 + 90_000 + 6 * 3_600_000 + 60_000
  await assert.rejects(hold(l, 199), (e) => e.details?.reason === 'owner_active' && e.details?.idleSeconds === 199)
  const bare = { dir: scratch(), clock: { at: T0 } }
  await assert.rejects(hold(bare, 199), (e) => e.details?.reason === 'owner_active' && e.details?.idleSeconds === 199)
})
