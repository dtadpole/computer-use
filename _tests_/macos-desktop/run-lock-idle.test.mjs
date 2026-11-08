import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { holdDesktop, main, OWNER_IDLE_SECONDS, ownerIdleReader, RUN_LOCK_DIR, systemIdleSeconds } from '../../_environments_/macos-desktop/run-lock.mjs'

// CU-191: a fresh hold on this Mac waits until it has been idle OWNER_IDLE_SECONDS - local input means the owner may be
// at it (cu-coordinator, after the 19:00Z display change). Every test here runs on a scratch lock with an injected
// idle reader: nothing reads the real Mac's idle time or touches its lock (CU-117).

const dirs = []
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }) })
const scratch = () => { const d = mkdtempSync(join(tmpdir(), 'cu-hold-idle-')); dirs.push(d); return d }
const SEAT = 'cu-developer-two'
const OTHER = 'cu-verifier'
const holdLog = (dir) => (existsSync(join(dir, 'hold.log')) ? readFileSync(join(dir, 'hold.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [])

test('CU-191: local input inside the window refuses a fresh hold (owner_active) - nothing held, the refusal logged', async () => {
  const dir = scratch()
  await assert.rejects(holdDesktop({ seat: SEAT, minutes: 5, dir, idleSeconds: () => 42 }),
    (e) => e.code === 'resource_refused' && e.details?.reason === 'owner_active' && e.details?.idleSeconds === 42 && /42 s ago/.test(e.message))
  assert.equal(existsSync(join(dir, 'hold.json')), false, 'no hold written')
  assert.deepEqual(holdLog(dir).map(({ action, reason, idleSeconds }) => ({ action, reason, idleSeconds })), [{ action: 'refused', reason: 'owner_active', idleSeconds: 42 }])
})

test('CU-191: an idle time that cannot be read refuses too (owner_idle_unknown) - no proof the owner is away', async () => {
  for (const value of [null, undefined, NaN, -1, '600']) {
    const dir = scratch()
    await assert.rejects(holdDesktop({ seat: SEAT, minutes: 5, dir, idleSeconds: () => value }), (e) => e.details?.reason === 'owner_idle_unknown', String(value))
    assert.equal(existsSync(join(dir, 'hold.json')), false)
  }
})

test('CU-191: idle for the whole window, a fresh hold is taken; the boundary is OWNER_IDLE_SECONDS itself', async () => {
  assert.equal(OWNER_IDLE_SECONDS, 300)
  const held = await holdDesktop({ seat: SEAT, minutes: 5, dir: scratch(), idleSeconds: () => 300 })
  assert.equal(held.seat, SEAT)
  await assert.rejects(holdDesktop({ seat: SEAT, minutes: 5, dir: scratch(), idleSeconds: () => 299.9 }), (e) => e.details?.reason === 'owner_active')
})

test('CU-191: extending one\'s own live hold is not checked - the helper\'s own input resets the same counter mid-hold', async () => {
  const dir = scratch()
  await holdDesktop({ seat: SEAT, minutes: 5, dir, idleSeconds: () => 900 })
  let asked = 0
  const extended = await holdDesktop({ seat: SEAT, minutes: 10, dir, idleSeconds: () => { asked += 1; return 2 } })
  assert.equal(extended.seat, SEAT)
  assert.equal(asked, 0, 'the reader is not even consulted for an extension')
})

test('CU-191: another seat\'s live hold still refuses first (desktop_held), before any idle read', async () => {
  const dir = scratch()
  await holdDesktop({ seat: OTHER, minutes: 5, dir, idleSeconds: () => 900 })
  let asked = 0
  await assert.rejects(holdDesktop({ seat: SEAT, minutes: 5, dir, idleSeconds: () => { asked += 1; return 900 } }), (e) => e.code !== 'resource_refused' || e.details?.reason !== 'owner_active')
  assert.equal(asked, 0)
})

test('CU-191: the CLI refuses with exit 1 and says why; on a scratch lock with no reader injected it checks nothing', async () => {
  const lines = []
  const write = (line) => lines.push(JSON.parse(line))
  const dir = scratch()
  assert.equal(await main(['hold', '--seat', SEAT, '--minutes', '5', '--dir', dir], { write, seams: { startKeeper: () => null, idleSeconds: () => 7 } }), 1)
  assert.deepEqual([lines[0].code, lines[0].reason], ['resource_refused', 'owner_active'])
  assert.equal(await main(['hold', '--seat', SEAT, '--minutes', '5', '--dir', scratch()], { write, seams: { startKeeper: () => null } }), 0, 'a scratch lock holds no Mac')
})

test('CU-191: the reader is the system\'s for this Mac\'s own lock and none for any other directory - no switch turns it off', () => {
  assert.equal(ownerIdleReader(RUN_LOCK_DIR), systemIdleSeconds)
  assert.equal(ownerIdleReader(`${RUN_LOCK_DIR}/`), systemIdleSeconds, 'the same directory however written')
  assert.equal(ownerIdleReader(scratch()), null)
  assert.equal(ownerIdleReader('relative/dir'), null)
})

test('CU-191: systemIdleSeconds reads HIDIdleTime\'s nanoseconds as seconds, and null when ioreg says nothing usable', () => {
  assert.equal(systemIdleSeconds({ run: () => '    | |   "HIDIdleTime" = 301000000000\n' }), 301)
  assert.equal(systemIdleSeconds({ run: () => '"HIDIdleTime" = 1500000000' }), 1.5)
  assert.equal(systemIdleSeconds({ run: () => 'no such key' }), null)
  assert.equal(systemIdleSeconds({ run: () => { throw new Error('ioreg failed') } }), null)
  let argv = null
  systemIdleSeconds({ run: (cmd, args) => { argv = [cmd, ...args]; return '' } })
  assert.deepEqual(argv, ['/usr/sbin/ioreg', '-c', 'IOHIDSystem', '-r', '-d', '1', '-k', 'HIDIdleTime'], 'a read-only registry query')
})
