import assert from 'node:assert/strict'
import { test } from 'node:test'

import { looksSensitive } from '../../_tools_/agent-core/policy.mjs'
import { j } from '../fixture-shapes/shapes.mjs'

// CU-350 (CU-347's follow-up): passphrase assignments, upper-case names ending in PASSWORD/SECRET/TOKEN, bearer tokens and
// a password glued to a database client's flag. Values are built from fragments (public hygiene).
test('CU-350: passphrase, PGPASSWORD-style names, bearer tokens and client -p passwords are keys', () => {
  for (const text of [j('passphrase=', 'correct-horse9'), j('{"passphrase": "', 's3cret-phrase"}'), j('PGPASSWORD=', 's3cr3tpw'),
    j('MYSQL_ROOT_PASSWORD=', 'r00tpass'), j('Authorization: Bearer ', 'eyJhbGciOi', 'JIUzI1NiJ9abc'), j('Bearer ', 'abc123def456ghi789'),
    j('mysql -uroot -p', 'hunter2x mydb'), j('psql --password=', 'pw1234 -h db'), j('redis-cli -a x -p', '6379secret')]) {
    assert.equal(looksSensitive(text), 'key', text.slice(0, 14))
  }
})

test('CU-350 negatives: ports, prose, counters and a prompt-for-password flag stay free', () => {
  for (const text of ['-p8080', 'ssh -p2222 host', 'the bearer of bad news', 'Bearer token required', 'TOKEN_COUNT=12', 'mysql -uroot -p mydb', 'PASSWORDLESS=true']) {
    assert.equal(looksSensitive(text), null, text)
  }
})
