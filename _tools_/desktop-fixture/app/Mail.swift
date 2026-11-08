import AppKit

// CU-66 S2 'mail-inbox' (cu-researcher's spec): a message list with AppKit's own selection (click opens, Command-click
// adds, Shift-click extends), a reading pane, Archive for the selection and Reply with a compose area. The messages are
// entries in the fixture's model; nothing is sent anywhere.

/// A message's row: a target while it is wholly shown.
final class MailRowView: NSTableRowView {}

final class Mail: NSObject, NSTableViewDataSource, NSTableViewDelegate, NSTextFieldDelegate {
  static var shared: Mail?
  static let task = "mail-inbox"

  var messages: [(id: String, from: String, subject: String, body: String)] = []
  let table = NSTableView()
  let scroll = NSScrollView()
  let paneFrom = NSTextField(labelWithString: "")
  let paneSubject = NSTextField(labelWithString: "")
  let paneBody = NSTextField(wrappingLabelWithString: "")
  let composeLabel = NSTextField(labelWithString: "")
  let body = NSTextField(string: "")
  let send = NSButton(title: "Send", target: nil, action: nil)
  /// After Send: a note under the pane and a Sent count in the toolbar, so a send is never silent (CU-128).
  let sentNote = NSTextField(labelWithString: "")
  let sentCount = NSTextField(labelWithString: "Sent (0)")
  private var sentTotal = 0
  private(set) var openId: String?
  private var replyTo: String?

  /// params.messages [{id, from, subject, body?}]; without it, 30 numbered messages.
  static func list(_ params: [String: Any]) -> [(id: String, from: String, subject: String, body: String)] {
    if let given = params["messages"] as? [[String: Any]], !given.isEmpty {
      return given.compactMap { item in
        guard let id = item["id"] as? String, let from = item["from"] as? String, let subject = item["subject"] as? String else { return nil }
        return (id, from, subject, item["body"] as? String ?? "Hello,\n\nAbout \(subject.lowercased()): see the notes we shared.\n\nThanks,\n\(from)")
      }
    }
    let people = ["Dana Ruiz", "Lee Park", "Sam Okafor", "Ines Moreau", "Tom Becker"]
    let topics = ["Quarterly numbers", "Venue booking", "Invoice 4471", "Team offsite", "Roadmap draft", "Lunch on Friday"]
    return (1...30).map { number in
      let from = people[number % people.count], subject = "\(topics[number % topics.count]) #\(number)"
      return (String(format: "msg-%02d", number), from, subject, "Hello,\n\nAbout \(subject.lowercased()): see the notes we shared.\n\nThanks,\n\(from)")
    }
  }

  static func open(_ task: String, title: String) -> Bool {
    guard task == Self.task else { return SettingsTree.open(task, title: title) }
    let mail = Mail()
    shared = mail
    mail.build(title: title)
    return true
  }

  private func build(title: String) {
    let fixture = Fixture.shared
    messages = Self.list(Screens.params)
    let content = FlippedView(frame: NSRect(x: 0, y: 0, width: 700, height: 460))
    content.wantsLayer = true
    content.layer?.backgroundColor = NSColor.white.cgColor

    for (name, label, x) in [("reply", "Reply", 12.0), ("archive", "Archive", 104.0)] {
      let button = NSButton(title: label, target: fixture, action: #selector(Fixture.pressed(_:)))
      button.identifier = NSUserInterfaceItemIdentifier(name)
      button.bezelStyle = .rounded
      button.frame = NSRect(x: CGFloat(x), y: 10, width: 88, height: 28)
      fixture.controls[name] = button
      content.addSubview(button)
    }

    for (identifier, heading, width) in [("from", "From", 104.0), ("subject", "Subject", 190.0)] {
      let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier(identifier))
      column.title = heading
      column.width = width
      table.addTableColumn(column)
    }
    table.rowHeight = 24
    table.headerView = nil
    table.allowsMultipleSelection = true
    table.allowsEmptySelection = true
    table.usesAlternatingRowBackgroundColors = true
    table.dataSource = self
    table.delegate = self
    scroll.documentView = table
    scroll.hasVerticalScroller = true
    scroll.autohidesScrollers = false
    scroll.scrollerStyle = .legacy
    scroll.borderType = .bezelBorder
    scroll.frame = NSRect(x: 12, y: 48, width: 312, height: 400)
    content.addSubview(scroll)
    scroll.contentView.postsBoundsChangedNotifications = true
    NotificationCenter.default.addObserver(self, selector: #selector(scrolled(_:)), name: NSView.boundsDidChangeNotification, object: scroll.contentView)

    paneFrom.font = NSFont.systemFont(ofSize: 12)
    paneFrom.textColor = .darkGray
    paneFrom.frame = NSRect(x: 340, y: 50, width: 348, height: 18)
    paneSubject.font = NSFont.boldSystemFont(ofSize: 15)
    paneSubject.textColor = .black
    paneSubject.lineBreakMode = .byTruncatingTail
    paneSubject.frame = NSRect(x: 340, y: 70, width: 348, height: 22)
    paneBody.font = NSFont.systemFont(ofSize: 13)
    paneBody.textColor = .black
    paneBody.frame = NSRect(x: 340, y: 100, width: 348, height: 150)
    for view in [paneFrom, paneSubject, paneBody] { content.addSubview(view) }
    paneSubject.stringValue = "No message selected"

    composeLabel.font = NSFont.boldSystemFont(ofSize: 12)
    composeLabel.frame = NSRect(x: 340, y: 262, width: 348, height: 18)
    body.identifier = NSUserInterfaceItemIdentifier("body")
    body.frame = NSRect(x: 340, y: 284, width: 348, height: 120)
    body.font = NSFont.systemFont(ofSize: 13)
    body.usesSingleLineMode = false
    body.cell?.wraps = true
    body.cell?.isScrollable = false
    body.delegate = self
    send.identifier = NSUserInterfaceItemIdentifier("send")
    send.target = fixture
    send.action = #selector(Fixture.pressed(_:))
    send.bezelStyle = .rounded
    send.frame = NSRect(x: 600, y: 412, width: 88, height: 28)
    for view in [composeLabel, body, send] { view.isHidden = true; content.addSubview(view) }
    sentNote.font = NSFont.boldSystemFont(ofSize: 12)
    sentNote.textColor = NSColor(calibratedRed: 0.1, green: 0.45, blue: 0.2, alpha: 1)
    sentNote.frame = NSRect(x: 340, y: 262, width: 348, height: 18)
    sentNote.isHidden = true
    content.addSubview(sentNote)
    sentCount.font = NSFont.systemFont(ofSize: 12)
    sentCount.textColor = .darkGray
    sentCount.alignment = .right
    sentCount.frame = NSRect(x: 588, y: 16, width: 100, height: 18)
    content.addSubview(sentCount)

    _ = Windows.open("main", title: title, content: content)
    realize()
  }

  // MARK: Rows and targets

  /// The rows on screen exist (an offscreen window is never drawn) and name their targets; rows gone from the screen
  /// do not.
  func realize() {
    scroll.layoutSubtreeIfNeeded()
    let fixture = Fixture.shared
    var current: [String: NSView] = [:]
    let range = table.rows(in: table.visibleRect)
    for row in range.location..<(range.location + range.length) where row < messages.count {
      if let view = table.rowView(atRow: row, makeIfNecessary: true) { current[messages[row].id] = view }
    }
    for (name, view) in fixture.controls where view is MailRowView && current[name] !== view { fixture.controls[name] = nil }
    for (name, view) in current { fixture.controls[name] = view }
  }

  static func isShown(_ row: MailRowView) -> Bool {
    guard let mail = shared, row.window != nil else { return false }
    let clip = mail.scroll.contentView
    let frame = row.convert(row.bounds, to: clip)
    return frame.minY >= clip.bounds.minY - 0.5 && frame.maxY <= clip.bounds.maxY + 0.5
  }

  @objc func scrolled(_ note: Notification) { realize() }

  // MARK: Table

  func numberOfRows(in tableView: NSTableView) -> Int { messages.count }

  func tableView(_ tableView: NSTableView, rowViewForRow row: Int) -> NSTableRowView? { MailRowView() }

  func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
    guard let tableColumn, row < messages.count else { return nil }
    let label = NSTextField(labelWithString: tableColumn.identifier.rawValue == "from" ? messages[row].from : messages[row].subject)
    label.font = tableColumn.identifier.rawValue == "from" ? NSFont.boldSystemFont(ofSize: 12) : NSFont.systemFont(ofSize: 12)
    label.lineBreakMode = .byTruncatingTail
    return label
  }

  /// A single selected message opens in the pane ('opened' once per newly opened message); more than one shows how
  /// many are selected.
  func tableViewSelectionDidChange(_ notification: Notification) {
    let rows = table.selectedRowIndexes.filter { $0 < messages.count }
    if rows.count == 1, let row = rows.first {
      let message = messages[row]
      paneFrom.stringValue = "From: \(message.from)"
      paneSubject.stringValue = message.subject
      paneBody.stringValue = message.body
      if openId != message.id {
        openId = message.id
        Fixture.shared.record("opened", ["id": message.id])
      }
    } else if rows.count > 1 {
      paneFrom.stringValue = ""
      paneSubject.stringValue = "\(rows.count) messages selected"
      paneBody.stringValue = ""
    }
  }

  func selection() -> [String] { table.selectedRowIndexes.filter { $0 < messages.count }.map { messages[$0].id } }

  // MARK: Actions

  static func press(_ name: String) -> Bool {
    guard Screens.current == task, let mail = shared else { return SettingsTree.press(name) }
    switch name {
    case "archive": mail.archive()
    case "reply": mail.reply()
    case "send": mail.sendReply()
    default: return false
    }
    return true
  }

  /// The selection goes to Archive, in list order, and leaves the list.
  func archive() {
    let ids = selection()
    guard !ids.isEmpty else { return }
    Fixture.shared.record("archived", ["ids": ids])
    let gone = Set(ids)
    for (name, view) in Fixture.shared.controls where view is MailRowView && gone.contains(name) { Fixture.shared.controls[name] = nil }
    messages.removeAll { gone.contains($0.id) }
    if let openId, gone.contains(openId) {
      self.openId = nil
      paneFrom.stringValue = ""
      paneSubject.stringValue = "No message selected"
      paneBody.stringValue = ""
    }
    table.deselectAll(nil)
    table.reloadData()
    realize()
  }

  /// Reply to the open message: the compose area appears under the pane.
  func reply() {
    guard let openId, let message = messages.first(where: { $0.id == openId }) else { return }
    replyTo = openId
    sentNote.isHidden = true
    composeLabel.stringValue = "Reply to \(message.from)"
    body.stringValue = ""
    for view in [composeLabel, body, send] { view.isHidden = false }
    // The compose controls are targets only while they are shown.
    Fixture.shared.controls["body"] = body
    Fixture.shared.controls["send"] = send
    body.window?.makeFirstResponder(body)
  }

  func sendReply() {
    guard let replyTo, let message = messages.first(where: { $0.id == replyTo }) else { return }
    Fixture.shared.record("sent", ["inReplyTo": replyTo, "to": message.from, "body": body.stringValue])
    sentTotal += 1
    sentCount.stringValue = "Sent (\(sentTotal))"
    sentNote.stringValue = "\u{2713} Sent to \(message.from)"
    sentNote.isHidden = false
    self.replyTo = nil
    body.stringValue = ""
    for view in [composeLabel, body, send] { view.isHidden = true }
    Fixture.shared.controls["body"] = nil
    Fixture.shared.controls["send"] = nil
  }

  /// Return in the body is a new line, not the end of editing: a reply has several lines.
  func control(_ control: NSControl, textView: NSTextView, doCommandBy selector: Selector) -> Bool {
    guard control === body, selector == #selector(NSResponder.insertNewline(_:)) else { return false }
    textView.insertNewlineIgnoringFieldEditor(nil)
    return true
  }

  // MARK: Facts and seams

  static func fields() -> [String: Any] {
    guard Screens.current == task, let mail = shared else { return [:] }
    return ["selection": mail.selection(), "open": mail.openId ?? NSNull(), "messageCount": mail.messages.count,
            "composing": mail.replyTo != nil, "body": mail.body.stringValue, "paneTitle": mail.paneSubject.stringValue,
            "sentNote": mail.sentNote.isHidden ? NSNull() : mail.sentNote.stringValue, "sentCount": mail.sentCount.stringValue]
  }

  /// Oracle seams: `select {ids}` sets the selection (as clicks would); `scrollTo id` brings a row into view.
  /// `set body` and `press reply|archive|send` are the generic seams.
  static func act(_ step: [String: Any]) -> Bool {
    guard Screens.current == task, let mail = shared else { return SettingsTree.act(step) }
    if let spec = step["select"] as? [String: Any], let ids = spec["ids"] as? [String] {
      let wanted = Set(ids)
      mail.table.selectRowIndexes(IndexSet(mail.messages.indices.filter { wanted.contains(mail.messages[$0].id) }), byExtendingSelection: false)
      return true
    }
    if let id = step["scrollTo"] as? String, let row = mail.messages.firstIndex(where: { $0.id == id }) {
      mail.table.scrollRowToVisible(row)
      mail.realize()
      return true
    }
    return false
  }
}
