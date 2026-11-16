import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import { testMatrices } from '../../_tools_/probe-kit/test-matrices.mjs'

// Part of CU-562: the kept matrices are rebuilt from the agent-core tests on demand, so the sweep set follows the tests.
test('a synthetic tree gives one matrix: its page, asking names by class up to the cap, free names apart', () => {
  const root = mkdtempSync(join(tmpdir(), 'cu-test-matrices-'))
  try {
    mkdirSync(join(root, '_tests_', 'agent-core'), { recursive: true })
    writeFileSync(join(root, '_tests_', 'agent-core', 'demo.test.mjs'), "const url = 'https://app.fixture.example/settings/account'\nfor (const n of ['Delete account', 'Empty trash', 'View profile']) {}\n")
    writeFileSync(join(root, '_tests_', 'agent-core', 'no-page.test.mjs'), "for (const n of ['Delete account']) {}\n")
    const ms = testMatrices({ root, cap: 1 })
    assert.equal(ms.length, 1, 'a file without a page gives no matrix')
    const [m] = ms
    assert.equal(m.id, 't-demo'); assert.equal(m.site, 'https://app.fixture.example/settings/account')
    assert.deepEqual(m.rows, [['delete', ['Delete account']]], 'the cap keeps the first asking name only')
    assert.deepEqual(m.free, ['View profile'])
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test("this tree's matrices: over a hundred pages and three hundred asking rows, unique ids, each site a URL", () => {
  // A coverage guard: if the tests change how they name a page or a button, the sweep set would shrink without a word.
  const ms = testMatrices({ cap: 3, freeCap: 0 })
  const rows = ms.reduce((a, m) => a + m.rows.reduce((b, [, l]) => b + l.length, 0), 0)
  assert.ok(ms.length >= 100, `only ${ms.length} matrices`)
  assert.ok(rows >= 300, `only ${rows} asking rows`)
  assert.equal(new Set(ms.map((m) => m.id)).size, ms.length)
  for (const m of ms) assert.ok(new URL(m.site).origin.startsWith('https://'), m.id)
})

test('a cap that is not a whole number >= 1 is refused, by the function and by the CLI (exit 2, nothing written)', () => {
  for (const cap of [Number.NaN, -5, 0, 2.5]) assert.throws(() => testMatrices({ cap }), RangeError, String(cap))
  const cli = fileURLToPath(new URL('../../_tools_/probe-kit/test-matrices.mjs', import.meta.url))
  const out = mkdtempSync(join(tmpdir(), 'cu-test-matrices-cli-'))
  try {
    for (const cap of ['abc', '-5', '0']) {
      const r = spawnSync(process.execPath, [cli, join(out, cap), cap], { encoding: 'utf8' })
      assert.equal(r.status, 2, `cap ${cap}: ${r.stdout}${r.stderr}`)
    }
  } finally { rmSync(out, { recursive: true, force: true }) }
})
