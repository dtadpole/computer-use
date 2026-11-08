import ApplicationServices
import CoreGraphics
import Foundation

/// The local-input pause (human-control.md, R77). Two guards:
///
/// - **The HID idle counter** (primary), `CGEventSource.secondsSinceLastEventType(.hidSystemState, ...)`, readable
///   with no grant (measured). Read before every low-level step and polled while armed. `LocalInputGuard` decides
///   from it whether the person acted since the pause was armed (or re-armed at a resume) - pure, unit-tested.
/// - **An active pass-through session tap** (second, human-control.md 0.3.2), created only when the Accessibility
///   preflight already says yes, so it never prompts and Input Monitoring is never needed; it hands every event on
///   unchanged. With Input Monitoring granted instead, a listen-only tap does the same. Any event without the
///   helper's tag is the person's.
///
/// Either one stops input at the next step and sends `localInput` with the time and kind only - never which key or
/// where (trajectory-privacy.md).
struct LocalInputGuard: Equatable {
  /// Seconds of slack between our clock and the counter's stamp.
  var tolerance: Double
  /// Whether our own posted events reset the HID idle counter (Q-D1). On the Mac mini they do (2026-11-05: the only
  /// HID input in the window was the first live run's own click, which the guard then took for a person's), so this is
  /// on by default: the baseline follows our last post, and input in the gap between two of our posts can be missed -
  /// the tap, which tells our tagged events from untagged ones, covers that.
  var syntheticResetsIdle: Bool
  /// How long after we note a post its event may still reach the counter (CGEventPost is asynchronous).
  static let postSlack = 0.05

  private(set) var baselineAt: Double?
  private(set) var lastSyntheticAt: Double?

  init(tolerance: Double = 0.01, syntheticResetsIdle: Bool = true) {
    self.tolerance = tolerance
    self.syntheticResetsIdle = syntheticResetsIdle
  }

  var armed: Bool { baselineAt != nil }

  /// Arm, or re-arm: only input after `now` counts. The driver re-arms at a person's resume, which forgets the input
  /// that led to it (the click on Resume itself).
  mutating func arm(now: Double) {
    baselineAt = now
    lastSyntheticAt = nil
  }

  mutating func disarm() {
    baselineAt = nil
    lastSyntheticAt = nil
  }

  /// Called just before each post, so a poll between the post and this note cannot see our own event as a person's.
  mutating func notePosted(now: Double) {
    lastSyntheticAt = now + Self.postSlack
  }

  /// After a report: wait for input newer than `now` before reporting again.
  mutating func latch(now: Double) {
    if baselineAt != nil { baselineAt = now }
  }

  /// Whether the counter shows the person's input since the baseline; `hidIdle` is the idle seconds read at `now`.
  func detects(hidIdle: Double, now: Double) -> Bool {
    guard let baselineAt, hidIdle.isFinite, hidIdle >= 0 else { return false }
    var since = now - baselineAt
    if syntheticResetsIdle, let last = lastSyntheticAt, last > baselineAt { since = now - last }
    return hidIdle + tolerance < since
  }
}

/// Which kind of input was most recent, from per-type idle seconds: `key` or `pointer`, never which key or where.
func localInputKind(keyIdle: Double, pointerIdle: Double) -> String {
  keyIdle <= pointerIdle ? "key" : "pointer"
}

struct HIDIdle {
  var any: Double
  var key: Double
  var pointer: Double

  static let never = HIDIdle(any: 1.0e9, key: 1.0e9, pointer: 1.0e9)

  /// The live counter; needs no grant.
  static func read() -> HIDIdle {
    func idle(_ type: CGEventType) -> Double { CGEventSource.secondsSinceLastEventType(.hidSystemState, eventType: type) }
    // `kCGAnyInputEventType` is `~0` in C; imported C enums keep unknown raw values.
    let any = idle(CGEventType(rawValue: ~UInt32(0)) ?? .mouseMoved)
    let key = min(idle(.keyDown), idle(.keyUp), idle(.flagsChanged))
    let pointer = [CGEventType.mouseMoved, .leftMouseDown, .leftMouseUp, .rightMouseDown, .rightMouseUp, .otherMouseDown,
                   .otherMouseUp, .leftMouseDragged, .rightMouseDragged, .otherMouseDragged, .scrollWheel].map(idle).min() ?? any
    return HIDIdle(any: any, key: key, pointer: pointer)
  }
}

/// The event tap on the main run loop. `start` creates it only when a preflight already says it may exist: active
/// (pass-through) with Accessibility, else listen-only with Input Monitoring; never otherwise, so it never prompts.
final class EventTap {
  static let shared = EventTap()
  private var tap: CFMachPort?
  private var tapSource: CFRunLoopSource?
  private let lock = NSLock()
  private var callback: ((String) -> Void)?

  private func onMain<T>(_ body: () -> T) -> T {
    Thread.isMainThread ? body() : DispatchQueue.main.sync(execute: body)
  }

  /// Start the tap; false when neither grant is there (then it is never created, so it never prompts).
  func start(_ onLocalInput: @escaping (String) -> Void) -> Bool {
    let active = AXIsProcessTrusted()
    guard active || CGPreflightListenEventAccess() else { return false }
    lock.lock()
    callback = onLocalInput
    lock.unlock()
    return onMain {
      if tap != nil { return true }
      let types: [CGEventType] = [
        .keyDown, .keyUp, .flagsChanged, .leftMouseDown, .leftMouseUp, .rightMouseDown, .rightMouseUp, .otherMouseDown,
        .otherMouseUp, .mouseMoved, .leftMouseDragged, .rightMouseDragged, .otherMouseDragged, .scrollWheel,
      ]
      let mask = types.reduce(CGEventMask(0)) { $0 | (CGEventMask(1) << CGEventMask($1.rawValue)) }
      // Active taps hand each event back unchanged (the callback never alters or drops one).
      guard let port = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap, options: active ? .defaultTap : .listenOnly,
                                         eventsOfInterest: mask, callback: localInputTapCallback, userInfo: nil) else {
        return false
      }
      let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, port, 0)
      CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
      CGEvent.tapEnable(tap: port, enable: true)
      tap = port
      tapSource = source
      return true
    }
  }

  func stop() {
    lock.lock()
    callback = nil
    lock.unlock()
    onMain {
      if let tap {
        CGEvent.tapEnable(tap: tap, enable: false)
        if let tapSource { CFRunLoopRemoveSource(CFRunLoopGetMain(), tapSource, .commonModes) }
        CFMachPortInvalidate(tap)
      }
      tap = nil
      tapSource = nil
    }
  }

  fileprivate func reenable() {
    if let tap { CGEvent.tapEnable(tap: tap, enable: true) }
  }

  /// CU-203: the source of the last untagged event the tap saw (pid, state; never a position or a key).
  private var lastSeenSource: EventSource?

  var lastSource: EventSource? {
    lock.lock(); defer { lock.unlock() }
    return lastSeenSource
  }

  fileprivate func report(_ kind: String, source: EventSource) {
    lock.lock()
    let call = callback
    lastSeenSource = source
    lock.unlock()
    call?(kind)
  }
}

/// The tap's C callback: no captures, so it reaches the tap through its shared instance. The event always passes
/// through unchanged, whether the tap is active or listen-only.
private func localInputTapCallback(proxy: CGEventTapProxy, type: CGEventType, event: CGEvent, userInfo: UnsafeMutableRawPointer?) -> Unmanaged<CGEvent>? {
  if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
    EventTap.shared.reenable()
  } else if event.getIntegerValueField(.eventSourceUserData) != HelperIdentity.eventTag {
    let key = type == .keyDown || type == .keyUp || type == .flagsChanged
    let source = EventSource(tag: event.getIntegerValueField(.eventSourceUserData), pid: event.getIntegerValueField(.eventSourceUnixProcessID),
                             state: event.getIntegerValueField(.eventSourceStateID))
    EventTap.shared.report(key ? "key" : "pointer", source: source)
  }
  return Unmanaged.passUnretained(event)
}
