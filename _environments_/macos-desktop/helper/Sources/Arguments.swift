import Foundation

/// The command line. LaunchServices passes it after `open --args`; anything unknown is refused.
struct HelperArguments: Equatable {
  enum Command: Equatable { case serve, selftest, version, requestGrants }
  enum Transport: Equatable {
    case socket(String)
    case stdio
  }

  var command: Command = .serve
  var transport: Transport?
  var tokenFile: String?
  var out: String?
  var dryRun = false
  var worldFile: String?
  var eventsOut: String?
  /// CU-64 G1: the held-keys marker's path (a dry run's test seam; a live helper uses HeldMarker.defaultPath).
  var heldMarker: String?
  var simulateUngranted = false
  /// Apply the D-029 boundary even when no grant is present (tests of the boundary itself); it only ever restricts.
  var enforceBoundary = false
  /// A private one-helper lock for tests of the boundary itself; honoured only for an enforced boundary with no grant
  /// held, where nothing can act, so two legitimate runs still share the real lock.
  var lockPath: String?
  var excludes: [String] = []
  var driverNode: String?
  var driverEntry: String?
  var maxRunSeconds = 3600.0
  /// A driver silent this long ends the run (D-029 (b)); the model's longest think fits well inside.
  var idleSeconds = 900.0
  var idleToleranceMs = 10.0
  /// Q-D1 on the Mac mini: our posts reset the HID idle counter, so the guard follows them (off only for measuring).
  var idleSyntheticResets = true
  var interEventMs: Double?
  /// A shorter settle cap, for the dry run only (the live cap is 60 s, helper-protocol-details.md 0.4.1).
  var settleCapMs: Double?
  /// How long `--request-grants` stays up for the owner to answer the two dialogs.
  var waitSeconds = 180.0

  /// Whether this run could use a grant at all. A dry run and `--simulate-ungranted` capture, post and read nothing.
  var mayHoldGrants: Bool { !dryRun && !simulateUngranted }

  /// Whether the D-029 boundary applies - peer check, one helper at a time, the indicator: a run that may hold grants
  /// and either holds one at its start or is told to enforce it. A run that starts with no grant serves with every
  /// grant forced off to its end, so a grant given mid-run never reaches an unchecked peer.
  func boundaryApplies(grantsAtStart: Grants) -> Bool {
    mayHoldGrants && (enforceBoundary || grantsAtStart.any)
  }

  static let usage = """
    usage: CUHelper --selftest [--out <abs path>]
           CUHelper --request-grants [--out <abs path>] [--wait-seconds <0-600, default 180>]   (the owner only)
           CUHelper --version
           CUHelper --socket <abs path> --token-file <abs path> [--driver-node <path> --driver-entry <path>]
                    [--max-run-seconds <1-14400, default 3600>] [--idle-seconds <10-3600, default 900>]
           CUHelper --stdio --token-file <abs path> (--dry-run | --simulate-ungranted)
      --dry-run --world <abs path> [--events-out <abs path>]   a declared world: nothing captured, posted or read
      --simulate-ungranted                                     every grant forced off, whatever the Mac holds
      --enforce-boundary [--lock-path <abs path>]              peer check, one helper, indicator even with no grant
                                                               (a private lock only then, for tests)
      --exclude <bundle id or prefix.*>                        add a hard exclusion (repeatable; never removes one)
      --idle-tolerance-ms <0-200>  --idle-synthetic-resets (default)  --idle-synthetic-invisible  --inter-event-ms <0-200>
      --settle-cap-ms <100-60000>                              with --dry-run only: a shorter settle cap
    """

  struct Problem: Error, CustomStringConvertible {
    let description: String
  }

  static func parse(_ raw: [String]) throws -> HelperArguments {
    var parsed = HelperArguments()
    // LaunchServices may add a process serial number argument on older systems; it is not ours to parse.
    var rest = raw.filter { !$0.hasPrefix("-psn_") }
    func value(_ name: String) throws -> String {
      guard !rest.isEmpty else { throw Problem(description: "\(name) needs a value") }
      return rest.removeFirst()
    }
    func path(_ name: String) throws -> String {
      let given = try value(name)
      guard given.hasPrefix("/"), !given.contains("\0"), !given.contains("\n") else { throw Problem(description: "\(name) needs an absolute path") }
      return given
    }
    func number(_ name: String, _ range: ClosedRange<Double>) throws -> Double {
      guard let parsed = Double(try value(name)), parsed.isFinite, range.contains(parsed) else { throw Problem(description: "\(name) must be a number from \(range.lowerBound) to \(range.upperBound)") }
      return parsed
    }
    while !rest.isEmpty {
      let argument = rest.removeFirst()
      switch argument {
      case "--selftest": parsed.command = .selftest
      case "--version": parsed.command = .version
      case "--request-grants": parsed.command = .requestGrants
      case "--wait-seconds": parsed.waitSeconds = try number(argument, 0...600)
      case "--out": parsed.out = try path(argument)
      case "--socket": parsed.transport = .socket(try path(argument))
      case "--stdio": parsed.transport = .stdio
      case "--token-file": parsed.tokenFile = try path(argument)
      case "--dry-run": parsed.dryRun = true
      case "--world": parsed.worldFile = try path(argument)
      case "--events-out": parsed.eventsOut = try path(argument)
      case "--held-marker": parsed.heldMarker = try path(argument)
      case "--simulate-ungranted": parsed.simulateUngranted = true
      case "--enforce-boundary": parsed.enforceBoundary = true
      case "--lock-path": parsed.lockPath = try path(argument)
      case "--exclude":
        let entry = try value(argument)
        let base = entry.hasSuffix(".*") ? String(entry.dropLast(2)) : entry
        guard BundleIdentifier.isValid(base) else { throw Problem(description: "--exclude needs a bundle id or a prefix ending in .*") }
        parsed.excludes.append(entry)
      case "--driver-node": parsed.driverNode = try path(argument)
      case "--driver-entry": parsed.driverEntry = try path(argument)
      case "--max-run-seconds": parsed.maxRunSeconds = try number(argument, 1...14400)
      case "--idle-seconds": parsed.idleSeconds = try number(argument, 10...3600)
      case "--idle-tolerance-ms": parsed.idleToleranceMs = try number(argument, 0...200)
      case "--idle-synthetic-resets": parsed.idleSyntheticResets = true
      case "--idle-synthetic-invisible": parsed.idleSyntheticResets = false
      case "--inter-event-ms": parsed.interEventMs = try number(argument, 0...200)
      case "--settle-cap-ms": parsed.settleCapMs = try number(argument, 100...60000)
      default: throw Problem(description: "unknown argument '\(argument)'")
      }
    }
    if parsed.command == .serve {
      guard let transport = parsed.transport else { throw Problem(description: "--socket <path> or --stdio is required") }
      guard parsed.tokenFile != nil else { throw Problem(description: "--token-file <path> is required") }
      // A stdio peer cannot be checked (D-029), so stdio serves only runs that can use no grant.
      if transport == .stdio && parsed.mayHoldGrants { throw Problem(description: "--stdio needs --dry-run or --simulate-ungranted") }
    } else if parsed.transport != nil || parsed.tokenFile != nil || parsed.dryRun {
      throw Problem(description: "--selftest, --version and --request-grants take no serving options")
    }
    if parsed.out != nil && parsed.command != .selftest && parsed.command != .requestGrants { throw Problem(description: "--out belongs to --selftest or --request-grants") }
    if parsed.waitSeconds != 180 && parsed.command != .requestGrants { throw Problem(description: "--wait-seconds belongs to --request-grants") }
    if parsed.lockPath != nil && !parsed.enforceBoundary { throw Problem(description: "--lock-path belongs to --enforce-boundary") }
    if !parsed.dryRun && (parsed.worldFile != nil || parsed.eventsOut != nil) { throw Problem(description: "--world and --events-out belong to --dry-run") }
    if !parsed.dryRun && parsed.settleCapMs != nil { throw Problem(description: "--settle-cap-ms belongs to --dry-run") }
    return parsed
  }
}
