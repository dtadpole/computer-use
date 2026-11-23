import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { CLASSES, diffClasses, runClass } from '../../_tools_/probe-kit/class-sweeps.mjs'

// Part of CU-458: the class sweeps kept on the kit. These tests pin the sweep's shape and its runner, never a policy verdict
// (the sweep reports frees; a review judges them).
const CLI = new URL('../../_tools_/probe-kit/class-sweeps.mjs', import.meta.url).pathname

test('every class names its issue, a known route, a place and at least 20 distinct phrasings', () => {
  for (const [id, c] of Object.entries(CLASSES)) {
    assert.match(c.issue, /^CU-\d+/, id)
    assert.ok(['web', 'desk', 'field'].includes(c.route), id)
    assert.ok(c.route === 'desk' ? /^[a-z0-9.-]+$/i.test(c.where) : c.where.startsWith('https://'), id)
    assert.ok(c.items.length >= 20, `${id} has ${c.items.length}`)
    assert.equal(new Set(c.items).size, c.items.length, `${id} repeats a phrasing`)
  }
})

test('runClass returns the total and a subset of the class as free, on every route', () => {
  for (const id of ['purchase', 'wallet', 'secrets']) {
    const r = runClass(id)
    assert.equal(r.total, CLASSES[id].items.length, id)
    for (const n of r.free) assert.ok(CLASSES[id].items.includes(n), `${id}: ${n}`)
  }
  assert.throws(() => runClass('no-such-class'), /unknown class/)
})

test('diffClasses names the newly free and the no longer free per class', () => {
  const d = diffClasses({ a: { free: ['x', 'y'] } }, { a: { free: ['y', 'z'] }, b: { free: ['w'] } })
  assert.deepEqual(d.a, { newFree: ['z'], gone: ['x'] })
  assert.deepEqual(d.b, { newFree: ['w'], gone: [] })
})

test('the CLI diff exits 1 on a newly free name and 0 otherwise; a bad class exits 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'class-sweeps-'))
  const a = join(dir, 'a.json'), b = join(dir, 'b.json')
  writeFileSync(a, JSON.stringify({ purchase: { free: [] } }))
  writeFileSync(b, JSON.stringify({ purchase: { free: ['Lease now'] } }))
  assert.equal(spawnSync(process.execPath, [CLI, 'diff', a, b]).status, 1)
  assert.equal(spawnSync(process.execPath, [CLI, 'diff', b, a]).status, 0)
  assert.equal(spawnSync(process.execPath, [CLI, 'no-such-class']).status, 2)
})
