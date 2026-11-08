import AppKit

// CU-90's nested-scroll item (cu-researcher's 'invoice-page'): a page taller than the window holds, below the fold, an
// 'Invoices' list that scrolls on its own. The row a task names is reached by scrolling the page to the list and then
// the list to the row - two scroll views, one inside the other. Each settled scroll records which view moved and where
// it stopped, so a judge can measure overshoot; a double-click on a row opens it.

/// A row of the inner list; a target while wholly shown in both the list and the page.
final class InvoiceRowView: NSTableRowView {}

final class Invoice: NSObject, NSTableViewDataSource, NSTableViewDelegate {
  static var shared: Invoice?
  static let task = "invoice-page"
  static let pageHeight: CGFloat = 1100
  static let listTop: CGFloat = 590
  static let listHeight: CGFloat = 200

  let page = NSScrollView()
  let list = NSScrollView()
  let table = NSTableView()
  var items: [(id: String, customer: String, amount: String)] = []
  private var settle: [String: Timer] = [:]
  private var lastOffset: [String: Int] = [:]

  static func open(_ task: String, title: String) -> Bool {
    guard task == Self.task else { return HoverChart.open(task, title: title) }
    let invoice = Invoice()
    shared = invoice
    invoice.build(title: title)
    return true
  }

  /// inv-01..inv-NN (params.count, default 40), with a customer and an amount that follow from the number.
  static func list(_ params: [String: Any]) -> [(id: String, customer: String, amount: String)] {
    let count = max(1, min(200, (params["count"] as? NSNumber)?.intValue ?? 40))
    let customers = ["Acme Ltd", "Brightline", "Copperfield", "Dunmore & Co", "Elmstead", "Fairhaven"]
    return (1...count).map { number in
      let id = String(format: "inv-%02d", number)
      let cents = (number * 7919) % 90000 + 10000
      return (id, customers[number % customers.count], String(format: "%d.%02d", cents / 100, cents % 100))
    }
  }

  private func build(title: String) {
    let fixture = Fixture.shared
    items = Self.list(Screens.params)
    let width: CGFloat = 520
    let content = FlippedView(frame: NSRect(x: 0, y: 0, width: width, height: 420))
    content.wantsLayer = true
    content.layer?.backgroundColor = NSColor.white.cgColor

    let document = FlippedView(frame: NSRect(x: 0, y: 0, width: width - 16, height: Self.pageHeight))
    func text(_ string: String, _ y: CGFloat, _ height: CGFloat, size: CGFloat = 12, bold: Bool = false) {
      let label = NSTextField(wrappingLabelWithString: string)
      label.font = bold ? NSFont.boldSystemFont(ofSize: size) : NSFont.systemFont(ofSize: size)
      label.textColor = .black
      label.frame = NSRect(x: 20, y: y, width: width - 56, height: height)
      document.addSubview(label)
    }
    text("Northwind Supplies - account overview", 20, 26, size: 18, bold: true)
    text("Account 4471-0932 · billing contact: accounts payable", 52, 18)
    let paragraphs = [
      "This page brings together the account's details, its standing orders and every invoice issued this year. Amounts are in the account's currency and include tax.",
      "Standing orders renew on the first working day of each month. Changes made before the 20th apply from the next month; later changes apply a month after that.",
      "Credit terms are 30 days from the invoice date. Disputed lines are held, not cancelled, until the dispute is closed, and the rest of the invoice stays due.",
      "Delivery notes are matched to invoices automatically. A note that matches no invoice is listed under Unmatched for a week before it is raised with the depot.",
    ]
    for (index, paragraph) in paragraphs.enumerated() { text(paragraph, 92 + CGFloat(index) * 110, 96) }
    text("Invoices", Self.listTop - 52, 22, size: 15, bold: true)
    // Column labels sit above the list as plain text: a table header is translucent on this macOS, and rows scrolled
    // under it would show through.
    // At the table's own column starts (bezel, intercell spacing and cell inset included).
    for (heading, x) in [("Invoice", 27.0), ("Customer", 154.0), ("Amount", 361.0)] {
      let label = NSTextField(labelWithString: heading)
      label.font = NSFont.boldSystemFont(ofSize: 11)
      label.textColor = .darkGray
      label.frame = NSRect(x: CGFloat(x), y: Self.listTop - 20, width: 120, height: 16)
      document.addSubview(label)
    }

    for (identifier, heading, columnWidth) in [("id", "Invoice", 110.0), ("customer", "Customer", 190.0), ("amount", "Amount", 110.0)] {
      let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier(identifier))
      column.title = heading
      column.width = columnWidth
      table.addTableColumn(column)
    }
    table.rowHeight = 20
    table.headerView = nil
    table.usesAlternatingRowBackgroundColors = true
    table.dataSource = self
    table.delegate = self
    table.target = self
    table.doubleAction = #selector(doubleClicked(_:))
    list.documentView = table
    list.hasVerticalScroller = true
    list.autohidesScrollers = false
    list.scrollerStyle = .legacy
    list.borderType = .bezelBorder
    list.frame = NSRect(x: 20, y: Self.listTop, width: 440, height: Self.listHeight)
    list.identifier = NSUserInterfaceItemIdentifier("list")
    document.addSubview(list)
    fixture.controls["list"] = list

    text("Payment terms", Self.listTop + Self.listHeight + 30, 20, size: 15, bold: true)
    text("Pay by bank transfer to the account shown on each invoice, quoting the invoice number. Card payments are taken by phone on weekdays. Statements are sent on the last working day of the month.", Self.listTop + Self.listHeight + 58, 80)
    text("Northwind Supplies · 12 Harbour Road · Registered in England No. 0442187", Self.pageHeight - 60, 18, size: 11)

    page.documentView = document
    page.hasVerticalScroller = true
    page.autohidesScrollers = false
    page.scrollerStyle = .legacy
    page.frame = NSRect(x: 0, y: 0, width: width, height: 420)
    page.identifier = NSUserInterfaceItemIdentifier("page")
    content.addSubview(page)
    fixture.controls["page"] = page

    for (name, scroll) in [("page", page), ("list", list)] {
      scroll.contentView.postsBoundsChangedNotifications = true
      lastOffset[name] = 0
      NotificationCenter.default.addObserver(self, selector: #selector(scrolled(_:)), name: NSView.boundsDidChangeNotification, object: scroll.contentView)
    }
    _ = Windows.open("main", title: title, content: content)
    realize()
  }

  // MARK: Rows and targets

  /// The list's rows on screen exist (an offscreen window is never drawn) and name their targets.
  func realize() {
    page.layoutSubtreeIfNeeded()
    list.layoutSubtreeIfNeeded()
    let fixture = Fixture.shared
    var current: [String: NSView] = [:]
    let range = table.rows(in: table.visibleRect)
    for row in range.location..<(range.location + range.length) where row < items.count {
      if let view = table.rowView(atRow: row, makeIfNecessary: true) { current["row-\(items[row].id)"] = view }
    }
    for (name, view) in fixture.controls where view is InvoiceRowView && current[name] !== view { fixture.controls[name] = nil }
    for (name, view) in current { fixture.controls[name] = view }
  }

  /// A row is a target only while wholly shown: inside the list's visible area (below its header) and inside the
  /// page's visible area.
  static func isShown(_ row: InvoiceRowView) -> Bool {
    guard let invoice = shared, row.window != nil else { return false }
    for clip in [invoice.list.contentView, invoice.page.contentView] {
      let frame = row.convert(row.bounds, to: clip)
      let top = clip.bounds.minY + clip.contentInsets.top - 0.5
      let bottom = clip.bounds.maxY - clip.contentInsets.bottom + 0.5
      if frame.minY < top || frame.maxY > bottom { return false }
    }
    return true
  }

  /// The visible offset of a view, past any header inset: 0 at the top.
  func offset(_ name: String) -> Int {
    let clip = (name == "list" ? list : page).contentView
    return Int((clip.bounds.origin.y + clip.contentInsets.top).rounded())
  }

  @objc func scrolled(_ note: Notification) {
    realize()
    guard let clip = note.object as? NSClipView else { return }
    let name = clip === list.contentView ? "list" : "page"
    // One fact per settled scroll: 150 ms without movement, and only when the view ended somewhere new.
    settle[name]?.invalidate()
    settle[name] = Timer.scheduledTimer(withTimeInterval: 0.15, repeats: false) { [weak self] _ in self?.recordScrolled(name) }
  }

  /// The settled offset, recorded when it differs from the last one; the oracle's scrollTo records at once.
  func recordScrolled(_ name: String) {
    settle[name]?.invalidate()
    settle[name] = nil
    let now = offset(name)
    if now != lastOffset[name] {
      lastOffset[name] = now
      Fixture.shared.record("scrolled", ["view": name, "offset": now])
    }
  }

  @objc func doubleClicked(_ sender: Any?) {
    let row = table.clickedRow
    guard row >= 0, row < items.count else { return }
    opened(items[row].id)
  }

  func opened(_ id: String) { Fixture.shared.record("opened", ["item": id]) }

  // MARK: Table

  func numberOfRows(in tableView: NSTableView) -> Int { items.count }

  func tableView(_ tableView: NSTableView, rowViewForRow row: Int) -> NSTableRowView? { InvoiceRowView() }

  func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
    guard let tableColumn, row < items.count else { return nil }
    let item = items[row]
    let value = tableColumn.identifier.rawValue == "id" ? item.id : tableColumn.identifier.rawValue == "customer" ? item.customer : item.amount
    let label = NSTextField(labelWithString: value)
    label.font = NSFont.systemFont(ofSize: 12)
    label.textColor = .black
    return label
  }

  // MARK: State and seams

  static func fields() -> [String: Any] {
    guard Screens.current == task, let invoice = shared else { return [:] }
    return ["pageOffset": invoice.offset("page"), "listOffset": invoice.offset("list"), "count": invoice.items.count]
  }

  /// Oracle seams: `scrollTo {view: 'page'|'list', offset}` scrolls that view (its facts follow as for a person's
  /// scroll); `open {item}` opens a row as a double-click does.
  static func act(_ step: [String: Any]) -> Bool {
    guard Screens.current == task, let invoice = shared else { return HoverChart.act(step) }
    if let target = step["scrollTo"] as? [String: Any], let name = target["view"] as? String, ["page", "list"].contains(name),
       let offset = (target["offset"] as? NSNumber)?.doubleValue {
      let scroll = name == "list" ? invoice.list : invoice.page
      let clip = scroll.contentView
      let maxY = max(0, (scroll.documentView?.frame.height ?? 0) - clip.bounds.height + clip.contentInsets.bottom)
      clip.scroll(to: NSPoint(x: clip.bounds.origin.x, y: min(maxY, max(0, offset)) - clip.contentInsets.top))
      scroll.reflectScrolledClipView(clip)
      invoice.realize()
      invoice.recordScrolled(name)
      return true
    }
    if let spec = step["open"] as? [String: Any], let id = spec["item"] as? String, invoice.items.contains(where: { $0.id == id }) {
      invoice.opened(id)
      return true
    }
    return false
  }
}
