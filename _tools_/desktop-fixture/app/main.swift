// CU Fixture: the [cu] team's native macOS fixture app (cu-verifier). A thin AppKit renderer: the harness opens task
// screens and reads raw facts over a JSON-lines channel on stdin/stdout; expected values and judges live only in the
// harness (tasks.mjs), never in this process's windows, so an agent that sees the screen cannot read them.
//
//   CU Fixture.app/Contents/MacOS/cu-fixture [--offscreen] [--sandbox DIR] [--role fixture|ledger]
//
// --offscreen keeps every window borderless, never shown and at -30000,-30000 (self-tests render their own views with
// cacheDisplay: no capture of other apps, no synthetic OS input, nothing that needs Screen Recording or Accessibility).

import AppKit

// MARK: - Fixture state

final class Fixture: NSObject {
  static let shared = Fixture()
  var offscreen = false
  var sandbox = ""
  var role = "fixture"
  var controls: [String: NSView] = [:]
  var windows: [String: NSWindow] = [:]
  var events: [[String: Any]] = []
  var dropZones: [String: DropBoard] = [:]
  var checkboxes: Set<String> = []
  /// How each window was placed (Placement.place): default, moved, covered, or offscreen.
  var placements: [String: [String: Any]] = [:]

  func record(_ type: String, _ fields: [String: Any] = [:]) {
    var event = fields
    event["type"] = type
    event["seq"] = events.count + 1
    event["t"] = Date().timeIntervalSince1970
    events.append(event)
  }

  func reset() {
    // The text editor's Format menu and Undo/Redo belong to that screen only (CU-130).
    TextEditorScreen.uninstallMenus()
    ConsentKeys.uninstallMenus()
    MenuCompose.uninstallMenus()
    for window in windows.values { window.orderOut(nil); window.close() }
    windows = [:]
    Evidence.input = []
    controls = [:]
    dropZones = [:]
    checkboxes = []
    placements = [:]
    events = []
  }

  /// Current values of every named control: what is on screen, no more.
  func fields() -> [String: Any] {
    var out: [String: Any] = [:]
    for (name, view) in controls {
      // Grid cells report from the model below, not from whichever views are on screen.
      if view is GridCellField { continue }
      // A secure field's value never leaves the app: only whether it holds anything, and how much.
      if let secure = view as? NSSecureTextField { out[name] = secure.stringValue.isEmpty ? "" : "[secure, \(secure.stringValue.count) chars]" }
      else if let field = view as? NSTextField, field.isEditable { out[name] = field.stringValue }
      else if let popup = view as? NSPopUpButton { out[name] = popup.titleOfSelectedItem ?? "" }
      else if let box = view as? NSButton, checkboxes.contains(name) { out[name] = box.state == .on }
    }
    out.merge(Grid.fields()) { current, _ in current }
    out.merge(Files.fields()) { current, _ in current }
    out.merge(Hold.fields()) { current, _ in current }
    out.merge(ConsentKeys.fields()) { current, _ in current }
    out.merge(Invoice.fields()) { current, _ in current }
    out.merge(HoverChart.fields()) { current, _ in current }
    out.merge(WeekCalendar.fields()) { current, _ in current }
    out.merge(Mail.fields()) { current, _ in current }
    out.merge(SettingsTree.fields()) { current, _ in current }
    out.merge(TextEditorScreen.fields()) { current, _ in current }
    out.merge(ChatThread.fields()) { current, _ in current }
    out.merge(VendorForm.fields()) { current, _ in current }
    out.merge(WebButtons.fields()) { current, _ in current }
    out.merge(ConsentCells.fields()) { current, _ in current }
    out.merge(MenuCompose.fields()) { current, _ in current }
    return out
  }

  func isCheckbox(_ button: NSButton) -> Bool { checkboxes.contains(button.identifier?.rawValue ?? "") }

  @objc func pressed(_ sender: NSButton) {
    let name = sender.identifier?.rawValue ?? sender.title
    if isCheckbox(sender) { record("toggle", ["target": name, "on": sender.state == .on]) } else { record("press", ["target": name]) }
    Screens.handlePress(name, sender)
  }

  @objc func selected(_ sender: NSPopUpButton) {
    record("select", ["target": sender.identifier?.rawValue ?? "", "value": sender.titleOfSelectedItem ?? ""])
  }

  @objc func menuChosen(_ sender: NSMenuItem) {
    // How the choice arrived: a key equivalent (the current event is a key down) or the mouse.
    let via = NSApp.currentEvent?.type == .keyDown ? "key" : "mouse"
    record("menu", ["title": sender.title, "menu": sender.menu?.title ?? "", "via": via])
    Screens.handleMenu(sender.title)
  }
}

// MARK: - Controls

/// A list of named items the person drags onto named zones with the mouse (mouseDown, drag, mouseUp in this view), so
/// a synthetic OS drag works the same as a real one.
final class DropBoard: NSView {
  // A press on an inactive window starts the drag at once, as Finder's does: without this the first press only
  // activates the window, and a drag that is the run's first action picks nothing up (CU-36).
  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
  var items: [(name: String, frame: NSRect)] = []
  var zones: [(name: String, frame: NSRect)] = []
  var placed: [String: String] = [:]
  var dragging: String?
  var dragPoint = NSPoint.zero
  override var isFlipped: Bool { true }

  override func draw(_ dirtyRect: NSRect) {
    NSColor.white.setFill(); bounds.fill()
    for zone in zones {
      NSColor(calibratedWhite: 0.92, alpha: 1).setFill(); zone.frame.fill()
      NSColor.darkGray.setStroke(); NSBezierPath(rect: zone.frame).stroke()
      label(zone.name, at: NSPoint(x: zone.frame.minX + 8, y: zone.frame.minY + 6), size: 14)
    }
    for item in items where placed[item.name] == nil || dragging == item.name {
      var frame = item.frame
      if dragging == item.name { frame.origin = NSPoint(x: dragPoint.x - frame.width / 2, y: dragPoint.y - frame.height / 2) }
      NSColor(calibratedRed: 0.85, green: 0.9, blue: 1, alpha: 1).setFill(); frame.fill()
      NSColor.systemBlue.setStroke(); NSBezierPath(rect: frame).stroke()
      label(item.name, at: NSPoint(x: frame.minX + 6, y: frame.minY + 6), size: 13)
    }
  }

  func label(_ text: String, at point: NSPoint, size: CGFloat) {
    (text as NSString).draw(at: point, withAttributes: [.font: NSFont.systemFont(ofSize: size), .foregroundColor: NSColor.black])
  }

  override func mouseDown(with event: NSEvent) {
    let point = convert(event.locationInWindow, from: nil)
    dragging = items.first { placed[$0.name] == nil && $0.frame.contains(point) }?.name
    dragPoint = point
  }

  override func mouseDragged(with event: NSEvent) {
    guard dragging != nil else { return }
    dragPoint = convert(event.locationInWindow, from: nil)
    needsDisplay = true
  }

  override func mouseUp(with event: NSEvent) {
    guard let item = dragging else { return }
    dragging = nil
    let point = convert(event.locationInWindow, from: nil)
    // A drag that ends over another window's board drops there (screen points), as a cross-window drag does.
    if !zones.contains(where: { $0.frame.contains(point) }), let window, dropAcross(item, screenPoint: window.convertPoint(toScreen: event.locationInWindow)) { return }
    drop(item, at: point)
  }

  /// Drop `item` at `point`: the same code path for a person's drag and the harness oracle.
  func drop(_ item: String, at point: NSPoint) {
    if let zone = zones.first(where: { $0.frame.contains(point) }) {
      placed[item] = zone.name
      Fixture.shared.record("drop", ["item": item, "zone": zone.name])
    }
    needsDisplay = true
  }
}

enum Kit {
  static func label(_ text: String, size: CGFloat = 14, bold: Bool = false) -> NSTextField {
    let field = NSTextField(wrappingLabelWithString: text)
    field.font = bold ? NSFont.boldSystemFont(ofSize: size) : NSFont.systemFont(ofSize: size)
    field.textColor = .black
    return field
  }

  static func field(_ name: String, placeholder: String = "", secure: Bool = false) -> NSTextField {
    let field = secure ? NSSecureTextField() : NSTextField()
    field.identifier = NSUserInterfaceItemIdentifier(name)
    field.placeholderString = placeholder
    field.font = NSFont.systemFont(ofSize: 14)
    Fixture.shared.controls[name] = field
    return field
  }

  static func button(_ name: String, _ title: String) -> NSButton {
    let button = NSButton(title: title, target: Fixture.shared, action: #selector(Fixture.pressed(_:)))
    button.identifier = NSUserInterfaceItemIdentifier(name)
    button.bezelStyle = .rounded
    Fixture.shared.controls[name] = button
    return button
  }

  static func checkbox(_ name: String, _ title: String) -> NSButton {
    let box = NSButton(checkboxWithTitle: title, target: Fixture.shared, action: #selector(Fixture.pressed(_:)))
    box.identifier = NSUserInterfaceItemIdentifier(name)
    Fixture.shared.controls[name] = box
    Fixture.shared.checkboxes.insert(name)
    return box
  }

  static func popup(_ name: String, _ items: [String]) -> NSPopUpButton {
    let popup = NSPopUpButton(frame: .zero, pullsDown: false)
    popup.addItems(withTitles: items)
    popup.identifier = NSUserInterfaceItemIdentifier(name)
    popup.target = Fixture.shared
    popup.action = #selector(Fixture.selected(_:))
    Fixture.shared.controls[name] = popup
    return popup
  }

  /// A vertical stack of rows, pinned to the top-left of a white content view.
  static func page(_ rows: [NSView], width: CGFloat = 640, height: CGFloat = 420) -> NSView {
    let root = FlippedView(frame: NSRect(x: 0, y: 0, width: width, height: height))
    root.wantsLayer = true
    root.layer?.backgroundColor = NSColor.white.cgColor
    let stack = NSStackView(views: rows)
    stack.orientation = .vertical
    stack.alignment = .leading
    stack.spacing = 12
    stack.edgeInsets = NSEdgeInsets(top: 24, left: 24, bottom: 24, right: 24)
    stack.frame = root.bounds
    stack.autoresizingMask = [.width, .height]
    root.addSubview(stack)
    for row in rows where row is NSTextField && (row as! NSTextField).isEditable { row.widthAnchor.constraint(equalToConstant: 320).isActive = true }
    return root
  }

  static func row(_ views: [NSView]) -> NSStackView {
    let stack = NSStackView(views: views)
    stack.orientation = .horizontal
    stack.spacing = 8
    return stack
  }
}

final class FlippedView: NSView { override var isFlipped: Bool { true } }

// MARK: - Windows

enum Windows {
  /// `activate: false` for a window that must not take the front from CU Fixture (CU Ledger's out-of-scope blocker).
  static func open(_ id: String, title: String, content: NSView, activate: Bool = true) -> NSWindow {
    let fixture = Fixture.shared
    let size = content.frame.size
    let style: NSWindow.StyleMask = fixture.offscreen ? [.borderless] : [.titled, .closable]
    // CU Ledger's windows start to the right of CU Fixture's, so a two-app task does not open with one app covering the
    // other (the second app to open comes to the front).
    let left: CGFloat = fixture.role == "ledger" ? 800 : 120
    let origin = fixture.offscreen ? NSPoint(x: -30000, y: -30000) : NSPoint(x: left + CGFloat(fixture.windows.count) * 40, y: 160)
    let window = NSWindow(contentRect: NSRect(origin: origin, size: size), styleMask: style, backing: .buffered, defer: false)
    window.title = title
    window.appearance = NSAppearance(named: .aqua)
    window.isReleasedWhenClosed = false
    window.contentView = content
    window.identifier = NSUserInterfaceItemIdentifier(id)
    if !fixture.offscreen {
      // Hang from the top of the display's visible area (20 pt below the menu bar), so the window stays in the upper
      // half: an always-on overlay along the bottom of this Mac (Typeless, y >= 580 of 1080) then covers no task
      // window (cu-verifier's overlap pass). The x cascade is unchanged.
      let top = (NSScreen.screens.first?.visibleFrame.maxY ?? 1050) - 20
      window.setFrameTopLeftPoint(NSPoint(x: origin.x, y: top))
      // Never under another app's alert or panel, where the helper refuses input (S5's first live run).
      fixture.placements[id] = Placement.place(window)
    } else {
      fixture.placements[id] = ["state": "offscreen"]
    }
    fixture.windows[id] = window
    if !fixture.offscreen {
      // A visible task starts with the fixture in front, as a person sets up a run: otherwise whatever app is in front
      // (System Settings after a grant, say) decides the first action, and agent core rightly hands it to the person.
      if activate {
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
      }
      // Activation can be declined while the person works in another app (cooperative activation): the window still
      // comes to the front, so a task never starts behind the owner's browser (drag-across-other-app, 2026-11-06).
      window.orderFrontRegardless()
    }
    content.layoutSubtreeIfNeeded()
    return window
  }

  /// Render a window's own content to PNG (cacheDisplay of our own view; no screen capture).
  static func render(_ id: String, to path: String) throws -> [String: Any] {
    guard let view = Fixture.shared.windows[id]?.contentView, let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds) else { throw ChannelError.message("no window \(id)") }
    view.layoutSubtreeIfNeeded()
    view.cacheDisplay(in: view.bounds, to: rep)
    // CU-207: the cache is in the window's display colour space - on a wide-gamut monitor sRGB magenta caches as
    // (223, 60, 246) and no marker is found. Converted to sRGB, the PNG's values are the same on every display.
    let srgb = rep.converting(to: .sRGB, renderingIntent: .default) ?? rep
    try srgb.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: path))
    return ["path": path, "width": rep.pixelsWide, "height": rep.pixelsHigh, "points": [view.bounds.width, view.bounds.height]]
  }

  /// Every named control's frame in its window's top-left point coordinates, and the window's screen origin.
  /// CU-137: what Accessibility reports at each target's centre - the element a hit test finds there, its role and its
  /// name (label, title or value). A target that reads as the bare window, a group or no name hides its meaning from the
  /// agent's policy (a destructive press would be classed by nothing).
  static func axAudit() -> [String: Any] {
    var out: [String: Any] = [:]
    let shown = targets()
    for (name, view) in Fixture.shared.controls {
      guard let window = view.window, shown[name] != nil else { continue }
      let rect = view.convert(view.bounds, to: nil)
      let centre = window.convertPoint(toScreen: NSPoint(x: rect.midX, y: rect.midY))
      // An offscreen window answers no system hit test, so walk Accessibility's own tree: the deepest accessibility
      // element at the centre inside the target, else the nearest accessible ancestor (the window, for a bare view).
      let hit: NSAccessibilityProtocol? = axHit(view, centre) ?? axAncestor(view)
      var role: String?, label: String?
      if let element = hit {
        role = element.accessibilityRole()?.rawValue
        let candidates: [String?] = [element.accessibilityLabel(), element.accessibilityTitle(), element.accessibilityValue() as? String]
        label = candidates.compactMap { $0 }.first { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
        // A system part without a name of its own (a stepper's arrow) takes the name of the control it belongs to,
        // up to the target view itself.
        var node: Any? = element.accessibilityParent()
        while label == nil, let current = node as? NSAccessibilityProtocol {
          label = current.accessibilityLabel().flatMap { $0.isEmpty ? nil : $0 }
          if (current as? NSView) === view { break }
          node = current.accessibilityParent()
        }
      }
      let element: Any = hit.map { String(describing: type(of: $0)) } ?? NSNull()
      out[name] = ["role": (role as Any?) ?? NSNull(), "name": (label as Any?) ?? NSNull(), "element": element]
    }
    return out
  }

  private static func axHit(_ element: NSAccessibilityProtocol, _ point: NSPoint) -> NSAccessibilityProtocol? {
    for child in (element.accessibilityChildren() ?? []).reversed() {
      guard let child = child as? NSAccessibilityProtocol, child.accessibilityFrame().contains(point) else { continue }
      if let found = axHit(child, point) { return found }
    }
    return element.isAccessibilityElement() ? element : nil
  }

  private static func axAncestor(_ view: NSView) -> NSAccessibilityProtocol? {
    var node: Any? = view.accessibilityParent()
    while let current = node as? NSAccessibilityProtocol {
      if current.isAccessibilityElement() { return current }
      node = current.accessibilityParent()
    }
    return view.window
  }

  static func targets() -> [String: Any] {
    var out: [String: Any] = [:]
    for (name, view) in Fixture.shared.controls {
      guard let window = view.window, let content = window.contentView else { continue }
      // A table makes cell views for whole rows; only cells shown in the grid's scroll area are targets.
      if let cell = view as? GridCellField, !Grid.isShown(cell) { continue }
      if let row = view as? FileRowView, !Files.isShown(row) { continue }
      if let row = view as? InvoiceRowView, !Invoice.isShown(row) { continue }
      if let row = view as? MailRowView, !Mail.isShown(row) { continue }
      // The page and its list are targets while any part of them is in the window.
      if let scroll = view as? NSScrollView, let invoice = Invoice.shared, scroll === invoice.list,
         !invoice.page.contentView.bounds.intersects(scroll.convert(scroll.bounds, to: invoice.page.contentView)) { continue }
      let frame = view.convert(view.bounds, to: content)
      let top = content.isFlipped ? frame.minY : content.bounds.height - frame.maxY
      // A control on an attached sheet (an alert) counts in the sheet's own window, '<window>:sheet' in `windows`.
      let windowName = window.sheetParent.map { "\($0.identifier?.rawValue ?? ""):sheet" } ?? window.identifier?.rawValue ?? ""
      out[name] = ["window": windowName, "x": frame.minX, "y": top, "width": frame.width, "height": frame.height, "cx": frame.midX, "cy": top + frame.height / 2, "type": String(describing: type(of: view))]
    }
    out.merge(WebButtons.targets()) { current, _ in current }
    for (name, board) in Fixture.shared.dropZones {
      guard let window = board.window, let content = window.contentView else { continue }
      for item in board.items + board.zones {
        let frame = board.convert(item.frame, to: content)
        let top = content.isFlipped ? frame.minY : content.bounds.height - frame.maxY
        out["\(name):\(item.name)"] = ["window": window.identifier?.rawValue ?? "", "x": frame.minX, "y": top, "width": frame.width, "height": frame.height, "cx": frame.midX, "cy": top + frame.height / 2]
      }
    }
    return out
  }
}

// MARK: - Channel

enum ChannelError: Error { case message(String) }

func reply(_ id: Any, _ result: [String: Any]? = nil, error: String? = nil) {
  var message: [String: Any] = ["id": id]
  if let error { message["error"] = error } else { message["result"] = result ?? [:] }
  let data = try! JSONSerialization.data(withJSONObject: message, options: [.sortedKeys])
  FileHandle.standardOutput.write(data + Data([10]))
}

func handle(_ message: [String: Any]) {
  let id = message["id"] ?? NSNull()
  let method = message["method"] as? String ?? ""
  let params = message["params"] as? [String: Any] ?? [:]
  let fixture = Fixture.shared
  do {
    switch method {
    case "hello":
      reply(id, ["role": fixture.role, "offscreen": fixture.offscreen, "pid": ProcessInfo.processInfo.processIdentifier, "bundle": Bundle.main.bundleIdentifier ?? "", "screens": NSScreen.screens.map { ["width": $0.frame.width, "height": $0.frame.height, "scale": $0.backingScaleFactor] }])
    case "reset":
      fixture.reset()
      reply(id, ["ok": true])
    case "open":
      let task = params["task"] as? String ?? ""
      try Screens.open(task, params["params"] as? [String: Any] ?? [:])
      reply(id, ["windows": Array(fixture.windows.keys).sorted()])
    case "state":
      reply(id, ["events": fixture.events, "fields": fixture.fields(), "windows": Array(fixture.windows.keys).sorted(), "input": Evidence.input])
    case "act":
      try Oracle.act(params)
      reply(id, ["ok": true])
    case "targets":
      reply(id, Windows.targets())
    case "axAudit":
      reply(id, Windows.axAudit())
    case "screen":
      // The primary display in points and its backing scale: a scripted plan turns points into frame pixels with them.
      let screen = NSScreen.screens.first
      reply(id, ["width": screen?.frame.width ?? 0, "height": screen?.frame.height ?? 0, "scale": screen?.backingScaleFactor ?? 1])
    case "windows":
      var sizes: [String: Any] = [:]
      // `x`, `y`: the content's top-left in global points, y down from the primary screen's top (as the helper and a
      // scripted plan count), so a control's screen point is that plus its `targets` centre.
      let primaryHeight = NSScreen.screens.first?.frame.height ?? 0
      for (name, window) in fixture.windows {
        guard let content = window.contentView else { continue }
        let rect = window.contentRect(forFrameRect: window.frame)
        sizes[name] = ["width": content.bounds.width, "height": content.bounds.height, "title": window.title,
                       "x": rect.minX, "y": primaryHeight - rect.maxY,
                       // How an overlay was built (CU-14): its alpha, window level and whether clicks pass through it.
                       "alpha": window.backgroundColor.alphaComponent, "level": window.level.rawValue, "clickThrough": window.ignoresMouseEvents,
                       // Whether it opened clear of other apps' floating windows (Placement.place), and whether another
                       // app's window is in front of it now.
                       "placement": Placement.now(window, opened: fixture.placements[name] ?? ["state": "unknown"])]
      }
      // An attached sheet (an alert on the window) is listed as '<name>:sheet', so a scripted click on its buttons has
      // the sheet's own origin (CU-135, CU-148 click rows).
      for (name, window) in fixture.windows {
        guard let sheet = window.attachedSheet, let content = sheet.contentView else { continue }
        let rect = sheet.contentRect(forFrameRect: sheet.frame)
        sizes["\(name):sheet"] = ["width": content.bounds.width, "height": content.bounds.height, "title": sheet.title, "x": rect.minX, "y": primaryHeight - rect.maxY,
                                  "alpha": sheet.backgroundColor.alphaComponent, "level": sheet.level.rawValue, "clickThrough": sheet.ignoresMouseEvents, "sheet": true]
      }
      reply(id, sizes)
    case "trigger":
      // Test seam for the overlay-late mode: the notification CU Fixture posts on the trigger key, without a key.
      DistributedNotificationCenter.default().postNotificationName(Evidence.trigger, object: nil, userInfo: nil, deliverImmediately: true)
      reply(id, ["posted": true])
    case "axpersist":
      // Whether every drawn list hands out the same row elements on every ask (CU-19): an accessibility client in another
      // process reads an element after the hit test returns it, so a list that makes fresh ones each time is roleless there.
      var lists = 0, same = true
      for case let list as RowList in fixture.controls.values {
        lists += 1
        let first = list.accessibilityChildren() as? [AnyObject] ?? [], second = list.accessibilityChildren() as? [AnyObject] ?? []
        if first.count != second.count || zip(first, second).contains(where: { $0 !== $1 }) { same = false }
      }
      reply(id, ["lists": lists, "same": same])
    case "ax":
      // This app's own accessibility elements and its visible label text (in-process, no grant).
      var elements: [[String: Any]] = []
      var visible: [String] = []
      func walk(_ view: NSView) {
        if view.isAccessibilityElement() { elements.append(["role": view.accessibilityRole()?.rawValue ?? "", "label": view.accessibilityLabel() ?? "", "id": view.identifier?.rawValue ?? ""]) }
        // Elements a view exposes without being views (a drawn list's rows, CU-19), named under their parent.
        if view.isAccessibilityElement(), let children = view.accessibilityChildren() as? [NSAccessibilityElement] {
          for child in children {
            elements.append(["role": child.accessibilityRole()?.rawValue ?? "", "label": child.accessibilityLabel() ?? "", "title": child.accessibilityTitle() ?? "", "parent": view.identifier?.rawValue ?? ""])
          }
        }
        if let label = view as? NSTextField, !label.isEditable, !label.isHidden { visible.append(label.stringValue) }
        if let button = view as? NSButton { visible.append(button.title) }
        view.subviews.forEach(walk)
      }
      for window in fixture.windows.values { if let content = window.contentView { walk(content) } }
      reply(id, ["elements": elements, "visible": visible])
    case "render":
      reply(id, try Windows.render(params["window"] as? String ?? "", to: params["path"] as? String ?? ""))
    case "clipboardSave":
      // S5 (CU-62): the owner's pasteboard into this process's memory for the run; counts only on the channel.
      guard fixture.role == "fixture" else { throw ChannelError.message("only CU Fixture keeps the clipboard") }
      reply(id, ClipboardStash.shared.save())
    case "clipboardRestore":
      reply(id, ClipboardStash.shared.restore())
    case "clipboardLiveCheck":
      // cu-verifier's announced live check of the guard on the real board (empty owner board only, sentinels only).
      guard fixture.role == "fixture" else { throw ChannelError.message("only CU Fixture keeps the clipboard") }
      reply(id, ClipboardLiveCheck.run())
    case "clipboardAccess":
      // Whether CU Fixture may read the owner's board without the owner being asked - the setting only, no content.
      let permission = ClipboardStash.systemAccess(.general)
      reply(id, ["allowed": permission.allowed, "behavior": permission.behavior])
    case "clipboardSelfTest":
      reply(id, ClipboardSelfTest.run())
    case "clipboardSentinel":
      // CU-230's live rows (cu-verifier): a paste with no own copy must find fixture text on the board, never the
      // owner's - written only to an empty board this app may read without asking; booleans and counts on the channel.
      guard fixture.role == "fixture" else { throw ChannelError.message("only CU Fixture keeps the clipboard") }
      reply(id, ClipboardSentinel.shared.put())
    case "clipboardSentinelClear":
      guard fixture.role == "fixture" else { throw ChannelError.message("only CU Fixture keeps the clipboard") }
      reply(id, ClipboardSentinel.shared.clear())
    case "clipboardSentinelSelfTest":
      reply(id, ClipboardSentinel.selfTest())
    case "menuItemForKey":
      // Test seam: the menu item a key equivalent such as "alt+shift+cmd+v" reaches - its title and action, nothing run.
      let item = Menus.itemForKey(params["key"] as? String ?? "")
      reply(id, ["title": item?.title ?? NSNull(), "action": item?.action.map { NSStringFromSelector($0) } ?? NSNull()])
    case "menuAX":
      // CU-238: what AppKit serves Accessibility for menu-compose's own menus (Message, Later) - title, enabled and the
      // key-equivalent attributes only, read in process; the helper's menuKey reads the same values across processes.
      reply(id, ["menus": MenuCompose.accessibilityMenus()])
    case "gridShown":
      // Test seam: what a grid cell shows on screen now (chain-rows' computed D cells).
      let shown = Grid.shown(params["cell"] as? String ?? "")
      reply(id, ["text": shown?.text ?? NSNull(), "editable": shown?.editable ?? NSNull()])
    case "inFront":
      // Test seam for Placement.covering: a front-to-back window list as {number, pid, layer, x, y, width, height, owner}.
      let r = { (value: Any?) -> NSRect in
        let o = value as? [String: Any] ?? [:]
        let n = { (key: String) in CGFloat((o[key] as? NSNumber)?.doubleValue ?? 0) }
        return NSRect(x: n("x"), y: n("y"), width: n("width"), height: n("height"))
      }
      let list = (params["list"] as? [[String: Any]] ?? []).map { o in
        Placement.Shown(number: (o["number"] as? NSNumber)?.intValue ?? 0, pid: (o["pid"] as? NSNumber)?.int32Value ?? 0,
                        layer: (o["layer"] as? NSNumber)?.intValue ?? 0, rect: r(o), owner: o["owner"] as? String ?? "?")
      }
      reply(id, ["by": Placement.covering(r(params["frame"]), number: (params["number"] as? NSNumber)?.intValue ?? 0,
                                          me: (params["me"] as? NSNumber)?.int32Value ?? 0, in: list)])
    case "placement":
      // Test seam for Placement.spot: rects as {x, y, width, height} in AppKit coordinates.
      func rect(_ value: Any?) -> NSRect {
        let r = value as? [String: Any] ?? [:]
        let n = { (key: String) in CGFloat((r[key] as? NSNumber)?.doubleValue ?? 0) }
        return NSRect(x: n("x"), y: n("y"), width: n("width"), height: n("height"))
      }
      let blocks = (params["blocks"] as? [Any] ?? []).map(rect)
      if let spot = Placement.spot(for: rect(params["frame"]), avoiding: blocks, in: rect(params["visible"])) {
        reply(id, ["x": spot.minX, "y": spot.minY, "width": spot.width, "height": spot.height])
      } else {
        reply(id, ["none": true])
      }
    case "quit":
      reply(id, ["ok": true])
      DispatchQueue.main.async { NSApp.terminate(nil) }
    default:
      reply(id, error: "unknown method '\(method)'")
    }
  } catch ChannelError.message(let text) {
    reply(id, error: text)
  } catch {
    reply(id, error: "\(error)")
  }
}

// MARK: - Start

let arguments = CommandLine.arguments
Fixture.shared.offscreen = arguments.contains("--offscreen")
if let i = arguments.firstIndex(of: "--sandbox"), i + 1 < arguments.count { Fixture.shared.sandbox = arguments[i + 1] }
if let i = arguments.firstIndex(of: "--role"), i + 1 < arguments.count { Fixture.shared.role = arguments[i + 1] }

let app = NSApplication.shared
app.setActivationPolicy(Fixture.shared.offscreen ? .accessory : .regular)
Menus.install()
Evidence.install()
Clipboard.installTerminationRestore()

Thread.detachNewThread {
  while let line = readLine(strippingNewline: true) {
    guard let data = line.data(using: .utf8), let message = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { continue }
    DispatchQueue.main.async { handle(message) }
  }
  // The harness closed the channel: the fixture ends with it.
  DispatchQueue.main.async { NSApp.terminate(nil) }
}
app.run()
