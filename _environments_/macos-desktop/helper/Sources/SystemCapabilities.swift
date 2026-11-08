import AppKit
import ApplicationServices
import Carbon.HIToolbox
import CoreGraphics
import Foundation
import ImageIO
import ScreenCaptureKit

/// The live Mac: facts and acts only, every rule is the dispatcher's. None of this reads or writes the pasteboard
/// (D-025), and nothing here can raise a TCC prompt: the APIs that would are reached only after the dispatcher's
/// grant check (capture, posting, Accessibility) or this file's own preflight (the tap, in LocalInput.swift).
/// Display geometry, running apps, the pointer location, secure-input state and the HID idle counter need no grant.
final class SystemCapabilities: Capabilities {
  let mode = "live"
  private let lock = NSLock()
  private var manualAccessibility = Set<pid_t>()

  func grants() -> Grants { Grants.preflight() }

  // MARK: Displays and apps (no grant; measured not to prompt)

  func displays() -> [DisplayInfo] {
    var count: UInt32 = 0
    guard CGGetActiveDisplayList(0, nil, &count) == .success, count > 0 else { return [] }
    var ids = [CGDirectDisplayID](repeating: 0, count: Int(count))
    guard CGGetActiveDisplayList(count, &ids, &count) == .success else { return [] }
    let main = CGMainDisplayID()
    return ids.prefix(Int(count)).map { id in
      DisplayInfo(id: id, main: id == main, bounds: CGDisplayBounds(id), scale: Self.scale(of: id))
    }
  }

  /// The backing scale factor: pixels per point of the display's current mode (2 on Retina).
  static func scale(of id: CGDirectDisplayID) -> Double {
    guard let mode = CGDisplayCopyDisplayMode(id), mode.width > 0 else { return 1 }
    return Double(mode.pixelWidth) / Double(mode.width)
  }

  static func display(containing rect: CGRect) -> CGDirectDisplayID? {
    var id: CGDirectDisplayID = 0
    var count: UInt32 = 0
    guard CGGetDisplaysWithPoint(CGPoint(x: rect.midX, y: rect.midY), 1, &id, &count) == .success, count > 0 else { return nil }
    return id
  }

  func running(_ bundleIds: [String]) -> [AppRef] {
    bundleIds.flatMap { id in NSRunningApplication.runningApplications(withBundleIdentifier: id).filter { !$0.isTerminated }.map { AppRef(bundleId: id, pid: $0.processIdentifier) } }
  }

  func scopeDisplay(_ bundleIds: [String], grants: Grants) -> UInt32? {
    guard grants.accessibility else { return nil }
    for app in running(bundleIds) {
      if let frame = Accessibility.focusedWindowFrame(pid: app.pid), let id = Self.display(containing: frame) { return id }
    }
    return nil
  }

  /// The frontmost app: from Accessibility when granted (fresh), else from NSWorkspace.
  func frontmost() -> AppRef? {
    if AXIsProcessTrusted(), let pid = Accessibility.frontmostPid() { return AppRef(bundleId: Accessibility.bundleId(pid: pid), pid: pid) }
    guard let app = NSWorkspace.shared.frontmostApplication else { return nil }
    return AppRef(bundleId: app.bundleIdentifier, pid: app.processIdentifier)
  }

  // MARK: Targets (Accessibility)

  /// Electron and other apps expose their tree only once asked (R92); set once per approved app.
  private func exposeTree(of pid: pid_t) {
    limitTimeouts()
    lock.lock()
    let fresh = manualAccessibility.insert(pid).inserted
    lock.unlock()
    if fresh { Accessibility.setManualAccessibility(pid: pid) }
  }

  private var timeoutsLimited = false

  /// A hung app must not stall the run for Accessibility's default six seconds per call: one second, set once the
  /// grant is there (an AX call before it would only fail, but none is made).
  private func limitTimeouts() {
    lock.lock()
    let first = !timeoutsLimited && AXIsProcessTrusted()
    if first { timeoutsLimited = true }
    lock.unlock()
    if first { AXUIElementSetMessagingTimeout(AXUIElementCreateSystemWide(), 1.0) }
  }

  private func exposeFrontmost(scope: [String]) {
    if let front = frontmost(), let id = front.bundleId, scope.contains(id) { exposeTree(of: front.pid) }
  }

  /// The owner of what is at a point (hit-window.md, Q-D15): the window WindowServer's own mouse hit test names there -
  /// click-through overlays and AppKit's drag image are skipped by WindowServer itself, a clickable window of another
  /// app is named at any alpha. Its menu-bar window defers to Accessibility (menu titles vs extras); Finder's desktop
  /// window is the desktop (Q-D12); 0, an unlisted number or our own window fail closed (nil). Within the hit window,
  /// another process's content is judged by that process (CU-39) unless it is an attached panel's (file-panels.md).
  func owner(at point: CGPoint, scope: [String]) -> (app: AppRef, windowTitle: String?, byElement: Bool, overlay: String?)? {
    guard AXIsProcessTrusted() else { return nil }
    exposeFrontmost(scope: scope)
    let windows = WindowOwners.onScreen(includingDesktop: true)
    switch hitWindow(at: point, windows: windows) {
    case .failClosed:
      return nil
    case .menuBar:
      guard let element = Accessibility.element(at: point), let pid = Accessibility.pid(element) else { return nil }
      return (AppRef(bundleId: Accessibility.bundleId(pid: pid), pid: pid), nil, false, nil)
    case .desktop(let pid):
      return (AppRef(bundleId: Accessibility.bundleId(pid: pid), pid: pid), nil, false, nil)
    case .window(let window):
      let bundle = Accessibility.bundleId(pid: window.pid)
      guard let element = Accessibility.element(at: point), let axPid = Accessibility.pid(element) else { return (AppRef(bundleId: bundle, pid: window.pid), nil, false, nil) }
      if axPid != window.pid {
        if let client = remoteClient(window: window, windows: windows, elementPid: axPid, scope: scope) { return (client, nil, false, nil) }
        // CU-199: a click-through overlay's element (its window above the hit one, passed through by WindowServer) does
        // not own the point - the click goes to the hit window, so that window's owner counts (no title read).
        if OwnerRule.clickThroughOverlay(elementPid: axPid, hitNumber: window.number, windows: windows, point: point) != nil {
          return (AppRef(bundleId: bundle, pid: window.pid), nil, false, Accessibility.bundleId(pid: axPid) ?? "pid:\(axPid)")
        }
        let elementBundle = Accessibility.bundleId(pid: axPid)
        let side = OwnerRule.mismatchOwner(windowApproved: bundle.map { scope.contains($0) } ?? false, elementApproved: elementBundle.map { scope.contains($0) } ?? false)
        return side == .window ? (AppRef(bundleId: bundle, pid: window.pid), nil, false, nil) : (AppRef(bundleId: elementBundle, pid: axPid), nil, true, nil)
      }
      let title = bundle.map { scope.contains($0) } == true ? Accessibility.windowTitle(of: element) : nil
      return (AppRef(bundleId: bundle, pid: window.pid), title, false, nil)
    }
  }

  /// WindowServer's mouse hit test at a point (global top-left points), classified (HitWindow).
  private func hitWindow(at point: CGPoint, windows: [WindowOwners.Window]) -> HitWindow.Hit {
    let primaryHeight = CGDisplayBounds(CGMainDisplayID()).height
    let number = NSWindow.windowNumber(at: HitWindow.appKitPoint(point, primaryHeight: primaryHeight), belowWindowWithWindowNumber: 0)
    let finder = NSRunningApplication.runningApplications(withBundleIdentifier: "com.apple.finder").first?.processIdentifier
    return HitWindow.classify(number: number, in: windows, helperPid: getpid(), isWindowServer: WindowOwners.isWindowServer, finderPid: finder)
  }

  /// file-panels.md (#84), the remote case: the client the panel service's element in the hit window counts as - that
  /// window is the frontmost approved client's attached sheet, directly above one of its windows, and the element is
  /// the service's, on the system volume.
  private func remoteClient(window: WindowOwners.Window, windows: [WindowOwners.Window], elementPid: pid_t, scope: [String]) -> AppRef? {
    guard let front = frontmost(), front.pid == window.pid, let client = front.bundleId, scope.contains(client),
          let index = windows.firstIndex(where: { $0.number == window.number }) else { return nil }
    let aboveClient = index + 1 < windows.count && windows[index + 1].pid == window.pid
    let attached = PanelAttribution.attributes(windowOwnerIsFrontmostClient: true, clientApproved: true, windowBounds: window.bounds,
                                               sheetFrames: Accessibility.sheetFrames(pid: front.pid), aboveClientWindow: aboveClient,
                                               elementBundleId: Accessibility.bundleId(pid: elementPid), elementIsSystem: WindowOwners.isSystemProcess(elementPid))
    return attached ? front : nil
  }

  func panelSelection(scope: [String]) -> PanelFields? {
    guard AXIsProcessTrusted(), let front = frontmost(), let client = front.bundleId, scope.contains(client) else { return nil }
    limitTimeouts()
    return Accessibility.panelFields(pid: front.pid)
  }

  /// CU-235: the frontmost approved app's menu items this key down fires. The menu bar is walked fresh each time (role,
  /// title, enabled and the four key-equivalent attributes only, never a value); the characters are the current
  /// keyboard layout's for the key code, as AppKit matches them. Anything unread answers unreadable.
  func menuKey(keyCode: Int, flags: UInt64, scope: [String]) -> MenuKey.Read {
    guard AXIsProcessTrusted() else { return .unreadable("no Accessibility grant") }
    guard let front = frontmost(), let bundleId = front.bundleId else { return .unreadable("no frontmost app") }
    guard scope.contains(bundleId) else { return .unreadable("the frontmost app is not an approved app of this run") }
    limitTimeouts()
    let (outcome, menuBar) = Accessibility.elementRead(AXUIElementCreateApplication(front.pid), "AXMenuBar")
    guard outcome == .value, let menuBar else { return .unreadable("the app's menu bar could not be read") }
    guard let walk = MenuWalk.entries(of: menuBar) else { return .unreadable("the app's menu bar could not be read in full") }
    let chars = KeyLayout.characters(keyCode: keyCode, command: flags & 0x0010_0000 != 0)
    let chord = MenuKey.Chord(keyCode: keyCode, flags: flags, unshifted: chars.unshifted, shifted: chars.shifted)
    return MenuKey.read(bundleId: bundleId, entries: walk.entries, emptyMenus: walk.emptyMenus, chord: chord)
  }

  /// Whether an approved app's window lies under the hit window at the point - so the refusal can say what covers it.
  func approvedBeneath(_ point: CGPoint, scope: [String]) -> Bool {
    let windows = WindowOwners.onScreen(includingDesktop: true)
    guard case .window(let hit) = hitWindow(at: point, windows: windows), let index = windows.firstIndex(where: { $0.number == hit.number }) else { return false }
    return windows[(index + 1)...].contains { window in
      window.bounds.contains(point) && (Accessibility.bundleId(pid: window.pid).map { scope.contains($0) } ?? false)
    }
  }

  /// Q-D12 for a drag's held moves: the hit window is Finder's desktop window, and Accessibility names the desktop
  /// itself there (not an icon).
  func desktop(at point: CGPoint, scope: [String]) -> DesktopPoint {
    guard AXIsProcessTrusted(), case .desktop = hitWindow(at: point, windows: WindowOwners.onScreen(includingDesktop: true)),
          let element = Accessibility.element(at: point), let pid = Accessibility.pid(element),
          Accessibility.bundleId(pid: pid) == "com.apple.finder" else { return .other }
    return DragPath.classify(finderRole: Accessibility.string(element, kAXRoleAttribute as String))
  }

  func activate(pid: pid_t) -> Bool {
    guard AXIsProcessTrusted() else { return false }
    exposeTree(of: pid)
    return Accessibility.makeFrontmost(pid: pid)
  }

  func hitTest(_ point: CGPoint, scope: [String]) -> JSON {
    limitTimeouts()
    exposeFrontmost(scope: scope)
    let windows = WindowOwners.onScreen(includingDesktop: true)
    let target = Accessibility.actionTarget(at: point)
    let element = target?.element
    let press = target?.pressSignal ?? true
    let leaf = target?.leaf
    switch hitWindow(at: point, windows: windows) {
    case .failClosed:
      return .null
    case .menuBar, .desktop:
      return element.map { Accessibility.describe($0, scope: scope, markPanel: true) } ?? .null
    case .window(let window):
      let bundle = Accessibility.bundleId(pid: window.pid)
      guard let element, let axPid = Accessibility.pid(element) else {
        return SystemPrompt.withMark(Accessibility.unapproved(bundleId: bundle, pid: window.pid), SystemPrompt.isOwner(bundle))
      }
      if axPid != window.pid {
        if let client = remoteClient(window: window, windows: windows, elementPid: axPid, scope: scope) {
          return Accessibility.describe(element, scope: scope, markPanel: true, attributedTo: client, pressSignal: press, captionLeaf: leaf)
        }
        // CU-199: the element is a click-through overlay's - describe the hit window's own element beneath, read inside
        // its app, and name the overlay, so the driver's owner check agrees with the helper's input check.
        if OwnerRule.clickThroughOverlay(elementPid: axPid, hitNumber: window.number, windows: windows, point: point) != nil,
           let beneath = Accessibility.element(at: point, inApp: window.pid), Accessibility.pid(beneath) == window.pid {
          let picked = Accessibility.actionableTarget(beneath)
          let approved = bundle.map { scope.contains($0) } ?? false
          let described = Accessibility.describe(picked.element, scope: scope, markPanel: true, pressSignal: picked.pressSignal, captionLeaf: picked.leaf)
          var marked = SystemPrompt.withMark(described, SystemPrompt.marks(windowOwner: bundle, foreignBundleId: nil, foreignPath: nil, subroles: approved ? Accessibility.subroleAncestry(picked.element) : []))
          if case .object(var fields) = marked { fields["overlaySkipped"] = .optionalString(Accessibility.bundleId(pid: axPid)); marked = .object(fields) }
          return marked
        }
        let foreignBundle = Accessibility.bundleId(pid: axPid)
        let foreign = OwnerRule.foreignContent(window: AppRef(bundleId: bundle, pid: window.pid), element: AppRef(bundleId: foreignBundle, pid: axPid), scope: scope)
        return SystemPrompt.withMark(foreign, SystemPrompt.marks(windowOwner: bundle, foreignBundleId: foreignBundle, foreignPath: PeerCheck.executablePath(axPid), subroles: []))
      }
      // The subroles are read for an approved app only (trajectory-privacy.md); an unapproved one is refused anyway.
      let approved = bundle.map { scope.contains($0) } ?? false
      return SystemPrompt.withMark(Accessibility.describe(element, scope: scope, markPanel: true, pressSignal: press, captionLeaf: leaf),
                                   SystemPrompt.marks(windowOwner: bundle, foreignBundleId: nil, foreignPath: nil, subroles: approved ? Accessibility.subroleAncestry(element) : []))
    }
  }

  func focused(scope: [String]) -> JSON {
    limitTimeouts()
    guard let element = Accessibility.focusedElement() else { return .null }
    let pid = Accessibility.pid(element)
    let bundle = pid.flatMap { Accessibility.bundleId(pid: $0) }
    let approved = bundle.map { scope.contains($0) } ?? false
    // Focus inside another process's view in the frontmost app's window (a view service) counts as foreign content.
    let front = Accessibility.frontmostPid()
    let foreign = pid != nil && front != nil && pid != front
    let mark = SystemPrompt.marks(windowOwner: bundle, foreignBundleId: foreign ? bundle : nil, foreignPath: foreign ? pid.flatMap { PeerCheck.executablePath($0) } : nil,
                                  subroles: approved ? Accessibility.subroleAncestry(element) : [])
    return SystemPrompt.withMark(Accessibility.describe(element, scope: scope, markPanel: true), mark)
  }

  /// CU-142: where the focus is in an approved app, the button Return presses - the AXDefaultButton of the first sheet
  /// or window up from the focus - described like any target (role, title, panel marker). Focus elsewhere, none, or a
  /// sheet without a default button: null.
  func defaultButton(scope: [String]) -> DefaultButtonRead {
    limitTimeouts()
    let (focus, element) = Accessibility.elementRead(AXUIElementCreateSystemWide(), "AXFocusedUIElement")
    switch focus {
    case .failed: return .failed
    case .none: return frontDefaultButton(scope: scope)
    case .value: break
    }
    guard let element, let pid = Accessibility.pid(element), let bundle = Accessibility.bundleId(pid: pid), scope.contains(bundle) else { return .failed }
    var node: AXUIElement = element
    for _ in 0..<60 {
      let role = Accessibility.string(node, "AXRole")
      // The first sheet or window up from the focus decides. A sheet is modal, so its Return cannot press the window's
      // default button: a sheet without one answers null, never the window's (cu-developer-one, -two, cu-verifier).
      if role == "AXSheet" || role == "AXWindow" { return readDefaultButton(of: node, scope: scope) }
      // The top of the tree with no sheet or window on the way (a focus in a menu or a status item) is a positive none:
      // no window holds this focus, so Return has no default button there (cu-developer-two). Only a failed read is false.
      let (outcome, parent) = Accessibility.elementRead(node, "AXParent")
      if outcome == .none { return DefaultButtonRead(button: .null, read: true) }
      guard outcome == .value, let parent else { return .failed }
      node = parent
    }
    return .failed
  }

  /// CU-190: AXDefaultButton of a sheet or window - a button (read), a positive none (read, null), or a failure.
  private func readDefaultButton(of holder: AXUIElement, scope: [String]) -> DefaultButtonRead {
    let (outcome, button) = Accessibility.elementRead(holder, "AXDefaultButton")
    switch outcome {
    case .value: return DefaultButtonRead(button: button.map { Accessibility.describe($0, scope: scope, markPanel: true) } ?? .null, read: button != nil)
    case .none: return DefaultButtonRead(button: .null, read: true)
    case .failed: return .failed
    }
  }

  /// CU-142's no-focus limit: with no focused element at all (keyboard navigation off - Return still presses the
  /// default button), the frontmost approved app's focused window decides: a sheet on it answers with the sheet's
  /// default button or null (a modal sheet's Return cannot press the window's), else the window's own.
  private func frontDefaultButton(scope: [String]) -> DefaultButtonRead {
    guard let pid = NSWorkspace.shared.frontmostApplication?.processIdentifier, let bundle = Accessibility.bundleId(pid: pid), scope.contains(bundle) else { return .failed }
    let app = AXUIElementCreateApplication(pid)
    // An app with no window at all (both reads a positive none) has no default button: read true. Any failed read: false.
    let (focusedOutcome, focusedWindow) = Accessibility.elementRead(app, "AXFocusedWindow")
    var window = focusedWindow
    if focusedOutcome == .failed { return .failed }
    if window == nil {
      let (mainOutcome, mainWindow) = Accessibility.elementRead(app, "AXMainWindow")
      if mainOutcome == .failed { return .failed }
      window = mainWindow
    }
    guard let window else { return DefaultButtonRead(button: .null, read: true) }
    let holder = Accessibility.children(window).first { Accessibility.string($0, "AXRole") == "AXSheet" } ?? window
    return readDefaultButton(of: holder, scope: scope)
  }

  /// CU-157 (reply-text-entered.md): the target's window - the hit element's, else the focused element's, else the
  /// frontmost approved app's focused window - scanned whole (sheets are its children). True when any text entry has
  /// characters; false only when every entry was read and is empty; null when anything is unread.
  func textEntered(at point: CGPoint?, scope: [String]) -> Bool? {
    limitTimeouts()
    let element: AXUIElement? = point.map { Accessibility.element(at: $0) } ?? Accessibility.focusedElement()
    var window: AXUIElement?
    var pid: pid_t?
    if let element {
      pid = Accessibility.pid(element)
      window = Accessibility.elementAttribute(element, "AXWindow") ?? (Accessibility.string(element, "AXRole") == "AXWindow" ? element : nil)
    } else if point == nil, let front = NSWorkspace.shared.frontmostApplication?.processIdentifier {
      pid = front
      let app = AXUIElementCreateApplication(front)
      window = Accessibility.elementAttribute(app, "AXFocusedWindow") ?? Accessibility.elementAttribute(app, "AXMainWindow")
    }
    guard let pid, let bundle = Accessibility.bundleId(pid: pid), scope.contains(bundle), let window else { return nil }
    return TextEntries.scan(window)
  }

  /// CU-187: the focused element when it is not a text entry and holds a non-collapsed AXSelectedTextRange (a selectable
  /// label, a table cell's text) - its role and caption only; no AXValue, no title, no selected text is read.
  func selectionSource(scope: [String]) -> JSON {
    limitTimeouts()
    guard let element = Accessibility.focusedElement(), let pid = Accessibility.pid(element),
          let bundle = Accessibility.bundleId(pid: pid), scope.contains(bundle) else { return .null }
    let role = Accessibility.string(element, "AXRole")
    // CU-209: the caption rule's own entry test - a read-only text view's selection is displayed text, reported with
    // its caption; an editable entry or a secure field is never reported (the focused entry's name judges it).
    var settable: DarwinBoolean = false
    let canSet = AXUIElementIsAttributeSettable(element, "AXValue" as CFString, &settable) == .success && settable.boolValue
    if role == nil || Caption.isEntry(role: role, settable: canSet) { return .null }
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, "AXSelectedTextRange" as CFString, &value) == .success, let value,
          CFGetTypeID(value) == AXValueGetTypeID() else { return .null }
    var range = CFRange()
    guard AXValueGetValue(value as! AXValue, .cfRange, &range), range.length > 0 else { return .null }
    return .object(["role": .optionalString(role), "caption": .optionalString(Accessibility.caption(element, role: role)),
                    "bundleId": .string(bundle), "pid": .int(Int(pid))])
  }

  /// CU-148: a sheet or alert in front where the focus is. Read from the focused app's focused window, so it holds
  /// with keyboard navigation off, when the focus is the window itself and a walk up from the focus never meets the
  /// sheet; with no focused element, from the frontmost approved app's focused window.
  func sheetPresent(scope: [String]) -> SheetRead? {
    limitTimeouts()
    // With no focused element at all (keyboard navigation off, nothing inside the sheet focused - CU-148's own case),
    // the frontmost app stands in, if approved (cu-verifier).
    let element = Accessibility.focusedElement()
    guard let pid = element.flatMap({ Accessibility.pid($0) }) ?? NSWorkspace.shared.frontmostApplication?.processIdentifier,
          let bundle = Accessibility.bundleId(pid: pid), scope.contains(bundle) else { return nil }
    var node: AXUIElement? = element
    var hops = 0
    while let current = node, hops < 60 {
      let role = Accessibility.string(current, "AXRole")
      if role == "AXSheet" { return SheetRead(sheet: true, bundleId: bundle, pid: pid) }
      if role == "AXWindow" || role == "AXApplication" { break }
      node = Accessibility.elementAttribute(current, "AXParent")
      hops += 1
    }
    let app = AXUIElementCreateApplication(pid)
    guard let window = Accessibility.elementAttribute(app, "AXFocusedWindow") ?? Accessibility.elementAttribute(app, "AXMainWindow") else {
      return SheetRead(sheet: false, bundleId: bundle, pid: pid)
    }
    if let subrole = Accessibility.string(window, "AXSubrole"), subrole == "AXDialog" || subrole == "AXSystemDialog" { return SheetRead(sheet: true, bundleId: bundle, pid: pid) }
    return SheetRead(sheet: Accessibility.children(window).contains { Accessibility.string($0, "AXRole") == "AXSheet" }, bundleId: bundle, pid: pid)
  }

  /// CU-151: `changeCount` only - never `string(forType:)`, `data(forType:)` or `types`, so no pasteboard content is
  /// read and macOS's paste-privacy alert has nothing to ask about (D-051's no-alert proof is cu-verifier's live row).
  func pasteboardChangeCount() -> Int? { NSPasteboard.general.changeCount }

  /// A system prompt that can take keys (CU-76, cu-verifier): the frontmost application is a system prompt process (an
  /// out-of-process dialog that is key), or the frontmost approved app's focused window or a sheet on it is an
  /// AXSystemDialog (an in-process prompt). An alert merely overlapping an approved window does not take keys - this
  /// Mac's notification alerts sat over task windows through dozens of runs that typed fine - so it is not counted;
  /// a click onto one is refused by its target's mark.
  func systemPromptPresent(scope: [String]) -> Bool {
    guard AXIsProcessTrusted(), let front = Accessibility.frontmostPid(), let bundle = Accessibility.bundleId(pid: front) else { return false }
    if SystemPrompt.isOwner(bundle) { return true }
    guard scope.contains(bundle) else { return false }
    let app = AXUIElementCreateApplication(front)
    guard let window = Accessibility.elementAttribute(app, "AXFocusedWindow") ?? Accessibility.elementAttribute(app, "AXMainWindow") else { return false }
    if Accessibility.string(window, "AXSubrole") == SystemPrompt.dialogSubrole { return true }
    return Accessibility.children(window).contains { Accessibility.string($0, "AXSubrole") == SystemPrompt.dialogSubrole }
  }

  func screenText(pid: pid_t, maxChars: Int) -> (text: String, truncated: Bool) {
    limitTimeouts()
    return Accessibility.windowText(pid: pid, maxChars: maxChars)
  }

  // MARK: Capture (Screen Recording)

  /// Capture the approved apps on one display with a window-scoped `SCContentFilter`, rebuilt for every capture
  /// (capture-and-scaling.md 0.4.6): only windows whose owner is approved by bundle id - ScreenCaptureKit's and
  /// AppKit's (pid -> NSRunningApplication) both, never a name - so windows of other apps, the desktop and other
  /// apps' menu bars are not in the image, and an approved browser's window that shows the live view (its title
  /// marker) is left out. The cursor is not drawn. Output is exactly the asked size.
  func capture(_ request: CaptureRequest, completion: @escaping (Result<CaptureShot, Refusal>) -> Void) {
    // Belt and braces: the dispatcher gates capture on the grant; ScreenCaptureKit is never touched without it.
    guard CGPreflightScreenCaptureAccess() else {
      return completion(.failure(Refusal(code: "not_granted", message: "the Screen Recording grant is missing", grant: "screen")))
    }
    SCShareableContent.getExcludingDesktopWindows(true, onScreenWindowsOnly: true) { content, error in
      guard let content else { return completion(.failure(Self.captureRefusal(error, fallback: "the shareable content could not be read"))) }
      guard let scDisplay = content.displays.first(where: { $0.displayID == request.display.id }) else {
        return completion(.failure(Refusal(code: "display_changed", message: "the run's display is no longer attached")))
      }
      let bounds = CGDisplayBounds(scDisplay.displayID)
      // Step 5 (2026-11-05): with an app-scoped filter, CU Ledger (unapproved, same executable name as CU Fixture)
      // reached the image. Each window's owner is now checked by pid through AppKit as well, and the filter names
      // the approved windows themselves, so ScreenCaptureKit cannot widen it to another process.
      // WindowServer's owner pid for each window id, resolved through AppKit, must agree with ScreenCaptureKit's owner.
      let owners = Dictionary(WindowOwners.onScreen().map { ($0.number, $0.pid) }, uniquingKeysWith: { first, _ in first })
      let approved = content.windows.filter { window in
        CaptureScope.approves(sckBundleId: window.owningApplication?.bundleIdentifier, appKitBundleId: owners[window.windowID].flatMap { Accessibility.bundleId(pid: $0) }, scope: request.scope)
      }
      if !approved.isEmpty, !approved.contains(where: { $0.frame.intersects(bounds) }) {
        return completion(.failure(Refusal(code: "display_changed", message: "the approved windows moved to another display")))
      }
      let hidden = approved.filter { ($0.title ?? "").contains(HelperIdentity.liveViewMarker) }
      let included = approved.filter { !hidden.contains($0) }
      // CU-101: no approved window on screen. ScreenCaptureKit refuses an empty include list, and capturing anything
      // wider (the display) would show the person's windows: the reply is a blank frame, marked, with no windows.
      if included.isEmpty {
        guard let blank = Frames.blank(width: request.widthPx, height: request.heightPx), let png = Frames.png(blank) else {
          return completion(.failure(Refusal(code: "failed", message: "the blank frame could not be drawn")))
        }
        return completion(.success(CaptureShot(png: png, widthPx: blank.width, heightPx: blank.height, windows: [], noAppWindow: true)))
      }
      let filter = SCContentFilter(display: scDisplay, including: included)
      // The menu bar shows only when an approved app is in front, and then only that app's own menu titles: the rest
      // of the strip (status items, the clock, Control Center) is blacked out after the capture.
      // Only on the display that holds the strip (CU-51): elsewhere the mask would not cover that display's own bar.
      let menuBar = self.approvedMenuBar(scope: request.scope).flatMap { MenuBarPlan.include(strip: $0.strip, display: bounds) ? $0 : nil }
      if #available(macOS 14.2, *) { filter.includeMenuBar = menuBar != nil }
      let config = CaptureConfig.make(area: request.area, displayBounds: bounds, widthPx: request.widthPx, heightPx: request.heightPx)
      SCScreenshotManager.captureImage(contentFilter: filter, configuration: config) { image, error in
        guard let image else { return completion(.failure(Self.captureRefusal(error, fallback: "the capture returned no image"))) }
        var shown: CGImage? = image
        if let menuBar, #available(macOS 14.2, *) {
          shown = Frames.blackOut(image, area: request.area, strip: menuBar.strip, keep: menuBar.items)
        }
        guard let shown, let exact = Frames.resized(shown, width: request.widthPx, height: request.heightPx), let png = Frames.png(exact) else {
          return completion(.failure(Refusal(code: "failed", message: "the capture could not be encoded")))
        }
        let windows = included.map { window -> JSON in
          .object([
            "bundleId": .optionalString(window.owningApplication?.bundleIdentifier), "pid": .int(Int(owners[window.windowID] ?? 0)),
            "title": .optionalString(window.title), "frame": .rect(window.frame),
          ])
        }
        completion(.success(CaptureShot(png: png, widthPx: exact.width, heightPx: exact.height, windows: windows)))
      }
    }
  }

  /// The frontmost app's menu bar strip and item frames, when that app is approved and Accessibility is granted.
  private func approvedMenuBar(scope: [String]) -> (strip: CGRect, items: [CGRect])? {
    guard AXIsProcessTrusted(), let front = frontmost(), let id = front.bundleId, scope.contains(id) else { return nil }
    limitTimeouts()
    return Accessibility.menuBar(pid: front.pid)
  }

  /// A ScreenCaptureKit failure as the protocol's refusal: the person declined the system's screen-access alert (or
  /// took the grant back) is `not_granted` naming the screen, so the run pauses for a person instead of ending
  /// `helper_lost`; anything else is `failed`.
  static func captureRefusal(_ error: Error?, fallback: String) -> Refusal {
    if let error = error as NSError?, error.domain == SCStreamErrorDomain, error.code == SCStreamError.Code.userDeclined.rawValue {
      return Refusal(code: "not_granted", message: "screen capture was declined; a person must allow it", grant: "screen")
    }
    return Refusal(code: "failed", message: fallback)
  }

  // MARK: Input (Accessibility and post-event access)

  func beginInput() {}

  func post(_ events: [CGEvent], mode: String, pid: pid_t) -> Bool {
    guard CGPreflightPostEventAccess() else { return false }
    for event in events {
      if mode == "pid" { event.postToPid(pid) } else { event.post(tap: .cghidEventTap) }
    }
    return true
  }

  func pointerLocation() -> CGPoint {
    CGEvent(source: nil)?.location ?? .zero
  }

  func secureInputEnabled() -> Bool {
    IsSecureEventInputEnabled()
  }

  func takePendingPersonInput() -> String? { nil }

  func postUntaggedMove() -> Bool {
    guard CGPreflightPostEventAccess(),
          let event = CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: pointerLocation(), mouseButton: .left) else { return false }
    event.setIntegerValueField(.eventSourceUserData, value: 0)
    event.post(tap: .cghidEventTap)
    return true
  }

  func confirmPhysical(seat: String, task: String, timeoutMs: Int) -> Result<ConfirmResult, Refusal> {
    guard !displays().isEmpty else { return .failure(Refusal(code: "no_display", message: "no display to show the confirmation prompt on")) }
    guard let result = ConfirmPrompt.ask(seat: seat, task: task, timeoutMs: timeoutMs) else {
      return .failure(Refusal(code: "busy", message: "a confirmation prompt is already on screen"))
    }
    return .success(result)
  }

  func lastLocalInputSource() -> EventSource? { EventTap.shared.lastSource }

  // MARK: Local input (the counter needs no grant; the tap only when already granted)

  func hidIdle() -> HIDIdle { HIDIdle.read() }

  func startTap(_ onLocalInput: @escaping (String) -> Void) -> Bool { EventTap.shared.start(onLocalInput) }

  func stopTap() { EventTap.shared.stop() }
}

/// PNG encoding and the frames of a dry run: black everywhere, approved apps drawn only inside their own rects.
enum Frames {
  /// An all-black image of the given size (CU-101's blank frame).
  static func blank(width: Int, height: Int) -> CGImage? {
    guard width > 0, height > 0, let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                                                         space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return nil }
    context.setFillColor(CGColor(red: 0, green: 0, blue: 0, alpha: 1))
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    return context.makeImage()
  }

  static func png(_ image: CGImage) -> Data? {
    let data = NSMutableData()
    guard let destination = CGImageDestinationCreateWithData(data as CFMutableData, "public.png" as CFString, 1, nil) else { return nil }
    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else { return nil }
    return data as Data
  }

  static func load(path: String) -> CGImage? {
    guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil) else { return nil }
    return CGImageSourceCreateImageAtIndex(source, 0, nil)
  }

  /// An sRGB bitmap of exactly `width` x `height`, filled black, y growing downward like the screen.
  static func canvas(width: Int, height: Int) -> CGContext? {
    guard let space = CGColorSpace(name: CGColorSpace.sRGB),
          let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0, space: space,
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
    context.setFillColor(CGColor(srgbRed: 0, green: 0, blue: 0, alpha: 1))
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    context.translateBy(x: 0, y: CGFloat(height))
    context.scaleBy(x: 1, y: -1)
    return context
  }

  /// Redraw at exactly `width` x `height` (ScreenCaptureKit may round a size differently than asked), in sRGB: an
  /// image in another colour space is colour-matched by the draw, so the PNG's values are sRGB on any display.
  static func resized(_ image: CGImage, width: Int, height: Int) -> CGImage? {
    if image.width == width && image.height == height && image.colorSpace?.name == CGColorSpace.sRGB { return image }
    guard let space = CGColorSpace(name: CGColorSpace.sRGB),
          let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0, space: space,
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
    context.interpolationQuality = .high
    context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    return context.makeImage()
  }

  /// `image` of `area` (global points) with every pixel of `strip` outside the `keep` frames painted black.
  static func blackOut(_ image: CGImage, area: CGRect, strip: CGRect, keep: [CGRect]) -> CGImage? {
    guard let context = canvas(width: image.width, height: image.height) else { return nil }
    let scaleX = Double(image.width) / Double(area.width)
    let scaleY = Double(image.height) / Double(area.height)
    func pixels(_ rect: CGRect) -> CGRect {
      CGRect(x: Double(rect.minX - area.minX) * scaleX, y: Double(rect.minY - area.minY) * scaleY,
             width: Double(rect.width) * scaleX, height: Double(rect.height) * scaleY)
    }
    // The canvas is flipped (y down); draw the image upright into it.
    context.saveGState()
    context.translateBy(x: 0, y: CGFloat(image.height))
    context.scaleBy(x: 1, y: -1)
    context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
    context.restoreGState()
    let path = CGMutablePath()
    path.addRect(pixels(strip))
    for rect in keep { path.addRect(pixels(rect.intersection(strip))) }
    context.addPath(path)
    context.setFillColor(CGColor(srgbRed: 0, green: 0, blue: 0, alpha: 1))
    context.fillPath(using: .evenOdd)
    return context.makeImage()
  }

  struct Piece {
    var frame: CGRect
    var image: CGImage?
    var colour: (Double, Double, Double)
  }

  /// `area` (global points) drawn into `width` x `height` pixels: black except the pieces, drawn back to front.
  static func compose(area: CGRect, width: Int, height: Int, pieces: [Piece]) -> CGImage? {
    guard let context = canvas(width: width, height: height) else { return nil }
    let scaleX = Double(width) / Double(area.width)
    let scaleY = Double(height) / Double(area.height)
    for piece in pieces.reversed() where piece.frame.intersects(area) {
      let rect = CGRect(x: Double(piece.frame.minX - area.minX) * scaleX, y: Double(piece.frame.minY - area.minY) * scaleY,
                        width: Double(piece.frame.width) * scaleX, height: Double(piece.frame.height) * scaleY)
      if let image = piece.image {
        context.saveGState()
        context.translateBy(x: rect.minX, y: rect.maxY)
        context.scaleBy(x: 1, y: -1)
        context.draw(image, in: CGRect(x: 0, y: 0, width: rect.width, height: rect.height))
        context.restoreGState()
      } else {
        context.setFillColor(CGColor(srgbRed: piece.colour.0, green: piece.colour.1, blue: piece.colour.2, alpha: 1))
        context.fill(rect)
      }
    }
    return context.makeImage()
  }
}

/// WindowServer's view of who owns which on-screen window - the ground truth both ScreenCaptureKit's app grouping and
/// Accessibility's hit test got wrong for two apps sharing an executable name (2026-11-05). Only the window number,
/// owner pid, layer, alpha and bounds are read: never a window's or owner's name.
enum WindowOwners {
  struct Window: Equatable { var number: CGWindowID; var pid: pid_t; var layer: Int; var alpha: Double; var bounds: CGRect }

  /// WindowServer's on-screen windows, front to back. `includingDesktop`: Finder's desktop window and the wallpaper too,
  /// so the hit window there can be named (Q-D15).
  static func onScreen(includingDesktop: Bool = false) -> [Window] {
    let options: CGWindowListOption = includingDesktop ? [.optionOnScreenOnly] : [.optionOnScreenOnly, .excludeDesktopElements]
    guard let list = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else { return [] }
    return list.compactMap { info in
      guard let number = (info[kCGWindowNumber as String] as? NSNumber)?.uint32Value,
            let pid = (info[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value,
            let boundsInfo = info[kCGWindowBounds as String] as? NSDictionary,
            let bounds = CGRect(dictionaryRepresentation: boundsInfo as CFDictionary) else { return nil }
      return Window(number: number, pid: pid, layer: (info[kCGWindowLayer as String] as? NSNumber)?.intValue ?? 0,
                    alpha: (info[kCGWindowAlpha as String] as? NSNumber)?.doubleValue ?? 1, bounds: bounds)
    }
  }

  static let windowServerPath = "/System/Library/PrivateFrameworks/SkyLight.framework/Resources/WindowServer"
  /// The same file as the kernel reports it: `Resources` is a symlink into `Versions/A`, and proc_pidpath gives the
  /// resolved path (measured, 2026-11-05: '.../SkyLight.framework/Versions/A/Resources/WindowServer'). Comparing with
  /// the unresolved one never matched, so 0.2.24 judged the menu bar as WindowServer's plain window and refused CU
  /// Fixture's own menu title (cu-researcher).
  static let windowServerRealPath = PanelPath.realPath(windowServerPath) ?? windowServerPath

  /// Whether a pid is WindowServer itself (the menu bar's owner).
  static func isWindowServer(_ pid: pid_t) -> Bool {
    guard let path = PeerCheck.executablePath(pid) else { return false }
    return path == windowServerRealPath || path == windowServerPath
  }

  /// Whether a process's executable lies on the SIP-protected system volume, which no third-party app can occupy.
  static func isSystemProcess(_ pid: pid_t) -> Bool {
    PeerCheck.executablePath(pid).map(isSystemPath) ?? false
  }

  /// SIP protects /System, /bin, /sbin and /usr - except /usr/local, which anyone with admin rights (Homebrew) writes.
  static func isSystemPath(_ path: String) -> Bool {
    if path.hasPrefix("/usr/local/") { return false }
    return ["/System/", "/bin/", "/sbin/", "/usr/"].contains(where: { path.hasPrefix($0) })
  }
}

/// The ScreenCaptureKit configuration of one capture: `area` (global points) of the display at `displayBounds`, drawn
/// into exactly widthPx x heightPx. Stretched to that size per axis (capture-and-scaling.md): never letterboxed, or the
/// driver's per-axis mapping back to points would be wrong. CU-74: without `scalesToFit` ScreenCaptureKit drew the
/// source at its native pixels into a larger buffer, so a simulated scale (and a clamped Retina frame) held unscaled
/// content - 1 px per point in a 2000 px frame - and every mapped click landed short by the factor.
enum CaptureConfig {
  static func make(area: CGRect, displayBounds: CGRect, widthPx: Int, heightPx: Int) -> SCStreamConfiguration {
    let config = SCStreamConfiguration()
    config.width = widthPx
    config.height = heightPx
    config.scalesToFit = true
    config.preservesAspectRatio = false
    config.sourceRect = CGRect(x: area.origin.x - displayBounds.origin.x, y: area.origin.y - displayBounds.origin.y, width: area.width, height: area.height)
    config.showsCursor = false
    config.capturesAudio = false
    config.backgroundColor = CGColor.black
    // sRGB on every display (a wide-gamut monitor reports its own space): the model and the marker matcher read the
    // PNG's values as sRGB, so they must be sRGB; Frames.resized converts anything else.
    config.colorSpaceName = CGColorSpace.sRGB
    return config
  }
}

/// CU-235: the menu bar's items as Accessibility reports them, depth-first in menu order, with each item's path of
/// titles. Bounded (depth 10 - three submenu levels - and 4000 items); nil when a read fails or a bound is hit, so a
/// partial walk never answers none.
enum MenuWalk {
  static let maxDepth = 10
  static let maxItems = 4000
  static let attributes = ["AXRole", "AXTitle", "AXEnabled", "AXMenuItemCmdChar", "AXMenuItemCmdModifiers", "AXMenuItemCmdVirtualKey", "AXMenuItemCmdGlyph", "AXChildren"] as CFArray

  static func entries(of menuBar: AXUIElement) -> (entries: [MenuKey.Entry], emptyMenus: [String])? {
    var entries: [MenuKey.Entry] = []
    var emptyMenus: [String] = []
    var visited = 0
    /// Reads one element's attributes in one call; nil on a failed read.
    func read(_ element: AXUIElement) -> [String: Any]? {
      var values: CFArray?
      guard AXUIElementCopyMultipleAttributeValues(element, attributes, AXCopyMultipleAttributeOptions(rawValue: 0), &values) == .success,
            let list = values as? [Any], list.count == 8 else { return nil }
      var result: [String: Any] = [:]
      let names = ["role", "title", "enabled", "char", "modifiers", "virtualKey", "glyph", "children"]
      for (name, value) in zip(names, list) {
        // A missing attribute comes back as an AXValue holding an error; leave it out.
        if CFGetTypeID(value as CFTypeRef) == AXValueGetTypeID(), AXValueGetType(value as! AXValue) == .axError { continue }
        result[name] = value
      }
      return result
    }
    func walk(_ element: AXUIElement, path: [String], depth: Int, apple: Bool) -> Bool {
      visited += 1
      guard visited <= maxItems, depth <= maxDepth, let values = read(element) else { return false }
      let role = values["role"] as? String
      let title = values["title"] as? String
      let children = (values["children"] as? [AXUIElement]) ?? []
      var here = path
      if role == "AXMenuItem" || role == "AXMenuBarItem" {
        here.append(title ?? "")
        if role == "AXMenuItem" {
          entries.append(MenuKey.Entry(title: title, path: here, enabled: values["enabled"] as? Bool, cmdChar: values["char"] as? String,
                                       cmdModifiers: (values["modifiers"] as? NSNumber)?.intValue, cmdVirtualKey: (values["virtualKey"] as? NSNumber)?.intValue,
                                       cmdGlyph: (values["glyph"] as? NSNumber)?.intValue, appleMenu: apple))
        }
      }
      // A top-level menu with no items yet (filled lazily), or a menu-bar item with no menu until it opens (built
      // lazily), cannot be judged by a miss - except the Apple menu, the menu bar's first item (by position).
      if MenuKey.isEmptyMenu(role: role, depth: depth, childCount: children.count, underApple: apple) { emptyMenus.append(here.last ?? title ?? "") }
      // The menu bar's first item is the Apple menu (CU-232 contract point 4).
      let start = entries.count
      for (index, child) in children.enumerated() where !walk(child, path: here, depth: depth + 1, apple: apple || (role == "AXMenuBar" && index == 0)) { return false }
      // CU-250: the items of a submenu that is the Services menu are marked servicesMenu.
      if role == "AXMenu" { MenuKey.markServices(&entries, from: start, holderTitle: path.last, depth: path.count + 1, services: .current) }
      return true
    }
    guard walk(menuBar, path: [], depth: 0, apple: false) else { return nil }
    return (entries, emptyMenus)
  }
}

/// CU-235: the characters the current keyboard layout gives a key without and with Shift, as AppKit's
/// charactersIgnoringModifiers matches menu key equivalents. Nil when the layout cannot be read (an input method
/// with no Unicode layout): then only virtual-key items can match, and a character item's miss is reported as none.
enum KeyLayout {
  /// `command`: translate with the Command bit, as layouts like Dvorak - QWERTY Command give QWERTY characters while
  /// Command is held (cu-researcher on #36); other layouts give the same characters either way.
  static func characters(keyCode: Int, command: Bool = false) -> (unshifted: String?, shifted: String?) {
    guard let source = TISCopyCurrentKeyboardLayoutInputSource()?.takeRetainedValue(),
          let pointer = TISGetInputSourceProperty(source, kTISPropertyUnicodeKeyLayoutData) else { return (nil, nil) }
    let data = Unmanaged<CFData>.fromOpaque(pointer).takeUnretainedValue() as Data
    return data.withUnsafeBytes { raw -> (String?, String?) in
      guard let layout = raw.baseAddress?.assumingMemoryBound(to: UCKeyboardLayout.self) else { return (nil, nil) }
      func translate(_ modifiers: UInt32) -> String? {
        var dead: UInt32 = 0
        var length = 0
        var chars = [UniChar](repeating: 0, count: 4)
        let status = UCKeyTranslate(layout, UInt16(keyCode), UInt16(kUCKeyActionDisplay), modifiers, UInt32(LMGetKbdType()),
                                    OptionBits(kUCKeyTranslateNoDeadKeysBit), &dead, chars.count, &length, &chars)
        guard status == noErr, length > 0 else { return nil }
        return String(utf16CodeUnits: chars, count: length)
      }
      let commandBit = command ? UInt32(cmdKey >> 8) & 0xFF : 0
      return (translate(commandBit), translate(commandBit | (UInt32(shiftKey >> 8) & 0xFF)))
    }
  }
}
