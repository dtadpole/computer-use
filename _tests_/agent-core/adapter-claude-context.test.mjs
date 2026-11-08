import assert from 'node:assert/strict'
import { test } from 'node:test'

import { IMAGE_BUDGET, IMAGE_PLACEHOLDER, countImages, createClaudeGatewayAdapter, withoutOldestImages } from '../../_tools_/agent-core/adapter-claude.mjs'

// CU-65 (long-task-context.md): past IMAGE_BUDGET.ceiling images in a request, the oldest are replaced by a placeholder
// until IMAGE_BUDGET.keep remain - rarely, so the cached prefix stays stable between prunes. Text is never removed,
// the kept history (and so the transcript) is unchanged, and below the ceiling the request is today's.

const PNG = { data: Buffer.from('png-bytes'), mimeType: 'image/png', width: 1440, height: 900 }
const REFUSAL = 'Blocked by policy: a window of an app this run never acts in covers that point, so it was not sent.'

const reply = (i) => ({ status: 200, body: { stop_reason: 'tool_use', usage: { input_tokens: 10, output_tokens: 5 }, content: [{ type: 'tool_use', id: `t${i}`, name: 'left_click', toolset_name: 'computer', input: { coordinate: [1, 1] } }] } })

/** Drive a session for `turns` requests; turn 2's result is a policy refusal, every other result is done. */
async function drive(turns) {
  const calls = []
  const responses = Array.from({ length: turns }, (_, i) => reply(i))
  const fetch = async (url, init) => { calls.push(JSON.parse(init.body)); const next = responses.shift(); return { ok: true, status: 200, json: async () => next.body } }
  const adapter = createClaudeGatewayAdapter({ model: 'claude-sonnet-5-5', fetch, readKey: () => 'k', retryDelays: [] })
  const session = await adapter.open({ instructions: 'x', task: 'a long task' })
  const turnsOut = [await session.next({ task: 'a long task', screenshot: PNG })]
  for (let i = 1; i < turns; i += 1) {
    const result = i === 2 ? { status: 'blocked', type: 'click', message: REFUSAL } : { status: 'done', type: 'click' }
    turnsOut.push(await session.next({ results: [result], screenshot: PNG }))
  }
  return { calls, turns: turnsOut, session }
}

const texts = (messages) => messages.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).flatMap((b) => (b.type === 'tool_result' ? b.content : [b])).filter((b) => b.type === 'text').map((b) => b.text)
const placeholders = (messages) => texts(messages).filter((t) => t === IMAGE_PLACEHOLDER).length
const breakpointOnNewest = (messages) => {
  const last = messages.at(-1)
  const results = last.content.filter((b) => b.type === 'tool_result')
  const target = results.length > 0 ? results.at(-1) : last.content.at(-1)
  return target.cache_control?.type === 'ephemeral'
}

test('at or below the ceiling nothing is removed: every image stays, no placeholder', async () => {
  const { calls, turns } = await drive(IMAGE_BUDGET.ceiling)
  calls.forEach((body, i) => {
    assert.equal(countImages(body.messages), i + 1)
    assert.equal(placeholders(body.messages), 0)
  })
  assert.deepEqual(turns.at(-1).context, { images: IMAGE_BUDGET.ceiling, removed: 0 })
})

test('past the ceiling exactly the newest images remain, a placeholder in each removed place, no text removed', async () => {
  const { calls, turns, session } = await drive(IMAGE_BUDGET.ceiling + 1)
  const body = calls.at(-1)
  const removed = IMAGE_BUDGET.ceiling + 1 - IMAGE_BUDGET.keep
  assert.equal(countImages(body.messages), IMAGE_BUDGET.keep)
  assert.equal(placeholders(body.messages), removed)
  assert.deepEqual(turns.at(-1).context, { images: IMAGE_BUDGET.keep, removed })
  // Every text of the full history is still there - the task, every result, and the policy refusal.
  const full = texts(calls.at(-1).messages).filter((t) => t !== IMAGE_PLACEHOLDER)
  assert.ok(full.includes('a long task'))
  assert.ok(full.some((t) => t.includes(REFUSAL)), 'the refusal survives the prune')
  // ...and exactly the texts of the full history, which the transcript keeps (its last entry is the reply to this request).
  assert.deepEqual(full, texts(session.transcript().slice(0, -1)))
  assert.ok(breakpointOnNewest(body.messages), 'the cache breakpoint stays on the newest result')
  // The kept history - and so the transcript - still has every image (as redacted stubs), no placeholder.
  const transcript = JSON.stringify(session.transcript())
  assert.equal(transcript.includes(IMAGE_PLACEHOLDER), false)
  assert.equal((transcript.match(/"omitted":true/g) ?? []).length, IMAGE_BUDGET.ceiling + 1)
})

test('between prunes the removed prefix is stable (cache-friendly); the next prune comes only at the ceiling again', async () => {
  const total = IMAGE_BUDGET.ceiling + 1 + (IMAGE_BUDGET.ceiling - IMAGE_BUDGET.keep) + 1
  const { calls, turns } = await drive(total)
  const first = IMAGE_BUDGET.ceiling // index of the first pruned request
  const removedAt = (i) => turns[i].context.removed
  for (let i = first; i < total - 1; i += 1) assert.equal(removedAt(i), removedAt(first), `request ${i + 1} keeps the same cut`)
  assert.ok(removedAt(total - 1) > removedAt(first), 'the second prune')
  assert.equal(turns.at(-1).context.images, IMAGE_BUDGET.keep)
  // The pruned prefix is byte-identical from one request to the next until the second prune.
  const prefix = (body, n) => JSON.stringify(body.messages.slice(0, n).map((m) => ({ ...m, content: Array.isArray(m.content) ? m.content.map(({ cache_control, ...b }) => b) : m.content })))
  for (let i = first + 1; i < total - 1; i += 1) assert.equal(prefix(calls[i], calls[first].messages.length - 1), prefix(calls[first], calls[first].messages.length - 1))
})

test('withoutOldestImages replaces top-level and tool_result images in order and never touches its input', () => {
  const img = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AA==' } }
  const messages = [
    { role: 'user', content: [{ type: 'text', text: 'task' }, img] },
    { role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'a', content: [{ type: 'text', text: 'done' }, img] }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'b', is_error: true, content: [{ type: 'text', text: REFUSAL }] }, { type: 'text', text: 'Screenshot after the batch:' }, img] },
  ]
  const before = JSON.stringify(messages)
  const view = withoutOldestImages(messages, 2)
  assert.equal(JSON.stringify(messages), before, 'the input is unchanged')
  assert.equal(countImages(view), 1)
  assert.equal(view[0].content[1].text, IMAGE_PLACEHOLDER)
  assert.equal(view[2].content[0].content[1].text, IMAGE_PLACEHOLDER)
  assert.equal(view[3], messages[3], 'untouched messages are shared, not copied')
  assert.equal(withoutOldestImages(messages, 0), messages)
})
