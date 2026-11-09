import assert from 'node:assert/strict'
import { test } from 'node:test'

import { urlSecret } from '../../_tools_/agent-core/policy.mjs'
import { CARD, SSN } from '../fixture-shapes/shapes.mjs'

// CU-348: the userinfo username of a navigate URL is read like a path segment.
const PLAIN = CARD.replace(/\D/g, '')

test('CU-348: a card, a dashed card or an SSN as the URL username is sensitive', () => {
  assert.equal(urlSecret(`https://${PLAIN}@shop.example/checkout`), 'card')
  assert.equal(urlSecret(`https://${PLAIN.match(/.{4}/g).join('-')}@shop.example/`), 'card')
  assert.equal(urlSecret(`https://${SSN}@forms.example/`), 'national_id')
})

test('CU-348: a username holding digits this run typed is sensitive', () => {
  assert.equal(urlSecret(`https://u${PLAIN}x@shop.example/`, [PLAIN]), 'card')
})

test('CU-348 negatives: an ordinary username or a short numeric id stays free', () => {
  assert.equal(urlSecret('https://alice@git.example/repo'), null)
  assert.equal(urlSecret('https://12345@tracker.example/'), null)
  assert.equal(urlSecret('https://deploy-bot@ci.example/run/42'), null)
})
