import assert from 'node:assert/strict'
import { test } from 'node:test'

import { lostEquals, reclassDiff, reclassMap } from '../../_tools_/probe-kit/reclass.mjs'

// Part of CU-458: the D-108 guard kept on the kit. The map classifies names on their page; the diff names what a head loses,
// gains, changes or narrows; lostEquals checks a lowering PR against its ruled list.
const SITE = 'https://app.fixture.example/settings/account'

test('the map gives an asking row its class set and a free name allow', () => {
  const map = reclassMap([{ site: SITE, rows: [['delete', ['Delete account']]], free: ['View profile'] }])
  assert.match(map['Delete account@app.fixture.example/settings/account'], /delete/)
  assert.equal(map['View profile@app.fixture.example/settings/account'], 'allow')
})

test('the diff separates lost, gained, changed and narrowed keys', () => {
  const base = { 'a@p': 'delete', 'b@p': 'allow', 'c@p': 'delete', 'd@p': 'credential+delete', 'e@p': 'submit' }
  const head = { 'a@p': 'allow', 'b@p': 'permission', 'c@p': 'credential+delete', 'd@p': 'delete', 'e@p': 'submit' }
  const d = reclassDiff(base, head)
  assert.deepEqual(d.lost, ['a@p']); assert.deepEqual(d.gained, ['b@p'])
  assert.deepEqual(d.changed, ['c@p', 'd@p']); assert.deepEqual(d.narrowed, ['d@p'])
  assert.equal(d.shared, 5)
})

test('lostEquals is exact: nothing missing, nothing extra', () => {
  const d = reclassDiff({ 'View order@p': 'purchase', 'Security checkup@q': 'permission' }, { 'View order@p': 'allow', 'Security checkup@q': 'allow' })
  assert.equal(lostEquals(d, ['View order', 'Security checkup']), true)
  assert.equal(lostEquals(d, ['View order']), false)
  assert.equal(lostEquals(d, ['View order', 'Security checkup', 'Call forwarding']), false)
})

test('the diff CLI refuses a stale map (older than --max-age) and reads fresh ones', async () => {
  const { mkdtempSync, writeFileSync, utimesSync } = await import('node:fs')
  const { tmpdir } = await import('node:os'); const { join } = await import('node:path'); const { spawnSync } = await import('node:child_process')
  const dir = mkdtempSync(join(tmpdir(), 'reclass-')); const a = join(dir, 'a.json'); const b = join(dir, 'b.json')
  writeFileSync(a, JSON.stringify({ 'x@p': 'delete' })); writeFileSync(b, JSON.stringify({ 'x@p': 'delete' }))
  const cli = new URL('../../_tools_/probe-kit/reclass.mjs', import.meta.url).pathname
  assert.equal(spawnSync(process.execPath, [cli, 'diff', a, b]).status, 0)
  const old = Date.now() / 1000 - 2 * 3600; utimesSync(a, old, old)
  const r = spawnSync(process.execPath, [cli, 'diff', a, b], { encoding: 'utf8' })
  assert.equal(r.status, 2); assert.match(r.stderr, /REFUSED/)
})
