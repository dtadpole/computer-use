import assert from 'node:assert/strict'
import { test } from 'node:test'

import { IMAGE_BUDGET, RESEND_LIMITS, createClaudeGatewayAdapter, imageBytes } from '../../_tools_/agent-core/adapter-claude.mjs'

// CU-91 (a CU-84 follow-up): without pruning every screenshot rides in every request; one past the per-request image
// cap or size limit is never sent - the run ends with a named context_full instead of the API's 400.

const PNG = { data: Buffer.from('png-bytes'), mimeType: 'image/png', width: 1440, height: 900 }
const THINKING = { type: 'thinking', thinking: '', signature: 'sig' }

async function drive(turns, { thinking = true, png = PNG } = {}) {
  const calls = []
  let n = 0
  const fetch = async (url, init) => {
    calls.push(JSON.parse(init.body))
    const reply = { stop_reason: 'tool_use', usage: { input_tokens: 10, output_tokens: 5 }, content: [...(thinking ? [THINKING] : []), { type: 'tool_use', id: `t${n}`, name: 'left_click', toolset_name: 'computer', input: { coordinate: [10, 10] } }] }
    n += 1
    return { ok: true, status: 200, json: async () => reply }
  }
  const adapter = createClaudeGatewayAdapter({ model: 'claude-sonnet-5-5', fetch, readKey: () => 'k', retryDelays: [] })
  const session = await adapter.open({ instructions: 'x', task: 'long' })
  let error = null
  try {
    await session.next({ task: 'long', screenshot: png })
    for (let i = 1; i < turns; i += 1) await session.next({ results: [{ status: 'done', type: 'click' }], screenshot: png })
  } catch (caught) {
    error = caught
  }
  return { calls, error }
}

test(`with thinking and no pruning, request ${RESEND_LIMITS.images + 1} is never sent: the run ends context_full`, async () => {
  const { calls, error } = await drive(RESEND_LIMITS.images + 5)
  assert.equal(calls.length, RESEND_LIMITS.images, 'the fake gateway saw exactly the requests within the cap')
  assert.equal(error?.code, 'context_full')
  assert.match(error.message, /101 screenshots .* nothing was sent/)
})

test('the size half trips the same way with large frames', async () => {
  const big = { ...PNG, data: Buffer.alloc(1_500_000) }
  const perImage = Buffer.alloc(1_500_000).toString('base64').length
  const fits = Math.floor(RESEND_LIMITS.bytes / perImage)
  const { calls, error } = await drive(fits + 3, { png: big })
  assert.equal(calls.length, fits)
  assert.equal(error?.code, 'context_full')
})

test('a run that prunes (no thinking) never trips it; imageBytes counts tool_result images too', async () => {
  const { calls, error } = await drive(RESEND_LIMITS.images + 5, { thinking: false })
  assert.equal(error, null)
  assert.equal(calls.length, RESEND_LIMITS.images + 5)
  assert.ok(calls.every((body) => body.messages.length > 0))
  assert.equal(imageBytes([{ role: 'user', content: [{ type: 'tool_result', content: [{ type: 'image', source: { data: 'abcd' } }] }, { type: 'image', source: { data: 'xy' } }] }]), 6)
  assert.ok(IMAGE_BUDGET.ceiling < RESEND_LIMITS.images)
})
