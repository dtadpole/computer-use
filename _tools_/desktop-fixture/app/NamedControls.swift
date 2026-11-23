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
/// toggle records only 'toggled' with its index and new state), and `menuItems` up to six items of an 'Actions' menu (its title `menuTitle`, CU-382) in
/// the menu bar (AXMenuItem; choosing one records only 'chosen' with its index). A menu item is a name, or
/// `{name, key, shift, option}` for one bound to Command plus `key` - CU-268's disguised item is a mixed-script name
/// bound to Command-Shift-U. The menu exists only while this screen is open. `placeholders` (CU-349) adds up to six
/// entries labelled ONLY by their placeholder - no caption, no accessibility label or title element - as a native
/// one-time-code or CVV box often is; they report their length only, like the named entries. `popUps` (CU-409) adds up
/// to six pop-up buttons `{name, items}`, the first item selected, reporting the selected index only. `sheet: true`
/// (CU-586) attaches a sheet with no title and no message: a plain 'Continue' and a SwiftUI-style 'Delete' whose label is
/// its own AXStaticText child; a press records only 'sheet-pressed' with its index.
/// An entry of this screen: the generic state skips it, so what is typed never leaves the app (lengths only, below).
final class NamedField: NSTextField {}
/// A text area of this screen: like NamedField, only its length and line count leave the app.
final class NamedArea: NSTextView {}
/// CU-586: a SwiftUI-style button - an AXButton view whose label is its own AXStaticText child (a SwiftUI Button with a
/// Text exposes both), named by that label. A click or AXPress calls `onPress`.
final class SheetLabelButton: NSView {
  var onPress: (() -> Void)?
  let label: NSTextField
  init(frame: NSRect, title: String) {
    label = NSTextField(labelWithString: title)
    super.init(frame: frame)
    wantsLayer = true
    layer?.cornerRadius = 6
    layer?.backgroundColor = NSColor.systemRed.cgColor
    label.textColor = .white
    label.alignment = .center
    label.frame = NSRect(x: 0, y: (frame.height - 18) / 2, width: frame.width, height: 18)
    addSubview(label)
  }
  required init?(coder: NSCoder) { nil }
  override func isAccessibilityElement() -> Bool { true }
  override func accessibilityRole() -> NSAccessibility.Role? { .button }
  override func accessibilityLabel() -> String? { label.stringValue }
  override func accessibilityChildren() -> [Any]? { [label] }
  override func accessibilityPerformPress() -> Bool { onPress?(); return true }
  /// A point on the button is the button, as a SwiftUI Button answers a hit test; its label stays a child.
  override func accessibilityHitTest(_ point: NSPoint) -> Any? { self }
  override func mouseDown(with event: NSEvent) { onPress?() }
  override func hitTest(_ point: NSPoint) -> NSView? { frame.contains(point) ? self : nil }
}

final class NamedControls: NSObject {
  static let task = "named-controls"
  static var shared: NamedControls?
  static let maxControls = 6
  static let maxName = 60

  var fields: [NamedField] = []
  var placeholderFields: [NamedField] = []
  var areas: [NamedArea] = []
  var buttons: [NSButton] = []
  var pressed: [Int] = []
  var checkboxes: [NSButton] = []
  var popUps: [NSPopUpButton] = []
  var sheetWindow: NSWindow?
  var sheetPressed: [Int] = []
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

  /// CU-409: up to six pop-up buttons, each `{name, items}` (an accessibility label and at most 8 item titles; the first
  /// is selected) - with `buttons` and `fields`, a native order panel: an asset pop-up, an Amount entry and a bare Sell,
  /// all the window's own children, as AppKit lays out a panel of plain views.
  struct PopUpSpec { let name: String; let items: [String] }

  static func popUpSpecs() -> [PopUpSpec] {
    let given = Screens.params["popUps"] as? [Any] ?? []
    return given.compactMap { raw -> PopUpSpec? in
      guard let spec = raw as? [String: Any], let name = spec["name"] as? String else { return nil }
      let items = (spec["items"] as? [Any] ?? []).compactMap { $0 as? String }.map { String($0.prefix(maxName)) }.filter { !$0.isEmpty }.prefix(8).map { $0 }
      let trimmed = String(name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(maxName))
      return trimmed.isEmpty || items.isEmpty ? nil : PopUpSpec(name: trimmed, items: items)
    }.prefix(maxControls).map { $0 }
  }

  static func open(title: String) -> Bool {
    let screen = NamedControls()
    shared = screen
    screen.build(title: title, fieldNames: names("fields"), placeholderNames: names("placeholders"), areaNames: names("areas"), buttonTitles: names("buttons"), checkboxNames: names("checkboxes"), popUpSpecs: popUpSpecs())
    screen.installMenu(menuEntries())
    return true
  }

  private func build(title: String, fieldNames: [String], placeholderNames: [String], areaNames: [String], buttonTitles: [String], checkboxNames: [String], popUpSpecs: [PopUpSpec] = []) {
    // CU-349's placeholder-only entries sit under the named ones; everything below moves down by their rows.
    let shift = CGFloat(placeholderNames.count * 40)
    let height = CGFloat(60 + fieldNames.count * 56 + areaNames.count * 92 + checkboxNames.count * 32 + popUpSpecs.count * 36 + (buttonTitles.isEmpty ? 0 : 50)) + shift
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
    for (index, spec) in popUpSpecs.enumerated() {
      let popUp = NSPopUpButton(frame: NSRect(x: 20, y: CGFloat(52 + fieldNames.count * 56 + areaNames.count * 92 + checkboxNames.count * 32 + index * 36) + shift, width: 200, height: 28), pullsDown: false)
      popUp.addItems(withTitles: spec.items)
      popUp.selectItem(at: 0)
      popUp.setAccessibilityLabel(spec.name)
      popUp.identifier = NSUserInterfaceItemIdentifier("popup-\(index)")
      Fixture.shared.controls["popup-\(index)"] = popUp
      content.addSubview(popUp)
      popUps.append(popUp)
    }
    let buttonsY = CGFloat(56 + fieldNames.count * 56 + areaNames.count * 92 + checkboxNames.count * 32 + popUpSpecs.count * 36) + shift
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
    if let first = fields.first ?? placeholderFields.first { window.makeFirstResponder(first) } else if let area = areas.first { window.makeFirstResponder(area) }
    if Screens.params["sheet"] as? Bool == true { attachSheet(to: window) }
  }

  @objc func press(_ sender: NSButton) {
    pressed.append(sender.tag)
    Fixture.shared.record("pressed", ["index": sender.tag])
  }

  /// CU-586 (cu-verifier 13:43Z): `sheet: true` attaches a sheet with NO title and NO message text to the window - a plain
  /// NSButton 'Continue' (index 0) and a SwiftUI-style 'Delete' (index 1): an AXButton view whose label is an AXStaticText
  /// child, as a SwiftUI button exposes it. Nothing else is on the sheet, so the only static text under it is that
  /// button's own label. A press records only 'sheet-pressed' with its index; the sheet stays open.
  private func attachSheet(to window: NSWindow) {
    let body = NSView(frame: NSRect(x: 0, y: 0, width: 280, height: 64))
    let plain = NSButton(title: "Continue", target: self, action: #selector(pressSheet(_:)))
    plain.bezelStyle = .rounded
    plain.tag = 0
    plain.frame = NSRect(x: 20, y: 17, width: 110, height: 30)
    let labelled = SheetLabelButton(frame: NSRect(x: 150, y: 18, width: 110, height: 28), title: "Delete")
    labelled.onPress = { [weak self] in self?.recordSheetPress(1) }
    body.addSubview(plain)
    body.addSubview(labelled)
    let sheet = NSWindow(contentRect: body.frame, styleMask: [.titled], backing: .buffered, defer: false)
    sheet.title = ""
    sheet.contentView = body
    Fixture.shared.controls["sheet-continue"] = plain
    Fixture.shared.controls["sheet-delete"] = labelled
    sheetWindow = sheet
    window.beginSheet(sheet) { _ in }
  }

  @objc func pressSheet(_ sender: NSButton) { recordSheetPress(sender.tag) }

  private func recordSheetPress(_ index: Int) {
    sheetPressed.append(index)
    Fixture.shared.record("sheet-pressed", ["index": index])
  }

  /// The sheet's static texts as Accessibility serves them in process, split by whether they sit inside a button - what
  /// the fixture test pins (none outside; only 'Delete' inside). [:] when no sheet is open.
  static func sheetTexts() -> [String: Any] {
    guard let screen = shared, let sheet = screen.sheetWindow, let body = sheet.contentView else { return [:] }
    var outside: [String] = [], inside: [String] = []
    func walk(_ element: Any, inButton: Bool) {
      let node = element as AnyObject
      let role = node.accessibilityRole?() ?? nil
      if role == .staticText {
        // A label's static text is served by its cell (NSTextFieldCell) in process.
        let text = (node as? NSTextField)?.stringValue ?? (node as? NSCell)?.stringValue ?? ""
        if inButton { inside.append(text) } else { outside.append(text) }
      }
      for child in (node.accessibilityChildren?() ?? nil) ?? [] { walk(child, inButton: inButton || role == .button) }
    }
    let kids = body.accessibilityChildren() ?? []
    for child in kids { walk(child, inButton: false) }
    // The sheet's own controls: role and name of each child, as AX serves them (both buttons, 'Continue' then 'Delete').
    let controls = kids.map { child -> [String] in
      let node = child as AnyObject
      // An NSButton is served by its cell in process; the SwiftUI-style view names itself.
      let names: [String?] = [(node as? NSView)?.accessibilityLabel(), (node as? NSButton)?.title, (node as? NSButtonCell)?.title]
      return [(node.accessibilityRole?() ?? nil)?.rawValue ?? "", names.compactMap { $0 }.first { !$0.isEmpty } ?? ""]
    }
    return ["role": sheet.accessibilityRole()?.rawValue ?? "", "outside": outside, "inside": inside, "controls": controls]
  }

  /// Ends the sheet before the fixture closes its windows (reset).
  static func closeSheet() {
    guard let screen = shared, let sheet = screen.sheetWindow else { return }
    sheet.sheetParent?.endSheet(sheet)
    screen.sheetWindow = nil
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

  /// CU-382 (cu-coordinator 08:59Z): the menu's title, `menuTitle` (default 'Actions', at most 40 characters) - 'Quick
  /// Actions' makes it a stand-in for Finder's Quick Actions submenu, which the helper marks by its holder's title in any
  /// app (QuickActionsMenu.isQuickActions), so a live row needs no Finder and no owner workflow.
  static func menuTitle() -> String {
    let given = (Screens.params["menuTitle"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return given.isEmpty ? "Actions" : String(given.prefix(40))
  }

  private func installMenu(_ entries: [MenuEntry]) {
    guard !entries.isEmpty, let main = NSApp.mainMenu else { return }
    let title = Self.menuTitle()
    let menu = NSMenu(title: title)
    for (index, entry) in entries.enumerated() {
      let item = NSMenuItem(title: entry.name, action: #selector(choose(_:)), keyEquivalent: entry.key)
      item.keyEquivalentModifierMask = entry.modifiers
      item.target = self
      item.tag = index
      menu.addItem(item)
    }
    let top = NSMenuItem()
    top.title = title
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
      let title = value(top, "AXTitle") as? String
      guard let title, title == screen.menuItem?.title else { return nil }
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
      return ["title": title, "items": items, "frame": ["x": origin.x, "y": primaryHeight - origin.y - size.height, "width": size.width, "height": size.height]]
    }
  }

  static func uninstallMenus() {
    guard let screen = shared, let top = screen.menuItem, let main = NSApp.mainMenu, main.items.contains(top) else { return }
    main.removeItem(top)
    screen.menuItem = nil
  }

  static func fields() -> [String: Any] {
    guard Screens.current == task, let screen = shared else { return [:] }
    return ["namedFieldLengths": screen.fields.map { $0.stringValue.count }, "placeholderFieldLengths": screen.placeholderFields.map { $0.stringValue.count },
            "namedAreaLengths": screen.areas.map { $0.string.count },
            "namedAreaLines": screen.areas.map { $0.string.components(separatedBy: "\n").count }, "namedPressed": screen.pressed,
            "namedChecked": screen.checkboxes.map { $0.state == .on ? 1 : 0 }, "namedToggled": screen.toggled, "namedChosen": screen.chosen,
            "namedMenuItems": screen.menuItem?.submenu?.items.count ?? 0,
            "namedPopUpSelected": screen.popUps.map { $0.indexOfSelectedItem },
            "namedSheetPressed": screen.sheetPressed, "namedSheetTexts": sheetTexts()]
  }
}
