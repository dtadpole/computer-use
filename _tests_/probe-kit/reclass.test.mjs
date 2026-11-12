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

test('only allow is free: block -> allow is a lost ask, confirm -> block is a change, not a loss', () => {
  const d = reclassDiff({ 'x@p': 'block', 'y@p': 'delete', 'z@p': 'handoff' }, { 'x@p': 'allow', 'y@p': 'block', 'z@p': 'handoff' })
  assert.deepEqual(d.lost, ['x@p']); assert.deepEqual(d.gained, []); assert.deepEqual(d.changed, ['y@p'])
})

test('the CLI runs through a symlinked path (macOS /tmp is one) and still fails on a bad input', async () => {
  const { mkdtempSync, symlinkSync } = await import('node:fs')
  const { tmpdir } = await import('node:os'); const { join, dirname } = await import('node:path'); const { spawnSync } = await import('node:child_process')
  const kit = dirname(new URL('../../_tools_/probe-kit/reclass.mjs', import.meta.url).pathname)
  const link = join(mkdtempSync(join(tmpdir(), 'kit-link-')), 'kit'); symlinkSync(kit, link)
  for (const cli of [join(kit, 'reclass.mjs'), join(link, 'reclass.mjs')]) {
    const r = spawnSync(process.execPath, [cli, 'diff', '/nonexistent-a.json', '/nonexistent-b.json'], { encoding: 'utf8' })
    assert.notEqual(r.status, 0, `${cli} must not exit 0 on a missing input`)
  }
  const usage = spawnSync(process.execPath, [join(link, 'reclass.mjs')], { encoding: 'utf8' })
  assert.equal(usage.status, 2); assert.match(usage.stderr, /usage/)
})

test('--max-age without a number is refused (exit 2), not read as no limit', async () => {
  const { mkdtempSync, writeFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os'); const { join } = await import('node:path'); const { spawnSync } = await import('node:child_process')
  const dir = mkdtempSync(join(tmpdir(), 'reclass-')); const a = join(dir, 'a.json'); writeFileSync(a, '{}')
  const cli = new URL('../../_tools_/probe-kit/reclass.mjs', import.meta.url).pathname
  for (const v of [[], ['abc']]) {
    const r = spawnSync(process.execPath, [cli, 'diff', a, a, '--max-age', ...v], { encoding: 'utf8' })
    assert.equal(r.status, 2, `--max-age ${v.join(' ')}`); assert.match(r.stderr, /max-age/)
  }
})
