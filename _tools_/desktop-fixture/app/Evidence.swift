// Outside evidence for the desktop verifiers (M6 testability review items 1, 3, 4, 5 and 7): every input event this
// app receives is logged with where it landed and which process posted it, plus the input-recorder, marker-colour and
// secure-marker screens. A local event monitor sees only this app's own events, so nothing here needs a TCC grant.

import AppKit

/// The marker colour of stand-in screens, sRGB #FF00FF: no capture of an excluded or unapproved app may contain it.
/// Display profiles shift it, so checks match it with a tolerance (red and blue above 230, green below 100).
let MARKER_COLOR = NSColor(srgbRed: 1, green: 0, blue: 1, alpha: 1)

/// A view that fills itself with one colour in draw(_:).
final class SolidView: NSView {
  var color = NSColor.white
  override var isFlipped: Bool { true }
  override func draw(_ dirtyRect: NSRect) { color.setFill(); bounds.fill() }
}

enum Evidence {
  static var input: [[String: Any]] = []
  static var monitor: Any?
  /// The overlay-late trigger (CU-14): CU Fixture posts it when it receives the Insert key (kVK_Help, 0x72), and an
  /// armed overlay in CU Ledger appears `delayMs` later - a window that shows up between the agent's look and its click.
  static let trigger = Notification.Name("ai.reflection.cu.fixture.trigger")
  static let triggerKeyCode: UInt16 = 0x72
  static var triggerObserver: NSObjectProtocol?

  static func install() {
    let mask: NSEvent.EventTypeMask = [.leftMouseDown, .leftMouseUp, .leftMouseDragged, .rightMouseDown, .rightMouseUp, .otherMouseDown, .otherMouseUp, .mouseMoved, .scrollWheel, .keyDown, .keyUp, .flagsChanged]
    monitor = NSEvent.addLocalMonitorForEvents(matching: mask) { event in
      record(event)
      return event
    }
  }

  static let kinds: [NSEvent.EventType: String] = [
    .leftMouseDown: "mouseDown", .leftMouseUp: "mouseUp", .leftMouseDragged: "mouseDragged", .rightMouseDown: "rightMouseDown",
    .rightMouseUp: "rightMouseUp", .otherMouseDown: "otherMouseDown", .otherMouseUp: "otherMouseUp", .mouseMoved: "mouseMoved",
    .scrollWheel: "scroll", .keyDown: "keyDown", .keyUp: "keyUp", .flagsChanged: "flagsChanged",
  ]

  /// One input event: kind, window and global points (top-left), the target under it, and who posted it.
  static func record(_ event: NSEvent) {
    var entry: [String: Any] = ["seq": input.count + 1, "t": Date().timeIntervalSince1970, "kind": kinds[event.type] ?? "\(event.type.rawValue)"]
    entry["modifiers"] = event.modifierFlags.intersection(.deviceIndependentFlagsMask).rawValue
    if let cg = event.cgEvent {
      entry["pid"] = cg.getIntegerValueField(.eventSourceUnixProcessID)
      entry["tag"] = cg.getIntegerValueField(.eventSourceUserData)
    }
    switch event.type {
    case .keyDown, .keyUp:
      entry["keyCode"] = event.keyCode
      if event.type == .keyDown && event.keyCode == triggerKeyCode && Fixture.shared.role == "fixture" {
        DistributedNotificationCenter.default().postNotificationName(trigger, object: nil, userInfo: nil, deliverImmediately: true)
      }
      entry["characters"] = event.charactersIgnoringModifiers ?? ""
      entry["repeat"] = event.isARepeat
      // Which field had the keyboard: a text field edits through the window's field editor, whose delegate it is.
      if let editor = event.window?.firstResponder as? NSTextView, let field = editor.delegate as? NSTextField { entry["focus"] = field.identifier?.rawValue ?? "" }
    case .flagsChanged:
      entry["keyCode"] = event.keyCode
    default:
      if let window = event.window, let content = window.contentView {
        let local = content.convert(event.locationInWindow, from: nil)
        let top = content.isFlipped ? local.y : content.bounds.height - local.y
        entry["window"] = window.identifier?.rawValue ?? ""
        entry["x"] = local.x
        entry["y"] = top
        let screen = window.convertPoint(toScreen: event.locationInWindow)
        let height = NSScreen.screens.first?.frame.height ?? 0
        entry["globalX"] = screen.x
        entry["globalY"] = height - screen.y
        entry["target"] = targetName(window: entry["window"] as? String ?? "", x: local.x, y: top) ?? NSNull()
      }
      if event.type == .scrollWheel {
        entry["deltaX"] = event.scrollingDeltaX
        entry["deltaY"] = event.scrollingDeltaY
      } else {
        entry["button"] = event.buttonNumber
        if event.type != .mouseMoved && event.type != .leftMouseDragged { entry["clickCount"] = event.clickCount }
      }
    }
    input.append(entry)
  }

  /// The named control or recorder target under a window point, if any.
  static func targetName(window: String, x: CGFloat, y: CGFloat) -> String? {
    let targets = Windows.targets()
    for (name, value) in targets {
      guard let frame = value as? [String: Any], frame["window"] as? String == window,
            let fx = frame["x"] as? CGFloat, let fy = frame["y"] as? CGFloat, let fw = frame["width"] as? CGFloat, let fh = frame["height"] as? CGFloat else { continue }
      if x >= fx && x <= fx + fw && y >= fy && y <= fy + fh { return name }
    }
    return nil
  }

  /// Open an evidence screen; false when the task is not one of these.
  static func open(_ task: String, title: String) -> Bool {
    let fixture = Fixture.shared
    switch task {
    case "input-recorder":
      // Targets at odd positions and sizes; a text field for typing; mouse-moved events on.
      let root = FlippedView(frame: NSRect(x: 0, y: 0, width: 800, height: 560))
      root.wantsLayer = true
      root.layer?.backgroundColor = NSColor.white.cgColor
      let specs: [(String, NSRect, NSColor)] = [
        ("box-a", NSRect(x: 37, y: 41, width: 23, height: 19), .systemRed), ("box-b", NSRect(x: 611, y: 83, width: 17, height: 29), .systemGreen),
        ("box-c", NSRect(x: 301, y: 277, width: 41, height: 13), .systemBlue), ("box-d", NSRect(x: 709, y: 491, width: 31, height: 31), .systemOrange),
      ]
      for (name, frame, color) in specs {
        let box = NSView(frame: frame)
        box.wantsLayer = true
        box.layer?.backgroundColor = color.cgColor
        box.identifier = NSUserInterfaceItemIdentifier(name)
        fixture.controls[name] = box
        root.addSubview(box)
      }
      let field = Kit.field("typed", placeholder: "Type here")
      field.frame = NSRect(x: 37, y: 380, width: 360, height: 26)
      root.addSubview(field)
      let window = Windows.open("main", title: title, content: root)
      window.acceptsMouseMovedEvents = true
    case "overlay":
      // The owner-rule probes (design 0.4.11, CU-14): a borderless window over the rectangle given in global top-left
      // points (x, y, width, height) - another app's control, say. `alpha` (default 0.02), `level` ("floating", the
      // default, or "normal"), `clickThrough` (default false: it takes the clicks, a click-jack), and `afterTrigger`
      // with `delayMs`: hidden until CU Fixture receives the trigger key (Insert), then shown `delayMs` later. Every
      // click it receives is logged like any other input here; `overlay-shown` records when it appeared.
      let number = { (key: String) in CGFloat((Screens.params[key] as? NSNumber)?.doubleValue ?? 0) }
      let screenHeight = NSScreen.screens.first?.frame.height ?? 0
      let size = NSSize(width: max(number("width"), 1), height: max(number("height"), 1))
      let origin = fixture.offscreen ? NSPoint(x: -30000, y: -30000) : NSPoint(x: number("x"), y: screenHeight - number("y") - size.height)
      let window = NSWindow(contentRect: NSRect(origin: origin, size: size), styleMask: [.borderless], backing: .buffered, defer: false)
      window.isOpaque = false
      let alpha = (Screens.params["alpha"] as? NSNumber).map { CGFloat($0.doubleValue) } ?? 0.02
      window.backgroundColor = NSColor(white: 1, alpha: alpha)
      window.ignoresMouseEvents = (Screens.params["clickThrough"] as? Bool) ?? false
      window.level = Screens.string("level") == "normal" ? .normal : .floating
      window.isReleasedWhenClosed = false
      window.title = title
      window.contentView = NSView(frame: NSRect(origin: .zero, size: size))
      window.identifier = NSUserInterfaceItemIdentifier("main")
      fixture.windows["main"] = window
      let show = {
        if !fixture.offscreen { window.orderFrontRegardless() }
        fixture.record("overlay-shown", ["at": Date().timeIntervalSince1970])
      }
      if (Screens.params["afterTrigger"] as? Bool) == true {
        let delay = Double(number("delayMs")) / 1000
        Evidence.triggerObserver = DistributedNotificationCenter.default().addObserver(forName: Evidence.trigger, object: nil, queue: .main) { _ in
          DispatchQueue.main.asyncAfter(deadline: .now() + delay) { show() }
        }
      } else {
        show()
      }
    case "marker-standin":
      // Painted in draw(_:), not as a layer background, so every capture path sees it.
      let root = SolidView(frame: NSRect(x: 0, y: 0, width: 480, height: 320))
      root.color = MARKER_COLOR
      let label = Kit.label(Screens.string("marker"), size: 18, bold: true)
      label.frame = NSRect(x: 24, y: 24, width: 420, height: 60)
      root.addSubview(label)
      _ = Windows.open("main", title: title, content: root)
    case "secure-marker":
      let secret = Kit.field("secret", secure: true)
      secret.stringValue = Screens.string("marker")
      _ = Windows.open("main", title: title, content: Kit.page([Kit.label("Account", size: 20, bold: true), Kit.label("Password"), secret, Kit.button("continue", "Continue")]))
    default:
      return More.open(task, title: title)
    }
    return true
  }

  /// The oracle's evidence step: post an input event into this app's own queue (in-process, no TCC), so the logging
  /// path is proven offscreen. Real OS input is M7's.
  static func act(_ step: [String: Any]) -> Bool {
    if step["post"] == nil { return More.act(step) }
    guard let spec = step["post"] as? [String: Any], let window = Fixture.shared.windows[spec["window"] as? String ?? "main"], let content = window.contentView else { return false }
    let x = spec["x"] as? CGFloat ?? 0
    let y = spec["y"] as? CGFloat ?? 0
    let local = NSPoint(x: x, y: content.isFlipped ? y : content.bounds.height - y)
    let inWindow = content.convert(local, to: nil)
    let types: [String: NSEvent.EventType] = ["mouseDown": .leftMouseDown, "mouseUp": .leftMouseUp, "mouseMoved": .mouseMoved, "rightMouseDown": .rightMouseDown]
    guard let type = types[spec["kind"] as? String ?? ""], let event = NSEvent.mouseEvent(with: type, location: inWindow, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: window.windowNumber, context: nil, eventNumber: 0, clickCount: spec["clickCount"] as? Int ?? 1, pressure: 1) else { return false }
    NSApp.postEvent(event, atStart: false)
    return true
  }
}
