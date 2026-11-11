import assert from 'node:assert/strict'
import { test } from 'node:test'

import { FAMILIES, ruledGaps, sweep } from '../../_tools_/probe-kit/sweeps.mjs'

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
