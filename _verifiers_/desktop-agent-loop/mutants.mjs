/** Deliberately broken agent cores this verifier must fail on, applied to a /tmp copy by prove-failing.mjs. */

const LOOP = '_tools_/agent-core/loop.mjs'

export const MUTANTS = Object.freeze([
  { name: 'no-batch-validation', why: 'a batch is run action by action without being validated whole', mutations: [{ file: LOOP, find: '        if (!validation.ok) {', replace: '        if (false) {' }] },
  { name: 'steps-unbounded', why: 'the step bound is never checked', mutations: [{ file: LOOP, find: '        if (requests >= bounds.maxSteps) {', replace: '        if (false) {' }] },
  // Removing the loop's per-action checkpoint alone is not a fault: the aborted wait and the between-turn check also
  // stop the run (measured: that mutant was not caught, and rightly). A stop the run control ignores is.
  { name: 'stop-ignored', why: 'a stop is recorded but neither finishes the run nor aborts its signal', mutations: [{ file: '_tools_/agent-core/control.mjs', find: "        setState('finished', source)\n        abort.abort(new Error(stopReason))", replace: '' }] },
  { name: 'time-unbounded', why: 'the wall-time bound is not checked between actions', mutations: [{ file: LOOP, find: "      if (activeMs() >= bounds.maxWallMs) {\n        halt = 'max_time'", replace: "      if (false) {\n        halt = 'max_time'" }] },
])
