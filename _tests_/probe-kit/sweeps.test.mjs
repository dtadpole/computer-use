import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { FAMILIES, ruledGaps, sweep, diffSweeps } from '../../_tools_/probe-kit/sweeps.mjs'

// Part of CU-458: the canonical-form sweeps kept on the kit. A row that asks bare keeps asking in every ruled form; a row that
// is free bare is skipped; an unruled family is reported, never judged.
const SITE = 'https://app.fixture.example/settings/account'

test('every ruled family keeps an asking row asking (0 ruled gaps)', () => {
  const result = sweep([{ id: 'fixture', site: SITE, rows: [['delete', ['Delete account', 'Empty trash']]] }])
  assert.deepEqual(ruledGaps(result), [], JSON.stringify(Object.fromEntries(Object.entries(result).map(([f, r]) => [f, r.free]))))
  for (const [f, r] of Object.entries(result)) assert.equal(r.asking, 2, f)
})

test('a row that is free bare is skipped, not counted', () => {
  const result = sweep([{ id: 'fixture', site: SITE, rows: [['free', ['View profile']]] }])
  for (const r of Object.values(result)) assert.equal(r.asking, 0)
})

test('the unruled family is reported only, and every family names its forms', () => {
  assert.equal(FAMILIES.unruled.ruled, false)
  for (const [f, fam] of Object.entries(FAMILIES)) {
    assert.ok(Object.keys(fam.forms).length > 0, f)
    for (const [k, form] of Object.entries(fam.forms)) assert.equal(typeof form('Delete account'), 'string', `${f}.${k}`)
  }
  const result = sweep([{ id: 'fixture', site: SITE, rows: [['delete', ['Delete account']]] }], { families: ['unruled'] })
  assert.deepEqual(ruledGaps(result), [])
})

test('a form that hands off (stronger than asking) is not reported free', () => {
  // 'Change password' hands off to the person; its wrapped forms hand off too, so no family may list them.
  const result = sweep([{ id: 'fixture', site: SITE, rows: [['handoff', ['Change password']]] }])
  assert.deepEqual(ruledGaps(result), [])
  assert.equal(result.label.asking, 1)
})

test('diffSweeps names a newly free form even when the family counts stay equal', () => {
  const r = (frees) => ({ polite: { ruled: true, asking: 2, free: { please: frees } } })
  const before = r(['m:Please delete account']), after = r(['m:Please empty trash'])
  const d = diffSweeps(before, after)
  assert.deepEqual(d.newFree, [['polite.please', 'm:Please empty trash']])
  assert.deepEqual(d.gone, [['polite.please', 'm:Please delete account']])
  assert.deepEqual(diffSweeps(before, before), { newFree: [], gone: [] })
})

test('the CLI tells a usage error (exit 2) from new frees (exit 1) and never overwrites a matrix with --json', () => {
  const cli = new URL('../../_tools_/probe-kit/sweeps.mjs', import.meta.url).pathname
  const dir = mkdtempSync(join(tmpdir(), 'sweeps-cli-'))
  const m = join(dir, 'm.json'); const body = JSON.stringify({ site: 'https://app.fixture.example/settings', rows: [['delete', ['Delete account']]] })
  writeFileSync(m, body)
  assert.equal(spawnSync(process.execPath, [cli, 'diff', join(dir, 'missing.json'), m]).status, 2, 'an unreadable diff input is a usage error')
  assert.equal(spawnSync(process.execPath, [cli, '--json', m, m]).status, 2, 'OUT naming an input matrix is refused')
  assert.equal(readFileSync(m, 'utf8'), body, 'the matrix is untouched')
  const out = join(dir, 'r.json')
  assert.notEqual(spawnSync(process.execPath, [cli, '--json', out, m]).status, 2, 'a new OUT file is accepted')
  assert.equal(spawnSync(process.execPath, [cli, 'diff', out, out]).status, 0, 'equal results exit 0')
})
