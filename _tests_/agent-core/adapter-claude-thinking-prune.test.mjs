import assert from 'node:assert/strict'
import { test } from 'node:test'

import { IMAGE_BUDGET, countImages, createClaudeGatewayAdapter, hasThinking } from '../../_tools_/agent-core/adapter-claude.mjs'

// CU-84 (cu-coordinator's fail-safe): a prune never edits the prefix of a thinking block, because models with the
// preserved-thinking check may answer with a 400. While any assistant turn carries thinking no new cut is made and the
// turn records pruneSkipped 'thinking'; a cut made before any thinking stays as it was sent.

const PNG = { data: Buffer.from('png-bytes'), mimeType: 'image/png', width: 1440, height: 900 }
const THINKING = { type: 'thinking', thinking: '', signature: 'sig' }
/** A toolset model by local-config alias (local-config.mjs), so no real model id is named here. */
const LOCAL = { models: { 'model-a': { id: 'claude-test-model', toolset: true } } }

/** Drive `turns` requests; replies carry a thinking block from turn `thinkFrom` on (never when null). */
async function drive(turns, thinkFrom) {
  const calls = []
  const reply = (i) => ({ stop_reason: 'tool_use', usage: { input_tokens: 10, output_tokens: 5 }, content: [...(thinkFrom !== null && i >= thinkFrom ? [THINKING] : []), { type: 'tool_use', id: `t${i}`, name: 'left_click', toolset_name: 'computer', input: { coordinate: [10, 10] } }] })
  let n = 0
  const fetch = async (url, init) => { calls.push(JSON.parse(init.body)); const body = reply(n); n += 1; return { ok: true, status: 200, json: async () => body } }
  const adapter = createClaudeGatewayAdapter({ model: 'model-a', config: LOCAL, fetch, readKey: () => 'k', retryDelays: [] })
  const session = await adapter.open({ instructions: 'x', task: 'long' })
  const out = [await session.next({ task: 'long', screenshot: PNG })]
  for (let i = 1; i < turns; i += 1) out.push(await session.next({ results: [{ status: 'done', type: 'click' }], screenshot: PNG }))
  return { calls, turns: out }
}

test('with thinking from the first turn no request is ever pruned; each turn past the ceiling says the prune was skipped', async () => {
  const { calls, turns } = await drive(IMAGE_BUDGET.ceiling + 6, 0)
  calls.forEach((body, i) => assert.equal(countImages(body.messages), i + 1, `request ${i + 1} carries every image`))
  assert.deepEqual(turns.at(-1).context, { images: IMAGE_BUDGET.ceiling + 6, removed: 0, pruneSkipped: 'thinking' })
  assert.equal(turns[IMAGE_BUDGET.ceiling - 1].context.pruneSkipped, undefined, 'at the ceiling nothing was due')
})

test('a cut made before any thinking stays as sent; no further cut once thinking appears', async () => {
  const { calls, turns } = await drive(IMAGE_BUDGET.ceiling + 25, IMAGE_BUDGET.ceiling + 3)
  const cut = IMAGE_BUDGET.ceiling + 1 - IMAGE_BUDGET.keep
  assert.equal(turns[IMAGE_BUDGET.ceiling].context.removed, cut, 'the first prune happened before thinking')
  assert.equal(turns.at(-1).context.removed, cut, 'the cut never moves after thinking appeared')
  assert.equal(turns.at(-1).context.pruneSkipped, 'thinking')
  assert.equal(countImages(calls.at(-1).messages), IMAGE_BUDGET.ceiling + 25 - cut)
})

test('without thinking the CU-65 prune is unchanged', async () => {
  const { turns } = await drive(IMAGE_BUDGET.ceiling + 1, null)
  assert.deepEqual(turns.at(-1).context, { images: IMAGE_BUDGET.keep, removed: IMAGE_BUDGET.ceiling + 1 - IMAGE_BUDGET.keep })
})

test('hasThinking sees thinking and redacted_thinking in assistant turns only', () => {
  assert.equal(hasThinking([{ role: 'assistant', content: [{ type: 'redacted_thinking', data: 'x' }] }]), true)
  assert.equal(hasThinking([{ role: 'user', content: [{ type: 'thinking' }] }, { role: 'assistant', content: [{ type: 'text', text: 'hi' }] }]), false)
})
