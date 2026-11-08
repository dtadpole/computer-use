import CoreGraphics
import Foundation
import Security

/// Capabilities that must never be reached in the self-test: every call is recorded as a violation. The self-test
/// runs with no grants, so a correct dispatcher refuses every gated request before it gets here.
final class TrapCapabilities: Capabilities {
  private(set) var calls: [String] = []
  let mode = "selftest"

  private func trap(_ name: String) -> Refusal {
    calls.append(name)
    return Refusal(code: "failed", message: "trap: \(name) must not be called in the self-test")
  }

  /// Reading the grants is how a request is gated; the self-test fixes them to none.
  func grants() -> Grants { .none }
  func displays() -> [DisplayInfo] { _ = trap("displays"); return [] }
  func running(_ bundleIds: [String]) -> [AppRef] { _ = trap("running"); return [] }
  func scopeDisplay(_ bundleIds: [String], grants: Grants) -> UInt32? { _ = trap("scopeDisplay"); return nil }
  func frontmost() -> AppRef? { _ = trap("frontmost"); return nil }
  func owner(at point: CGPoint, scope: [String]) -> (app: AppRef, windowTitle: String?, byElement: Bool, overlay: String?)? { _ = trap("owner"); return nil }
  func activate(pid: pid_t) -> Bool { _ = trap("activate"); return false }
  func capture(_ request: CaptureRequest, completion: @escaping (Result<CaptureShot, Refusal>) -> Void) { completion(.failure(trap("capture"))) }
  func beginInput() { _ = trap("beginInput") }
  func post(_ events: [CGEvent], mode: String, pid: pid_t) -> Bool { _ = trap("post"); return false }
  func pointerLocation() -> CGPoint { _ = trap("pointerLocation"); return .zero }
  func secureInputEnabled() -> Bool { _ = trap("secureInputEnabled"); return true }
  func takePendingPersonInput() -> String? { nil }
  func hidIdle() -> HIDIdle { _ = trap("hidIdle"); return .never }
  func startTap(_ onLocalInput: @escaping (String) -> Void) -> Bool { _ = trap("startTap"); return false }
  func stopTap() { _ = trap("stopTap") }
  func postUntaggedMove() -> Bool { _ = trap("postUntaggedMove"); return false }
  func confirmPhysical(seat: String, task: String, timeoutMs: Int) -> Result<ConfirmResult, Refusal> { _ = trap("confirmPhysical"); return .failure(Refusal(code: "failed", message: "self-test")) }
  func lastLocalInputSource() -> EventSource? { nil }
  func hitTest(_ point: CGPoint, scope: [String]) -> JSON { _ = trap("hitTest"); return .null }
  func focused(scope: [String]) -> JSON { _ = trap("focused"); return .null }
  func defaultButton(scope: [String]) -> DefaultButtonRead { _ = trap("defaultButton"); return .failed }
  func sheetPresent(scope: [String]) -> SheetRead? { _ = trap("sheetPresent"); return nil }
  func pasteboardChangeCount() -> Int? { _ = trap("pasteboardChangeCount"); return nil }
  func menuKey(keyCode: Int, flags: UInt64, scope: [String]) -> MenuKey.Read { _ = trap("menuKey"); return .unreadable("trapped") }
  func textEntered(at point: CGPoint?, scope: [String]) -> Bool? { _ = trap("textEntered"); return nil }
  func selectionSource(scope: [String]) -> JSON { _ = trap("selectionSource"); return .null }
  func screenText(pid: pid_t, maxChars: Int) -> (text: String, truncated: Bool) { _ = trap("screenText"); return ("", false) }
}

/// `--selftest`: runs without a socket and exercises only the JSON framing, request validation and the
/// `not_granted` paths. Grants are fixed to none whatever the Mac says, so no gated API can be reached; the real
/// preflights (documented not to prompt) are read only to report them. Prints one JSON summary; exit 0 on pass.
enum SelfTest {
  private struct Check {
    let name: String
    let input: [String]
    let expect: [[String: JSON]]
  }

  static func run(out: String? = nil) -> Int32 {
    let trap = TrapCapabilities()
    var replies: [JSON] = []
    var byeCalled = false
    var options = Dispatcher.Options()
    options.simulateUngranted = true
    let dispatcher = Dispatcher(capabilities: trap, options: options, send: { replies.append($0) }, onBye: { byeCalled = true })
    var failures: [String] = []
    var passed = 0

    /// Feed raw chunks through the splitter into the dispatcher; returns the replies they produced.
    func feed(_ chunks: [String], maxBytes: Int = 8 * 1024 * 1024) -> (replies: [JSON], tooLong: Bool) {
      replies.removeAll()
      var splitter = LineSplitter(maxBytes: maxBytes)
      for chunk in chunks {
        do {
          for line in try splitter.push(Data(chunk.utf8)) { dispatcher.handle(line: line) }
        } catch {
          return (replies, true)
        }
      }
      return (replies, false)
    }

    func expect(_ name: String, _ chunks: [String], _ expected: [[String: JSON]]) {
      let got = feed(chunks).replies
      guard got.count == expected.count else {
        failures.append("\(name): expected \(expected.count) replies, got \(got.count)")
        return
      }
      for (reply, wanted) in zip(got, expected) {
        guard let object = reply.object else {
          failures.append("\(name): a reply is not an object")
          return
        }
        for (key, value) in wanted where object[key] != value {
          failures.append("\(name): \(key) was \(String(describing: object[key])), expected \(value)")
          return
        }
      }
      passed += 1
    }

    let refusal = { (id: JSON?, code: String) -> [String: JSON] in
      var object: [String: JSON] = ["ok": .bool(false), "code": .string(code)]
      if let id { object["id"] = id }
      return object
    }
    let validEvent = #"{"kind":"move","x":10,"y":10,"flags":0}"#

    // Framing
    expect("two requests in one chunk", [#"{"id":1,"type":"focused"}"# + "\n" + #"{"id":2,"type":"capture","maxSize":{"width":10,"height":10}}"# + "\n"],
           [refusal(.int(1), "not_granted"), refusal(.int(2), "not_granted")])
    expect("one request split across chunks", [#"{"id":3,"ty"#, #"pe":"hitTest","xPt""#, #":1,"yPt":2}"# + "\n"], [refusal(.int(3), "not_granted")])
    expect("blank lines are ignored", ["\n  \n"], [])
    expect("a line that is not JSON", ["{nope\n"], [["ok": .bool(false), "code": .string("invalid_argument")]])
    expect("a line that is not an object", ["[1,2]\n"], [["ok": .bool(false), "code": .string("invalid_argument")]])
    expect("a request without an id", [#"{"type":"focused"}"# + "\n"], [["ok": .bool(false), "code": .string("invalid_argument"), "field": .string("id")]])
    expect("a string id is echoed", [#"{"id":"abc","type":"screenText","maxChars":5}"# + "\n"], [refusal(.string("abc"), "not_granted")])
    if feed([String(repeating: "x", count: 100)], maxBytes: 64).tooLong { passed += 1 } else { failures.append("an over-long line is refused") }

    // Validation: unknown requests and fields by name, types, ranges
    expect("unknown request", [#"{"id":4,"type":"screenshot"}"# + "\n"], [refusal(.int(4), "unknown_request")])
    expect("unknown field", [#"{"id":5,"type":"capture","maxSize":{"width":1,"height":1},"quality":9}"# + "\n"],
           [refusal(.int(5), "unknown_field").merging(["field": .string("quality")]) { a, _ in a }])
    expect("hitTest needs numbers", [#"{"id":6,"type":"hitTest","xPt":"1","yPt":2}"# + "\n"], [refusal(.int(6), "invalid_argument").merging(["field": .string("xPt")]) { a, _ in a }])
    expect("screenText range", [#"{"id":7,"type":"screenText","maxChars":0}"# + "\n"], [refusal(.int(7), "invalid_argument")])
    expect("capture size", [#"{"id":8,"type":"capture","maxSize":{"width":0,"height":10}}"# + "\n"], [refusal(.int(8), "invalid_argument")])
    expect("input mode", [#"{"id":9,"type":"input","mode":"hid","events":["# + validEvent + "]}\n"], [refusal(.int(9), "invalid_argument").merging(["field": .string("mode")]) { a, _ in a }])
    expect("input event kind", [#"{"id":10,"type":"input","mode":"global","events":[{"kind":"warp","x":1,"y":1}]}"# + "\n"], [refusal(.int(10), "invalid_argument")])
    expect("input event field", [#"{"id":11,"type":"input","mode":"global","events":[{"kind":"move","x":1,"y":1,"flags":0,"speed":2}]}"# + "\n"],
           [refusal(.int(11), "unknown_field").merging(["field": .string("speed")]) { a, _ in a }])
    expect("input event flags", [#"{"id":12,"type":"input","mode":"global","events":[{"kind":"keyDown","keyCode":0,"flags":1}]}"# + "\n"],
           [refusal(.int(12), "invalid_argument").merging(["field": .string("flags")]) { a, _ in a }])
    expect("input text length", [#"{"id":13,"type":"input","mode":"global","events":[{"kind":"text","text":"0123456789012345678901234567890123"}]}"# + "\n"], [refusal(.int(13), "invalid_argument")])
    expect("scope bundle ids", [#"{"id":14,"type":"scope","bundleIds":["../etc"]}"# + "\n"], [refusal(.int(14), "invalid_argument")])
    expect("pause needs a boolean", [#"{"id":15,"type":"pauseOnLocalInput","on":"yes"}"# + "\n"], [refusal(.int(15), "invalid_argument")])
    expect("bye takes no fields", [#"{"id":16,"type":"bye","now":true}"# + "\n"], [refusal(.int(16), "unknown_field")])
    expect("hard exclusions are never scoped", [#"{"id":17,"type":"scope","bundleIds":["com.example.fixture","com.apple.Terminal"]}"# + "\n"],
           [refusal(.int(17), "excluded").merging(["bundleId": .string("com.apple.Terminal")]) { a, _ in a }])
    expect("the helper itself is excluded", [#"{"id":18,"type":"scope","bundleIds":["com.reflection.cu-helper"]}"# + "\n"], [refusal(.int(18), "excluded")])
    expect("prefix exclusions", [#"{"id":19,"type":"scope","bundleIds":["com.1password.7"]}"# + "\n"], [refusal(.int(19), "excluded")])
    expect("scripting apps are excluded (D-025)", [#"{"id":20,"type":"scope","bundleIds":["com.apple.ScriptEditor2"]}"# + "\n"], [refusal(.int(20), "excluded")])
    expect("exclusions ignore case", [#"{"id":21,"type":"scope","bundleIds":["COM.APPLE.TERMINAL"]}"# + "\n"], [refusal(.int(21), "excluded")])
    expect("the seam needs the pause armed", [#"{"id":22,"type":"simulateLocalInput","kind":"key","via":"idle"}"# + "\n"], [refusal(.int(22), "pause_not_armed")])
    expect("the seam's via is checked", [#"{"id":23,"type":"simulateLocalInput","kind":"key","via":"nose"}"# + "\n"], [refusal(.int(23), "invalid_argument").merging(["field": .string("via")]) { a, _ in a }])
    expect("the seam's kind is required", [#"{"id":24,"type":"simulateLocalInput","via":"idle"}"# + "\n"], [refusal(.int(24), "invalid_argument").merging(["field": .string("kind")]) { a, _ in a }])
    expect("simulateScale is bounded", [#"{"id":25,"type":"capture","maxSize":{"width":10,"height":10},"simulateScale":5}"# + "\n"], [refusal(.int(25), "invalid_argument").merging(["field": .string("simulateScale")]) { a, _ in a }])

    // not_granted for every gated request, naming the grant, with the gated API never reached
    let gated: [(String, String, String)] = [
      ("capture", #""maxSize":{"width":10,"height":10}"#, "screen"),
      ("watch", #""fps":1"#, "screen"),
      ("input", #""mode":"global","events":["# + validEvent + "]", "accessibility"),
      ("input", #""mode":"pid","events":[{"kind":"text","text":"hi"}]"#, "accessibility"),
      ("hitTest", #""xPt":1,"yPt":1"#, "accessibility"),
      ("focused", "", "accessibility"),
      // CU-235: Shift-Command-D's key down (kVK 2), read only with the Accessibility grant.
      ("menuKey", #""keyCode":2,"flags":1179648"#, "accessibility"),
      ("screenText", #""maxChars":100"#, "accessibility"),
    ]
    for (index, entry) in gated.enumerated() {
      let id = 100 + index
      let fields = entry.1.isEmpty ? "" : ",\(entry.1)"
      expect("not_granted \(entry.0) names \(entry.2)", [#"{"id":\#(id),"type":"\#(entry.0)""# + fields + "}\n"],
             [refusal(.int(id), "not_granted").merging(["grant": .string(entry.2)]) { a, _ in a }])
    }

    // Encoding: a message with a newline inside a string is still one line
    let encoded = JSONCoding.line(.object(["text": .string("a\nb"), "n": .int(3)]))
    if encoded.filter({ $0 == 0x0A }).count == 1, JSONCoding.decode(encoded.dropLast()) == .object(["text": .string("a\nb"), "n": .number(3)]) {
      passed += 1
    } else {
      failures.append("encoding keeps one message on one line")
    }

    if !trap.calls.isEmpty { failures.append("gated or system capabilities were called: \(trap.calls.joined(separator: ", "))") }
    if byeCalled { failures.append("bye ran") }
    // Identity and the real preflights (documented not to prompt), so the owner's grant can be checked: launched through
    // LaunchServices (`open -g -n -a CUHelper.app --args --selftest --out <file>`) they are the helper's own.
    let preflight = Grants.preflight()
    let live = SystemCapabilities()
    let summary: JSON = .object([
      "selftest": .string(failures.isEmpty ? "pass" : "fail"),
      "checks": .int(passed + failures.count),
      "passed": .int(passed),
      "failures": .array(failures.map { .string($0) }),
      "capabilityCalls": .int(trap.calls.count),
      "helperVersion": .string(HelperIdentity.version),
      "bundleId": .string(HelperIdentity.bundleId),
      "runningBundleId": .optionalString(Bundle.main.bundleIdentifier),
      "protocol": .int(HelperProtocol.version),
      "eventTag": .int(Int(HelperIdentity.eventTag)),
      "preflight": preflight.json,
      "pid": .int(Int(getpid())),
      "launchedByLaunchd": .bool(getppid() == 1),
      "signing": signingFacts(),
      "displays": .array(live.displays().map { $0.json }),
      "hidIdleSeconds": .double((live.hidIdle().any * 10).rounded() / 10),
      "macOS": .string(ProcessInfo.processInfo.operatingSystemVersionString),
    ])
    let line = JSONCoding.line(summary)
    if let out {
      guard !FileManager.default.fileExists(atPath: out), FileManager.default.createFile(atPath: out, contents: line, attributes: [.posixPermissions: 0o600]) else {
        FileHandle.standardError.write(Data("cu-helper: the self-test report cannot be written (absolute, new path)\n".utf8))
        return 2
      }
    } else {
      FileHandle.standardOutput.write(line)
    }
    return failures.isEmpty ? 0 : 1
  }

  /// This bundle's own signature: identifier, team, ad hoc or not, cdhash and designated requirement - what TCC keys a
  /// grant to. Reads only the helper's own code; no keychain.
  static func signingFacts() -> JSON {
    var code: SecCode?
    guard SecCodeCopySelf([], &code) == errSecSuccess, let code else { return .object(["signed": .bool(false)]) }
    var staticCode: SecStaticCode?
    guard SecCodeCopyStaticCode(code, [], &staticCode) == errSecSuccess, let staticCode else { return .object(["signed": .bool(false)]) }
    var info: CFDictionary?
    guard SecCodeCopySigningInformation(staticCode, SecCSFlags(rawValue: kSecCSSigningInformation), &info) == errSecSuccess,
          let dictionary = info as? [String: Any] else { return .object(["signed": .bool(false)]) }
    let flags = (dictionary[kSecCodeInfoFlags as String] as? NSNumber)?.uint32Value ?? 0
    var facts: [String: JSON] = [
      "signed": .bool(true),
      "identifier": .optionalString(dictionary[kSecCodeInfoIdentifier as String] as? String),
      "teamIdentifier": .optionalString(dictionary[kSecCodeInfoTeamIdentifier as String] as? String),
      "adhoc": .bool(flags & 0x0002 != 0),
    ]
    if let unique = dictionary[kSecCodeInfoUnique as String] as? Data { facts["cdhash"] = .string(unique.map { String(format: "%02x", $0) }.joined()) }
    var requirement: SecRequirement?
    if SecCodeCopyDesignatedRequirement(staticCode, [], &requirement) == errSecSuccess, let requirement {
      var text: CFString?
      if SecRequirementCopyString(requirement, [], &text) == errSecSuccess, let text { facts["designatedRequirement"] = .string(text as String) }
    }
    return .object(facts)
  }
}
