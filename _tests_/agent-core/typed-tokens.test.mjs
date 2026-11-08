import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy, looksSensitive } from '../../_tools_/agent-core/policy.mjs'
import { j } from '../fixture-shapes/shapes.mjs'

// CU-257 (cu-researcher's D-061 sweep): widely used API token formats typed into an ordinary field. Every value is
// built from fragments at runtime (public hygiene) and is made up.
const ALNUM = 'aB3dE5fG7hJ9kL2mN4pQ6rS8tU1vW3xY5zA7bC9dE2fG4h' // 46 mixed letters and digits
const HEX = '0123456789abcdef0123456789abcdef' // 32 hex
const TOKENS = {
  'GitHub fine-grained': j('github', '_pat_', '11ABCDEFG0', ALNUM.slice(0, 30)),
  'GitHub OAuth': j('gh', 'o_', ALNUM.slice(0, 36)),
  'GitHub app': j('gh', 's_', ALNUM.slice(0, 36)),
  'GitHub user': j('gh', 'u_', ALNUM.slice(0, 36)),
  'GitHub refresh': j('gh', 'r_', ALNUM.slice(0, 36)),
  GitLab: j('gl', 'pat-', ALNUM.slice(0, 20)),
  'Google API key': j('AI', 'za', ALNUM.slice(0, 35)),
  'Hugging Face': j('hf', '_', ALNUM.slice(0, 34)),
  npm: j('np', 'm_', ALNUM.slice(0, 36)),
  'Slack xoxa': j('xo', 'xa-', '2-', ALNUM.slice(0, 20)),
  'Slack xoxs': j('xo', 'xs-', ALNUM.slice(0, 24)),
  'Slack xoxr': j('xo', 'xr-', ALNUM.slice(0, 24)),
  'Shopify shpat': j('sh', 'pat_', HEX),
  'Shopify shpss': j('sh', 'pss_', HEX),
  // cu-verifier on #61.
  'Slack app-level': j('xa', 'pp-', '1-', ALNUM.slice(0, 11), '-', HEX),
  SendGrid: j('S', 'G.', ALNUM.slice(0, 22), '.', ALNUM.slice(0, 43)),
  'Stripe restricted': j('rk', '_live_', ALNUM.slice(0, 24)),
}

const tmp = mkdtempSync(join(tmpdir(), 'cu-257-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
const FIXTURE = 'ai.reflection.cu.fixture'
const store = createAppApprovals({ path: join(tmp, 'a.json') })
store.grantAlways(FIXTURE, { by: 'api' })
const desktop = createAppPolicy({ scope: [FIXTURE], approvals: store })
const web = createPolicy({ sitePolicy: () => 'allow' })
const type = (text) => ({ type: 'type', text })
const judged = (v) => (v.decision === 'allow' ? 'allow' : v.class)
const notes = { origin: FIXTURE, role: 'AXTextArea', name: 'Notes', editable: true, fingerprint: 'n', defaultButtonRead: true }

test('CU-257: each token format reads as a key by value and asks sensitive_data when typed - browser and desktop', () => {
  for (const [label, token] of Object.entries(TOKENS)) {
    assert.equal(looksSensitive(token), 'key', label)
    assert.equal(judged(web.classify(type(`token: ${token}`), { url: 'https://notes.example/', target: { role: 'textbox', name: 'Notes', editable: true } })), 'sensitive_data', `web ${label}`)
    assert.equal(judged(desktop.classify(type(token), { frontmostBundleId: FIXTURE, target: notes })), 'sensitive_data', `desktop ${label}`)
  }
})

test('CU-257 negatives: short words, prose and file names with the same prefixes stay free', () => {
  for (const text of ['gh_pages branch', 'ghs_config', 'AIza is a prefix Google uses', 'hf_model.bin', 'npm_config_cache', 'glpat-short', 'xoxa-1', 'shpat_ token example', j('AI', 'za', ALNUM.slice(0, 20)), 'xapp-short', 'SG.example', 'rk_live_', 'see SG. above']) {
    assert.equal(looksSensitive(text), null, text)
    assert.equal(judged(desktop.classify(type(text), { frontmostBundleId: FIXTURE, target: notes })), 'allow', `desktop ${text}`)
  }
})
