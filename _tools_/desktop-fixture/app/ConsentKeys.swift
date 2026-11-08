import AppKit

// 'consent-keys' (CU-142's and CU-143's live rows): one single-line field with the focus, in a window whose default
// button is 'Send' - so Return in the field presses Send, the case agent core must ask about - and a Test menu whose
// items take the Command-Backspace chords and only record that they fired. Nothing here deletes or sends anything:
// it is the safe stand-in for Finder's Empty Trash and a chat's Send.

/// CU-147's live row: a list whose plain Backspace deletes the selected row, as Mail's or Finder's lists do.
final class DraftsTable: NSTableView {
  var onDelete: ((Int) -> Void)?
  override func keyDown(with event: NSEvent) {
    // Backspace (51) and forward Delete (117), no modifier: delete the selected row.
    if (event.keyCode == 51 || event.keyCode == 117), event.modifierFlags.intersection(.deviceIndependentFlagsMask).subtracting([.function, .numericPad]).isEmpty,
       selectedRow >= 0 {
      onDelete?(selectedRow)
      return
    }
    super.keyDown(with: event)
  }
  override func deleteBackward(_ sender: Any?) { if selectedRow >= 0 { onDelete?(selectedRow) } }
}

final class ConsentKeys: NSObject, NSTextFieldDelegate, NSTableViewDataSource, NSTableViewDelegate {
  static var shared: ConsentKeys?
  static let task = "consent-keys"
  let field = NSTextField(string: "")
  let send = NSButton(title: "Send", target: nil, action: nil)
  let status = NSTextField(labelWithString: "")
  /// A multi-line text area in the same window: Return there is a new line, never the default button (cu-verifier's
  /// Return-is-text row); Command-Return is what presses Send from it.
  let notes = NSTextView(frame: NSRect(x: 0, y: 0, width: 380, height: 70))
  let notesScroll = NSScrollView(frame: NSRect(x: 20, y: 160, width: 380, height: 74))
  /// CU-146's live row: a button named like a destructive action ('Move to Trash', asked as delete) and a link that
  /// only opens a place named 'Trash' (allowed - the control-only refinement). Each only records that it was pressed.
  let trashButton = NSButton(title: "Move to Trash", target: nil, action: nil)
  let trashLink = NSButton(title: "Trash", target: nil, action: nil)
  let drafts = DraftsTable()
  let draftsScroll = NSScrollView(frame: NSRect(x: 20, y: 290, width: 380, height: 78))
  var draftNames = ["Q3 budget notes", "Offsite agenda", "Reply to Dana"]
  /// CU-135 and CU-148's live rows: two buttons that open the two system-style alert sheets a model meets - "replace an
  /// existing file?" and "save before closing?" - whose buttons only record which one was chosen.
  let exportButton = NSButton(title: "Export…", target: nil, action: nil)
  let closeButton = NSButton(title: "Close…", target: nil, action: nil)
  private(set) var openSheet: String?
  private var sheetWindow: NSWindow?
  private var menuItem: NSMenuItem?
  private var sentCount = 0
  private var fired: [String] = []

  /// The menu's chords: title, key equivalent (Backspace), modifiers - most specific first. In process, a synthetic
  /// key down with Shift matched the first Backspace item regardless of Shift (Option was respected), so only a real
  /// keystroke - the live row through CUHelper - can say which item each chord reaches.
  static let chords: [(title: String, modifiers: NSEvent.ModifierFlags)] = [
    ("Empty Bin", [.command, .option, .shift]), ("Delete Now", [.command, .option]), ("Clear All", [.command, .shift]), ("Clear Line", [.command]),
  ]

  static func open(title: String) -> Bool {
    let screen = ConsentKeys()
    shared = screen
    screen.build(title: title)
    return true
  }

  private func build(title: String) {
    let fixture = Fixture.shared
    let content = FlippedView(frame: NSRect(x: 0, y: 0, width: 420, height: 420))
    content.wantsLayer = true
    content.layer?.backgroundColor = NSColor.white.cgColor
    let heading = Kit.label("Quick message", size: 16, bold: true)
    heading.frame = NSRect(x: 20, y: 16, width: 380, height: 22)
    content.addSubview(heading)
    field.placeholderString = "Message"
    field.frame = NSRect(x: 20, y: 52, width: 380, height: 26)
    field.identifier = NSUserInterfaceItemIdentifier("message")
    field.setAccessibilityLabel("Message")
    field.delegate = self
    fixture.controls["message"] = field
    content.addSubview(field)
    send.bezelStyle = .rounded
    send.keyEquivalent = "\r"
    send.target = self
    send.action = #selector(sendPressed(_:))
    send.frame = NSRect(x: 300, y: 90, width: 100, height: 30)
    send.identifier = NSUserInterfaceItemIdentifier("send")
    fixture.controls["send"] = send
    content.addSubview(send)
    status.font = NSFont.systemFont(ofSize: 12)
    status.textColor = .darkGray
    status.frame = NSRect(x: 20, y: 128, width: 380, height: 18)
    content.addSubview(status)
    notes.isRichText = false
    notes.font = NSFont.systemFont(ofSize: 13)
    notes.setAccessibilityLabel("Notes")
    notes.identifier = NSUserInterfaceItemIdentifier("notes")
    notesScroll.documentView = notes
    notesScroll.borderType = .bezelBorder
    notesScroll.hasVerticalScroller = true
    fixture.controls["notes"] = notes
    content.addSubview(notesScroll)
    trashButton.bezelStyle = .rounded
    trashButton.target = self
    trashButton.action = #selector(trashPressed(_:))
    trashButton.frame = NSRect(x: 20, y: 246, width: 140, height: 30)
    trashButton.identifier = NSUserInterfaceItemIdentifier("move-to-trash")
    fixture.controls["move-to-trash"] = trashButton
    content.addSubview(trashButton)
    // A link-style button: borderless, blue text - it opens a place, it does not delete anything.
    trashLink.isBordered = false
    trashLink.attributedTitle = NSAttributedString(string: "Trash", attributes: [.foregroundColor: NSColor.linkColor, .underlineStyle: NSUnderlineStyle.single.rawValue])
    // The cell is the element Accessibility reports for a button: the link role goes there.
    trashLink.setAccessibilityRole(.link)
    trashLink.cell?.setAccessibilityRole(.link)
    trashLink.setAccessibilityLabel("Trash")
    trashLink.target = self
    trashLink.action = #selector(trashOpened(_:))
    trashLink.frame = NSRect(x: 180, y: 250, width: 60, height: 22)
    trashLink.identifier = NSUserInterfaceItemIdentifier("trash-link")
    fixture.controls["trash-link"] = trashLink
    content.addSubview(trashLink)
    let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("draft"))
    column.title = "Drafts"
    column.width = 360
    drafts.addTableColumn(column)
    drafts.rowHeight = 22
    drafts.dataSource = self
    drafts.delegate = self
    drafts.setAccessibilityLabel("Drafts")
    drafts.identifier = NSUserInterfaceItemIdentifier("drafts")
    drafts.onDelete = { [weak self] row in self?.deleteDraft(row) }
    draftsScroll.documentView = drafts
    draftsScroll.borderType = .bezelBorder
    draftsScroll.hasVerticalScroller = true
    content.addSubview(draftsScroll)
    fixture.controls["drafts"] = drafts
    for (button, name, x, action) in [(exportButton, "export", 20, #selector(exportPressed(_:))), (closeButton, "close-document", 140, #selector(closePressed(_:)))] {
      button.bezelStyle = .rounded
      button.target = self
      button.action = action
      button.frame = NSRect(x: CGFloat(x), y: 378, width: 110, height: 30)
      button.identifier = NSUserInterfaceItemIdentifier(name)
      fixture.controls[name] = button
      content.addSubview(button)
    }
    installMenu()
    let window = Windows.open("main", title: title, content: content)
    window.defaultButtonCell = send.cell as? NSButtonCell
    window.makeFirstResponder(field)
  }

  @objc func sendPressed(_ sender: Any?) { send(via: "button") }
  func numberOfRows(in tableView: NSTableView) -> Int { draftNames.count }

  func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
    let label = NSTextField(labelWithString: draftNames[row])
    label.font = NSFont.systemFont(ofSize: 13)
    return label
  }

  /// The selected draft goes; only the fact records it (nothing outside the fixture).
  func deleteDraft(_ row: Int) {
    guard draftNames.indices.contains(row) else { return }
    let name = draftNames.remove(at: row)
    Fixture.shared.record("row-deleted", ["name": name])
    drafts.reloadData()
    status.stringValue = "Deleted draft: \(name)"
  }

  @objc func trashPressed(_ sender: Any?) { Fixture.shared.record("trashed", [:]); status.stringValue = "Moved to Trash (nothing deleted)" }
  /// "'summary.txt' already exists. Do you want to replace it?" - Replace (the default button) / Cancel, as AppKit's
  /// save panel asks; Replace only records 'replace-confirmed' (nothing is written).
  @objc func exportPressed(_ sender: Any?) {
    let alert = NSAlert()
    alert.messageText = "\u{201C}summary.txt\u{201D} already exists. Do you want to replace it?"
    alert.informativeText = "A file with the same name already exists. Replacing it will overwrite its current contents."
    let replace = alert.addButton(withTitle: "Replace")
    let cancel = alert.addButton(withTitle: "Cancel")
    cancel.keyEquivalent = "\u{1b}"
    present(alert, kind: "replace", buttons: ["replace": replace, "cancel-replace": cancel]) { response in
      Fixture.shared.record(response == .alertFirstButtonReturn ? "replace-confirmed" : "replace-cancelled", [:])
    }
  }

  /// "Do you want to save the changes made to the document 'Notes'?" - Save (default) / Don't Save (Command-D) / Cancel,
  /// as AppKit's document close asks; Don't Save only records 'discarded'.
  @objc func closePressed(_ sender: Any?) {
    let alert = NSAlert()
    alert.messageText = "Do you want to save the changes made to the document \u{201C}Notes\u{201D}?"
    alert.informativeText = "Your changes will be lost if you don\u{2019}t save them."
    let save = alert.addButton(withTitle: "Save")
    let dontSave = alert.addButton(withTitle: "Don\u{2019}t Save")
    dontSave.keyEquivalent = "d"
    dontSave.keyEquivalentModifierMask = [.command]
    let cancel = alert.addButton(withTitle: "Cancel")
    cancel.keyEquivalent = "\u{1b}"
    // CU-148's nothing-focused row on a Mac with keyboard navigation on (cu-verifier): `closeSheetNoFocus` makes the
    // sheet's buttons refuse first responder, so no control holds the keyboard - as on a Mac with navigation off, the
    // macOS default - without touching the owner's setting.
    let noFocus = (Screens.params["closeSheetNoFocus"] as? Bool) == true
    if noFocus { for button in [save, dontSave, cancel] { button.refusesFirstResponder = true } }
    present(alert, kind: "dont-save", buttons: ["save-document": save, "dont-save": dontSave, "cancel-close": cancel], noFocus: noFocus) { response in
      switch response {
      case .alertFirstButtonReturn: Fixture.shared.record("saved", [:])
      case .alertSecondButtonReturn: Fixture.shared.record("discarded", [:])
      default: Fixture.shared.record("close-cancelled", [:])
      }
    }
  }

  private func present(_ alert: NSAlert, kind: String, buttons: [String: NSButton], noFocus: Bool = false, done: @escaping (NSApplication.ModalResponse) -> Void) {
    guard let window = send.window else { return }
    for (name, button) in buttons { Fixture.shared.controls[name] = button }
    openSheet = kind
    Fixture.shared.record("sheet-opened", ["kind": kind])
    alert.beginSheetModal(for: window) { [weak self] response in
      self?.openSheet = nil
      self?.sheetWindow = nil
      for name in buttons.keys { Fixture.shared.controls[name] = nil }
      done(response)
      self?.status.stringValue = "Sheet closed"
    }
    sheetWindow = alert.window
    if noFocus {
      alert.window.initialFirstResponder = nil
      alert.window.makeFirstResponder(nil)
    }
  }

  @objc func trashOpened(_ sender: Any?) { Fixture.shared.record("opened-trash", [:]); status.stringValue = "Trash opened" }

  /// A typed U+0003 (ETX, the keypad Enter character) in the message field sends, as many apps treat it (CU-149's live
  /// row: the driver should refuse to type it, so this 'sent' must never appear).
  func controlTextDidChange(_ notification: Notification) {
    guard let editor = notification.userInfo?["NSFieldEditor"] as? NSTextView, editor.string.contains("\u{3}") else { return }
    let before = editor.string.split(separator: "\u{3}", omittingEmptySubsequences: false).first.map(String.init) ?? ""
    editor.string = before
    field.stringValue = before
    send(via: "enter-character")
  }

  private func send(via: String) {
    sentCount += 1
    Fixture.shared.record("sent", ["text": field.stringValue, "via": via])
    status.stringValue = "Sent (\(sentCount))"
  }

  @objc func chordFired(_ sender: NSMenuItem) {
    fired.append(sender.title)
    Fixture.shared.record("menu-fired", ["item": sender.title])
    status.stringValue = "Menu: \(sender.title)"
  }

  /// The Test menu exists only while this screen is open.
  private func installMenu() {
    guard let main = NSApp.mainMenu else { return }
    let item = NSMenuItem()
    let menu = NSMenu(title: "Test")
    for chord in Self.chords {
      let entry = NSMenuItem(title: chord.title, action: #selector(chordFired(_:)), keyEquivalent: String(Character(UnicodeScalar(NSBackspaceCharacter)!)))
      entry.keyEquivalentModifierMask = chord.modifiers
      entry.target = self
      menu.addItem(entry)
    }
    item.submenu = menu
    main.addItem(item)
    menuItem = item
  }

  static func uninstallMenus() {
    guard let screen = shared, let item = screen.menuItem, let main = NSApp.mainMenu, main.items.contains(item) else { return }
    main.removeItem(item)
    screen.menuItem = nil
  }

  static func fields() -> [String: Any] {
    guard Screens.current == task, let screen = shared else { return [:] }
    let defaultTitle: Any = screen.send.window?.defaultButtonCell?.title ?? NSNull()
    let chords = (screen.menuItem?.submenu?.items ?? []).map { item -> [String: Any] in
      var mods: [String] = []
      if item.keyEquivalentModifierMask.contains(.command) { mods.append("cmd") }
      if item.keyEquivalentModifierMask.contains(.option) { mods.append("alt") }
      if item.keyEquivalentModifierMask.contains(.shift) { mods.append("shift") }
      return ["title": item.title, "key": item.keyEquivalent == String(Character(UnicodeScalar(NSBackspaceCharacter)!)) ? "backspace" : item.keyEquivalent, "modifiers": mods]
    }
    return ["message": screen.field.stringValue, "notes": screen.notes.string, "defaultButton": defaultTitle, "drafts": screen.draftNames,
            "sheet": screen.openSheet ?? NSNull(),
            // What holds the keyboard in the open sheet: a control's class, or 'window' when nothing does.
            "sheetFocus": screen.sheetWindow.map { window -> String in
              guard let responder = window.firstResponder, responder !== window else { return "window" }
              return String(describing: type(of: responder))
            } ?? NSNull(),
            "selectedDraft": screen.drafts.selectedRow >= 0 ? screen.draftNames[screen.drafts.selectedRow] : NSNull(), "sentCount": screen.sentCount, "menuFired": screen.fired, "menuChords": chords]
  }

  /// Seam: `keyEquivalent {key: 'return' | 'backspace', modifiers: ['cmd', 'shift', 'alt']}` offers a key down to the
  /// window's key equivalents (its default button), then the main menu's - the order AppKit offers a Command chord -
  /// as an in-process model only; which one a real keystroke reaches from a focused field is the live row's question.
  static func act(_ step: [String: Any]) -> Bool {
    guard Screens.current == task, let screen = shared, let window = screen.send.window else { return false }
    // Seam: `typeInto {text}` types into the message field through its field editor, as keystrokes' text arrives.
    if let text = (step["typeInto"] as? [String: Any])?["text"] as? String {
      window.makeFirstResponder(screen.field)
      (screen.field.currentEditor() as? NSTextView)?.insertText(text, replacementRange: NSRange(location: NSNotFound, length: 0))
      return true
    }
    // Seams: `selectDraft {index}` selects a row and gives the table the focus; `tableKey {key: 'backspace'|'delete'}`
    // sends a plain key down to the table's own keyDown.
    if let index = ((step["selectDraft"] as? [String: Any])?["index"] as? NSNumber)?.intValue {
      window.makeFirstResponder(screen.drafts)
      screen.drafts.selectRowIndexes(IndexSet(integer: index), byExtendingSelection: false)
      return true
    }
    if let key = (step["tableKey"] as? [String: Any])?["key"] as? String {
      let code: UInt16 = key == "delete" ? 117 : 51
      if let event = NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: window.windowNumber,
                                      context: nil, characters: "\u{8}", charactersIgnoringModifiers: "\u{8}", isARepeat: false, keyCode: code) {
        screen.drafts.keyDown(with: event)
      }
      return true
    }
    guard let spec = step["keyEquivalent"] as? [String: Any] else { return false }
    var flags: NSEvent.ModifierFlags = []
    for name in spec["modifiers"] as? [String] ?? [] {
      switch name { case "cmd": flags.insert(.command); case "shift": flags.insert(.shift); case "alt": flags.insert(.option); default: break }
    }
    let key = spec["key"] as? String == "backspace" ? String(Character(UnicodeScalar(NSBackspaceCharacter)!)) : "\r"
    guard let event = NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: flags, timestamp: ProcessInfo.processInfo.systemUptime,
                                       windowNumber: window.windowNumber, context: nil, characters: key, charactersIgnoringModifiers: key,
                                       isARepeat: false, keyCode: key == "\r" ? 36 : 51) else { return false }
    if window.performKeyEquivalent(with: event) { return true }
    _ = NSApp.mainMenu?.performKeyEquivalent(with: event)
    return true
  }
}
