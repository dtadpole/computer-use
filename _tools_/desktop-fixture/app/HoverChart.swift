import AppKit

// CU-66 S10 'hover-chart' (cu-researcher's spec): a bar chart whose exact values show only while the pointer rests on
// a bar. The axis has gridlines at round numbers and no value labels, so reading a bar's value needs a hover - a
// pointer move without a click, which no other item asks for. A click on a bar changes nothing.

/// One bar: a target, with a tracking area. Resting the pointer inside it for 300 ms after moving there shows its value.
final class ChartBarView: NSView {
  // CU-137: a named accessibility element - the month only, never the value (S10 shows it only on hover).
  override func isAccessibilityElement() -> Bool { true }
  override func accessibilityRole() -> NSAccessibility.Role? { .image }
  override func accessibilityLabel() -> String? { "\(label) bar" }
  let label: String
  let value: Int
  private var restTimer: Timer?
  private var recordedThisEntry = false
  override var isFlipped: Bool { true }
  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

  init(label: String, value: Int, frame: NSRect) {
    self.label = label
    self.value = value
    super.init(frame: frame)
    wantsLayer = true
    layer?.backgroundColor = NSColor(calibratedRed: 0.27, green: 0.5, blue: 0.8, alpha: 1).cgColor
  }
  required init?(coder: NSCoder) { nil }

  override func updateTrackingAreas() {
    super.updateTrackingAreas()
    trackingAreas.forEach(removeTrackingArea)
    addTrackingArea(NSTrackingArea(rect: bounds, options: [.mouseEnteredAndExited, .mouseMoved, .activeAlways, .inVisibleRect], owner: self))
  }

  /// An entry starts the rest only if the pointer has moved since the screen opened (CU-108): a window that opens
  /// under a pointer left resting there gets an entry with no movement, which must not show a value - while a real move
  /// onto a bar arrives as an entry (the move that crosses in), often with no mouseMoved after it.
  override func mouseEntered(with event: NSEvent?) {
    recordedThisEntry = false
    restTimer?.invalidate()
    restTimer = nil
    if HoverChart.shared?.pointerMovedSinceOpen() == true { startRest() }
  }

  private func startRest() {
    restTimer?.invalidate()
    restTimer = Timer.scheduledTimer(withTimeInterval: HoverChart.restSeconds, repeats: false) { [weak self] _ in self?.rested() }
  }

  /// Each move inside the bar restarts the rest; 300 ms without a move shows the value.
  override func mouseMoved(with event: NSEvent?) {
    HoverChart.shared?.moved = true
    startRest()
  }

  override func mouseExited(with event: NSEvent?) {
    restTimer?.invalidate()
    restTimer = nil
    HoverChart.shared?.hide(self)
  }

  /// The pointer rested: show the value and record it, once per entry.
  func rested() {
    restTimer = nil
    HoverChart.shared?.show(self)
    if !recordedThisEntry {
      recordedThisEntry = true
      Fixture.shared.record("hovered", ["bar": label, "value": HoverChart.money(value)])
    }
  }

  override func mouseDown(with event: NSEvent) { Fixture.shared.record("clicked", ["bar": label]) }
}

final class HoverChart {
  static var shared: HoverChart?
  static let task = "hover-chart"
  static let restSeconds = 0.3
  static let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  static let maxValue = 10_000.0
  // The plot area inside the window's content (flipped: y down).
  static let plot = NSRect(x: 70, y: 70, width: 500, height: 250)

  var bars: [ChartBarView] = []
  let tip = NSTextField(labelWithString: "")
  private(set) var shown: ChartBarView?
  /// Where the pointer was when the screen opened, and whether it has moved since (CU-108).
  var openPointer = NSEvent.mouseLocation
  var moved = false

  func pointerMovedSinceOpen() -> Bool {
    if !moved, hypot(NSEvent.mouseLocation.x - openPointer.x, NSEvent.mouseLocation.y - openPointer.y) > 0.5 { moved = true }
    return moved
  }

  static func money(_ value: Int) -> String {
    let formatter = NumberFormatter()
    formatter.numberStyle = .decimal
    formatter.groupingSeparator = ","
    formatter.usesGroupingSeparator = true
    return "$" + (formatter.string(from: NSNumber(value: value)) ?? String(value))
  }

  /// params.bars [{label, value}] (values 1000..9999); without it, twelve months with fixed values.
  static func data(_ params: [String: Any]) -> [(label: String, value: Int)] {
    if let given = params["bars"] as? [[String: Any]], !given.isEmpty {
      return given.prefix(12).compactMap { item in
        guard let label = item["label"] as? String, let value = (item["value"] as? NSNumber)?.intValue else { return nil }
        return (label, max(0, min(9999, value)))
      }
    }
    return months.enumerated().map { index, month in (month, 1000 + (index * 7349 + 2311) % 9000) }
  }

  static func open(_ task: String, title: String) -> Bool {
    guard task == Self.task else { return WeekCalendar.open(task, title: title) }
    let chart = HoverChart()
    shared = chart
    chart.build(title: title)
    return true
  }

  private func build(title: String) {
    let fixture = Fixture.shared
    let content = FlippedView(frame: NSRect(x: 0, y: 0, width: 600, height: 380))
    content.wantsLayer = true
    content.layer?.backgroundColor = NSColor.white.cgColor
    let heading = Kit.label(Screens.params["heading"] as? String ?? "Monthly revenue", size: 16, bold: true)
    heading.frame = NSRect(x: 20, y: 16, width: 560, height: 22)
    content.addSubview(heading)

    // Gridlines at round values, labelled on the axis only.
    let plot = Self.plot
    for step in 0...4 {
      let value = Double(step) * 2500
      let y = plot.maxY - plot.height * CGFloat(value / Self.maxValue)
      let line = NSView(frame: NSRect(x: plot.minX, y: y, width: plot.width, height: 1))
      line.wantsLayer = true
      line.layer?.backgroundColor = NSColor(calibratedWhite: step == 0 ? 0.55 : 0.85, alpha: 1).cgColor
      content.addSubview(line)
      let axis = Kit.label(Self.money(Int(value)).replacingOccurrences(of: "$", with: ""), size: 11, bold: false)
      axis.alignment = .right
      axis.textColor = .darkGray
      axis.frame = NSRect(x: 4, y: y - 8, width: plot.minX - 10, height: 16)
      content.addSubview(axis)
    }

    let data = Self.data(Screens.params)
    let slot = plot.width / CGFloat(max(1, data.count))
    for (index, item) in data.enumerated() {
      let height = plot.height * CGFloat(Double(item.value) / Self.maxValue)
      let bar = ChartBarView(label: item.label, value: item.value,
                             frame: NSRect(x: plot.minX + CGFloat(index) * slot + slot * 0.18, y: plot.maxY - height, width: slot * 0.64, height: height))
      bar.identifier = NSUserInterfaceItemIdentifier("bar-\(item.label)")
      fixture.controls["bar-\(item.label)"] = bar
      bars.append(bar)
      content.addSubview(bar)
      let month = Kit.label(item.label, size: 11, bold: false)
      month.alignment = .center
      month.textColor = .darkGray
      month.frame = NSRect(x: plot.minX + CGFloat(index) * slot, y: plot.maxY + 6, width: slot, height: 16)
      content.addSubview(month)
    }

    tip.font = NSFont.boldSystemFont(ofSize: 12)
    tip.textColor = .white
    tip.alignment = .center
    tip.wantsLayer = true
    tip.drawsBackground = true
    tip.backgroundColor = NSColor(calibratedWhite: 0.15, alpha: 0.92)
    tip.isHidden = true
    content.addSubview(tip)
    _ = Windows.open("main", title: title, content: content)
    openPointer = NSEvent.mouseLocation
  }

  /// The value label above a bar.
  func show(_ bar: ChartBarView) {
    tip.stringValue = Self.money(bar.value)
    let width: CGFloat = 66
    tip.frame = NSRect(x: bar.frame.midX - width / 2, y: max(44, bar.frame.minY - 24), width: width, height: 18)
    tip.isHidden = false
    shown = bar
  }

  func hide(_ bar: ChartBarView) {
    guard shown === bar else { return }
    tip.isHidden = true
    shown = nil
  }

  static func fields() -> [String: Any] {
    guard Screens.current == task, let chart = shared else { return [:] }
    return ["shownBar": chart.shown?.label ?? NSNull(), "barCount": chart.bars.count]
  }

  /// Oracle seam: `hover {target: 'bar-Mar'}` rests on a bar (shows its value, records 'hovered' once).
  /// Test seam: `hoverFor {target, ms, stay, moved}` runs the bar's own tracking handlers - entered, moved (unless
  /// moved: false), real time, exited (unless stay).
  static func act(_ step: [String: Any]) -> Bool {
    guard Screens.current == task, let chart = shared else { return WeekCalendar.act(step) }
    func bar(_ target: Any?) -> ChartBarView? {
      guard let name = target as? String else { return nil }
      return chart.bars.first { "bar-\($0.label)" == name }
    }
    if let spec = step["hover"] as? [String: Any], let target = bar(spec["target"]) {
      target.mouseEntered(with: nil)
      target.rested()
      return true
    }
    if let spec = step["hoverFor"] as? [String: Any], let target = bar(spec["target"]), let ms = (spec["ms"] as? NSNumber)?.doubleValue {
      // An entry by a move (the default), or with `moved: false` an entry with no move since the screen opened - a window
      // opening under a resting pointer (CU-108). `inside: true` adds a move inside the bar after the entry.
      if spec["moved"] as? Bool != false { chart.moved = true } else { chart.openPointer = NSEvent.mouseLocation }
      target.mouseEntered(with: nil)
      if spec["inside"] as? Bool == true { target.mouseMoved(with: nil) }
      RunLoop.current.run(until: Date().addingTimeInterval(ms / 1000))
      if spec["stay"] as? Bool != true { target.mouseExited(with: nil) }
      return true
    }
    return false
  }
}
