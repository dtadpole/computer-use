import AppKit

// 'menu-compose' (CU-238, CU-232's live rows): a mail-style compose window whose consequential actions sit on menu
// key equivalents, as Mail's Send sits on Shift-Command-D - so a chord's verdict must come from the item it fires, not
// only from its keys. Nothing leaves the fixture: each action only records that it fired.
//
// The menus exist only while this screen is open:
//   - Message > Send on Shift-Command-D - the plain case (cu-verifier's acceptance 1a-c);
//   - Message > Mark as Read (disabled, benign) and later Message > Send Now (enabled, consequential), both on
//     Option-Command-J - the duplicate case (acceptance 2d). Not Option-Command-D: that is macOS's default 'Turn Dock
//     hiding on/off' hotkey, which a real keystroke would reach instead, changing an owner setting (cu-researcher). Measured in process on 8 Nov: Accessibility reports no
//     key character for the later duplicate (Send Now reads modifiers 2, char none), and a synthetic chord is taken
//     by the disabled first item and fires nothing. What a real keystroke fires is the live row's question;
//   - Message > Delete on a plain Backspace, enabled only while the Outbox list has the focus - Mail's case: with the
//     focus in the draft body Backspace edits the text, on the list it deletes the selected row (acceptance 2f);
//   - CU Fixture > Services, a stand-in for the Services menu (CU-250's live row): 'Weekly Report Uploader', named like
//     an owner-installed service rather than a default one, and AppKit's marker 'Services Settings…'. It is the
//     fixture's own submenu, not NSApp.servicesMenu, so no real service is listed or can run; each item only records.
//   - Later > Send Later on Option-Command-L (not Shift-Command-L, the default 'Search With Google' service shortcut)
//     in a menu filled lazily by its delegate: empty until AppKit asks it to
//     update, while the delegate answers the chord itself (menuHasKeyEquivalent) without filling it, as apps with lazy
//     menus do. Measured in process on 8 Nov: an Accessibility read of the menu's children fills it; whether the
//     helper's read across processes does too is what the live row measures (acceptance 2e).
final class MenuCompose: NSObject, NSMenuDelegate, NSMenuItemValidation, NSTableViewDataSource, NSTableViewDelegate {
  static var shared: MenuCompose?
  static let task = "menu-compose"

  let subject = NSTextField(string: "")
  let body = NSTextView(frame: NSRect(x: 0, y: 0, width: 380, height: 110))
  let bodyScroll = NSScrollView(frame: NSRect(x: 20, y: 92, width: 380, height: 114))
  let outbox = NSTableView()
  let outboxScroll = NSScrollView(frame: NSRect(x: 20, y: 244, width: 380, height: 78))
  let status = NSTextField(labelWithString: "")
  var outboxNames = ["Weekly summary", "Room booking", "Follow-up notes"]
  private var installed: [NSMenuItem] = []
  private var servicesHolder: NSMenuItem?
  private(set) var sent: [String] = []
  private(set) var deleted: [String] = []
  /// Whether AppKit asked the lazy menu to fill itself, and why the first time (`update`: it was about to open, or a key
  /// equivalent was being matched).
  private(set) var lazyFilled = false
  private let lazyMenu = NSMenu(title: "Later")

  /// The declared chords, for the tests: title, menu, key, modifiers, enabled by design.
  static let chords: [(title: String, menu: String, key: String, modifiers: NSEvent.ModifierFlags)] = [
    ("Send", "Message", "d", [.command, .shift]),
    ("Mark as Read", "Message", "j", [.command, .option]),
    ("Send Now", "Message", "j", [.command, .option]),
    ("Delete", "Message", String(Character(UnicodeScalar(NSBackspaceCharacter)!)), []),
    ("Send Later", "Later", "l", [.command, .option]),
  ]

  static func open(title: String) -> Bool {
    let screen = MenuCompose()
    shared = screen
    screen.build(title: title)
    return true
  }

  private func build(title: String) {
    let fixture = Fixture.shared
    let content = FlippedView(frame: NSRect(x: 0, y: 0, width: 420, height: 370))
    content.wantsLayer = true
    content.layer?.backgroundColor = NSColor.white.cgColor
    let heading = Kit.label("New message", size: 16, bold: true)
    heading.frame = NSRect(x: 20, y: 16, width: 380, height: 22)
    content.addSubview(heading)
    subject.placeholderString = "Subject"
    subject.stringValue = Screens.params["subject"] as? String ?? "Quarterly notes"
    subject.frame = NSRect(x: 20, y: 52, width: 380, height: 26)
    subject.identifier = NSUserInterfaceItemIdentifier("subject")
    subject.setAccessibilityLabel("Subject")
    fixture.controls["subject"] = subject
    content.addSubview(subject)
    body.isRichText = false
    body.font = NSFont.systemFont(ofSize: 13)
    body.string = Screens.params["draft"] as? String ?? "Draft: the numbers are in the shared sheet."
    body.setAccessibilityLabel("Message body")
    body.identifier = NSUserInterfaceItemIdentifier("body")
    bodyScroll.documentView = body
    bodyScroll.borderType = .bezelBorder
    bodyScroll.hasVerticalScroller = true
    fixture.controls["body"] = body
    content.addSubview(bodyScroll)
    let outboxLabel = Kit.label("Outbox", size: 13, bold: true)
    outboxLabel.frame = NSRect(x: 20, y: 220, width: 380, height: 18)
    content.addSubview(outboxLabel)
    let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("outbox"))
    column.title = "Outbox"
    column.width = 360
    outbox.addTableColumn(column)
    outbox.rowHeight = 22
    outbox.dataSource = self
    outbox.delegate = self
    outbox.setAccessibilityLabel("Outbox")
    outbox.identifier = NSUserInterfaceItemIdentifier("outbox")
    outboxScroll.documentView = outbox
    outboxScroll.borderType = .bezelBorder
    outboxScroll.hasVerticalScroller = true
    fixture.controls["outbox"] = outbox
    content.addSubview(outboxScroll)
    status.font = NSFont.systemFont(ofSize: 12)
    status.textColor = .darkGray
    status.frame = NSRect(x: 20, y: 334, width: 380, height: 18)
    content.addSubview(status)
    installMenus()
    let window = Windows.open("main", title: title, content: content)
    // The draft body has the focus, as when composing; `focus: 'outbox'` starts on the list with its first row selected.
    if Screens.params["focus"] as? String == "outbox" {
      outbox.selectRowIndexes(IndexSet(integer: 0), byExtendingSelection: false)
      window.makeFirstResponder(outbox)
    } else {
      window.makeFirstResponder(body)
    }
  }

  func numberOfRows(in tableView: NSTableView) -> Int { outboxNames.count }

  func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
    let label = NSTextField(labelWithString: outboxNames[row])
    label.font = NSFont.systemFont(ofSize: 13)
    return label
  }

  // MARK: Menus

  private func item(_ title: String, _ key: String, _ modifiers: NSEvent.ModifierFlags, _ action: Selector) -> NSMenuItem {
    let entry = NSMenuItem(title: title, action: action, keyEquivalent: key)
    entry.keyEquivalentModifierMask = modifiers
    entry.target = self
    return entry
  }

  private func installMenus() {
    guard let main = NSApp.mainMenu else { return }
    let message = NSMenu(title: "Message")
    message.addItem(item("Send", "d", [.command, .shift], #selector(sendChosen(_:))))
    let markRead = item("Mark as Read", "j", [.command, .option], #selector(markRead(_:)))
    // Disabled from the start, so Accessibility reports it disabled before any menu update validates it.
    markRead.isEnabled = false
    message.addItem(markRead)
    message.addItem(NSMenuItem.separator())
    message.addItem(item("Send Now", "j", [.command, .option], #selector(sendChosen(_:))))
    message.addItem(item("Delete", String(Character(UnicodeScalar(NSBackspaceCharacter)!)), [], #selector(deleteChosen(_:))))
    let messageItem = NSMenuItem()
    messageItem.submenu = message
    lazyMenu.delegate = self
    let lazyItem = NSMenuItem()
    lazyItem.submenu = lazyMenu
    for top in [messageItem, lazyItem] {
      main.addItem(top)
      installed.append(top)
    }
    // The stand-in Services submenu goes into the app menu, where AppKit puts the real one.
    if let appMenu = main.items.first?.submenu {
      let services = NSMenu(title: "Services")
      services.addItem(item("Weekly Report Uploader", "", [], #selector(serviceChosen(_:))))
      services.addItem(NSMenuItem.separator())
      services.addItem(item("Services Settings\u{2026}", "", [], #selector(serviceChosen(_:))))
      let holder = NSMenuItem(title: "Services", action: nil, keyEquivalent: "")
      holder.submenu = services
      appMenu.addItem(holder)
      servicesHolder = holder
    }
  }

  /// A stand-in service ran: only the fact is recorded (a refused click never reaches here).
  @objc func serviceChosen(_ sender: NSMenuItem) {
    Fixture.shared.record("service-ran", ["item": sender.title])
    status.stringValue = "Service: \(sender.title) (nothing left the fixture)"
  }

  static func uninstallMenus() {
    guard let screen = shared, let main = NSApp.mainMenu else { return }
    for top in screen.installed where main.items.contains(top) { main.removeItem(top) }
    screen.installed = []
    if let holder = screen.servicesHolder, let appMenu = holder.menu { appMenu.removeItem(holder) }
    screen.servicesHolder = nil
  }

  /// The lazy menu fills itself only when AppKit asks - before it opens, or while a key equivalent is matched.
  func menuNeedsUpdate(_ menu: NSMenu) {
    guard menu === lazyMenu, menu.items.isEmpty else { return }
    lazyFilled = true
    Fixture.shared.record("lazy-menu-filled", [:])
    menu.addItem(item("Send Later", "l", [.command, .option], #selector(sendLater(_:))))
  }

  /// The lazy menu answers its chord without filling itself, as apps whose menus fill only on open do.
  func menuHasKeyEquivalent(_ menu: NSMenu, for event: NSEvent, target: AutoreleasingUnsafeMutablePointer<AnyObject?>, action: UnsafeMutablePointer<Selector?>) -> Bool {
    guard menu === lazyMenu, menu.items.isEmpty, event.charactersIgnoringModifiers?.lowercased() == "l",
          event.modifierFlags.intersection(.deviceIndependentFlagsMask).intersection([.command, .shift, .option, .control]) == [.command, .option] else { return false }
    target.pointee = self
    action.pointee = #selector(sendLater(_:))
    return true
  }

  @objc func sendLater(_ sender: Any?) {
    sent.append("Send Later")
    Fixture.shared.record("sent", ["item": "Send Later"])
    status.stringValue = "Send Later (nothing left the fixture)"
  }

  /// Mark as Read is always disabled (the benign first match); Delete only while the Outbox list holds the focus.
  func validateMenuItem(_ menuItem: NSMenuItem) -> Bool {
    switch menuItem.title {
    case "Mark as Read": return false
    case "Delete": return outbox.window?.firstResponder === outbox && outbox.selectedRow >= 0
    default: return true
    }
  }

  @objc func sendChosen(_ sender: NSMenuItem) {
    sent.append(sender.title)
    Fixture.shared.record("sent", ["item": sender.title])
    status.stringValue = "\(sender.title) (nothing left the fixture)"
  }

  @objc func markRead(_ sender: NSMenuItem) { Fixture.shared.record("marked-read", [:]) }

  @objc func deleteChosen(_ sender: NSMenuItem) {
    let row = outbox.selectedRow
    guard outboxNames.indices.contains(row) else { return }
    let name = outboxNames.remove(at: row)
    deleted.append(name)
    Fixture.shared.record("deleted", ["name": name])
    outbox.reloadData()
    status.stringValue = "Deleted: \(name)"
  }

  /// The in-process Accessibility view of this screen's menus: [{title, items: [{title, enabled, char, modifiers,
  /// virtualKey}]}] - no value of any control.
  static func accessibilityMenus() -> [[String: Any]] {
    guard let screen = shared, let bar = NSApp.accessibilityAttributeValue(NSAccessibility.Attribute.menuBar) as AnyObject? else { return [] }
    let titles = Set(screen.installed.compactMap { $0.submenu?.title })
    let servicesTitle = screen.servicesHolder?.title
    func value(_ element: AnyObject, _ name: String) -> Any? { element.accessibilityAttributeValue(NSAccessibility.Attribute(rawValue: name)) }
    func kids(_ element: AnyObject) -> [AnyObject] { (value(element, "AXChildren") as? [AnyObject]) ?? [] }
    return kids(bar).compactMap { top -> [String: Any]? in
      guard let title = value(top, "AXTitle") as? String, titles.contains(title) else { return nil }
      let items = kids(top).flatMap(kids).filter { value($0, "AXRole") as? String == "AXMenuItem" && !((value($0, "AXTitle") as? String) ?? "").isEmpty }.map { item -> [String: Any] in
        let char = value(item, "AXMenuItemCmdChar") as? String
        let printable = char.flatMap { $0.unicodeScalars.allSatisfy { $0.value >= 0x21 && $0.value != 0x7F && $0.value < 0xF700 } ? $0 : nil }
        return ["title": value(item, "AXTitle") as? String ?? "", "enabled": (value(item, "AXEnabled") as? Bool) ?? NSNull(),
                "char": printable ?? NSNull(), "modifiers": (value(item, "AXMenuItemCmdModifiers") as? NSNumber)?.intValue ?? NSNull(),
                "virtualKey": (value(item, "AXMenuItemCmdVirtualKey") as? NSNumber)?.intValue ?? NSNull()]
      }
      return ["title": title, "items": items]
    } + servicesAX(bar: bar, holderTitle: servicesTitle, value: value, kids: kids)
  }

  /// The stand-in Services submenu as Accessibility shows it: [{title: 'Services', items: [{title}]}] - found under the
  /// app menu by its holder's title.
  private static func servicesAX(bar: AnyObject, holderTitle: String?, value: (AnyObject, String) -> Any?, kids: (AnyObject) -> [AnyObject]) -> [[String: Any]] {
    guard let holderTitle else { return [] }
    for top in kids(bar) {
      for menu in kids(top) {
        for item in kids(menu) where value(item, "AXRole") as? String == "AXMenuItem" && value(item, "AXTitle") as? String == holderTitle && !kids(item).isEmpty {
          let titles = kids(item).flatMap(kids).compactMap { value($0, "AXTitle") as? String }.filter { !$0.isEmpty }
          return [["title": holderTitle, "items": titles.map { ["title": $0] }]]
        }
      }
    }
    return []
  }

  // MARK: State and seams

  static func fields() -> [String: Any] {
    guard Screens.current == task, let screen = shared else { return [:] }
    return ["composeSent": screen.sent, "composeDeleted": screen.deleted, "outbox": screen.outboxNames, "lazyMenuFilled": screen.lazyFilled,
            "bodyText": screen.body.string,
            "composeFocus": screen.body.window?.firstResponder === screen.outbox ? "outbox" : (screen.body.window?.firstResponder === screen.body ? "body" : "other"),
            "composeChords": chords.map { chord -> [String: Any] in
              var mods: [String] = []
              if chord.modifiers.contains(.command) { mods.append("cmd") }
              if chord.modifiers.contains(.option) { mods.append("alt") }
              if chord.modifiers.contains(.shift) { mods.append("shift") }
              return ["title": chord.title, "menu": chord.menu, "key": chord.key == String(Character(UnicodeScalar(NSBackspaceCharacter)!)) ? "backspace" : chord.key, "modifiers": mods]
            }]
  }

  /// Seams, in-process models only (which item a real keystroke reaches is the live row's question):
  /// `composeFocus 'outbox' | 'body'` moves the focus (the list's first row selected); `composeKey {key, modifiers}`
  /// offers a key down to the main menu's key equivalents, as AppKit does for a chord - key 'd', 'j', 'l' or 'backspace'.
  static func act(_ step: [String: Any]) -> Bool {
    guard Screens.current == task, let screen = shared, let window = screen.body.window else { return false }
    if let target = step["composeFocus"] as? String {
      if target == "outbox" {
        if screen.outbox.selectedRow < 0, !screen.outboxNames.isEmpty { screen.outbox.selectRowIndexes(IndexSet(integer: 0), byExtendingSelection: false) }
        window.makeFirstResponder(screen.outbox)
      } else {
        window.makeFirstResponder(screen.body)
      }
      return true
    }
    // `composeService 'Weekly Report Uploader'`: what a click on that stand-in service runs, in process.
    if let title = step["composeService"] as? String {
      guard let entry = screen.servicesHolder?.submenu?.items.first(where: { $0.title == title }) else { return false }
      screen.serviceChosen(entry)
      return true
    }
    guard let spec = step["composeKey"] as? [String: Any], let name = spec["key"] as? String else { return false }
    var flags: NSEvent.ModifierFlags = []
    for modifier in spec["modifiers"] as? [String] ?? [] {
      switch modifier { case "cmd": flags.insert(.command); case "shift": flags.insert(.shift); case "alt": flags.insert(.option); default: break }
    }
    let backspace = String(Character(UnicodeScalar(NSBackspaceCharacter)!))
    let key = name == "backspace" ? backspace : name
    let codes: [String: UInt16] = ["backspace": 51, "d": 2, "j": 38, "l": 37]
    guard let code = codes[name] else { return false }
    // In process, AppKit matches a lower-case equivalent with a Shift mask only when charactersIgnoringModifiers is
    // lower case (measured 2026-11-08); `characters` carries the shifted form.
    let shown = flags.contains(.shift) && name != "backspace" ? key.uppercased() : key
    guard let event = NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: flags, timestamp: ProcessInfo.processInfo.systemUptime,
                                       windowNumber: window.windowNumber, context: nil, characters: shown, charactersIgnoringModifiers: key,
                                       isARepeat: false, keyCode: code) else { return false }
    if NSApp.mainMenu?.performKeyEquivalent(with: event) == true { return true }
    // Not a key equivalent of an enabled item: the key goes to the focused view, as AppKit sends it on.
    window.firstResponder?.keyDown(with: event)
    return true
  }
}
