// CU-333: `open` has its own, longer bound. Building a screen is the fixture's heaviest call, and on a loaded host every
// grid-sheet open outran the 10 s the other calls keep (three gates, 08:50Z-09:39Z on 9 Nov). A stand-in that speaks
// the fixture's JSON lines replays it at a small scale: an open that answers later than the other calls' bound. No CU
// Fixture is launched here (the launch lock is answered by a stub), so the rows run anywhere.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { launchFixture, OPEN_TIMEOUT_MS } from '../../_tools_/desktop-fixture/client.mjs'

const dir = mkdtempSync(join(tmpdir(), 'cu-open-bound-'))
after(() => rmSync(dir, { recursive: true, force: true }))

/** A stand-in fixture: answers hello at once, open after OPEN_DELAY_MS (never when 'never'), state after STATE_DELAY_MS. */
const standIn = join(dir, 'stand-in.mjs')
writeFileSync(standIn, `import { createInterface } from 'node:readline'
const delay = (name) => process.env[name] === 'never' ? null : Number(process.env[name] ?? 0)
createInterface({ input: process.stdin }).on('line', (line) => {
  const { id, method } = JSON.parse(line)
  const answer = (result) => process.stdout.write(JSON.stringify({ id, result }) + '\\n')
  if (method === 'hello') return answer({ app: 'stand-in' })
  if (method === 'quit') { answer({}); return process.exit(0) }
  const wait = method === 'open' ? delay('OPEN_DELAY_MS') : delay('STATE_DELAY_MS')
  if (wait !== null) setTimeout(() => answer({ windows: [method] }), wait)
})
`)

async function launch(env, bounds) {
  for (const [key, value] of Object.entries(env)) process.env[key] = value
  const sandbox = mkdtempSync(join(dir, 'sandbox-'))
  return launchFixture('unused', { sandbox, lockCheck: () => ({ ok: true }), spawnArgs: [process.execPath, standIn], ...bounds })
}

test('CU-333: an open slower than the other calls\' bound still answers - open has its own, longer bound (the loaded-gate case, scaled down)', async () => {
  const fixture = await launch({ OPEN_DELAY_MS: '600', STATE_DELAY_MS: '0' }, { timeoutMs: 200, openTimeoutMs: 3000 })
  try {
    assert.deepEqual(await fixture.open('grid-sheet', {}), { windows: ['open'] }, 'the slow build is waited for')
    assert.deepEqual(await fixture.state(), { windows: ['state'] })
  } finally {
    await fixture.close()
  }
})

test('CU-333: open stays bounded - a fixture that never answers fails with the open bound in the message', async () => {
  const fixture = await launch({ OPEN_DELAY_MS: 'never', STATE_DELAY_MS: '0' }, { timeoutMs: 200, openTimeoutMs: 400 })
  try {
    const started = Date.now()
    await assert.rejects(fixture.open('grid-sheet', {}), /fixture open got no answer within 400 ms/)
    assert.ok(Date.now() - started < 3000, 'it gave up at its bound')
  } finally {
    await fixture.close()
  }
})

test('CU-333: every other call keeps its own bound - a slow state fails at timeoutMs, not at the open bound', async () => {
  const fixture = await launch({ OPEN_DELAY_MS: '0', STATE_DELAY_MS: '1500' }, { timeoutMs: 200, openTimeoutMs: 5000 })
  try {
    await assert.rejects(fixture.state(), /fixture state got no answer within 200 ms/)
  } finally {
    await fixture.close()
  }
})

test('CU-333: the default open bound is 30 s, three times the other calls\' 10 s', () => {
  assert.equal(OPEN_TIMEOUT_MS, 30_000)
})
