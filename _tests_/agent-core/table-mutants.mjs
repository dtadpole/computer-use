/**
 * The mutants the D-059 and D-061 tables cite for their D-065 cells (asserted, not live): each breaks one guard in agent
 * core and lists the table rows it must make fail. D-065's condition is a failing mutant, not a named one (D-092,
 * cu-verifier's 04:43Z audit), so table-mutants-run.mjs applies each alone to a scratch copy of the tree and checks that
 * exactly its rows come out 'not ok'. Same find/replace shape as _verifiers_/desktop-consent/mutants.mjs; the two
 * desktop-consent mutants a cell cites (terminal-typed, held-chord-unjudged) are listed here by reference.
 */

const APP = '_tools_/agent-core/app-policy.mjs'
const POLICY = '_tools_/agent-core/policy.mjs'
const LOOP = '_tools_/agent-core/loop.mjs'

export const TABLE_MUTANTS = Object.freeze([
  { name: 'selection-read-ignored', why: 'an open never reads its selection as running code (CU-252)', mutations: [{ file: APP, find: "export function selectionRunsCode(selection) {\n  if (!selection || typeof selection !== 'object') return true", replace: "export function selectionRunsCode(selection) {\n  return false\n  if (!selection || typeof selection !== 'object') return true" }],
    rows: ['menu-open-launchable-selection', 'menu-open-package-selection', 'menu-open-unreadable-selection', 'any-app-open-unreadable-cmd-o', 'any-app-open-unreadable-cmd-down', 'any-app-open-unreadable-menu', 'any-app-open-unnamed-items'] },
  { name: 'store-install-ignored', why: 'an App Store price or install button is judged by name only (CU-254)', mutations: [{ file: APP, find: '    const store = storeInstall(action, target, app)', replace: '    const store = null' }],
    rows: ['appstore-get', 'appstore-price-button'] },
  { name: 'store-trial-ignored', why: 'a free trial is no purchase, in the App Store or anywhere (CU-280, CU-288: both guards dropped)', mutations: [
    { file: APP, find: "STORE_PRICE.test(name) || STORE_CODE_PRICE.test(name) || STORE_TRIAL.test(name) ? 'purchase'", replace: "STORE_PRICE.test(name) || STORE_CODE_PRICE.test(name) ? 'purchase'" },
    { file: POLICY, find: "|| TRIAL_NAME.test(String(name ?? '').trim())", replace: '' },
  ], rows: ['appstore-try-free', 'appstore-trial-with-duration', 'appstore-try-month-free'] },
  { name: 'drop-onto-app-ignored', why: 'a drop onto an app icon is not judged as opening the item with that app (CU-269)', mutations: [{ file: APP, find: "    if (action.type === 'drag' && dropsOntoApp(context.dropTarget) && verdict.decision !== 'handoff') {", replace: '    if (false) {' }],
    rows: ['drop-script-onto-terminal-app'] },
  { name: 'ide-run-ignored', why: "an IDE's run or debug control and chords run code unasked (CU-271)", mutations: [{ file: APP, find: "    if (isIde(app) && verdict.decision !== 'handoff' && runsInIde(action, target, context.boundMenuItem)) {", replace: '    if (false) {' }],
    rows: ['ide-run-python-file', 'ide-f5-in-editor', 'ide-sublime-build', 'ide-xcode-test'] },
  { name: 'service-item-allowed', why: 'a Services menu item is clicked like any menu item (CU-249)', mutations: [{ file: APP, find: '    if (serviceItem(action, target)) {', replace: '    if (false) {' }],
    rows: ['service-click-search-with', 'service-click-run-applescript', 'service-click-set-desktop-picture'] },
  { name: 'service-chord-allowed', why: 'a default Services chord passes (CU-249, CU-256)', mutations: [{ file: APP, find: '    if (service !== null && !appItemWins) {', replace: '    if (false) {' }],
    rows: ['service-chord-run-applescript', 'service-chord-unreadable', 'service-chord-app-bound-enabled-unread', 'service-chord-app-item-disabled', 'service-chord-app-items-several'] },
  { name: 'bound-service-ignored', why: 'a chord the menu read binds to a Services item passes (CU-250)', mutations: [{ file: APP, find: '    if (boundService) {', replace: '    if (false) {' }],
    rows: ['service-chord-owner-installed'] },
  { name: 'writing-tools-allowed', why: 'a Writing Tools item sends the selection out unrefused (CU-277)', mutations: [{ file: APP, find: '    if (writingToolsItem(action, target)) {', replace: '    if (false) {' }],
    rows: ['writing-tools-rewrite', 'writing-tools-compose'] },
  { name: 'chat-app-ignored', why: "Return in a chat app's compose box is no send (CU-287)", mutations: [{ file: POLICY, find: "    const chatApp = isMessagingApp(String(context.frontmostBundleId ?? target?.origin ?? '')) && !isSearchField(target)", replace: '    const chatApp = false' }],
    rows: ['chat-return-dm-recipient', 'chat-return-message-to'] },
  { name: 'nofocus-key-dropped', why: "with the focus unreadable, typed pieces are keyed by the field only, so none is joined (CU-267)", mutations: [{ file: LOOP, find: "return typeof app === 'string' && app !== '' && app !== 'null' ? `nofocus:${app}` : null", replace: 'return null' }],
    rows: ['sequence-card as four type actions, focus unreadable'] },
  { name: 'terminal-typed', from: 'desktop-consent', rows: ['ide-terminal-type-command', 'ide-terminal-return', 'ide-terminal-localized-label', 'ide-terminal-japanese-label', 'ide-terminal-zh-in-cursor', 'ide-terminal-zh-real-label', 'ide-terminal-zh-hant-real-label', 'ide-debug-console-zh-hans', 'ide-debug-console-zh-hant'] },
  { name: 'held-chord-unjudged', from: 'desktop-consent', rows: ['system-chord-held-log-out'] },
])
