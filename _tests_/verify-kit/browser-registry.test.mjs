import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, beforeEach, describe, test } from 'node:test'

import { pidAlive, refusal, registerBrowser, REGISTRY_DIR, TEAM_CAP } from '../../_tools_/verify-kit/browser-registry.mjs'

// Every test uses its own directory under /tmp; the real registry is never touched.
const root = mkdtempSync('/tmp/cu-verifier-registry-test-')
let dir
let counter = 0
beforeEach(() => {
  counter += 1
  dir = join(root, `r${counter}`)
})
after(() => rmSync(root, { recursive: true, force: true }))

const entry = (seat, pid) => ({ seat, pid, profile: null, startedAt: '2026-11-01T00:00:00.000Z' })
const put = (name, value) => {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, name), typeof value === 'string' ? value : JSON.stringify(value))
}
const base = (extra = {}) => ({ seat: 'cu-verifier', dir, pid: 4242, isAlive: (pid) => pid !== 999, onExit: () => {}, offExit: () => {}, ...extra })

describe('constants and pure parts', () => {
  test('the registry and the cap are the ones D-014 names', () => {
    assert.equal(REGISTRY_DIR, '/tmp/cu-browsers')
    assert.equal(TEAM_CAP, 2)
  })

  test('refusal: one browser per seat, two for the team', () => {
    assert.equal(refusal([], 'cu-verifier'), null)
    assert.equal(refusal([entry('cu-developer-two', 1)], 'cu-verifier'), null)
    assert.equal(refusal([entry('cu-verifier', 1)], 'cu-verifier'), 'seat_has_browser')
    assert.equal(refusal([entry('cu-developer-one', 1), entry('cu-developer-two', 2)], 'cu-verifier'), 'team_cap')
  })

  test('pidAlive knows this process and rejects nonsense', () => {
    assert.equal(pidAlive(process.pid), true)
    assert.equal(pidAlive(0), false)
    assert.equal(pidAlive(-5), false)
    assert.equal(pidAlive(1.5), false)
  })
})

describe('registerBrowser', () => {
  test('writes the entry D-014 describes, records the Chrome pid, and removes it on release', async () => {
    const result = await registerBrowser(base({ profile: '/tmp/cu-verifier-chrome-AbC123', now: () => Date.parse('2026-11-01T10:00:00Z') }))
    assert.equal(result.ok, true)
    const path = join(dir, 'cu-verifier-4242.json')
    assert.equal(result.slot.entryPath, path)
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), { seat: 'cu-verifier', pid: 4242, profile: '/tmp/cu-verifier-chrome-AbC123', startedAt: '2026-11-01T10:00:00.000Z' })
    result.slot.setChromePid(5151)
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).chromePid, 5151)
    assert.equal(existsSync(join(dir, '.lock')), false, 'the lock is released after registering')
    result.slot.release()
    assert.equal(existsSync(path), false)
    result.slot.release()
    result.slot.setChromePid(1)
  })

  test('refuses a second browser for the same seat', async () => {
    put('cu-verifier-77.json', entry('cu-verifier', 77))
    assert.deepEqual(await registerBrowser(base()), { ok: false, reason: 'seat_has_browser', message: 'seat cu-verifier already runs a browser (D-005)' })
    assert.deepEqual(readdirSync(dir).sort(), ['cu-verifier-77.json'], 'a refusal writes nothing and leaves no lock')
  })

  test('refuses a third browser for the team', async () => {
    put('cu-developer-one-1.json', entry('cu-developer-one', 1))
    put('cu-developer-two-2.json', entry('cu-developer-two', 2))
    const result = await registerBrowser(base())
    assert.equal(result.reason, 'team_cap')
    assert.match(result.message, /already runs 2 browsers/)
  })

  test('entries of dead processes and unreadable entries are cleaned, then the launch is allowed', async () => {
    put('cu-developer-one-999.json', entry('cu-developer-one', 999))
    put('cu-developer-two-2.json', entry('cu-developer-two', 2))
    put('broken.json', '{not json')
    put('notes.txt', 'ignored')
    const result = await registerBrowser(base())
    assert.equal(result.ok, true)
    assert.deepEqual(readdirSync(dir).sort(), ['cu-developer-two-2.json', 'cu-verifier-4242.json', 'notes.txt'])
    result.slot.release()
  })

  test('waits for a held lock, and refuses as registry_busy once its budget is spent', async () => {
    mkdirSync(join(dir, '.lock'), { recursive: true })
    let clock = Date.now()
    const slept = []
    const result = await registerBrowser(base({ now: () => clock, sleep: async (ms) => { slept.push(ms); clock += 2_000 }, lockTimeoutMs: 10_000 }))
    assert.equal(result.reason, 'registry_busy')
    assert.ok(slept.length >= 4 && slept.length <= 6, `${slept.length} waits`)
    assert.equal(existsSync(join(dir, '.lock')), true, 'someone else\'s fresh lock is never broken')
  })

  test('a lock older than 60 s is stale and removed', async () => {
    mkdirSync(join(dir, '.lock'), { recursive: true })
    const old = (Date.now() - 120_000) / 1000
    utimesSync(join(dir, '.lock'), old, old)
    const result = await registerBrowser(base())
    assert.equal(result.ok, true)
    result.slot.release()
  })

  test('the entry is removed at process exit unless released first', async () => {
    const exits = []
    const removed = []
    const result = await registerBrowser(base({ onExit: (fn) => exits.push(fn), offExit: (fn) => removed.push(fn) }))
    assert.equal(exits.length, 1)
    exits[0]()
    assert.equal(existsSync(result.slot.entryPath), false)
    result.slot.release()
    assert.deepEqual(removed, exits)
  })

  test('a seat key that is not a [cu] seat is refused before anything is written', async () => {
    await assert.rejects(registerBrowser(base({ seat: 'verifier' })), /not a \[cu\] seat key/)
    await assert.rejects(registerBrowser(base({ seat: '../x' })), /not a \[cu\] seat key/)
    assert.equal(existsSync(dir), false)
  })
})
