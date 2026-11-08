import AppKit

/// 'named-controls' (CU-245, CU-258, CU-261): text entries and buttons named by the harness, for live rows whose cell
/// is decided by a control's name alone - an entry named 'Bank account' or 'Recovery key' (a typed value asks whatever
/// it is), a button titled 'Always Allow' or 'Join Meeting' (its click asks). Parameters: `fields`, up to six entry
/// names, and `buttons`, up to six button titles; each name at most 60 characters. Every entry carries its name as
/// its accessibility label and title element, as a captioned entry does; every button records only 'pressed' with its
/// index, so a declined click shows as no event. The state reports each entry's length, never its text, so a typed
/// secret never comes back through the harness.
/// An entry of this screen: the generic state skips it, so what is typed never leaves the app (lengths only, below).
final class NamedField: NSTextField {}

final class NamedControls: NSObject {
  static let task = "named-controls"
  static var shared: NamedControls?
  static let maxControls = 6
  static let maxName = 60

  var fields: [NamedField] = []
  var buttons: [NSButton] = []
  var pressed: [Int] = []

  static func names(_ key: String) -> [String] {
    let given = (Screens.params[key] as? [Any] ?? []).compactMap { $0 as? String }
    return given.map { String($0.trimmingCharacters(in: .whitespacesAndNewlines).prefix(maxName)) }.filter { !$0.isEmpty }.prefix(maxControls).map { $0 }
  }

  static func open(title: String) -> Bool {
    let screen = NamedControls()
    shared = screen
    screen.build(title: title, fieldNames: names("fields"), buttonTitles: names("buttons"))
    return true
  }

  private func build(title: String, fieldNames: [String], buttonTitles: [String]) {
    let height = CGFloat(60 + fieldNames.count * 56 + (buttonTitles.isEmpty ? 0 : 50))
    let content = FlippedView(frame: NSRect(x: 0, y: 0, width: 420, height: max(height, 120)))
    content.wantsLayer = true
    content.layer?.backgroundColor = NSColor.white.cgColor
    let heading = Kit.label("Account details", size: 16, bold: true)
    heading.frame = NSRect(x: 20, y: 16, width: 380, height: 22)
    content.addSubview(heading)
    for (index, name) in fieldNames.enumerated() {
      let y = CGFloat(48 + index * 56)
      let caption = Kit.label(name, size: 12, bold: true)
      caption.frame = NSRect(x: 20, y: y, width: 380, height: 16)
      content.addSubview(caption)
      let field = NamedField()
      field.font = NSFont.systemFont(ofSize: 14)
      field.frame = NSRect(x: 20, y: y + 20, width: 380, height: 26)
      field.identifier = NSUserInterfaceItemIdentifier("field-\(index)")
      field.setAccessibilityLabel(name)
      field.cell?.setAccessibilityLabel(name)
      field.setAccessibilityTitleUIElement(caption)
      Fixture.shared.controls["field-\(index)"] = field
      content.addSubview(field)
      fields.append(field)
    }
    let buttonsY = CGFloat(56 + fieldNames.count * 56)
    var x: CGFloat = 20
    for (index, name) in buttonTitles.enumerated() {
      let button = NSButton(title: name, target: self, action: #selector(press(_:)))
      button.bezelStyle = .rounded
      button.tag = index
      button.sizeToFit()
      button.frame = NSRect(x: x, y: buttonsY, width: max(button.frame.width + 12, 80), height: 30)
      x += button.frame.width + 10
      button.identifier = NSUserInterfaceItemIdentifier("button-\(index)")
      Fixture.shared.controls["button-\(index)"] = button
      content.addSubview(button)
      buttons.append(button)
    }
    let window = Windows.open("main", title: title, content: content)
    if let first = fields.first { window.makeFirstResponder(first) }
  }

  @objc func press(_ sender: NSButton) {
    pressed.append(sender.tag)
    Fixture.shared.record("pressed", ["index": sender.tag])
  }

  static func fields() -> [String: Any] {
    guard Screens.current == task, let screen = shared else { return [:] }
    return ["namedFieldLengths": screen.fields.map { $0.stringValue.count }, "namedPressed": screen.pressed]
  }
}
