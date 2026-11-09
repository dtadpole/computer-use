import ApplicationServices
import CoreGraphics
import Foundation

/// The helper's identity; `build.sh` writes the same bundle id into Info.plist.
enum HelperIdentity {
  static let bundleId = "com.reflection.cu-helper"
  static let version = "0.2.65"
  /// The value every synthetic event carries in `kCGEventSourceUserData`: 0x43555345, ASCII "CUSE"
  /// (input-and-targets.md, verify-kit's SYNTHETIC_TAG). Not a secret: an event from another process with this tag
  /// could only fail to pause the run, never act.
  static let eventTag: Int64 = 0x4355_5345
  /// The fixed title marker of the live view's browser window; such a window is never captured or targeted.
  static let liveViewMarker = "[cu live view]"
}

/// The TCC grants, read only through the documented prompt-free preflights. The prompting variants are never called,
/// except `CGRequestScreenCaptureAccess` and `AXIsProcessTrustedWithOptions` with the prompt option in
/// `--request-grants` (RequestGrants.swift), which only the owner runs (owner request, 2026-11-05); the event-access
/// requests and `IOHIDRequestAccess` are never called at all.
struct Grants: Equatable, Sendable {
  var screen: Bool
  var accessibility: Bool
  var postEvents: Bool
  var listenEvents: Bool

  static func preflight() -> Grants {
    Grants(screen: CGPreflightScreenCaptureAccess(), accessibility: AXIsProcessTrusted(),
           postEvents: CGPreflightPostEventAccess(), listenEvents: CGPreflightListenEventAccess())
  }

  static let none = Grants(screen: false, accessibility: false, postEvents: false, listenEvents: false)

  var any: Bool { screen || accessibility || postEvents || listenEvents }

  /// `accessibility` gates input too, and posting needs post-event access as well as the Accessibility grant.
  func has(_ grant: String) -> Bool {
    switch grant {
    case "screen": return screen
    case "accessibility": return accessibility
    case "input": return accessibility && postEvents
    case "listenEvents": return listenEvents
    default: return false
    }
  }

  /// The hello's grants (desktop-extension 0.3.1): `{screen, accessibility, postEvents, listenEvents}`.
  var json: JSON {
    .object(["screen": .bool(screen), "accessibility": .bool(accessibility), "postEvents": .bool(postEvents), "listenEvents": .bool(listenEvents)])
  }
}

/// A floor under agent core's exclusion table (app-policy.md 0.3.4, the source of truth; D-024, D-025): these apps are never
/// put in scope, captured or targeted whatever the driver asks. Agent core's table (C1) decides first; this copy
/// makes the process that holds the grants refuse on its own too. It may be stricter, never looser.
/// Every entry matches its id and every id under it (`x` and `x.*`, as agent core's table since PR #187); case is
/// ignored. A trailing `.*` or `.` is accepted as the same prefix form.
struct Exclusions {
  static let builtIn: [String] = [
    // terminals and code runners (D-025 adds the scripting apps)
    "com.apple.Terminal", "com.googlecode.iterm2", "dev.warp.*", "com.mitchellh.ghostty", "net.kovidgoyal.kitty",
    "org.alacritty", "co.zeit.hyper", "com.github.wez.wezterm", "com.apple.ScriptEditor2", "com.apple.Automator",
    "com.apple.shortcuts", "com.runningwithcrayons.Alfred", "com.raycast.macos",
    // CU-292: launchers Spotlight and LaunchBar
    "com.apple.Spotlight", "at.obdev.LaunchBar",
    // our own helper and other agents, and browsers' web-app shims (which can host them)
    HelperIdentity.bundleId, "com.openai.*", "com.anthropic.*", "com.google.Chrome.app.*", "com.microsoft.edgemac.app.*",
    "ai.perplexity.*",
    // password managers
    "com.1password.*", "com.agilebits.*", "com.bitwarden.desktop", "org.keepassxc.keepassxc", "com.apple.Passwords",
    "com.apple.keychainaccess", "com.dashlane.*", "com.lastpass.*", "com.nordsec.nordpass",
    // CU-292: Enpass (its maker's family), Proton Pass (the exact id covers me.proton.pass.electron), Keeper
    "in.sinew.*", "me.proton.pass", "com.keepersecurity.*",
    // clipboard managers (the pasteboard is the owner's, D-025)
    "org.p0deje.Maccy", "com.clipy-app.Clipy", "com.tapbots.Pastebot2Mac", "com.tapbots.Pastebot3Mac", "com.wiheads.*",
    // OS security: System Settings whole (D-025) and its pane extensions, authentication and alert agents
    "com.apple.systempreferences", "com.apple.settings.*", "com.apple.SecurityAgent",
    "com.apple.LocalAuthentication.UIAgent", "com.apple.loginwindow", "com.apple.UserNotificationCenter",
    "com.apple.coreservices.uiagent", "com.apple.installer",
    // CU-264: whole-Mac tools - Disk Utility (Erase, Restore, Partition), Boot Camp, Migration Assistant, Time Machine
    // (its launcher, and com.apple.TimeMachine, which covers the menu-bar agent com.apple.timemachine.HelperAgent), Activity
    // Monitor (Force Quit). Ids read from each app's Info.plist on macOS 27; Console stays approvable (read-only).
    "com.apple.DiskUtility", "com.apple.bootcampassistant", "com.apple.MigrateAssistant", "com.apple.backup.launcher",
    "com.apple.TimeMachine", "com.apple.ActivityMonitor",
  ]

  let entries: [String]

  /// The built-in table plus additions (`--exclude`): a run may only add.
  init(additions: [String] = []) {
    var seen = Set<String>()
    entries = (Self.builtIn + additions).filter { !$0.isEmpty && seen.insert($0.lowercased()).inserted }
  }

  /// The entry that excludes `bundleId`, or nil.
  func match(_ bundleId: String) -> String? {
    let id = bundleId.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    for entry in entries {
      var base = entry.lowercased()
      if base.hasSuffix(".*") { base = String(base.dropLast(2)) } else if base.hasSuffix(".") { base = String(base.dropLast()) }
      if id == base || id.hasPrefix(base + ".") { return entry }
    }
    return nil
  }

  func isExcluded(_ bundleId: String) -> Bool { match(bundleId) != nil }
}

/// Which windows a capture may show (capture-and-scaling.md 0.4.6): the owner's bundle id as ScreenCaptureKit reports
/// it and as AppKit resolves the owner's pid must both be present, agree, and be in the run's scope - never a match
/// by process or executable name.
enum CaptureScope {
  static func approves(sckBundleId: String?, appKitBundleId: String?, scope: [String]) -> Bool {
    guard let sckBundleId, let appKitBundleId, sckBundleId == appKitBundleId else { return false }
    return scope.contains(appKitBundleId)
  }
}

/// Who owns a point (design input-and-targets.md 0.4.11, D-037): Accessibility's hit test named CU Fixture where
/// same-named CU Ledger's window was on top. WindowServer's topmost window owner wins whenever it is another process
/// than the Accessibility element's - an app outside the scope, or a process with no bundle id, is then out of scope.
enum OwnerRule {
  static func overrides(axPid: pid_t, topPid: pid_t?) -> Bool {
    guard let topPid else { return false }
    return topPid != axPid
  }

  enum Side: Equatable { case window, element }

  /// CU-39 (D-045): when Accessibility's element at the point belongs to another process than the window WindowServer
  /// names there, the unapproved one is the owner - an approved app's window that shows another process's content (a
  /// remote view, such as the open/save panel service's) never lends that content its approval. Both approved: the
  /// window's owner, as before.
  /// CU-199: Accessibility's element at the point belongs to a click-through overlay - its process has an on-screen
  /// window listed ABOVE the hit window that contains the point, which WindowServer's hit test passed through (a
  /// dictation bubble beside a focused field, say). A click there goes to the hit window, so the element names no owner
  /// and CU-39's mismatch rule does not apply. A remote view (the panel service's content inside its client's sheet) has
  /// no window of its own above, so it keeps the element side. `windows` front to back, as CGWindowList gives them.
  /// The overlay must sit on a higher layer than the hit window (cu-researcher): an ordinary window of the same layer
  /// that WindowServer skipped is a contradiction, refused, not trusted. Returns the overlay window, or nil.
  static func clickThroughOverlay(elementPid: pid_t, hitNumber: CGWindowID, windows: [WindowOwners.Window], point: CGPoint) -> WindowOwners.Window? {
    guard let hitIndex = windows.firstIndex(where: { $0.number == hitNumber }) else { return nil }
    let hit = windows[hitIndex]
    return windows[..<hitIndex].first { $0.pid == elementPid && $0.layer > hit.layer && $0.bounds.contains(point) }
  }

  static func mismatchOwner(windowApproved: Bool, elementApproved: Bool) -> Side {
    if !windowApproved { return .window }
    return elementApproved ? .window : .element
  }

  /// The hit test's reply when the element is another process's than the window: owner only, by the input rule, with
  /// the element's own process named beside it (CU-39), so the driver can refuse the point unless it is attributed.
  /// Live and the dry run both answer with this.
  static func foreignContent(window: AppRef, element: AppRef, scope: [String]) -> JSON {
    let side = mismatchOwner(windowApproved: window.bundleId.map { scope.contains($0) } ?? false, elementApproved: element.bundleId.map { scope.contains($0) } ?? false)
    let named = side == .window ? window : element
    guard case .object(var fields) = Accessibility.unapproved(bundleId: named.bundleId, pid: named.pid) else { return .null }
    fields["elementOwner"] = .object(["bundleId": .optionalString(element.bundleId), "pid": .int(Int(element.pid))])
    return .object(fields)
  }
}

/// System-presented privacy and permission prompts (CU-76): Allow Paste, TCC and authentication dialogs. Input to one
/// is never the agent's, even inside an approved app's window. Recognised from structure only, never from a title:
/// - a window owned by a system prompt process;
/// - another process's content inside the hit window whose executable lives in the system (a view service drawn
///   inside the app), except the open/save panel service, which is attributed and handled by CU-39;
/// - an element or ancestor with the AXSystemDialog subrole.
/// Targets carry `systemPrompt: true`, capture replies report one present, and the helper refuses pointer input to one
/// and key input while one has focus (`system_prompt`).
enum SystemPrompt {
  static let owners = [
    "com.apple.UserNotificationCenter", "com.apple.SecurityAgent", "com.apple.LocalAuthentication.UIAgent",
    "com.apple.coreservices.uiagent", "com.apple.accessibility.universalAccessAuthWarn", "com.apple.tccd",
  ]
  static let dialogSubrole = "AXSystemDialog"
  static let systemRoots = ["/System/", "/usr/libexec/", "/usr/sbin/", "/usr/bin/"]

  static func isOwner(_ bundleId: String?) -> Bool {
    guard let bundleId else { return false }
    return owners.contains { $0.caseInsensitiveCompare(bundleId) == .orderedSame }
  }

  static func isSystemPath(_ path: String?) -> Bool {
    guard let path else { return false }
    return systemRoots.contains { path.hasPrefix($0) }
  }

  /// Whether a target is part of a system prompt: the hit window's owner, the foreign content's process (bundle and
  /// executable) when the element is another process's, and the subroles of the element and its ancestors.
  /// A target with `systemPrompt: true` added when `marked`.
  static func withMark(_ target: JSON, _ marked: Bool) -> JSON {
    guard marked, case .object(var fields) = target else { return target }
    fields["systemPrompt"] = .bool(true)
    return .object(fields)
  }

  static func marks(windowOwner: String?, foreignBundleId: String?, foreignPath: String?, subroles: [String?]) -> Bool {
    if isOwner(windowOwner) || isOwner(foreignBundleId) { return true }
    if foreignPath != nil || foreignBundleId != nil, foreignBundleId != PanelAttribution.serviceBundleId, isSystemPath(foreignPath) { return true }
    return subroles.contains { $0 == dialogSubrole }
  }
}

/// The AppKit open and save panels mark their window with these Accessibility identifiers: a target inside one gets
/// `panel`, so agent core treats its commits as file_choice even when the panel runs in the app's own process (CU-39,
/// measured: CU Fixture's save sheet is in-process; design file-panels.md). Never a title. A walk that ends in an
/// Accessibility error or at its depth limit before reaching a window or the app is `unknown` - asked each time, never
/// read as 'not a panel' (cu-researcher's fail-closed edge).
enum PanelMarker {
  static let identifiers = ["save-panel": "save", "open-panel": "open"]
  static let maxDepth = 40

  /// How the ancestor walk ended: at a window or the application (a clean top), at an Accessibility error, or at the
  /// depth limit.
  enum Ending: Equatable { case top, error, limit }

  /// `path`: the element and its ancestors, nearest first (identifier, role).
  static func kind(path: [(identifier: String?, role: String?)], ending: Ending) -> String? {
    for node in path.prefix(maxDepth) {
      if let identifier = node.identifier, let kind = identifiers[identifier] { return kind }
      if node.role == "AXWindow" || node.role == "AXApplication" { return nil }
    }
    return ending == .top ? nil : "unknown"
  }
}

/// CU-329 (helper-boundary 0.3.12): the helper's one Accessibility write - AXManualAccessibility = true on an approved
/// app - is undone at the run's end. Read first: an app that already has it set is left alone and not remembered.
/// Otherwise the pid is remembered, and every end writes false back once for each remembered pid still running. Safe
/// from any thread: the lock guards only the set, never an Accessibility call.
enum ManualAccessibilityRestore {
  private static let lock = NSLock()
  private static var remembered = Set<pid_t>()

  /// What the read before the write found: set, unset (false, or "no value"/"unsupported"), or a failed read.
  enum Prior: Hashable { case on, unset, unreadable }

  /// Whether to write true (and remember the pid): only when the read says unset. Already on - the user's or another
  /// assistive app's - is left alone, and a failed read writes nothing (cu-developer-one, helper-boundary 0.3.12).
  static func shouldWrite(prior: Prior) -> Bool { prior == .unset }

  static func remember(_ pid: pid_t) {
    lock.lock(); remembered.insert(pid); lock.unlock()
  }

  /// How the reads before the write came out this run, for the end's log line (cu-researcher: which error an Electron
  /// app returns for an unset attribute shows up here after any run that touched one). Counts only, never a name.
  private static var reads: [Prior: Int] = [:]
  static func recordRead(_ prior: Prior) { lock.lock(); reads[prior, default: 0] += 1; lock.unlock() }
  static func clearReads() { lock.lock(); reads = [:]; lock.unlock() }
  static func readSummary() -> String? {
    lock.lock(); let counts = reads; lock.unlock()
    guard !counts.isEmpty else { return nil }
    return "unset \(counts[.unset] ?? 0), on \(counts[.on] ?? 0), unreadable \(counts[.unreadable] ?? 0)"
  }

  /// The remembered pids to write false back to: those still running, in order.
  static func toRestore(_ pids: Set<pid_t>, isRunning: (pid_t) -> Bool) -> [pid_t] { pids.filter(isRunning).sorted() }

  /// Takes the remembered set once and writes false back to each pid still running; returns the pids written.
  @discardableResult
  static func restoreAll(write: (pid_t) -> Void, isRunning: (pid_t) -> Bool) -> [pid_t] {
    lock.lock(); let taken = remembered; remembered.removeAll(); lock.unlock()
    let pids = toRestore(taken, isRunning: isRunning)
    for pid in pids { write(pid) }
    return pids
  }

  /// Whether a process still exists (kill with signal 0; EPERM means it exists under another user).
  static func processRuns(_ pid: pid_t) -> Bool { kill(pid, 0) == 0 || errno == EPERM }
}

/// CU-322 (D-089): whether an element is, or descends from, an AXWebArea - the page of a browser that exposes its web
/// content (Safari; Chrome with accessibility on), where a hit-test lands on a button or field inside the page. Read
/// from the same ancestor walk as the panel marker: `path` is the element and its ancestors, nearest first (roles).
/// true at an AXWebArea before a window or the application; false at a clean top without one; nil (unknown) when the
/// walk ended at an Accessibility error or the depth limit - agent core treats unknown in a browser as web content.
enum WebArea {
  static let role = "AXWebArea"

  static func contains(path: [String?], ending: PanelMarker.Ending) -> Bool? {
    for role in path.prefix(PanelMarker.maxDepth) {
      if role == Self.role { return true }
      if role == "AXWindow" || role == "AXApplication" { return false }
    }
    return ending == .top ? false : nil
  }
}

/// What lies at a point that no approved window owns, for a drag's held moves (Q-D12, design input-and-targets.md).
enum DesktopPoint: Equatable {
  /// Bare desktop: no window above Finder's desktop, and Finder's desktop itself (not an icon) under the point.
  case bare
  /// One of Finder's desktop icons or its label - a window for this rule.
  case icon
  /// Anything else: another app's window, a widget, the Dock, the menu bar.
  case other
}

/// Q-D12: a drag's held moves may cross approved windows or bare desktop, never a screen corner (hot corners trigger
/// by position, whatever the owner); press and release keep every check.
enum DragPath {
  /// Points within this distance of a display's corner, on both axes, count as the corner.
  static let cornerSize: CGFloat = 8

  static func nearCorner(_ point: CGPoint, displays: [DisplayInfo]) -> Bool {
    displays.contains { display in
      let b = display.bounds
      guard point.x >= b.minX, point.x <= b.maxX, point.y >= b.minY, point.y <= b.maxY else { return false }
      let nearX = point.x - b.minX < cornerSize || b.maxX - point.x <= cornerSize
      let nearY = point.y - b.minY < cornerSize || b.maxY - point.y <= cornerSize
      return nearX && nearY
    }
  }

  /// Finder's Accessibility roles for its desktop itself; any other Finder element at the point is an icon or label.
  /// Measured live before this rule ships (CU-36).
  static let finderDesktopRoles: Set<String> = ["AXScrollArea", "AXGroup"]

  static func classify(finderRole: String?) -> DesktopPoint {
    finderRole.map { finderDesktopRoles.contains($0) } == true ? .bare : .icon
  }
}

/// file-panels.md (#84), the remote case: a sandboxed app's panel is drawn in the client's own sheet window, while its
/// content and Accessibility elements belong to the panel service. That content counts as the client only when the
/// window at the point is owned by the frontmost, approved client, it is that client's attached sheet (its bounds equal
/// an AXSheet frame of the client's focused window, within a point, and it lies directly above a window of the client),
/// and the element belongs to the panel service, its executable on the system volume. Anything else stays foreign
/// (OwnerRule.mismatchOwner refuses it). Never by title.
enum PanelAttribution {
  static let serviceBundleId = "com.apple.appkit.xpc.openAndSavePanelService"
  static let tolerance: CGFloat = 1

  static func attributes(windowOwnerIsFrontmostClient: Bool, clientApproved: Bool, windowBounds: CGRect, sheetFrames: [CGRect], aboveClientWindow: Bool,
                         elementBundleId: String?, elementIsSystem: Bool) -> Bool {
    guard windowOwnerIsFrontmostClient, clientApproved, aboveClientWindow, elementBundleId == serviceBundleId, elementIsSystem else { return false }
    return sheetFrames.contains { sheet in
      abs(sheet.minX - windowBounds.minX) <= tolerance && abs(sheet.minY - windowBounds.minY) <= tolerance
        && abs(sheet.width - windowBounds.width) <= tolerance && abs(sheet.height - windowBounds.height) <= tolerance
    }
  }
}

/// The path a file_choice request shows (file-panels.md): canonical - the folder's symlinks resolved, the file joined
/// to it (resolved too when it exists; a new Save name keeps its last component) - and escaped so it cannot be misread:
/// Unicode control and format characters (bidi overrides, zero-width marks, line breaks) and the backslash itself are
/// written as \u{XXXX} and \\.
/// CU-180 (desktop twin of CU-175/176): the control a click activates. The system hit test returns the DEEPEST
/// element - in web content a label or icon inside a button or link, or inside a clickable group - so from a leaf
/// (static text, image, unnamed group, unknown) the walk climbs to the nearest actionable ancestor: a button-like role
/// or an element whose actions include AXPress. It stops at the window, a sheet, the web area or the application,
/// and never climbs from an element that is itself actionable or not a leaf (a native control is its own target).
enum Actionable {
  struct Node: Equatable {
    var role: String?; var actions: [String]; var titled: Bool
    var frame: CGRect? = nil
    var childCount: Int? = nil
  }
  /// The element to describe, and whether AXPress means anything there (false under root delegation).
  struct Pick: Equatable { var index: Int; var pressSignal: Bool }
  static let roles: Set<String> = ["AXButton", "AXLink", "AXMenuItem", "AXMenuButton", "AXCheckBox", "AXRadioButton", "AXPopUpButton", "AXDisclosureTriangle"]
  static let leafRoles: Set<String> = ["AXStaticText", "AXImage", "AXGroup", "AXUnknown"]
  static let stopRoles: Set<String> = ["AXWindow", "AXSheet", "AXWebArea", "AXApplication"]
  static let maxHops = 8

  static func isActionable(_ node: Node, press: Bool = true) -> Bool { node.role.map { roles.contains($0) } ?? false || (press && node.actions.contains("AXPress")) }

  /// Root delegation (cu-developer-two; the desktop twin of the browser's body-pointer rule): WebKit gives an element
  /// AXPress when ANY ancestor has a click listener, and React and other frameworks attach every listener to a page-wide
  /// container - so every text under it is 'pressable'. A press such a container carries says nothing: an ancestor on
  /// the chain below AXWebArea, at any depth (Next.js #__next > div, Vue #app > div.app - cu-researcher), carries
  /// AXPress and is the page - the web area's only child, or at least 90% of its width and half its height. WebKit
  /// leaves plain wrapper divs out of the tree, so a small clickable element near the top keeps its press.
  static func rootDelegated(_ chain: [Node]) -> Bool {
    guard let web = chain.firstIndex(where: { $0.role == "AXWebArea" }), web >= 1 else { return false }
    let area = chain[web]
    for index in 1..<web where chain[index].actions.contains("AXPress") {
      if index == web - 1, area.childCount == 1 { return true }
      guard let inner = chain[index].frame, let outer = area.frame, outer.width > 0, outer.height > 0 else { continue }
      if inner.width >= 0.9 * outer.width && inner.height >= 0.5 * outer.height { return true }
    }
    return false
  }

  /// Content leaves - text and images - climb even when they carry AXPress themselves: WebKit gives the text inside a
  /// clickable <div> its ancestor's press (cu-verifier's 0.2.42 row: delete-div stayed an unnamed AXStaticText).
  static let contentRoles: Set<String> = ["AXStaticText", "AXImage"]

  /// The element to describe in `chain` (the hit element first, then its ancestors nearest first, up to the web area
  /// or window), and whether a press counts there.
  static func choose(_ chain: [Node]) -> Pick {
    let press = !rootDelegated(chain)
    guard let hit = chain.first, hit.role.map({ leafRoles.contains($0) }) ?? true else { return Pick(index: 0, pressSignal: press) }
    if isActionable(hit, press: press), !(hit.role.map { contentRoles.contains($0) } ?? false) { return Pick(index: 0, pressSignal: press) }
    // A named group is a target in its own right (a labelled region); only an unnamed one is a leaf.
    if hit.role == "AXGroup", hit.titled { return Pick(index: 0, pressSignal: press) }
    for index in chain.indices.dropFirst().prefix(maxHops) {
      let node = chain[index]
      if let role = node.role, stopRoles.contains(role) { break }
      if isActionable(node, press: press) { return Pick(index: index, pressSignal: press) }
    }
    return Pick(index: 0, pressSignal: press)
  }

  static func pick(_ chain: [Node]) -> Int { choose(chain).index }
}

/// CU-180: an element's name. Its own title or description first; else an actionable control takes the display text of
/// the labels inside it (the AXStaticText values below it - display text, never a text entry's or a secure field's
/// value, D-060). Anything else stays unnamed - a bare paragraph too: reading text never takes a name, the browser's
/// rule (cu-researcher, CU-176's designer), so a mail body or help text that mentions 'delete' is not asked about.
enum TargetName {
  /// A pressable static text (a clickable text, WebKit's AXPress on the words of a <div onclick>) is named by its own
  /// words - text a click activates, as the browser names an onclick target (cu-developer-one's rule). Plain reading
  /// text, which carries no press, stays unnamed.
  static func pick(own: String?, role: String?, actionable: Bool, displayText: () -> String?, staticValue: () -> String? = { nil }) -> String? {
    if let own, !own.isEmpty { return own }
    guard actionable else { return nil }
    if role == "AXStaticText" {
      return staticValue().map { String($0.trimmingCharacters(in: .whitespacesAndNewlines).prefix(80)) }.flatMap { $0.isEmpty ? nil : $0 }
    }
    return displayText()
  }
}

/// CU-190: the default button as read - `button` the element shape or null, `read` true only when the read reached a
/// sheet or window and AXDefaultButton answered (a button, or a positive none: no value, attribute unsupported); false
/// when any read on the way failed (focus unreadable, AX refused or timed out, no window), so agent core can ask
/// instead of treating an unreadable default button as none (CU-188's fail-open).
struct DefaultButtonRead: Equatable {
  var button: JSON
  var read: Bool
  static let failed = DefaultButtonRead(button: .null, read: false)
}

/// CU-190: what an Accessibility read's error code says - a value, a positive none, or a failure.
enum AXRead: Equatable {
  case value, none, failed
  static func outcome(_ code: AXError) -> AXRead {
    switch code {
    case .success: return .value
    case .noValue, .attributeUnsupported: return .none
    default: return .failed
    }
  }
}

/// CU-187: the caption of a NON-entry element - the label that says what it shows, for a copy or drag from it (an IBAN
/// shown as text beside the label 'IBAN'). Copy-caption rule 2 (cu-developer-one, (b)): its AXTitleUIElement's text;
/// else its column's header JOINED with its row's key - the row header (AXRowHeaderUIElements at the row's AXIndex), or
/// in a two-cell row its first cell. A two-cell row cannot tell key | value from a two-column data table, and the join
/// carries the class either way: 'Field | Value' / 'IBAN | x' -> 'Value · IBAN'; 'Name | IBAN' / 'Ada | x' ->
/// 'IBAN · Ada'; headerless 'IBAN | x' -> 'IBAN'; a wide data table without row headers -> its column header. Display
/// text of other elements only - never the element's own value - trimmed and capped at 80 characters; null for a text
/// entry (its name already says) or when none is found. A first-column datum can sit inside the caption (never
/// recorded, meets only word rules - a named limit).
/// CU-349: a field's placeholder (AXPlaceholderValue) - the words a page or app shows in an empty box ('One-time code',
/// 'CVV') - reported beside the name so the consent field rules can ask where no title or caption was read. Entry roles
/// only (and a secure field); trimmed; more than 80 characters reads as none, never cut mid-word; empty reads as none.
/// Never the field's value: describe() reads AXPlaceholderValue, not AXValue, for an entry.
enum Placeholder {
  static let maxLength = 80
  static func applies(role: String?) -> Bool { role.map { TextEntries.entryRoles.contains($0) || $0 == "AXSecureTextField" } ?? false }
  static func pick(role: String?, raw: String?) -> String? {
    guard applies(role: role) else { return nil }
    guard let text = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty, text.count <= maxLength else { return nil }
    return text
  }
}

/// CU-377: whether a pasteboard's type names say it holds a file - a file URL (public.file-url) or the legacy filenames
/// type. Type names only: no path, no content (D-060). nil when the types could not be read (the caller asks).
enum PasteboardTypes {
  static let fileTypes: Set<String> = ["public.file-url", "NSFilenamesPboardType"]
  static func hasFile(_ types: [String]?) -> Bool? {
    guard let types else { return nil }
    return types.contains { fileTypes.contains($0) }
  }
}

/// CU-372: a pop-up button's menu items as AX shows them while it is closed - read from its AXMenu child, never by
/// opening it (no AXPress, no AXShowMenu). The driver turns the shape into the items a type or an arrow moves the button
/// through (typeOptions / keyTarget, as CU-370 does for a web select). Unread is never an empty list: no menu child, a
/// failed read, no titled item, or more than 50 items give `unread: true`, which agent core asks on. Pure, so the unit
/// tests decide it.
enum PopUpItems {
  static let maxItems = 50
  static let maxTitle = 80
  struct Item {
    let title: String?
    let enabled: Bool?
  }

  /// `items` nil when no AXMenu child could be read. Separators (no title) are skipped; titles are trimmed and cut at
  /// 80 characters; an item whose AXEnabled cannot be read counts as enabled (it may be landed on - the safe side).
  /// `pullsDown`: a pull-down button (AppKit gives it AXMenuButton) - its title is a fixed label and Return or Space
  /// opens a menu of actions, so the shape says so and its selected index is never read (cu-researcher's case 2).
  static func shape(selected: String?, items: [Item]?, pullsDown: Bool = false) -> JSON {
    let chosen = selected.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.flatMap { $0.isEmpty ? nil : String($0.prefix(maxTitle)) }
    var unreadShape: [String: JSON] = ["unread": .bool(true), "selected": .optionalString(chosen)]
    if pullsDown { unreadShape["pullsDown"] = .bool(true) }
    let unread = JSON.object(unreadShape)
    guard let items else { return unread }
    let titled = items.compactMap { item -> (title: String, enabled: Bool)? in
      guard let title = item.title?.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty else { return nil }
      return (String(title.prefix(maxTitle)), item.enabled ?? true)
    }
    guard !titled.isEmpty, titled.count <= maxItems else { return unread }
    // cu-researcher's case 1: a selected title two items share leaves the neighbour of an arrow unknown - unread.
    if let chosen, titled.filter({ $0.title == chosen }).count > 1 { return unread }
    let index = pullsDown ? nil : chosen.flatMap { name in titled.firstIndex { $0.title == name } }
    var read: [String: JSON] = [
      "items": .array(titled.map { .object(["title": .string($0.title), "enabled": .bool($0.enabled)]) }),
      "selected": .optionalString(chosen),
      "selectedIndex": index.map { .int($0) } ?? .null,
    ]
    if pullsDown { read["pullsDown"] = .bool(true) }
    return .object(read)
  }
}

/// CU-361: the layout label of an unnamed entry - a static text beside it on screen, as VoiceOver reads one when no
/// AXTitleUIElement links them: a plain box whose only label sits to its left ('Password  [      ]') or just above it.
/// describe() asks for it only for an entry with no title, no caption and no placeholder; agent core uses it
/// upgrade-only (it can make a field ask, never stop one asking). Frames are global top-left points (y grows down).
/// Left: the candidate ends at or before the box's left edge (2 pt slack), at most `leftGap` away, its centre within
/// half the box's height of the box's centre (the same row); the nearest wins. Else above: the candidate ends at or
/// before the box's top (2 pt slack), at most `aboveGap` away, overlapping the box horizontally; the nearest wins. Left
/// beats above. Trimmed; empty or more than 80 characters reads as none, never cut. Static texts' shown words only -
/// never the entry's own value. Named limits (cu-researcher, #386): a right-to-left layout's label on the right is not
/// read; a window past the 400-descendant walk gives none (today's behaviour). The driver drops a sensitive-looking value.
enum NearbyLabel {
  static let maxLength = 80
  static let leftGap: CGFloat = 120
  static let aboveGap: CGFloat = 24
  struct Candidate { let text: String; let frame: CGRect }

  static func pick(box: CGRect, candidates: [Candidate]) -> String? {
    let left = candidates
      .filter { $0.frame.maxX <= box.minX + 2 && box.minX - $0.frame.maxX <= leftGap && abs($0.frame.midY - box.midY) <= box.height / 2 }
      .min { box.minX - $0.frame.maxX < box.minX - $1.frame.maxX }
    let above = candidates
      .filter { $0.frame.maxY <= box.minY + 2 && box.minY - $0.frame.maxY <= aboveGap && $0.frame.maxX > box.minX && $0.frame.minX < box.maxX }
      .min { box.minY - $0.frame.maxY < box.minY - $1.frame.maxY }
    guard let text = (left ?? above)?.text.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty, text.count <= maxLength else { return nil }
    return text
  }
}

enum Caption {
  /// CU-209: which elements count as text entries for the caption rule - an entry role whose value can be set (or a
  /// secure field, always). A read-only text view (AXTextArea, value not settable) shows text like a label does, so it
  /// is captioned like displayed text; an editable entry's own name already says what it is.
  static func isEntry(role: String?, settable: Bool) -> Bool {
    guard let role else { return false }
    if role == "AXSecureTextField" { return true }
    return TextEntries.entryRoles.contains(role) && settable
  }

  static func pick(isEntry: Bool, titleElement: String?, columnHeader: String?, rowHeader: String? = nil, rowFirstCell: String?) -> String? {
    guard !isEntry else { return nil }
    func clean(_ text: String?) -> String? { text.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.flatMap { $0.isEmpty ? nil : $0 } }
    if let title = clean(titleElement) { return String(title.prefix(80)) }
    let key = clean(rowHeader) ?? clean(rowFirstCell)
    switch (clean(columnHeader), key) {
    // Deduplicated, as the browser half: a key equal to its column header says it once.
    case let (column?, key?) where column.caseInsensitiveCompare(key) == .orderedSame: return String(column.prefix(80))
    case let (column?, key?): return String("\(column) · \(key)".prefix(80))
    case let (column?, nil): return String(column.prefix(80))
    case let (nil, key?): return String(key.prefix(80))
    default: return nil
    }
  }

  /// A target lifted from the hit (a value inside a pressable row or card) takes the hit leaf's caption first, else its
  /// own (cu-developer-two's residual; policy reads a caption only for a copy or drag source, never a click's verdict).
  static func forTarget(own: String?, leaf: String?) -> String? { leaf ?? own }
}

/// CU-157: a window's text entries judged by character counts alone. `read` gives each element's role, subrole and
/// count (nil when the attribute fails) and its children, so the rule is testable without Accessibility.
enum TextEntries {
  static let entryRoles: Set<String> = ["AXTextField", "AXTextArea", "AXComboBox", "AXSearchField"]
  static let limit = 4000

  struct Node { var role: String?; var subrole: String?; var count: Int?; var children: [Node] }

  /// True if any entry has characters; else nil if anything was unread (a secure field, web content, an entry with
  /// no count, the walk's cap) or the window has no text entry at all (a custom-drawn editor exposes no entry role -
  /// cu-verifier); else false.
  static func judge(_ root: Node) -> Bool? {
    var unread = false, seen = 0, entries = 0, stack = [root]
    while let node = stack.popLast() {
      seen += 1
      if seen > limit { unread = true; break }
      let role = node.role ?? ""
      if role == "AXWebArea" { unread = true; continue }
      if node.subrole == "AXSecureTextField" || role == "AXSecureTextField" { unread = true; continue }
      if entryRoles.contains(role) {
        entries += 1
        guard let count = node.count else { unread = true; continue }
        if count > 0 { return true }
      }
      stack.append(contentsOf: node.children)
    }
    return unread || entries == 0 ? nil : false
  }

  /// A live scan that hit its own budget is unread unless text was already found.
  static func afterCap(_ verdict: Bool?, capped: Bool) -> Bool? { capped && verdict != true ? nil : verdict }
}

/// CU-154: a menu item's key equivalent as the protocol carries it - `char` (1-4 characters, no control characters,
/// else null) and `modifiers` (AXMenuItemCmdModifiers, 0-15: Command alone is 0; +1 Shift, +2 Option, +4 Control,
/// +8 no Command; else null), each validated on its own; nil when neither is usable.
enum KeyEquivalent {
  static func shape(char: String?, modifiers: Int?) -> JSON? {
    let usableChar = char.flatMap { value -> String? in
      guard (1...4).contains(value.count), !value.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }) else { return nil }
      return value
    }
    let usableModifiers = modifiers.flatMap { (0...15).contains($0) ? $0 : nil }
    guard usableChar != nil || usableModifiers != nil else { return nil }
    return .object(["char": .optionalString(usableChar), "modifiers": usableModifiers.map { .int($0) } ?? .null])
  }
}

/// CU-148: whether a sheet or alert stands in front, and the approved app whose window said so.
struct SheetRead: Equatable {
  var sheet: Bool
  var bundleId: String
  var pid: pid_t
}

/// What a file panel shows: the folder (a URL the panel reports, rarely present), the name field's text, the folder's
/// display name in the Where / path pop-up, and whether the name field has the keyboard focus (CU-48 A).
struct PanelFields: Equatable {
  var directory: String?
  var fileName: String?
  var shownFolderName: String? = nil
  var nameFieldFocused: Bool? = nil
}

enum PanelPath {
  /// A name typed as a path - starting with '/' or '~' - is that path, not a name in the folder (cu-researcher: the save
  /// panel takes '~/Library/LaunchAgents/x.plist' in its name field, and a leading '/' opens Go to Folder); '..' and
  /// '.' segments are standardised away before the last existing ancestor is resolved.
  static func canonical(directory: String?, fileName: String?, home: String = NSHomeDirectory(), resolve: (String) -> String? = realPath) -> (path: String?, directory: String?) {
    let folder = directory.flatMap { $0.hasPrefix("/") ? resolve($0) : nil }
    guard let name = fileName, !name.isEmpty else { return (nil, folder.map(escaped)) }
    let target: String
    if name.hasPrefix("/") {
      target = name
    } else if name == "~" || name.hasPrefix("~/") {
      target = home + name.dropFirst()
    } else if let folder {
      target = (folder as NSString).appendingPathComponent(name)
    } else {
      return (nil, nil)
    }
    let standard = (target as NSString).standardizingPath
    return (resolvedAsFarAsItExists(standard, resolve: resolve).map(escaped), folder.map(escaped))
  }

  /// The path with its longest existing ancestor resolved (symlinks) and the rest appended as typed.
  static func resolvedAsFarAsItExists(_ path: String, resolve: (String) -> String?) -> String? {
    var head = path
    var tail: [String] = []
    while head != "/" && !head.isEmpty {
      if let real = resolve(head) { return tail.reversed().reduce(real) { ($0 as NSString).appendingPathComponent($1) } }
      tail.append((head as NSString).lastPathComponent)
      head = (head as NSString).deletingLastPathComponent
    }
    return tail.reversed().reduce("/") { ($0 as NSString).appendingPathComponent($1) }
  }

  static func realPath(_ path: String) -> String? {
    guard let resolved = realpath(path, nil) else { return nil }
    defer { free(resolved) }
    return String(cString: resolved)
  }

  static func escaped(_ text: String) -> String {
    var out = ""
    for scalar in text.unicodeScalars {
      if scalar == "\\" { out += "\\\\"; continue }
      switch scalar.properties.generalCategory {
      case .control, .format, .lineSeparator, .paragraphSeparator, .surrogate, .privateUse, .unassigned:
        out += String(format: "\\u{%04X}", scalar.value)
      default:
        out.unicodeScalars.append(scalar)
      }
    }
    return out
  }
}

/// Q-D15 (hit-window.md): for pointer input the owner at a point is the window WindowServer's own mouse hit test names
/// (+[NSWindow windowNumberAtPoint:belowWindowWithWindowNumber:]) - click-through overlays (Typeless, the Dock's and
/// Notification Center's layers, AppKit's drag image) are skipped by WindowServer itself, and a clickable window of
/// another app is named at any alpha. The rules compose; position never selects one.
enum HitWindow {
  /// WindowServer's menu-bar window: one window across the strip (measured), where the Accessibility rule decides.
  static let menuBarLayer = 24

  enum Hit: Equatable {
    /// 0, a number missing from the on-screen list, or the helper's own window: refuse.
    case failClosed
    /// WindowServer's menu-bar window: the approved app's menu titles in, menu extras and other apps out (Accessibility).
    case menuBar
    /// Finder's desktop window (below layer 0): Q-D12 decides a drag's held moves; a press or release is refused.
    case desktop(pid: pid_t)
    /// Any other window: its owner decides (with CU-39's rules for content of another process).
    case window(WindowOwners.Window)
  }

  /// The hit test takes AppKit screen points (origin at the primary display's bottom left); events and the window list
  /// use top-left global points, so y is flipped against the primary display's height.
  static func appKitPoint(_ point: CGPoint, primaryHeight: CGFloat) -> CGPoint {
    CGPoint(x: point.x, y: primaryHeight - point.y)
  }

  static func classify(number: Int, in windows: [WindowOwners.Window], helperPid: pid_t, isWindowServer: (pid_t) -> Bool, finderPid: pid_t?) -> Hit {
    guard number > 0, let window = windows.first(where: { Int($0.number) == number }), window.pid != helperPid else { return .failClosed }
    if window.layer == menuBarLayer, isWindowServer(window.pid) { return .menuBar }
    if window.layer < 0, let finderPid, window.pid == finderPid { return .desktop(pid: window.pid) }
    return .window(window)
  }
}

/// Which display's capture may include the menu bar (CU-51). Accessibility gives the approved front app's menu bar as
/// one strip; the capture blacks out everything in that strip but the app's own items. With "Displays have separate
/// Spaces" every display draws a menu bar, status items and clock included, and a capture of a display that does not
/// hold the strip would show its bar unmasked - so only the display containing the strip includes the menu bar; any
/// other display's bar is left out of the image (black).
enum MenuBarPlan {
  static func include(strip: CGRect, display: CGRect) -> Bool {
    strip.width > 0 && strip.height > 0 && display.insetBy(dx: -0.5, dy: -0.5).contains(strip)
  }
}

/// The held-keys marker (CU-64 G1): a small mode-600 file naming what a hold keeps down, written before the hold
/// waits and removed once everything is up, so a helper killed mid-hold leaves the next one what to release.
enum HeldMarker {
  static var defaultPath: String { (NSHomeDirectory() as NSString).appendingPathComponent(".computer-use/helper/held-keys.json") }

  static func write(_ object: JSON, to path: String) {
    let temporary = path + ".tmp-\(getpid())"
    guard FileManager.default.createFile(atPath: temporary, contents: JSONCoding.line(object), attributes: [.posixPermissions: 0o600]) else { return }
    if rename(temporary, path) != 0 { unlink(temporary) }
  }

  static func remove(_ path: String) { unlink(path) }

  static func read(_ path: String) -> (pid: pid_t?, keys: [UInt16], buttons: [MouseButton], released: Bool)? {
    guard let data = FileManager.default.contents(atPath: path), let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
    let keys = (object["keys"] as? [Any] ?? []).compactMap { ($0 as? NSNumber)?.intValue }.filter { (0...127).contains($0) }.map { UInt16($0) }
    let buttons = (object["buttons"] as? [Any] ?? []).compactMap { ($0 as? String).flatMap(MouseButton.init(rawValue:)) }
    return ((object["pid"] as? NSNumber)?.int32Value, keys, buttons, (object["released"] as? Bool) ?? false)
  }
}

/// CU-203 (physical-confirmation.md): where an observed event came from, and whether it is hardware input. Only an
/// event that is not tagged CUSE, whose source pid is 0 and whose source state is the HID system's counts as hardware;
/// the pid-0 rule holds only if a poster cannot forge it - what the `forged` seam measures.
struct EventSource: Equatable {
  /// `CGEventSourceStateID.hidSystemState.rawValue`.
  static let hidSystemState: Int64 = 1
  var tag: Int64
  var pid: Int64
  var state: Int64

  var isHardware: Bool { tag != HelperIdentity.eventTag && pid == 0 && state == Self.hidSystemState }

  var json: JSON { .object(["pid": .int(Int(pid)), "state": .int(Int(state)), "tagged": .bool(tag == HelperIdentity.eventTag), "hardware": .bool(isHardware)]) }
}

/// CU-203 (physical-confirmation.md): what the confirmation prompt accepts, where it goes and what it says - the pure
/// part, unit-tested; the panel itself is in ConfirmPrompt.swift.
enum ConfirmGate {
  /// Confirm arms this long after the panel shows; a press that began earlier is ignored.
  static let armDelay: TimeInterval = 1.0
  static let maxTimeoutMs = 60_000
  static let maxTaskChars = 60

  /// A click answers only when its press is hardware input that began after arming AND the release completing it is
  /// hardware too (AppKit fires a button on the up, so a synthetic up after the owner's down must not complete it -
  /// cu-researcher). Anything else is ignored, never an answer.
  static func accepts(_ source: EventSource?, downAt: TimeInterval, armedAt: TimeInterval, up: EventSource? = nil, requireUp: Bool = true) -> Bool {
    guard let source, source.isHardware, downAt >= armedAt else { return false }
    guard requireUp else { return true }
    return up?.isHardware == true
  }

  /// A seat name as the roster writes it: lowercase words joined by hyphens, at most 40 characters.
  static func seatValid(_ seat: String) -> Bool {
    seat.range(of: #"^[a-z0-9][a-z0-9-]{0,39}$"#, options: .regularExpression) != nil
  }

  /// The fixed grant sentence, always first; the seat is checked before it gets here.
  static func grantLine(seat: String) -> String {
    "\(seat) wants to post clicks and keys into this session. Confirm lets this one run start now."
  }

  /// The task's words are the seat's: quoted, clipped, control characters and quotes dropped - never the title.
  static func taskLine(_ task: String) -> String {
    let cleaned = String(task.unicodeScalars.filter { !CharacterSet.controlCharacters.contains($0) && $0 != "\"" }.map(Character.init))
      .trimmingCharacters(in: .whitespaces)
    let clipped = cleaned.count > maxTaskChars ? String(cleaned.prefix(maxTaskChars - 1)) + "…" : cleaned
    return "for its run \"\(clipped)\""
  }

  /// The panel's frame (AppKit points): centred on the display, else the upper or lower third - never under the pointer.
  static func frame(visible: CGRect, size: CGSize, pointer: CGPoint) -> CGRect {
    let x = visible.midX - size.width / 2
    let candidates = [visible.midY - size.height / 2, visible.maxY - size.height - 80, visible.minY + 80]
    for y in candidates {
      let rect = CGRect(x: x, y: y, width: size.width, height: size.height)
      if !rect.insetBy(dx: -24, dy: -24).contains(pointer) { return rect }
    }
    return CGRect(x: pointer.x < visible.midX ? visible.maxX - size.width - 40 : visible.minX + 40, y: visible.midY - size.height / 2, width: size.width, height: size.height)
  }
}

/// CU-203: a prompt's outcome, in the interface agreed with the lock (cu-developer-two): `outcome` confirmed, cancelled
/// or timeout; `source` is the answering press's (nil on a timeout); `confirmationId` pairs the lock's record with the helper's log.
struct ConfirmResult {
  var outcome: String
  var source: EventSource?
  var id: String

  var json: JSON {
    // `confirmationId`, not `id`: every reply's `id` is already the request's (the envelope).
    .object(["confirmed": .bool(outcome == "confirmed"), "outcome": .string(outcome), "source": source?.json ?? .null, "confirmationId": .string(id)])
  }
}

/// CU-235 (design note on CU-232): which menu items of the frontmost approved app a key chord fires, judged from what
/// AppKit serves to Accessibility for each item - measured 2026-11-08 (CU-235 part 1): AXMenuItemCmdChar is upper case
/// for every letter and carries no case information; Shift, Option and Control are AXMenuItemCmdModifiers bits 1, 2 and
/// 4, and bit 8 means no Command; a non-character key (Backspace, Escape, Return, F-keys, arrows, Space) also carries
/// AXMenuItemCmdVirtualKey, its kVK code, and AXMenuItemCmdGlyph. Disabled and alternate items are listed like any.
/// Only role, title, key equivalent and enabled are read - never a value.
enum MenuKey {
  /// The chord as the driver would post its key down: the kVK code, the modifiers, and the characters the current
  /// keyboard layout gives that key without and with Shift (Option and Control ignored, as AppKit's
  /// charactersIgnoringModifiers does).
  struct Chord: Equatable {
    var keyCode: Int
    var shift: Bool
    var option: Bool
    var control: Bool
    var command: Bool
    var unshifted: String?
    var shifted: String?

    init(keyCode: Int, flags: UInt64, unshifted: String?, shifted: String?) {
      self.keyCode = keyCode
      shift = flags & 0x0002_0000 != 0
      control = flags & 0x0004_0000 != 0
      option = flags & 0x0008_0000 != 0
      command = flags & 0x0010_0000 != 0
      self.unshifted = unshifted
      self.shifted = shifted
    }
  }

  /// One menu item as Accessibility reports it.
  struct Entry: Equatable {
    var title: String?
    var path: [String]
    var enabled: Bool?
    var cmdChar: String?
    var cmdModifiers: Int?
    var cmdVirtualKey: Int?
    var cmdGlyph: Int?
    /// Under the menu bar's first item, the Apple menu: system shortcuts (Lock Screen, Log Out, Force Quit) that agent
    /// core refuses (cu-developer-one, CU-232 contract point 4).
    var appleMenu: Bool = false
    /// Under a Services submenu (CU-250): a service acts in another app, so agent core refuses it.
    var servicesMenu: Bool = false

    /// Whether the item has a key equivalent at all.
    var hasKey: Bool { cmdVirtualKey != nil || !(cmdChar ?? "").isEmpty }
  }

  /// The most items one reply names; more set `truncated`.
  static let maxItems = 8

  /// Whether `chord` fires `entry`'s key equivalent. The modifier sets must be equal - Command present unless bit 8 -
  /// and either the item's virtual key is the chord's key, or its character is the layout's: the unshifted character
  /// with Shift as a modifier, or (for a key whose Shift gives another character, '1' and '!') the shifted character
  /// with Shift used up by it.
  static func fires(_ entry: Entry, _ chord: Chord) -> Bool {
    guard entry.hasKey else { return false }
    let bits = entry.cmdModifiers ?? 0
    let command = bits & 8 == 0, option = bits & 2 != 0, control = bits & 4 != 0, shift = bits & 1 != 0
    guard command == chord.command, option == chord.option, control == chord.control else { return false }
    if let virtualKey = entry.cmdVirtualKey { return virtualKey == chord.keyCode && shift == chord.shift }
    guard let char = entry.cmdChar?.uppercased(), !char.isEmpty else { return false }
    if let base = chord.unshifted?.uppercased(), base == char, shift == chord.shift { return true }
    if chord.shift, !shift, let shifted = chord.shifted?.uppercased(), shifted != chord.unshifted?.uppercased(), shifted == char { return true }
    return false
  }

  /// kVK codes of keys AppKit serves by virtual key (measured: AXMenuItemCmdVirtualKey present): Return, Tab, Space,
  /// Delete, Escape, keypad Enter, Help, Home, Page Up, Forward Delete, End, Page Down, the arrows and F1-F20.
  static let nonCharacterKeys: Set<Int> = [36, 48, 49, 51, 53, 76, 114, 115, 116, 117, 119, 121, 123, 124, 125, 126,
                                           122, 120, 99, 118, 96, 97, 98, 100, 101, 109, 103, 111, 105, 107, 113, 106, 64, 79, 80, 90]

  /// The chord's modifiers as AXMenuItemCmdModifiers bits: Shift 1, Option 2, Control 4, no Command 8.
  static func modifierBits(_ chord: Chord) -> Int {
    (chord.shift ? 1 : 0) | (chord.option ? 2 : 0) | (chord.control ? 4 : 0) | (chord.command ? 0 : 8)
  }

  /// (b): an item with no key character and no virtual key, whose non-zero modifiers equal the chord's - the way
  /// AppKit serves a later duplicate of an earlier item's key equivalent. An item with no key equivalent at all reads
  /// modifiers 0, so a hidden duplicate on Command alone is not told apart (the named blind spot, which (a) narrows).
  static func hiddenDuplicate(_ entry: Entry, _ chord: Chord) -> Bool {
    guard !entry.hasKey, let bits = entry.cmdModifiers, bits != 0 else { return false }
    return bits == modifierBits(chord)
  }

  /// How the read went: the matches (every one, capped), none, or unreadable with a reason.
  enum Read: Equatable {
    case items(bundleId: String, items: [Entry], truncated: Bool, incomplete: Bool)
    case none(bundleId: String, incomplete: Bool)
    case unreadable(String)

    var json: [String: JSON] {
      switch self {
      case .items(let bundleId, let items, let truncated, let incomplete):
        var object: [String: JSON] = ["bundleId": .string(bundleId), "items": .array(items.map(MenuKey.json))]
        if truncated { object["truncated"] = .bool(true) }
        if incomplete { object["incomplete"] = .bool(true) }
        return object
      case .none(let bundleId, let incomplete):
        var object: [String: JSON] = ["none": .bool(true), "bundleId": .string(bundleId)]
        if incomplete { object["incomplete"] = .bool(true) }
        return object
      case .unreadable(let reason):
        return ["unreadable": .bool(true), "reason": .string(reason)]
      }
    }
  }

  /// A printable key character, else nil (a control character or an NS function-key code goes by glyph and virtual key).
  static func printable(_ char: String?) -> String? {
    guard let char, let scalar = char.unicodeScalars.first, char.unicodeScalars.count == 1 else { return nil }
    return scalar.value < 0x21 || scalar.value == 0x7F || (0xF700...0xF8FF).contains(scalar.value) ? nil : char
  }

  /// One matched item on the wire. `keyEquivalent` is CU-154's shape - `char` (printable, else null) and `modifiers`,
  /// AXMenuItemCmdModifiers' raw integer (+1 Shift, +2 Option, +4 Control, +8 no Command) - with `glyph` and
  /// `virtualKey` for a non-character key.
  static func json(_ entry: Entry) -> JSON {
    var key: [String: JSON] = ["char": .optionalString(printable(entry.cmdChar)), "modifiers": .int(entry.cmdModifiers ?? 0)]
    if let glyph = entry.cmdGlyph { key["glyph"] = .int(glyph) }
    if let virtualKey = entry.cmdVirtualKey { key["virtualKey"] = .int(virtualKey) }
    var object: [String: JSON] = ["title": .optionalString(entry.title), "path": .array(entry.path.map { .string($0) }), "keyEquivalent": .object(key),
                                  "enabled": entry.enabled.map { .bool($0) } ?? .null]
    if entry.appleMenu { object["appleMenu"] = .bool(true) }
    if entry.servicesMenu { object["servicesMenu"] = .bool(true) }
    return .object(object)
  }

  /// Whether a node of the menu-bar walk is an empty menu that makes a miss untrustworthy: a top-level menu with no
  /// items yet (depth 2, filled lazily), or a menu-bar item with no menu until it opens (depth 1, built lazily) - never
  /// under the menu bar's first item, the Apple menu (by position).
  static func isEmptyMenu(role: String?, depth: Int, childCount: Int, underApple: Bool) -> Bool {
    guard !underApple, childCount == 0 else { return false }
    return (depth == 2 && role == "AXMenu") || (depth == 1 && role == "AXMenuBarItem")
  }

  /// The matches among `entries`, in menu order. `emptyMenus`: the top-level menus other than the first (the Apple
  /// menu, by position) that had no items to read - filled or built lazily - so a miss cannot be trusted. A chord whose
  /// key the layout gives no character for (an input method without a Unicode layout) cannot be judged against
  /// character items either (cu-verifier, cu-developer-one on #36): a miss is unreadable, a match incomplete.
  ///
  /// Hidden duplicates (cu-developer-one's decision on #36, 8 Nov): AppKit serves a LATER duplicate of an earlier item's
  /// key equivalent with no key character (CU-238's Send Now reads modifiers 2, no character), so it cannot be matched.
  /// (b) a key-less item whose non-zero modifiers equal the chord's is such a duplicate: unreadable. (a) when every
  /// match is disabled, a hidden duplicate on Command alone (modifiers 0, indistinguishable from no key) may be the item
  /// that fires: unreadable. Named residual: an enabled first match on Command alone hiding a later duplicate stays
  /// unseen and is answered as its visible match.
  static func read(bundleId: String, entries: [Entry], emptyMenus: [String], chord: Chord) -> Read {
    if entries.contains(where: { hiddenDuplicate($0, chord) }) { return .unreadable("a hidden duplicate key equivalent") }
    let matches = entries.filter { fires($0, chord) }
    if !matches.isEmpty, matches.allSatisfy({ $0.enabled == false }) { return .unreadable("only disabled items match; a later duplicate may fire") }
    // A non-character key (Backspace, Escape, Return, F-keys, arrows) matches by virtual key; its layout character
    // does not matter (cu-developer-two's seam check on #36: Command-Backspace came back incomplete).
    let layoutUnread = chord.unshifted == nil && !nonCharacterKeys.contains(chord.keyCode)
    if matches.isEmpty {
      if layoutUnread { return .unreadable("the keyboard layout gives no character for this key") }
      return emptyMenus.isEmpty ? .none(bundleId: bundleId, incomplete: false) : .unreadable("a menu had no items to read (filled lazily)")
    }
    return .items(bundleId: bundleId, items: Array(matches.prefix(maxItems)), truncated: matches.count > maxItems, incomplete: !emptyMenus.isEmpty || layoutUnread)
  }

  /// A US ANSI layout for the dry run and the tests (the live helper asks the current layout): kVK code -> (unshifted,
  /// shifted) for letters, digits and the common punctuation.
  static let usLayout: [Int: (String, String)] = {
    var table: [Int: (String, String)] = [:]
    let letters: [(Int, String)] = [(0, "a"), (11, "b"), (8, "c"), (2, "d"), (14, "e"), (3, "f"), (5, "g"), (4, "h"), (34, "i"), (38, "j"), (40, "k"), (37, "l"), (46, "m"),
                                    (45, "n"), (31, "o"), (35, "p"), (12, "q"), (15, "r"), (1, "s"), (17, "t"), (32, "u"), (9, "v"), (13, "w"), (7, "x"), (16, "y"), (6, "z")]
    for (code, letter) in letters { table[code] = (letter, letter.uppercased()) }
    let others: [(Int, String, String)] = [(18, "1", "!"), (19, "2", "@"), (20, "3", "#"), (21, "4", "$"), (23, "5", "%"), (22, "6", "^"), (26, "7", "&"), (28, "8", "*"),
                                           (25, "9", "("), (29, "0", ")"), (27, "-", "_"), (24, "=", "+"), (33, "[", "{"), (30, "]", "}"), (42, "\\", "|"), (41, ";", ":"),
                                           (39, "'", "\""), (43, ",", "<"), (47, ".", ">"), (44, "/", "?"), (50, "`", "~")]
    for (code, plain, shifted) in others { table[code] = (plain, shifted) }
    return table
  }()
}

/// CU-250: whether a submenu is the Services menu, so a clicked item under it (an owner-installed service included) is
/// refused by policy. Measured 8 Nov in process: the Services item and its submenu carry no distinguishing
/// Accessibility attribute; their titles are AppKit's own localized strings (Services.loctable: 'Services', 'Services
/// Settings…', 'No Services Apply'). So the item counts by its title, or by a marker item AppKit always puts in its
/// submenu, in the current language (read from AppKit) or in English.
struct ServicesMenu: Equatable {
  var titles: Set<String>
  var markers: Set<String>

  static let english = ServicesMenu(titles: ["Services"], markers: ["Services Settings\u{2026}", "Services Settings...", "No Services Apply"])

  /// The current language's strings from AppKit's own table, beside the English ones.
  static let current: ServicesMenu = {
    var menu = english
    if let appKit = Bundle(identifier: "com.apple.AppKit") {
      let read = { (key: String) -> String? in
        let value = appKit.localizedString(forKey: key, value: "\u{1}", table: "Services")
        return value == "\u{1}" || value.isEmpty ? nil : value
      }
      if let title = read("Services") { menu.titles.insert(title) }
      for key in ["Services Settings\u{2026}", "No Services Apply"] { if let marker = read(key) { menu.markers.insert(marker) } }
    }
    return menu
  }()

  /// A submenu held by an item titled `itemTitle`, whose own items are titled `childTitles`.
  func isServices(itemTitle: String?, childTitles: [String]) -> Bool {
    if let itemTitle, titles.contains(itemTitle) { return true }
    return childTitles.contains { markers.contains($0) }
  }
}

extension MenuKey {
  /// CU-250: marks every entry from `start` on as under a Services submenu when the submenu holding them - held by an
  /// item titled `holderTitle`, its direct items at path depth `depth` - is the Services menu.
  static func markServices(_ entries: inout [Entry], from start: Int, holderTitle: String?, depth: Int, services: ServicesMenu) {
    guard start < entries.count, holderTitle != nil else { return }
    let direct = entries[start...].filter { $0.path.count == depth }.compactMap { $0.title }
    guard services.isServices(itemTitle: holderTitle, childTitles: direct) else { return }
    for index in start..<entries.count { entries[index].servicesMenu = true }
  }
}

/// CU-250: where a clicked menu item sits - the titles from the menu bar (or a context menu's top) down to the item, and
/// whether any submenu on the way is the Services menu. Names only, at most `maxDepth` levels.
struct MenuContext: Equatable {
  var path: [String]
  var servicesMenu: Bool

  static let maxDepth = 10

  /// One level above an item, nearest first: the title of the item holding that submenu (nil for the menu bar or a
  /// context menu's top) and the titles of the submenu's items.
  struct Level: Equatable {
    var holderTitle: String?
    var childTitles: [String]
  }

  static func of(itemTitle: String?, levels: [Level], services: ServicesMenu = .current) -> MenuContext {
    let capped = Array(levels.prefix(maxDepth))
    let holders = capped.compactMap { $0.holderTitle }
    let flagged = capped.contains { level in level.holderTitle != nil && services.isServices(itemTitle: level.holderTitle, childTitles: level.childTitles) }
    return MenuContext(path: holders.reversed() + [itemTitle ?? ""], servicesMenu: flagged)
  }

  var json: [String: JSON] {
    var object: [String: JSON] = ["menuPath": .array(path.map { .string($0) })]
    if servicesMenu { object["servicesMenu"] = .bool(true) }
    return object
  }
}

/// CU-262 (helper half of CU-252): the selected items of the frontmost approved app's focused collection, by name and
/// kind only - so agent core can ask before Open launches a selected script or app. Accessibility only: no path leaves
/// the helper, and no URL resource value is read (a file-system call on a file in a protected folder risks a TCC
/// prompt in the owner's name, D-024).
enum SelectedItems {
  static let maxItems = 32
  /// The focused roles that hold a selection: list and column views (rows), plain lists and icon views (children), and
  /// a column browser (its last column).
  static let collectionRoles: Set<String> = ["AXOutline", "AXTable", "AXList", "AXGroup", "AXBrowser"]

  struct Raw: Equatable {
    var filename: String?
    var url: String?
    /// A label (AXTitle or AXDescription) - never an AXValue, which can be the owner's content.
    var text: String?
  }

  struct Item: Equatable {
    var name: String
    var kind: String
  }

  enum Read: Equatable {
    case items(bundleId: String, items: [Item], truncated: Bool)
    case none(bundleId: String)
    case notCollection(bundleId: String)
    case unreadable(String)

    var json: [String: JSON] {
      switch self {
      case .items(let bundleId, let items, let truncated):
        var object: [String: JSON] = ["bundleId": .string(bundleId), "items": .array(items.map { .object(["name": .string($0.name), "kind": .string($0.kind)]) })]
        if truncated { object["truncated"] = .bool(true) }
        return object
      case .none(let bundleId): return ["none": .bool(true), "bundleId": .string(bundleId)]
      case .notCollection(let bundleId): return ["notCollection": .bool(true), "bundleId": .string(bundleId)]
      case .unreadable(let reason): return ["unreadable": .bool(true), "reason": .string(reason)]
      }
    }
  }

  /// 'folder' for a file URL with a trailing slash (a folder or a package), 'file' for any other file URL, 'unknown'
  /// without one - from the string alone.
  static func kind(url: String?) -> String {
    guard let url, url.hasPrefix("file://") else { return "unknown" }
    return url.hasSuffix("/") ? "folder" : "file"
  }

  /// The item's name: AXFilename, else the file URL's last component (percent-decoded, parsed as a string), else its
  /// label. No name: the read is unreadable (agent core asks), never a value in its place.
  static func name(_ raw: Raw) -> String? {
    if let filename = raw.filename, !filename.isEmpty { return filename }
    if let url = raw.url, url.hasPrefix("file://"), let parsed = URL(string: url) {
      let leaf = parsed.lastPathComponent
      if !leaf.isEmpty, leaf != "/" { return leaf }
    }
    if let text = raw.text, !text.isEmpty { return text }
    return nil
  }

  /// `selection` nil: the selection could not be read.
  static func read(bundleId: String, focusedRole: String?, selection: [Raw]?) -> Read {
    guard let role = focusedRole, collectionRoles.contains(role) else { return .notCollection(bundleId: bundleId) }
    guard let selection else { return .unreadable("the selection could not be read") }
    if selection.isEmpty { return .none(bundleId: bundleId) }
    var items: [Item] = []
    for raw in selection.prefix(maxItems) {
      guard let name = name(raw) else { return .unreadable("a selected item has no name") }
      items.append(Item(name: name, kind: kind(url: raw.url)))
    }
    return .items(bundleId: bundleId, items: items, truncated: selection.count > maxItems)
  }
}

extension Grants {
  /// CU-240: the one grant a gated request needs - a single TCC preflight, not all four.
  static func preflight(_ name: String) -> Bool {
    switch name {
    case "screen": return CGPreflightScreenCaptureAccess()
    case "accessibility": return AXIsProcessTrusted()
    case "input": return AXIsProcessTrusted() && CGPreflightPostEventAccess()
    case "postEvents": return CGPreflightPostEventAccess()
    case "listenEvents": return CGPreflightListenEventAccess()
    default: return false
    }
  }

  /// Each grant true if either reading says so.
  func union(_ other: Grants) -> Grants {
    Grants(screen: screen || other.screen, accessibility: accessibility || other.accessibility,
           postEvents: postEvents || other.postEvents, listenEvents: listenEvents || other.listenEvents)
  }
}

/// CU-240: under load a TCC preflight can read false for a grant the helper holds, refusing a capture or input
/// mid-run. A false is re-read before a refusal - but only for a grant that read true earlier in this run, so a grant
/// never given is refused at once, and a real revocation still refuses within about 300 ms. Preflights only: nothing
/// here can prompt (D-024).
enum GrantRecheck {
  static let attempts = 3
  static let interval: TimeInterval = 0.1

  struct Outcome: Equatable {
    var granted: Bool
    var wasGranted: Bool
    var rechecks: Int
  }

  static func check(seenTrue: Bool, read: () -> Bool, sleep: (TimeInterval) -> Void) -> Outcome {
    if read() { return Outcome(granted: true, wasGranted: true, rechecks: 0) }
    guard seenTrue else { return Outcome(granted: false, wasGranted: false, rechecks: 0) }
    for attempt in 1...attempts {
      sleep(interval)
      if read() { return Outcome(granted: true, wasGranted: true, rechecks: attempt) }
    }
    return Outcome(granted: false, wasGranted: true, rechecks: attempts)
  }

  /// At launch and in the hello there is no earlier reading: when some grant reads true but Screen Recording or
  /// Accessibility reads false, those are re-read up to `attempts` times (a helper with no grant at all is not slowed).
  static func settled(read: () -> Grants, sleep: (TimeInterval) -> Void) -> Grants {
    var grants = read()
    guard grants.any else { return grants }
    var attempt = 0
    while (!grants.screen || !grants.accessibility), attempt < attempts {
      attempt += 1
      sleep(interval)
      grants = grants.union(read())
    }
    return grants
  }

  /// CU-303: the grants a serving start reads. A start that cannot hold a grant (`--dry-run` or `--simulate-ungranted`:
  /// the boundary never applies and its capabilities are the dry-run world or forced off) takes `.none` and asks TCC
  /// nothing - a test suite's burst of such starts ran tccd out of file descriptors (EMFILE), and the next live start
  /// read every grant false.
  static func atStart(mayHoldGrants: Bool, read: () -> Grants, sleep: (TimeInterval) -> Void) -> Grants {
    mayHoldGrants ? settled(read: read, sleep: sleep) : .none
  }
}
