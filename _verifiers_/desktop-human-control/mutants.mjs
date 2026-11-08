/** Deliberately broken builds this verifier must fail on, applied to a /tmp copy by prove-failing.mjs. */

const ENV = '_environments_/macos-desktop/environment.mjs'

export const MUTANTS = Object.freeze([
  { name: 'local-input-resumes', why: 'the person\'s own input can resume the agent (C4 allows it only to pause)', mutations: [{ file: '_tools_/agent-core/control.mjs', find: "  resume: ['caller', 'control', 'api', 'tty'],", replace: "  resume: ['caller', 'control', 'api', 'tty', 'local_input']," }] },
  { name: 'no-pause-request', why: 'the driver stops its input but never pauses the run', mutations: [{ file: ENV, find: "      this.control?.send?.({ command: 'pause', reason: 'local input on the Mac' }, { source: 'local_input' })", replace: '      void 0' }] },
  { name: 'stop-never-clears', why: 'after a person resumes, the driver still refuses every input', mutations: [{ file: ENV, find: '        this.localInputAt = null\n        this.secureInput = false', replace: '        this.secureInput = false' }] },
  { name: 'view-can-take-over', why: 'the watch-only link can take the run over', mutations: [{ file: '_tools_/agent-core/control.mjs', find: "  take_over: ['control', 'api'],", replace: "  take_over: ['control', 'api', 'view']," }] },
  { name: 'acts-while-taken-over', why: 'the agent keeps acting while a person has taken over', mutations: [{ file: '_tools_/agent-core/control.mjs', find: "      if (state === 'running') return Promise.resolve(true)", replace: "      if (state === 'running' || state === 'taken_over') return Promise.resolve(true)" }] },
  { name: 'no-screencast', why: 'the live view never asks for frames, so nobody can watch', mutations: [{ file: '_tools_/live-view/server.mjs', find: 'environment.startScreencast({ ...screencast, onFrame })', replace: 'Promise.resolve(() => {})' }] },
  { name: 'view-can-consent', why: 'the watch-only link can approve an app or a consequential step', mutations: [{ file: '_tools_/agent-core/control.mjs', find: "  consent: ['control', 'api', 'tty', 'dsh_plugin'],", replace: "  consent: ['control', 'api', 'tty', 'dsh_plugin', 'view']," }] },
  { name: 'stop-outlives-wait', why: 'local input while waiting for consent sets the driver\'s stop, which then refuses every later action with no pause to resume', mutations: [{ file: '_environments_/macos-desktop/environment.mjs', find: "    if (state === undefined || state === 'running') this.localInputAt = at", replace: '    this.localInputAt = at' }] },
  { name: 'settle-every-input', why: 'the driver asks to settle on every input after a resume, wearing down the idle guard', mutations: [{ file: '_environments_/macos-desktop/environment.mjs', find: '    this.#settlePending = false', replace: '    void 0' }] },
  { name: 'no-settle-after-resume', why: 'the first input after a person resumes does not settle, so the resume loop comes back', mutations: [{ file: '_environments_/macos-desktop/environment.mjs', find: '      if (SETTLE_AFTER.includes(event.prior)) this.#settlePending = true', replace: '      if (false) this.#settlePending = true' }] },
])
