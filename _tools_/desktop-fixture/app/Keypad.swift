import AppKit

// S11 keypad (CU-71): small keys at a window origin the seed moves, so a click is right only when it is computed from
// the current frame - a pixel reused from an earlier screenshot or a coordinate in points instead of frame pixels lands
// on another key, and the facts name which. The code to enter comes from the task text, never from this window.

enum Keypad {
  static let keySize: CGFloat = 14
  static let gap: CGFloat = 4
  /// Row by row, as on a phone: 1 2 3 / 4 5 6 / 7 8 9 / clear 0 ok.
  static let layout: [[String]] = [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"], ["clear", "0", "ok"]]

  /// The window's content top-left in global points (y down from the primary display's top), the same space
  /// `windows` reports; nil when the params name no origin.
  static func origin(_ params: [String: Any]) -> CGPoint? {
    guard let origin = params["origin"] as? [String: Any], let x = (origin["x"] as? NSNumber)?.doubleValue, let y = (origin["y"] as? NSNumber)?.doubleValue else { return nil }
    return CGPoint(x: x, y: y)
  }

  static func open(_ task: String, title: String) -> Bool {
    guard task == "keypad-code" else { return Grid.open(task, title: title) }
    let fixture = Fixture.shared
    let content = FlippedView(frame: NSRect(x: 0, y: 0, width: 220, height: 170))
    content.wantsLayer = true
    content.layer?.backgroundColor = NSColor.white.cgColor
    let heading = Kit.label("Door code", size: 16, bold: true)
    heading.frame = NSRect(x: 16, y: 12, width: 188, height: 22)
    content.addSubview(heading)
    let shown = NSTextField(labelWithString: "")
    shown.font = NSFont.monospacedSystemFont(ofSize: 13, weight: .regular)
    shown.textColor = .black
    shown.frame = NSRect(x: 16, y: 40, width: 188, height: 18)
    shown.identifier = NSUserInterfaceItemIdentifier("entered")
    fixture.controls["entered"] = shown
    content.addSubview(shown)
    for (row, keys) in layout.enumerated() {
      for (column, key) in keys.enumerated() {
        let name = Int(key) != nil ? "key-\(key)" : key
        let button = NSButton(title: key == "clear" ? "C" : key == "ok" ? "OK" : key, target: fixture, action: #selector(Fixture.pressed(_:)))
        button.identifier = NSUserInterfaceItemIdentifier(name)
        button.isBordered = true
        button.bezelStyle = .smallSquare
        button.font = NSFont.systemFont(ofSize: 9)
        button.frame = NSRect(x: 16 + CGFloat(column) * (keySize + gap), y: 70 + CGFloat(row) * (keySize + gap), width: keySize, height: keySize)
        fixture.controls[name] = button
        content.addSubview(button)
      }
    }
    let window = Windows.open("main", title: title, content: content)
    if !fixture.offscreen, let origin = origin(Screens.params), let screen = NSScreen.screens.first {
      // Content top-left at the global point; the whole window must stay on the main display.
      let contentRect = NSRect(x: origin.x, y: screen.frame.height - origin.y - content.frame.height, width: content.frame.width, height: content.frame.height)
      let frame = window.frameRect(forContentRect: contentRect)
      if screen.frame.contains(frame) { window.setFrame(frame, display: true); fixture.placements["main"] = Placement.check(window) }
      else { fixture.record("origin-refused", ["x": origin.x, "y": origin.y]) }
    }
    return true
  }

  static func press(_ name: String) -> Bool {
    guard Screens.current == "keypad-code" else { return Grid.press(name) }
    let fixture = Fixture.shared
    guard let shown = fixture.controls["entered"] as? NSTextField else { return true }
    let length = (Screens.params["length"] as? NSNumber)?.intValue ?? 4
    if name.hasPrefix("key-") {
      if shown.stringValue.count < length { shown.stringValue += String(name.dropFirst("key-".count)) }
    } else if name == "clear" {
      shown.stringValue = ""
      fixture.record("cleared")
    } else if name == "ok" {
      fixture.record("entered", ["code": shown.stringValue])
    } else {
      return false
    }
    return true
  }
}
