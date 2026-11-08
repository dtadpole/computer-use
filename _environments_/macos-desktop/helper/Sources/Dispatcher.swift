import CoreGraphics
import CryptoKit
import Foundation

struct DisplayInfo: Equatable {
  var id: UInt32
  var main: Bool
  /// Global points, origin at the main display's top-left.
  var bounds: CGRect
  /// Backing pixels per point (2 on Retina).
  var scale: Double

  var json: JSON {
    .object(["id": .int(Int(id)), "main": .bool(main), "originPt": .point(bounds.origin), "sizePt": .size(bounds.size), "scale": .double(scale)])
  }
}

struct AppRef: Equatable {
  var bundleId: String?
  var pid: pid_t
}

/// One capture as a capability returns it; the dispatcher adds the geometry it asked for.
struct CaptureShot {
  var png: Data
  var widthPx: Int
  var heightPx: Int
  /// The approved windows: `{bundleId, pid, title, frame}`.
  var windows: [JSON]
  /// CU-101: no approved window was on screen, so nothing was captured and the image is blank (black).
  var noAppWindow = false
}

struct CaptureRequest {
  var display: DisplayInfo
  /// Global points.
  var area: CGRect
  var widthPx: Int
  var heightPx: Int
  /// Approved bundle ids, exclusions already removed.
  var scope: [String]
}

/// What the helper can learn about and do to the Mac - facts and acts only; every rule lives in the dispatcher, so
/// the dry run (DryRun.swift) runs the same rules as a live run. `SystemCapabilities` is the live Mac; `--selftest`
/// runs the dispatcher on a trap that fails if a gated capability is ever reached without its grant.
protocol Capabilities: AnyObject {
  /// `live` or `dry-run`.
  var mode: String { get }
  func grants() -> Grants
  func displays() -> [DisplayInfo]
  func running(_ bundleIds: [String]) -> [AppRef]
  /// The display holding the first approved app's focused window, when it can be told without a missing grant.
  func scopeDisplay(_ bundleIds: [String], grants: Grants) -> UInt32?
  func frontmost() -> AppRef?
  /// The app owning the element at a global point, and its window's title only when that app is in `scope` (so the
  /// live view's marker can be seen in an approved browser, and no other app's titles are read).
  /// `byElement`: the owner is Accessibility's element's process, not the window's (CU-39's mismatch rule; CU-199).
  /// `overlay`: the bundle id of a click-through overlay whose element was skipped for the window beneath (CU-199).
  func owner(at point: CGPoint, scope: [String]) -> (app: AppRef, windowTitle: String?, byElement: Bool, overlay: String?)?
  /// Whether an approved app's window lies beneath the window that owns the point (Q-D11: an overlay over the approved
  /// app is named as such, so the person knows what to quit or move).
  func approvedBeneath(_ point: CGPoint, scope: [String]) -> Bool
  /// What is at a point no approved window owns: bare desktop, a desktop icon, or something else (Q-D12).
  func desktop(at point: CGPoint, scope: [String]) -> DesktopPoint
  /// The frontmost approved app's open/save panel: its folder and file-name field, raw; nil when none is in front.
  func panelSelection(scope: [String]) -> PanelFields?
  /// Bring an app forward (AXFrontmost) and verify it.
  func activate(pid: pid_t) -> Bool
  func capture(_ request: CaptureRequest, completion: @escaping (Result<CaptureShot, Refusal>) -> Void)
  /// Called once before the steps of an input request.
  func beginInput()
  /// Post tagged events in order; false when they could not be posted.
  func post(_ events: [CGEvent], mode: String, pid: pid_t) -> Bool
  /// Where the pointer is now (release events go there, so the person's pointer never moves).
  func pointerLocation() -> CGPoint
  /// `IsSecureEventInputEnabled()`: a password field somewhere has secure input on.
  func secureInputEnabled() -> Bool
  /// A person's input the world itself declares (dry run only); nil on the live Mac.
  func takePendingPersonInput() -> String?
  func hidIdle() -> HIDIdle
  func startTap(_ onLocalInput: @escaping (String) -> Void) -> Bool
  func stopTap()
  /// The `simulateLocalInput via: untagged` seam: one untagged pointer move to where the pointer already is.
  func postUntaggedMove() -> Bool
  /// CU-203: show the confirmation prompt and wait; refused `busy` (one on screen already) or `no_display`.
  func confirmPhysical(seat: String, task: String, timeoutMs: Int) -> Result<ConfirmResult, Refusal>
  /// CU-203: the source of the last untagged event the tap saw, or nil.
  func lastLocalInputSource() -> EventSource?
  /// What a settle did (ignored, settled, capped, gone; how long it waited); only the dry run records it.
  func noteSettle(_ info: JSON)
  /// The element at a point; anything beyond its owner only for an app in `scope` (trajectory-privacy.md).
  func hitTest(_ point: CGPoint, scope: [String]) -> JSON
  func focused(scope: [String]) -> JSON
  /// CU-187: when the focus is not a text entry, the element holding a non-collapsed AXSelectedTextRange in an approved
  /// app - `{role, caption, bundleId, pid}`, nothing else (no value, no title, no selected text); null otherwise.
  func selectionSource(scope: [String]) -> JSON
  /// CU-142: the button Return presses where the focus is - the AXDefaultButton of the first sheet or window up from
  /// the focus - as the element shape hitTest and focused return; null when there is none or it cannot be read.
  /// CU-190: with whether it was read (a positive none reads true; any failed read false).
  func defaultButton(scope: [String]) -> DefaultButtonRead
  /// CU-148: whether a sheet or alert stands in front where the focus is - the focused window holds an AXSheet, the
  /// focus lies inside one, or the front window is an alert (AXDialog / AXSystemDialog); null without a readable focus
  /// in an approved app.
  func sheetPresent(scope: [String]) -> SheetRead?
  /// CU-151: the general pasteboard's change count - a number, never content (D-031, D-056) - read fresh with every
  /// target, so agent core can tell the run's own copy from someone else's; null if it cannot be read.
  func pasteboardChangeCount() -> Int?
  /// CU-157: whether any text entry in the target's window (and any sheet on it) holds text - from character counts
  /// only, never a value (D-060). `point` names the hit-tested target, nil the focused one. Null when anything in the
  /// window cannot be read (a secure field, web content, an entry without a count) or no approved app is there.
  func textEntered(at point: CGPoint?, scope: [String]) -> Bool?
  /// CU-76: a system prompt that can take keys (the capture reply's flag and the key rule).
  func systemPromptPresent(scope: [String]) -> Bool
  func screenText(pid: pid_t, maxChars: Int) -> (text: String, truncated: Bool)
}

extension Capabilities {
  /// CU-76: whether the target at a point, or the focused element, is part of a system prompt - from the same hit test
  /// and focus the protocol reports, so the refusal and the target agree.
  func systemPrompt(at point: CGPoint, scope: [String]) -> Bool { hitTest(point, scope: scope).object?["systemPrompt"]?.bool == true }
  func systemPromptFocused(scope: [String]) -> Bool { focused(scope: scope).object?["systemPrompt"]?.bool == true }
  func systemPromptPresent(scope: [String]) -> Bool { false }
  func noteSettle(_ info: JSON) {}
  func approvedBeneath(_ point: CGPoint, scope: [String]) -> Bool { false }
  func desktop(at point: CGPoint, scope: [String]) -> DesktopPoint { .other }
  func panelSelection(scope: [String]) -> PanelFields? { nil }
  func defaultButton(scope: [String]) -> DefaultButtonRead { .failed }
  func sheetPresent(scope: [String]) -> SheetRead? { nil }
  func pasteboardChangeCount() -> Int? { nil }
  func selectionSource(scope: [String]) -> JSON { .null }
  func textEntered(at point: CGPoint?, scope: [String]) -> Bool? { nil }
}

/// Turns protocol lines into capability calls, in a fixed order for every request:
/// parse and validate (unknown requests and fields refused by name), grant (`not_granted` without touching the gated
/// API), scope (`no_scope`, `excluded`), the local-input pause (`pause_not_armed`), then the request's own rules.
/// Requests run on one serial queue; the local-input guard and the live-view frames run on their own queues and can
/// only stop input or send events. Replies go out through `send`, which is safe from any thread.
final class Dispatcher {
  struct Options {
    var simulateUngranted = false
    /// Seconds between two posted steps of one input request.
    var interEventDelay = 0.008
    /// Longest an input request may take; the driver's request timeout is 30 s.
    var inputBudget = 20.0
    var pollInterval = 0.05
    /// A local-input stop younger than this refuses the next input request, for a driver that does not re-arm.
    var localInputHold = 1.0
    /// The longest a settle waits for hands-off, and how often it looks (helper-protocol-details.md 0.4.1).
    var settleCap = 60.0
    var settlePoll = 0.02
    var guardTolerance = 0.01
    var syntheticResetsIdle = true
    /// The run's private directory (the socket's): captures go there as files named by path and sha256, as the
    /// driver reads them (helper-link.mjs `readCaptureFile`); nil sends them inline.
    var runDir: String?
    /// CU-64 G1: where what a hold keeps down is written (nil: no marker, as in unit tests).
    var heldMarkerPath: String?
  }

  private let capabilities: Capabilities
  private let exclusions: Exclusions
  private let options: Options
  private let send: (JSON) -> Void
  private let onBye: () -> Void
  private let lock = NSLock()
  /// Serialises every post - an input step or a release - so a release never lands inside a step.
  private let postLock = NSLock()
  private var scopeIds: [String]?
  private var guardState: LocalInputGuard
  private var held = HeldInput()
  /// What this helper released at start for a helper killed mid-hold (CU-64 G1), told with the first request.
  var pendingStale: JSON?
  /// The keys that were down when the person's input was last reported (CU-64 G2), until a stop reply takes them.
  private var keysHeldAtLocalInput: [UInt16]?
  private var tapRunning = false
  private var pollTimer: DispatchSourceTimer?
  private var watchTimer: DispatchSourceTimer?
  private var watchDisplay: UInt32?
  private var lastLocalInputAt: Double?
  private var lastLocalInputSentAt = -1.0e9
  private var simulatedIdleInput: String?
  private var lastDetectedBy = "idle"
  private var aborted = false
  private var captureCount = 0
  private let guardQueue = DispatchQueue(label: "com.reflection.cu-helper.local-input")
  private let watchQueue = DispatchQueue(label: "com.reflection.cu-helper.watch")
  private let source: CGEventSource?

  init(capabilities: Capabilities, exclusions: Exclusions = Exclusions(), options: Options = Options(), send: @escaping (JSON) -> Void, onBye: @escaping () -> Void) {
    self.capabilities = capabilities
    self.exclusions = exclusions
    self.options = options
    self.send = send
    self.onBye = onBye
    guardState = LocalInputGuard(tolerance: options.guardTolerance, syntheticResetsIdle: options.syntheticResetsIdle)
    source = Events.source()
  }

  var scope: [String]? {
    lock.lock(); defer { lock.unlock() }
    return scopeIds
  }

  var pauseArmed: Bool {
    lock.lock(); defer { lock.unlock() }
    return guardState.armed
  }

  func grants() -> Grants { options.simulateUngranted ? .none : capabilities.grants() }

  static func grantLabel(_ grant: String) -> String {
    switch grant {
    case "screen": return "Screen Recording"
    case "accessibility": return "Accessibility (with post-event access for input)"
    case "listenEvents": return "Input Monitoring"
    default: return grant
    }
  }

  /// The helper's opening line. A dry run says so; a live hello has exactly the fields the driver's link accepts.
  func hello(token: String) -> JSON {
    var object: [String: JSON] = [
      "type": .string("hello"), "token": .string(token), "protocol": .int(HelperProtocol.version),
      "helperVersion": .string(HelperIdentity.version), "grants": grants().json,
      "displays": .array(capabilities.displays().map { $0.json }),
    ]
    if capabilities.mode != "live" { object["mode"] = .string(capabilities.mode) }
    return .object(object)
  }

  /// The driver is gone (socket loss, a failed write): no queued request runs and the input in flight stops at its
  /// next step. Safe from any thread; `shutdown` follows on the request queue.
  func abort() {
    lock.lock()
    aborted = true
    lock.unlock()
  }

  private var isAborted: Bool {
    lock.lock(); defer { lock.unlock() }
    return aborted
  }

  func handle(line: Data) {
    // CU-64 G1: the driver has accepted the hello (this is its first request), so the stale release can be told now.
    if let stale = pendingStale, case .object(var fields) = stale {
      pendingStale = nil
      fields["event"] = .string("releasedStale")
      send(.object(fields))
      if let path = options.heldMarkerPath { HeldMarker.remove(path) }
    }
    if isAborted { return }
    if line.allSatisfy({ $0 == 0x20 || $0 == 0x09 || $0 == 0x0D }) { return }
    let (id, result) = RequestParser.parse(line)
    switch result {
    case .failure(let refusal):
      send(refusal.reply(id: id))
    case .success(let parsed):
      dispatch(id: id ?? .null, request: parsed.request)
    }
  }

  private func ok(_ id: JSON, _ fields: [String: JSON] = [:]) {
    var object = fields
    object["id"] = id
    object["ok"] = .bool(true)
    send(.object(object))
  }

  private func refuse(_ id: JSON, _ refusal: Refusal) {
    send(refusal.reply(id: id))
  }

  private func reply(_ id: JSON, _ result: Result<[String: JSON], Refusal>) {
    switch result {
    case .success(let fields): ok(id, fields)
    case .failure(let refusal): refuse(id, refusal)
    }
  }

  private func dispatch(id: JSON, request: Request) {
    if let grant = request.grant, let check = request.grantCheck, !grants().has(check) {
      return refuse(id, Refusal(code: "not_granted", message: "the \(Self.grantLabel(grant)) grant is missing; the helper never asks for it, the owner grants it once", grant: grant))
    }
    switch request {
    case .scope(let bundleIds):
      reply(id, doScope(bundleIds))
    case .capture(let display, let maxSize, let region, let simulateScale):
      guard let scope else { return refuse(id, Refusal(code: "no_scope", message: "no scope is set; nothing is captured")) }
      doCapture(display: display, maxSize: maxSize, region: region, simulateScale: simulateScale, scope: scope, form: options.runDir == nil ? "png" : "path") { [weak self] result in self?.reply(id, result) }
    case .input(let events, let mode, let bundleId, let settleMs):
      let result = doInput(events, mode: mode, target: bundleId, settleMs: settleMs)
      // A refusal posts nothing, and nothing may stay held from before it either (R86).
      if case .failure = result { releaseHeld() }
      reply(id, result)
    case .hitTest(let point):
      guard let scope else { return refuse(id, Refusal(code: "no_scope", message: "no scope is set")) }
      ok(id, ["element": capabilities.hitTest(point, scope: scope), "changeCount": capabilities.pasteboardChangeCount().map { .int($0) } ?? .null,
              "textEntered": capabilities.textEntered(at: point, scope: scope).map { .bool($0) } ?? .null])
    case .selection:
      guard let scope else { return refuse(id, Refusal(code: "no_scope", message: "no scope is set")) }
      ok(id, ["element": capabilities.selectionSource(scope: scope)])
    case .focused:
      guard let scope else { return refuse(id, Refusal(code: "no_scope", message: "no scope is set")) }
      // `app`: the approved app whose window `sheet` was read from - with no focused element the driver's placeholder
      // target takes its origin from it (cu-developer-two's #347), else app-policy blocks it.
      let read = capabilities.sheetPresent(scope: scope)
      let defaultButton = capabilities.defaultButton(scope: scope)
      ok(id, ["element": capabilities.focused(scope: scope), "defaultButton": defaultButton.button, "defaultButtonRead": .bool(defaultButton.read),
              "sheet": read.map { .bool($0.sheet) } ?? .null,
              "app": read.map { .object(["bundleId": .string($0.bundleId), "pid": .int(Int($0.pid))]) } ?? .null,
              "changeCount": capabilities.pasteboardChangeCount().map { .int($0) } ?? .null,
              "textEntered": capabilities.textEntered(at: nil, scope: scope).map { .bool($0) } ?? .null])
    case .cursor:
      // CU-64: the real pointer, in global points, and the display it is on (null between displays).
      guard scope != nil else { return refuse(id, Refusal(code: "no_scope", message: "no scope is set")) }
      let point = capabilities.pointerLocation()
      let display = capabilities.displays().first { $0.bounds.contains(point) }
      ok(id, ["xPt": .double(Double(point.x)), "yPt": .double(Double(point.y)), "display": display.map { .int(Int($0.id)) } ?? .null])
    case .panelSelection:
      guard let scope else { return refuse(id, Refusal(code: "no_scope", message: "no scope is set")) }
      let raw = capabilities.panelSelection(scope: scope)
      let canonical = PanelPath.canonical(directory: raw?.directory, fileName: raw?.fileName)
      // `name`: the field's raw text, untrimmed and unresolved (null if none), so agent core resolves a typed path itself
      // and does not depend on this resolution (cu-developer-one, #91).
      // CU-48 A: the folder the panel shows, by its pop-up's display name, and whether the save name field has the
      // keyboard focus - read-only, for agent core's check of a Go to Folder it made itself (D-058); null when unread.
      ok(id, ["path": .optionalString(canonical.path), "directory": .optionalString(canonical.directory), "name": .optionalString(raw?.fileName),
              "shownFolderName": .optionalString(raw?.shownFolderName), "nameFieldFocused": raw?.nameFieldFocused.map { .bool($0) } ?? .null])
    case .screenText(let maxChars):
      reply(id, doScreenText(maxChars))
    case .watch(let fps, let maxSize, let region):
      reply(id, doWatch(fps: fps, maxSize: maxSize, region: region))
    case .unwatch:
      stopWatch()
      ok(id)
    case .pauseOnLocalInput(let on):
      ok(id, setPause(on))
    case .confirmPhysical(let seat, let task, let timeoutMs):
      // Only an unscoped helper asks: the lock launches it after an owner_active refusal, before any run (no input).
      guard scope == nil else { return refuse(id, Refusal(code: "unsupported", message: "confirmPhysical runs only on a helper with no scope set")) }
      switch capabilities.confirmPhysical(seat: seat, task: task, timeoutMs: timeoutMs) {
      case .success(let result): ok(id, result.json.object ?? [:])
      case .failure(let refusal): refuse(id, refusal)
      }
    case .simulateLocalInput(let kind, let via):
      reply(id, doSimulate(kind: kind, via: via))
    case .bye:
      shutdown()
      ok(id)
      onBye()
    }
  }

  /// Release whatever is held, drop the scope, stop the guard, the tap and the frames: without a scope nothing is
  /// captured or posted. Runs on `bye`, socket loss and the run's end.
  func shutdown() {
    releaseHeld(returnToPress: true)
    stopWatch()
    lock.lock()
    scopeIds = nil
    guardState.disarm()
    pollTimer?.cancel()
    pollTimer = nil
    let tap = tapRunning
    tapRunning = false
    lock.unlock()
    if tap { capabilities.stopTap() }
  }

  // MARK: Scope

  private func inScope(_ bundleId: String?) -> Bool {
    guard let bundleId else { return false }
    lock.lock(); defer { lock.unlock() }
    return (scopeIds ?? []).contains(bundleId) && !exclusions.isExcluded(bundleId)
  }

  private func doScope(_ bundleIds: [String]) -> Result<[String: JSON], Refusal> {
    if let excluded = bundleIds.first(where: { exclusions.isExcluded($0) }) {
      return .failure(Refusal(code: "excluded", message: "\(excluded) is a hard exclusion and is never in scope", bundleId: excluded))
    }
    var ids: [String] = []
    for id in bundleIds where !ids.contains(id) { ids.append(id) }
    releaseHeld()
    lock.lock()
    scopeIds = ids
    lock.unlock()
    let running = capabilities.running(ids).map { JSON.object(["bundleId": .optionalString($0.bundleId), "pid": .int(Int($0.pid))]) }
    let display = capabilities.scopeDisplay(ids, grants: grants()).map { JSON.int(Int($0)) } ?? .null
    return .success(["bundleIds": .array(ids.map { .string($0) }), "running": .array(running), "display": display])
  }

  // MARK: Local-input pause

  private func setPause(_ on: Bool) -> [String: JSON] {
    if !on {
      releaseHeld(returnToPress: true)
      lock.lock()
      guardState.disarm()
      pollTimer?.cancel()
      pollTimer = nil
      let tap = tapRunning
      tapRunning = false
      lock.unlock()
      if tap { capabilities.stopTap() }
      return ["armed": .bool(false), "via": .array([])]
    }
    lock.lock()
    guardState.arm(now: Self.now())
    lastLocalInputAt = nil
    lastPostedAt = nil
    simulatedIdleInput = nil
    let needPoll = pollTimer == nil
    // The tap needs Accessibility (active, pass-through) or Input Monitoring (listen-only); never asked for.
    let needTap = !tapRunning && (grants().accessibility || grants().listenEvents)
    lock.unlock()
    if needPoll {
      let timer = DispatchSource.makeTimerSource(queue: guardQueue)
      timer.schedule(deadline: .now() + options.pollInterval, repeating: options.pollInterval, leeway: .milliseconds(5))
      timer.setEventHandler { [weak self] in self?.pollGuard() }
      lock.lock()
      pollTimer = timer
      lock.unlock()
      timer.resume()
    }
    if needTap {
      let started = capabilities.startTap { [weak self] kind in self?.reportLocalInput(kind, via: "tap") }
      lock.lock()
      tapRunning = started
      lock.unlock()
    }
    lock.lock()
    let via: [JSON] = tapRunning ? [.string("idleCounter"), .string("eventTap")] : [.string("idleCounter")]
    lock.unlock()
    return ["armed": .bool(true), "via": .array(via)]
  }

  private static func now() -> Double { ProcessInfo.processInfo.systemUptime }

  private func pollGuard() {
    if let kind = guardDetects() { reportLocalInput(kind, via: "idle") }
  }

  /// The kind of the person's input the guards see now, or nil: the world's declared input (dry run), the `idle`
  /// seam, then the HID idle counter.
  private func guardDetects() -> String? {
    if let kind = capabilities.takePendingPersonInput() { return kind }
    lock.lock()
    if let kind = simulatedIdleInput {
      simulatedIdleInput = nil
      lock.unlock()
      return kind
    }
    let state = guardState
    lock.unlock()
    guard state.armed else { return nil }
    let idle = capabilities.hidIdle()
    return state.detects(hidIdle: idle.any, now: Self.now()) ? localInputKind(keyIdle: idle.key, pointerIdle: idle.pointer) : nil
  }

  /// The person used the Mac: note it (the input in flight stops at its next step), release what is held,
  /// re-baseline the guard and tell the driver - time and kind only, at most twice a second unless `force`d.
  private func reportLocalInput(_ kind: String, via: String, force: Bool = false) {
    let now = Self.now()
    lock.lock()
    guard guardState.armed else { lock.unlock(); return }
    lastLocalInputAt = now
    lastDetectedBy = via
    guardState.latch(now: now)
    let shouldSend = force || now - lastLocalInputSentAt >= 0.5
    if shouldSend { lastLocalInputSentAt = now }
    // CU-64 G2: what was down when the person's input came, for the stop's reply (the release below empties it).
    if !held.keys.isEmpty { keysHeldAtLocalInput = held.keys }
    lock.unlock()
    releaseHeld()
    if shouldSend {
      var event: [String: JSON] = ["event": .string("localInput"), "at": .string(ISO8601DateFormatter().string(from: Date())), "kind": .string(kind == "key" ? "key" : "pointer")]
      // CU-203's measurement: where the person's event came from (pid and state only), when the tap saw it.
      if via == "tap", let source = capabilities.lastLocalInputSource() { event["source"] = source.json }
      send(.object(event))
    }
  }

  /// Whether input must stop now: the guards see the person this instant, or a stop is still fresh.
  private func localInputNow() -> Bool {
    if let kind = guardDetects() {
      reportLocalInput(kind, via: "idle")
      return true
    }
    lock.lock(); defer { lock.unlock() }
    if let at = lastLocalInputAt, Self.now() - at < options.localInputHold { return true }
    return false
  }

  /// The seam (human-control.md, helper-link.mjs SEAM_REQUESTS): report the person's input through one guard, or post
  /// a real untagged event and let the guards find it. `localInput` goes out before the reply `{detectedBy}`.
  private func doSimulate(kind: String, via: String) -> Result<[String: JSON], Refusal> {
    guard pauseArmed else { return .failure(Refusal(code: "pause_not_armed", message: "the local-input pause is not armed")) }
    switch via {
    case "tap":
      lock.lock()
      let tap = tapRunning
      lock.unlock()
      guard tap else { return .failure(Refusal(code: "not_granted", message: "the Accessibility grant is missing, so no event tap is installed", grant: "accessibility")) }
      reportLocalInput(kind, via: "tap", force: true)
      return .success(["detectedBy": .string("tap")])
    case "idle":
      reportLocalInput(kind, via: "idle", force: true)
      return .success(["detectedBy": .string("idle")])
    default:
      // A real untagged event is synthetic input: only with the grant and an approved app in front (D-024).
      guard grants().has("input") else { return .failure(Refusal(code: "not_granted", message: "the Accessibility grant is missing, so no event can be posted", grant: "accessibility")) }
      guard scope != nil else { return .failure(Refusal(code: "no_scope", message: "no scope is set")) }
      let front = capabilities.frontmost()
      guard inScope(front?.bundleId) else { return .failure(Refusal(code: "out_of_scope", message: "the frontmost app is not an approved app of this run", bundleId: front?.bundleId, check: "front")) }
      lock.lock()
      let before = lastLocalInputAt
      lock.unlock()
      guard capabilities.postUntaggedMove() else { return .failure(Refusal(code: "failed", message: "the untagged event could not be posted")) }
      // The tap reports at once; the idle counter is read here until it shows the event, for at most a second.
      let deadline = Self.now() + 1.0
      while Self.now() < deadline {
        lock.lock()
        let seen = lastLocalInputAt != before
        let by = lastDetectedBy
        lock.unlock()
        if seen {
          var reply: [String: JSON] = ["detectedBy": .string(by)]
          // CU-203: the source the tap saw for it - the measurement of whether a forged pid survives posting.
          if by == "tap", let source = capabilities.lastLocalInputSource() { reply["source"] = source.json }
          return .success(reply)
        }
        if let found = guardDetects() {
          reportLocalInput(found, via: "idle", force: true)
          return .success(["detectedBy": .string("idle")])
        }
        usleep(10_000)
      }
      return .failure(Refusal(code: "failed", message: "no guard saw the untagged event within a second"))
    }
  }

  // MARK: Input

  /// Post what is held back up, tagged: where the pointer is now (the person's takeover - their pointer is never
  /// moved), or, for our own stop, back at the press point (CU-45).
  func releaseHeld(returnToPress: Bool = false) {
    postLock.lock()
    defer { postLock.unlock() }
    lock.lock()
    let empty = held.isEmpty
    let target = lastInputPid
    let mode = lastInputMode
    lock.unlock()
    guard !empty else { return }
    lock.lock()
    let steps = held.releaseSteps(at: capabilities.pointerLocation(), returnToPress: returnToPress)
    // Whichever path releases (a stop, the guard on the person's input, bye), a cancelled drag is told in the reply.
    if held.dragged && !held.buttons.isEmpty { cancelledDrag = true }
    for step in steps { if case .up(_, let point, _, _) = step { releasedAt = point } }
    // The up goes back to the press point exactly when the release steps start with Escape and a held move back.
    if steps.contains(where: { if case .drag = $0 { return true }; return false }) { releasedAtPress = true }
    lock.unlock()
    var released = HeldInput()
    lock.lock()
    released = held
    lock.unlock()
    for step in steps {
      // Only what was posted counts as released; a failed post stays held for the next release. A release is our own
      // event too, so the guard notes it first (Q-D1) - it does not count as a posted step for a settle.
      guard let events = Events.make(step, source: source) else { continue }
      lock.lock()
      guardState.notePosted(now: Self.now())
      lock.unlock()
      if capabilities.post(events, mode: mode, pid: target ?? 0) { released.note(step) }
    }
    lock.lock()
    held = released
    lock.unlock()
    clearHeldMarkerIfReleased()
  }

  private var lastInputMode = "global"
  /// Whether a release during the current input request cancelled a drag with Escape (CU-44).
  private var cancelledDrag = false
  /// CU-199: the click-through overlays skipped in the current action (their bundle ids), named in its reply.
  private var overlaysSkipped: Set<String> = []
  /// Where a held button came up during the current input request, if one did (CU-45), and whether that was back at
  /// its press point (our own stop of a drag).
  private var releasedAt: CGPoint?
  private var releasedAtPress = false
  private var lastInputPid: pid_t?
  /// When an input step was last posted - not a release, which follows a report and must not hide it from a settle.
  private var lastPostedAt: Double?

  private enum SettleOutcome: String { case ignored, settled, capped, gone }

  /// A person's resume settles first (helper-protocol-details.md 0.4.1). Honoured only when this helper has itself
  /// seen local input since its last posted step (a `local_input` stop or a `localInput` report) - otherwise a driver
  /// could clear the idle guard with any pause - else ignored. Honoured, it waits at most `settleCap` until the person
  /// has been hands-off for `seconds`, by the idle counter and by the guards' last report (the tap may see input the
  /// counter does not), then takes that moment as the guard's new baseline. Nothing is posted meanwhile.
  private func settle(seconds: Double) -> SettleOutcome {
    let started = Self.now()
    lock.lock()
    let seen = lastLocalInputAt
    let posted = lastPostedAt
    lock.unlock()
    guard let seen, posted.map({ seen > $0 }) ?? true else {
      capabilities.noteSettle(.object(["outcome": .string(SettleOutcome.ignored.rawValue), "waitedMs": .int(0)]))
      return .ignored
    }
    var outcome = SettleOutcome.capped
    while true {
      if isAborted { outcome = .gone; break }
      let now = Self.now()
      lock.lock()
      let last = lastLocalInputAt
      lock.unlock()
      let quiet = min(capabilities.hidIdle().any, last.map { now - $0 } ?? .infinity)
      if quiet >= seconds {
        lock.lock()
        guardState.latch(now: now)
        lastLocalInputAt = nil
        lock.unlock()
        outcome = .settled
        break
      }
      if now - started >= options.settleCap { break }
      usleep(useconds_t(options.settlePoll * 1_000_000))
    }
    capabilities.noteSettle(.object(["outcome": .string(outcome.rawValue), "waitedMs": .int(Int(((Self.now() - started) * 1000).rounded()))]))
    return outcome
  }

  /// What the person or the policy must see about the app under a point: in scope and not excluded, and not the
  /// live view's window.
  /// Whether the point may be touched; when not, who owns it and whether that window covers an approved app.
  /// `check` (CU-199) says which check refused: 'window' (no window named, or one not approved), 'element' (Accessibility's
  /// element at the point is another process's), 'covered' (another app's window over an approved app).
  private func touchable(_ point: CGPoint) -> (ok: Bool, bundleId: String?, covers: Bool, check: String?) {
    guard let owner = capabilities.owner(at: point, scope: scope ?? []) else { return (false, nil, false, "window") }
    if let title = owner.windowTitle, title.contains(HelperIdentity.liveViewMarker) { return (false, owner.app.bundleId, false, "window") }
    let ok = inScope(owner.app.bundleId)
    // CU-199: every overlay skipped for an approved window is reported, so relaxed refusals can be counted.
    if ok, let overlay = owner.overlay { lock.lock(); overlaysSkipped.insert(overlay); lock.unlock() }
    if ok { return (true, owner.app.bundleId, false, nil) }
    let covers = capabilities.approvedBeneath(point, scope: scope ?? [])
    return (false, owner.app.bundleId, covers, covers ? "covered" : owner.byElement ? "element" : "window")
  }

  /// How long input waits for an app it brought forward to be steadily in front (CU-82).
  static let activationSettle = 1.5

  /// The frontmost app once `pid` has been in front on two reads 50 ms apart, within `timeout`; nil if never.
  private func settledFront(_ pid: pid_t, timeout: Double) -> AppRef? {
    let deadline = Self.now() + timeout
    var seenAt: Double?
    while true {
      let now = Self.now()
      if let front = capabilities.frontmost(), front.pid == pid {
        if let seen = seenAt, now - seen >= 0.05 { return front }
        if seenAt == nil { seenAt = now }
      } else {
        seenAt = nil
      }
      if now >= deadline { return nil }
      usleep(25_000)
    }
  }

  /// The words a system_prompt refusal uses (cu-developer-one's ask: neutral, the person answers it).
  static let promptMessage = "a system permission prompt is in the way; the person answers it"

  /// CU-76, before anything is posted: a pointer step (not a drag's held move) onto a system prompt, or any key step
  /// while one has the keyboard focus.
  private func systemPromptRefusal(_ events: [InputEvent]) -> Refusal? {
    let allowed = scope ?? []
    for event in events {
      if let point = event.point, !Self.isHeldMove(event), capabilities.systemPrompt(at: point, scope: allowed) {
        return Refusal(code: "system_prompt", message: Self.promptMessage, point: point)
      }
    }
    if events.contains(where: { Events.isKeyStep($0) }) && promptHoldsKeys() {
      return Refusal(code: "system_prompt", message: Self.promptMessage)
    }
    return nil
  }

  /// Keys go nowhere near a system prompt, checked when the input arrives and before every key step (cu-verifier: the
  /// driver's state lags its captures): the focused element is part of one, or a prompt can take keys - the frontmost
  /// app is a prompt process, or the front approved app's window or sheet is an AXSystemDialog - so Return or Space
  /// cannot answer a prompt that is key while the Accessibility focus sits elsewhere.
  private func promptHoldsKeys() -> Bool {
    let allowed = scope ?? []
    return capabilities.systemPromptFocused(scope: allowed) || capabilities.systemPromptPresent(scope: allowed)
  }

  static func isHeldMove(_ event: InputEvent) -> Bool {
    if case .drag = event { return true }
    return false
  }

  /// Why a step's point may not be touched, or nil: press, release and plain moves need an approved owner; a drag's
  /// held moves may also cross bare desktop, never a screen corner nor a desktop icon (Q-D12).
  private func refusal(for event: InputEvent, at point: CGPoint, later: Bool) -> (message: String, bundleId: String?, check: String)? {
    let held = Self.isHeldMove(event)
    if held && DragPath.nearCorner(point, displays: capabilities.displays()) {
      return ("the drag passes a screen corner at (\(Int(point.x)), \(Int(point.y))), which can trigger a hot corner; keep the path away from corners", nil, "corner")
    }
    let check = touchable(point)
    if check.ok { return nil }
    if held {
      switch capabilities.desktop(at: point, scope: scope ?? []) {
      case .bare: return nil
      case .icon:
        return ("the drag crosses a desktop icon at (\(Int(point.x)), \(Int(point.y))) (Finder's desktop), which counts as a window; move the path around it", check.bundleId, "icon")
      case .other: break
      }
    }
    return (Self.notTouchable(point, (check.ok, check.bundleId, check.covers), later: later), check.bundleId, check.check ?? "window")
  }

  /// Q-D11 (design 0.4.12): an out_of_scope point is said to be covered by another app's window when one lies over an
  /// approved app. The app is named only in the reply's bundleId (with point), never in this text, so a layer that
  /// forwards the message cannot tell the model (CU-47); never the window's frame or title (trajectory-privacy.md).
  private static func notTouchable(_ point: CGPoint, _ check: (ok: Bool, bundleId: String?, covers: Bool), later: Bool) -> String {
    if check.covers {
      return "the point (\(Int(point.x)), \(Int(point.y))) is covered by another app's window above an approved app; quit or move that app (bundleId names it)"
    }
    return later ? "the point is no longer over an approved app" : "the point (\(Int(point.x)), \(Int(point.y))) is not over an approved app"
  }

  /// CU-199: the overlays skipped in this action, sorted, or nil when none.
  private func skippedOverlays() -> JSON? {
    lock.lock(); let names = overlaysSkipped.sorted(); lock.unlock()
    return names.isEmpty ? nil : .array(names.map { .string($0) })
  }

  private func stopped(_ index: Int, _ code: String, _ message: String, bundleId: String? = nil, point: CGPoint? = nil, extra: [String: JSON] = [:]) -> Result<[String: JSON], Refusal> {
    // CU-64 G2: the keys down when the person's input came - their first keystroke may have carried a held modifier.
    lock.lock()
    let heldKeys = code == "local_input" ? (keysHeldAtLocalInput ?? held.keys) : held.keys
    keysHeldAtLocalInput = nil
    lock.unlock()
    // The person's takeover leaves their pointer where it is; any other stop is ours, so the drag goes back first.
    releaseHeld(returnToPress: code != "local_input")
    lock.lock()
    let cancelsDrag = cancelledDrag
    let released = releasedAt
    let atPress = releasedAtPress
    lock.unlock()
    // A release after a stop is a real event for the app: say so, so a 'stopped' reply is never read as 'nothing
    // happened' and retried into a duplicate (CU-45).
    // Back at the press point, the drag was cancelled there; agent core owns any sentence about a possible effect (CU-47).
    let told = released.map { point -> String in
      if atPress { return message + "; the drag was cancelled and its button released back where it went down (\(Int(point.x)), \(Int(point.y)))" }
      let at = code == "local_input" ? "at the person's pointer (\(Int(point.x)), \(Int(point.y)))" : "at (\(Int(point.x)), \(Int(point.y)))"
      return message + "; a held button was released \(at) after the stop, so the app may have acted on it - check before retrying"
    } ?? message
    var fields: [String: JSON] = ["done": .bool(false), "failedAt": .int(index), "code": .string(code), "message": .string(told),
                                  "frontmostBundleId": .optionalString(capabilities.frontmost()?.bundleId)]
    if let bundleId { fields["bundleId"] = .string(bundleId) }
    if let point { fields["point"] = .point(point) }
    // The release reason, for the trajectory: a drag stopped mid-path was cancelled with Escape, not dropped (CU-44).
    if cancelsDrag { fields["cancelledDrag"] = .bool(true) }
    // Where a held button came up: the effect of a release is the app's, so the reply says where it happened (CU-45).
    if let released { fields["releasedAt"] = .point(released) }
    if code == "local_input" && !heldKeys.isEmpty { fields["heldKeys"] = .array(heldKeys.map { .int(Int($0)) }) }
    if let skipped = skippedOverlays() { fields["overlaySkipped"] = skipped }
    fields.merge(extra) { current, _ in current }
    clearHeldMarkerIfReleased()
    return .success(fields)
  }

  /// One action's steps. Before anything is posted: the scope, the armed pause (either mode, D-024), an approved app
  /// in front (brought forward through AXFrontmost when the driver names one, then verified) and every point over an
  /// approved app - else nothing moves. Before every step: the guards, the frontmost app, the app under the point,
  /// and secure event input for key steps - else the step and the rest are not posted, what is held is released,
  /// and the reply is `done: false` with the index of the first step not posted (R65, R79, R83, R86).
  private func doInput(_ events: [InputEvent], mode: String, target: String?, settleMs: Int? = nil) -> Result<[String: JSON], Refusal> {
    guard scope != nil else { return .failure(Refusal(code: "no_scope", message: "no scope is set; nothing is posted")) }
    guard pauseArmed else { return .failure(Refusal(code: "pause_not_armed", message: "input runs only while the local-input pause is armed")) }
    lock.lock(); overlaysSkipped = []; lock.unlock()
    // The settle comes before the checks below, so they see the Mac as it is after the wait.
    if let settleMs {
      switch settle(seconds: Double(settleMs) / 1000) {
      case .ignored, .settled: break
      case .gone: return stopped(0, "failed", "the driver is gone")
      case .capped: return stopped(0, "local_input", "the person kept using the Mac through the settle")
      }
    }
    var front = capabilities.frontmost()
    var activated: pid_t?
    if !inScope(front?.bundleId) {
      guard let target, inScope(target), let app = capabilities.running([target]).first else {
        return .failure(Refusal(code: "out_of_scope", message: "the frontmost app is not an approved app of this run", bundleId: front?.bundleId, check: "front"))
      }
      // CU-82: macOS may take longer than the activation call waits, or flip back once; the target counts as in front
      // only when two reads 50 ms apart agree, within 1.5 s - whatever the call itself answered.
      _ = capabilities.activate(pid: app.pid)
      guard let settled = settledFront(app.pid, timeout: Self.activationSettle) else {
        front = capabilities.frontmost()
        return .failure(Refusal(code: "out_of_scope", message: "the frontmost app is not an approved app of this run", bundleId: front?.bundleId, check: "front"))
      }
      front = settled
      activated = app.pid
    }
    guard let targetPid = front?.pid else { return .failure(Refusal(code: "out_of_scope", message: "no frontmost app", check: "front")) }
    // CU-76: a system permission prompt is the person's - no pointer step onto one, no key step while one has focus.
    if let refusal = systemPromptRefusal(events) { return .failure(refusal) }
    var checked: [CGPoint] = []
    var checkedHeld: [CGPoint] = []
    for event in events {
      guard let point = event.point, !(Self.isHeldMove(event) ? checkedHeld : checked).contains(point) else { continue }
      if let refused = refusal(for: event, at: point, later: false) {
        return .failure(Refusal(code: "out_of_scope", message: refused.message, bundleId: refused.bundleId, point: point, check: refused.check))
      }
      if Self.isHeldMove(event) { checkedHeld.append(point) } else { checked.append(point) }
    }
    if localInputNow() { return stopped(0, "local_input", "the person is using the Mac") }
    lock.lock()
    lastInputMode = mode
    lastInputPid = targetPid
    cancelledDrag = false
    releasedAt = nil
    releasedAtPress = false
    lock.unlock()
    capabilities.beginInput()
    let started = Self.now()
    for (index, event) in events.enumerated() {
      if index > 0 && options.interEventDelay > 0 { usleep(useconds_t(options.interEventDelay * 1_000_000)) }
      if isAborted { return stopped(index, "failed", "the driver is gone") }
      if localInputNow() { return stopped(index, "local_input", "the person used the Mac, so the action stopped") }
      if Self.now() - started > options.inputBudget { return stopped(index, "timeout", "the input took longer than \(Int(options.inputBudget)) s") }
      if case .hold(let ms) = event {
        if let stop = hold(ms, index: index, started: started) { return stop }
        continue
      }
      var nowFront = capabilities.frontmost()
      // CU-82: right after our own activation, a brief flip back is macOS settling, not the person: the first step
      // waits up to 300 ms for the target to be steadily in front again before it stops.
      if index == 0, !inScope(nowFront?.bundleId), let activated, let settled = settledFront(activated, timeout: 0.3) { nowFront = settled }
      if !inScope(nowFront?.bundleId) {
        return stopped(index, "out_of_scope", "an app outside the scope came to the front; it is the person's", bundleId: nowFront?.bundleId, extra: ["check": .string("front")])
      }
      if let point = event.point, let refused = refusal(for: event, at: point, later: true) {
        return stopped(index, "out_of_scope", refused.message, bundleId: refused.bundleId, point: point, extra: ["check": .string(refused.check)])
      }
      if Events.isKeyStep(event) && capabilities.secureInputEnabled() {
        return stopped(index, "secure_input", "secure event input is on (a password field); typing there is the person's")
      }
      if let point = event.point, !Self.isHeldMove(event), capabilities.systemPrompt(at: point, scope: scope ?? []) {
        return stopped(index, "system_prompt", Self.promptMessage, point: point)
      }
      if Events.isKeyStep(event) && promptHoldsKeys() {
        return stopped(index, "system_prompt", Self.promptMessage)
      }
      guard let built = Events.make(event, source: source) else { return stopped(index, "failed", "step \(index) could not be built") }
      postLock.lock()
      // Noted before the post: our event may reset the HID idle counter at once (Q-D1).
      lock.lock()
      guardState.notePosted(now: Self.now())
      lock.unlock()
      let posted = capabilities.post(built, mode: mode, pid: targetPid)
      lock.lock()
      if posted {
        held.note(event)
        lastPostedAt = Self.now()
      }
      lock.unlock()
      postLock.unlock()
      if !posted { return stopped(index, "failed", "step \(index) could not be posted") }
      // CU-64 G1 (cu-verifier): the marker follows every key or button that goes down - a drag holds its button for
      // seconds - and goes once everything is up again.
      switch event {
      case .down, .keyDown: writeHeldMarker()
      case .up, .keyUp: clearHeldMarkerIfReleased()
      default: break
      }
    }
    clearHeldMarkerIfReleased()
    var reply: [String: JSON] = ["done": .bool(true), "frontmostBundleId": .optionalString(capabilities.frontmost()?.bundleId)]
    if let skipped = skippedOverlays() { reply["overlaySkipped"] = skipped }
    return .success(reply)
  }

  /// CU-64: keep what is held for `ms`, in 10 ms slices, re-checking what every step checks - the person's input
  /// (release within a slice), the driver gone, an app outside the scope in front (the keys would apply to it), the
  /// input budget - and stopping as a stopped drag does: everything held comes up in reverse. Before waiting, what is
  /// held is written to the marker, so a helper killed mid-hold has its keys released by the next one (G1).
  private func hold(_ ms: Int, index: Int, started: Double) -> Result<[String: JSON], Refusal>? {
    writeHeldMarker()
    let until = Self.now() + Double(ms) / 1000
    while true {
      let now = Self.now()
      if now >= until { return nil }
      if isAborted { return stopped(index, "failed", "the driver is gone") }
      if localInputNow() { return stopped(index, "local_input", "the person used the Mac, so the action stopped") }
      if now - started > options.inputBudget { return stopped(index, "timeout", "the input took longer than \(Int(options.inputBudget)) s") }
      let front = capabilities.frontmost()
      if !inScope(front?.bundleId) { return stopped(index, "out_of_scope", "an app outside the scope came to the front; it is the person's", bundleId: front?.bundleId, extra: ["check": .string("front")]) }
      usleep(useconds_t(max(1_000, min(10_000, (until - now) * 1_000_000))))
    }
  }

  // MARK: Held-keys marker (CU-64 G1)

  /// What is held, written before a hold waits: {pid, keys, buttons}. A helper that dies mid-hold cannot post the ups;
  /// the next one finds the marker and does.
  private func writeHeldMarker() {
    guard let path = options.heldMarkerPath else { return }
    lock.lock()
    let keys = held.keys.map { Int($0) }
    let buttons = held.buttons.map(\.rawValue)
    lock.unlock()
    guard !keys.isEmpty || !buttons.isEmpty else { return }
    let object: JSON = .object(["pid": .int(Int(getpid())), "keys": .array(keys.map { .int($0) }), "buttons": .array(buttons.map { .string($0) })])
    HeldMarker.write(object, to: path)
  }

  private func clearHeldMarkerIfReleased() {
    guard let path = options.heldMarkerPath else { return }
    lock.lock()
    let empty = held.isEmpty
    lock.unlock()
    if empty { HeldMarker.remove(path) }
  }

  /// At start: a marker left by a helper that is gone - its keys and buttons still down - is released first, tagged,
  /// before anything else, and told with the driver's first request (`releasedStale`). The marker outlives the report
  /// (cu-verifier): rewritten as released here, removed only once the event has gone out, so a run that never gets as
  /// far as a request leaves the next helper the report - without posting the ups twice.
  func releaseStaleHeld() -> JSON? {
    guard let path = options.heldMarkerPath, let marker = HeldMarker.read(path) else { return nil }
    if let pid = marker.pid, pid != getpid(), kill(pid, 0) == 0 { return nil }
    let report = { (posted: Int) -> JSON in
      .object(["keys": .array(marker.keys.map { .int(Int($0)) }), "buttons": .array(marker.buttons.map { .string($0.rawValue) }), "posted": .int(posted)])
    }
    if marker.released { return report(0) }
    var steps: [InputEvent] = marker.keys.reversed().map { .keyUp($0, flags: 0) }
    let location = capabilities.pointerLocation()
    steps += marker.buttons.map { .up($0, location, clickCount: 1, flags: 0) }
    var released: [InputEvent] = []
    for step in steps {
      guard let events = Events.make(step, source: source) else { continue }
      if capabilities.post(events, mode: "global", pid: 0) { released.append(step) }
    }
    HeldMarker.write(.object(["pid": .int(Int(getpid())), "keys": .array(marker.keys.map { .int(Int($0)) }),
                              "buttons": .array(marker.buttons.map { .string($0.rawValue) }), "released": .bool(true)]), to: path)
    return report(released.count)
  }

  // MARK: Capture and frames

  private func pickDisplay(_ value: JSON?) -> Result<DisplayInfo, Refusal> {
    let displays = capabilities.displays()
    if let value {
      guard let id = value.integer, let display = displays.first(where: { Int($0.id) == id }) else {
        return .failure(Refusal(code: "display_changed", message: "the display \(value.integer.map(String.init) ?? "?") is not attached", field: "display"))
      }
      return .success(display)
    }
    guard let display = displays.first(where: { $0.main }) ?? displays.first else { return .failure(Refusal(code: "failed", message: "no display is active")) }
    return .success(display)
  }

  /// The pixel size of a capture of `area` points at `scale`, each axis clamped to `maxSize` - the fake helper's
  /// rule, so the driver's frame arithmetic holds against both. Never below one pixel.
  static func captureSize(area: CGSize, scale: Double, maxSize: CGSize) -> (width: Int, height: Int) {
    let width = max(1, min(Int((Double(area.width) * scale).rounded(.down)), Int(maxSize.width)))
    let height = max(1, min(Int((Double(area.height) * scale).rounded(.down)), Int(maxSize.height)))
    return (width, height)
  }

  /// Write a capture into the run directory as `capture-<pid>-<n>.png` (mode 600, never over a file) and name it by
  /// path and sha256; the driver checks both and deletes the file.
  private func captureFile(_ png: Data) -> [String: JSON]? {
    guard let dir = options.runDir else { return nil }
    lock.lock()
    captureCount += 1
    let path = (dir as NSString).appendingPathComponent("capture-\(getpid())-\(captureCount).png")
    lock.unlock()
    let fd = open(path, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0o600)
    guard fd >= 0 else { return nil }
    defer { close(fd) }
    let written = png.withUnsafeBytes { raw in write(fd, raw.baseAddress, raw.count) }
    guard written == png.count else { unlink(path); return nil }
    return ["path": .string(path), "sha256": .string(SHA256.hash(data: png).map { String(format: "%02x", $0) }.joined())]
  }

  private func doCapture(display value: JSON?, maxSize: CGSize, region: CGRect?, simulateScale: Double? = nil, scope: [String], form: String = "png", completion: @escaping (Result<[String: JSON], Refusal>) -> Void) {
    let display: DisplayInfo
    switch pickDisplay(value) {
    case .failure(let refusal): return completion(.failure(refusal))
    case .success(let picked): display = picked
    }
    if let region, !display.bounds.insetBy(dx: -0.5, dy: -0.5).contains(region) {
      return completion(.failure(.invalid("the capture region is not inside the run's display", field: "region")))
    }
    let area = region ?? display.bounds
    // The seam renders as if the display had the simulated backing scale; the points stay the display's own.
    let scale = simulateScale ?? display.scale
    let size = Self.captureSize(area: area.size, scale: scale, maxSize: maxSize)
    let allowed = scope.filter { !exclusions.isExcluded($0) }
    let request = CaptureRequest(display: display, area: area, widthPx: size.width, heightPx: size.height, scope: allowed)
    capabilities.capture(request) { [weak self] result in
      guard let self else { return }
      switch result {
      case .failure(let refusal): completion(.failure(refusal))
      case .success(let shot):
        if region == nil {
          self.lock.lock()
          self.watchDisplay = display.id
          self.lock.unlock()
        }
        var fields: [String: JSON] = [
          "widthPx": .int(shot.widthPx), "heightPx": .int(shot.heightPx),
          "scale": .double(scale), "display": .int(Int(display.id)), "originPt": .point(area.origin), "sizePt": .size(area.size),
          "frontmostBundleId": .optionalString(self.capabilities.frontmost()?.bundleId), "windows": .array(shot.windows),
          // CU-76: a system permission prompt that can take keys (frontmost, or the front approved app's system dialog).
          "systemPrompt": .bool(self.capabilities.systemPromptPresent(scope: allowed)),
        ]
        // CU-101: the frame is blank because no approved window is on screen - never to be read as a real screen.
        if shot.noAppWindow { fields["noAppWindow"] = .bool(true) }
        if form == "path" {
          guard let file = self.captureFile(shot.png) else { return completion(.failure(Refusal(code: "failed", message: "the capture file could not be written"))) }
          fields.merge(file) { _, new in new }
        } else {
          fields["png"] = .string(shot.png.base64EncodedString())
        }
        completion(.success(fields))
      }
    }
  }

  private func doWatch(fps: Double, maxSize: CGSize?, region: CGRect?) -> Result<[String: JSON], Refusal> {
    guard scope != nil else { return .failure(Refusal(code: "no_scope", message: "no scope is set; nothing is captured")) }
    if let region {
      // Checked now against the display the frames come from, so a bad region is refused rather than yielding no frames.
      lock.lock()
      let watched = watchDisplay.map { JSON.int(Int($0)) }
      lock.unlock()
      switch pickDisplay(watched) {
      case .failure(let refusal): return .failure(refusal)
      case .success(let display):
        guard display.bounds.insetBy(dx: -0.5, dy: -0.5).contains(region) else { return .failure(.invalid("the watch region is not inside the run's display", field: "region")) }
      }
    }
    stopWatch()
    let busy = BusyFlag()
    let size = maxSize ?? CGSize(width: 960, height: 540)
    let timer = DispatchSource.makeTimerSource(queue: watchQueue)
    timer.schedule(deadline: .now() + 1.0 / fps, repeating: 1.0 / fps, leeway: .milliseconds(10))
    timer.setEventHandler { [weak self] in
      // A lost grant or scope stops the frames; it never prompts.
      guard let self, self.grants().screen, let scope = self.scope, busy.claim() else { return }
      self.lock.lock()
      let display = self.watchDisplay.map { JSON.int(Int($0)) }
      self.lock.unlock()
      self.doCapture(display: display, maxSize: size, region: region, scope: scope) { [weak self] result in
        busy.release()
        guard let self, case .success(let fields) = result, let png = fields["png"] else { return }
        self.lock.lock()
        let still = self.watchTimer != nil
        self.lock.unlock()
        guard still else { return }
        // The same window list as a capture reply (each shown window's owner by bundle id), so the driver's
        // capture_leak check covers the live view's frames too (CU-12).
        self.send(.object([
          "event": .string("frame"), "png": png, "widthPx": fields["widthPx"] ?? .null, "heightPx": fields["heightPx"] ?? .null,
          // What the frame shows, in global points: the display, or the watch region (CU-83).
          "originPt": fields["originPt"] ?? .null, "sizePt": fields["sizePt"] ?? .null,
          "windows": fields["windows"] ?? .array([]), "at": .string(ISO8601DateFormatter().string(from: Date())),
          "noAppWindow": fields["noAppWindow"] ?? .bool(false),
        ]))
      }
    }
    lock.lock()
    watchTimer = timer
    lock.unlock()
    timer.resume()
    return .success([:])
  }

  private func stopWatch() {
    lock.lock()
    let timer = watchTimer
    watchTimer = nil
    lock.unlock()
    timer?.cancel()
  }

  // MARK: Screen text

  private func doScreenText(_ maxChars: Int) -> Result<[String: JSON], Refusal> {
    guard scope != nil else { return .failure(Refusal(code: "no_scope", message: "no scope is set")) }
    guard let front = capabilities.frontmost(), inScope(front.bundleId), let bundleId = front.bundleId else {
      return .failure(Refusal(code: "out_of_scope", message: "the frontmost app is not an approved app of this run", bundleId: capabilities.frontmost()?.bundleId, check: "front"))
    }
    let (text, truncated) = capabilities.screenText(pid: front.pid, maxChars: maxChars)
    return .success(["text": .string(text), "truncated": .bool(truncated), "bundleId": .string(bundleId)])
  }
}

/// A flag one tick claims and its capture releases, so a slow capture never piles up behind the timer.
final class BusyFlag: @unchecked Sendable {
  private let lock = NSLock()
  private var busy = false

  func claim() -> Bool {
    lock.lock()
    defer { lock.unlock() }
    if busy { return false }
    busy = true
    return true
  }

  func release() {
    lock.lock()
    busy = false
    lock.unlock()
  }
}
