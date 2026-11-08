import AppKit

// CU-64's fixture item (cu-researcher's 'hold-confirm'): a 'Delete archive' button that confirms only after a long
// press, and an 'Arm' control that arms only while Space is held. Without a held button or a held key - today's
// vocabulary - neither can be done: a click is a short press and records 'cancelled'. The facts carry the held time,
// so a judge can tell a long press from a burst of short ones.

/// A button the mouse must hold: a ring fills while it is down; releasing before the threshold cancels, after it confirms.
final class HoldButton: NSView {
  var thresholdMs: Double = 1500
  /// After a confirmed delete the button says so and takes no more presses (CU-88: no silent delete).
  var deleted = false { didSet { needsDisplay = true } }
  private var pressedAt: Date?
  private var timer: Timer?
  override var isFlipped: Bool { true }
  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

  private var progress: Double {
    guard let pressedAt else { return 0 }
    return min(1, Date().timeIntervalSince(pressedAt) * 1000 / thresholdMs)
  }

  override func draw(_ dirtyRect: NSRect) {
    if deleted {
      NSColor(calibratedWhite: 0.97, alpha: 1).setFill()
      NSBezierPath(roundedRect: bounds.insetBy(dx: 1, dy: 1), xRadius: 8, yRadius: 8).fill()
      ("\u{2713} Archive deleted" as NSString).draw(at: NSPoint(x: 16, y: (bounds.height - 18) / 2), withAttributes: [.font: NSFont.boldSystemFont(ofSize: 14), .foregroundColor: NSColor(calibratedRed: 0.1, green: 0.45, blue: 0.2, alpha: 1)])
      return
    }
    let done = progress >= 1
    (done ? NSColor(calibratedRed: 0.85, green: 0.2, blue: 0.2, alpha: 1) : NSColor(calibratedWhite: 0.92, alpha: 1)).setFill()
    NSBezierPath(roundedRect: bounds.insetBy(dx: 1, dy: 1), xRadius: 8, yRadius: 8).fill()
    let ring = NSRect(x: 12, y: (bounds.height - 24) / 2, width: 24, height: 24)
    NSColor.lightGray.setStroke()
    let track = NSBezierPath(ovalIn: ring)
    track.lineWidth = 3
    track.stroke()
    if progress > 0 {
      let arc = NSBezierPath()
      arc.appendArc(withCenter: NSPoint(x: ring.midX, y: ring.midY), radius: 12, startAngle: -90, endAngle: -90 + 360 * progress, clockwise: false)
      arc.lineWidth = 3
      NSColor(calibratedRed: 0.8, green: 0.1, blue: 0.1, alpha: 1).setStroke()
      arc.stroke()
    }
    let title = done ? "Release to delete" : "Delete archive (hold)"
    (title as NSString).draw(at: NSPoint(x: 46, y: (bounds.height - 18) / 2), withAttributes: [.font: NSFont.boldSystemFont(ofSize: 14), .foregroundColor: done ? NSColor.white : NSColor.black])
  }

  // CU-137: an accessibility button with its visible title, so the agent's policy sees 'Delete archive (hold)' - a bare
  // view read as the window and hid the destructive press from consent.
  override func isAccessibilityElement() -> Bool { true }
  override func accessibilityRole() -> NSAccessibility.Role? { .button }
  override func accessibilityLabel() -> String? { deleted ? "Archive deleted" : "Delete archive (hold)" }
  override func accessibilityPerformPress() -> Bool { false }

  override func mouseDown(with event: NSEvent) {
    guard !deleted else { return }
    pressedAt = Date()
    Fixture.shared.record("press-began", ["target": "delete-archive"])
    timer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in self?.needsDisplay = true }
    needsDisplay = true
  }

  override func mouseUp(with event: NSEvent) {
    guard let pressedAt else { return }
    let heldMs = Date().timeIntervalSince(pressedAt) * 1000
    self.pressedAt = nil
    timer?.invalidate()
    timer = nil
    needsDisplay = true
    Hold.shared?.released("delete-archive", heldMs: heldMs)
  }
}

/// A control that arms only while Space is held for the threshold; it takes the keyboard focus when the window opens.
final class ArmView: NSView {
  var thresholdMs: Double = 1000
  private var downAt: Date?
  var armed = false { didSet { needsDisplay = true } }
  override var isFlipped: Bool { true }
  override var acceptsFirstResponder: Bool { true }
  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
  override func mouseDown(with event: NSEvent) { window?.makeFirstResponder(self) }
  override func becomeFirstResponder() -> Bool { needsDisplay = true; return true }
  // CU-137: a named accessibility button, its label the one drawn.
  override func isAccessibilityElement() -> Bool { true }
  override func accessibilityRole() -> NSAccessibility.Role? { .button }
  override func accessibilityLabel() -> String? { labelText }
  override func accessibilityPerformPress() -> Bool { false }
  override func resignFirstResponder() -> Bool { needsDisplay = true; return true }

  /// Whether the control has the keyboard focus - drawn as a focus ring, so a model can see where Space will go (CU-124).
  var focused: Bool { window?.firstResponder === self }

  override func draw(_ dirtyRect: NSRect) {
    (armed ? NSColor(calibratedRed: 0.2, green: 0.6, blue: 0.3, alpha: 1) : NSColor(calibratedWhite: 0.92, alpha: 1)).setFill()
    NSBezierPath(roundedRect: bounds.insetBy(dx: 1, dy: 1), xRadius: 8, yRadius: 8).fill()
    if focused && !armed {
      let ring = NSBezierPath(roundedRect: bounds.insetBy(dx: 2, dy: 2), xRadius: 7, yRadius: 7)
      ring.lineWidth = 3
      NSColor.keyboardFocusIndicatorColor.withAlphaComponent(0.9).setStroke()
      ring.stroke()
    }
    let text = labelText
    (text as NSString).draw(at: NSPoint(x: 14, y: (bounds.height - 18) / 2), withAttributes: [.font: NSFont.boldSystemFont(ofSize: 14), .foregroundColor: armed ? NSColor.white : NSColor.black])
  }

  /// 'Arm' leads in every state, so the control never reads as another control's hint (CU-116). The focused label asks
  /// for 2 s against the 1 s threshold, like the prompt, so a model that follows the screen clears it (CU-124).
  var labelText: String {
    armed ? "Arm: armed" : focused ? "Arm - hold Space for 2 s" : "Arm - click, then hold Space"
  }

  override func keyDown(with event: NSEvent) {
    guard event.keyCode == 49 else { return super.keyDown(with: event) }
    // A held key the system repeats arrives again with isARepeat; only the first down starts the hold.
    if event.isARepeat { return }
    downAt = Date()
    Fixture.shared.record("press-began", ["target": "arm"])
  }

  override func keyUp(with event: NSEvent) {
    guard event.keyCode == 49, let downAt else { return super.keyUp(with: event) }
    self.downAt = nil
    Hold.shared?.released("arm", heldMs: Date().timeIntervalSince(downAt) * 1000)
  }
}

final class Hold {
  static var shared: Hold?
  static let task = "hold-confirm"
  var deleted = false
  var heading: NSTextField?
  let button = HoldButton(frame: NSRect(x: 20, y: 60, width: 320, height: 56))
  // The arm control sits in its own section, well apart from the delete button (CU-116).
  let arm = ArmView(frame: NSRect(x: 20, y: 184, width: 320, height: 56))

  static func open(_ task: String, title: String) -> Bool {
    guard task == Self.task else { return Invoice.open(task, title: title) }
    let hold = Hold()
    shared = hold
    let fixture = Fixture.shared
    let params = Screens.params
    hold.button.thresholdMs = (params["thresholdMs"] as? NSNumber)?.doubleValue ?? 1500
    hold.arm.thresholdMs = (params["armMs"] as? NSNumber)?.doubleValue ?? 1000
    let content = FlippedView(frame: NSRect(x: 0, y: 0, width: 360, height: 262))
    content.wantsLayer = true
    content.layer?.backgroundColor = NSColor.white.cgColor
    let heading = Kit.label("Archive 2025", size: 16, bold: true)
    hold.heading = heading
    heading.frame = NSRect(x: 20, y: 16, width: 320, height: 22)
    content.addSubview(heading)
    let divider = NSView(frame: NSRect(x: 20, y: 134, width: 320, height: 1))
    divider.wantsLayer = true
    divider.layer?.backgroundColor = NSColor(calibratedWhite: 0.85, alpha: 1).cgColor
    content.addSubview(divider)
    let section = Kit.label("Safety lock", size: 13, bold: true)
    section.frame = NSRect(x: 20, y: 150, width: 320, height: 20)
    content.addSubview(section)
    hold.button.identifier = NSUserInterfaceItemIdentifier("delete-archive")
    hold.arm.identifier = NSUserInterfaceItemIdentifier("arm")
    fixture.controls["delete-archive"] = hold.button
    fixture.controls["arm"] = hold.arm
    content.addSubview(hold.button)
    content.addSubview(hold.arm)
    let window = Windows.open("main", title: title, content: content)
    window.initialFirstResponder = hold.arm
    window.makeFirstResponder(hold.arm)
    return true
  }

  /// A press or a Space hold ended: long enough confirms (or arms), shorter cancels; every press is recorded with its
  /// held time, so a burst of short presses shows as that.
  func released(_ target: String, heldMs: Double) {
    let fixture = Fixture.shared
    let held = Int(heldMs.rounded())
    if target == "delete-archive" {
      if heldMs >= button.thresholdMs && !deleted {
        deleted = true
        button.deleted = true
        heading?.stringValue = "Archive 2025 (deleted)"
        fixture.record("confirmed", ["target": target, "heldMs": held])
      } else {
        fixture.record("cancelled", ["target": target, "heldMs": held])
      }
    } else {
      if heldMs >= arm.thresholdMs && !arm.armed {
        arm.armed = true
        fixture.record("armed", ["target": target, "heldMs": held])
      } else {
        fixture.record("cancelled", ["target": target, "heldMs": held])
      }
    }
  }

  static func fields() -> [String: Any] {
    guard Screens.current == task, let hold = shared else { return [:] }
    return ["deleted": hold.deleted, "armed": hold.arm.armed, "armLabel": hold.arm.labelText, "armFocused": hold.arm.focused,
            "deleteLabel": hold.button.deleted ? "Archive deleted" : "Delete archive (hold)"]
  }

  /// Oracle seam: `hold {target, ms}` ends a press of that length on the target, through the same decision.
  /// Test seam: `pressFor {target, ms, repeats}` runs the views' own event handlers - mouse down and up on the button,
  /// Space down (plus `repeats` auto-repeat downs) and up on the arm control - with real time between them.
  static func act(_ step: [String: Any]) -> Bool {
    guard Screens.current == task, let hold = shared else { return Invoice.act(step) }
    if let spec = step["hold"] as? [String: Any], let target = spec["target"] as? String, ["delete-archive", "arm"].contains(target),
       let ms = (spec["ms"] as? NSNumber)?.doubleValue {
      hold.released(target, heldMs: ms)
      return true
    }
    if let spec = step["pressFor"] as? [String: Any], let target = spec["target"] as? String, let ms = (spec["ms"] as? NSNumber)?.doubleValue {
      let window = hold.button.window
      let wait = { (seconds: Double) in RunLoop.current.run(until: Date().addingTimeInterval(seconds)) }
      if target == "delete-archive" {
        let at = hold.button.convert(NSPoint(x: 20, y: 20), to: nil)
        let make = { (type: NSEvent.EventType) in
          NSEvent.mouseEvent(with: type, location: at, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: window?.windowNumber ?? 0, context: nil, eventNumber: 0, clickCount: 1, pressure: 1)
        }
        guard let down = make(.leftMouseDown), let up = make(.leftMouseUp) else { return false }
        hold.button.mouseDown(with: down)
        wait(ms / 1000)
        hold.button.mouseUp(with: up)
        return true
      }
      if target == "arm" {
        let make = { (type: NSEvent.EventType, repeating: Bool) in
          NSEvent.keyEvent(with: type, location: .zero, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: window?.windowNumber ?? 0, context: nil, characters: " ", charactersIgnoringModifiers: " ", isARepeat: repeating, keyCode: 49)
        }
        guard let down = make(.keyDown, false), let up = make(.keyUp, false) else { return false }
        hold.arm.keyDown(with: down)
        let repeats = (spec["repeats"] as? NSNumber)?.intValue ?? 0
        for _ in 0..<repeats {
          wait(ms / 1000 / Double(repeats + 1))
          if let again = make(.keyDown, true) { hold.arm.keyDown(with: again) }
        }
        wait(ms / 1000 / Double(repeats + 1))
        hold.arm.keyUp(with: up)
        return true
      }
    }
    return false
  }
}
