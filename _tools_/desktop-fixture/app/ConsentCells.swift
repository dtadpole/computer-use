import AppKit

/// 'consent-cells' (D-064): the live targets for six desktop cells of the D-059 matrix that had none, each named
/// exactly as its cell names it:
///   - click-submit-field-name: a text field 'Send a message' (a click into it asks submit by design: a plain entry's
///     name keeps only its submit class - text-entry-focus-click.md, CU-170);
///   - space-checkbox: a checkbox 'Delete originals after import' (Space toggles it when it has the focus);
///   - hold-space-destructive, type-space-destructive: a button 'Delete' (Space presses it when it has the focus);
///   - send-reply-no-text: a button 'Send reply' in a window whose text entries are all empty;
///   - click-into-security-entry: a text field 'Social Security number';
///   - CU-183/CU-187 (open param `copyRow`): a prefilled plain entry 'IBAN' holding a made-up value no value rule
///     knows ('ACCT-REF 7731') and an unnamed entry to paste or drop it into - off by default, so every entry stays
///     empty for send-reply-no-text;
///   - CU-192 (with `copyRow`): a toolbar-style button 'Paste' and an icon-only one whose description is 'Paste' -
///     both refuse first responder, so a click leaves the focus in the entry, and paste the pasteboard into it;
///   - CU-209 (open param `readonlyText`): two read-only, selectable text views (AXTextArea, value not settable), each
///     captioned by a label exposed as its AXTitleUIElement - 'IBAN' holding a test IBAN, and its 'Notes' twin holding
///     plain words - the source of a dwell drag of selected text judged by caption; off by default;
///   - CU-194 (open param `passwordToggle`): an unnamed secure field with a 'Show' checkbox that swaps it, in place, for
///     a plain field holding the same text (AXSecureTextField <-> AXTextField at the same frame), as a show-password
///     toggle does - off by default;
///   - CU-184: a plain (not secure) text field 'Password' and one 'Password hint'; and a field labelled only by a
///     separate static text 'Password' beside it, itself unnamed - CU-187's named residual (labels are not read yet).
/// The open parameter `focus` ('delete' or 'checkbox') makes that control first responder - without Full Keyboard
/// Access a button takes no focus, so the screen grants it. Each control records only its own event ('deleted',
/// 'checked', 'sent-reply'), so a declined action shows as no event.
final class ConsentCells: NSObject {
  static let task = "consent-cells"
  static var shared: ConsentCells?
  /// The ISO 13616 example IBAN the read-only 'IBAN' view holds, joined from two halves so this source holds no IBAN literal.
  static let readonlyIban = "DE89 3704 0044" + " 0532 0130 00"

  /// A button or checkbox that takes the keyboard focus whatever the Full Keyboard Access setting, and that Space
  /// presses while it has the focus - down highlights, up clicks, as a focused control behaves with keyboard access on
  /// (a held Space presses once, on release; typed spaces press it each time).
  final class FocusButton: NSButton {
    override var acceptsFirstResponder: Bool { true }
    override func keyDown(with event: NSEvent) {
      if event.charactersIgnoringModifiers == " " { if !event.isARepeat { highlight(true) } } else { super.keyDown(with: event) }
    }
    override func keyUp(with event: NSEvent) {
      if event.charactersIgnoringModifiers == " " { highlight(false); performClick(nil) } else { super.keyUp(with: event) }
    }
  }

  let sendField = NSTextField()
  let securityField = NSTextField()
  let passwordField = NSTextField()
  let hintField = NSTextField()
  let unlabelledField = NSTextField()
  let toggleSecure = NSSecureTextField()
  let togglePlain = NSTextField()
  let ibanField = NSTextField()
  let pasteTarget = NSTextField()
  let deleteOriginals = FocusButton(checkboxWithTitle: "Delete originals after import", target: nil, action: nil)
  let deleteButton = FocusButton(title: "Delete", target: nil, action: nil)
  let sendReply = NSButton(title: "Send reply", target: nil, action: nil)
  var events: [String] = []

  static func open(title: String) -> Bool {
    let screen = ConsentCells()
    shared = screen
    screen.build(title: title, focus: Screens.string("focus"), copyRow: Screens.params["copyRow"] as? Bool ?? false,
                 passwordToggle: Screens.params["passwordToggle"] as? Bool ?? false, readonlyText: Screens.params["readonlyText"] as? Bool ?? false)
    return true
  }

  private func named(_ field: NSTextField, _ key: String, _ label: String, y: CGFloat, in content: NSView) {
    let caption = Kit.label(label, size: 12, bold: true)
    caption.frame = NSRect(x: 20, y: y, width: 380, height: 16)
    content.addSubview(caption)
    field.font = NSFont.systemFont(ofSize: 14)
    field.frame = NSRect(x: 20, y: y + 20, width: 380, height: 26)
    field.identifier = NSUserInterfaceItemIdentifier(key)
    field.setAccessibilityLabel(label)
    field.cell?.setAccessibilityLabel(label)
    field.setAccessibilityTitleUIElement(caption)
    Fixture.shared.controls[key] = field
    content.addSubview(field)
  }

  private func place(_ button: NSButton, _ key: String, _ action: Selector, frame: NSRect, in content: NSView) {
    button.target = self
    button.action = action
    button.frame = frame
    button.identifier = NSUserInterfaceItemIdentifier(key)
    Fixture.shared.controls[key] = button
    content.addSubview(button)
  }

  private func build(title: String, focus: String, copyRow: Bool, passwordToggle: Bool, readonlyText: Bool) {
    let base: CGFloat = copyRow ? 610 : 470
    let toggleBase = base
    let readonlyBase = base + (passwordToggle ? 60 : 0)
    let content = FlippedView(frame: NSRect(x: 0, y: 0, width: 420, height: readonlyBase + (readonlyText ? 130 : 0)))
    content.wantsLayer = true
    content.layer?.backgroundColor = NSColor.white.cgColor
    let heading = Kit.label("Import and messages", size: 16, bold: true)
    heading.frame = NSRect(x: 20, y: 16, width: 380, height: 22)
    content.addSubview(heading)
    named(sendField, "send-message", "Send a message", y: 48, in: content)
    named(securityField, "social-security-number", "Social Security number", y: 104, in: content)
    place(deleteOriginals, "delete-originals", #selector(checked(_:)), frame: NSRect(x: 20, y: 166, width: 300, height: 22), in: content)
    deleteButton.bezelStyle = .rounded
    place(deleteButton, "delete", #selector(deleted(_:)), frame: NSRect(x: 20, y: 204, width: 110, height: 30), in: content)
    sendReply.bezelStyle = .rounded
    place(sendReply, "send-reply", #selector(sentReply(_:)), frame: NSRect(x: 150, y: 204, width: 120, height: 30), in: content)
    named(passwordField, "password", "Password", y: 248, in: content)
    named(hintField, "password-hint", "Password hint", y: 304, in: content)
    // CU-187's residual: the caption is a separate static text; the field itself carries no name and no title element.
    let caption = Kit.label("Password", size: 12, bold: true)
    caption.frame = NSRect(x: 20, y: 366, width: 90, height: 18)
    content.addSubview(caption)
    unlabelledField.font = NSFont.systemFont(ofSize: 14)
    unlabelledField.frame = NSRect(x: 120, y: 362, width: 280, height: 26)
    unlabelledField.identifier = NSUserInterfaceItemIdentifier("unlabelled-password")
    Fixture.shared.controls["unlabelled-password"] = unlabelledField
    content.addSubview(unlabelledField)
    if copyRow {
      named(ibanField, "iban", "IBAN", y: 402, in: content)
      ibanField.stringValue = "ACCT-REF 7731"
      // The paste or drop target: a plain entry with no name, no caption and no title element.
      pasteTarget.font = NSFont.systemFont(ofSize: 14)
      pasteTarget.frame = NSRect(x: 20, y: 470, width: 380, height: 26)
      pasteTarget.identifier = NSUserInterfaceItemIdentifier("paste-target")
      Fixture.shared.controls["paste-target"] = pasteTarget
      content.addSubview(pasteTarget)
      // CU-192: a Paste button outside the menu, and an icon-only one named by its image's description.
      let pasteButton = NSButton(title: "Paste", target: self, action: #selector(pasteClicked(_:)))
      pasteButton.refusesFirstResponder = true
      pasteButton.frame = NSRect(x: 20, y: 520, width: 100, height: 30)
      pasteButton.identifier = NSUserInterfaceItemIdentifier("toolbar-paste")
      Fixture.shared.controls["toolbar-paste"] = pasteButton
      content.addSubview(pasteButton)
      let icon = NSImage(systemSymbolName: "doc.on.clipboard", accessibilityDescription: "Paste") ?? NSImage()
      let iconButton = NSButton(image: icon, target: self, action: #selector(pasteClicked(_:)))
      iconButton.refusesFirstResponder = true
      iconButton.frame = NSRect(x: 140, y: 520, width: 44, height: 30)
      iconButton.identifier = NSUserInterfaceItemIdentifier("icon-paste")
      Fixture.shared.controls["icon-paste"] = iconButton
      content.addSubview(iconButton)
    }
    if passwordToggle {
      // CU-194: the secure field and its plain twin share one frame; the checkbox shows one and hides the other.
      let frame = NSRect(x: 20, y: toggleBase + 14, width: 280, height: 26)
      for field in [toggleSecure, togglePlain] {
        field.font = NSFont.systemFont(ofSize: 14)
        field.frame = frame
        field.identifier = NSUserInterfaceItemIdentifier("toggle-secret")
        content.addSubview(field)
      }
      togglePlain.isHidden = true
      Fixture.shared.controls["toggle-secret"] = toggleSecure
      let show = NSButton(checkboxWithTitle: "Show", target: self, action: #selector(toggleShown(_:)))
      show.frame = NSRect(x: 312, y: toggleBase + 16, width: 90, height: 22)
      show.identifier = NSUserInterfaceItemIdentifier("show-toggle")
      Fixture.shared.controls["show-toggle"] = show
      content.addSubview(show)
    }
    if readonlyText {
      // CU-209: read-only, selectable text views, each captioned by its label (AXTitleUIElement, exposed out of process).
      for (index, item) in [("IBAN", "readonly-iban", ConsentCells.readonlyIban), ("Notes", "readonly-notes", "Bring the blue folder")].enumerated() {
        let y = readonlyBase + 10 + CGFloat(index) * 60
        let label = Kit.label(item.0)
        label.frame = NSRect(x: 20, y: y, width: 80, height: 20)
        content.addSubview(label)
        let view = CaptionedTextView(frame: NSRect(x: 100, y: y - 2, width: 300, height: 44))
        view.string = item.2
        view.isEditable = false
        view.isSelectable = true
        view.font = NSFont.systemFont(ofSize: 14)
        view.caption = label
        view.identifier = NSUserInterfaceItemIdentifier(item.1)
        Fixture.shared.controls[item.1] = view
        content.addSubview(view)
      }
    }
    let window = Windows.open("main", title: title, content: content)
    switch focus {
    case "delete": window.makeFirstResponder(deleteButton)
    case "checkbox": window.makeFirstResponder(deleteOriginals)
    default: window.makeFirstResponder(nil)
    }
  }

  private func record(_ type: String, _ fields: [String: Any] = [:]) {
    events.append(type)
    Fixture.shared.record(type, fields)
  }

  @objc func checked(_ sender: NSButton) { record("checked", ["on": sender.state == .on]) }
  @objc func deleted(_ sender: NSButton) { record("deleted") }
  @objc func sentReply(_ sender: NSButton) { record("sent-reply") }
  /// CU-192: paste into whatever entry has the focus (the first responder's field editor), as a toolbar Paste does.
  /// CU-194: Show swaps the secure field for the plain one in place, carrying the text and the focus across.
  @objc func toggleShown(_ sender: NSButton) {
    let shown = sender.state == .on
    let (from, to): (NSTextField, NSTextField) = shown ? (toggleSecure, togglePlain) : (togglePlain, toggleSecure)
    let hadFocus = from.currentEditor() != nil
    to.stringValue = from.stringValue
    from.isHidden = true
    to.isHidden = false
    Fixture.shared.controls["toggle-secret"] = to
    if hadFocus { to.window?.makeFirstResponder(to) }
    record("toggled", ["shown": shown])
  }

  @objc func pasteClicked(_ sender: NSButton) {
    let pasted = NSApp.sendAction(#selector(NSText.paste(_:)), to: nil, from: sender)
    record("toolbar-paste", ["button": sender.identifier?.rawValue ?? "", "delivered": pasted])
  }

  static func fields() -> [String: Any] {
    guard Screens.current == task, let screen = shared, let window = screen.deleteButton.window else { return [:] }
    let focused: String
    switch window.firstResponder {
    case let view as NSView where view === screen.deleteButton: focused = "delete"
    case let view as NSView where view === screen.deleteOriginals: focused = "delete-originals"
    case let editor as NSTextView where editor.delegate as? NSTextField === screen.sendField: focused = "send-message"
    case let editor as NSTextView where editor.delegate as? NSTextField === screen.securityField: focused = "social-security-number"
    default: focused = ""
    }
    return ["cellsFocus": focused, "cellsEvents": screen.events, "deleteOriginalsOn": screen.deleteOriginals.state == .on,
            "sendMessageText": screen.sendField.stringValue, "securityText": screen.securityField.stringValue,
            "passwordText": screen.passwordField.stringValue, "hintText": screen.hintField.stringValue, "unlabelledText": screen.unlabelledField.stringValue,
            "ibanText": screen.ibanField.superview == nil ? NSNull() : screen.ibanField.stringValue,
            "pasteTargetText": screen.pasteTarget.superview == nil ? NSNull() : screen.pasteTarget.stringValue,
            // CU-192: a click on either Paste button leaves the focus in the entry.
            // CU-194: which twin is shown, and how much it holds (a count, never the text).
            "toggleShown": screen.togglePlain.superview == nil ? NSNull() : !screen.togglePlain.isHidden,
            // CU-209: whether each read-only text view still holds its words (a drag must never move them out).
            "readonlyIntact": (Fixture.shared.controls["readonly-iban"] as? NSTextView).map { iban in
              iban.string == ConsentCells.readonlyIban && (Fixture.shared.controls["readonly-notes"] as? NSTextView)?.string == "Bring the blue folder" } ?? NSNull(),
            "toggleChars": screen.togglePlain.superview == nil ? NSNull() : (screen.togglePlain.isHidden ? screen.toggleSecure : screen.togglePlain).stringValue.count,
            "pasteButtonsTakeFocus": ["toolbar-paste", "icon-paste"].compactMap { Fixture.shared.controls[$0] as? NSButton }.map { $0.acceptsFirstResponder },
            // CU-187's residual: the field's own name - label and title, on the control and its cell - is empty.
            "unlabelledOwnName": [screen.unlabelledField.accessibilityLabel(), screen.unlabelledField.accessibilityTitle(),
                                  screen.unlabelledField.cell?.accessibilityLabel(), screen.unlabelledField.cell?.accessibilityTitle()].compactMap { $0 }.joined()]
  }

  /// Seam: `space` sends a Space key down and up to the first responder, as a keystroke there would.
  static func act(_ step: [String: Any]) -> Bool {
    guard Screens.current == task, let screen = shared, let window = screen.deleteButton.window, step["space"] != nil else { return false }
    for type in [NSEvent.EventType.keyDown, .keyUp] {
      if let event = NSEvent.keyEvent(with: type, location: .zero, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: window.windowNumber,
                                      context: nil, characters: " ", charactersIgnoringModifiers: " ", isARepeat: false, keyCode: 49) {
        if type == .keyDown { window.firstResponder?.keyDown(with: event) } else { window.firstResponder?.keyUp(with: event) }
      }
    }
    return true
  }
}

/// CU-209: a text view that names its caption as AXTitleUIElement, out of process too (a plain NSTextView exposes none).
final class CaptionedTextView: NSTextView {
  weak var caption: NSView?
  override func accessibilityAttributeNames() -> [NSAccessibility.Attribute] {
    var names = super.accessibilityAttributeNames()
    if caption != nil, !names.contains(.titleUIElement) { names.append(.titleUIElement) }
    return names
  }
  override func accessibilityAttributeValue(_ attribute: NSAccessibility.Attribute) -> Any? {
    if attribute == .titleUIElement, let caption { return caption }
    return super.accessibilityAttributeValue(attribute)
  }
  override func accessibilityTitleUIElement() -> Any? { caption ?? super.accessibilityTitleUIElement() }
}
