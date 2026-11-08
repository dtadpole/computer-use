import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'
import { createSitePolicy } from '../../_tools_/agent-core/sites.mjs'
import { CARD as CARD_NUMBER } from '../fixture-shapes/shapes.mjs'

// CU-160 (cu-verifier): every desktop question ended 'on  (...)' - the place came from the URL's host, and a desktop run
// has no URL. The question names the app on the desktop (the target's, else the one in front), the host in a browser.

const FIXTURE = 'ai.reflection.cu.fixture'
const SEND = { type: 'click', x: 10, y: 10, button: 'left' }
const CARD = { type: 'type', text: `card ${CARD_NUMBER}` }
const dir = mkdtempSync(join(tmpdir(), 'cu-question-place-'))
after(() => rmSync(dir, { recursive: true, force: true }))
let stores = 0
function approved() {
  const store = createAppApprovals({ path: join(dir, `approvals-${stores += 1}.json`) })
  store.grantAlways(FIXTURE, { by: 'api' })
  return store
}
const desktopPolicy = () => createAppPolicy({ scope: [FIXTURE], approvals: approved() })

test('a desktop question names the app the target belongs to', () => {
  const policy = desktopPolicy()
  const v = policy.classify(SEND, { frontmostBundleId: FIXTURE, target: { origin: FIXTURE, role: 'AXButton', name: 'Send', fingerprint: 's' } })
  assert.equal(v.decision, 'confirm')
  assert.equal(v.reason, `click "Send" on ${FIXTURE} (submit)`)
  const typed = policy.classify(CARD, { frontmostBundleId: FIXTURE, target: { origin: FIXTURE, role: 'AXTextField', name: 'Email', fingerprint: 'e' } })
  assert.equal(typed.decision, 'confirm')
  assert.ok(typed.reason.includes(`into Email on ${FIXTURE} (`), typed.reason)
})

test('with no target, the question names the app in front, never an empty place', () => {
  const inner = createPolicy({ sitePolicy: () => 'allow' })
  const v = inner.classify(CARD, { frontmostBundleId: FIXTURE, target: null })
  assert.equal(v.decision, 'confirm')
  assert.ok(v.reason.includes(` on ${FIXTURE} (`), v.reason)
  const none = inner.classify(CARD, { target: null })
  assert.ok(!/ on  \(/.test(none.reason) && none.reason.includes(' on this app ('), none.reason)
})

test('a browser question still names the page host, unchanged', () => {
  const start = 'https://shop.example/cart'
  const policy = createPolicy({ sitePolicy: createSitePolicy({ startUrl: start }) })
  const v = policy.classify(SEND, { url: start, target: { tag: 'button', role: 'button', name: 'Buy now', origin: 'https://shop.example', fingerprint: 'b' } })
  assert.equal(v.reason, 'click "Buy now" on shop.example (purchase)')
})

test('through the loop, the desktop consent request names the app', async () => {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control })
  environment.inspectPoint = async () => ({ origin: FIXTURE, role: 'AXButton', name: 'Send', fingerprint: 'send' })
  const requests = []
  control.subscribe((event) => {
    if (event.type !== 'consent_request') return
    requests.push(event.request)
    control.answer?.(event.request.id, { approved: false, lifetime: 'once' })
  })
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [SEND] }, { final: 'done\nOUTCOME: not_done' }] })
  await runTask({ task: 'send it', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: approved() })
  const submit = requests.find((r) => r.class === 'submit')
  assert.ok(submit, 'the Send click was asked')
  assert.equal(submit.what, `click "Send" on ${FIXTURE} (submit)`)
})
