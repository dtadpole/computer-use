import AppKit
import ApplicationServices
import CoreGraphics
import Foundation

/// Accessibility reads. Every function here needs the Accessibility grant and is reached only through the
/// dispatcher's grant check. Values of secure text fields are never read: an element whose subrole is
/// `AXSecureTextField` is described by role, title and frame only, and skipped by `screenText`.
enum Accessibility {
  static let secureSubrole = "AXSecureTextField"
  /// Unnamed elements of these roles are `opaque`: a canvas or a poorly exposed app whose target AX cannot name (R92).
  static let genericRoles: Set<String> = ["AXUnknown", "AXGroup", "AXWindow", "AXScrollArea"]

  static func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
    return value
  }

  static func string(_ element: AXUIElement, _ name: String) -> String? {
    attribute(element, name) as? String
  }

  /// `AXURL` as text: a CFURL's absolute string, or a string value.
  static func urlString(_ element: AXUIElement) -> String? {
    guard let value = attribute(element, "AXURL") else { return nil }
    if CFGetTypeID(value) == CFURLGetTypeID() { return (value as! URL).absoluteString }
    return value as? String
  }

  static func elementAttribute(_ element: AXUIElement, _ name: String) -> AXUIElement? {
    guard let value = attribute(element, name), CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
    return (value as! AXUIElement)
  }

  static func children(_ element: AXUIElement) -> [AXUIElement] {
    guard let value = attribute(element, "AXChildren"), CFGetTypeID(value) == CFArrayGetTypeID() else { return [] }
    let array = value as! CFArray
    var result: [AXUIElement] = []
    for index in 0..<CFArrayGetCount(array) {
      guard let raw = CFArrayGetValueAtIndex(array, index) else { continue }
      let item = Unmanaged<CFTypeRef>.fromOpaque(raw).takeUnretainedValue()
      if CFGetTypeID(item) == AXUIElementGetTypeID() { result.append(item as! AXUIElement) }
    }
    return result
  }

  static func frame(_ element: AXUIElement) -> CGRect? {
    guard let position = attribute(element, "AXPosition"), let size = attribute(element, "AXSize"),
          CFGetTypeID(position) == AXValueGetTypeID(), CFGetTypeID(size) == AXValueGetTypeID() else { return nil }
    var point = CGPoint.zero
    var extent = CGSize.zero
    guard AXValueGetValue(position as! AXValue, .cgPoint, &point), AXValueGetValue(size as! AXValue, .cgSize, &extent) else { return nil }
    return CGRect(origin: point, size: extent)
  }

  static func pid(_ element: AXUIElement) -> pid_t? {
    var pid: pid_t = 0
    return AXUIElementGetPid(element, &pid) == .success ? pid : nil
  }

  static func bundleId(pid: pid_t) -> String? {
    NSRunningApplication(processIdentifier: pid)?.bundleIdentifier
  }

  /// The frontmost app as Accessibility sees it now (the system-wide focused application), read fresh rather than
  /// from NSWorkspace, whose answer updates only through the main run loop.
  static func frontmostPid() -> pid_t? {
    guard let app = elementAttribute(AXUIElementCreateSystemWide(), "AXFocusedApplication") else { return nil }
    return pid(app)
  }

  static func frontmostBundleId() -> String? {
    frontmostPid().flatMap { bundleId(pid: $0) }
  }

  /// Ask an approved app to come to the front by setting its `AXFrontmost`, then wait briefly until Accessibility
  /// reports it frontmost. A background helper's `NSRunningApplication.activate` can be refused under cooperative
  /// activation; `AXFrontmost` is the route the design review proposed, verified rather than trusted.
  static func makeFrontmost(pid: pid_t, timeout: TimeInterval = 0.5) -> Bool {
    let app = AXUIElementCreateApplication(pid)
    _ = AXUIElementSetAttributeValue(app, "AXFrontmost" as CFString, kCFBooleanTrue)
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
      if frontmostPid() == pid { return true }
      usleep(25_000)
    }
    return frontmostPid() == pid
  }

  /// Ask an approved app to expose its whole tree (Electron apps build it only when `AXManualAccessibility` is set), or
  /// with `on: false` give that back at the run's end (CU-329). Bounded by a 0.5 s messaging timeout.
  static func setManualAccessibility(pid: pid_t, on: Bool = true) {
    let app = AXUIElementCreateApplication(pid)
    AXUIElementSetMessagingTimeout(app, 0.5)
    _ = AXUIElementSetAttributeValue(app, "AXManualAccessibility" as CFString, on ? kCFBooleanTrue : kCFBooleanFalse)
  }

  /// CU-329: the app's AXManualAccessibility before the helper writes it. "No value" and "unsupported" mean unset;
  /// any other error (a timeout, a dead element) is a failed read.
  static func manualAccessibility(pid: pid_t) -> ManualAccessibilityRestore.Prior {
    let app = AXUIElementCreateApplication(pid)
    AXUIElementSetMessagingTimeout(app, 0.5)
    var value: CFTypeRef?
    let error = AXUIElementCopyAttributeValue(app, "AXManualAccessibility" as CFString, &value)
    if error == .noValue || error == .attributeUnsupported { return .unset }
    guard error == .success, let value else { return .unreadable }
    if CFGetTypeID(value) == CFBooleanGetTypeID() { return CFBooleanGetValue((value as! CFBoolean)) ? .on : .unset }
    if let number = value as? NSNumber { return number.boolValue ? .on : .unset }
    return .unreadable
  }

  /// The title of the window an element belongs to; read only for an approved app (the caller checks).
  static func windowTitle(of element: AXUIElement) -> String? {
    if string(element, "AXRole") == "AXWindow" { return string(element, "AXTitle") }
    return elementAttribute(element, "AXWindow").flatMap { string($0, "AXTitle") }
  }

  /// The deepest element at a point, as the system reports it - for pid and owner checks and Q-D12's desktop reading.
  static func element(at point: CGPoint) -> AXUIElement? {
    var element: AXUIElement?
    guard AXUIElementCopyElementAtPosition(AXUIElementCreateSystemWide(), Float(point.x), Float(point.y), &element) == .success else { return nil }
    return element
  }

  /// CU-199: the element at a point within one app's own tree (its windows only) - the hit window's element beneath a
  /// click-through overlay of another process.
  static func element(at point: CGPoint, inApp pid: pid_t) -> AXUIElement? {
    var element: AXUIElement?
    guard AXUIElementCopyElementAtPosition(AXUIElementCreateApplication(pid), Float(point.x), Float(point.y), &element) == .success else { return nil }
    return element
  }

  /// CU-180: the action target at a point - the deepest element lifted to the control a click there activates. Only
  /// the hit test reads it; every other reader keeps the raw element (cu-verifier, cu-developer-two).
  static func actionTarget(at point: CGPoint) -> (element: AXUIElement, pressSignal: Bool, leaf: AXUIElement?)? { element(at: point).map(actionableTarget) }

  /// CU-180: the deepest element at a point lifted to the control a click there activates (Actionable.pick), within
  /// the same process.
  static func actionableTarget(_ hit: AXUIElement) -> (element: AXUIElement, pressSignal: Bool, leaf: AXUIElement?) {
    // Up to the web area or window (at most 64 steps), so root delegation can be seen however deep the hit sits; the
    // climb itself stays within Actionable.maxHops.
    var chain: [AXUIElement] = [hit]
    var roles: [String?] = [string(hit, "AXRole")]
    var node = elementAttribute(hit, "AXParent")
    while let current = node, chain.count < 64 {
      let role = string(current, "AXRole")
      chain.append(current)
      roles.append(role)
      if let role, role == "AXWebArea" || role == "AXWindow" || role == "AXApplication" { break }
      node = elementAttribute(current, "AXParent")
    }
    let hitPid = pid(hit)
    let web = roles.firstIndex(where: { $0 == "AXWebArea" })
    let nodes = chain.indices.map { i -> Actionable.Node in
      let element = chain[i]
      let near = web.map { i <= $0 } ?? false
      let titled = (string(element, "AXTitle").map { !$0.isEmpty } ?? false) || (string(element, "AXDescription").map { !$0.isEmpty } ?? false)
      return Actionable.Node(role: roles[i], actions: actionNames(element), titled: titled,
                             frame: near ? frame(element) : nil, childCount: web == i ? children(element).count : nil)
    }
    let pick = Actionable.choose(nodes)
    // `leaf`: the hit element when the target was lifted from it - its caption stands in when the control has none.
    let lifted = pick.index > 0 && pid(chain[pick.index]) == hitPid
    return (lifted ? chain[pick.index] : hit, pick.pressSignal, lifted ? hit : nil)
  }

  static func actionNames(_ element: AXUIElement) -> [String] {
    var names: CFArray?
    guard AXUIElementCopyActionNames(element, &names) == .success, let list = names as? [String] else { return [] }
    return list
  }

  /// CU-194: the global top-left origin of the element's AXWindow (a sheet is its own AXWindow), or nil.
  static func windowOrigin(of element: AXUIElement) -> CGPoint? {
    guard let window = elementAttribute(element, "AXWindow"), let value = attribute(window, "AXPosition"),
          CFGetTypeID(value) == AXValueGetTypeID() else { return nil }
    var point = CGPoint.zero
    return AXValueGetValue(value as! AXValue, .cgPoint, &point) ? point : nil
  }

  /// CU-187: a label element's text - a static text's words, else its title or description.
  static func labelText(_ element: AXUIElement) -> String? {
    let role = string(element, "AXRole")
    if role.map({ TextEntries.entryRoles.contains($0) || $0 == "AXSecureTextField" }) ?? false { return nil }
    let candidates = [role == "AXStaticText" ? string(element, "AXValue") : nil, string(element, "AXTitle"), string(element, "AXDescription"), displayText(element)]
    return candidates.compactMap { $0 }.first { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
  }

  /// CU-187: the caption of a non-entry element (Caption.pick): its AXTitleUIElement, else - within four steps up to an
  /// AXRow - its column's header (the table's AXColumnHeaderUIElements) joined with its row's key (the table's row
  /// header, or a two-cell row's first cell). A text entry gets none: its own name already says what it is.
  static func caption(_ element: AXUIElement, role: String?) -> String? {
    var settable: DarwinBoolean = false
    let canSet = AXUIElementIsAttributeSettable(element, "AXValue" as CFString, &settable) == .success && settable.boolValue
    if Caption.isEntry(role: role, settable: canSet) { return nil }
    let titleElement = elementAttribute(element, "AXTitleUIElement").flatMap(labelText)
    var columnHeader: String?
    var rowHeader: String?
    var rowFirstCell: String?
    if titleElement == nil {
      var branch = element
      var node = elementAttribute(element, "AXParent")
      for _ in 0..<4 {
        guard let current = node else { break }
        if string(current, "AXRole") == "AXRow" {
          let cells = children(current)
          if let column = cells.firstIndex(where: { CFEqual($0, branch) }) {
            let table = elementAttribute(current, "AXParent")
            if let table, let value = attribute(table, "AXColumnHeaderUIElements"),
               CFGetTypeID(value) == CFArrayGetTypeID(), let headers = value as? [AXUIElement], column < headers.count {
              columnHeader = labelText(headers[column])
            }
            if let table, let index = number(current, "AXIndex"), let value = attribute(table, "AXRowHeaderUIElements"),
               CFGetTypeID(value) == CFArrayGetTypeID(), let headers = value as? [AXUIElement], index >= 0, index < headers.count,
               !CFEqual(headers[index], branch) {
              rowHeader = labelText(headers[index])
            }
            // Only a key | value row: in a wider row the first cell is a data column, its text another value
            // (cu-developer-one); a table's own column headers come first anyway.
            if column > 0, cells.count == 2, let first = cells.first { rowFirstCell = labelText(first) }
          }
          break
        }
        branch = current
        node = elementAttribute(current, "AXParent")
      }
    }
    return Caption.pick(isEntry: false, titleElement: titleElement, columnHeader: columnHeader, rowHeader: rowHeader, rowFirstCell: rowFirstCell)
  }

  /// CU-180: an actionable element with no title or description is named by the display text of its static-text
  /// descendants (labels, never a text entry's value - D-060), at most 80 characters, three levels down.
  static func displayText(_ element: AXUIElement) -> String? {
    var parts: [String] = []
    func walk(_ node: AXUIElement, _ depth: Int) {
      guard depth <= 3, parts.joined(separator: " ").count < 80 else { return }
      for child in children(node) {
        let role = string(child, "AXRole")
        if role == "AXStaticText", let text = string(child, "AXValue")?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty { parts.append(text) }
        else if role.map({ !TextEntries.entryRoles.contains($0) && $0 != "AXSecureTextField" }) ?? true { walk(child, depth + 1) }
      }
    }
    walk(element, 1)
    let joined = parts.joined(separator: " ")
    return joined.isEmpty ? nil : String(joined.prefix(80))
  }

  /// The bundle id of the app owning the element at a global point, without reading anything else of it.
  static func bundleId(at point: CGPoint) -> String? {
    element(at: point).flatMap { pid($0) }.flatMap { bundleId(pid: $0) }
  }

  static func focusedElement() -> AXUIElement? {
    elementAttribute(AXUIElementCreateSystemWide(), "AXFocusedUIElement")
  }

  /// CU-190: an element-valued attribute with what the read said - the element, a positive none, or a failure.
  static func elementRead(_ element: AXUIElement, _ name: String) -> (AXRead, AXUIElement?) {
    var value: CFTypeRef?
    let outcome = AXRead.outcome(AXUIElementCopyAttributeValue(element, name as CFString, &value))
    guard outcome == .value else { return (outcome, nil) }
    guard let value, CFGetTypeID(value) == AXUIElementGetTypeID() else { return (.failed, nil) }
    return (.value, (value as! AXUIElement))
  }

  /// The app's menu bar strip and the frames of its own menu bar items (global points), from its `AXMenuBar`.
  static func menuBar(pid: pid_t) -> (strip: CGRect, items: [CGRect])? {
    let app = AXUIElementCreateApplication(pid)
    guard let bar = elementAttribute(app, "AXMenuBar"), let strip = frame(bar) else { return nil }
    var children: CFTypeRef?
    guard AXUIElementCopyAttributeValue(bar, "AXChildren" as CFString, &children) == .success, let items = children as? [AXUIElement] else {
      return (strip, [])
    }
    return (strip, items.compactMap { frame($0) }.filter { $0.width > 0 && $0.height > 0 })
  }

  static func focusedWindowFrame(pid: pid_t) -> CGRect? {
    let app = AXUIElementCreateApplication(pid)
    guard let window = elementAttribute(app, "AXFocusedWindow") ?? elementAttribute(app, "AXMainWindow") else { return nil }
    return frame(window)
  }

  /// An element as the protocol's target: `{ bundleId, pid, role, subrole, title, frame, secure, editable }`.
  /// Outside the scope only the owner is named (trajectory-privacy.md: no titles of windows outside the scope).
  /// `title` is the title or, failing that, the description; never the value.
  /// An element of an app outside the scope: its owner only.
  static func unapproved(bundleId bundle: String?, pid owner: pid_t?) -> JSON {
    .object([
      "bundleId": .optionalString(bundle), "pid": owner.map { .int(Int($0)) } ?? .null, "role": .null, "subrole": .null,
      "title": .null, "frame": .null, "secure": .bool(false), "opaque": .bool(false), "editable": .null,
    ])
  }

  /// `markPanel`: an approved element inside an AppKit open or save panel also gets `panel` (CU-39). `attributedTo`: an
  /// element of the panel service attributed to its client (file-panels.md, the remote case), reported as the client's
  /// with `hostedBy`.
  static func describe(_ element: AXUIElement, scope: [String], markPanel: Bool = false, attributedTo client: AppRef? = nil, pressSignal: Bool = true, captionLeaf: AXUIElement? = nil) -> JSON {
    let owner = client?.pid ?? pid(element)
    let bundle = client?.bundleId ?? owner.flatMap { bundleId(pid: $0) }
    guard let bundle, scope.contains(bundle) else { return unapproved(bundleId: bundle, pid: owner) }
    let subrole = string(element, "AXSubrole")
    var settable: DarwinBoolean = false
    let editable = AXUIElementIsAttributeSettable(element, "AXValue" as CFString, &settable) == .success && settable.boolValue
    let role = string(element, "AXRole")
    // CU-180: an unnamed actionable control (a web button whose words are a child label) takes its label's text.
    let own = string(element, "AXTitle").flatMap { $0.isEmpty ? nil : $0 } ?? string(element, "AXDescription").flatMap { $0.isEmpty ? nil : $0 }
    let title = TargetName.pick(own: own, role: role, actionable: Actionable.isActionable(Actionable.Node(role: role, actions: actionNames(element), titled: false), press: pressSignal),
                                displayText: { displayText(element) }, staticValue: { string(element, "AXValue") })
    let captionValue = Caption.forTarget(own: caption(element, role: role), leaf: captionLeaf.flatMap { caption($0, role: string($0, "AXRole")) })
    let placeholderValue = Placeholder.applies(role: role) ? Placeholder.pick(role: role, raw: string(element, "AXPlaceholderValue")) : nil
    var shape: [String: JSON] = [
      "bundleId": .string(bundle),
      "pid": owner.map { .int(Int($0)) } ?? .null,
      "role": .optionalString(role),
      "subrole": .optionalString(subrole),
      "title": .optionalString(title),
      "frame": frame(element).map { .rect($0) } ?? .null,
      "secure": .bool(subrole == secureSubrole || role == secureSubrole),
      "opaque": .bool(title == nil && genericRoles.contains(role ?? "AXUnknown")),
      // What a launch_code check reads (design 0.3.4): the file an element shows and its URL, approved apps only.
      "filename": .optionalString(string(element, "AXFilename")),
      "url": .optionalString(urlString(element)),
      "editable": .bool(editable),
      // CU-194: where the element's window (or sheet) sits, so the driver can key a field by its frame within it - a
      // window moved between two reads keeps the key. Global top-left points; null when AXWindow cannot be read.
      "windowOrigin": windowOrigin(of: element).map { .object(["x": .double(Double($0.x)), "y": .double(Double($0.y))]) } ?? .null,
      // CU-187: the label that captions a non-entry element (the driver carries it like the name, outside the fingerprint).
      // A target lifted from a captioned value (a value inside a pressable row or card) keeps the value's caption when
      // the control itself has none (cu-developer-two's residual on CU-195).
      "caption": .optionalString(captionValue),
      // CU-349: an entry's placeholder (AXPlaceholderValue, never its AXValue), for the consent field rules' extra name.
      "placeholder": .optionalString(placeholderValue),
      // CU-361: an entry with no title, caption or placeholder - the static text beside it in layout (NearbyLabel), read
      // from its window's static texts, never the entry's own value; agent core uses it upgrade-only.
      "nearbyLabel": .optionalString(Placeholder.applies(role: role) && title == nil && captionValue == nil && placeholderValue == nil ? nearbyLabel(element) : nil),
    ]
    if markPanel {
      // One ancestor walk for both markers. CU-322 (D-089): `inWebArea` - true when the element is, or descends from,
      // an AXWebArea; false at a clean top without one; null when the walk could not finish.
      let walk = ancestorWalk(of: element)
      if let kind = PanelMarker.kind(path: walk.path, ending: walk.ending) { shape["panel"] = .string(kind) }
      shape["inWebArea"] = WebArea.contains(path: walk.path.map { $0.role }, ending: walk.ending).map { .bool($0) } ?? .null
    }
    if client != nil { shape["hostedBy"] = .string(PanelAttribution.serviceBundleId) }
    // CU-154: a menu item's key equivalent, so Copy / Cut / Paste are known in any language (Command-V is a paste
    // whatever the title says).
    if role == "AXMenuItem", let key = KeyEquivalent.shape(char: string(element, "AXMenuItemCmdChar"),
                                                         modifiers: (attribute(element, "AXMenuItemCmdModifiers") as? NSNumber)?.intValue) {
      shape["keyEquivalent"] = key
    }
    // CU-250: a menu item says where it sits - its menu path, and whether a submenu on the way is the Services menu -
    // so policy refuses a clicked service (an owner-installed one included), not only the default services' titles.
    if role == "AXMenuItem" { for (key, value) in menuContext(of: element, title: string(element, "AXTitle")).json { shape[key] = value } }
    // CU-372: a pop-up button takes type-ahead and arrows without opening its menu, so it says what it holds - its menu
    // items as AX shows them closed (PopUpItems), never by opening the menu.
    // A pull-down button is AXMenuButton in AppKit: the same read, marked pullsDown (its title is a label, not a value).
    if role == "AXPopUpButton" || role == "AXMenuButton" { shape["popUp"] = popUp(element, pullsDown: role == "AXMenuButton") }
    return .object(shape)
  }

  /// CU-372: a pop-up button's selected title (its AXValue) and its menu's items, read from the AXMenu among its
  /// AXChildren (at most 200 children read) - attributes only, never AXPress or AXShowMenu. No menu child: unread.
  private static func popUp(_ element: AXUIElement, pullsDown: Bool) -> JSON {
    let selected = pullsDown ? string(element, "AXTitle") : string(element, "AXValue")
    guard let menu = children(element).first(where: { string($0, "AXRole") == "AXMenu" }) else { return PopUpItems.shape(selected: selected, items: nil, pullsDown: pullsDown) }
    let entries = children(menu)
    guard entries.count <= 200 else { return PopUpItems.shape(selected: selected, items: nil, pullsDown: pullsDown) }
    let items = entries.filter { string($0, "AXRole") == "AXMenuItem" }
      .map { PopUpItems.Item(title: string($0, "AXTitle"), enabled: (attribute($0, "AXEnabled") as? NSNumber)?.boolValue) }
    return PopUpItems.shape(selected: selected, items: items, pullsDown: pullsDown)
  }

  /// CU-361: the static text beside an entry in layout (NearbyLabel.pick) - its window's AXStaticText descendants (at
  /// most 400 read), each by its shown words (a static text's AXValue) and frame. The entry's own value is never read.
  private static func nearbyLabel(_ element: AXUIElement) -> String? {
    guard let box = frame(element), let window = elementAttribute(element, "AXWindow") else { return nil }
    let candidates = descendants(of: window, limit: 400)
      .filter { string($0, "AXRole") == "AXStaticText" }
      .compactMap { label -> NearbyLabel.Candidate? in
        guard let text = string(label, "AXValue"), let rect = frame(label) else { return nil }
        return NearbyLabel.Candidate(text: text, frame: rect)
      }
    return NearbyLabel.pick(box: box, candidates: candidates)
  }

  /// CU-250: the menus above a menu item, nearest first, up to the menu bar (or a context menu's top): each submenu's
  /// holding item title and its items' titles (at most 60 read, for the Services markers). Names only.
  static func menuContext(of item: AXUIElement, title: String?) -> MenuContext {
    var levels: [MenuContext.Level] = []
    var node = elementAttribute(item, "AXParent")
    while let menu = node, levels.count < MenuContext.maxDepth, string(menu, "AXRole") == "AXMenu" {
      let holder = elementAttribute(menu, "AXParent")
      let holderRole = holder.flatMap { string($0, "AXRole") }
      let holds = holderRole == "AXMenuItem" || holderRole == "AXMenuBarItem"
      let childTitles = children(menu).prefix(60).compactMap { string($0, "AXTitle") }
      levels.append(MenuContext.Level(holderTitle: holds ? holder.flatMap { string($0, "AXTitle") } ?? "" : nil, childTitles: childTitles))
      guard holds, holderRole == "AXMenuItem", let holder else { break }
      node = elementAttribute(holder, "AXParent")
    }
    return MenuContext.of(itemTitle: title, levels: levels)
  }

  /// The subroles of an element and its ancestors up to its window, nearest first (CU-76: a system dialog marks itself
  /// AXSystemDialog on the dialog, not on its buttons). At most `limit` steps.
  static func subroleAncestry(_ element: AXUIElement, limit: Int = 40) -> [String?] {
    var out: [String?] = []
    var current: AXUIElement? = element
    var steps = 0
    while let node = current, steps < limit {
      out.append(string(node, "AXSubrole"))
      if string(node, "AXRole") == "AXWindow" { break }
      current = elementAttribute(node, "AXParent")
      steps += 1
    }
    return out
  }

  /// An element's descendants, breadth first, at most `limit`.
  static func descendants(of element: AXUIElement, limit: Int) -> [AXUIElement] {
    var out: [AXUIElement] = []
    var queue = children(element)
    while !queue.isEmpty, out.count < limit {
      let next = queue.removeFirst()
      out.append(next)
      queue += children(next)
    }
    return out
  }

  /// The frames of the AXSheets on an app's own focused window (file-panels.md: the client's attached sheet).
  static func sheetFrames(pid: pid_t) -> [CGRect] {
    let app = AXUIElementCreateApplication(pid)
    guard let window = elementAttribute(app, "AXFocusedWindow") ?? elementAttribute(app, "AXMainWindow") else { return [] }
    return children(window).filter { string($0, "AXRole") == "AXSheet" }.compactMap { frame($0) }
  }

  /// The app's AppKit open/save panel in front: its focused window when that is the panel (modal), or a sheet on it,
  /// known by AppKit's AXIdentifier - never by a title.
  static func frontPanel(pid: pid_t) -> AXUIElement? {
    let app = AXUIElementCreateApplication(pid)
    guard let window = elementAttribute(app, "AXFocusedWindow") ?? elementAttribute(app, "AXMainWindow") else { return nil }
    let isPanel = { (element: AXUIElement) in string(element, "AXIdentifier").map { PanelMarker.identifiers[$0] != nil } ?? false }
    if isPanel(window) { return window }
    if let sheet = children(window).first(where: { string($0, "AXRole") == "AXSheet" && isPanel($0) }) { return sheet }
    // CU-139 (cu-verifier's live inspect: selection null with Go to Folder up): the keyboard can sit in a sheet ON the
    // panel, so the focused window is that sheet. Walk up from it, then search the app's windows and their sheets
    // (two levels: a window's save sheet, and a sheet on that) for the panel.
    var node: AXUIElement? = elementAttribute(window, "AXParent")
    var hops = 0
    while let current = node, hops < 8, string(current, "AXRole") != "AXApplication" {
      if isPanel(current) { return current }
      node = elementAttribute(current, "AXParent")
      hops += 1
    }
    // The last resort counts only when it finds exactly ONE panel: with two documents' save panels open it cannot tell
    // which one the keyboard is in, and checking the other panel's folder would be wrong (cu-verifier).
    var found: [AXUIElement] = []
    for top in elements(app, "AXWindows") {
      if isPanel(top) { found.append(top) }
      for sheet in children(top) where string(sheet, "AXRole") == "AXSheet" {
        if isPanel(sheet) { found.append(sheet) }
        found.append(contentsOf: children(sheet).filter { string($0, "AXRole") == "AXSheet" && isPanel($0) })
      }
    }
    return found.count == 1 ? found[0] : nil
  }

  /// An attribute's array of elements (AXWindows, AXChildren), empty when absent.
  static func number(_ element: AXUIElement, _ name: String) -> Int? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success, let number = value as? NSNumber else { return nil }
    return number.intValue
  }

  static func elements(_ element: AXUIElement, _ name: String) -> [AXUIElement] {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success, let list = value as? [AXUIElement] else { return [] }
    return list
  }

  /// A panel's file-name field (NSSavePanel's `saveAsNameTextField`) and folder. The folder is read only from the
  /// panel's own AXURL/AXDocument, never guessed from the sidebar or the path menu's titles; when neither is there it is
  /// nil, and the request shows no path (agent core asks with the button's name).
  static func panelFields(pid: pid_t) -> PanelFields? {
    guard let panel = frontPanel(pid: pid) else { return nil }
    // One walk outside the file browser: the save name field (its text and whether it has the keyboard focus) and the
    // Where / path pop-up, whose title is the folder the panel shows by display name (CU-48 A: a check, never a source;
    // the C inspect found no URL anywhere outside the panel itself).
    var queue = [panel], seen = 0
    var nameField: AXUIElement?, popup: AXUIElement?
    while !queue.isEmpty, seen < 3000, nameField == nil || popup == nil {
      let element = queue.removeFirst()
      seen += 1
      let role = string(element, "AXRole")
      if role == "AXBrowser" { continue }
      if nameField == nil, role == "AXTextField", string(element, "AXIdentifier") == "saveAsNameTextField" { nameField = element }
      if popup == nil, role == "AXPopUpButton" { popup = element }
      queue += children(element)
    }
    // The pop-up's VALUE is the folder it shows; its title can be the label beside it ('Where:', cu-verifier's live
    // inspect), so a title is used only when there is no value and it is not a label.
    let shown = popup.flatMap { button -> String? in
      if let value = string(button, "AXValue"), !value.isEmpty { return value }
      return string(button, "AXTitle").flatMap { $0.isEmpty || $0.hasSuffix(":") ? nil : $0 }
    }
    // nameFieldFocused (CU-139): whether the KEYBOARD focus is the name field - the system-wide focused element compared
    // with it - never the field's own AXFocused, which is its window's first responder and stays true while an attached
    // Go to Folder sheet holds the keyboard (cu-verifier's live rows, cu-developer-one's diagnosis). False with a sheet
    // on the panel or no name field (an open panel); null when the system focus cannot be read.
    let goToSheet = children(panel).contains { string($0, "AXRole") == "AXSheet" }
    let systemFocus = focusedElement()
    let focused: Bool? = nameField.map { field -> Bool? in
      if goToSheet { return false }
      guard let systemFocus else { return nil }
      // While the field is edited, AX may report AppKit's field editor (an NSTextView inside the field) as focused:
      // the field itself or a focus whose parent is the field both count (cu-developer-one).
      return CFEqual(systemFocus, field) || elementAttribute(systemFocus, "AXParent").map { CFEqual($0, field) } ?? false
    } ?? false
    // Go to Folder: a sheet on the panel whose text field holds a typed path - read before its Return (cu-researcher).
    if let goTo = children(panel).first(where: { string($0, "AXRole") == "AXSheet" }),
       let field = descendants(of: goTo, limit: 400).first(where: { string($0, "AXRole") == "AXTextField" || string($0, "AXRole") == "AXComboBox" }),
       let typed = string(field, "AXValue"), !typed.isEmpty {
      return PanelFields(directory: nil, fileName: typed, shownFolderName: shown, nameFieldFocused: focused)
    }
    let name = nameField.flatMap { string($0, "AXValue") }
    let folder = attribute(panel, "AXURL") as? URL ?? attribute(panel, "AXDocument").flatMap { ($0 as? String).flatMap(URL.init(string:)) }
    return PanelFields(directory: folder?.isFileURL == true ? folder?.path : nil, fileName: name, shownFolderName: shown, nameFieldFocused: focused)
  }

  /// An element and its ancestors, nearest first (AXIdentifier, AXRole), at most PanelMarker.maxDepth levels up to a
  /// window or the application, and how the walk ended - read once for the panel marker and for `inWebArea` (CU-322).
  static func ancestorWalk(of element: AXUIElement) -> (path: [(identifier: String?, role: String?)], ending: PanelMarker.Ending) {
    var path: [(identifier: String?, role: String?)] = []
    var node = element
    while path.count < PanelMarker.maxDepth {
      let role = string(node, "AXRole")
      path.append((string(node, "AXIdentifier"), role))
      if role == "AXWindow" || role == "AXApplication" { return (path, .top) }
      var value: CFTypeRef?
      let error = AXUIElementCopyAttributeValue(node, "AXParent" as CFString, &value)
      if error == .noValue || error == .attributeUnsupported { return (path, .top) }
      guard error == .success, let value, CFGetTypeID(value) == AXUIElementGetTypeID() else { return (path, .error) }
      node = value as! AXUIElement
    }
    return (path, .limit)
  }

  /// The AppKit panel an element lies in, by its ancestors' AXIdentifier (`save-panel`, `open-panel`), at most
  /// PanelMarker.maxDepth levels up; `unknown` when the walk ends in an Accessibility error or at the limit.
  static func panelKind(of element: AXUIElement) -> String? {
    let walk = ancestorWalk(of: element)
    return PanelMarker.kind(path: walk.path, ending: walk.ending)
  }

  /// Visible text of an app's focused window: titles, descriptions and the string values of text elements, breadth
  /// first, at most `maxChars` characters and a bounded number of elements; secure fields and their subtrees are
  /// skipped without reading them.
  static func windowText(pid: pid_t, maxChars: Int, maxElements: Int = 4000) -> (text: String, truncated: Bool) {
    let app = AXUIElementCreateApplication(pid)
    guard let window = elementAttribute(app, "AXFocusedWindow") ?? elementAttribute(app, "AXMainWindow") else { return ("", false) }
    let textRoles: Set<String> = ["AXStaticText", "AXTextField", "AXTextArea", "AXHeading", "AXLink", "AXCell"]
    var queue: [AXUIElement] = [window]
    var visited = 0
    var parts: [String] = []
    var length = 0
    var truncated = false
    while !queue.isEmpty, visited < maxElements {
      let element = queue.removeFirst()
      visited += 1
      if string(element, "AXSubrole") == secureSubrole { continue }
      let role = string(element, "AXRole") ?? ""
      var pieces: [String] = []
      if let title = string(element, "AXTitle"), !title.isEmpty { pieces.append(title) }
      if let description = string(element, "AXDescription"), !description.isEmpty { pieces.append(description) }
      if textRoles.contains(role), let value = string(element, "AXValue"), !value.isEmpty { pieces.append(value) }
      for piece in pieces {
        let remaining = maxChars - length
        if remaining <= 0 { truncated = true; break }
        let clipped = String(piece.prefix(remaining))
        if clipped.count < piece.count { truncated = true }
        parts.append(clipped)
        length += clipped.count + 1
      }
      if length >= maxChars { truncated = truncated || !queue.isEmpty; break }
      queue.append(contentsOf: children(element))
    }
    if visited >= maxElements, !queue.isEmpty { truncated = true }
    return (String(parts.joined(separator: "\n").prefix(maxChars)), truncated)
  }
}

extension TextEntries {
  /// The live window read into nodes - roles, subroles and AXNumberOfCharacters only, never AXValue. A window larger
  /// than the cap is unread unless text was already found.
  static func scan(_ window: AXUIElement) -> Bool? {
    var budget = limit
    var capped = false
    func node(_ element: AXUIElement) -> Node {
      budget -= 1
      if budget <= 0 { capped = true; return Node(role: nil, subrole: nil, count: nil, children: []) }
      let role = Accessibility.string(element, "AXRole")
      let isEntry = role.map { entryRoles.contains($0) } ?? false
      let kids = isEntry || role == "AXWebArea" ? [] : Accessibility.children(element).map(node)
      return Node(role: role, subrole: Accessibility.string(element, "AXSubrole"),
                  count: isEntry ? Accessibility.number(element, "AXNumberOfCharacters") : nil, children: kids)
    }
    return afterCap(judge(node(window)), capped: capped)
  }
}
