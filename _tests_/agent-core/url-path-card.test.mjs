import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { apiController } from '../../_tools_/agent-core/consent.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { createPolicy, pathCard, urlSecret } from '../../_tools_/agent-core/policy.mjs'
import { createSitePolicy } from '../../_tools_/agent-core/sites.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'
import { CARD, CARD_BAD_LUHN, CARD_DIGITS, j } from '../fixture-shapes/shapes.mjs'

// CU-325 (design note 0.1 on the issue; cu-coordinator 06:30Z, High): a card number in a URL path asks sensitive_data, as
// one in the query does (CU-260). Test cards are built from fragments at runtime, never written whole.
const AMEX = j('3782', '822463', '10005')
const MASTERCARD = j('5555', '5555', '5555', '4444')
const NO_BRAND = j('1234', '5678', '1234', '5670') // Luhn-valid, no card brand's prefix - an order or status id
const NINES = j('9999', '9999', '9999', '9995') // Luhn-valid, no brand
const SITE = 'https://fixture.example'
const policy = createPolicy({ sitePolicy: () => 'allow' })
const go = (url, context = {}) => policy.classify({ type: 'navigate', url }, { url: `${SITE}/page`, target: null, ...context })

test('CU-325: a brand card in a URL path asks sensitive_data - bare, grouped, percent-encoded, any brand', () => {
  // cu-researcher on #245: a file name or a suffix around the card counts too.
  for (const segment of [CARD_DIGITS, CARD.replaceAll(' ', '-'), encodeURIComponent(CARD), AMEX, MASTERCARD, j('3782', '-', '822463', '-', '10005'), `${CARD_DIGITS}.pdf`, `${CARD_DIGITS}x`, `receipt-${CARD_DIGITS}-2026.csv`, `card_${MASTERCARD}`]) {
    const v = go(`${SITE}/pay/${segment}`)
    assert.deepEqual([v.decision, v.class, v.rule], ['confirm', 'sensitive_data', 'url:sensitive_data'], segment)
    assert.match(v.reason, /card/)
  }
  assert.equal(urlSecret(`${SITE}/a/b/${CARD_DIGITS}/receipt`), 'card', 'a middle segment too')
})

test('CU-325 negatives: ids that are not card-shaped stay allowed', () => {
  for (const [why, segment] of [
    ['Luhn-invalid', CARD_BAD_LUHN.replaceAll(' ', '')],
    ['Luhn-valid with no brand prefix', NO_BRAND],
    ['an Amazon order id (3-7-7)', j('111', '-', '1234567', '-', '1234567')],
    ['a UUID', '123e4567-e89b-12d3-a456-426614174000'],
    ['a card-shaped run inside a longer digit run', `order-${CARD_DIGITS}7`],
    ['a run of twenty digits in a file name', `${j(CARD_DIGITS, '1111')}.pdf`],
    ['twelve digits', '411111111111'],
    ['twenty digits', j(CARD_DIGITS, '1111')],
    ['a brand prefix at a wrong length (Amex at 16)', j('3782', '8224', '6310', '0055')],
  ]) {
    assert.equal(go(`${SITE}/orders/${segment}`).decision, 'allow', why)
  }
})

test('CU-325 named limits (cu-researcher on #245): a card as a host label, or split across two segments, is not read', () => {
  assert.equal(go(`https://${CARD_DIGITS}.fixture.example/`).decision, 'allow')
  assert.equal(go(`${SITE}/p/${CARD_DIGITS.slice(0, 8)}/${CARD_DIGITS.slice(8)}`).decision, 'allow')
})

test('CU-325: digits the run typed ask in a later path whatever their prefix; untyped they stay an id', () => {
  assert.equal(pathCard(NINES), false)
  assert.equal(pathCard(NINES, [NINES]), true)
  assert.equal(go(`${SITE}/p/${NINES}`).decision, 'allow')
  const v = go(`${SITE}/p/${NINES}`, { typedDigits: [NINES] })
  assert.deepEqual([v.decision, v.class], ['confirm', 'sensitive_data'])
  assert.equal(go(`${SITE}/p/${NINES}`, { typedDigits: ['1234'] }).decision, 'allow', 'a short typed run is no card')
})

test('CU-325: the path case is pre-approvable exactly as the query case is (CU-260)', () => {
  const lenient = createPolicy({ sitePolicy: () => 'allow', preApprovals: [{ class: 'sensitive_data' }] })
  const at = (url) => lenient.classify({ type: 'navigate', url }, { url: `${SITE}/page`, target: null }).decision
  assert.equal(at(`${SITE}/pay/${CARD_DIGITS}`), at(`${SITE}/pay?card=${CARD_DIGITS}`))
})

const tmp = mkdtempSync(join(tmpdir(), 'cu-325-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
let runs = 0
async function run(actions) {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'browser', control, url: `${SITE}/` })
  const field = { origin: SITE, role: 'textbox', tag: 'input', name: 'Reference', editable: true, fingerprint: 'field-a' }
  environment.focusedElement = async () => field
  environment.inspectPoint = async () => field
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions }, { final: 'done' }] })
  const controller = apiController()
  const asked = []
  let running = true
  const answering = (async () => {
    while (running) {
      const request = await controller.waitForRequest(200).catch(() => null)
      if (request) { asked.push(request.class ?? request.decision?.class ?? null); controller.respond({ id: request.id, approved: true }) }
    }
  })()
  const result = await runTask({ task: 'look up the reference', environment, model, control, controller, runsDirectory: join(tmp, `runs-${runs += 1}`), build: { commit: 'test', dirty: false }, sitePolicy: createSitePolicy({ startUrl: `${SITE}/` }) })
  running = false
  await answering
  return readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action' && e.status !== 'attempted' && e.action?.type === 'navigate')
}

test('CU-325 through the loop: a navigate to a path holding digits the run typed asks; the same navigate in a fresh run does not', async () => {
  const typedFirst = await run([{ type: 'type', text: NINES }, { type: 'navigate', url: `${SITE}/p/${NINES}` }])
  assert.equal(typedFirst.length, 1)
  assert.equal(typedFirst[0].class, 'sensitive_data', 'the typed run reached the policy as typedDigits')
  const fresh = await run([{ type: 'navigate', url: `${SITE}/p/${NINES}` }])
  assert.equal(fresh.length, 1)
  assert.equal(fresh[0].decision, 'allow')
})
