import Darwin
import Foundation
import Security

/// D-029 (a), helper-boundary.md: the token proves the helper to the driver, not the driver to the helper, so before
/// it says hello a helper that can use a grant checks the process at the other end of the socket. It must run as
/// this user; be a genuine Node.js binary (code requirement, Node.js Foundation's Developer ID team); run with no
/// node options that load other code (`-e`, `-r`, `--import`, `--loader`) and no environment that does (`DYLD_*`,
/// `NODE_OPTIONS`, `NODE_PATH`, ...: this Mac's node allows DYLD variables and unsigned libraries); and its script - the
/// first argument - must be one of the compiled entry points that drive runs through agent core's policy and consent,
/// in a checkout this Mac's local config names (`helperCheckouts`, CU-295) - the compiled `~/computer-use` and
/// `~/computer-use--<seat>` roots are gone (CU-299, helper-boundary 0.3.11), so with no configured checkout no peer is
/// admitted (design 0.3.3: a new `.mjs` written into a checkout must not reach a granted helper). The launch arguments
/// `--driver-node` and `--driver-entry` are required and must name exactly that binary and entry point; they can
/// never widen the compiled list. A refusal closes
/// the socket and names the pid only. Residual risk (told to the owner): a same-user process running genuine node on
/// our own entry point.
enum PeerCheck {
  /// Genuine node builds are signed by the Node.js Foundation (team HX7739G8FX); measured on this Mac's node 24.21.0.
  static let nodeRequirement = #"anchor apple generic and certificate leaf[subject.OU] = "HX7739G8FX""#
  /// CU-295 (the 8 Nov conventions): the checkouts this Mac names in ~/.config/computer-use/config.json's
  /// `helperCheckouts` - home-relative, each an exact checkout (`~/a/computer-use`) or a parent of worktrees
  /// (`~/a/computer-use-wt/*`, one level of names). The machine's paths stay out of the public tree; since CU-299 they
  /// are the only checkouts served. An entry of any other shape is dropped.
  struct Checkout: Equatable {
    /// Home-relative, without '~/' or a trailing slash.
    var path: String
    /// Whether `path` is a parent whose one-level children are checkouts.
    var parent: Bool
  }

  static let maxCheckouts = 8

  /// The `helperCheckouts` entries of a parsed config, the well-formed ones only.
  static func checkouts(fromConfig config: JSON?) -> [Checkout] {
    guard let entries = config?.object?["helperCheckouts"]?.array else { return [] }
    return entries.compactMap { $0.string.flatMap(checkout) }.prefix(maxCheckouts).map { $0 }
  }

  /// One entry: '~/' then path components of [A-Za-z0-9._-] (none '.' or '..'), optionally ending '/*'.
  static func checkout(_ entry: String) -> Checkout? {
    guard entry.hasPrefix("~/"), entry.count <= 200 else { return nil }
    var body = String(entry.dropFirst(2))
    let parent = body.hasSuffix("/*")
    if parent { body = String(body.dropLast(2)) }
    let parts = body.split(separator: "/", omittingEmptySubsequences: false)
    guard !parts.isEmpty, parts.allSatisfy({ part in
      !part.isEmpty && part != "." && part != ".." && part.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || "._-".contains($0)) }
    }) else { return nil }
    return Checkout(path: body, parent: parent)
  }

  /// A configured checkout as admitted: its real directory (realpath at start), inside the home's real path.
  struct Admitted: Equatable {
    var realBase: String
    var parent: Bool
  }

  /// The configured checkouts, read once from the fixed config path under the home (never an environment variable,
  /// so a driver cannot redirect it), with why any was dropped. A missing, unreadable or malformed file admits none -
  /// no checkout at all (CU-299).
  static func configuredCheckouts(home: String) -> (checkouts: [Checkout], note: String?) {
    let path = (home as NSString).appendingPathComponent(".config/computer-use/config.json")
    guard FileManager.default.fileExists(atPath: path) else { return ([], nil) }
    guard let data = FileManager.default.contents(atPath: path), data.count <= 65_536, let config = JSONCoding.decode(data), config.object != nil else {
      return ([], "the local config is unreadable or malformed: no checkout is admitted")
    }
    return (checkouts(fromConfig: config), nil)
  }

  /// cu-coordinator's acceptance for CU-295 (hd-coordinator, cu-researcher): each configured checkout is resolved once,
  /// and admitted only if its real path lies inside the home's real path (by path segments) and neither it nor its
  /// parent directory is world-writable. Pure: `resolve` and `worldWritable` come in. Returns what is admitted and a
  /// reason for each refusal.
  static func admit(_ checkouts: [Checkout], home: String, resolve: (String) -> String?, worldWritable: (String) -> Bool) -> (admitted: [Admitted], refused: [String]) {
    let root = home.hasSuffix("/") ? String(home.dropLast()) : home
    guard let realHome = resolve(root) else { return ([], checkouts.map { "~/\($0.path): the home cannot be resolved" }) }
    var admitted: [Admitted] = []
    var refused: [String] = []
    for checkout in checkouts {
      let shown = "~/" + checkout.path + (checkout.parent ? "/*" : "")
      guard let real = resolve(root + "/" + checkout.path) else { refused.append("\(shown): does not resolve"); continue }
      guard real.hasPrefix(realHome + "/"), real != realHome else { refused.append("\(shown): resolves outside the home"); continue }
      let parentDirectory = (real as NSString).deletingLastPathComponent
      guard !worldWritable(real), !worldWritable(parentDirectory) else { refused.append("\(shown): it or its parent is world-writable"); continue }
      admitted.append(Admitted(realBase: real, parent: checkout.parent))
    }
    return (admitted, refused)
  }

  /// Whether a directory's mode lets every user write it (the sticky 1777 included).
  static func isWorldWritable(_ path: String) -> Bool {
    var info = stat()
    guard stat(path, &info) == 0 else { return true }
    return info.st_mode & S_IWOTH != 0
  }

  /// Where an admitted checkout holds a real path's project directory, with a trailing slash: the real base itself, or
  /// one named child of a parent (segment-checked), compared real path to real path only - no lexical route.
  static func admittedProject(_ real: String, admitted: [Admitted]) -> String? {
    for checkout in admitted {
      let base = checkout.realBase + "/"
      guard real.hasPrefix(base) else { continue }
      if !checkout.parent { return base }
      let name = real.dropFirst(base.count).prefix { $0 != "/" }
      guard !name.isEmpty, name != ".", name != "..", name.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber || "._-".contains($0)) }),
            real.dropFirst(base.count + name.count).hasPrefix("/") else { continue }
      return base + name + "/"
    }
    return nil
  }

  /// The entry points that drive runs through agent core (design 0.3.3), relative to the project directory, plus
  /// cu-verifier's boundary stand-in, which only awaits the hello and sends `bye` (design 0.3.5; anything more would
  /// need an edit to that tracked file, which git shows - and the macos-helper suite checks it).
  static let entryPoints = [
    "_tools_/agent-core/cli.mjs", "_tools_/computer-use-mcp/server.mjs", "_evaluators_/desktop-suite/run.mjs",
    "_verifiers_/desktop-helper-boundary/stand-in-driver.mjs",
  ]
  /// Environment variables that load code into node or change what it loads; any of them refuses the peer.
  static func loadsCode(_ variable: String) -> Bool {
    let name = String(variable.prefix { $0 != "=" })
    return name.hasPrefix("DYLD_") || name.hasPrefix("LD_") || ["NODE_OPTIONS", "NODE_PATH", "NODE_REPL_EXTERNAL_MODULE", "NODE_ICU_DATA"].contains(name)
  }
  /// Node options that run code other than the script.
  static let codeLoadingOptions = ["-e", "--eval", "-p", "--print", "-r", "--require", "--import", "--loader", "--experimental-loader", "-i", "--interactive", "--test"]

  struct Peer: Equatable {
    var pid: pid_t
    var uid: uid_t
    var executable: String?
    /// argv, from KERN_PROCARGS2.
    var arguments: [String]
    var environment: [String]
    var cwd: String?
    var nodeSigned: Bool
  }

  /// Why the peer is refused, or nil when it is accepted. Pure: every fact comes in, so it is unit-tested.
  static func refusal(_ peer: Peer, ownUid: uid_t, home: String, expectedNode: String?, expectedEntry: String?, admitted: [Admitted] = [], resolve: (String) -> String?) -> String? {
    guard peer.uid == ownUid else { return "the peer runs as another user" }
    guard peer.nodeSigned, let executable = peer.executable else { return "the peer is not a genuine node binary" }
    guard let expectedNode, let expectedEntry else { return "the launch named no --driver-node and --driver-entry" }
    guard resolve(expectedNode) == resolve(executable) else { return "the peer is not the node binary the driver named" }
    guard peer.arguments.count >= 2 else { return "the peer runs no script" }
    let script = peer.arguments[1]
    if script.hasPrefix("-") || peer.arguments.contains(where: { argument in codeLoadingOptions.contains(where: { argument == $0 || argument.hasPrefix($0 + "=") }) }) {
      return "the peer runs node with options that load other code"
    }
    if peer.environment.contains(where: loadsCode) { return "the peer's environment loads other code (DYLD_*, NODE_OPTIONS, NODE_PATH)" }
    let absolute = script.hasPrefix("/") ? script : peer.cwd.map { ($0 as NSString).appendingPathComponent(script) }
    guard let absolute, let real = resolve(absolute) else { return "the peer's script cannot be resolved" }
    // CU-299: only an entry point of a configured checkout, compared real path to real path; no compiled root.
    let configured = admittedProject(real, admitted: admitted).map { project in entryPoints.contains(where: { real == project + $0 }) } ?? false
    guard configured else { return "the peer's script is not an allowed entry point" }
    guard resolve(expectedEntry) == real else { return "the peer's script is not the entry point the driver named" }
    return nil
  }

  // MARK: Facts about the peer (no grant, no prompt)

  private static let solLocal: Int32 = 0
  private static let localPeerCred: Int32 = 0x001
  private static let localPeerPid: Int32 = 0x002
  private static let localPeerToken: Int32 = 0x006

  static func peer(of fd: Int32) -> Peer? {
    var credential = xucred()
    var length = socklen_t(MemoryLayout<xucred>.size)
    guard getsockopt(fd, solLocal, localPeerCred, &credential, &length) == 0 else { return nil }
    var pid: pid_t = 0
    length = socklen_t(MemoryLayout<pid_t>.size)
    guard getsockopt(fd, solLocal, localPeerPid, &pid, &length) == 0, pid > 0 else { return nil }
    var token = audit_token_t()
    length = socklen_t(MemoryLayout<audit_token_t>.size)
    let haveToken = getsockopt(fd, solLocal, localPeerToken, &token, &length) == 0
    let (arguments, environment) = processArguments(pid) ?? ([], [])
    return Peer(pid: pid, uid: credential.cr_uid, executable: executablePath(pid), arguments: arguments, environment: environment,
                cwd: workingDirectory(pid), nodeSigned: satisfiesNodeRequirement(pid: pid, token: haveToken ? token : nil))
  }

  static func executablePath(_ pid: pid_t) -> String? {
    var buffer = [CChar](repeating: 0, count: 4 * Int(MAXPATHLEN))
    guard proc_pidpath(pid, &buffer, UInt32(buffer.count)) > 0 else { return nil }
    return String(cString: buffer)
  }

  static func workingDirectory(_ pid: pid_t) -> String? {
    var info = proc_vnodepathinfo()
    let size = Int32(MemoryLayout<proc_vnodepathinfo>.size)
    guard proc_pidinfo(pid, PROC_PIDVNODEPATHINFO, 0, &info, size) == size else { return nil }
    return withUnsafeBytes(of: info.pvi_cdir.vip_path) { raw in
      String(cString: raw.bindMemory(to: CChar.self).baseAddress!)
    }
  }

  /// argv and envp of a process from KERN_PROCARGS2: `int argc`, the exec path, padding, argv, envp.
  static func processArguments(_ pid: pid_t) -> ([String], [String])? {
    var mib: [Int32] = [CTL_KERN, KERN_PROCARGS2, pid]
    var size = 0
    guard sysctl(&mib, 3, nil, &size, nil, 0) == 0, size > MemoryLayout<Int32>.size else { return nil }
    var buffer = [UInt8](repeating: 0, count: size)
    guard sysctl(&mib, 3, &buffer, &size, nil, 0) == 0 else { return nil }
    let argc = buffer.withUnsafeBytes { $0.load(as: Int32.self) }
    var index = MemoryLayout<Int32>.size
    while index < size && buffer[index] != 0 { index += 1 }   // exec path
    while index < size && buffer[index] == 0 { index += 1 }   // padding
    var strings: [String] = []
    while index < size {
      let start = index
      while index < size && buffer[index] != 0 { index += 1 }
      if index > start { strings.append(String(decoding: buffer[start..<index], as: UTF8.self)) } else if strings.count >= Int(argc) { break }
      index += 1
    }
    let count = min(Int(argc), strings.count)
    return (Array(strings.prefix(count)), Array(strings.dropFirst(count)))
  }

  static func satisfiesNodeRequirement(pid: pid_t, token: audit_token_t?) -> Bool {
    var requirement: SecRequirement?
    guard SecRequirementCreateWithString(nodeRequirement as CFString, [], &requirement) == errSecSuccess, let requirement else { return false }
    var attributes: [String: Any] = [kSecGuestAttributePid as String: NSNumber(value: pid)]
    if var token {
      attributes = [kSecGuestAttributeAudit as String: Data(bytes: &token, count: MemoryLayout<audit_token_t>.size)]
    }
    var code: SecCode?
    guard SecCodeCopyGuestWithAttributes(nil, attributes as CFDictionary, [], &code) == errSecSuccess, let code else { return false }
    return SecCodeCheckValidity(code, [], requirement) == errSecSuccess
  }

  static func realPath(_ path: String) -> String? {
    guard let resolved = realpath(path, nil) else { return nil }
    defer { free(resolved) }
    return String(cString: resolved)
  }

  /// The owner's home from the user database, not the environment (LaunchServices gives the helper its own).
  static func home() -> String {
    if let entry = getpwuid(getuid()), let dir = entry.pointee.pw_dir { return String(cString: dir) }
    return NSHomeDirectory()
  }
}
