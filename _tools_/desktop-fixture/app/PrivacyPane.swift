import AppKit

/// 'privacy-pane' (CU-787, the live stand-in CU-763 lacked): a screen shaped like a privacy pane. A section header states
/// the grant, and under it a table (AXTable) whose rows each hold an app-name text and an UNTITLED check-box switch
/// (AXCheckBox, subrole AXSwitch) - the switch has no title, label, description or help, and no title element: its only label is the
/// text in its own row, as in System Settings' privacy lists. A second section of the same shape is for near rows.
///
/// The rows and their start state are the live set's, not the builder's (CU-787's independence rule): the open params
/// `header` / `rows` (section 1) and `header2` / `rows2` (section 2, shown only with rows) name them, `on` lists the
/// names that start switched on. The defaults are neutral placeholders. Each switch records only its own change
/// ('privacy-toggled': section, row, name, on), and `fields` reports every row's state, so a live row reads its result
/// from the fixture's channel with no input outside CUHelper. Targets: `privacy-<section>-<row>` for each switch and
/// `privacy-<section>-<row>-name` for its row's text. Seam: `privacyToggle: <target>` flips a switch through its own
/// action, as a click does.
final class PrivacyPane: NSObject, NSTableViewDataSource, NSTableViewDelegate {
  static let task = "privacy-pane"
  static var shared: PrivacyPane?
  static let defaultHeader = "Allow the applications below to use this feature."
  static let defaultRows = ["App One", "App Two", "App Three", "App Four"]
  static let rowHeight: CGFloat = 30
  static let maxRows = 12

  /// One header and its table.
  final class Section {
    let index: Int
    let header: String
    let names: [String]
    var on: [Bool]
    let table = NSTableView()
    let scroll = NSScrollView()
    var switches: [Int: NSButton] = [:]
    init(index: Int, header: String, names: [String], on: Set<String>) {
      self.index = index
      self.header = header
      self.names = names
      self.on = names.map { on.contains($0) }
    }
  }

  /// The switch: an untitled check box (AXCheckBox with subrole AXSwitch and a numeric 0 / 1 value, as System Settings'
  /// privacy switches serve it). An NSSwitch would serve AXButton and a string value, and the helper reads a toggle's state
  /// and row context only for a check box (ToggleState, CU-763). A button's accessibility element is its cell, so the
  /// cell carries the subrole and the empty name; the control repeats the empty name for in-process readers.
  final class UntitledSwitchCell: NSButtonCell {
    override func accessibilitySubrole() -> NSAccessibility.Subrole? { NSAccessibility.Subrole(rawValue: "AXSwitch") }
    override func accessibilityLabel() -> String? { nil }
    override func accessibilityTitle() -> String? { nil }
    override func accessibilityHelp() -> String? { nil }
    override func accessibilityTitleUIElement() -> Any? { nil }
  }

  final class UntitledSwitch: NSButton {
    override class var cellClass: AnyClass? {
      get { UntitledSwitchCell.self }
      set {}
    }
    override func accessibilityLabel() -> String? { nil }
    override func accessibilityTitle() -> String? { nil }
    override func accessibilityHelp() -> String? { nil }
    override func accessibilityTitleUIElement() -> Any? { nil }
  }

  var sections: [Section] = []
  private(set) var toggles: [[String: Any]] = []

  static func open(title: String) -> Bool {
    let screen = PrivacyPane()
    shared = screen
    screen.build(title: title)
    return true
  }

  /// A name list param: an array of strings, or one comma-separated string; empty names dropped, at most `maxRows`.
  static func names(_ value: Any?) -> [String]? {
    let raw: [String]
    if let list = value as? [String] { raw = list } else if let text = value as? String { raw = text.components(separatedBy: ",") } else { return nil }
    let cleaned = raw.map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
    return cleaned.isEmpty ? nil : Array(cleaned.prefix(maxRows))
  }

  private func build(title: String) {
    let params = Screens.params
    let on = Set(Self.names(params["on"]) ?? [])
    sections = [Section(index: 1, header: params["header"] as? String ?? Self.defaultHeader, names: Self.names(params["rows"]) ?? Self.defaultRows, on: on)]
    if let second = Self.names(params["rows2"]) {
      sections.append(Section(index: 2, header: params["header2"] as? String ?? Self.defaultHeader, names: second, on: on))
    }
    let width: CGFloat = 460
    var y: CGFloat = 16
    let content = FlippedView(frame: .zero)
    content.wantsLayer = true
    content.layer?.backgroundColor = NSColor.white.cgColor
    let heading = Kit.label(title, size: 16, bold: true)
    heading.frame = NSRect(x: 20, y: y, width: width - 40, height: 22)
    content.addSubview(heading)
    y += 34
    for section in sections {
      let header = Kit.label(section.header, size: 13)
      header.lineBreakMode = .byWordWrapping
      header.maximumNumberOfLines = 2
      header.frame = NSRect(x: 20, y: y, width: width - 40, height: 36)
      header.identifier = NSUserInterfaceItemIdentifier("privacy-\(section.index)-header")
      Fixture.shared.controls["privacy-\(section.index)-header"] = header
      content.addSubview(header)
      y += 40
      let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("app"))
      column.width = width - 60
      section.table.addTableColumn(column)
      section.table.headerView = nil
      section.table.rowHeight = Self.rowHeight
      section.table.selectionHighlightStyle = .none
      section.table.dataSource = self
      section.table.delegate = self
      section.table.identifier = NSUserInterfaceItemIdentifier("privacy-\(section.index)-list")
      let height = CGFloat(section.names.count) * (Self.rowHeight + 2) + 4
      section.scroll.frame = NSRect(x: 20, y: y, width: width - 40, height: height)
      section.table.frame = NSRect(x: 0, y: 0, width: width - 44, height: height - 4)
      section.scroll.documentView = section.table
      section.scroll.borderType = .bezelBorder
      section.scroll.hasVerticalScroller = false
      content.addSubview(section.scroll)
      section.table.reloadData()
      // Every row's views exist from the start, so every switch is a target before any scroll.
      for row in 0..<section.names.count { _ = section.table.view(atColumn: 0, row: row, makeIfNecessary: true) }
      y += height + 18
    }
    content.frame = NSRect(x: 0, y: 0, width: width, height: y + 8)
    _ = Windows.open("main", title: title, content: content)
  }

  private func section(of table: NSTableView) -> Section? { sections.first { $0.table === table } }

  func numberOfRows(in tableView: NSTableView) -> Int { section(of: tableView)?.names.count ?? 0 }

  func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
    guard let owner = section(of: tableView), row < owner.names.count else { return nil }
    if let made = owner.switches[row]?.superview { return made }
    let cell = NSTableCellView(frame: NSRect(x: 0, y: 0, width: tableColumn?.width ?? 400, height: Self.rowHeight))
    // The row's text is a plain subview, not the cell's `textField` outlet, so nothing ties it to the switch.
    let name = NSTextField(labelWithString: owner.names[row])
    name.font = NSFont.systemFont(ofSize: 13)
    name.frame = NSRect(x: 8, y: 6, width: (tableColumn?.width ?? 400) - 80, height: 18)
    cell.addSubview(name)
    let toggle = UntitledSwitch(frame: NSRect(x: (tableColumn?.width ?? 400) - 40, y: 5, width: 22, height: 20))
    toggle.setButtonType(.switch)
    toggle.title = ""
    toggle.imagePosition = .imageOnly
    toggle.state = owner.on[row] ? .on : .off
    toggle.target = self
    toggle.action = #selector(switched(_:))
    toggle.tag = owner.index * 100 + row
    cell.addSubview(toggle)
    owner.switches[row] = toggle
    let key = "privacy-\(owner.index)-\(row)"
    toggle.identifier = NSUserInterfaceItemIdentifier(key)
    name.identifier = NSUserInterfaceItemIdentifier("\(key)-name")
    Fixture.shared.controls[key] = toggle
    Fixture.shared.controls["\(key)-name"] = name
    return cell
  }

  @objc func switched(_ sender: NSButton) {
    let index = sender.tag / 100, row = sender.tag % 100
    guard let section = sections.first(where: { $0.index == index }), row < section.names.count else { return }
    section.on[row] = sender.state == .on
    let fact: [String: Any] = ["section": index, "row": row, "name": section.names[row], "on": section.on[row]]
    toggles.append(fact)
    Fixture.shared.record("privacy-toggled", fact)
  }

  static func fields() -> [String: Any] {
    guard Screens.current == task, let screen = shared else { return [:] }
    return ["privacySections": screen.sections.map { section in
              ["index": section.index, "header": section.header,
               "rows": section.names.enumerated().map { ["name": $0.element, "on": section.on[$0.offset]] as [String: Any] }] as [String: Any] },
            "privacyToggles": screen.toggles,
            // The switches' own names, as Accessibility serves them in process - each must be empty (CU-787).
            "privacySwitchNames": screen.sections.flatMap { section in section.switches.sorted { $0.key < $1.key }.map { $0.value }.map { toggle in
              [toggle.accessibilityLabel(), toggle.accessibilityTitle(), toggle.accessibilityHelp(), toggle.title, toggle.cell?.accessibilityLabel(), toggle.cell?.accessibilityTitle(), toggle.cell?.accessibilityHelp()].compactMap { $0 }.joined() } },
            // What Accessibility serves for each switch, in process: role, subrole and value, the roles of its ancestors up
            // to the window (the helper's row context walks these for a named list, CU-763), and the static texts beside
            // it in its own row's cell - the row's app name and nothing else.
            "privacySwitchAX": screen.sections.flatMap { section in section.switches.sorted { $0.key < $1.key }.map { $0.value }.map { switchAX(of: $0) } }]
  }

  /// One switch as Accessibility serves it in process (see `fields`): its element is the button's cell. Ancestors that are
  /// not NSAccessibilityProtocol objects (AppKit's table-cell element) are read through the attribute API.
  static func switchAX(of toggle: NSButton) -> [String: Any] {
    func role(_ node: Any) -> String? {
      if let element = node as? NSAccessibilityProtocol { return element.accessibilityRole()?.rawValue }
      return (node as? NSObject)?.accessibilityAttributeValue(.role) as? String
    }
    func parent(_ node: Any) -> Any? {
      if let element = node as? NSAccessibilityProtocol { return element.accessibilityParent() }
      return (node as? NSObject)?.accessibilityAttributeValue(.parent)
    }
    let element: Any = toggle.cell.map { $0 as Any } ?? toggle
    var ancestors: [String] = []
    var node: Any? = parent(element)
    while let current = node, ancestors.count < 12 {
      let name = role(current) ?? String(describing: type(of: current))
      ancestors.append(name)
      if name == NSAccessibility.Role.window.rawValue { break }
      node = parent(current)
    }
    let texts = (toggle.superview?.subviews ?? []).compactMap { $0 as? NSTextField }.filter { !$0.isEditable }.map { $0.stringValue }
    var value: Any = NSNull()
    if let number = (toggle.cell?.accessibilityValue() as Any?) as? NSNumber { value = number.intValue }
    return ["role": toggle.cell?.accessibilityRole()?.rawValue ?? "", "subrole": toggle.cell?.accessibilitySubrole()?.rawValue ?? "",
            "value": value, "ancestors": ancestors, "cellTexts": texts]
  }

  /// Seam: `privacyToggle: '<target>'` flips that switch through its own action, as a click does.
  static func act(_ step: [String: Any]) -> Bool {
    guard Screens.current == task, let key = step["privacyToggle"] as? String else { return false }
    guard let toggle = Fixture.shared.controls[key] as? NSButton else { return false }
    toggle.state = toggle.state == .on ? .off : .on
    _ = toggle.sendAction(toggle.action, to: toggle.target)
    return true
  }
}
