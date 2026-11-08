/** Deliberately broken builds this verifier must fail on, applied to a /tmp copy by prove-failing.mjs. */

const TOOLS = '_tools_/computer-use-mcp/tools.mjs'

export const MUTANTS = Object.freeze([
  {
    name: 'control-leaks-take-over',
    why: 'the caller is offered take_over through computer_use_control',
    mutations: [{ file: TOOLS, find: "export const CALLER_COMMANDS = Object.freeze(['pause', 'resume', 'stop', 'guide'])", replace: "export const CALLER_COMMANDS = Object.freeze(['pause', 'resume', 'stop', 'guide', 'take_over'])" }],
  },
  {
    name: 'approval-not-refused-by-name',
    why: 'respond no longer refuses approved and lifetime by name',
    mutations: [{ file: TOOLS, find: "  for (const name of ['approved', 'lifetime']) {", replace: '  for (const name of []) {' }],
  },
  {
    name: 'no-exit-on-stdin-close',
    why: 'the server keeps running after the calling session closes its stdin',
    mutations: [{ file: '_tools_/computer-use-mcp/server.mjs', find: '  await manager.shutdown()\n  await Promise.race(', replace: '  await new Promise(() => {})\n  await manager.shutdown()\n  await Promise.race(' }],
  },
])
