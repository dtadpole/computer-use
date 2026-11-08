/** Deliberately broken builds this verifier must fail on, applied to a /tmp copy by prove-failing.mjs. */

const CONTROL = '_tools_/agent-core/control.mjs'

export const MUTANTS = Object.freeze([
  { name: 'pause-ignored', why: 'pause is acknowledged but the run keeps running', mutations: [{ file: CONTROL, find: "        pausedBy = source\n        setState('paused', source)\n", replace: '        pausedBy = source\n' }] },
  { name: 'take-over-ignored', why: 'take over is acknowledged but the agent keeps control', mutations: [{ file: CONTROL, find: "      case 'take_over':\n        setState('taken_over', source)\n", replace: "      case 'take_over':\n" }] },
  { name: 'hand-back-ignored', why: 'hand back is acknowledged but the agent never resumes', mutations: [{ file: CONTROL, find: "        setState(pending.size > 0 ? 'awaiting_consent' : 'running', source)\n", replace: '' }] },
  {
    name: 'input-without-takeover',
    why: "the live view forwards a person's input while the agent is running",
    mutations: [{ file: '_tools_/live-view/server.mjs', find: "        if (control.humanMayAct?.() !== true) return send(res, 409, { ok: false, state: control.state, error: 'not_taken_over' })\n", replace: '' }],
  },
])
