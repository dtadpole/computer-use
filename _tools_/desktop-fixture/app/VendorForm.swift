import AppKit

// CU-66 S9 (cu-researcher's spec): CU Fixture 'long-form' - a vendor form taller than its window, so the last four
// fields and Submit need a scroll - and CU Ledger 'ledger-vendor', a read-only record of the same keys to copy from.
// The form is 600 pt wide, so at x 120 it ends left of CU Ledger's windows at x 800: neither app covers the other.

final class VendorForm: NSObject {
  static var shared: VendorForm?
  static let formTask = "long-form"
  static let ledgerTask = "ledger-vendor"
  /// Keys in order, their labels, and the popups' choices.
  static let fieldsSpec: [(key: String, label: String, options: [String]?)] = [
    ("vendor", "Vendor", nil), ("contact", "Contact", nil), ("email", "Email", nil), ("phone", "Phone", nil),
    ("taxId", "Tax ID", nil), ("iban", "IBAN", nil), ("terms", "Payment terms", ["Net 15", "Net 30", "Net 45"]),
    ("currency", "Currency", ["USD", "EUR", "GBP"]),
  ]
  static let rowHeight: CGFloat = 92

  let scroll = NSScrollView(frame: NSRect(x: 0, y: 48, width: 600, height: 412))
  let document = FlippedView(frame: .zero)
  var inputs: [String: NSControl] = [:]
  let submitButton = NSButton(title: "Submit", target: nil, action: nil)
  let submittedNote = NSTextField(labelWithString: "")
  let heading = Kit.label("New vendor", size: 16, bold: true)
  private(set) var submitted = false
  /// CU Ledger's record as shown, for its fields, and whether each value can be selected (to copy it).
  static var ledgerShown: [String: String] = [:]
  static var ledgerSelectable: [String: Bool] = [:]
  static var ledgerCaptions: [String: String] = [:]
  static weak var ledgerScratch: NSTextField?

  static func open(_ task: String, title: String) -> Bool {
    if task == formTask {
      let form = VendorForm()
      shared = form
      form.buildForm(title: title)
      return true
    }
    if task == ledgerTask {
      buildLedger(title: title)
      return true
    }
    return false
  }

  private func buildForm(title: String) {
    let fixture = Fixture.shared
    let content = FlippedView(frame: NSRect(x: 0, y: 0, width: 600, height: 460))
    content.wantsLayer = true
    content.layer?.backgroundColor = NSColor.white.cgColor
    heading.frame = NSRect(x: 16, y: 14, width: 560, height: 22)
    content.addSubview(heading)

    // Each field takes a tall row (label above a large input), so four fit above the fold and four need a scroll.
    let height = CGFloat(Self.fieldsSpec.count) * Self.rowHeight + 120
    document.frame = NSRect(x: 0, y: 0, width: 585, height: height)
    for (index, spec) in Self.fieldsSpec.enumerated() {
      let y = 12 + CGFloat(index) * Self.rowHeight
      let label = Kit.label(spec.label, size: 13, bold: true)
      label.frame = NSRect(x: 20, y: y, width: 300, height: 18)
      document.addSubview(label)
      let control: NSControl
      if let options = spec.options {
        let popup = NSPopUpButton(frame: NSRect(x: 20, y: y + 24, width: 240, height: 30), pullsDown: false)
        popup.addItems(withTitles: options)
        popup.target = fixture
        popup.action = #selector(Fixture.selected(_:))
        control = popup
      } else {
        let field = NSTextField(string: "")
        field.font = NSFont.systemFont(ofSize: 14)
        field.frame = NSRect(x: 20, y: y + 24, width: 540, height: 30)
        control = field
      }
      control.identifier = NSUserInterfaceItemIdentifier(spec.key)
      // Each input is named by its label (cu-researcher's first live run: a question read 'the focused field on ' -
      // it must name the field). The cell too: it is the element Accessibility reports for a text field.
      control.setAccessibilityLabel(spec.label)
      control.cell?.setAccessibilityLabel(spec.label)
      control.setAccessibilityTitleUIElement(label)
      inputs[spec.key] = control
      document.addSubview(control)
    }
    let submitY = 12 + CGFloat(Self.fieldsSpec.count) * Self.rowHeight + 10
    submitButton.target = fixture
    submitButton.action = #selector(Fixture.pressed(_:))
    submitButton.bezelStyle = .rounded
    submitButton.frame = NSRect(x: 20, y: submitY, width: 120, height: 32)
    submitButton.identifier = NSUserInterfaceItemIdentifier("submit")
    document.addSubview(submitButton)
    submittedNote.font = NSFont.boldSystemFont(ofSize: 14)
    submittedNote.textColor = NSColor(calibratedRed: 0.1, green: 0.45, blue: 0.2, alpha: 1)
    submittedNote.frame = NSRect(x: 156, y: submitY + 7, width: 300, height: 20)
    submittedNote.isHidden = true
    document.addSubview(submittedNote)

    scroll.documentView = document
    scroll.hasVerticalScroller = true
    scroll.scrollerStyle = .legacy
    scroll.drawsBackground = false
    content.addSubview(scroll)
    scroll.contentView.postsBoundsChangedNotifications = true
    NotificationCenter.default.addObserver(self, selector: #selector(scrolled(_:)), name: NSView.boundsDidChangeNotification, object: scroll.contentView)
    _ = Windows.open("main", title: title, content: content)
    realize()
  }

  /// Fields and Submit are targets only while wholly shown: the last four need a scroll first.
  func realize() {
    let fixture = Fixture.shared
    let clip = scroll.contentView.bounds
    var all: [(String, NSView)] = inputs.map { ($0.key, $0.value) }
    all.append(("submit", submitButton))
    for (name, view) in all {
      let shown = view.frame.minY >= clip.minY - 0.5 && view.frame.maxY <= clip.maxY + 0.5
      fixture.controls[name] = shown ? view : nil
    }
  }

  @objc func scrolled(_ note: Notification) { realize() }

  func values() -> [String: String] {
    var out: [String: String] = [:]
    for (key, control) in inputs {
      if let popup = control as? NSPopUpButton { out[key] = popup.titleOfSelectedItem ?? "" } else if let field = control as? NSTextField { out[key] = field.stringValue }
    }
    return out
  }

  static func press(_ name: String) -> Bool {
    guard Screens.current == formTask, let form = shared, name == "submit" else { return false }
    form.submitted = true
    Fixture.shared.record("submitted", ["values": form.values()])
    form.submittedNote.stringValue = "\u{2713} Submitted"
    form.submittedNote.isHidden = false
    form.heading.stringValue = "New vendor (submitted)"
    return true
  }

  /// CU Ledger's record: each key's label and value as selectable text, so a value can be copied.
  private static func buildLedger(title: String) {
    let record = Screens.params["record"] as? [String: Any] ?? [:]
    ledgerShown = [:]
    ledgerSelectable = [:]
    ledgerCaptions = [:]
    let content = FlippedView(frame: NSRect(x: 0, y: 0, width: 380, height: 400))
    content.wantsLayer = true
    content.layer?.backgroundColor = NSColor.white.cgColor
    let name = Kit.label("CU Ledger", size: 18, bold: true)
    name.frame = NSRect(x: 16, y: 12, width: 340, height: 24)
    content.addSubview(name)
    let sub = Kit.label("Vendor record", size: 13, bold: false)
    sub.textColor = .darkGray
    sub.frame = NSRect(x: 16, y: 38, width: 340, height: 18)
    content.addSubview(sub)
    for (index, spec) in fieldsSpec.enumerated() {
      let y = 68 + CGFloat(index) * 34
      let label = Kit.label(spec.label, size: 12, bold: true)
      label.frame = NSRect(x: 16, y: y + 2, width: 110, height: 18)
      content.addSubview(label)
      let text = "\(record[spec.key] ?? "")"
      ledgerShown["record-\(spec.key)"] = text
      let value = NSTextField(labelWithString: text)
      value.font = NSFont.systemFont(ofSize: 13)
      value.textColor = .black
      value.isSelectable = true
      value.frame = NSRect(x: 132, y: y, width: 232, height: 20)
      value.identifier = NSUserInterfaceItemIdentifier("record-\(spec.key)")
      ledgerSelectable[spec.key] = value.isSelectable
      // CU-187: the label captions the value - macOS's title element link, what the helper reads as the copy's caption.
      // A selected label's focused element is its CELL, and AppKit's NSTextFieldCell does not answer AXTitleUIElement
      // through the attribute path other processes read (an in-process probe: the setter's value never reached it), so
      // the cell reports the link itself (CaptionedCell).
      let cell = CaptionedCell(textCell: text)
      cell.font = value.font
      cell.textColor = value.textColor
      cell.isEditable = false
      cell.isSelectable = true
      cell.isBordered = false
      cell.isBezeled = false
      cell.drawsBackground = false
      cell.lineBreakMode = .byTruncatingTail
      cell.caption = label
      value.cell = cell
      value.setAccessibilityTitleUIElement(label)
      ledgerCaptions[spec.key] = (value.cell?.accessibilityAttributeValue(.titleUIElement) as? NSTextField)?.stringValue ?? ""
      Fixture.shared.controls["record-\(spec.key)"] = value
      content.addSubview(value)
    }
    // CU-187's live row (cu-verifier): an unnamed entry on the same screen to paste a copied value into - no name, no
    // caption, no title element, so only the copy's source caption can class the paste.
    let scratchY = 68 + CGFloat(fieldsSpec.count) * 34 + 10
    let scratch = NSTextField(string: "")
    scratch.font = NSFont.systemFont(ofSize: 13)
    scratch.frame = NSRect(x: 16, y: scratchY, width: 348, height: 24)
    scratch.identifier = NSUserInterfaceItemIdentifier("scratch")
    Fixture.shared.controls["scratch"] = scratch
    content.addSubview(scratch)
    ledgerScratch = scratch
    _ = Windows.open("main", title: title, content: content)
  }

  static func fields() -> [String: Any] {
    if Screens.current == ledgerTask {
      var out: [String: Any] = ledgerShown
      out["recordSelectable"] = ledgerSelectable
      out["recordCaptions"] = ledgerCaptions
      out["scratchText"] = ledgerScratch?.stringValue ?? NSNull()
      out["scratchOwnName"] = [ledgerScratch?.accessibilityLabel(), ledgerScratch?.accessibilityTitle(), ledgerScratch?.cell?.accessibilityLabel()].compactMap { $0 }.joined()
      return out
    }
    guard Screens.current == formTask, let form = shared else { return [:] }
    // The note is reported only while shown, so a hidden note cannot pass for a visible one.
    let axLabels = Dictionary(uniqueKeysWithValues: form.inputs.map { key, control in (key, control.accessibilityLabel() ?? "") })
    return ["values": form.values(), "submitted": form.submitted, "scrollY": Int(form.scroll.contentView.bounds.minY), "axLabels": axLabels,
            "submittedNote": form.submittedNote.isHidden ? NSNull() : form.submittedNote.stringValue]
  }

  /// Seam: `scrollTo name` brings a field (or submit) into view, as a scroll would. Fields take the generic set and
  /// select, Submit the generic press.
  static func act(_ step: [String: Any]) -> Bool {
    guard Screens.current == formTask, let form = shared, let name = step["scrollTo"] as? String else { return false }
    let view: NSView? = name == "submit" ? form.submitButton : form.inputs[name]
    guard let view else { return false }
    view.scrollToVisible(view.bounds.insetBy(dx: 0, dy: -8))
    form.realize()
    return true
  }
}

/// CU-187: a selectable label's cell that names its caption as AXTitleUIElement on the attribute path other processes
/// read - AppKit's own cell lists no AXTitleUIElement and answers nil there even after setAccessibilityTitleUIElement.
final class CaptionedCell: NSTextFieldCell {
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
}
