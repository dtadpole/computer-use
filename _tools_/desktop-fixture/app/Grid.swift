import AppKit

// S1 grid sheet (CU-66, CU-63): a 300-row, A-Z sheet that shows about 19 rows by 7 columns, so a far cell needs both
// vertical and horizontal scrolling, and a 12-row entry task takes some 40-50 steps. The header row and the row
// numbers stay put while the cells scroll. Cell values live in the model, not in the views: a table reuses its cell
// views as it scrolls, so a value is never lost when its view leaves the screen.

/// A cell's text field, so `fields()` reports cells from the model (touched and seeded ones) instead of every visible
/// empty view.
final class GridCellField: NSTextField {}

/// Clicking a cell starts editing it at once, as in a spreadsheet, rather than first selecting its row.
final class GridTable: NSTableView {
  override func validateProposedFirstResponder(_ responder: NSResponder, for event: NSEvent?) -> Bool { true }
}

final class Grid: NSObject, NSTableViewDataSource, NSTableViewDelegate, NSTextFieldDelegate {
  static var shared: Grid?
  static let columns = (0..<26).map { String(UnicodeScalar(UInt8(65 + $0))) }
  static let cellSize = CGSize(width: 72, height: 20)
  static let task = "grid-sheet"

  var rows = 300
  var values: [String: String] = [:]
  /// chain-rows (cu-researcher): with `codeSeed`, column D is read-only and computed - D<r> = chainCode(A<r>, B<r>,
  /// codeSeed), shown once A<r> and B<r> both hold a committed value. It records nothing and is not in the facts.
  var codeSeed: String?
  static let codeColumn = 3

  /// FNV-1a 32-bit over the UTF-8 bytes of "A|B|seed", then four symbols of a 32-letter alphabet from bits 0-4, 5-9,
  /// 10-14 and 15-19, lowest first (tasks.mjs chainCode; test vector START, 1, s1 -> WM4N).
  static func chainCode(_ a: String, _ b: String, _ seed: String) -> String {
    var hash: UInt32 = 2_166_136_261
    for byte in Array("\(a)|\(b)|\(seed)".utf8) { hash = (hash ^ UInt32(byte)) &* 16_777_619 }
    let alphabet = Array("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")
    return String((0..<4).map { alphabet[Int((hash >> (5 * UInt32($0))) & 31)] })
  }

  /// The computed D<r> (0-based row), or nil while A or B is still empty.
  func computed(row: Int) -> String? {
    guard let seed = codeSeed, let a = values[Self.key(column: 0, row: row)], let b = values[Self.key(column: 1, row: row)], !a.isEmpty, !b.isEmpty else { return nil }
    return Self.chainCode(a, b, seed)
  }
  let table = GridTable()
  let numbers = NSTableView()
  let scroll = NSScrollView()
  let numberScroll = NSScrollView()
  /// Which cell each live cell view shows now, so a reused view's old target name is dropped.
  var keyOf: [ObjectIdentifier: String] = [:]

  static func key(column: Int, row: Int) -> String { "\(columns[column])\(row + 1)" }

  /// "Q237" -> (column 16, row 236), or nil.
  static func parse(_ cell: String) -> (column: Int, row: Int)? {
    let letters = cell.prefix { $0.isLetter }.uppercased()
    guard letters.count == 1, let column = columns.firstIndex(of: letters), let number = Int(cell.dropFirst(letters.count)), number >= 1 else { return nil }
    return (column, number - 1)
  }

  static func open(_ task: String, title: String) -> Bool {
    guard task == Self.task else { return Files.open(task, title: title) }
    let grid = Grid()
    shared = grid
    grid.build(title: title)
    return true
  }

  private func build(title: String) {
    let fixture = Fixture.shared
    let params = Screens.params
    codeSeed = (params["codeSeed"] as? String).flatMap { $0.isEmpty ? nil : $0 }
    for (cell, value) in params["seed"] as? [String: Any] ?? [:] {
      if Self.parse(cell) != nil, let text = value as? String { values[cell.uppercased()] = text }
    }
    let content = FlippedView(frame: NSRect(x: 0, y: 0, width: 700, height: 460))
    content.wantsLayer = true
    content.layer?.backgroundColor = NSColor.white.cgColor

    // Row numbers: one column in their own scroll view, kept level with the cells' vertical scroll.
    let numberColumn = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("row"))
    numberColumn.title = ""
    numberColumn.width = 40
    numberColumn.minWidth = 40
    numbers.addTableColumn(numberColumn)
    numbers.headerView = nil
    numbers.columnAutoresizingStyle = .noColumnAutoresizing
    numbers.rowHeight = Self.cellSize.height
    numbers.intercellSpacing = .zero
    numbers.dataSource = self
    numbers.delegate = self
    numbers.selectionHighlightStyle = .none
    numbers.gridStyleMask = [.solidHorizontalGridLineMask]
    numberScroll.documentView = numbers
    numberScroll.hasVerticalScroller = false
    numberScroll.hasHorizontalScroller = false
    content.addSubview(numberScroll)

    for letter in Self.columns {
      let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier(letter))
      column.title = letter
      column.width = Self.cellSize.width
      column.minWidth = Self.cellSize.width
      column.maxWidth = Self.cellSize.width
      column.headerCell.alignment = .center
      table.addTableColumn(column)
    }
    table.rowHeight = Self.cellSize.height
    table.intercellSpacing = .zero
    table.gridStyleMask = [.solidHorizontalGridLineMask, .solidVerticalGridLineMask]
    table.selectionHighlightStyle = .none
    table.allowsColumnReordering = false
    table.allowsColumnResizing = false
    table.usesAutomaticRowHeights = false
    table.dataSource = self
    table.delegate = self
    scroll.documentView = table
    scroll.hasVerticalScroller = true
    scroll.hasHorizontalScroller = true
    scroll.autohidesScrollers = false
    // Scroll bars always shown and beside the cells, never over them: a model sees where it is in the sheet.
    scroll.scrollerStyle = .legacy
    scroll.frame = NSRect(x: 52, y: 12, width: 520, height: 404)
    content.addSubview(scroll)
    // The row numbers start below the column header and end above the horizontal scroller.
    let header = table.headerView?.frame.height ?? 23
    let scroller = NSScroller.scrollerWidth(for: .regular, scrollerStyle: .legacy)
    numberScroll.frame = NSRect(x: 12, y: 12 + header, width: 40, height: 404 - header - scroller)
    scroll.contentView.postsBoundsChangedNotifications = true
    NotificationCenter.default.addObserver(self, selector: #selector(scrolled(_:)), name: NSView.boundsDidChangeNotification, object: scroll.contentView)

    let add = NSButton(title: "Add row", target: fixture, action: #selector(Fixture.pressed(_:)))
    add.identifier = NSUserInterfaceItemIdentifier("add-row")
    add.bezelStyle = .rounded
    add.frame = NSRect(x: 52, y: 422, width: 100, height: 28)
    fixture.controls["add-row"] = add
    content.addSubview(add)

    let noteHeading = Kit.label("Note", size: 13, bold: true)
    noteHeading.frame = NSRect(x: 584, y: 12, width: 108, height: 18)
    content.addSubview(noteHeading)
    let note = NSTextField(wrappingLabelWithString: params["note"] as? String ?? "")
    note.font = NSFont.monospacedSystemFont(ofSize: 11, weight: .regular)
    note.textColor = .black
    note.identifier = NSUserInterfaceItemIdentifier("note")
    note.frame = NSRect(x: 584, y: 34, width: 108, height: 380)
    fixture.controls["note"] = note
    content.addSubview(note)

    _ = Windows.open("main", title: title, content: content)
    realize()
  }

  /// The cell views on screen exist (an offscreen window is never drawn, so its table would make none), and the
  /// row numbers follow the cells' scroll.
  func realize() {
    scroll.layoutSubtreeIfNeeded()
    let visible = table.visibleRect
    let rowRange = table.rows(in: visible)
    let columnIndexes = table.columnIndexes(in: visible)
    for row in rowRange.location..<(rowRange.location + rowRange.length) {
      for column in columnIndexes { _ = table.view(atColumn: column, row: row, makeIfNecessary: true) }
    }
    syncNumbers()
  }

  @objc func scrolled(_ note: Notification) {
    syncNumbers()
    // CU-90: one 'scrolled' {topRow, leftCol} per settled scroll (150 ms without movement), when the view moved.
    settle?.invalidate()
    settle = Timer.scheduledTimer(withTimeInterval: 0.15, repeats: false) { [weak self] _ in self?.recordScrolled() }
  }

  /// The settled place, recorded when it differs from the last one. The oracle's scrollTo calls it at once (its state
  /// read follows with no run-loop time); a person's scroll waits for the 150 ms settle.
  func recordScrolled() {
    settle?.invalidate()
    settle = nil
    let place = topLeft()
    if place.row != lastTopLeft.row || place.column != lastTopLeft.column {
      lastTopLeft = place
      Fixture.shared.record("scrolled", ["topRow": place.row, "leftCol": place.column])
    }
  }

  private var settle: Timer?
  private var lastTopLeft: (row: Int, column: String) = (1, "A")

  /// The row at the top of the cells' area (1-based, under the column header) and the column at its left edge.
  func topLeft() -> (row: Int, column: String) {
    let clip = scroll.contentView
    let point = NSPoint(x: clip.bounds.minX + 1, y: clip.bounds.minY + clip.contentInsets.top + 1)
    let row = max(0, table.row(at: point))
    let column = max(0, table.column(at: point))
    return (row + 1, column < Self.columns.count ? Self.columns[column] : "A")
  }

  /// The row numbers show the same rows as the cells: the table's first visible row at the top.
  func syncNumbers() {
    // The cells' clip view starts under the column header (its top content inset); the numbers have no header.
    let clip = scroll.contentView
    numberScroll.contentView.scroll(to: NSPoint(x: 0, y: clip.bounds.origin.y + clip.contentInsets.top))
    numberScroll.reflectScrolledClipView(numberScroll.contentView)
  }

  // MARK: Table

  func numberOfRows(in tableView: NSTableView) -> Int { rows }

  func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
    guard let tableColumn else { return nil }
    if tableView === numbers {
      let label = tableView.makeView(withIdentifier: NSUserInterfaceItemIdentifier("number"), owner: nil) as? NSTextField ?? {
        let made = NSTextField(labelWithString: "")
        made.frame = NSRect(x: 0, y: 0, width: 40, height: Self.cellSize.height)
        made.autoresizingMask = [.width]
        made.identifier = NSUserInterfaceItemIdentifier("number")
        made.alignment = .left
        made.font = NSFont.systemFont(ofSize: 11)
        made.textColor = .darkGray
        return made
      }()
      label.stringValue = "\(row + 1)"
      return label
    }
    guard let column = Self.columns.firstIndex(of: tableColumn.identifier.rawValue) else { return nil }
    let field = tableView.makeView(withIdentifier: NSUserInterfaceItemIdentifier("cell"), owner: nil) as? GridCellField ?? {
      let made = GridCellField(string: "")
      made.identifier = NSUserInterfaceItemIdentifier("cell")
      made.isBordered = false
      made.drawsBackground = false
      made.isEditable = true
      made.isSelectable = true
      made.font = NSFont.systemFont(ofSize: 12)
      made.textColor = .black
      made.focusRingType = .exterior
      made.lineBreakMode = .byClipping
      made.cell?.usesSingleLineMode = true
      made.delegate = self
      return made
    }()
    let key = Self.key(column: column, row: row)
    let fixture = Fixture.shared
    if let old = keyOf[ObjectIdentifier(field)], fixture.controls["cell-\(old)"] === field { fixture.controls["cell-\(old)"] = nil }
    keyOf[ObjectIdentifier(field)] = key
    let isCode = codeSeed != nil && column == Self.codeColumn
    field.isEditable = !isCode
    field.textColor = isCode ? NSColor(calibratedRed: 0.1, green: 0.3, blue: 0.6, alpha: 1) : .black
    field.stringValue = isCode ? computed(row: row) ?? "" : values[key] ?? ""
    fixture.controls["cell-\(key)"] = field
    return field
  }

  /// A cell view that leaves the screen no longer names a target.
  func tableView(_ tableView: NSTableView, didRemove rowView: NSTableRowView, forRow row: Int) {
    guard tableView === table else { return }
    for index in 0..<rowView.numberOfColumns {
      guard let field = rowView.view(atColumn: index) as? GridCellField, let key = keyOf[ObjectIdentifier(field)] else { continue }
      if Fixture.shared.controls["cell-\(key)"] === field { Fixture.shared.controls["cell-\(key)"] = nil }
    }
  }

  // MARK: Editing

  /// A committed edit: the value goes into the model, and a change records `edited`. Return moves down the column,
  /// Tab right, Shift-Tab left.
  func controlTextDidEndEditing(_ note: Notification) {
    guard let field = note.object as? GridCellField else { return }
    let movement = (note.userInfo?["NSTextMovement"] as? NSNumber)?.intValue ?? 0
    commit(field, movement: movement)
  }

  func commit(_ field: GridCellField, movement: Int) {
    guard let key = keyOf[ObjectIdentifier(field)], let place = Self.parse(key) else { return }
    set(key, field.stringValue)
    var next: (column: Int, row: Int)?
    switch movement {
    case NSTextMovement.return.rawValue: next = (place.column, place.row + 1)
    case NSTextMovement.tab.rawValue: next = (place.column + 1, place.row)
    case NSTextMovement.backtab.rawValue: next = (place.column - 1, place.row)
    default: next = nil
    }
    if let next, next.column >= 0, next.column < Self.columns.count, next.row < rows {
      DispatchQueue.main.async { [weak self] in self?.edit(column: next.column, row: next.row) }
    }
  }

  func edit(column: Int, row: Int) {
    table.scrollRowToVisible(row)
    table.scrollColumnToVisible(column)
    realize()
    table.editColumn(column, row: row, with: nil, select: true)
  }

  /// The model's value for a cell; a change is recorded once. A computed D cell takes no value.
  func set(_ key: String, _ value: String) {
    if codeSeed != nil, Self.parse(key)?.column == Self.codeColumn { return }
    let before = values[key] ?? ""
    guard value != before else { return }
    values[key] = value
    Fixture.shared.record("edited", ["cell": key, "value": value])
    if let place = Self.parse(key), place.row < rows, let field = table.view(atColumn: place.column, row: place.row, makeIfNecessary: false) as? GridCellField, field.currentEditor() == nil {
      field.stringValue = value
    }
    // The row's code follows a committed A or B.
    if codeSeed != nil, let place = Self.parse(key), place.column <= 1, place.row < rows,
       let code = table.view(atColumn: Self.codeColumn, row: place.row, makeIfNecessary: false) as? GridCellField {
      code.stringValue = computed(row: place.row) ?? ""
    }
  }

  // MARK: Facts and seams

  /// Whether a cell lies wholly inside the grid's visible area - below the column header, above the scroll bar - so a
  /// target is always clickable where it is reported and never overlaps another control (the table builds views for
  /// every column of a row, and a half-shown last row would sit against 'Add row').
  static func isShown(_ field: GridCellField) -> Bool {
    guard let grid = shared, field.window != nil else { return false }
    let clip = grid.scroll.contentView
    let insets = clip.contentInsets
    let visible = NSRect(x: clip.bounds.minX, y: clip.bounds.minY + insets.top, width: clip.bounds.width - insets.left - insets.right,
                         height: clip.bounds.height - insets.top - insets.bottom).insetBy(dx: -0.5, dy: -0.5)
    return visible.contains(field.convert(field.bounds, to: clip))
  }

  /// Every cell that holds a value: touched and seeded ones.
  static func fields() -> [String: Any] {
    guard Screens.current == task, let grid = shared else { return [:] }
    return grid.values.filter { !$0.value.isEmpty }
  }

  /// What a cell shows now and whether it takes typing (test seam: the channel's `gridShown`), so a test reads the
  /// display, not the model.
  static func shown(_ cell: String) -> (text: String, editable: Bool)? {
    guard let grid = shared, let place = parse(cell), let field = grid.table.view(atColumn: place.column, row: place.row, makeIfNecessary: false) as? GridCellField else { return nil }
    return (field.stringValue, field.isEditable)
  }

  static func press(_ name: String) -> Bool {
    guard Screens.current == task, let grid = shared else { return Files.press(name) }
    guard name == "add-row" else { return false }
    grid.rows += 1
    grid.table.noteNumberOfRowsChanged()
    grid.numbers.noteNumberOfRowsChanged()
    Fixture.shared.record("row-added", ["row": grid.rows])
    return true
  }

  /// Oracle seams: `scrollTo {row, col}` brings a cell into view; `setCell {cell, value}` edits through the model as a
  /// commit would; `commitCell {cell, text, movement}` runs a visible cell's commit path ('return', 'tab', 'backtab').
  static func act(_ step: [String: Any]) -> Bool {
    guard Screens.current == task, let grid = shared else { return Files.act(step) }
    if let target = step["scrollTo"] as? [String: Any], let row = (target["row"] as? NSNumber)?.intValue, let letter = target["col"] as? String,
       let column = columns.firstIndex(of: letter.uppercased()), row >= 1, row <= grid.rows {
      grid.table.scrollRowToVisible(row - 1)
      grid.table.scrollColumnToVisible(column)
      grid.realize()
      grid.recordScrolled()
      return true
    }
    if let edit = step["setCell"] as? [String: Any], let cell = edit["cell"] as? String, let place = parse(cell), place.row < grid.rows {
      grid.set(key(column: place.column, row: place.row), edit["value"] as? String ?? "")
      return true
    }
    if let edit = step["commitCell"] as? [String: Any], let cell = edit["cell"] as? String, let field = Fixture.shared.controls["cell-\(cell.uppercased())"] as? GridCellField {
      field.stringValue = edit["text"] as? String ?? ""
      let movement: NSTextMovement = edit["movement"] as? String == "return" ? .return : edit["movement"] as? String == "tab" ? .tab : edit["movement"] as? String == "backtab" ? .backtab : .other
      grid.commit(field, movement: movement.rawValue)
      return true
    }
    return false
  }
}
