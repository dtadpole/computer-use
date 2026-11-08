import assert from 'node:assert/strict'
import { test } from 'node:test'

import { IMAGE_BUDGET, RESEND_LIMITS, countImages, createClaudeGatewayAdapter, isThinkingRejection } from '../../_tools_/agent-core/adapter-claude.mjs'

// CU-84, option B: an operator may allow the CU-65 prune while thinking is present, for an account proven not to
// enforce the preserved-thinking check. The safety net: if the API refuses a new cut for its thinking, the turn is sent
// again with the last cut the API accepted, once, and pruning stops for the session - a wrong 'allow' never ends a run.

const PNG = { data: Buffer.from('png-bytes'), mimeType: 'image/png', width: 1440, height: 900 }
const THINKING = { type: 'thinking', thinking: '', signature: 'sig' }
const REJECT = 'messages.3.content.0: Invalid `signature` in `thinking` block. The block is bound to a different conversation.'

async function drive(turns, { pruneWithThinking, reject = () => null, png = PNG } = {}) {
  const calls = []
  let n = 0
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body)
    calls.push(body)
    const refusal = reject(body, calls.length)
    if (refusal) return { ok: false, status: refusal.status, json: async () => ({ error: { type: refusal.type ?? 'invalid_request_error', message: refusal.message } }) }
    const reply = { stop_reason: 'tool_use', usage: { input_tokens: 10, output_tokens: 5 }, content: [THINKING, { type: 'tool_use', id: `t${n}`, name: 'left_click', toolset_name: 'computer', input: { coordinate: [10, 10] } }] }
    n += 1
    return { ok: true, status: 200, json: async () => reply }
  }
  const adapter = createClaudeGatewayAdapter({ model: 'claude-sonnet-5-5', fetch, readKey: () => 'k', retryDelays: [], ...(pruneWithThinking ? { pruneWithThinking } : {}) })
  const session = await adapter.open({ instructions: 'x', task: 'long' })
  const out = [await session.next({ task: 'long', screenshot: png })]
  for (let i = 1; i < turns; i += 1) out.push(await session.next({ results: [{ status: 'done', type: 'click' }], screenshot: png }))
  return { calls, turns: out, adapter }
}

test("'allow' prunes past the ceiling although every turn carries thinking; the setting is exposed for run.json", async () => {
  const { turns, adapter } = await drive(IMAGE_BUDGET.ceiling + 1, { pruneWithThinking: 'allow' })
  assert.deepEqual(turns.at(-1).context, { images: IMAGE_BUDGET.keep, removed: IMAGE_BUDGET.ceiling + 1 - IMAGE_BUDGET.keep })
  assert.deepEqual(adapter.settings, { pruneWithThinking: 'allow' })
})

test('the default exposes no settings and skips the prune (the fail-safe)', async () => {
  const { turns, adapter } = await drive(IMAGE_BUDGET.ceiling + 1)
  assert.equal(adapter.settings, undefined)
  assert.equal(turns.at(-1).context.pruneSkipped, 'thinking')
})

test('a cut the API refuses for its thinking is sent again with the last accepted cut, once, and pruning stops', async () => {
  const pruned = (body) => countImages(body.messages) < body.messages.filter((m) => m.role === 'user').length
  const { calls, turns } = await drive(IMAGE_BUDGET.ceiling + 6, { pruneWithThinking: 'allow', reject: (body) => (pruned(body) ? { status: 400, message: REJECT } : null) })
  assert.equal(calls.length, IMAGE_BUDGET.ceiling + 6 + 1, 'exactly one extra request: the refused one')
  assert.equal(countImages(calls.at(-1).messages), IMAGE_BUDGET.ceiling + 6, 'every later request carries every image')
  assert.deepEqual(turns[IMAGE_BUDGET.ceiling].context, { images: IMAGE_BUDGET.ceiling + 1, removed: 0, pruneSkipped: 'thinking_rejected', pruneRejection: REJECT })
  // The resent body is the last accepted request plus this turn, byte for byte (cache breakpoints aside).
  const strip = (messages) => JSON.stringify(messages, (key, value) => (key === 'cache_control' ? undefined : value))
  const accepted = calls[IMAGE_BUDGET.ceiling - 1]
  const resent = calls[IMAGE_BUDGET.ceiling + 1]
  assert.equal(strip(resent.messages.slice(0, accepted.messages.length)), strip(accepted.messages))
  assert.equal(turns.at(-1).context.pruneSkipped, 'thinking_rejected')
})

test('another 400 on a pruned request is not swallowed; a bad setting is refused', async () => {
  const pruned = (body) => countImages(body.messages) < body.messages.filter((m) => m.role === 'user').length
  await assert.rejects(drive(IMAGE_BUDGET.ceiling + 1, { pruneWithThinking: 'allow', reject: (body) => (pruned(body) ? { status: 400, message: 'max_tokens: too large' } : null) }), /gateway answered 400/)
  assert.throws(() => createClaudeGatewayAdapter({ model: 'claude-sonnet-5-5', pruneWithThinking: 'yes' }), /pruneWithThinking is 'skip' or 'allow'/)
})

test('a refused second cut is sent again with the first, accepted cut - never with none, which would edit thinking too', async () => {
  const first = IMAGE_BUDGET.ceiling + 1 - IMAGE_BUDGET.keep
  const placeholders = (body) => body.messages.filter((m) => m.role === 'user').length - countImages(body.messages)
  const turns = 2 * IMAGE_BUDGET.ceiling - IMAGE_BUDGET.keep + 2
  const { calls, turns: out } = await drive(turns, { pruneWithThinking: 'allow', reject: (body) => (placeholders(body) > first ? { status: 400, message: REJECT } : null) })
  assert.equal(out.at(-1).context.removed, first, 'the accepted cut stays')
  assert.equal(out.at(-1).context.pruneSkipped, 'thinking_rejected')
  assert.equal(placeholders(calls.at(-1)), first)
  assert.equal(calls.length, turns + 1)
})

test('only the thinking rejection by type and words is resent: a schema 400 or another error type is thrown as before', async () => {
  const pruned = (body) => countImages(body.messages) < body.messages.filter((m) => m.role === 'user').length
  for (const refusal of [{ status: 400, message: '[host]: Extra inputs are not permitted' }, { status: 400, type: 'api_error', message: REJECT }]) {
    await assert.rejects(drive(IMAGE_BUDGET.ceiling + 1, { pruneWithThinking: 'allow', reject: (body) => (pruned(body) ? refusal : null) }), /gateway answered 400/, JSON.stringify(refusal))
  }
  assert.equal(isThinkingRejection(Object.assign(new Error('x'), { status: 400, apiType: 'invalid_request_error', detail: 'thinking block prefix changed' })), true)
  assert.equal(isThinkingRejection(Object.assign(new Error('x'), { status: 400, apiType: 'invalid_request_error', detail: 'signature of image' })), false)
})

test('when the unpruned resend would pass the size limit the run ends with a named outcome, not a second 400', async () => {
  // Frames that fit the ceiling's worth of images under the size limit (CU-91 sends no request past it), so the 31st
  // screenshot is the one that would carry the unpruned resend past it.
  const raw = Math.floor((RESEND_LIMITS.bytes / IMAGE_BUDGET.ceiling) * 0.99 * 0.75)
  const big = { ...PNG, data: Buffer.alloc(raw) }
  const pruned = (body) => countImages(body.messages) < body.messages.filter((m) => m.role === 'user').length
  await assert.rejects(drive(IMAGE_BUDGET.ceiling + 1, { pruneWithThinking: 'allow', png: big, reject: (body) => (pruned(body) ? { status: 400, message: REJECT } : null) }), { code: 'thinking_rejected_over_cap' })
})

