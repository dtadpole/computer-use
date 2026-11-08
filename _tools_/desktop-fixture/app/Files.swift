import AppKit

// S6 file browser (CU-66, CU-64): a list of files and four folders. Selection is the table's own, so the modifier
// rules are AppKit's: click selects one, Shift-click extends a range, Command-click toggles. Dragging the selection
// onto a folder moves it; with Option held the system narrows the drag to a copy and shows the + cursor. The files are
// entries in the fixture's model, not files on disk: nothing outside the window changes.

/// A file's row: a target while it is wholly shown.
final class FileRowView: NSTableRowView {}

/// A folder that takes dropped files.
final class FolderView: NSView {
  let name: String
  var contents: [String] = []
  var highlighted = false { didSet { needsDisplay = true } }
  override var isFlipped: Bool { true }
  // CU-137: a named folder (a drop target) - not the bare window.
  override func isAccessibilityElement() -> Bool { true }
  override func accessibilityRole() -> NSAccessibility.Role? { .group }
  override func accessibilityRoleDescription() -> String? { "folder" }
  override func accessibilityLabel() -> String? { "\(name) folder" }

  init(name: String, frame: NSRect) {
    self.name = name
    super.init(frame: frame)
    registerForDraggedTypes([Files.dragType])
  }
  required init?(coder: NSCoder) { nil }

  override func draw(_ dirtyRect: NSRect) {
    (highlighted ? NSColor(calibratedRed: 0.78, green: 0.86, blue: 1, alpha: 1) : NSColor(calibratedWhite: 0.93, alpha: 1)).setFill()
    NSBezierPath(roundedRect: bounds.insetBy(dx: 1, dy: 1), xRadius: 6, yRadius: 6).fill()
    ("\u{1F4C1} \(name)" as NSString).draw(at: NSPoint(x: 12, y: 10), withAttributes: [.font: NSFont.boldSystemFont(ofSize: 14)])
    ("\(contents.count) file\(contents.count == 1 ? "" : "s")" as NSString).draw(at: NSPoint(x: 12, y: 34), withAttributes: [.font: NSFont.systemFont(ofSize: 12), .foregroundColor: NSColor.darkGray])
  }

  override func draggingEntered(_ sender: NSDraggingInfo) -> NSDragOperation {
    highlighted = true
    return Files.operation(for: sender.draggingSourceOperationMask)
  }
  override func draggingUpdated(_ sender: NSDraggingInfo) -> NSDragOperation { Files.operation(for: sender.draggingSourceOperationMask) }
  override func draggingExited(_ sender: NSDraggingInfo?) { highlighted = false }

  override func performDragOperation(_ sender: NSDraggingInfo) -> Bool {
    highlighted = false
    let names = (sender.draggingPasteboard.pasteboardItems ?? []).compactMap { $0.string(forType: Files.dragType) }
    guard let files = Files.shared, !names.isEmpty else { return false }
    files.drop(names, into: self, copy: Files.operation(for: sender.draggingSourceOperationMask) == .copy)
    return true
  }
}

final class Files: NSObject, NSTableViewDataSource, NSTableViewDelegate {
  static var shared: Files?
  static let task = "file-browser"
  static let dragType = NSPasteboard.PasteboardType("ai.reflection.cu.fixture.file")
  static let defaultFolders = ["Archive", "Q3", "Drafts", "Shared"]

  var files: [(name: String, size: String)] = []
  var folders: [FolderView] = []
  let table = NSTableView()
  let scroll = NSScrollView()

  /// The drop's operation from the drag's source mask: Option narrows it to copy; otherwise a move.
  static func operation(for mask: NSDragOperation) -> NSDragOperation {
    if mask.contains(.move) { return .move }
    return mask.contains(.copy) ? .copy : []
  }

  /// `files`: names or {name, size}; without it, 300 numbered documents.
  static func list(_ params: [String: Any]) -> [(name: String, size: String)] {
    if let given = params["files"] as? [Any], !given.isEmpty {
      return given.compactMap { item in
        if let name = item as? String { return (name, "") }
        if let object = item as? [String: Any], let name = object["name"] as? String { return (name, object["size"] as? String ?? "") }
        return nil
      }
    }
    return (1...300).map { (String(format: "doc-%03d.txt", $0), "\(($0 * 37) % 900 + 12) KB") }
  }

  static func open(_ task: String, title: String) -> Bool {
    guard task == Self.task else { return Hold.open(task, title: title) }
    let browser = Files()
    shared = browser
    browser.build(title: title)
    return true
  }

  private func build(title: String) {
    let fixture = Fixture.shared
    files = Self.list(Screens.params)
    let content = FlippedView(frame: NSRect(x: 0, y: 0, width: 700, height: 460))
    content.wantsLayer = true
    content.layer?.backgroundColor = NSColor.white.cgColor

    for (identifier, title, width) in [("name", "Name", 280.0), ("size", "Size", 100.0)] {
      let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier(identifier))
      column.title = title
      column.width = width
      table.addTableColumn(column)
    }
    table.rowHeight = 20
    table.allowsMultipleSelection = true
    table.allowsEmptySelection = true
    table.usesAlternatingRowBackgroundColors = true
    table.dataSource = self
    table.delegate = self
    table.setDraggingSourceOperationMask([.move, .copy], forLocal: true)
    scroll.documentView = table
    scroll.hasVerticalScroller = true
    scroll.autohidesScrollers = false
    scroll.scrollerStyle = .legacy
    scroll.frame = NSRect(x: 12, y: 12, width: 440, height: 436)
    content.addSubview(scroll)
    scroll.contentView.postsBoundsChangedNotifications = true
    NotificationCenter.default.addObserver(self, selector: #selector(scrolled(_:)), name: NSView.boundsDidChangeNotification, object: scroll.contentView)

    let names = (Screens.params["folders"] as? [String]).flatMap { $0.isEmpty ? nil : $0 } ?? Self.defaultFolders
    for (index, name) in names.prefix(6).enumerated() {
      let folder = FolderView(name: name, frame: NSRect(x: 470, y: 12 + CGFloat(index) * 100, width: 218, height: 88))
      folder.identifier = NSUserInterfaceItemIdentifier("folder-\(name)")
      fixture.controls["folder-\(name)"] = folder
      folders.append(folder)
      content.addSubview(folder)
    }
    _ = Windows.open("main", title: title, content: content)
    realize()
  }

  /// The rows on screen exist (an offscreen window is never drawn, so its table would make none) and name their
  /// targets; rows that left the screen no longer do.
  func realize() {
    scroll.layoutSubtreeIfNeeded()
    let fixture = Fixture.shared
    var current: [String: NSView] = [:]
    let range = table.rows(in: table.visibleRect)
    for row in range.location..<(range.location + range.length) where row < files.count {
      if let view = table.rowView(atRow: row, makeIfNecessary: true) { current["file-\(files[row].name)"] = view }
    }
    for (name, view) in fixture.controls where view is FileRowView && current[name] !== view { fixture.controls[name] = nil }
    for (name, view) in current { fixture.controls[name] = view }
  }

  @objc func scrolled(_ note: Notification) { realize() }

  // MARK: Table

  func numberOfRows(in tableView: NSTableView) -> Int { files.count }

  func tableView(_ tableView: NSTableView, rowViewForRow row: Int) -> NSTableRowView? { FileRowView() }

  func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
    guard let tableColumn, row < files.count else { return nil }
    let label = NSTextField(labelWithString: tableColumn.identifier.rawValue == "name" ? files[row].name : files[row].size)
    label.font = NSFont.systemFont(ofSize: 12)
    label.lineBreakMode = .byTruncatingTail
    return label
  }

  func tableView(_ tableView: NSTableView, pasteboardWriterForRow row: Int) -> NSPasteboardWriting? {
    guard row < files.count else { return nil }
    let item = NSPasteboardItem()
    item.setString(files[row].name, forType: Self.dragType)
    return item
  }

  func tableViewSelectionDidChange(_ notification: Notification) {
    Fixture.shared.record("selected", ["files": selection()])
  }

  /// The selected files, in list order.
  func selection() -> [String] { table.selectedRowIndexes.filter { $0 < files.count }.map { files[$0].name } }

  // MARK: Dropping

  /// A drop onto a folder: a copy keeps the files in the list; a move takes them out. Files in list order.
  func drop(_ names: [String], into folder: FolderView, copy: Bool) {
    let order = Dictionary(uniqueKeysWithValues: files.enumerated().map { ($1.name, $0) })
    let sorted = names.filter { order[$0] != nil }.sorted { order[$0]! < order[$1]! }
    guard !sorted.isEmpty else { return }
    folder.contents += sorted
    folder.needsDisplay = true
    Fixture.shared.record(copy ? "copied" : "moved", ["files": sorted, "folder": folder.name])
    if !copy {
      let gone = Set(sorted)
      for (name, view) in Fixture.shared.controls where view is FileRowView && gone.contains(String(name.dropFirst("file-".count))) { Fixture.shared.controls[name] = nil }
      files.removeAll { gone.contains($0.name) }
      table.deselectAll(nil)
      table.reloadData()
      realize()
    }
  }

  // MARK: Facts and seams

  /// Whether a row lies wholly inside the list's visible height, below its header (a row may be wider than the list).
  static func isShown(_ row: FileRowView) -> Bool {
    guard let browser = shared, row.window != nil else { return false }
    let clip = browser.scroll.contentView
    let frame = row.convert(row.bounds, to: clip)
    let top = clip.bounds.minY + clip.contentInsets.top - 0.5
    let bottom = clip.bounds.maxY - clip.contentInsets.bottom + 0.5
    return frame.minY >= top && frame.maxY <= bottom
  }

  /// The selection and each folder's contents.
  static func fields() -> [String: Any] {
    guard Screens.current == task, let browser = shared else { return [:] }
    var out: [String: Any] = ["selection": browser.selection(), "fileCount": browser.files.count]
    for folder in browser.folders { out["folder-\(folder.name)"] = folder.contents }
    return out
  }

  static func press(_ name: String) -> Bool { Mail.press(name) }

  /// Oracle seams: `select [names]` sets the selection (recorded like a click); `drop {folder, copy}` drops the current
  /// selection on a folder; `scrollTo name` brings a file's row into view.
  static func act(_ step: [String: Any]) -> Bool {
    guard Screens.current == task, let browser = shared else { return Hold.act(step) }
    if let names = step["select"] as? [String] {
      let wanted = Set(names)
      browser.table.selectRowIndexes(IndexSet(browser.files.indices.filter { wanted.contains(browser.files[$0].name) }), byExtendingSelection: false)
      return true
    }
    if let drop = step["drop"] as? [String: Any], let name = drop["folder"] as? String, let folder = browser.folders.first(where: { $0.name == name }) {
      browser.drop(browser.selection(), into: folder, copy: drop["copy"] as? Bool ?? false)
      return true
    }
    if let name = step["scrollTo"] as? String, let row = browser.files.firstIndex(where: { $0.name == name }) {
      browser.table.scrollRowToVisible(row)
      browser.realize()
      return true
    }
    return false
  }
}
