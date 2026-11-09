import assert from 'node:assert/strict'
import { test } from 'node:test'

import { looksSensitive } from '../../_tools_/agent-core/policy.mjs'
import { CARD, SSN } from '../fixture-shapes/shapes.mjs'

// CU-346: a card or SSN whose groups are split by dots, slashes, commas, underscores or line breaks.
const GROUPS = CARD.replace(/\D/g, '').match(/.{4}/g)
const SSN_GROUPS = SSN.split('-')

for (const [label, sep] of [['dots', '.'], ['slashes', '/'], ['commas', ','], ['underscores', '_'], ['line breaks', '\n'], ['CRLF', '\r\n']]) {
  test(`CU-346: a card and an SSN split by ${label} are sensitive`, () => {
    assert.equal(looksSensitive(GROUPS.join(sep)), 'card')
    assert.equal(looksSensitive(SSN_GROUPS.join(sep)), 'national_id')
  })
}

test('CU-346 negatives: versions, dates, IPs, thousands and mixed separators stay free', () => {
  for (const text of ['1.2.3.4', 'v10.15.7', '2026/11/09', '1,234,567', [10, 20, 30, 40].join('.'), `${GROUPS[0]}.${GROUPS[1]}/${GROUPS[2]}_${GROUPS[3]}`, '000.12.3456', '123/00/4567']) {
    assert.equal(looksSensitive(text), null, JSON.stringify(text))
  }
})
