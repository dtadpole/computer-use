/**
 * CU-384 (D-100): target and context builders shaped as the drivers and the loop send them, so a policy probe judges
 * the shape the run will see - never a hand-made stand-in. Each field is listed in SOURCES with the file that produces
 * it; _tests_/probe-kit/shapes.test.mjs fails when a producing file stops naming a field (a rename the kit must follow).
 *
 * Browser targets: what the chrome-browser driver's #describe returns (role and name from the accessibility tree,
 * the rest from page-scripts.mjs describeElement and environment.mjs). Desktop targets: what macos-desktop
 * environment.mjs maps from the helper's reply. Contexts: the fields loop.mjs's contextFor puts beside the target.
 * The browser driver also sends href, autocomplete, origin, textEntered, caption, box and fingerprint on every target
 * (cu-developer-two, 23:24Z); add them to a builder when a rule under probe reads them.
 * The values are fixture words only; build secret-shaped values from _tests_/fixture-shapes/shapes.mjs, never here.
 */

const flag = (key, value) => (value === undefined ? {} : { [key]: value })

/** Browser route: the target object the policy receives for a focused or clicked element. */
export const web = Object.freeze({
  /** A null focus: the driver reports a focused document body, or nothing, as null (page-scripts deepActiveElement). */
  none: null,
  textbox: (name = 'Search', extra = {}) => ({ tag: 'input', inputType: 'text', role: 'textbox', name, editable: true, ...extra }),
  password: (name = 'Password') => ({ tag: 'input', inputType: 'password', isPassword: true, role: 'textbox', name, editable: true }),
  contentEditable: (name = 'Message body') => ({ tag: 'div', role: 'textbox', name, editable: true }),
  /** A plain div: the accessibility tree names its role 'generic' (cu-developer-two's live probe, 23:29Z). */
  div: (name = '') => ({ tag: 'div', role: 'generic', name, editable: false }),
  /** A focused grid row, and a list option (role option) - both real shapes a key can act on. */
  row: (name = 'Invoice') => ({ tag: 'div', role: 'row', name, editable: false }),
  listItem: (name = 'Invoice') => ({ tag: 'div', role: 'option', name, editable: false }),
  button: (name = 'Archive') => ({ tag: 'button', role: 'button', name, editable: false }),
  /** A link carries its scheme only (environment.mjs linkScheme), never the URL. */
  link: (name = 'Invoice', scheme = 'https') => ({ tag: 'a', role: 'link', name, editable: false, linkScheme: scheme }),
  /** A native checkbox or radio; checked is the state before the action (PR #393; omitted when unknown). */
  checkbox: (name, checked) => ({ tag: 'input', inputType: 'checkbox', role: 'checkbox', name, editable: false, ...flag('checked', checked) }),
  radio: (name, checked) => ({ tag: 'input', inputType: 'radio', role: 'radio', name, editable: false, ...flag('checked', checked) }),
  /** An ARIA switch: its checked comes from aria-checked, which the page writes (CU-373: never trusted to free). */
  ariaSwitch: (name, checked) => ({ tag: 'button', role: 'switch', name, editable: false, ...flag('checked', checked) }),
  /** A toggle button: pressed from aria-pressed (PR #393; true, false or 'mixed'; omitted when unknown). */
  toggleButton: (name, pressed) => ({ tag: 'button', role: 'button', name, editable: false, ...flag('pressed', pressed) }),
  /** A same-origin frame editor's body: focusedElement answers it as an editable body (#369); a plain body is null. */
  frameEditorBody: () => ({ tag: 'body', role: 'generic', name: '', editable: true }),
  /** A closed native select: a control, never editable; Chrome's accessibility role is combobox (CU-370). */
  select: (name = 'Bulk actions') => ({ tag: 'select', role: 'combobox', name, editable: false }),
  /** keyTarget's answers (CU-370, environment.mjs): the option or radio a key lands on, or an unread choice. */
  /** tag 'option' for a native option; an ARIA option is a 'div' (cu-developer-two, 22:15Z). */
  option: (name, tag = 'option') => ({ tag, role: 'option', name, editable: false, selectOption: true }),
  radioChoice: (name) => ({ tag: 'input', inputType: 'radio', role: 'radio', name, editable: false, radioChoice: true, selectOption: true }),
  unreadChoice: (base, readFailed = false) => ({ ...base, optionUnread: true, ...(readFailed ? { readFailed: true } : {}) }),
})

/** Desktop route: the target object environment.mjs maps from the helper's describe() reply. */
export const desk = Object.freeze({
  none: null,
  textField: (app, { name = '', caption = null, placeholder = null, nearbyLabel = null, secure = false } = {}) =>
    ({ origin: app, role: secure ? 'AXSecureTextField' : 'AXTextField', name, editable: true, caption, placeholder, nearbyLabel }),
  row: (app, name = 'Invoice', { filename } = {}) => ({ origin: app, role: 'AXRow', name, editable: false, ...flag('filename', filename) }),
  /** A list-focused collection, the shape opensSelection reads for Command-O (CU-252). */
  outline: (app) => ({ origin: app, role: 'AXOutline', name: '', editable: false }),
  button: (app, name = 'Archive', extra = {}) => ({ origin: app, role: 'AXButton', name, editable: false, ...extra }),
  /** A sheet's control: sheet true and the sheet's default button (CU-148). */
  sheetButton: (app, name, defaultButton) => ({ origin: app, role: 'AXButton', name, editable: false, sheet: true, defaultButton }),
  webArea: (app, name = '') => ({ origin: app, role: 'AXWebArea', name, editable: false }),
  /** A menu item; flags as the helper marks them: servicesMenu (CU-250), quickActions (PR #418), menuOpen (PR #405). */
  menuItem: (app, name, flags = {}) => ({ origin: app, role: 'AXMenuItem', name, editable: false, ...flags }),
  popUp: (app, name = 'Action') => ({ origin: app, role: 'AXPopUpButton', name, editable: false }),
  /** The helper's placeholder for an open menu whose highlight it cannot read (PR #405). */
  openMenu: (app) => ({ origin: app, role: 'AXMenu', name: '', editable: false, menuOpen: true }),
})

/** Contexts as loop.mjs contextFor builds them. */
export const ctx = Object.freeze({
  web: (url, target, extra = {}) => ({ url, target, ...extra }),
  desk: (app, target, extra = {}) => ({ url: 'desktop://', frontmostBundleId: app, target, ...extra }),
  /** boundMenuItem: what a chord fires in the menu bar - none, unreadable, or the item (loop.mjs). */
  bound: Object.freeze({ none: { none: true }, unreadable: { unreadable: true }, item: (name, extra = {}) => ({ name, ...extra }) }),
  /** context.selection for an open of the selection (loop.mjs selectedItemsOf): items, or unreadable. */
  selection: (items, truncated = false) => ({ items: items.map(([name, kind = 'file']) => ({ name, kind })), ...(truncated ? { truncated: true } : {}) }),
  selectionUnread: { unreadable: true },
  /** context.paste: the run's own copy (with its source when known) or the owner's pasteboard. */
  pasteOwn: (source) => ({ fromOwner: false, ...(source ? { source } : {}) }),
  pasteOwner: { fromOwner: true },
})

/** The actions the drivers accept, in the loop's shape. */
export const act = Object.freeze({
  click: (x = 1, y = 1) => ({ type: 'click', x, y }),
  type: (text) => ({ type: 'type', text }),
  key: (...keys) => ({ type: 'keypress', keys }),
  hold: (...keys) => ({ type: 'hold_key', keys, duration: 1 }),
  drag: (from = { x: 10, y: 10 }, to = { x: 500, y: 500 }) => ({ type: 'drag', path: [from, to] }),
})

/**
 * Where each field is produced. `pending` names the pull request that adds it while it is not on main yet; the drift
 * test checks only fields without it, and a landing turns `pending` into a failure until this list is updated.
 */
export const SOURCES = Object.freeze([
  { field: 'inputType', file: '_environments_/chrome-browser/page-scripts.mjs' },
  { field: 'editable', file: '_environments_/chrome-browser/page-scripts.mjs' },
  { field: 'isPassword', file: '_environments_/chrome-browser/page-scripts.mjs' },
  { field: 'linkScheme', file: '_environments_/chrome-browser/environment.mjs' },
  { field: 'selectOption', file: '_environments_/chrome-browser/environment.mjs' },
  { field: 'radioChoice', file: '_environments_/chrome-browser/environment.mjs' },
  { field: 'optionUnread', file: '_environments_/chrome-browser/environment.mjs' },
  { field: 'readFailed', file: '_environments_/chrome-browser/environment.mjs' },
  { field: 'checked', file: '_environments_/chrome-browser/page-scripts.mjs', pending: 'PR #393' },
  { field: 'pressed', file: '_environments_/chrome-browser/page-scripts.mjs', pending: 'PR #393' },
  { field: 'sheet', file: '_environments_/macos-desktop/environment.mjs' },
  { field: 'defaultButton', file: '_environments_/macos-desktop/environment.mjs' },
  { field: 'caption', file: '_environments_/macos-desktop/environment.mjs' },
  { field: 'placeholder', file: '_environments_/macos-desktop/environment.mjs' },
  { field: 'nearbyLabel', file: '_environments_/macos-desktop/environment.mjs' },
  { field: 'filename', file: '_environments_/macos-desktop/environment.mjs' },
  { field: 'servicesMenu', file: '_environments_/macos-desktop/environment.mjs' },
  { field: 'menuOpen', file: '_environments_/macos-desktop/environment.mjs', pending: 'PR #405' },
  { field: 'quickActions', file: '_environments_/macos-desktop/environment.mjs', pending: 'PR #405 / #418' },
  { field: 'boundMenuItem', file: '_tools_/agent-core/loop.mjs' },
  { field: 'selection', file: '_tools_/agent-core/loop.mjs' },
  { field: 'typeOptions', file: '_tools_/agent-core/loop.mjs' },
  { field: 'dropTarget', file: '_tools_/agent-core/loop.mjs' },
  { field: 'dragSource', file: '_tools_/agent-core/loop.mjs' },
  { field: 'paste', file: '_tools_/agent-core/loop.mjs' },
  { field: 'fromOwner', file: '_tools_/agent-core/loop.mjs' },
  { field: 'frontmostBundleId', file: '_tools_/agent-core/loop.mjs' },
])
