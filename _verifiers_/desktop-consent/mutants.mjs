/** Deliberately broken agent cores this verifier must fail on, applied to a /tmp copy by prove-failing.mjs. */

const POLICY = '_tools_/agent-core/app-policy.mjs'
const LOOP = '_tools_/agent-core/loop.mjs'

export const MUTANTS = Object.freeze([
  { name: 'exclusion-ignored', why: 'an excluded app under the pointer is treated like any other app', mutations: [{ file: POLICY, find: '    if (aimed?.excluded) {', replace: '    if (false) {' }] },
  { name: 'every-app-approved', why: 'an app outside the run\'s scope is used without asking', mutations: [{ file: POLICY, find: '      if (!approved(bundleId)) {', replace: '      if (false) {' }] },
  { name: 'consequence-ignored', why: 'the action classes are skipped, so a Delete button is clicked without asking', mutations: [{ file: POLICY, find: "    const verdict = classes.classify(action, { ...context, url: 'desktop://', target, dialog: context.dialog ?? null })", replace: "    const verdict = { decision: 'allow', class: null, classes: [], rule: 'mutant', reason: 'mutant' }" }] },
  { name: 'two-block-rule-off', why: 'a run keeps going after two blocks in a row', mutations: [{ file: LOOP, find: "        halt = desktop && consecutiveBlocks >= 2 ? 'refused_by_policy' : 'batch'", replace: "        halt = 'batch'" }] },
  { name: 'terminal-typed', why: 'typing into a terminal panel inside an approved app is no longer refused (E5)', mutations: [{ file: '_tools_/agent-core/app-policy.mjs', find: '    if (isKeyAction(action) && (isTerminalView(target) || ideTerminal(target, context.frontmostBundleId ?? target?.origin))) {', replace: '    if (false) {' }] },
  { name: 'tty-from-pipe', why: 'the tty controller answers from whatever stream it is given, a caller\'s pipe included', mutations: [{ file: '_tools_/agent-core/consent.mjs', find: "  if (!streams || streams.input?.isTTY !== true) return { ...unattendedController(), kind: 'tty_unavailable' }", replace: "  if (!streams) return { ...unattendedController(), kind: 'tty_unavailable' }" }] },
  { name: 'cli-tty-unchecked', why: 'the CLI accepts --consent tty with no terminal attached', mutations: [{ file: '_tools_/agent-core/cli.mjs', find: '  if (options.consent === \'tty\' && !(process.stdin.isTTY === true && process.stdout.isTTY === true)) {', replace: '  if (false) {' }] },
  { name: 'pre-approval-unbound', why: 'a pre-approval named for one app covers every app', mutations: [{ file: '_tools_/agent-core/app-policy.mjs', find: "  return { class: typeof p?.class === 'string' ? p.class : null, app: raw === null ? null : String(raw).trim().toLowerCase() }", replace: "  return { class: typeof p?.class === 'string' ? p.class : null, app: null }" }] },
  { name: 'start-app-unasked', why: 'every start app joins the helper\'s scope without a person\'s answer', mutations: [{ file: '_tools_/agent-core/loop.mjs', find: '      if (appApprovals?.covers?.(bundleId) === true) {', replace: '      if (true) {' }] },
  { name: 'system-shortcut-allowed', why: 'system-wide chords (the app switcher, Spotlight, log out) pass the policy (P9)', mutations: [{ file: POLICY, find: '    const shortcut = systemShortcut(action)', replace: '    const shortcut = null' }] },
  { name: 'clipboard-reblocked', why: 'copy, cut and paste are blocked again in approved apps, against D-031', mutations: [{ file: POLICY, find: '    const shortcut = systemShortcut(action)', replace: "    if (action.type === 'keypress' && (action.keys ?? []).some((k) => String(k).toUpperCase() === 'META') && (action.keys ?? []).some((k) => ['C', 'X', 'V'].includes(String(k).toUpperCase()))) return { decision: 'block', class: null, rule: 'mutant_reblock', reason: 'mutant' }\n    const shortcut = systemShortcut(action)" }] },
  { name: 'held-chord-unjudged', why: 'a hold_key is judged as itself, not as the keypress it posts, so a held system chord (log out, lock screen) skips the system-shortcut refusal (CU-244)', mutations: [
    // Three layers judge a hold as its keypress since #42 (CU-244): the loop, app-policy's classify and its chord reader.
    { file: LOOP, find: "      const judged = action.type === 'hold_key' ? { type: 'keypress', keys: action.keys } : action", replace: '      const judged = action' },
    { file: POLICY, find: "    const action = held?.type === 'hold_key' ? { type: 'keypress', keys: held.keys } : held", replace: '    const action = held' },
    { file: POLICY, find: "  if ((action?.type !== 'keypress' && action?.type !== 'hold_key') || !Array.isArray(action.keys)) return new Set()", replace: "  if (action?.type !== 'keypress' || !Array.isArray(action.keys)) return new Set()" },
  ] },
  { name: 'paste-without-own-copy-allowed', why: 'a desktop paste is taken as the run\'s own copy, so the owner\'s pasteboard is pasted into a field unasked (CU-151)', mutations: [{ file: LOOP, find: "          ? { ...(ownCopy(count) ? { fromOwner: false,", replace: "          ? { ...(true ? { fromOwner: false," }] },
])
