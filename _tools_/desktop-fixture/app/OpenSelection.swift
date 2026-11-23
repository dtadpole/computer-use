import AppKit

// 'open-selection' (CU-252, CU-269's live rows; cu-coordinator's stand-in for Finder): a file list whose rows carry the
// Accessibility shapes Finder serves - AXFilename and an AXURL leaf in a /tmp sandbox (install.command, Payload.app as a
// package URL with a trailing slash, notes.txt) - so the helper's selectedItems reads names and kinds from it as it
// would from Finder. While the screen is open a File menu holds Open (Command-O) and an Open With submenu naming
// Terminal and TextEdit; Command-Down on the list opens too; two drop targets are titled like app bundles
// (Terminal.app, Payload.app). Nothing is opened, launched or written: the files exist only as strings, and every action
// only records what it would have opened, so a refusal shows as no event.

/// A file row that says what file it shows, as Finder's rows do. CU-252 (cu-verifier's reopen, cu-developer-three's
/// probes 215355Z, 221544Z): the row keeps AppKit's own row role and element - an override of the role made AppKit's
/// table hand the helper no usable rows - and carries the file name and URL; so does its cell, which is what Finder's
/// list rows hold and what the helper's read walks to (a row's descendants, depth 3).
final class SandboxFileRow: NSTableRowView {
  var fileName = ""
  var fileURL: URL?
  override func accessibilityFilename() -> String? { fileName }
  override func accessibilityURL() -> URL? { fileURL }
}

/// A file's cell (AppKit serves it as an AXCell): its text field shows the name; the cell carries the name as its label.
/// Probe 5 (233831Z): AppKit serves an AXCell's label but not its AXFilename or AXURL overrides, so the text field below
/// carries those.
final class SandboxFileCell: NSTableCellView {
  var fileName = ""
  var fileURL: URL?
  override func accessibilityFilename() -> String? { fileName }
  override func accessibilityURL() -> URL? { fileURL }
  override func accessibilityLabel() -> String? { fileName }
}

/// The cell's text field, as in Finder's list rows: it carries the file's AXFilename and AXURL, which the helper's read
/// (a row's descendants, depth 3) finds - probe 4 read the name from the cell's label but no kind; probe 5 read the kind
/// once the text field carried the URL.
final class SandboxFileName: NSTextField {
  var fileName = ""
  var fileURL: URL?
  override func accessibilityFilename() -> String? { fileName }
  override func accessibilityURL() -> URL? { fileURL }
}

/// The list: Command-Down opens the selection, as in Finder.
/// CU-387 (fileOn 'row'): the container a plain name sits in, carrying the row's file as an AX element of its own -
/// measured 10 Nov 08:34Z: AppKit does not surface accessibilityFilename/URL overrides on NSTableCellView or
/// NSTableRowView across processes, but does on an NSView that is itself an accessibility element (as SandboxIcon),
/// so this is the ancestor helper 0.2.67's walk can lend the file from (fileFrom 'ancestor').
final class SandboxFileBox: NSView {
  var fileName = ""
  var fileURL: URL?
  override func isAccessibilityElement() -> Bool { true }
  override func accessibilityRole() -> NSAccessibility.Role? { .group }
  override func accessibilityFilename() -> String? { fileName }
  override func accessibilityURL() -> URL? { fileURL }
}

final class SandboxFileTable: NSTableView {
  var onOpen: ((String) -> Void)?
  override func keyDown(with event: NSEvent) {
    if event.keyCode == 125, event.modifierFlags.intersection([.command, .option, .control, .shift]) == [.command] {
      onOpen?("command-down")
      return
    }
    super.keyDown(with: event)
  }
}

/// An app's icon as a drop target - named like the bundle, with the bundle's file name and URL.
final class AppIconTarget: NSView {
  let bundleName: String
  override var isFlipped: Bool { true }
  init(bundleName: String, frame: NSRect) {
    self.bundleName = bundleName
    super.init(frame: frame)
    registerForDraggedTypes([OpenSelection.dragType])
  }
  required init?(coder: NSCoder) { nil }
  override func isAccessibilityElement() -> Bool { true }
  override func accessibilityRole() -> NSAccessibility.Role? { .image }
  override func accessibilityLabel() -> String? { bundleName }
  override func accessibilityFilename() -> String? { bundleName }
  override func accessibilityURL() -> URL? { URL(string: "file://\(OpenSelection.sandbox)/Apps/\(bundleName)/") }
  override func draw(_ dirtyRect: NSRect) {
    NSColor(calibratedWhite: 0.92, alpha: 1).setFill()
    NSBezierPath(roundedRect: bounds.insetBy(dx: 1, dy: 1), xRadius: 8, yRadius: 8).fill()
    (bundleName as NSString).draw(at: NSPoint(x: 10, y: 12), withAttributes: [.font: NSFont.boldSystemFont(ofSize: 13)])
  }
  override func draggingEntered(_ sender: NSDraggingInfo) -> NSDragOperation { .copy }
  override func draggingUpdated(_ sender: NSDraggingInfo) -> NSDragOperation { .copy }
  override func performDragOperation(_ sender: NSDraggingInfo) -> Bool {
    let names = (sender.draggingPasteboard.pasteboardItems ?? []).compactMap { $0.string(forType: OpenSelection.dragType) }
    guard !names.isEmpty else { return false }
    OpenSelection.shared?.dropped(names, onto: bundleName)
    return true
  }
}

final class OpenSelection: NSObject, NSTableViewDataSource, NSTableViewDelegate {
  static var shared: OpenSelection?
  static let task = "open-selection"
  static let dragType = NSPasteboard.PasteboardType("ai.reflection.cu.fixture.sandbox-file")
  /// The sandbox the rows name. No file is created there: the paths are only strings.
  static let sandbox = "/tmp/cu-fixture-sandbox"
  static let defaultFiles = ["install.command", "Payload.app", "notes.txt"]

  var files: [String] = []
  let table = SandboxFileTable()
  let scroll = NSScrollView(frame: NSRect(x: 20, y: 52, width: 380, height: 110))
  var targets: [AppIconTarget] = []
  let status = NSTextField(labelWithString: "")
  private var installed: [NSMenuItem] = []
  private(set) var opened: [[String: Any]] = []

  static func open(title: String) -> Bool {
    let screen = OpenSelection()
    shared = screen
    screen.build(title: title)
    return true
  }

  /// A file's URL in the sandbox; a package (.app) is a directory, so its URL ends in a slash.
  static func url(_ name: String) -> URL? {
    let path = "\(sandbox)/\(name)" + (name.lowercased().hasSuffix(".app") ? "/" : "")
    return URL(string: "file://" + (path.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? path))
  }

  private func build(title: String) {
    let fixture = Fixture.shared
    files = (Screens.params["files"] as? [String])?.prefix(12).map { $0 } ?? Self.defaultFiles
    let content = FlippedView(frame: NSRect(x: 0, y: 0, width: 420, height: 290))
    content.wantsLayer = true
    content.layer?.backgroundColor = NSColor.white.cgColor
    let heading = Kit.label("Sandbox", size: 16, bold: true)
    heading.frame = NSRect(x: 20, y: 16, width: 380, height: 22)
    content.addSubview(heading)
    let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("file"))
    column.title = "Name"
    column.width = 360
    table.addTableColumn(column)
    table.rowHeight = 24
    table.allowsMultipleSelection = true
    table.dataSource = self
    table.delegate = self
    table.setAccessibilityLabel("Sandbox files")
    table.identifier = NSUserInterfaceItemIdentifier("sandbox-files")
    table.setDraggingSourceOperationMask(.copy, forLocal: true)
    // CU-387: a drop in another process (CU Ledger's zone) is offered a copy too - the non-local mask decides there.
    table.setDraggingSourceOperationMask(.copy, forLocal: false)
    table.onOpen = { [weak self] via in self?.openSelected(via: via, with: nil) }
    scroll.documentView = table
    scroll.borderType = .bezelBorder
    scroll.hasVerticalScroller = true
    content.addSubview(scroll)
    fixture.controls["sandbox-files"] = table
    for (index, name) in ["Terminal.app", "Payload.app"].enumerated() {
      let target = AppIconTarget(bundleName: name, frame: NSRect(x: 20 + CGFloat(index) * 200, y: 180, width: 180, height: 44))
      target.identifier = NSUserInterfaceItemIdentifier(index == 0 ? "terminal-icon" : "payload-icon")
      fixture.controls[target.identifier!.rawValue] = target
      content.addSubview(target)
      targets.append(target)
    }
    status.font = NSFont.systemFont(ofSize: 12)
    status.textColor = .darkGray
    status.frame = NSRect(x: 20, y: 240, width: 380, height: 18)
    content.addSubview(status)
    installMenus()
    let window = Windows.open("main", title: title, content: content)
    AttachUpload.placeAtOrigin(window, content: content)
    window.makeFirstResponder(table)
  }

  func numberOfRows(in tableView: NSTableView) -> Int { files.count }

  func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
    let cell = SandboxFileCell()
    cell.fileName = files[row]
    cell.fileURL = Self.url(files[row])
    // CU-387 (helper 0.2.67's fix a): `fileOn: "row"` gives the name a plain label with no AXFilename/AXURL of its own -
    // only its cell and row carry the file, as some apps' lists do - so a press on the name shows the helper lending the
    // cell's file (fileFrom 'ancestor'). By default the name carries the file itself, as Finder's does.
    let plainName = (Screens.params["fileOn"] as? String) == "row"
    let label: NSTextField
    if plainName {
      label = NSTextField(labelWithString: files[row])
    } else {
      let named = SandboxFileName(labelWithString: files[row])
      named.fileName = files[row]
      named.fileURL = Self.url(files[row])
      label = named
    }
    label.font = NSFont.systemFont(ofSize: 13)
    label.translatesAutoresizingMaskIntoConstraints = false
    // CU-387 (fileOn 'row'): the plain name sits in a box that carries the file as its own AX element (SandboxFileBox).
    let holder: NSView
    if plainName {
      let box = SandboxFileBox()
      box.fileName = files[row]
      box.fileURL = Self.url(files[row])
      box.translatesAutoresizingMaskIntoConstraints = false
      cell.addSubview(box)
      NSLayoutConstraint.activate([box.leadingAnchor.constraint(equalTo: cell.leadingAnchor, constant: 2),
                                   box.trailingAnchor.constraint(equalTo: cell.trailingAnchor, constant: -2),
                                   box.topAnchor.constraint(equalTo: cell.topAnchor),
                                   box.bottomAnchor.constraint(equalTo: cell.bottomAnchor)])
      holder = box
    } else {
      holder = cell
    }
    holder.addSubview(label)
    cell.textField = label
    // CU-387: the name spans the row, so a press anywhere on it lands on the element carrying AXFilename and AXURL, and
    // each row's name is a named target ('sandbox-file-<row>') a live row can aim at instead of guessing a point.
    NSLayoutConstraint.activate([label.leadingAnchor.constraint(equalTo: holder.leadingAnchor, constant: plainName ? 2 : 4),
                                 label.trailingAnchor.constraint(equalTo: holder.trailingAnchor, constant: plainName ? -2 : -4),
                                 label.centerYAnchor.constraint(equalTo: holder.centerYAnchor)])
    Fixture.shared.controls["sandbox-file-\(row)"] = label
    return cell
  }

  func tableView(_ tableView: NSTableView, rowViewForRow row: Int) -> NSTableRowView? {
    let view = SandboxFileRow()
    view.fileName = files[row]
    view.fileURL = Self.url(files[row])
    return view
  }

  func tableView(_ tableView: NSTableView, pasteboardWriterForRow row: Int) -> NSPasteboardWriting? {
    let item = NSPasteboardItem()
    item.setString(files[row], forType: Self.dragType)
    return item
  }

  var selectedNames: [String] { table.selectedRowIndexes.compactMap { files.indices.contains($0) ? files[$0] : nil } }

  // MARK: Menus

  private func installMenus() {
    guard let main = NSApp.mainMenu else { return }
    let file = NSMenu(title: "File")
    let open = NSMenuItem(title: "Open", action: #selector(openChosen(_:)), keyEquivalent: "o")
    open.target = self
    file.addItem(open)
    let openWith = NSMenuItem(title: "Open With", action: nil, keyEquivalent: "")
    let apps = NSMenu(title: "Open With")
    for app in ["Terminal", "TextEdit"] {
      let item = NSMenuItem(title: app, action: #selector(openWithChosen(_:)), keyEquivalent: "")
      item.target = self
      apps.addItem(item)
    }
    openWith.submenu = apps
    file.addItem(openWith)
    let holder = NSMenuItem()
    holder.submenu = file
    // After the app menu, where a File menu sits.
    main.insertItem(holder, at: min(1, main.items.count))
    installed.append(holder)
  }

  static func uninstallMenus() {
    guard let screen = shared, let main = NSApp.mainMenu else { return }
    for item in screen.installed where main.items.contains(item) { main.removeItem(item) }
    screen.installed = []
  }

  @objc func openChosen(_ sender: Any?) { openSelected(via: "menu", with: nil) }
  @objc func openWithChosen(_ sender: NSMenuItem) { openSelected(via: "open-with", with: sender.title) }

  /// What an open would have acted on - recorded, never done.
  func openSelected(via: String, with app: String?) {
    let names = selectedNames
    var fact: [String: Any] = ["via": via, "names": names]
    if let app { fact["with"] = app }
    opened.append(fact)
    Fixture.shared.record("opened", fact)
    status.stringValue = "Would open \(names.count) item(s)\(app.map { " with \($0)" } ?? "") - nothing opened"
  }

  func dropped(_ names: [String], onto bundle: String) {
    let fact: [String: Any] = ["via": "drop", "names": names, "with": bundle]
    opened.append(fact)
    Fixture.shared.record("opened", fact)
    status.stringValue = "Would open \(names.count) item(s) with \(bundle) - nothing opened"
  }

  // MARK: State, Accessibility and seams

  static func fields() -> [String: Any] {
    guard Screens.current == task, let screen = shared else { return [:] }
    return ["sandboxFiles": screen.files, "sandboxSelected": screen.selectedNames, "sandboxOpened": screen.opened]
  }

  /// What Accessibility shows of the selected rows, in process: each row's AXFilename and AXURL - the values the helper's
  /// selectedItems reads across processes.
  static func accessibilitySelection() -> [[String: Any]] {
    guard let screen = shared else { return [] }
    // The selected rows' views are the AXRow elements AppKit serves for a view-based table.
    return screen.table.selectedRowIndexes.compactMap { screen.table.rowView(atRow: $0, makeIfNecessary: true) }.map { row in
      let cell = (row.subviews.first as? SandboxFileCell) ?? (screen.table.view(atColumn: 0, row: screen.table.row(for: row), makeIfNecessary: true) as? SandboxFileCell)
      let name = cell?.textField as? SandboxFileName
      return ["role": row.accessibilityRole()?.rawValue ?? NSNull(), "filename": row.accessibilityFilename() ?? NSNull(), "url": row.accessibilityURL()?.absoluteString ?? NSNull(),
              "cellFilename": cell?.accessibilityFilename() ?? NSNull(), "cellURL": cell?.accessibilityURL()?.absoluteString ?? NSNull(),
              "nameFilename": name?.accessibilityFilename() ?? NSNull(), "nameURL": name?.accessibilityURL()?.absoluteString ?? NSNull(),
              "boxFilename": (cell?.textField?.superview as? SandboxFileBox)?.accessibilityFilename() ?? NSNull()]
    }
  }

  /// Seams, in-process models only: `sandboxSelect [names]` selects those rows; `sandboxOpen 'menu' | 'command-down'`
  /// and `sandboxOpenWith 'Terminal'` run what the menu or key would; `sandboxDrop {names, onto}` what a drop would.
  static func act(_ step: [String: Any]) -> Bool {
    guard Screens.current == task, let screen = shared else { return false }
    if let names = step["sandboxSelect"] as? [String] {
      let indexes = IndexSet(names.compactMap { screen.files.firstIndex(of: $0) })
      screen.table.selectRowIndexes(indexes, byExtendingSelection: false)
      screen.table.window?.makeFirstResponder(screen.table)
      return true
    }
    if let via = step["sandboxOpen"] as? String { screen.openSelected(via: via, with: nil); return true }
    if let app = step["sandboxOpenWith"] as? String { screen.openSelected(via: "open-with", with: app); return true }
    if let drop = step["sandboxDrop"] as? [String: Any], let names = drop["names"] as? [String], let onto = drop["onto"] as? String {
      screen.dropped(names, onto: onto)
      return true
    }
    return false
  }
}
