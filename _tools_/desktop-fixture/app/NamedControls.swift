import AppKit

/// 'named-controls' (CU-245, CU-258, CU-261): text entries and buttons named by the harness, for live rows whose cell
/// is decided by a control's name alone - an entry named 'Bank account' or 'Recovery key' (a typed value asks whatever
/// it is), a button titled 'Always Allow' or 'Join Meeting' (its click asks). Parameters: `fields`, up to six entry
/// names, and `buttons`, up to six button titles; each name at most 60 characters. Every entry carries its name as
/// its accessibility label and title element, as a captioned entry does; every button records only 'pressed' with its
/// index, so a declined click shows as no event. The state reports each entry's length, never its text, so a typed
/// secret never comes back through the harness. `areas` (CU-253's cells) adds up to six multi-line text areas named the
/// same way - an AXTextArea named 'iMessage' or 'Type a new message', as a chat app's composer is - reporting only
/// their length and line count. `checkboxes` (CU-323) adds up to six check boxes titled by the harness (AXCheckBox; a
/// toggle records only 'toggled' with its index and new state), and `menuItems` up to six items of an 'Actions' menu in
/// the menu bar (AXMenuItem; choosing one records only 'chosen' with its index). A menu item is a name, or
/// `{name, key, shift, option}` for one bound to Command plus `key` - CU-268's disguised item is a mixed-script name
/// bound to Command-Shift-U. The menu exists only while this screen is open. `placeholders` (CU-349) adds up to six
/// entries labelled ONLY by their placeholder - no caption, no accessibility label or title element - as a native
/// one-time-code or CVV box often is; they report their length only, like the named entries.
/// An entry of this screen: the generic state skips it, so what is typed never leaves the app (lengths only, below).
final class NamedField: NSTextField {}
/// A text area of this screen: like NamedField, only its length and line count leave the app.
final class NamedArea: NSTextView {}

final class NamedControls: NSObject {
  static let task = "named-controls"
  static var shared: NamedControls?
  static let maxControls = 6
  static let maxName = 60

  var fields: [NamedField] = []
  var placeholderFields: [NamedField] = []
  var layoutFields: [NamedField] = []
  var areas: [NamedArea] = []
  var buttons: [NSButton] = []
  var pressed: [Int] = []
  var checkboxes: [NSButton] = []
  var toggled: [Int] = []
  var chosen: [Int] = []
  var menuItem: NSMenuItem?

  /// One item of the Actions menu: its title and an optional Command key equivalent.
  struct MenuEntry { let name: String; let key: String; let modifiers: NSEvent.ModifierFlags }

  static func menuEntries() -> [MenuEntry] {
    let given = Screens.params["menuItems"] as? [Any] ?? []
    let entries = given.compactMap { raw -> MenuEntry? in
      if let name = raw as? String { return MenuEntry(name: name, key: "", modifiers: []) }
      guard let spec = raw as? [String: Any], let name = spec["name"] as? String else { return nil }
      let key = String((spec["key"] as? String ?? "").lowercased().prefix(1))
      var modifiers: NSEvent.ModifierFlags = key.isEmpty ? [] : [.command]
      if spec["shift"] as? Bool == true, !key.isEmpty { modifiers.insert(.shift) }
      if spec["option"] as? Bool == true, !key.isEmpty { modifiers.insert(.option) }
      return MenuEntry(name: name, key: key, modifiers: modifiers)
    }
    return entries.map { MenuEntry(name: String($0.name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(maxName)), key: $0.key, modifiers: $0.modifiers) }
      .filter { !$0.name.isEmpty }.prefix(maxControls).map { $0 }
  }

  static func names(_ key: String) -> [String] {
    let given = (Screens.params[key] as? [Any] ?? []).compactMap { $0 as? String }
    return given.map { String($0.trimmingCharacters(in: .whitespacesAndNewlines).prefix(maxName)) }.filter { !$0.isEmpty }.prefix(maxControls).map { $0 }
  }

  static func open(title: String) -> Bool {
    let screen = NamedControls()
    shared = screen
    screen.build(title: title, fieldNames: names("fields"), placeholderNames: names("placeholders"), layoutSpecs: layoutSpecs(), areaNames: names("areas"), buttonTitles: names("buttons"), checkboxNames: names("checkboxes"))
    screen.installMenu(menuEntries())
    return true
  }

  /// CU-361: `layoutLabels` - up to six entries named only by a static text beside them on screen, never linked to it
  /// (no accessibility label, no title element, no placeholder): a string puts its text to the left on the same row
  /// ('Password  [      ]'); `{name, above: true}` puts it just above the box. Each text at most 60 characters.
  static func layoutSpecs() -> [(name: String, above: Bool)] {
    let raw = Screens.params["layoutLabels"] as? [Any] ?? []
    return raw.prefix(6).compactMap { item in
      if let name = item as? String { return (String(name.prefix(60)), false) }
      if let spec = item as? [String: Any], let name = spec["name"] as? String { return (String(name.prefix(60)), spec["above"] as? Bool == true) }
      return nil
    }
  }

  private func build(title: String, fieldNames: [String], placeholderNames: [String], layoutSpecs: [(name: String, above: Bool)], areaNames: [String], buttonTitles: [String], checkboxNames: [String]) {
    // CU-349's placeholder-only entries sit under the named ones; everything below moves down by their rows.
    let shift = CGFloat(placeholderNames.count * 40 + layoutSpecs.count * 48)
    let height = CGFloat(60 + fieldNames.count * 56 + areaNames.count * 92 + checkboxNames.count * 32 + (buttonTitles.isEmpty ? 0 : 50)) + shift
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
    for (index, name) in placeholderNames.enumerated() {
      let field = NamedField()
      field.font = NSFont.systemFont(ofSize: 14)
      field.frame = NSRect(x: 20, y: CGFloat(48 + fieldNames.count * 56 + index * 40), width: 380, height: 26)
      field.placeholderString = name
      field.identifier = NSUserInterfaceItemIdentifier("placeholder-\(index)")
      Fixture.shared.controls["placeholder-\(index)"] = field
      content.addSubview(field)
      placeholderFields.append(field)
    }
    for (index, spec) in layoutSpecs.enumerated() {
      // CU-361: the text and the box are siblings only by position; nothing links them for Accessibility.
      let rowY = CGFloat(48 + fieldNames.count * 56 + placeholderNames.count * 40 + index * 48)
      let text = Kit.label(spec.name, size: 13, bold: false)
      let field = NamedField()
      field.font = NSFont.systemFont(ofSize: 14)
      if spec.above {
        text.frame = NSRect(x: 20, y: rowY, width: 380, height: 16)
        field.frame = NSRect(x: 20, y: rowY + 18, width: 380, height: 26)
      } else {
        text.frame = NSRect(x: 20, y: rowY + 4, width: 110, height: 18)
        field.frame = NSRect(x: 140, y: rowY, width: 260, height: 26)
      }
      field.identifier = NSUserInterfaceItemIdentifier("layout-\(index)")
      Fixture.shared.controls["layout-\(index)"] = field
      content.addSubview(text)
      content.addSubview(field)
      layoutFields.append(field)
    }
    for (index, name) in areaNames.enumerated() {
      let y = CGFloat(48 + fieldNames.count * 56 + index * 92) + shift
      let caption = Kit.label(name, size: 12, bold: true)
      caption.frame = NSRect(x: 20, y: y, width: 380, height: 16)
      content.addSubview(caption)
      let scroll = NSScrollView(frame: NSRect(x: 20, y: y + 20, width: 380, height: 64))
      scroll.hasVerticalScroller = true
      scroll.borderType = .bezelBorder
      let area = NamedArea(frame: NSRect(x: 0, y: 0, width: 376, height: 64))
      area.isRichText = false
      area.font = NSFont.systemFont(ofSize: 14)
      area.isAutomaticQuoteSubstitutionEnabled = false
      area.isAutomaticTextReplacementEnabled = false
      area.setAccessibilityLabel(name)
      area.setAccessibilityTitleUIElement(caption)
      scroll.documentView = area
      area.identifier = NSUserInterfaceItemIdentifier("area-\(index)")
      Fixture.shared.controls["area-\(index)"] = area
      content.addSubview(scroll)
      areas.append(area)
    }
    for (index, name) in checkboxNames.enumerated() {
      let box = NSButton(checkboxWithTitle: name, target: self, action: #selector(toggle(_:)))
      box.tag = index
      box.sizeToFit()  // the box's frame is its square and title only, so a click at its centre toggles it
      box.frame = NSRect(x: 20, y: CGFloat(52 + fieldNames.count * 56 + areaNames.count * 92 + index * 32) + shift, width: min(box.frame.width, 380), height: 24)
      box.identifier = NSUserInterfaceItemIdentifier("checkbox-\(index)")
      Fixture.shared.controls["checkbox-\(index)"] = box
      content.addSubview(box)
      checkboxes.append(box)
    }
    let buttonsY = CGFloat(56 + fieldNames.count * 56 + areaNames.count * 92 + checkboxNames.count * 32) + shift
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
    if let first = fields.first ?? placeholderFields.first ?? layoutFields.first { window.makeFirstResponder(first) } else if let area = areas.first { window.makeFirstResponder(area) }
  }

  @objc func press(_ sender: NSButton) {
    pressed.append(sender.tag)
    Fixture.shared.record("pressed", ["index": sender.tag])
  }

  /// A toggle records its index and new state only, never the box's title.
  @objc func toggle(_ sender: NSButton) {
    toggled.append(sender.tag)
    Fixture.shared.record("toggled", ["index": sender.tag, "on": sender.state == .on])
  }

  /// Choosing an Actions item records its index only (a refused click never reaches here).
  @objc func choose(_ sender: NSMenuItem) {
    chosen.append(sender.tag)
    Fixture.shared.record("chosen", ["index": sender.tag])
  }

  private func installMenu(_ entries: [MenuEntry]) {
    guard !entries.isEmpty, let main = NSApp.mainMenu else { return }
    let menu = NSMenu(title: "Actions")
    for (index, entry) in entries.enumerated() {
      let item = NSMenuItem(title: entry.name, action: #selector(choose(_:)), keyEquivalent: entry.key)
      item.keyEquivalentModifierMask = entry.modifiers
      item.target = self
      item.tag = index
      menu.addItem(item)
    }
    let top = NSMenuItem()
    top.title = "Actions"
    top.submenu = menu
    main.addItem(top)
    menuItem = top
  }

  /// CU-323: the Actions menu as Accessibility serves it in process - each item's title, role, enabled state and key
  /// equivalent attributes (the values the helper's menu-key read sees across processes); [] when the screen is closed.
  static func accessibilityMenus() -> [[String: Any]] {
    guard let screen = shared, let top = screen.menuItem, NSApp.mainMenu?.items.contains(top) == true,
          let bar = NSApp.accessibilityAttributeValue(NSAccessibility.Attribute.menuBar) as AnyObject? else { return [] }
    func value(_ element: AnyObject, _ name: String) -> Any? { element.accessibilityAttributeValue(NSAccessibility.Attribute(rawValue: name)) }
    func kids(_ element: AnyObject) -> [AnyObject] { (value(element, "AXChildren") as? [AnyObject]) ?? [] }
    return kids(bar).compactMap { top -> [String: Any]? in
      guard value(top, "AXTitle") as? String == "Actions" else { return nil }
      let items = kids(top).flatMap(kids).filter { value($0, "AXRole") as? String == "AXMenuItem" }.map { item -> [String: Any] in
        ["title": value(item, "AXTitle") as? String ?? "", "role": value(item, "AXRole") as? String ?? "",
         "enabled": (value(item, "AXEnabled") as? Bool) ?? NSNull(), "char": (value(item, "AXMenuItemCmdChar") as? String) ?? NSNull(),
         "modifiers": (value(item, "AXMenuItemCmdModifiers") as? NSNumber)?.intValue ?? NSNull()]
      }
      // Where the menu bar shows it, so a live row can open it with a click: global points from the primary display's
      // top-left, as `windows` reports (in process, Accessibility gives AppKit's bottom-left origin; flipped here).
      let origin = (value(top, "AXPosition") as? NSValue)?.pointValue ?? .zero
      let size = (value(top, "AXSize") as? NSValue)?.sizeValue ?? .zero
      let primaryHeight = NSScreen.screens.first?.frame.height ?? 0
      return ["title": "Actions", "items": items, "frame": ["x": origin.x, "y": primaryHeight - origin.y - size.height, "width": size.width, "height": size.height]]
    }
  }

  static func uninstallMenus() {
    guard let screen = shared, let top = screen.menuItem, let main = NSApp.mainMenu, main.items.contains(top) else { return }
    main.removeItem(top)
    screen.menuItem = nil
  }

  static func fields() -> [String: Any] {
    guard Screens.current == task, let screen = shared else { return [:] }
    return ["namedFieldLengths": screen.fields.map { $0.stringValue.count }, "placeholderFieldLengths": screen.placeholderFields.map { $0.stringValue.count }, "layoutFieldLengths": screen.layoutFields.map { $0.stringValue.count },
            "namedAreaLengths": screen.areas.map { $0.string.count },
            "namedAreaLines": screen.areas.map { $0.string.components(separatedBy: "\n").count }, "namedPressed": screen.pressed,
            "namedChecked": screen.checkboxes.map { $0.state == .on ? 1 : 0 }, "namedToggled": screen.toggled, "namedChosen": screen.chosen,
            "namedMenuItems": screen.menuItem?.submenu?.items.count ?? 0]
  }
}
