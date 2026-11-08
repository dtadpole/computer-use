import AppKit

// CU-66 S3 'week-calendar' (cu-researcher's spec): Mon-Fri columns, 08:00-18:00 in half-hour rows, events as coloured
// blocks. Dragging a block - the whole block is the handle - to another day or time snaps it to the half hour, keeps
// its length and records 'moved'; a drop outside the grid puts it back. The block follows the pointer from where it
// was pressed, so which block moves is decided by the press, as in a real calendar.

/// A half-hour slot: a target for aiming a drop.
final class CalendarCellView: NSView {
  // CU-137: a named cell ('Thu 16:30'), as a calendar's grid reads.
  override func isAccessibilityElement() -> Bool { true }
  override func accessibilityRole() -> NSAccessibility.Role? { .cell }
  override func accessibilityLabel() -> String? { identifier?.rawValue.replacingOccurrences(of: "cell-", with: "").replacingOccurrences(of: "-", with: " ") }
}

/// An event: a target, dragged by mouseDown / mouseDragged / mouseUp.
final class CalendarEventView: NSView {
  let id: String
  let title: String
  let owner: String
  var day: Int
  var start: Int
  let dur: Int
  private var pressAt: NSPoint?
  private var originAtPress: NSPoint?
  private let label = NSTextField(labelWithString: "")
  override var isFlipped: Bool { true }
  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
  // CU-137: the event as one named element (title, owner and span), not its label's text alone.
  override func isAccessibilityElement() -> Bool { true }
  override func accessibilityRole() -> NSAccessibility.Role? { .button }
  override func accessibilityLabel() -> String? {
    "\(title) (\(owner)) \(WeekCalendar.days[day]) \(WeekCalendar.clock(start))-\(WeekCalendar.clock(start + dur))"
  }
  override func accessibilityChildren() -> [Any]? { [] }

  init(id: String, title: String, owner: String, day: Int, start: Int, dur: Int) {
    self.id = id
    self.title = title
    self.owner = owner
    self.day = day
    self.start = start
    self.dur = dur
    super.init(frame: .zero)
    wantsLayer = true
    layer?.cornerRadius = 4
    layer?.backgroundColor = Self.colour(owner).cgColor
    label.font = NSFont.systemFont(ofSize: 11)
    label.textColor = .black
    label.isSelectable = false
    label.lineBreakMode = .byTruncatingTail
    label.maximumNumberOfLines = 2
    addSubview(label)
    refresh()
  }
  required init?(coder: NSCoder) { nil }

  static func colour(_ owner: String) -> NSColor {
    switch owner {
    case "Alice": return NSColor(calibratedRed: 0.99, green: 0.82, blue: 0.62, alpha: 1)
    case "Bob": return NSColor(calibratedRed: 0.74, green: 0.9, blue: 0.74, alpha: 1)
    default: return NSColor(calibratedRed: 0.72, green: 0.83, blue: 0.98, alpha: 1)
    }
  }

  /// Placed by its day and time; the text names its owner, title and span.
  func refresh() {
    frame = WeekCalendar.blockFrame(day: day, start: start, dur: dur)
    // A half-hour block has room for one line: its start time first; longer blocks show the span on a second line.
    let span = "\(WeekCalendar.clock(start))-\(WeekCalendar.clock(start + dur))"
    // The owner rides with the time, which is short, so a long title truncates before the owner does.
    label.stringValue = dur == 30 ? "\(WeekCalendar.clock(start)) \(owner) · \(title)" : "\(title)\n\(span) · \(owner)"
    label.frame = bounds.insetBy(dx: 4, dy: 2)
  }

  override func mouseDown(with event: NSEvent) {
    guard let parent = superview else { return }
    pressAt = parent.convert(event.locationInWindow, from: nil)
    originAtPress = frame.origin
    parent.addSubview(self, positioned: .above, relativeTo: nil)
  }

  override func mouseDragged(with event: NSEvent) {
    guard let parent = superview, let pressAt, let originAtPress else { return }
    let now = parent.convert(event.locationInWindow, from: nil)
    setFrameOrigin(NSPoint(x: originAtPress.x + now.x - pressAt.x, y: originAtPress.y + now.y - pressAt.y))
  }

  override func mouseUp(with event: NSEvent) {
    guard let parent = superview, let pressAt else { return }
    let now = parent.convert(event.locationInWindow, from: nil)
    self.pressAt = nil
    originAtPress = nil
    // A drop is decided by where the pointer let go: outside the grid, the block goes back.
    guard WeekCalendar.grid.contains(now) else { return refresh() }
    let top = frame.minY
    let slot = Int(((top - WeekCalendar.grid.minY) / WeekCalendar.slotHeight).rounded())
    let dayIndex = Int(((frame.midX - WeekCalendar.grid.minX) / WeekCalendar.dayWidth).rounded(.down))
    let wantedStart = WeekCalendar.firstMinute + slot * 30
    let start = max(WeekCalendar.firstMinute, min(WeekCalendar.lastMinute - dur, wantedStart))
    let day = max(0, min(WeekCalendar.days.count - 1, dayIndex))
    _ = pressAt
    WeekCalendar.shared?.place(self, day: day, start: start)
  }
}

final class WeekCalendar {
  static var shared: WeekCalendar?
  static let task = "week-calendar"
  static let days = ["Mon", "Tue", "Wed", "Thu", "Fri"]
  static let firstMinute = 8 * 60
  static let lastMinute = 18 * 60
  static let slotHeight: CGFloat = 20
  // The grid inside the window's content (flipped): 5 days x 20 half-hours.
  static let grid = NSRect(x: 62, y: 44, width: 625, height: 400)
  static var dayWidth: CGFloat { grid.width / CGFloat(days.count) }

  var events: [CalendarEventView] = []

  static func clock(_ minutes: Int) -> String { String(format: "%02d:%02d", minutes / 60, minutes % 60) }

  /// An event's target name: 'ev-<id>', without doubling a prefix the id already has.
  static func targetName(_ id: String) -> String { id.hasPrefix("ev-") ? id : "ev-\(id)" }

  static func blockFrame(day: Int, start: Int, dur: Int) -> NSRect {
    let y = grid.minY + CGFloat(start - firstMinute) / 30 * slotHeight
    return NSRect(x: grid.minX + CGFloat(day) * dayWidth + 3, y: y + 1, width: dayWidth - 6, height: CGFloat(dur) / 30 * slotHeight - 2)
  }

  /// params.events [{id, title, owner, day, start, dur}]; without it, a small fixed week.
  static func list(_ params: [String: Any]) -> [(id: String, title: String, owner: String, day: Int, start: Int, dur: Int)] {
    let given = (params["events"] as? [[String: Any]]) ?? [
      ["id": "standup", "title": "Standup", "owner": "Me", "day": "Mon", "start": 540, "dur": 30],
      ["id": "review", "title": "Design review", "owner": "Alice", "day": "Wed", "start": 600, "dur": 60],
      ["id": "1on1", "title": "1:1", "owner": "Bob", "day": "Thu", "start": 840, "dur": 30],
    ]
    return given.compactMap { item in
      guard let id = item["id"] as? String, let dayName = item["day"] as? String, let day = days.firstIndex(of: dayName),
            let start = (item["start"] as? NSNumber)?.intValue, let dur = (item["dur"] as? NSNumber)?.intValue,
            [30, 60, 90].contains(dur), start >= firstMinute, start + dur <= lastMinute, start % 30 == 0 else { return nil }
      return (id, item["title"] as? String ?? id, item["owner"] as? String ?? "Me", day, start, dur)
    }
  }

  static func open(_ task: String, title: String) -> Bool {
    guard task == Self.task else { return Mail.open(task, title: title) }
    let calendar = WeekCalendar()
    shared = calendar
    calendar.build(title: title)
    return true
  }

  private func build(title: String) {
    let fixture = Fixture.shared
    let content = FlippedView(frame: NSRect(x: 0, y: 0, width: 700, height: 460))
    content.wantsLayer = true
    content.layer?.backgroundColor = NSColor.white.cgColor
    let grid = Self.grid
    for (index, day) in Self.days.enumerated() {
      let heading = Kit.label(day, size: 13, bold: true)
      heading.alignment = .center
      heading.frame = NSRect(x: grid.minX + CGFloat(index) * Self.dayWidth, y: 16, width: Self.dayWidth, height: 20)
      content.addSubview(heading)
    }
    // Half-hour cells (targets), lines between them, and an hour label every hour.
    for slot in 0..<Int(grid.height / Self.slotHeight) {
      let minute = Self.firstMinute + slot * 30
      let y = grid.minY + CGFloat(slot) * Self.slotHeight
      for (index, day) in Self.days.enumerated() {
        let cell = CalendarCellView(frame: NSRect(x: grid.minX + CGFloat(index) * Self.dayWidth, y: y, width: Self.dayWidth, height: Self.slotHeight))
        cell.wantsLayer = true
        cell.layer?.borderWidth = 0.5
        cell.layer?.borderColor = NSColor(calibratedWhite: minute % 60 == 0 ? 0.78 : 0.9, alpha: 1).cgColor
        let name = "cell-\(day)-\(Self.clock(minute))"
        cell.identifier = NSUserInterfaceItemIdentifier(name)
        fixture.controls[name] = cell
        content.addSubview(cell)
      }
      if minute % 60 == 0 {
        let hour = Kit.label(Self.clock(minute), size: 11, bold: false)
        hour.alignment = .right
        hour.textColor = .darkGray
        hour.frame = NSRect(x: 4, y: y - 7, width: grid.minX - 10, height: 14)
        content.addSubview(hour)
      }
    }
    for item in Self.list(Screens.params) {
      let block = CalendarEventView(id: item.id, title: item.title, owner: item.owner, day: item.day, start: item.start, dur: item.dur)
      // Ids that already read 'ev-…' are not prefixed twice (cu-researcher's 'ev-ev-2').
      let name = WeekCalendar.targetName(item.id)
      block.identifier = NSUserInterfaceItemIdentifier(name)
      fixture.controls[name] = block
      events.append(block)
      content.addSubview(block)
    }
    _ = Windows.open("main", title: title, content: content)
  }

  /// A block lands on a slot: recorded when its day or time changed.
  func place(_ block: CalendarEventView, day: Int, start: Int) {
    let changed = block.day != day || block.start != start
    block.day = day
    block.start = start
    block.refresh()
    if changed {
      Fixture.shared.record("moved", ["event": block.id, "day": Self.days[day], "start": Self.clock(start), "dur": block.dur])
    }
  }

  static func fields() -> [String: Any] {
    guard Screens.current == task, let calendar = shared else { return [:] }
    var out: [String: Any] = [:]
    for block in calendar.events { out[targetName(block.id)] = "\(days[block.day]) \(clock(block.start))-\(clock(block.start + block.dur))" }
    return out
  }

  /// Oracle seam: `moveEvent {id, day, start 'HH:MM'}` places a block as a drop there would.
  /// Test seam: `dragEvent {id, press: {dx, dy}, path: [{day, start} | {x, y}]}` runs the block's own mouse handlers with
  /// synthetic events: press at the block's top-left plus (dx, dy), drag through the points, release at the last.
  static func act(_ step: [String: Any]) -> Bool {
    guard Screens.current == task, let calendar = shared else { return Mail.act(step) }
    if let spec = step["moveEvent"] as? [String: Any], let id = spec["id"] as? String, let block = calendar.events.first(where: { $0.id == id }),
       let dayName = spec["day"] as? String, let day = days.firstIndex(of: dayName), let start = minutes(spec["start"] as? String),
       start >= firstMinute, start + block.dur <= lastMinute {
      calendar.place(block, day: day, start: start)
      return true
    }
    if let spec = step["dragEvent"] as? [String: Any], let id = spec["id"] as? String, let block = calendar.events.first(where: { $0.id == id }),
       let path = spec["path"] as? [[String: Any]], !path.isEmpty, let parent = block.superview, let window = block.window {
      let press = spec["press"] as? [String: Any] ?? [:]
      let start = NSPoint(x: block.frame.minX + CGFloat((press["dx"] as? NSNumber)?.doubleValue ?? 10),
                          y: block.frame.minY + CGFloat((press["dy"] as? NSNumber)?.doubleValue ?? 8))
      // A point in the grid's content coordinates: a slot's top-left plus the press offset, or raw x/y.
      let points: [NSPoint] = path.compactMap { point in
        if let x = (point["x"] as? NSNumber)?.doubleValue, let y = (point["y"] as? NSNumber)?.doubleValue { return NSPoint(x: x, y: y) }
        guard let dayName = point["day"] as? String, let day = days.firstIndex(of: dayName), let minute = minutes(point["start"] as? String) else { return nil }
        let slot = blockFrame(day: day, start: minute, dur: 30)
        return NSPoint(x: slot.minX + (start.x - block.frame.minX), y: slot.minY + (start.y - block.frame.minY))
      }
      func event(_ type: NSEvent.EventType, _ at: NSPoint) -> NSEvent? {
        NSEvent.mouseEvent(with: type, location: parent.convert(at, to: nil), modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime,
                           windowNumber: window.windowNumber, context: nil, eventNumber: 0, clickCount: 1, pressure: 1)
      }
      guard let down = event(.leftMouseDown, start), let last = points.last, let up = event(.leftMouseUp, last) else { return false }
      block.mouseDown(with: down)
      for point in points { if let drag = event(.leftMouseDragged, point) { block.mouseDragged(with: drag) } }
      block.mouseUp(with: up)
      return true
    }
    return false
  }

  static func minutes(_ clock: String?) -> Int? {
    guard let parts = clock?.split(separator: ":"), parts.count == 2, let hours = Int(parts[0]), let minutes = Int(parts[1]) else { return nil }
    return hours * 60 + minutes
  }
}
