import ApplicationServices
import CoreGraphics
import Foundation

/// The owner's grant request (owner, via cu-coordinator, 2026-11-05 13:39 UTC: "help request those permissions, so
/// that all that I need to do is just click"). The only code in the helper that may make macOS prompt, reached only
/// through `--request-grants`, which only the owner runs, launched through LaunchServices so the prompts name CUHelper.
/// It asks for exactly Accessibility (which also covers posting events) and Screen Recording - never Input Monitoring -
/// and captures nothing, posts nothing and installs no tap. It waits until both preflights say yes or the time is up,
/// then reports the preflights before and after, like `--selftest`.
enum GrantRequest {
  static func run(out: String?, waitSeconds: Double) -> Int32 {
    let started = Date()
    let before = Grants.preflight()
    var asked: [JSON] = []
    if !before.accessibility {
      let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
      _ = AXIsProcessTrustedWithOptions(options)
      asked.append(.string("accessibility"))
    }
    if !before.screen {
      _ = CGRequestScreenCaptureAccess()
      asked.append(.string("screen"))
    }
    // The dialogs belong to macOS; stay up while the owner answers them, so neither is withdrawn with the process.
    var now = Grants.preflight()
    while Date().timeIntervalSince(started) < waitSeconds && !(now.accessibility && now.screen) {
      RunLoop.main.run(until: Date().addingTimeInterval(1))
      now = Grants.preflight()
    }
    let report = JSON.object([
      "requestGrants": .string("done"),
      "helperVersion": .string(HelperIdentity.version),
      "asked": .array(asked),
      "before": before.json,
      "after": now.json,
      "waitedSeconds": .int(Int(Date().timeIntervalSince(started).rounded())),
      "note": .string("Screen Recording often reads true only after CUHelper restarts; check with --selftest."),
    ])
    let line = JSONCoding.line(report)
    FileHandle.standardOutput.write(line)
    if let out { FileManager.default.createFile(atPath: out, contents: line, attributes: [.posixPermissions: 0o600]) }
    return 0
  }
}
