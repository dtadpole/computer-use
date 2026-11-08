import CoreGraphics
import Foundation

/// Planned steps as tagged CGEvents (input-and-targets.md). Building a CGEvent needs no grant; posting one does, and
/// only the capability implementations post. The dry run builds the very same events and records them read back.
enum Events {
  /// A private event source: the person's held keys never leak into our events, every event carries the tag, and
  /// our posting never suppresses the person's own mouse or keyboard (so the local-input pause can see them).
  static func source() -> CGEventSource? {
    guard let source = CGEventSource(stateID: .privateState) else { return nil }
    source.userData = HelperIdentity.eventTag
    source.localEventsSuppressionInterval = 0
    let permit: CGEventFilterMask = [.permitLocalMouseEvents, .permitLocalKeyboardEvents, .permitSystemDefinedEvents]
    source.setLocalEventsFilterDuringSuppressionState(permit, state: .eventSuppressionStateSuppressionInterval)
    source.setLocalEventsFilterDuringSuppressionState(permit, state: .eventSuppressionStateRemoteMouseDrag)
    return source
  }

  static func cgButton(_ button: MouseButton) -> CGMouseButton {
    switch button {
    case .left: return .left
    case .right: return .right
    case .middle: return .center
    case .back: return CGMouseButton(rawValue: 3) ?? .center
    case .forward: return CGMouseButton(rawValue: 4) ?? .center
    }
  }

  private static func mouseType(_ button: MouseButton, down: Bool) -> CGEventType {
    switch button {
    case .left: return down ? .leftMouseDown : .leftMouseUp
    case .right: return down ? .rightMouseDown : .rightMouseUp
    default: return down ? .otherMouseDown : .otherMouseUp
    }
  }

  private static func dragType(_ button: MouseButton) -> CGEventType {
    switch button {
    case .left: return .leftMouseDragged
    case .right: return .rightMouseDragged
    default: return .otherMouseDragged
    }
  }

  private static func mouse(_ type: CGEventType, _ button: MouseButton, _ point: CGPoint, source: CGEventSource?, clickCount: Int?, flags: UInt64) -> CGEvent? {
    guard let event = CGEvent(mouseEventSource: source, mouseType: type, mouseCursorPosition: point, mouseButton: cgButton(button)) else { return nil }
    if let clickCount { event.setIntegerValueField(.mouseEventClickState, value: Int64(clickCount)) }
    if button != .left && button != .right { event.setIntegerValueField(.mouseEventButtonNumber, value: Int64(cgButton(button).rawValue)) }
    event.flags = CGEventFlags(rawValue: flags)
    return event
  }

  private static func key(_ code: UInt16, down: Bool, source: CGEventSource?, flags: UInt64) -> CGEvent? {
    guard let event = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: down) else { return nil }
    event.flags = CGEventFlags(rawValue: flags)
    return event
  }

  /// The CGEvents of one planned step, each tagged; a `text` step is a key down and up carrying the Unicode string.
  static func make(_ step: InputEvent, source: CGEventSource?) -> [CGEvent]? {
    var made: [CGEvent]?
    switch step {
    case .move(let point, let flags):
      made = mouse(.mouseMoved, .left, point, source: source, clickCount: nil, flags: flags).map { [$0] }
    case .down(let button, let point, let clickCount, let flags):
      made = mouse(mouseType(button, down: true), button, point, source: source, clickCount: clickCount, flags: flags).map { [$0] }
    case .up(let button, let point, let clickCount, let flags):
      made = mouse(mouseType(button, down: false), button, point, source: source, clickCount: clickCount, flags: flags).map { [$0] }
    case .drag(let button, let point, let flags):
      made = mouse(dragType(button), button, point, source: source, clickCount: nil, flags: flags).map { [$0] }
    case .scroll(let point, let deltaX, let deltaY, let flags):
      if let event = CGEvent(scrollWheelEvent2Source: source, units: .pixel, wheelCount: 2, wheel1: deltaY, wheel2: deltaX, wheel3: 0) {
        event.location = point
        event.flags = CGEventFlags(rawValue: flags)
        made = [event]
      }
    case .keyDown(let code, let flags):
      made = key(code, down: true, source: source, flags: flags).map { [$0] }
    case .keyUp(let code, let flags):
      made = key(code, down: false, source: source, flags: flags).map { [$0] }
    case .hold:
      // Nothing is posted for a hold (CU-64); the dispatcher waits instead.
      made = []
    case .text(let text):
      // Apps read at most about twenty UTF-16 units from one key event, so longer text goes as several key pairs of
      // at most `textChunkUnits` units, never splitting a character.
      var pairs: [CGEvent] = []
      for chunk in textChunks(text) {
        let units = Array(chunk.utf16)
        guard let down = key(0, down: true, source: source, flags: 0), let up = key(0, down: false, source: source, flags: 0) else { return nil }
        units.withUnsafeBufferPointer { buffer in
          down.keyboardSetUnicodeString(stringLength: buffer.count, unicodeString: buffer.baseAddress)
          up.keyboardSetUnicodeString(stringLength: buffer.count, unicodeString: buffer.baseAddress)
        }
        pairs += [down, up]
      }
      made = pairs.isEmpty ? nil : pairs
    }
    made?.forEach { $0.setIntegerValueField(.eventSourceUserData, value: HelperIdentity.eventTag) }
    return made
  }

  /// The most UTF-16 units one text key event carries (the driver's TEXT_CHUNK_UNITS).
  static let textChunkUnits = 16

  /// `text` cut into pieces of at most `textChunkUnits` UTF-16 units on character boundaries.
  static func textChunks(_ text: String) -> [String] {
    var chunks: [String] = []
    var current = ""
    for character in text {
      if current.utf16.count + character.utf16.count > textChunkUnits, !current.isEmpty {
        chunks.append(current)
        current = ""
      }
      current.append(character)
    }
    if !current.isEmpty { chunks.append(current) }
    return chunks
  }

  /// A CGEvent read back field by field: what the dry run records and the unit tests check.
  static func describe(_ event: CGEvent) -> JSON {
    var object: [String: JSON] = [
      "type": .int(Int(event.type.rawValue)),
      "x": .double(Double(event.location.x)),
      "y": .double(Double(event.location.y)),
      "flags": .int(Int(event.flags.rawValue & HelperProtocol.allowedFlags)),
      "tag": .int(Int(event.getIntegerValueField(.eventSourceUserData))),
    ]
    switch event.type {
    case .keyDown, .keyUp:
      object["keyCode"] = .int(Int(event.getIntegerValueField(.keyboardEventKeycode)))
      var length = 0
      var buffer = [UniChar](repeating: 0, count: 64)
      event.keyboardGetUnicodeString(maxStringLength: buffer.count, actualStringLength: &length, unicodeString: &buffer)
      if length > 0 { object["text"] = .string(String(utf16CodeUnits: buffer, count: length)) }
    case .scrollWheel:
      object["deltaY"] = .int(Int(event.getIntegerValueField(.scrollWheelEventPointDeltaAxis1)))
      object["deltaX"] = .int(Int(event.getIntegerValueField(.scrollWheelEventPointDeltaAxis2)))
    default:
      object["clickState"] = .int(Int(event.getIntegerValueField(.mouseEventClickState)))
      object["button"] = .int(Int(event.getIntegerValueField(.mouseEventButtonNumber)))
    }
    return .object(object)
  }

  /// Whether a step is a key step, checked against secure event input before it is posted.
  static func isKeyStep(_ step: InputEvent) -> Bool {
    switch step {
    case .keyDown, .keyUp, .text: return true
    default: return false
    }
  }
}

/// What the helper holds down (input-and-targets.md, release guarantee, R86): every button and key it pressed and
/// has not released. On pause, stop, failure, `out_of_scope`, `bye` or socket loss their tagged up events are posted
/// first, so nothing stays pressed mid-drag or mid-chord.
struct HeldInput: Equatable {
  enum Item: Equatable {
    case key(UInt16)
    case button(MouseButton)
  }

  /// What is down, in the order it went down.
  private(set) var order: [Item] = []
  /// Whether a held move was posted since a button went down: releasing then would drop what is dragged where the
  /// pointer is, so the release cancels the drag first (Q-D12).
  private(set) var dragged = false
  /// Where each held button went down, for an abort that returns there before releasing (CU-45).
  private(set) var pressedAt: [MouseButton: CGPoint] = [:]
  /// The Escape key, which cancels a dragging session.
  static let escape: UInt16 = 53

  var keys: [UInt16] { order.compactMap { if case .key(let code) = $0 { return code } else { return nil } } }
  var buttons: [MouseButton] { order.compactMap { if case .button(let button) = $0 { return button } else { return nil } } }
  var isEmpty: Bool { order.isEmpty }

  /// Record a step that was posted.
  mutating func note(_ step: InputEvent) {
    switch step {
    case .down(let button, let point, _, _):
      if !order.contains(.button(button)) { order.append(.button(button)) }
      pressedAt[button] = point
    case .up(let button, _, _, _):
      order.removeAll { $0 == .button(button) }
      pressedAt[button] = nil
      if buttons.isEmpty { dragged = false }
    case .keyDown(let code, _):
      if !order.contains(.key(code)) { order.append(.key(code)) }
    case .keyUp(let code, _):
      order.removeAll { $0 == .key(code) }
    case .drag:
      if !buttons.isEmpty { dragged = true }
    case .move, .scroll, .text, .hold:
      break
    }
  }

  /// The up steps that release everything held, in reverse order of pressing (a shift-drag ends with the button,
  /// then Shift), buttons coming up where the pointer is now so the person's pointer is never moved.
  /// An aborted drag first sends Escape, which ends an AppKit dragging session without a drop (Q-D12, CU-44) - before
  /// anything else, so no destination sees a later move. With `returnToPress` (our own stop, never the person's
  /// takeover) the pointer then goes back to where the button went down, in one held move, and the button comes up
  /// there: a view that tracks the mouse itself (a slider, a canvas, a list reorder, CU Fixture's DropBoard) ignores
  /// Escape, and a release at its origin is usually a no-op for it (CU-45; cu-researcher's order).
  func releaseSteps(at location: CGPoint, returnToPress: Bool = false) -> [InputEvent] {
    let dragging = dragged && !buttons.isEmpty
    let origin = returnToPress && dragging ? buttons.first.flatMap { button in pressedAt[button].map { (button, $0) } } : nil
    var steps: [InputEvent] = dragging ? [.keyDown(Self.escape, flags: 0), .keyUp(Self.escape, flags: 0)] : []
    if let origin { steps.append(.drag(origin.0, origin.1, flags: 0)) }
    return steps + order.reversed().map { item in
      switch item {
      case .key(let code): return InputEvent.keyUp(code, flags: 0)
      case .button(let button): return InputEvent.up(button, origin?.1 ?? location, clickCount: 1, flags: 0)
      }
    }
  }

  mutating func clear() {
    dragged = false
    pressedAt = [:]
    order = []
  }
}
