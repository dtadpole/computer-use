/** Deliberately broken builds this verifier must fail on, applied to a /tmp copy by prove-failing.mjs. */

const LOOP = '_tools_/agent-core/loop.mjs'

export const MUTANTS = Object.freeze([
  { name: 'steps-unbounded', why: 'the step bound is never checked', mutations: [{ file: LOOP, find: '        if (requests >= bounds.maxSteps) {\n', replace: '        if (false) {\n' }] },
  {
    name: 'cost-ignored',
    why: 'the cost bound is never checked',
    mutations: [{ file: LOOP, find: 'if (costKnown ? usage.costUsd >= bounds.maxCostUsd : usage.inputTokens + usage.outputTokens >= bounds.maxTokens) {', replace: 'if (false) {' }],
  },
  {
    name: 'stop-ignored',
    why: 'stop is acknowledged but neither finishes the run nor aborts it',
    mutations: [{ file: '_tools_/agent-core/control.mjs', find: "        setState('finished', source)\n        abort.abort(new Error(stopReason))\n", replace: '' }],
  },
  {
    name: 'parse-right-as-left',
    why: 'the Claude adapter maps left_click to the right button',
    mutations: [{ file: '_tools_/agent-core/adapter-claude.mjs', find: "    case 'left_click': return withKeys({ type: 'click', button: 'left', ...xy })", replace: "    case 'left_click': return withKeys({ type: 'click', button: 'right', ...xy })" }],
  },
  {
    name: 'responses-drops-batch',
    why: 'the Responses adapter keeps only the first action of a batched computer_call',
    mutations: [{ file: '_tools_/agent-core/adapter-responses.mjs', find: '    const actions = Array.isArray(computer.actions) ? computer.actions : computer.action ? [computer.action] : []', replace: '    const actions = Array.isArray(computer.actions) ? computer.actions.slice(0, 1) : computer.action ? [computer.action] : []' }],
  },
])
