import { normaliseForPolicy } from './normalise.mjs'
import { homedir } from 'node:os'
import { posix } from 'node:path'

import { createExclusions } from './exclusions.mjs'
import { normalizeKey } from './keys.mjs'
import { NEVER_PRE_APPROVED, createPolicy, namesPasswordField } from './policy.mjs'

/**
 * The desktop action policy (design: desktop-extension/app-policy.md): per-app scope and approval in place of the
 * site filter, the hard exclusions, and the browser's consequential classes on accessibility targets. Same answer
 * shape as policy.mjs - `{ decision, class, classes?, rule, reason }`, the most restrictive rule winning.
 */

const CLICKS = new Set(['click', 'double_click', 'triple_click'])
const HUMAN_CHANNELS = ['live', 'tty', 'api']
// The driver presses a shifted digit as Shift plus the digit, so `META+#` is `META+SHIFT+3`.
// CU-249: '*' is Shift-8 (Command-* is Get Result of AppleScript).
const SHIFTED = Object.freeze({ '#': '3', $: '4', '%': '5', '^': '6', '*': '8' })

/** A keypress's keys as a set of canonical names, whatever the order or dialect; empty for other actions. */
function chord(action) {
  // CU-244: a hold carries a chord as a keypress does (systemShortcut() is exported and called on its own too).
  if ((action?.type !== 'keypress' && action?.type !== 'hold_key') || !Array.isArray(action.keys)) return new Set()
  return new Set(action.keys.flatMap((key) => {
    let name
    try { name = normalizeKey(key) } catch { name = String(key) }
    return SHIFTED[name] ? ['SHIFT', SHIFTED[name]] : [name]
  }))
}

/**
 * Chords that act on the whole system rather than the approved app (P9). A chord matches when it holds every key of
 * an entry, so modifier order and extra modifiers do not matter (META+ALT+SHIFT+Q logs out too, CTRL+META+SHIFT+3
 * screenshots to the clipboard). keys.mjs has no power or eject key, so no chord can reach those.
 */
const SYSTEM_SHORTCUTS = Object.freeze([
  ['log out', ['META', 'SHIFT', 'Q']],
  ['lock screen', ['CTRL', 'META', 'Q']],
  ...['3', '4', '5', '6'].map((digit) => ['screenshot', ['META', 'SHIFT', digit]]),
  // CU-242: listed before Spotlight, whose keys it contains, so the refusal names it (the first match names the chord).
  ['Character Viewer', ['CTRL', 'META', 'SPACE']],
  ['Spotlight', ['META', 'SPACE']],
  ['Force Quit', ['META', 'ALT', 'ESCAPE']],
  ['app switcher', ['META', 'TAB']],
  ...['ARROWUP', 'ARROWDOWN', 'ARROWLEFT', 'ARROWRIGHT'].map((arrow) => ['Mission Control or Spaces', ['CTRL', arrow]]),
  ['Show Desktop', ['F11']],
  ['VoiceOver', ['META', 'F5']],
  // Keyboard focus to the menu bar, the Dock or the status menus reaches the Apple menu, other apps and menu extras.
  ...['F2', 'F3', 'F8'].map((key) => ['system keyboard focus', ['CTRL', key]]),
  // CU-242 (cu-researcher): switching the input source changes the owner's keyboard layout past the run - an owner
  // setting; Look Up (and the Character Viewer, above) are system panels over the app. Matched as a subset like every entry, so
  // Control-Shift-Space (a common 'previous source' setting) is refused too.
  ['input source', ['CTRL', 'SPACE']],
  ['Look Up', ['CTRL', 'META', 'D']],
  // CU-242 (cu-researcher, cu-coordinator 12:10Z): owner settings the system's hotkeys toggle - Dock hiding, keyboard
  // access, Tab focus mode, and Zoom and Invert colours (refused whether or not the owner enabled them: fail closed).
  ['Dock hiding', ['META', 'ALT', 'D']],
  ['keyboard access', ['CTRL', 'F1']],
  ['Tab focus mode', ['CTRL', 'F7']],
  ['Invert colours', ['CTRL', 'ALT', 'META', '8']],
  ['Zoom', ['ALT', 'META', '8']],
  ['Zoom', ['ALT', 'META', '=']],
  ['Zoom', ['ALT', 'META', '-']],
])

// CU-249 (cu-researcher; cu-coordinator's ruling): the default macOS Services shortcuts the system apps declare
// (NSServices NSKeyEquivalent). A service acts outside the approved app - a web search of the selection, a Bluetooth
// send, AppleScript run on the selection, Terminal - so these chords are refused whatever the app binds: whether an
// app's own item beats a Service in AppKit is unmeasured (a Medium follow-up). Matched exactly, as key equivalents are.
// Named limit: owner-defined service shortcuts on other chords stay unseen (the menu read cannot list Services).
const SERVICE_SHORTCUTS = Object.freeze([
  ['Search With (a web search of the selection)', ['META', 'SHIFT', 'L']],
  ['Make Sticky', ['META', 'SHIFT', 'Y']],
  ['Send File To Bluetooth Device', ['META', 'SHIFT', 'B']],
  ['Get Result of AppleScript (runs the selection)', ['META', 'SHIFT', '8']],
  ['a Terminal man page service', ['META', 'SHIFT', 'M']],
  ['a Terminal man page service', ['META', 'SHIFT', 'A']],
])

// CU-249 (cu-researcher's click route): a Services item clicked in a menu - the app menu's Services submenu or a
// context menu - acts outside the approved app as its chord does. Known by the helper's servicesMenu flag where it
// reports one, else by the default services' titles. Named over-ask: an app's own item titled like one (a browser's
// 'Search With ...' context item); named limit: owner-installed services with other titles.
const SERVICE_ITEM = /^(search with\b|get result of applescript|run as applescript|make (new )?sticky( note)?|send file to bluetooth device|open man page in terminal|search man page index in terminal|new terminal (tab )?at folder|new email with selection|airdrop$|set desktop picture|add to music as a spoken track|capture selection from screen)/i
const serviceItem = (action, target) => CLICKS.has(action.type) && /^(ax)?menuitem$/i.test(String(target?.role ?? '')) &&
  (target?.servicesMenu === true || SERVICE_ITEM.test(String(target?.name ?? '').trim()))

// CU-277 (cu-coordinator: High, refused like Services): Writing Tools rewrites or summarises the owner's selection
// outside the approved app - on the Mac or in Private Cloud Compute - and can hand it to ChatGPT or another AI. Any
// item whose menu path has a 'Writing Tools' parent is refused (the driver's menuPath, #55), so generic titles (Friendly,
// Concise, Summary, List, Table, Compose) are refused only there; the unambiguous titles and any item naming an AI are
// refused by title where no path is read. Named limits: localised titles where no path is read; an app's own AI item
// under its own menu (VS Code's Ask Copilot) is the approved app's feature and stays as before.
// cu-verifier on #108: Writing Tools' own verb phrases are unambiguous too.
const WRITING_TOOLS_TITLE = /^(proofread|rewrite|show writing tools|writing tools|make (friendly|professional|concise)|create key points)\b/i
const OTHER_AI = /\b(chatgpt|openai|gemini|claude|copilot)\b/i
const underWritingTools = (target) => Array.isArray(target?.menuPath) && target.menuPath.slice(0, -1).some((part) => /^writing tools$/i.test(String(part ?? '').trim()))
// cu-researcher on #108: a menu path, when read, decides - so an app's own 'Rewrite history' (a git client) or 'Ask
// Copilot' under its own menu stays as before; the title fallback applies only where no path is read.
const hasMenuPath = (target) => Array.isArray(target?.menuPath) && target.menuPath.length > 0
const writingToolsItem = (action, target) => CLICKS.has(action.type) && /^(ax)?menuitem$/i.test(String(target?.role ?? '')) &&
  (hasMenuPath(target) ? underWritingTools(target)
    : WRITING_TOOLS_TITLE.test(String(target?.name ?? '').trim()) || OTHER_AI.test(String(target?.name ?? '')))

/** The default Services shortcut a chord matches exactly, or null (CU-249). */
export function serviceShortcut(action) {
  const keys = chord(action)
  return SERVICE_SHORTCUTS.find(([, needed]) => needed.length === keys.size && needed.every((key) => keys.has(key)))?.[0] ?? null
}

/** The name of the system shortcut a keypress would trigger, or null. */
export function systemShortcut(action) {
  const keys = chord(action)
  return SYSTEM_SHORTCUTS.find(([, needed]) => needed.every((key) => keys.has(key)))?.[0] ?? null
}

// Where the tree says nothing, Return or Space may press anything, with modifiers or typed as a line break (R92).
const activates = (action) => CLICKS.has(action.type) ||
  (action.type === 'keypress' && (chord(action).has('ENTER') || chord(action).has('SPACE'))) ||
  (action.type === 'type' && /[\r\n]/.test(String(action.text ?? '')))

// Opening one of these runs code beyond the approved app: an app, a script, an installer, a disk image (P10).
// Code, packages, and bundles that install into the system (.prefPane, .mobileconfig) or open locations (.webloc).
const LAUNCHABLE = /\.(app|command|sh|zsh|bash|pkg|mpkg|dmg|tool|workflow|scpt|scptd|applescript|terminal|jar|py|rb|pl|prefpane|mobileconfig|webloc|inetloc|fileloc|action|saver|qlgenerator|kext|plugin|bundle|service|appex|xpc|shortcut|osax|component|mdimporter|systemextension)\/?$/i

// CU-269: an app's icon as a drop target - a Finder item whose name, file name or URL is a .app bundle, or a Dock app item.
const APP_BUNDLE = /\.app\/?$/i
function dropsOntoApp(target) {
  if (!target || typeof target !== 'object') return false
  if (target.subrole === 'AXApplicationDockItem' || target.role === 'AXDockItem') return true
  return [target.name, target.filename, target.url].some((value) => APP_BUNDLE.test(String(value ?? '').trim()))
}
const appNameOf = (target) => String(target?.filename ?? target?.name ?? '').trim().replace(/\.app\/?$/i, '')

function launchesCode(action, target) {
  // Finder may hide an extension, so the AX file name or URL the driver reports counts too (red-team retest of P10).
  const names = [target?.name, target?.filename, target?.url].map((value) => String(value ?? '').trim())
  if (!names.some((value) => LAUNCHABLE.test(value))) return false
  // A triple click opens as well: its second click is a double click.
  if (action.type === 'double_click' || action.type === 'triple_click') return true
  const keys = chord(action)
  return keys.has('META') && (keys.has('O') || keys.has('ARROWDOWN'))
}

// CU-252 (cu-researcher; menu-open.md note 0.1 on the issue): opening the SELECTION runs it too, and the loop reads no
// selection. (1) In Finder, a click on a menu item named Open, or Command-O or Command-Down while the focus is not a
// named file (a list, a column or icon view, nothing), asks launch_code: the selected file is unread. Named over-ask:
// opening a document that way. (2) A menu item titled as an excluded runner (Open With > Terminal, Script Editor ...)
// is refused anywhere: opening anything with it runs it outside the approved app.
const FILE_BROWSERS = new Set(['com.apple.finder'])
const OPEN_ITEM = /^open$/i
const RUNNER_TITLES = /^(terminal|iterm2?|warp|ghostty|kitty|alacritty|hyper|wezterm|script editor|automator|shortcuts|alfred|raycast)$/i
const isMenuItem = (target) => /^(ax)?menuitem$/i.test(String(target?.role ?? ''))
/**
 * CU-252: an open that acts on the selection, in any app - a click on a menu item named Open, or Command-O or
 * Command-Down with no named file focused. The loop reads the selection for it (names and kinds only).
 */
export function opensSelection(action, target) {
  if (CLICKS.has(action.type)) return isMenuItem(target) && OPEN_ITEM.test(String(target?.name ?? '').trim())
  const keys = chord(action)
  if (!(keys.has('META') && (keys.has('O') || keys.has('ARROWDOWN')))) return false
  // A focused element that is itself a named file is judged by launchesCode on its own name.
  const named = String(target?.name ?? '').trim() !== '' && !/^(ax)?(outline|table|browser|list|group|scrollarea|splitgroup|window)$/i.test(String(target?.role ?? ''))
  return !named
}
/** CU-252 rule 1: in Finder an open of the selection asks unless the selection read says it cannot run code. */
export function opensUnreadSelection(action, target, app) {
  return FILE_BROWSERS.has(String(app ?? '')) && opensSelection(action, target)
}
/**
 * CU-252 in any other app (a file manager such as Path Finder or ForkLift, a stand-in): judged only when the selection
 * read reports a file or folder item - a list of messages or notes (kinds unknown) is not a file list and stays unjudged.
 */
function selectsFiles(selection) {
  return Array.isArray(selection?.items) && selection.items.some((item) => item?.kind === 'file' || item?.kind === 'folder')
}
/**
 * CU-252 rule 3 (the driver's selectedItems, CU-259): whether the selection an open acts on may run code. A launchable
 * name, a package (a bundle's trailing '/'), or a file with no extension (a script needs none) may; a document or a
 * folder does not; nothing selected does not. No read, an unreadable one or a non-collection focus asks (rule 1).
 */
export function selectionRunsCode(selection) {
  if (!selection || typeof selection !== 'object') return true
  if (selection.none === true) return false
  if (!Array.isArray(selection.items)) return true
  return selection.truncated === true || selection.items.some((item) => {
    const name = String(item?.name ?? '').trim()
    if (item?.kind === 'unknown' || name === '') return true
    if (LAUNCHABLE.test(name)) return true
    // cu-developer-three on #101: helper names never carry a trailing '/', so a folder-kind item with a letter extension
    // may be a package not on the list - it asks (named over-ask: a plain folder named like 'site.assets').
    if (item?.kind === 'folder' && /\.[a-z][a-z0-9-]{0,15}$/i.test(name)) return true
    return item?.kind === 'file' && !name.replace(/^\./, '').includes('.')
  })
}
const runnerItem = (action, target, context) => {
  if (CLICKS.has(action.type) && isMenuItem(target) && RUNNER_TITLES.test(String(target?.name ?? '').trim())) return String(target.name).trim()
  if (action.type !== 'keypress') return null
  const bound = context.boundMenuItem && typeof context.boundMenuItem === 'object' ? (Array.isArray(context.boundMenuItem.items) ? context.boundMenuItem.items : [context.boundMenuItem]) : []
  const hit = bound.find((one) => RUNNER_TITLES.test(String(one?.name ?? '').trim()))
  return hit ? String(hit.name).trim() : null
}

// CU-254 (cu-researcher; cu-coordinator: the install class, ask): the App Store installs or updates software from its
// Get, Install, Update and Download buttons - no consent word names them - so a click on one, or Space or Return on one
// focused, asks install - app-policy's own verdict, so no pre-approval covers it (as launch_code). Browsing stays
// free. Named limit: third-party stores and updaters (Setapp, MacUpdater).
const APP_STORE = 'com.apple.AppStore'
const STORE_INSTALL = /^(get|install|update|update all|download|redownload|reinstall)\b/i
// cu-verifier on #58: a button titled with a price ('$4.99', '¥30', '4,99 €', 'Price, 4.99 dollars') starts a purchase.
const STORE_PRICE = /^(price\b|[$€£¥₩₹]\s?\d|\d+(?:[.,]\d+)?\s?[$€£¥₩₹])/i
// CU-280 (cu-researcher; cu-coordinator: Medium): a free trial starts a renewing subscription, and a price may be written
// with its currency code ('USD 4.99', '4,99 EUR') - both are purchases.
const STORE_TRIAL = /^(try (it )?free|start (a |your )?free trial|free trial|try free for)\b/i
const STORE_CODE_PRICE = /^((usd|eur|gbp|jpy|cny|rmb|krw|inr|cad|aud|chf|sek|nok|dkk|hkd|sgd|nzd|brl|mxn)\s?\d|\d+(?:[.,]\d+)?\s?(usd|eur|gbp|jpy|cny|rmb|krw|inr|cad|aud|chf|sek|nok|dkk|hkd|sgd|nzd|brl|mxn)\b)/i
/** 'install' or 'purchase' for an App Store button that installs or buys, pressed by a click, Space or Return; else null. */
function storeInstall(action, target, app) {
  if (String(app ?? '') !== APP_STORE || !/^(ax)?button$/i.test(String(target?.role ?? ''))) return null
  const name = String(target?.name ?? '').trim()
  const cls = STORE_PRICE.test(name) || STORE_CODE_PRICE.test(name) || STORE_TRIAL.test(name) ? 'purchase' : STORE_INSTALL.test(name) ? 'install' : null
  if (cls === null) return null
  if (CLICKS.has(action.type)) return cls
  const keys = chord(action)
  return action.type === 'keypress' && (keys.has('SPACE') || keys.has('ENTER')) ? cls : null
}

const isKeyAction = (action) => action.type === 'type' || action.type === 'keypress'

/** The service macOS draws open and save panels in (design file-panels.md, Q-D13). */
export const PANEL_SERVICE = 'com.apple.appkit.xpc.openAndSavePanelService'
const PANEL_COMMIT = /(^|[^a-z])(open|save|choose|upload|attach|select|import|export)([^a-z]|$)/i

/**
 * Inside a panel the helper attributed to its client app (target.hostedBy): navigation and selection pass; Quick Look,
 * the context menu, dragging out and file operations are refused; every way the panel commits - its final button, a
 * double click on a file, Return, a typed line break - is file_choice, asked once each time (file-panels.md).
 */
/**
 * Which open/save panel a target is in: a remote panel's element the helper attributed to its client (hostedBy, a
 * sandboxed app), or an in-process panel's element the helper marked by AppKit's own AXIdentifier ('save-panel',
 * 'open-panel') on an ancestor window or sheet (panel: 'save' | 'open'). Both get the same rules (CU-39, live).
 */
export function panelKind(target) {
  if (String(target?.hostedBy ?? '').toLowerCase() === PANEL_SERVICE.toLowerCase()) return 'remote'
  if (target?.panel === 'save' || target?.panel === 'open') return target.panel
  return null
}

// Names of places no panel commit may go into, matched on a clicked item's own name (over-blocking only, CU-39).
const PROTECTED_PLACE = /^(applications|utilities|library|launchagents|launchdaemons|keychains|\.ssh|system)$/i

function panelVerdict(action, target, app) {
  // The helper's ancestor walk stopped (its limit, an AX error) before it could say: never 'not a panel' - ask each time.
  if (target?.panel === 'unknown' && activates(action)) {
    return { decision: 'confirm', class: 'unknown_target', classes: ['unknown_target'], rule: 'panel:unknown', reason: `act on an element ${app} may show in a file panel`, app, askEachTime: true }
  }
  if (panelKind(target) === null) return null
  const keys = chord(action)
  const modifiers = new Set((Array.isArray(action.keys) ? action.keys : []).map((key) => normalizeKey(String(key))))
  const block = (rule, reason) => ({ decision: 'block', class: null, rule: `panel:${rule}`, reason, app })
  if (action.type === 'drag') return block('drag_out', 'dragging out of a file panel is refused')
  if (CLICKS.has(action.type) && (action.button === 'right' || modifiers.has('CTRL'))) return block('context_menu', 'a file panel\'s context menu is refused (it holds file operations)')
  if (action.type === 'keypress' && keys.has('META') && (keys.has('BACKSPACE') || keys.has('DELETE') || keys.has('R') || (keys.has('SHIFT') && keys.has('N')))) {
    return block('file_operation', 'file operations inside a file panel are refused')
  }
  if (action.type === 'keypress' && ((keys.has('SPACE') && !keys.has('META')) || (keys.has('META') && keys.has('Y')))) {
    return block('quick_look', 'Quick Look in a file panel is refused (it renders a file into the screenshot)')
  }
  // Navigation into a protected place the panel cannot report a folder for (CU-39: on this macOS the panel exposes no
  // folder, so a plain name saved there would only be asked as 'destination unknown'): the shortcuts to Applications and
  // Utilities, showing hidden files, and opening an item named like a protected place are refused. This only over-blocks.
  if (action.type === 'keypress' && keys.has('META') && ((keys.has('SHIFT') && (keys.has('A') || keys.has('U') || keys.has('.'))) || keys.has('>'))) {
    return block('protected_place', 'taking a file panel to Applications, Utilities or hidden files is refused')
  }
  if (CLICKS.has(action.type) && PROTECTED_PLACE.test(String(target?.name ?? '').trim())) {
    return block('protected_place', `opening "${String(target.name).trim()}" in a file panel is refused (a protected place)`)
  }
  // A path typed into the panel (its name field or Go to Folder) is checked as it is typed, before any Return:
  // '..' segments are refused, and a path that resolves into a protected place is refused outright.
  if (action.type === 'type') {
    const typed = String(action.text ?? '').split(/[\r\n]/)[0].trim()
    if (/(^|\/)\.\.(\/|$)/.test(typed)) return block('relative_path', 'a typed path with .. segments is refused in a file panel')
    const typedPath = panelDestination({ name: typed })
    if (typedPath.known && protectedPath(typedPath.path)) return block('protected_path', `${typedPath.path} is a protected location`)
  }
  const commits = action.type === 'double_click' || action.type === 'triple_click' ||
    (action.type === 'keypress' && keys.has('ENTER')) ||
    (action.type === 'type' && /[\r\n]/.test(String(action.text ?? ''))) ||
    (action.type === 'click' && PANEL_COMMIT.test(String(target?.name ?? '')))
  if (!commits) return null
  return { decision: 'confirm', class: 'file_choice', classes: ['file_choice'], rule: 'panel:file_choice', reason: `choose a file in ${app}'s file panel${target?.name ? ` ("${target.name}")` : ''}`, app }
}

/**
 * CU-76: a system privacy or permission prompt - the paste-permission alert, a permission (TCC) prompt - is the person's
 * to answer, even inside or over an approved app's window: never consentable, never pre-approved. The helper marks
 * such a prompt (`systemPrompt`, the helper half); beside it, the buttons only those prompts carry are recognised.
 */
const SYSTEM_PROMPT_BUTTONS = /^(allow paste|don['’]?t allow paste|open system settings)$/i

export function isSystemPrompt(target) {
  if (!target) return false
  if (target.systemPrompt === true || (typeof target.systemPrompt === 'string' && target.systemPrompt !== '')) return true
  return typeof target.name === 'string' && SYSTEM_PROMPT_BUTTONS.test(target.name.trim())
}

/** Places no file is saved into or chosen from, even with approval: persistence, credentials, code (file-panels.md). */
export function protectedPath(path, home = homedir()) {
  const p = posix.normalize(String(path ?? ''))
  const h = home.replace(/\/+$/, '')
  const under = (dir) => p === dir || p.startsWith(`${dir}/`)
  const dirs = [`${h}/.ssh`, `${h}/Library/LaunchAgents`, '/Library/LaunchAgents', '/Library/LaunchDaemons', `${h}/Library/Keychains`,
    '/Library/Keychains', '/Applications', `${h}/Applications`, '/System', `${h}/Library/Application Support/com.apple.backgroundtaskmanagementagent`]
  if (dirs.some(under)) return true
  if (/\.app(\/|$)/i.test(p)) return true
  const startup = ['.zshrc', '.zprofile', '.zshenv', '.zlogin', '.bashrc', '.bash_profile', '.profile', '.config/fish/config.fish']
  return startup.some((file) => p === `${h}/${file}`)
}
/**
 * Where a panel commit would write or read (CU-39 red team). A name typed as a path - one with '/' or led by '~/' - is
 * resolved on its own: the save panel takes a path in its name field. Otherwise the helper's canonical path. With
 * neither the destination is unknown, which is never read as 'not protected'. Returns `{ path, known }`.
 */
export function panelDestination(selection, home = homedir()) {
  const name = typeof selection?.name === 'string' ? selection.name.trim() : ''
  const directory = typeof selection?.directory === 'string' && selection.directory !== '' ? selection.directory : null
  if (name.includes('/') || name.startsWith('~')) {
    if (name.startsWith('~') && name !== '~' && !name.startsWith('~/')) return { path: null, known: false }
    const expanded = name.startsWith('~') ? `${home.replace(/\/+$/, '')}${name.slice(1)}` : name
    if (expanded.startsWith('/')) return { path: posix.normalize(expanded), known: true }
    return directory ? { path: posix.normalize(posix.join(directory, expanded)), known: true } : { path: null, known: false }
  }
  if (typeof selection?.path === 'string' && selection.path !== '') return { path: posix.normalize(selection.path), known: true }
  return { path: null, known: false }
}

// An approved app's embedded terminal (an IDE's terminal panel, a console view) runs commands like a terminal app (E5,
// design Q-D9): clicking there is fine, typing is refused.
// Also REPLs and notebook cells, where Enter or Shift+Enter runs code (red-team retest of E5).
const TERMINAL_VIEW = /\b(terminal|console|shell|command prompt|zsh|bash|repl|notebook|code cell|interactive|ipython|irb|jupyter)\b/i
const isTerminalView = (target) => target !== null && TERMINAL_VIEW.test([target?.name, target?.description, target?.roleDescription].filter(Boolean).join(' '))

// No pre-approval covers these on the desktop, scoped to an app or not: a credential (P4), opening code (P10), and the
// browser's always-confirm classes.
const NEVER_ON_DESKTOP = new Set(['credential', 'launch_code', ...NEVER_PRE_APPROVED])

/**
 * A desktop pre-approval as `{ class, app }`. `class@bundle.id` from cli.mjs's parsePreApproval puts the bundle id in
 * `origin`, so `app` is `p.app ?? p.origin`, lower-cased; null (no app named) covers every app. A named app that is
 * empty or not a string still names an app - one no action has - so it never widens to every app (fail closed).
 */
export function normalizeAppPreApproval(p) {
  const raw = p?.app ?? p?.origin ?? null
  return { class: typeof p?.class === 'string' ? p.class : null, app: raw === null ? null : String(raw).trim().toLowerCase() }
}

/**
 * `scope`: the caller's start apps - candidates only (`startApps()`), never approvals: the run scope starts empty and
 * grows through `grantScope` after a human answer (P11). `approvals`: the `always` store (`covers(bundleId)`).
 * `exclusions`: from createExclusions. `preApprovals`: class pre-approvals `{ class, app }` (or `{ class, origin }` with
 * the bundle id as origin, as cli.mjs parses `class@bundle.id`); without an app one covers every app, with one only
 * actions whose app (the target's, else the frontmost) is that app; never `credential` or `launch_code` here.
 * `classify(action, context)` reads `context.frontmostBundleId`, `context.target` (from `hitTest` or `focused`:
 * `{ origin: bundleId, role, name, secure }`), `context.dialog` and `context.authPrompt`.
 */
export function createAppPolicy({ scope = [], approvals = null, exclusions = createExclusions(), preApprovals = [], createClassPolicy = createPolicy } = {}) {
  const startApps = Object.freeze([...scope])
  const runScope = new Set()
  const granted = preApprovals.map(normalizeAppPreApproval).filter((p) => p.class !== null && !NEVER_ON_DESKTOP.has(p.class))
  // The browser classes, with a site check that always passes: on the desktop the app checks replace it. Only the
  // pre-approvals that name no app go in: the browser policy reads an origin it cannot parse (a bundle id) as any
  // origin, which would widen `submit@com.x` to every app. A credential typed on the desktop is always confirmed (P4).
  const classes = createClassPolicy({ sitePolicy: () => 'allow', preApprovals: granted.filter((p) => p.app === null).map((p) => ({ class: p.class })) })
  /** Whether a pre-approval for `cls` covers an action in `app`: one naming no app, or one naming this app. */
  const preApprovedIn = (cls, app, { scopedOnly = false } = {}) => typeof app === 'string' &&
    granted.some((p) => p.class === cls && (p.app === null ? !scopedOnly : p.app === app.trim().toLowerCase()))

  /**
   * A confirm from the class policy becomes an allow when app-scoped pre-approvals for the action's app cover every
   * class it still needs (those naming no app were already applied there); otherwise the confirm stands.
   */
  function scopedPreApproval(verdict, app) {
    if (verdict.decision !== 'confirm' || typeof app !== 'string') return verdict
    const needed = verdict.classes ?? [verdict.class]
    if (needed.length === 0 || !needed.every((cls) => preApprovedIn(cls, app, { scopedOnly: true }))) return verdict
    return { decision: 'allow', class: verdict.class, classes: needed, rule: `preapproved:${verdict.class}@${app.trim().toLowerCase()}`, reason: '' }
  }

  const approved = (bundleId) => runScope.has(bundleId.toLowerCase()) || approvals?.covers?.(bundleId) === true

  function classify(rawHeld, rawContext = {}) {
    // CU-266: names, labels and typed text are judged normalised (zero-width and format characters, look-alikes).
    const { action: held, context } = normaliseForPolicy(rawHeld, rawContext)
    // CU-244: a key hold is judged exactly as the same chord pressed (CU-64 H3), here as in the loop - so the system
    // shortcuts, the file-panel refusals and every keypress rule below see a held chord too, whoever calls.
    const action = held?.type === 'hold_key' ? { type: 'keypress', keys: held.keys } : held
    if (action.type === 'navigate') return { decision: 'block', class: null, rule: 'desktop:navigate', reason: 'navigate is browser-only' }
    const target = context.target ?? null
    // Copy, cut and paste - chords and menu items - are allowed (D-031, replacing D-025's refusal); the helper never
    // reads the pasteboard and the trajectory never records its contents.
    const shortcut = systemShortcut(action)
    if (shortcut !== null) {
      return { decision: 'block', class: null, rule: 'system_shortcut', reason: `${action.keys.join('+')} is the system's ${shortcut} shortcut; it acts beyond the approved app` }
    }
    // CU-252 rule 2: a menu item titled as an excluded runner opens the selection in it, outside the approved app.
    const runner = runnerItem(action, target, context)
    if (runner !== null) {
      return { decision: 'block', class: null, rule: 'excluded:terminal', reason: `"${runner}" opens the selection in an excluded app` }
    }
    // CU-249: a default Services chord may run a service outside the approved app - refused, unless (CU-256, cu-coordinator
    // 13:42Z) the menu read finds exactly one ENABLED app item bound to it: Apple's Services guide says the application's
    // own shortcut wins, so the chord is judged as a click on that item below. Disabled, none, unreadable, several matches
    // or a servicesMenu mark keep the refusal. Named residual: an owner-assigned Services shortcut (CU-250 fails it closed).
    const service = serviceShortcut(action)
    const boundItems = context.boundMenuItem && typeof context.boundMenuItem === 'object' && context.boundMenuItem.unreadable !== true
      ? (Array.isArray(context.boundMenuItem.items) ? context.boundMenuItem.items : (typeof context.boundMenuItem.name === 'string' ? [context.boundMenuItem] : []))
      : []
    const appItemWins = boundItems.length === 1 && boundItems[0]?.enabled === true && boundItems[0]?.servicesMenu !== true && !SERVICE_ITEM.test(String(boundItems[0]?.name ?? '').trim())
    if (service !== null && !appItemWins) {
      // Inside a file panel the panel's own refusal names the chord (Command-Shift-A is its Applications shortcut).
      const panelBlock = panelKind(target) !== null ? panelVerdict(action, target, target?.origin ?? context.frontmostBundleId) : null
      if (panelBlock?.decision === 'block') return panelBlock
      return { decision: 'block', class: null, rule: 'system_shortcut', reason: `${action.keys.join('+')} may run the system service ${service}; it acts beyond the approved app` }
    }
    if (serviceItem(action, target)) {
      return { decision: 'block', class: null, rule: 'system_service', reason: `"${String(target.name).trim()}" is a system service; it acts beyond the approved app` }
    }
    if (writingToolsItem(action, target)) {
      return { decision: 'block', class: null, rule: 'writing_tools', reason: `"${String(target.name ?? '').trim()}" sends the selected text to Writing Tools or another AI, beyond the approved app` }
    }
    // A chord the menu read binds to a Services item fires that service too (cu-coordinator: as menu-key targets).
    const boundList = context.boundMenuItem && typeof context.boundMenuItem === 'object' ? (Array.isArray(context.boundMenuItem.items) ? context.boundMenuItem.items : [context.boundMenuItem]) : []
    const boundService = (action.type === 'keypress') ? boundList.find((one) => one?.servicesMenu === true || SERVICE_ITEM.test(String(one?.name ?? '').trim())) : undefined
    if (boundService) {
      return { decision: 'block', class: null, rule: 'system_service', reason: `${(action.keys ?? []).join('+')} fires the system service "${String(boundService.name).trim()}"; it acts beyond the approved app` }
    }
    // CU-232 (menu-key.md): a chord bound to an item of the Apple menu (Lock Screen, Log Out, Force Quit) acts beyond the
    // approved app, like the system's own shortcuts.
    const bound = context.boundMenuItem
    const appleItem = bound && typeof bound === 'object' ? (Array.isArray(bound.items) ? bound.items : [bound]).find((one) => one?.appleMenu === true) : undefined
    if (appleItem) {
      return { decision: 'block', class: null, rule: 'system_shortcut', reason: `${(action.keys ?? []).join('+')} fires the Apple menu's ${appleItem.name}; it acts beyond the approved app` }
    }
    // Aiming at an excluded app is refused, and so is a target that names no app (fail closed); an excluded app that
    // came to the front is the person's (R65, R79).
    const aimed = target === null ? null : exclusions.isExcludedApp(target.origin)
    if (aimed?.excluded) {
      return { decision: 'block', class: null, rule: `excluded:${aimed.kind}`, ...(aimed.kind === 'unknown' ? {} : { app: target.origin }), reason: aimed.kind === 'unknown' ? 'the target names no app' : `the target app is excluded (${target.origin})` }
    }
    const targetApp = target?.origin ?? null
    const front = exclusions.isExcludedApp(context.frontmostBundleId)
    if (front.excluded && front.kind === 'unknown') return { decision: 'block', class: null, rule: 'excluded:unknown', reason: 'no frontmost app is known' }
    if (front.excluded) {
      return { decision: 'handoff', class: null, rule: `excluded_front:${front.kind}`, app: context.frontmostBundleId, reason: `an excluded app is in front (${context.frontmostBundleId}); it is the person's` }
    }
    if (context.authPrompt === true) {
      return { decision: 'handoff', class: null, rule: 'auth_prompt', reason: 'an authentication prompt needs the person' }
    }
    // CU-76: answering a system privacy or permission prompt is the person's, even in an approved app's window. While
    // one is present (the driver's state, from the helper's mark), every key is the person's too: Return, Space or
    // Escape answer its default or cancel button whatever has focus.
    if (isKeyAction(action) && context.systemPrompt === true) {
      return { decision: 'handoff', class: null, rule: 'system_prompt', reason: 'a system privacy or permission prompt is the person\'s to answer' }
    }
    if ((activates(action) || isKeyAction(action)) && isSystemPrompt(target)) {
      return { decision: 'handoff', class: null, rule: 'system_prompt', reason: 'a system privacy or permission prompt is the person\'s to answer' }
    }
    // Secure fields and secure input are the person's on the desktop, never pre-approvable (R83).
    if (isKeyAction(action) && (context.secureInput === true || target?.secure === true || target?.isPassword === true)) {
      return { decision: 'handoff', class: null, rule: 'secure_field', reason: 'typing into a secure field is the person\'s' }
    }
    // CU-184: a 'Show password' toggle turns the secure field into an AXTextField without changing what it holds.
    // CU-194: an entry the run saw as a password field hands off even when shown in plain text.
    if (isKeyAction(action) && (namesPasswordField(target) || target?.seenAsPassword === true)) {
      return { decision: 'handoff', class: null, rule: 'password_field', reason: 'typing into a password field is the person\'s, shown or not' }
    }
    // CU-186: a menu paste lands in the focused field read beside the menu item - a secure or password field there is the
    // person's as well.
    const into = context.paste?.destination
    if (into && (into.secure === true || into.isPassword === true || namesPasswordField(into) || into.seenAsPassword === true)) {
      const secure = into.secure === true || into.isPassword === true
      return { decision: 'handoff', class: null, rule: secure ? 'secure_field' : 'password_field', reason: 'pasting into a secure or password field is the person\'s' }
    }
    if (isKeyAction(action) && isTerminalView(target)) {
      return { decision: 'block', class: null, rule: 'terminal_view', reason: 'typing into a terminal panel is refused, as in a terminal app' }
    }
    const apps = [['frontmost', context.frontmostBundleId], ['target', targetApp]].filter(([, id]) => id !== null)
    for (const [which, bundleId] of apps) {
      if (!approved(bundleId)) {
        return { decision: 'confirm', class: 'new_app', classes: ['new_app'], rule: 'app:not_approved', reason: `use ${bundleId}, an app this run has no approval for (${which})`, app: bundleId }
      }
    }
    const panel = panelVerdict(action, target, targetApp ?? context.frontmostBundleId)
    if (panel) return panel
    const app = targetApp ?? context.frontmostBundleId
    // The task travels too: a value the task itself names is not sensitive_data (CU-42) - on the desktop as in a browser.
    // CU-152 / CU-145 (cu-researcher): the whole context travels to the class policy - only the url and target are the
    // desktop's own - so no field a rule reads (dropTarget, afterClose, paste, the next one) can be dropped by a rebuild.
    const verdict = classes.classify(action, { ...context, url: 'desktop://', target, dialog: context.dialog ?? null })
    // Never pre-approvable: preApprovals are not consulted. Only a hand-off (a password change) outranks it.
    const store = storeInstall(action, target, app)
    if (store !== null && verdict.decision === 'allow') {
      return { decision: 'confirm', class: store, classes: [store], rule: `target:${store}`, reason: `"${String(target.name).trim()}" in the App Store ${store === 'purchase' ? 'buys an app' : 'installs or updates software'}`, app }
    }
    if (launchesCode(action, target) && verdict.decision !== 'handoff') {
      return { decision: 'confirm', class: 'launch_code', classes: ['launch_code', ...(verdict.classes ?? [])], rule: 'target:launch_code', reason: `open "${target.name}", which runs code`, app }
    }
    const opensFiles = opensUnreadSelection(action, target, app) || (opensSelection(action, target) && selectsFiles(context.selection))
    if (opensFiles && selectionRunsCode(context.selection) && verdict.decision !== 'handoff') {
      return { decision: 'confirm', class: 'launch_code', classes: ['launch_code', ...(verdict.classes ?? [])], rule: 'selection:launch_code', reason: 'open the selection, which this run cannot read - it may run code', app }
    }
    // CU-269 (cu-researcher): a drop onto an app's icon - a Finder .app item or a Dock app item - opens the dragged item
    // with that app (Finder's 'open with'). A terminal or code runner by name is refused as its app would be; a launchable
    // item asks launch_code (never pre-approved); a document asks new_app.
    if (action.type === 'drag' && dropsOntoApp(context.dropTarget) && verdict.decision !== 'handoff') {
      const appName = appNameOf(context.dropTarget)
      if (RUNNER_TITLES.test(appName)) return { decision: 'block', class: null, rule: 'excluded:terminal', reason: `drop onto ${appName}, which runs code (excluded)` }
      // cu-coordinator 14:10Z: a launchable item asks launch_code; a document asks new_app, since the icon does not say
      // whether its app is approved (an accepted over-ask for an approved app's icon until the driver reports its bundle id).
      const names = [target?.name, target?.filename, target?.url].map((value) => String(value ?? '').trim())
      if (names.some((value) => LAUNCHABLE.test(value))) {
        return { decision: 'confirm', class: 'launch_code', classes: ['launch_code', ...(verdict.classes ?? [])], rule: 'drop:open_with', reason: `open "${target?.name ?? 'the item'}", which runs code, with ${appName || 'an app'}`, app }
      }
      return { decision: 'confirm', class: 'new_app', classes: ['new_app', ...(verdict.classes ?? [])], rule: 'drop:open_with', reason: `open the dragged item with ${appName || 'an app'}, whose approval its icon does not show`, app: appName || null }
    }
    // CU-232 (menu-key.md): a chord whose menu item could not be read may fire whatever the app binds to it (Mail's Send
    // is Shift-Command-D), so it asks each time unless the keys already ask. The loop reads no item for the editing chords
    // it judges by their meaning (copy, paste, undo, select all, arrows, delete chords), so those never land here.
    if ((action.type === 'keypress' || action.type === 'hold_key') && context.boundMenuItem?.unreadable === true && verdict.decision === 'allow') {
      return { decision: 'confirm', class: 'unknown_target', classes: ['unknown_target'], rule: 'menu:unreadable', reason: `press ${(action.keys ?? []).join('+')} in ${app}, whose menu item for it could not be read`, app, askEachTime: true }
    }
    // An element the helper could not describe: it names the window's owner but no role or title, because Accessibility
    // at the point belongs to another process - for example a sandboxed app's remote open/save panel, whose elements are
    // the panel service's (CU-39). It may be the panel's Save, so it is asked each time and never pre-approved, like
    // file_choice (D-044), unless the helper attributes the element (hostedBy) or marks its panel.
    if (activates(action) && target && target.origin && !target.role && !target.name && target.opaque !== true) {
      return { decision: 'confirm', class: 'unknown_target', classes: ['unknown_target'], rule: 'target:undescribed', reason: `act on an element ${app} does not describe (it may belong to a system panel)`, app, askEachTime: true }
    }
    // CU-268: a name with one word mixing scripts may disguise what the control does (cu-developer-one's ruling): an
    // activation asks each time, never pre-approved - so does a chord whose bound menu item is named so. Only where the
    // rules would allow it: a folded look-alike already asks by its class ('Dеlete' asks delete).
    if (verdict.decision === 'allow') {
      const bound = context.boundMenuItem && !context.boundMenuItem.unreadable && !context.boundMenuItem.none
        ? (Array.isArray(context.boundMenuItem.items) ? context.boundMenuItem.items : [context.boundMenuItem]) : []
      const viaKey = (action.type === 'keypress' || action.type === 'hold_key') && bound.find((one) => one?.mixedScriptName === true)
      if ((activates(action) && target?.mixedScriptName === true) || viaKey) {
        const shown = viaKey ? viaKey.name : target.name
        return { decision: 'confirm', class: 'unknown_target', classes: ['unknown_target'], rule: viaKey ? 'menu:mixed_script' : 'target:mixed_script', reason: `activate "${shown}", whose name mixes scripts in one word (a disguised control?)`, app, askEachTime: true }
      }
    }
    // Where the accessibility tree says nothing, a click or Return may be anything (R92).
    if (activates(action) && target?.opaque === true && !preApprovedIn('unknown_target', app)) {
      return { decision: 'confirm', class: 'unknown_target', classes: ['unknown_target'], rule: 'target:opaque', reason: `act on an element ${app} does not describe`, app }
    }
    return scopedPreApproval(verdict, app)
  }

  /** Grow the run scope after a person approved `new_app` through a human channel; anything else changes nothing. */
  function grantScope(bundleId, answer) {
    if (answer?.approved !== true || !HUMAN_CHANNELS.includes(answer.answeredBy)) return false
    if (typeof bundleId !== 'string' || exclusions.isExcludedApp(bundleId).excluded) return false
    runScope.add(bundleId.toLowerCase())
    return true
  }

  return { classify, grantScope, scope: () => [...runScope], startApps: () => [...startApps] }
}
