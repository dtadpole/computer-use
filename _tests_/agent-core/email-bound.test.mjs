import assert from 'node:assert/strict'
import { test } from 'node:test'

import { looksSensitive } from '../../_tools_/agent-core/policy.mjs'

// CU-272 (cu-researcher): the email value rule stays linear on a long word run.
const at = String.fromCharCode(64)

test('CU-272: an 80k-character word run, with or without an @, is judged in well under a second', () => {
  for (const text of ['a'.repeat(80_000), `${'a'.repeat(80_000)}${at}`, `${at}${'a'.repeat(80_000)}`, `${'a.'.repeat(40_000)}${at}b`]) {
    const started = process.hrtime.bigint()
    looksSensitive(text)
    const ms = Number(process.hrtime.bigint() - started) / 1e6
    assert.ok(ms < 500, `${text.length} chars took ${ms.toFixed(0)} ms`)
  }
})

test('CU-272: ordinary addresses still read as email; plain text does not', () => {
  for (const text of [`jane.doe${at}example.com`, `Reply to a+b${at}mail.example.org please`]) assert.equal(looksSensitive(text), 'email', text)
  for (const text of ['no address here', `${at}handle`, `user${at}localhost`]) assert.notEqual(looksSensitive(text), 'email', text)
})
