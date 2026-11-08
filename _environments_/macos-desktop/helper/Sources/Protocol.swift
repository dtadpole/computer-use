import CoreGraphics
import Foundation

/// The line protocol (design: desktop-extension/helper-and-protocol.md). Requests are `{ id, type, ...fields }`;
/// replies echo `id` with `ok`; events carry `event` and no `id`. Everything a request may carry is listed here,
/// and anything else is refused by name before a request does anything.
enum HelperProtocol {
  static let version = 1
  /// The longest hands-off a settle may ask for; the wait itself stops at the cap (60 s).
  static let maxSettleMs = 60_000

  /// Every request and the only fields it may carry (besides `id` and `type`).
  static let fields: [String: Set<String>] = [
    "scope": ["bundleIds"],
    // `simulateScale` is the design's seam (capture-and-scaling.md): render at that backing scale, above 1, at most 4.
    "capture": ["display", "maxSize", "region", "simulateScale"],
    // `settleMs` (helper-protocol-details.md 0.4.1): the first input after a person's resume waits for hands-off first.
    "input": ["events", "mode", "bundleId", "settleMs"],
    "hitTest": ["xPt", "yPt"],
    "focused": [],
    // CU-187: the element holding a non-collapsed text selection when the focus is not a text entry - role and caption only.
    "selection": [],
    "cursor": [],
    // file-panels.md (Q-D13): the canonical file the frontmost approved app's open/save panel would commit.
    "panelSelection": [],
    "screenText": ["maxChars"],
    "watch": ["fps", "maxSize", "region"],
    "unwatch": [],
    "pauseOnLocalInput": ["on"],
    // The test seam of human-control.md: reports input through a guard, or posts one real untagged event. It can
    // only pause a run.
    "simulateLocalInput": ["kind", "via"],
    // CU-203 (physical-confirmation.md): the prompt only the owner's deliberate hardware click answers; the lock asks.
    "confirmPhysical": ["seat", "task", "timeoutMs"],
    "bye": [],
  ]

  /// Every reply code (helper-and-protocol.md, plus `secure_input` from input-and-targets.md 0.3).
  static let codes: Set<String> = [
    "not_granted", "no_scope", "out_of_scope", "excluded", "pause_not_armed", "local_input", "secure_input",
    "unknown_request", "unknown_field", "invalid_argument", "unsupported", "timeout", "failed", "display_changed",
    // CU-203: a confirmation prompt is already on screen; no display to show one on.
    "busy", "no_display",
  ]

  /// The fields of each input event kind; all are required.
  static let eventFields: [String: Set<String>] = [
    "move": ["kind", "x", "y", "flags"],
    "down": ["kind", "button", "x", "y", "clickCount", "flags"],
    "up": ["kind", "button", "x", "y", "clickCount", "flags"],
    "drag": ["kind", "button", "x", "y", "flags"],
    "scroll": ["kind", "x", "y", "deltaX", "deltaY", "flags"],
    "keyDown": ["kind", "keyCode", "flags"],
    "keyUp": ["kind", "keyCode", "flags"],
    "text": ["kind", "text"],
    // CU-64: hold what is down for ms milliseconds, interruptibly; nothing is posted for it.
    "hold": ["kind", "ms"],
  ]

  /// The longest hold, and the most holding one input request may do in all (CU-64: as `wait`, 10 s).
  static let maxHoldMs = 10_000

  /// The only modifier bits an event may carry: Shift, Control, Option, Command.
  static let allowedFlags: UInt64 = 0x0002_0000 | 0x0004_0000 | 0x0008_0000 | 0x0010_0000
  static let maxEvents = 5000
  static let maxTextUnits = 32
  static let maxPixels = 16384
  static let maxScreenText = 20000
  static let maxScopeApps = 32
}

/// A refusal: the reply `{ ok: false, code, message }`, with the field, grant or bundle id it names.
struct Refusal: Error {
  let code: String
  let message: String
  var field: String? = nil
  var grant: String? = nil
  var bundleId: String? = nil
  /// The global point a point refusal is about (CU-38), so the driver tells it from a frontmost refusal.
  var point: CGPoint? = nil
  /// CU-199: which check refused an out_of_scope - 'front', 'window', 'element', 'covered', 'corner' or 'icon'.
  var check: String? = nil

  static func invalid(_ message: String, field: String? = nil) -> Refusal {
    Refusal(code: "invalid_argument", message: message, field: field)
  }

  func reply(id: JSON?) -> JSON {
    var object: [String: JSON] = ["ok": .bool(false), "code": .string(code), "message": .string(message)]
    if let id { object["id"] = id }
    if let field { object["field"] = .string(field) }
    if let grant { object["grant"] = .string(grant) }
    if let bundleId { object["bundleId"] = .string(bundleId) }
    if let point { object["point"] = .point(point) }
    if let check { object["check"] = .string(check) }
    return .object(object)
  }
}

enum MouseButton: String {
  case left, right, middle, back, forward
}

/// One low-level step the driver planned, in global points.
enum InputEvent: Equatable {
  case move(CGPoint, flags: UInt64)
  case down(MouseButton, CGPoint, clickCount: Int, flags: UInt64)
  case up(MouseButton, CGPoint, clickCount: Int, flags: UInt64)
  case drag(MouseButton, CGPoint, flags: UInt64)
  case scroll(CGPoint, deltaX: Int32, deltaY: Int32, flags: UInt64)
  case keyDown(UInt16, flags: UInt64)
  case keyUp(UInt16, flags: UInt64)
  case text(String)
  /// CU-64: keep what is held for this many milliseconds; interruptible, nothing posted.
  case hold(Int)

  /// The point the event acts at, which must be over an approved app; nil for keyboard events.
  var point: CGPoint? {
    switch self {
    case .move(let point, _), .down(_, let point, _, _), .up(_, let point, _, _), .drag(_, let point, _), .scroll(let point, _, _, _):
      return point
    case .keyDown, .keyUp, .text, .hold:
      return nil
    }
  }

  var holdMs: Int {
    if case .hold(let ms) = self { return ms }
    return 0
  }
}

/// A request after validation: every field present, typed and in range.
enum Request {
  case scope(bundleIds: [String])
  case capture(display: JSON?, maxSize: CGSize, region: CGRect?, simulateScale: Double?)
  case input(events: [InputEvent], mode: String, bundleId: String?, settleMs: Int?)
  case hitTest(CGPoint)
  case focused
  /// CU-187: the element holding the selection (its role and caption), for a copy's source.
  case selection
  /// CU-64: where the pointer is, in global points.
  case cursor
  case panelSelection
  case screenText(maxChars: Int)
  case watch(fps: Double, maxSize: CGSize?, region: CGRect?)
  case unwatch
  case pauseOnLocalInput(on: Bool)
  case simulateLocalInput(kind: String, via: String)
  case confirmPhysical(seat: String, task: String, timeoutMs: Int)
  case bye

  /// The TCC grant a request needs, as the refusal names it; nil when it needs none. Gated requests are refused
  /// `not_granted` before the gated API is ever called.
  var grant: String? {
    switch self {
    case .capture, .watch: return "screen"
    case .input, .hitTest, .focused, .selection, .panelSelection, .screenText: return "accessibility"
    // The pointer's location needs no grant (a CGEvent read; CU-64).
    case .scope, .unwatch, .pauseOnLocalInput, .simulateLocalInput, .bye, .cursor, .confirmPhysical: return nil
    }
  }

  /// What `Grants.has` checks: input needs post-event access as well as Accessibility.
  var grantCheck: String? {
    if case .input = self { return "input" }
    return grant
  }
}

/// Reads one field of a request object, refusing by name.
struct FieldReader {
  let fields: [String: JSON]
  let context: String

  func number(_ name: String) throws -> Double {
    guard let value = fields[name]?.number else { throw Refusal.invalid("\(context) needs a number \(name)", field: name) }
    return value
  }

  func integer(_ name: String, in range: ClosedRange<Int>) throws -> Int {
    guard let value = fields[name]?.integer, range.contains(value) else {
      throw Refusal.invalid("\(context) needs an integer \(name) from \(range.lowerBound) to \(range.upperBound)", field: name)
    }
    return value
  }

  func string(_ name: String) throws -> String {
    guard let value = fields[name]?.string else { throw Refusal.invalid("\(context) needs a string \(name)", field: name) }
    return value
  }

  func bool(_ name: String) throws -> Bool {
    guard let value = fields[name]?.bool else { throw Refusal.invalid("\(context) needs a boolean \(name)", field: name) }
    return value
  }

  func size(_ name: String) throws -> CGSize {
    guard let object = fields[name]?.object, Set(object.keys) == ["width", "height"],
          let width = object["width"]?.integer, let height = object["height"]?.integer,
          (1...HelperProtocol.maxPixels).contains(width), (1...HelperProtocol.maxPixels).contains(height) else {
      throw Refusal.invalid("\(context) needs \(name) as { width, height } in whole pixels from 1 to \(HelperProtocol.maxPixels)", field: name)
    }
    return CGSize(width: width, height: height)
  }

  func rect(_ name: String) throws -> CGRect {
    guard let object = fields[name]?.object, Set(object.keys) == ["x", "y", "width", "height"],
          let x = object["x"]?.number, let y = object["y"]?.number,
          let width = object["width"]?.number, let height = object["height"]?.number, width > 0, height > 0 else {
      throw Refusal.invalid("\(context) needs \(name) as { x, y, width, height } in points", field: name)
    }
    return CGRect(x: x, y: y, width: width, height: height)
  }

  func flags() throws -> UInt64 {
    guard let value = fields["flags"]?.integer, value >= 0, UInt64(value) & ~HelperProtocol.allowedFlags == 0 else {
      throw Refusal.invalid("\(context) needs flags made of the Shift, Control, Option and Command bits only", field: "flags")
    }
    return UInt64(value)
  }

  func point() throws -> CGPoint {
    CGPoint(x: try number("x"), y: try number("y"))
  }

  func button() throws -> MouseButton {
    guard let name = fields["button"]?.string, let button = MouseButton(rawValue: name) else {
      throw Refusal.invalid("\(context) needs button left, right, middle, back or forward", field: "button")
    }
    return button
  }
}

enum RequestParser {
  /// Parse and validate one line. Returns the request's id (when one could be read) and either the request or the
  /// refusal to send back.
  static func parse(_ line: Data) -> (id: JSON?, result: Result<(type: String, request: Request), Refusal>) {
    guard let value = JSONCoding.decode(line) else {
      return (nil, .failure(.invalid("a line is not JSON")))
    }
    guard var object = value.object else {
      return (nil, .failure(.invalid("a request must be a JSON object")))
    }
    guard let id = object.removeValue(forKey: "id"), id.number != nil || id.string != nil else {
      return (nil, .failure(.invalid("a request needs a number or string id", field: "id")))
    }
    guard let type = object.removeValue(forKey: "type")?.string else {
      return (id, .failure(.invalid("a request needs a string type", field: "type")))
    }
    guard let allowed = HelperProtocol.fields[type] else {
      return (id, .failure(Refusal(code: "unknown_request", message: "unknown request '\(type)'")))
    }
    if let unknown = object.keys.sorted().first(where: { !allowed.contains($0) }) {
      return (id, .failure(Refusal(code: "unknown_field", message: "the \(type) request has no field '\(unknown)'", field: unknown)))
    }
    do {
      return (id, .success((type, try build(type: type, fields: object))))
    } catch let refusal as Refusal {
      return (id, .failure(refusal))
    } catch {
      return (id, .failure(.invalid("the \(type) request is malformed")))
    }
  }

  private static func build(type: String, fields: [String: JSON]) throws -> Request {
    let reader = FieldReader(fields: fields, context: "the \(type) request")
    switch type {
    case "scope":
      guard let list = fields["bundleIds"]?.array, (1...HelperProtocol.maxScopeApps).contains(list.count) else {
        throw Refusal.invalid("scope needs bundleIds, a list of 1 to \(HelperProtocol.maxScopeApps) bundle ids", field: "bundleIds")
      }
      let ids = try list.map { item -> String in
        guard let id = item.string, BundleIdentifier.isValid(id) else { throw Refusal.invalid("scope bundleIds holds something that is not a bundle id", field: "bundleIds") }
        return id
      }
      return .scope(bundleIds: ids)
    case "capture":
      let display = fields["display"]
      if let display, display.number == nil, display.string == nil { throw Refusal.invalid("capture display must be a display id", field: "display") }
      var simulateScale: Double? = nil
      if fields["simulateScale"] != nil {
        let scale = try reader.number("simulateScale")
        guard scale > 1, scale <= 4 else { throw Refusal.invalid("capture simulateScale must be a number above 1 and at most 4", field: "simulateScale") }
        simulateScale = scale
      }
      return .capture(display: display, maxSize: try reader.size("maxSize"), region: fields["region"] == nil ? nil : try reader.rect("region"), simulateScale: simulateScale)
    case "input":
      guard let list = fields["events"]?.array, (1...HelperProtocol.maxEvents).contains(list.count) else {
        throw Refusal.invalid("input needs events, a list of 1 to \(HelperProtocol.maxEvents) steps", field: "events")
      }
      let mode = try reader.string("mode")
      guard mode == "global" || mode == "pid" else { throw Refusal.invalid("input mode is global or pid", field: "mode") }
      var bundleId: String? = nil
      if fields["bundleId"] != nil {
        let id = try reader.string("bundleId")
        guard BundleIdentifier.isValid(id) else { throw Refusal.invalid("input bundleId is not a bundle id", field: "bundleId") }
        bundleId = id
      }
      let events = try list.enumerated().map { index, item in try event(item, index: index) }
      guard events.reduce(0, { $0 + $1.holdMs }) <= HelperProtocol.maxHoldMs else {
        throw Refusal.invalid("input holds at most \(HelperProtocol.maxHoldMs / 1000) s in all", field: "events")
      }
      // Q-D3 (measured 2026-11-05, design 0.4.5): pointer events posted to a pid arrive with no window or point and land
      // nowhere, so pid mode is keyboard-only - refused here, before anything is posted, not answered with a silent done.
      if mode == "pid", let index = events.firstIndex(where: { !Events.isKeyStep($0) && $0.holdMs == 0 }) {
        throw Refusal.invalid("pid input is keyboard-only: step \(index) is a pointer event, and pointer events cannot go by pid (no window or point reaches the app); use global", field: "events")
      }
      let settleMs = fields["settleMs"] == nil ? nil : try reader.integer("settleMs", in: 1...HelperProtocol.maxSettleMs)
      return .input(events: events, mode: mode, bundleId: bundleId, settleMs: settleMs)
    case "hitTest":
      return .hitTest(CGPoint(x: try reader.number("xPt"), y: try reader.number("yPt")))
    case "focused":
      return .focused
    case "selection":
      return .selection
    case "cursor":
      return .cursor
    case "panelSelection":
      return .panelSelection
    case "screenText":
      return .screenText(maxChars: try reader.integer("maxChars", in: 1...HelperProtocol.maxScreenText))
    case "watch":
      let fps = try reader.number("fps")
      guard fps > 0, fps <= 5 else { throw Refusal.invalid("watch fps must be above 0 and at most 5", field: "fps") }
      // CU-83: an optional region, exactly capture's (global points), used for every frame - the live view of a run on a
      // simulated display shows that frame, not the whole display.
      return .watch(fps: fps, maxSize: fields["maxSize"] == nil ? nil : try reader.size("maxSize"), region: fields["region"] == nil ? nil : try reader.rect("region"))
    case "unwatch":
      return .unwatch
    case "pauseOnLocalInput":
      return .pauseOnLocalInput(on: try reader.bool("on"))
    case "simulateLocalInput":
      let via = fields["via"]?.string ?? ""
      // CU-203: no 'forged' seam beside confirmPhysical - a helper that trusts hardware-looking events forges none.
      guard ["tap", "idle", "untagged"].contains(via) else { throw Refusal.invalid("simulateLocalInput via is one of tap, idle, untagged", field: "via") }
      let kind = fields["kind"]?.string ?? ""
      guard kind == "key" || kind == "pointer" else { throw Refusal.invalid("simulateLocalInput kind is one of key, pointer", field: "kind") }
      return .simulateLocalInput(kind: kind, via: via)
    case "confirmPhysical":
      let seat = fields["seat"]?.string ?? ""
      guard ConfirmGate.seatValid(seat) else { throw Refusal.invalid("confirmPhysical seat is a roster seat name", field: "seat") }
      let task = fields["task"]?.string ?? ""
      guard task.count <= 500 else { throw Refusal.invalid("confirmPhysical task is at most 500 characters", field: "task") }
      let timeoutMs = fields["timeoutMs"] == nil ? ConfirmGate.maxTimeoutMs : try reader.integer("timeoutMs", in: 1_000...ConfirmGate.maxTimeoutMs)
      return .confirmPhysical(seat: seat, task: task, timeoutMs: timeoutMs)
    case "bye":
      return .bye
    default:
      throw Refusal(code: "unknown_request", message: "unknown request '\(type)'")
    }
  }

  /// One input event, strictly: a known kind, exactly its fields, every value in range.
  static func event(_ value: JSON, index: Int) throws -> InputEvent {
    let context = "input event \(index)"
    guard let object = value.object, let kind = object["kind"]?.string, let allowed = HelperProtocol.eventFields[kind] else {
      throw Refusal.invalid("\(context) needs a kind: move, down, up, drag, scroll, keyDown, keyUp, text or hold", field: "events")
    }
    if let unknown = object.keys.sorted().first(where: { !allowed.contains($0) }) {
      throw Refusal(code: "unknown_field", message: "\(context) (\(kind)) has no field '\(unknown)'", field: unknown)
    }
    if let missing = allowed.sorted().first(where: { object[$0] == nil }) {
      throw Refusal.invalid("\(context) (\(kind)) needs \(missing)", field: missing)
    }
    let reader = FieldReader(fields: object, context: context)
    switch kind {
    case "move":
      return .move(try reader.point(), flags: try reader.flags())
    case "down":
      return .down(try reader.button(), try reader.point(), clickCount: try reader.integer("clickCount", in: 1...3), flags: try reader.flags())
    case "up":
      return .up(try reader.button(), try reader.point(), clickCount: try reader.integer("clickCount", in: 1...3), flags: try reader.flags())
    case "drag":
      return .drag(try reader.button(), try reader.point(), flags: try reader.flags())
    case "scroll":
      let deltaX = try reader.integer("deltaX", in: -10000...10000)
      let deltaY = try reader.integer("deltaY", in: -10000...10000)
      return .scroll(try reader.point(), deltaX: Int32(deltaX), deltaY: Int32(deltaY), flags: try reader.flags())
    case "keyDown":
      return .keyDown(UInt16(try reader.integer("keyCode", in: 0...127)), flags: try reader.flags())
    case "keyUp":
      return .keyUp(UInt16(try reader.integer("keyCode", in: 0...127)), flags: try reader.flags())
    case "hold":
      return .hold(try reader.integer("ms", in: 1...HelperProtocol.maxHoldMs))
    default:
      let text = try reader.string("text")
      guard !text.isEmpty, text.utf16.count <= HelperProtocol.maxTextUnits else {
        throw Refusal.invalid("\(context) needs text of 1 to \(HelperProtocol.maxTextUnits) UTF-16 units", field: "text")
      }
      return .text(text)
    }
  }
}

enum BundleIdentifier {
  /// Reverse-DNS characters only, so a bundle id can never smuggle a path or a pattern.
  static func isValid(_ value: String) -> Bool {
    guard !value.isEmpty, value.utf8.count <= 255, let first = value.unicodeScalars.first, CharacterSet.alphanumerics.contains(first) else { return false }
    return value.unicodeScalars.allSatisfy { scalar in
      scalar.isASCII && (CharacterSet.alphanumerics.contains(scalar) || scalar == "." || scalar == "-")
    }
  }
}
