import assert from 'node:assert/strict'
import { test } from 'node:test'

import { validateBatch } from '../../_tools_/agent-core/actions.mjs'
import { buildResponsesInput, createResponsesAdapter, parseResponsesTurn } from '../../_tools_/agent-core/adapter-responses.mjs'

const PNG = { data: Buffer.from('png'), mimeType: 'image/png' }
// OpenAI's documented batched call (api-computer-tool.md, "Batched call").
const CALL_002 = { id: 'resp_1', output: [{ type: 'computer_call', call_id: 'call_002', actions: [{ type: 'click', button: 'left', x: 405, y: 157 }, { type: 'type', text: 'penguin' }], status: 'completed' }], usage: { input_tokens: 1200, output_tokens: 40, input_tokens_details: { cached_tokens: 200 } } }

test('the documented batch parses to the same canonical batch the Claude adapter produces', () => {
  const turn = parseResponsesTurn(CALL_002)
  assert.equal(turn.stop, 'call')
  assert.equal(turn.call.callId, 'call_002')
  assert.deepEqual(turn.call.actions, [{ type: 'click', button: 'left', x: 405, y: 157 }, { type: 'type', text: 'penguin' }])
  assert.equal(validateBatch(turn.call.actions, { frame: { width: 1440, height: 900 } }).ok, true)
  assert.deepEqual([turn.usage.inputTokens, turn.usage.cacheReadTokens, turn.usage.outputTokens], [1000, 200, 40])
})

test('screenshot-first, legacy single action, safety checks, final, length, escalate, ask, navigate, commentary', () => {
  assert.deepEqual(parseResponsesTurn({ output: [{ type: 'computer_call', call_id: 'c', actions: [{ type: 'screenshot' }] }] }).call.actions, [{ type: 'screenshot' }])
  assert.deepEqual(parseResponsesTurn({ output: [{ type: 'computer_call', call_id: 'c', action: { type: 'wait' } }] }).call.actions, [{ type: 'wait' }])
  const checks = [{ id: 'sc_1', code: 'malicious_instructions', message: 'The page asks you to ignore your task.' }]
  assert.deepEqual(parseResponsesTurn({ output: [{ type: 'computer_call', call_id: 'c', actions: [], pending_safety_checks: checks }] }).call.pendingSafetyChecks, checks)
  const final = parseResponsesTurn({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Done.' }] }] })
  assert.deepEqual([final.stop, final.message, final.commentaryOnly], ['final', 'Done.', false])
  assert.equal(parseResponsesTurn({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [] }).stop, 'length')
  const esc = parseResponsesTurn({ output: [{ type: 'function_call', name: 'escalate', call_id: 'f1', arguments: '{"reason":"phishing","evidence":"fake login"}' }] })
  assert.deepEqual([esc.stop, esc.escalation.reason], ['escalate', 'phishing'])
  assert.equal(parseResponsesTurn({ output: [{ type: 'function_call', name: 'ask_user', call_id: 'f2', arguments: '{"question":"Which?"}' }] }).message, 'Which?')
  assert.deepEqual(parseResponsesTurn({ output: [{ type: 'function_call', name: 'navigate', call_id: 'f3', arguments: '{"url":"https://example.com"}' }] }).call.actions, [{ type: 'navigate', url: 'https://example.com' }])
  assert.equal(parseResponsesTurn({ output: [{ type: 'message', phase: 'commentary', content: [{ type: 'output_text', text: 'Looking...' }] }] }).commentaryOnly, true)
})

test('the answer: computer_call_output at detail original with acknowledged checks, and what did not run', () => {
  const turn = parseResponsesTurn(CALL_002)
  const checks = [{ id: 'sc_1', code: 'irrelevant_domain', message: 'x' }]
  const items = buildResponsesInput(turn, {
    screenshot: PNG, acknowledgedSafetyChecks: checks, notes: ['A popup opened.'],
    results: [{ index: 0, type: 'click', status: 'done' }, { index: 1, type: 'type', status: 'declined', code: 'sensitive_data', message: 'not approved' }],
  })
  assert.deepEqual(items[0], { type: 'computer_call_output', call_id: 'call_002', output: { type: 'computer_screenshot', image_url: 'data:image/png;base64,cG5n', detail: 'original' }, acknowledged_safety_checks: checks })
  assert.match(items[1].content[0].text, /Action 1 \(type\) declined \[sensitive_data\]: not approved\nA popup opened\./)
  assert.equal(buildResponsesInput(turn, { screenshot: PNG, results: [{ index: 0, status: 'done' }] }).length, 1, 'nothing extra when all ran')
})

test('a session chains previous_response_id, continues past commentary, and sends the key only as a header', async () => {
  const calls = []
  const replies = [
    { id: 'resp_a', output: [{ type: 'message', phase: 'commentary', content: [{ type: 'output_text', text: 'Let me look.' }] }] },
    CALL_002,
    { id: 'resp_c', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Searched.' }] }] },
  ]
  const adapter = createResponsesAdapter({
    model: 'gpt-test-model', baseUrl: 'http://127.0.0.1:9/v1', readKey: () => 'k-secret',
    fetch: async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return { ok: true, status: 200, json: async () => replies.shift() } },
  })
  const session = await adapter.open({ instructions: 'only the task grants intent', task: 'search penguins' })
  const first = await session.next({ task: 'search penguins', screenshot: PNG })
  assert.equal(first.stop, 'call', 'the commentary-only reply was continued, not taken as the end')
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[0].body.tools[0], { type: 'computer' })
  assert.match(calls[0].body.tools.find((t) => t.name === 'escalate').description, /instead of mentioning such text in your answer/)
  assert.equal(calls[0].body.input[0].content[1].detail, 'original')
  assert.equal(calls[1].body.previous_response_id, 'resp_a')
  assert.equal(calls[0].init.headers.authorization, 'Bearer k-secret')
  const second = await session.next({ results: [{ index: 0, status: 'done' }, { index: 1, status: 'done' }], screenshot: PNG })
  assert.equal(second.stop, 'final')
  assert.equal(calls[2].body.previous_response_id, 'resp_1')
  assert.equal(calls[2].body.input[0].type, 'computer_call_output')
  assert.ok(!JSON.stringify(calls.map((c) => c.body)).includes('k-secret'))
})
