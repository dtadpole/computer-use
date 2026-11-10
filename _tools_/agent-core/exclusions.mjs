import { isFixedDenied } from './sites.mjs'

/**
 * The hard exclusions of desktop runs (design: desktop-extension/app-policy.md, D-024, D-025). No approval lifts
 * them: an excluded app is never in a run's scope, never captured, never a target. The table is agent core's, in
 * code; run config may only add entries, which is how a check adds a stand-in excluded fixture bundle.
 */

export const EXCLUDED_APPS = Object.freeze([
  Object.freeze({
    kind: 'terminal',
    ids: Object.freeze([
      'com.apple.Terminal', 'com.googlecode.iterm2', 'dev.warp.*', 'com.mitchellh.ghostty', 'net.kovidgoyal.kitty',
      'org.alacritty', 'co.zeit.hyper', 'com.github.wez.wezterm', 'com.apple.ScriptEditor2', 'com.apple.Automator',
      'com.apple.shortcuts',
      // Launchers run arbitrary apps, scripts and shell commands (red-team retest).
      'com.runningwithcrayons.Alfred', 'com.raycast.macos',
      // CU-292 (cu-researcher): Spotlight (its Info.plist on this Mac) and LaunchBar (fleetdm software catalog).
      'com.apple.Spotlight', 'at.obdev.LaunchBar',
    ]),
  }),
  Object.freeze({
    kind: 'agent',
    // Chrome and Edge app shims (installed web apps) can host our own UIs, so they count as agents, not browsers.
    // CU-292: Perplexity's Mac app (ai.perplexity.macv3, mole.fit's tested apps) and its family.
    ids: Object.freeze(['com.reflection.cu-helper', 'com.openai.*', 'com.anthropic.*', 'com.google.Chrome.app.*', 'com.microsoft.edgemac.app.*', 'ai.perplexity.*']),
  }),
  Object.freeze({
    kind: 'password_manager',
    ids: Object.freeze([
      'com.1password.*', 'com.agilebits.*', 'com.bitwarden.desktop', 'org.keepassxc.keepassxc', 'com.apple.Passwords',
      'com.apple.keychainaccess', 'com.dashlane.*', 'com.lastpass.*', 'com.nordsec.nordpass',
      // CU-292 (fleetdm software catalog): Enpass (in.sinew.Enpass-Desktop.App; its maker's family), Proton Pass
      // (me.proton.pass.electron; the exact id covers its children), Keeper (com.keepersecurity.passwordmanager; family).
      'in.sinew.*', 'me.proton.pass', 'com.keepersecurity.*',
    ]),
  }),
  // CU-395 (High; cu-coordinator 03:01Z): Home and Find My act on doors, locks, alarms and devices in the physical world.
  Object.freeze({ kind: 'physical_control', ids: Object.freeze(['com.apple.Home', 'com.apple.findmy']) }),
  // A clipboard history shows what the person copied before the run; D-031 allows copy and paste, not reading that.
  Object.freeze({
    kind: 'clipboard_manager',
    // CU-292: Paste (com.wiheads.paste and com.wiheads.paste-direct, mole.fit's tested apps), so its maker's family.
    ids: Object.freeze(['org.p0deje.Maccy', 'com.clipy-app.Clipy', 'com.tapbots.Pastebot2Mac', 'com.tapbots.Pastebot3Mac', 'com.wiheads.*']),
  }),
  Object.freeze({
    kind: 'os_security',
    ids: Object.freeze([
      'com.apple.systempreferences', 'com.apple.SecurityAgent', 'com.apple.LocalAuthentication.UIAgent',
      'com.apple.loginwindow', 'com.apple.UserNotificationCenter',
      // The "open this downloaded app?" prompt and the package installer both run code the person has to accept.
      'com.apple.coreservices.uiagent', 'com.apple.installer',
      // CU-264 (cu-researcher; cu-coordinator: High): whole-Mac tools whose commands are destructive or act on every app -
      // Disk Utility (Erase, Restore, Partition), Boot Camp, Migration Assistant, Time Machine, Activity Monitor (Force
      // Quit). Approving one is not consent to them. Console stays a named limit (read-only).
      // Ids read from each app's Info.plist on macOS 27 (cu-developer-three); Boot Camp is Intel-only; com.apple.TimeMachine
      // also covers the menu-bar agent com.apple.timemachine.HelperAgent (an exact id matches its children, any case).
      'com.apple.DiskUtility', 'com.apple.bootcampassistant', 'com.apple.MigrateAssistant', 'com.apple.backup.launcher',
      'com.apple.TimeMachine', 'com.apple.ActivityMonitor',
    ]),
  }),
])

/** The fixed title marker our live view sets, so its browser window is recognised in any browser. */
export const LIVE_VIEW_TITLE_MARKER = '[cu live view]'

const BUNDLE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9.-]*(\.\*)?$/

/** `prefix.*` covers a family; an exact id covers its children too (com.apple.Terminal.helper is Terminal's). */
function matches(pattern, bundleId) {
  const p = pattern.toLowerCase()
  const id = bundleId.toLowerCase()
  return p.endsWith('.*') ? id.startsWith(p.slice(0, -1)) : id === p || id.startsWith(`${p}.`)
}

export class ExclusionConfigError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ExclusionConfigError'
    this.code = 'invalid_exclusion_config'
  }
}

/**
 * Create the run's exclusions. `extra` adds bundle-id patterns (exact, or a `prefix.*`); nothing can be removed.
 * Returns `{ isExcludedApp, isExcludedWindow, added }`; `added` is what run.json records.
 */
export function createExclusions({ extra = [] } = {}) {
  for (const pattern of extra) {
    if (typeof pattern !== 'string' || !BUNDLE_PATTERN.test(pattern)) throw new ExclusionConfigError(`'${pattern}' is not a bundle id or a 'prefix.*' pattern`)
  }
  const table = [...EXCLUDED_APPS, { kind: 'config', ids: Object.freeze([...extra]) }]

  /** `{ excluded, kind, rule }`; an unknown app (no bundle id) is excluded: fail closed. */
  function isExcludedApp(bundleId) {
    if (typeof bundleId !== 'string' || bundleId.trim() === '') return { excluded: true, kind: 'unknown', rule: 'no bundle id' }
    const id = bundleId.trim() // ' com.apple.Terminal' must not slip past the table
    for (const { kind, ids } of table) {
      const rule = ids.find((pattern) => matches(pattern, id))
      if (rule) return { excluded: true, kind, rule }
    }
    return { excluded: false, kind: null, rule: null }
  }

  /** A window is excluded when its app is, when it shows our live view, or when it shows a fixed-deny loopback page. */
  function isExcludedWindow({ bundleId, title = '', url = null } = {}) {
    const app = isExcludedApp(bundleId)
    if (app.excluded) return app
    if (typeof title === 'string' && title.includes(LIVE_VIEW_TITLE_MARKER)) return { excluded: true, kind: 'live_view', rule: 'title marker' }
    if (typeof url === 'string' && url !== '' && isFixedDenied(url)) return { excluded: true, kind: 'own_ui', rule: 'fixed-deny loopback page' }
    return { excluded: false, kind: null, rule: null }
  }

  return { isExcludedApp, isExcludedWindow, added: Object.freeze([...extra]) }
}
