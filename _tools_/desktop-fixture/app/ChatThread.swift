import AppKit

// CU-66 S8 'chat-thread' (cu-researcher's spec): a channel of messages, some below the fold; each row offers 'Reply in
// thread' as a button while the pointer is over it and as an item in its right-click menu. The thread pane posts a
// reply under its parent and the parent's row counts the replies - a send always shows on screen.

/// One message in the channel: a target while wholly shown; its 'Reply in thread' button exists only while hovered.
final class ChatRowView: NSView {
  let id: String
  let replyButton = NSButton(title: "Reply in thread", target: nil, action: nil)
  let countLabel = NSTextField(labelWithString: "")
  private let summary: String
  override var isFlipped: Bool { true }
  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
  // CU-137: the row as a named element ('Dana: Morning all ...'); its hover button stays its own named button.
  override func isAccessibilityElement() -> Bool { true }
  override func accessibilityRole() -> NSAccessibility.Role? { .row }
  override func accessibilityLabel() -> String? { summary }

  init(id: String, from: String, text: String, width: CGFloat) {
    self.id = id
    self.summary = "\(from): \(text)"
    super.init(frame: NSRect(x: 0, y: 0, width: width, height: ChatThread.rowHeight))
    wantsLayer = true
    let name = Kit.label(from, size: 12, bold: true)
    name.frame = NSRect(x: 10, y: 6, width: 200, height: 16)
    addSubview(name)
    let body = NSTextField(labelWithString: text)
    body.font = NSFont.systemFont(ofSize: 13)
    body.textColor = .black
    body.lineBreakMode = .byTruncatingTail
    body.frame = NSRect(x: 10, y: 24, width: width - 20, height: 18)
    addSubview(body)
    countLabel.font = NSFont.systemFont(ofSize: 11)
    countLabel.textColor = NSColor(calibratedRed: 0.1, green: 0.35, blue: 0.8, alpha: 1)
    countLabel.frame = NSRect(x: 10, y: 43, width: 200, height: 14)
    countLabel.isHidden = true
    addSubview(countLabel)
    replyButton.bezelStyle = .rounded
    replyButton.controlSize = .small
    replyButton.font = NSFont.systemFont(ofSize: 11)
    replyButton.frame = NSRect(x: width - 122, y: 4, width: 114, height: 22)
    replyButton.target = self
    replyButton.action = #selector(replyChosen(_:))
    replyButton.identifier = NSUserInterfaceItemIdentifier("thread-\(id)")
    replyButton.isHidden = true
    addSubview(replyButton)
  }
  required init?(coder: NSCoder) { nil }

  override func updateTrackingAreas() {
    super.updateTrackingAreas()
    trackingAreas.forEach(removeTrackingArea)
    addTrackingArea(NSTrackingArea(rect: bounds, options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect], owner: self))
  }

  /// The hover button shows - and is a target - only while the pointer is over the row.
  override func mouseEntered(with event: NSEvent?) {
    replyButton.isHidden = false
    layer?.backgroundColor = NSColor(calibratedWhite: 0.96, alpha: 1).cgColor
    Fixture.shared.controls["thread-\(id)"] = replyButton
  }

  override func mouseExited(with event: NSEvent?) {
    replyButton.isHidden = true
    layer?.backgroundColor = nil
    if Fixture.shared.controls["thread-\(id)"] === replyButton { Fixture.shared.controls["thread-\(id)"] = nil }
  }

  /// The same choice in the row's context menu.
  override func menu(for event: NSEvent) -> NSMenu? { contextMenu() }

  func contextMenu() -> NSMenu {
    let menu = NSMenu(title: "Message")
    let item = NSMenuItem(title: "Reply in thread", action: #selector(menuReplyChosen(_:)), keyEquivalent: "")
    item.target = self
    menu.addItem(item)
    let copy = NSMenuItem(title: "Copy text", action: nil, keyEquivalent: "")
    menu.addItem(copy)
    return menu
  }

  @objc func replyChosen(_ sender: Any?) { ChatThread.shared?.openThread(id, via: "button") }
  @objc func menuReplyChosen(_ sender: Any?) { ChatThread.shared?.openThread(id, via: "menu") }

  func setCount(_ count: Int) {
    countLabel.stringValue = count == 1 ? "1 reply" : "\(count) replies"
    countLabel.isHidden = count == 0
  }
}

final class ChatThread: NSObject {
  static var shared: ChatThread?
  static let task = "chat-thread"
  static let rowHeight: CGFloat = 60

  var messages: [(id: String, from: String, text: String)] = []
  var replies: [String: [String]] = [:]
  var rows: [ChatRowView] = []
  // 364 pt with the bezel border leaves a 360 pt clip: exactly six 60 pt rows above the fold.
  let scroll = NSScrollView(frame: NSRect(x: 12, y: 44, width: 400, height: 364))
  let list = FlippedView(frame: .zero)
  let channelInput = NSTextField(string: "")
  let pane = FlippedView(frame: NSRect(x: 424, y: 44, width: 264, height: 404))
  let threadInput = NSTextField(string: "")
  private(set) var openId: String?
  private var posted = 0

  static func open(_ task: String, title: String) -> Bool {
    guard task == Self.task else { return VendorForm.open(task, title: title) }
    let chat = ChatThread()
    shared = chat
    chat.build(title: title)
    return true
  }

  /// params.messages [{id, from, text}]; without it, twelve messages.
  static func list(_ params: [String: Any]) -> [(id: String, from: String, text: String)] {
    if let given = params["messages"] as? [[String: Any]], !given.isEmpty {
      return given.compactMap { item in
        guard let id = item["id"] as? String, let from = item["from"] as? String, let text = item["text"] as? String else { return nil }
        return (id, from, text)
      }
    }
    let lines = [("Dana", "Morning all - standup moved to 9:30."), ("Lee", "The release notes draft is in the shared folder."),
                 ("Sam", "Who owns the venue booking for the offsite?"), ("Ines", "I can take it if nobody else has."),
                 ("Tom", "Reminder: expense reports are due Friday."), ("Dana", "Build 4471 is green on all platforms."),
                 ("Lee", "Can someone review the pricing page copy?"), ("Sam", "Lunch order closes at 11:45."),
                 ("Ines", "The customer call moved to Thursday 2 pm."), ("Tom", "New laptops arrive next week."),
                 ("Dana", "Please update your OKR status by Monday."), ("Lee", "Thanks everyone for a great quarter!")]
    return lines.enumerated().map { (String(format: "m%02d", $0.offset + 1), $0.element.0, $0.element.1) }
  }

  private func build(title: String) {
    let fixture = Fixture.shared
    messages = Self.list(Screens.params)
    let content = FlippedView(frame: NSRect(x: 0, y: 0, width: 700, height: 460))
    content.wantsLayer = true
    content.layer?.backgroundColor = NSColor.white.cgColor
    let heading = Kit.label(Screens.params["channel"] as? String ?? "# general", size: 15, bold: true)
    heading.frame = NSRect(x: 14, y: 14, width: 380, height: 22)
    content.addSubview(heading)

    scroll.documentView = list
    scroll.hasVerticalScroller = true
    scroll.scrollerStyle = .legacy
    scroll.borderType = .bezelBorder
    content.addSubview(scroll)
    scroll.contentView.postsBoundsChangedNotifications = true
    NotificationCenter.default.addObserver(self, selector: #selector(scrolled(_:)), name: NSView.boundsDidChangeNotification, object: scroll.contentView)
    layoutRows()

    channelInput.placeholderString = "Message # general"
    channelInput.frame = NSRect(x: 12, y: 416, width: 316, height: 26)
    channelInput.identifier = NSUserInterfaceItemIdentifier("channel-input")
    fixture.controls["channel-input"] = channelInput
    content.addSubview(channelInput)
    let channelSend = NSButton(title: "Send", target: fixture, action: #selector(Fixture.pressed(_:)))
    channelSend.bezelStyle = .rounded
    channelSend.frame = NSRect(x: 334, y: 414, width: 78, height: 30)
    channelSend.identifier = NSUserInterfaceItemIdentifier("channel-send")
    fixture.controls["channel-send"] = channelSend
    content.addSubview(channelSend)

    pane.wantsLayer = true
    pane.layer?.backgroundColor = NSColor(calibratedWhite: 0.97, alpha: 1).cgColor
    pane.layer?.borderColor = NSColor(calibratedWhite: 0.85, alpha: 1).cgColor
    pane.layer?.borderWidth = 1
    pane.isHidden = true
    content.addSubview(pane)
    _ = Windows.open("main", title: title, content: content)
    realize()
  }

  private func layoutRows() {
    rows.forEach { $0.removeFromSuperview() }
    let width = scroll.contentSize.width
    list.frame = NSRect(x: 0, y: 0, width: width, height: CGFloat(messages.count) * Self.rowHeight)
    rows = messages.enumerated().map { index, message in
      let row = ChatRowView(id: message.id, from: message.from, text: message.text, width: width)
      row.frame.origin = NSPoint(x: 0, y: CGFloat(index) * Self.rowHeight)
      row.setCount(replies[message.id]?.count ?? 0)
      list.addSubview(row)
      return row
    }
  }

  // MARK: Targets

  /// Rows wholly shown in the channel are targets ('row-<id>'); the others are not until scrolled into view.
  func realize() {
    let fixture = Fixture.shared
    let clip = scroll.contentView.bounds
    for row in rows {
      let shown = row.frame.minY >= clip.minY - 0.5 && row.frame.maxY <= clip.maxY + 0.5
      fixture.controls["row-\(row.id)"] = shown ? row : nil
      if !shown, fixture.controls["thread-\(row.id)"] === row.replyButton { row.mouseExited(with: nil) }
    }
  }

  @objc func scrolled(_ note: Notification) { realize() }

  // MARK: Thread

  func openThread(_ id: String, via: String) {
    guard let message = messages.first(where: { $0.id == id }) else { return }
    openId = id
    Fixture.shared.record("thread-opened", ["id": id, "via": via])
    showPane(message)
  }

  private func showPane(_ message: (id: String, from: String, text: String)) {
    let fixture = Fixture.shared
    pane.subviews.forEach { $0.removeFromSuperview() }
    pane.isHidden = false
    let title = Kit.label("Thread", size: 14, bold: true)
    title.frame = NSRect(x: 12, y: 10, width: 200, height: 20)
    pane.addSubview(title)
    let parent = NSTextField(wrappingLabelWithString: "\(message.from): \(message.text)")
    parent.font = NSFont.systemFont(ofSize: 12)
    parent.frame = NSRect(x: 12, y: 36, width: 240, height: 48)
    pane.addSubview(parent)
    var y: CGFloat = 92
    for reply in replies[message.id] ?? [] {
      let line = NSTextField(wrappingLabelWithString: "You: \(reply)")
      line.font = NSFont.systemFont(ofSize: 12)
      line.textColor = NSColor(calibratedRed: 0.1, green: 0.3, blue: 0.6, alpha: 1)
      line.frame = NSRect(x: 12, y: y, width: 240, height: 32)
      pane.addSubview(line)
      y += 34
    }
    threadInput.stringValue = ""
    threadInput.placeholderString = "Reply..."
    threadInput.frame = NSRect(x: 12, y: 330, width: 240, height: 26)
    threadInput.identifier = NSUserInterfaceItemIdentifier("thread-input")
    fixture.controls["thread-input"] = threadInput
    pane.addSubview(threadInput)
    let send = NSButton(title: "Send", target: fixture, action: #selector(Fixture.pressed(_:)))
    send.bezelStyle = .rounded
    send.frame = NSRect(x: 172, y: 362, width: 80, height: 30)
    send.identifier = NSUserInterfaceItemIdentifier("thread-send")
    fixture.controls["thread-send"] = send
    pane.addSubview(send)
    pane.window?.makeFirstResponder(threadInput)
  }

  static func press(_ name: String) -> Bool {
    guard Screens.current == task, let chat = shared else { return VendorForm.press(name) }
    switch name {
    case "thread-send":
      let text = chat.threadInput.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
      guard let id = chat.openId, !text.isEmpty, let message = chat.messages.first(where: { $0.id == id }) else { return true }
      chat.replies[id, default: []].append(text)
      Fixture.shared.record("posted", ["parent": id, "text": text])
      chat.rows.first(where: { $0.id == id })?.setCount(chat.replies[id]?.count ?? 0)
      chat.showPane(message)
    case "channel-send":
      let text = chat.channelInput.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !text.isEmpty else { return true }
      chat.posted += 1
      Fixture.shared.record("posted", ["parent": NSNull(), "text": text])
      chat.messages.append((String(format: "you%02d", chat.posted), "You", text))
      chat.channelInput.stringValue = ""
      chat.layoutRows()
      chat.list.scroll(NSPoint(x: 0, y: max(0, chat.list.frame.height - chat.scroll.contentSize.height)))
      chat.realize()
    default:
      return false
    }
    return true
  }

  static func fields() -> [String: Any] {
    guard Screens.current == task, let chat = shared else { return [:] }
    var counts: [String: Int] = [:]
    for (id, list) in chat.replies { counts[id] = list.count }
    return ["openThread": chat.openId ?? NSNull(), "replyCounts": counts, "messageCount": chat.messages.count,
            "hovered": chat.rows.filter { !$0.replyButton.isHidden }.map(\.id)]
  }

  /// Seams: `hoverRow {id}` / `unhoverRow {id}` run the row's own tracking handlers; `contextMenu {id, choose}` builds
  /// the row's own context menu and performs the named item; `openThread id` is the oracle's shortcut; `scrollTo id`.
  static func act(_ step: [String: Any]) -> Bool {
    guard Screens.current == task, let chat = shared else { return VendorForm.act(step) }
    if let id = (step["hoverRow"] as? [String: Any])?["id"] as? String, let row = chat.rows.first(where: { $0.id == id }) {
      row.mouseEntered(with: nil)
      return true
    }
    if let id = (step["unhoverRow"] as? [String: Any])?["id"] as? String, let row = chat.rows.first(where: { $0.id == id }) {
      row.mouseExited(with: nil)
      return true
    }
    if let spec = step["contextMenu"] as? [String: Any], let id = spec["id"] as? String, let row = chat.rows.first(where: { $0.id == id }) {
      let menu = row.contextMenu()
      guard let item = menu.items.first(where: { $0.title == (spec["choose"] as? String ?? "Reply in thread") }), let action = item.action else { return false }
      return NSApp.sendAction(action, to: item.target, from: item)
    }
    if let id = step["openThread"] as? String {
      chat.openThread(id, via: "seam")
      return true
    }
    if let id = step["scrollTo"] as? String, let row = chat.rows.first(where: { $0.id == id }) {
      row.scrollToVisible(row.bounds)
      chat.realize()
      return true
    }
    return false
  }
}
