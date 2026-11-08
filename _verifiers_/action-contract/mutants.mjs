/** Deliberately broken builds this verifier must fail on, applied to a /tmp copy by prove-failing.mjs. */

const PLAN = '_environments_/chrome-browser/input-plan.mjs'

export const MUTANTS = Object.freeze([
  {
    name: 'batch-partial',
    why: 'validation keeps the valid actions of a refused batch and drops the bad ones, so the valid click runs',
    mutations: [{ file: '_tools_/agent-core/actions.mjs', find: '  if (problems.length === 0) return { ok: true, actions: normalised, warnings }', replace: '  if (normalised.length > 0) return { ok: true, actions: normalised, warnings }' }],
  },
  { name: 'modifiers-held', why: 'held keys are pressed but never released', mutations: [{ file: PLAN, find: '  return [...down, ...build(total), ...up]', replace: '  return [...down, ...build(total)]' }] },
  {
    name: 'drag-without-button',
    why: 'a drag moves with no button held',
    mutations: [{ file: PLAN, find: "steps.push(mouse('mouseMoved', at, { button: 'left', buttons: 1, modifiers }))", replace: "steps.push(mouse('mouseMoved', at, { button: 'none', buttons: 0, modifiers }))" }],
  },
  { name: 'right-is-left', why: 'the right button is sent as the left one', mutations: [{ file: PLAN, find: "  right: { button: 'right', bit: 2 },", replace: "  right: { button: 'left', bit: 1 }," }] },
])
