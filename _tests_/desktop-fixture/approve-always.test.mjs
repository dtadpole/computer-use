import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { approveFixtureApps, FIXTURE_APPS } from '../../_tools_/desktop-fixture/approve-always.mjs'

/** A terminal stand-in that answers `answers` in turn, one per question written to it. */
function terminal(answers) {
  const input = new PassThrough()
  const output = new PassThrough()
  const queue = [...answers]
  output.on('data', (chunk) => {
    if (String(chunk).includes('[y/N]')) input.write(`${queue.shift() ?? ''}\n`)
  })
  output.resume()
  return { input, output }
}

test('only the two fixture apps can be approved here', () => {
  assert.deepEqual(FIXTURE_APPS.map((app) => app.bundleId), ['ai.reflection.cu.fixture', 'ai.reflection.cu.ledger'])
})

test('a y records each fixture app always, by tty; a second run finds them approved; an n records nothing', async () => {
  const dir = mkdtempSync('/tmp/cu-approve-always-test-')
  try {
    const store = createAppApprovals({ path: join(dir, 'app-approvals.json') })
    assert.deepEqual(await approveFixtureApps(store, terminal(['y', 'yes'])), { approved: ['ai.reflection.cu.fixture', 'ai.reflection.cu.ledger'], already: [], declined: [] })
    assert.deepEqual(store.list().apps.map((entry) => [entry.bundleId, entry.by]), [['ai.reflection.cu.fixture', 'tty'], ['ai.reflection.cu.ledger', 'tty']])
    assert.deepEqual((await approveFixtureApps(store, terminal([]))).already.length, 2)
    const other = createAppApprovals({ path: join(dir, 'other.json') })
    assert.deepEqual(await approveFixtureApps(other, terminal(['n', ''])), { approved: [], already: [], declined: ['ai.reflection.cu.fixture', 'ai.reflection.cu.ledger'] })
    assert.equal(other.covers('ai.reflection.cu.fixture'), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
