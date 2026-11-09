import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { EnvironmentError } from '../../_environments_/macos-desktop/errors.mjs'
import { acquireDesktopRun, HOLD_LOG_NAME, HOLD_NAME, holdDesktop, main, MAX_HOLD_MINUTES, readHold, releaseHold, releaseHoldEntry } from '../../_environments_/macos-desktop/run-lock.mjs'
import { scratch } from './harness.mjs'

/**
 * CU-327: a hold is ended by whoever holds its token. On 9 Nov a nested script's EXIT trap (`release --seat S`, its own
 * seat) freed the outer batch's hold, and the batch's next step ran unheld - refused by the run lock that time, but
 * another seat could have taken the Mac in between. Since then a fresh hold prints a token; the same seat holding again
 * without it nests (its own token); a tokenless release removes the newest nested holder first, so a nested trap ends
 * only itself, and single-level scripts work unchanged. A hold's minutes run out whatever is nested under it.
 */

const root = scratch()
after(() => root.remove())
let dirs = 0
const freshDir = () => join(root.dir, `token-${(dirs += 1)}`)
const t0 = Date.parse('2026-11-09T08:00:00Z')
const at = (seconds) => () => t0 + seconds * 1000
const SEAT = 'cu-verifier'
const holdFile = (dir) => JSON.parse(readFileSync(join(dir, HOLD_NAME), 'utf8'))
const mismatch = (error) => error instanceof EnvironmentError && error.code === 'resource_refused' && error.details?.reason === 'hold_token_mismatch'
const heldBy = (seat) => (error) => error instanceof EnvironmentError && error.details?.reason === 'desktop_held' && error.details.holder.seat === seat

test('CU-327: the 9 Nov case - a nested script holds and releases tokenless; the outer hold stays live until its own release', async () => {
  const dir = freshDir()
  const outer = await holdDesktop({ seat: SEAT, minutes: 10, reason: 'batch', dir, now: at(0) })
  const inner = await holdDesktop({ seat: SEAT, minutes: 5, reason: 'qd15-gate', dir, now: at(30) })
  assert.equal(inner.nested, true, 'held again without the token: nested')
  assert.notEqual(inner.token, outer.token, 'with its own token')
  assert.equal(inner.until, outer.until, 'inside the outer hold\'s minutes the end stays')
  assert.equal(readHold({ dir, now: at(31) }).nested, 1)
  // The nested script's EXIT trap: release --seat S, no token.
  assert.equal(await releaseHold({ seat: SEAT, dir, now: at(60) }), false, 'the trap ends only the nested holder')
  assert.equal(readHold({ dir, now: at(61) })?.seat, SEAT, 'the outer hold is still live')
  await assert.rejects(holdDesktop({ seat: 'cu-integrator', minutes: 5, dir, now: at(62) }), heldBy(SEAT), 'no other seat gets the Mac between the steps')
  const step = await acquireDesktopRun({ seat: SEAT, runId: 'next-step', pid: process.pid, dir, now: at(63), idleSeconds: () => 999 })
  step.release()
  // The outer batch's own tokenless release ends it, as before CU-327.
  assert.equal(await releaseHold({ seat: SEAT, dir, now: at(90) }), true)
  assert.equal(readHold({ dir, now: at(91) }), null)
  const actions = readFileSync(join(dir, HOLD_LOG_NAME), 'utf8').trim().split('\n').map((line) => JSON.parse(line).action).filter((action) => action !== 'run_admitted')
  assert.deepEqual(actions, ['hold', 'nest', 'unnest', 'release'])
  assert.doesNotMatch(readFileSync(join(dir, HOLD_LOG_NAME), 'utf8'), new RegExp(`${outer.token}|${inner.token}`), 'the log carries no token')
})

test('CU-327: release by token - the hold\'s own ends it with its nested holders; a nested token ends only that holder; an unknown token is refused and the hold stays', async () => {
  const dir = freshDir()
  const outer = await holdDesktop({ seat: SEAT, minutes: 10, dir, now: at(0) })
  const a = await holdDesktop({ seat: SEAT, minutes: 5, dir, now: at(10) })
  const b = await holdDesktop({ seat: SEAT, minutes: 5, dir, now: at(20) })
  assert.deepEqual(holdFile(dir).nested, [a.token, b.token])
  assert.deepEqual(await releaseHoldEntry({ seat: SEAT, token: a.token, dir, now: at(30) }), { released: false, unnested: true, nested: 1 }, 'the older nested holder, by its token')
  assert.deepEqual(holdFile(dir).nested, [b.token])
  await assert.rejects(releaseHoldEntry({ seat: SEAT, token: a.token, dir, now: at(31) }), mismatch, 'a token already released')
  await assert.rejects(releaseHoldEntry({ seat: SEAT, token: '0123456789abcdef', dir, now: at(32) }), mismatch, 'a token that never held')
  assert.equal(readHold({ dir, now: at(33) })?.nested, 1, 'refused: the hold and its holder stay')
  await assert.rejects(releaseHoldEntry({ seat: SEAT, token: 'not-a-token', dir, now: at(34) }), (e) => e.code === 'invalid_argument' && e.details?.field === 'token')
  assert.deepEqual(await releaseHoldEntry({ seat: SEAT, token: outer.token, dir, now: at(40) }), { released: true, unnested: false, nested: 0 }, 'the holder\'s token ends it, nested holder or not')
  assert.equal(readHold({ dir, now: at(41) }), null)
  assert.equal(holdFile(dir).nested, undefined, 'the ended hold keeps no holders')
  assert.equal(holdFile(dir).token, undefined, 'nor a token')
})

test('CU-327: extending takes the token - the holder\'s keeps every nested holder; a nested holder may extend with its own', async () => {
  const dir = freshDir()
  const outer = await holdDesktop({ seat: SEAT, minutes: 10, dir, now: at(0) })
  const inner = await holdDesktop({ seat: SEAT, minutes: 5, dir, now: at(10) })
  const extended = await holdDesktop({ seat: SEAT, minutes: 20, token: outer.token, dir, now: at(60) })
  assert.deepEqual([extended.token, extended.nested, extended.until], [outer.token, [inner.token], new Date(t0 + 60_000 + 20 * 60_000).toISOString()], 'an extension, not a nest')
  const byInner = await holdDesktop({ seat: SEAT, minutes: 25, token: inner.token, dir, now: at(120) })
  assert.deepEqual([byInner.token, byInner.nested], [inner.token, true], 'the nested holder gets its own token back')
  assert.deepEqual([holdFile(dir).token, holdFile(dir).nested], [outer.token, [inner.token]], 'no new holder')
  const log = readFileSync(join(dir, HOLD_LOG_NAME), 'utf8').trim().split('\n').map((line) => JSON.parse(line).action)
  assert.deepEqual(log, ['hold', 'nest', 'extend', 'extend'])
})

test('CU-327: a hold\'s minutes still run out with nested holders outstanding - over-held, never forever', async () => {
  const dir = freshDir()
  const outer = await holdDesktop({ seat: SEAT, minutes: 5, dir, now: at(0) })
  await holdDesktop({ seat: SEAT, minutes: 10, dir, now: at(60) })
  await holdDesktop({ seat: SEAT, minutes: 10, dir, now: at(120) })
  const until = Date.parse(holdFile(dir).until)
  assert.equal(holdFile(dir).nested.length, 2)
  assert.ok(until <= t0 + 120_000 + MAX_HOLD_MINUTES * 60_000, 'a nest lengthens the hold only within its own minutes')
  assert.equal(readHold({ dir, now: () => until + 1 }), null, 'past until: no live hold, nested holders or not')
  const other = await holdDesktop({ seat: 'cu-integrator', minutes: 5, dir, now: () => until + 1000 })
  assert.equal(other.seat, 'cu-integrator', 'another seat holds once the minutes ran out')
  assert.equal(holdFile(dir).nested, undefined, 'and starts clean')
  await assert.rejects(releaseHoldEntry({ seat: SEAT, token: outer.token, dir, now: () => until + 2000 }).then((r) => { if (!r.released) throw new Error('not released') }), /not released/, 'the old holder\'s token ends nothing of the new hold')
})

test('CU-327: an older checkout\'s tokenless hold - a tokenless hold again extends it and gives it a token; a tokenless release ends it', async () => {
  const dir = freshDir()
  const legacy = await holdDesktop({ seat: SEAT, minutes: 5, dir, now: at(0) })
  // What a pre-CU-327 checkout writes: no token.
  const { token: _token, ...old } = holdFile(dir)
  const { writeFileSync } = await import('node:fs')
  writeFileSync(join(dir, HOLD_NAME), `${JSON.stringify(old)}\n`)
  const again = await holdDesktop({ seat: SEAT, minutes: 8, dir, now: at(30) })
  assert.equal(again.nested, undefined, 'no token to nest under: an extension')
  assert.match(again.token, /^[0-9a-f]{16}$/)
  assert.notEqual(again.token, legacy.token)
  assert.equal(await releaseHold({ seat: SEAT, dir, now: at(60) }), true)
})

test('CU-327 CLI: hold prints the token, hold --token extends, release --token ends; a tokenless release of a nested hold prints unnested', async () => {
  const dir = freshDir()
  const lines = []
  const write = (line) => lines.push(JSON.parse(line))
  const seams = { startKeeper: () => null, idleSeconds: null }
  assert.equal(await main(['hold', '--seat', SEAT, '--minutes', '5', '--dir', dir], { write, seams }), 0)
  const token = lines.at(-1).held.token
  assert.match(token, /^[0-9a-f]{16}$/)
  assert.equal(await main(['hold', '--seat', SEAT, '--minutes', '6', '--dir', dir], { write, seams }), 0)
  assert.equal(lines.at(-1).held.nested, true, 'tokenless: nested')
  assert.equal(await main(['hold', '--seat', SEAT, '--minutes', '7', '--token', token, '--dir', dir], { write, seams }), 0)
  assert.equal(lines.at(-1).held.token, token, 'with the token: extended')
  assert.equal(await main(['release', '--seat', SEAT, '--dir', dir], { write }), 0)
  assert.deepEqual(lines.at(-1), { released: false, unnested: true, nested: 0 })
  assert.equal(await main(['release', '--seat', SEAT, '--token', 'ffffffffffffffff', '--dir', dir], { write }), 1)
  assert.equal(lines.at(-1).reason, 'hold_token_mismatch')
  assert.equal(await main(['release', '--seat', SEAT, '--token', token, '--dir', dir], { write }), 0)
  assert.deepEqual(lines.at(-1), { released: true, unnested: false, nested: 0 })
})
