import Darwin
import Foundation
import os

struct LinkError: Error, CustomStringConvertible {
  let description: String
}

/// The run files the driver made: the token file and the socket's directory must belong to this user and be closed
/// to everyone else (mode 600 and 700), or the helper refuses to start. The token then proves to the driver that
/// the connecting process is the helper it launched.
enum RunFiles {
  private static func status(_ path: String) throws -> stat {
    var info = stat()
    guard lstat(path, &info) == 0 else { throw LinkError(description: "cannot stat a run file") }
    return info
  }

  /// The per-run token from a mode-600 regular file owned by this user; with `consume`, the file is unlinked once
  /// read, so the token does not stay on disk for the run (red team B4).
  static func token(at tokenPath: String, consume: Bool = false) throws -> String {
    let token = try status(tokenPath)
    guard (token.st_mode & S_IFMT) == S_IFREG, token.st_uid == getuid(), (token.st_mode & 0o077) == 0, token.st_size <= 1024 else {
      throw LinkError(description: "the token file must be a mode-600 file owned by this user")
    }
    guard let data = FileManager.default.contents(atPath: tokenPath), let text = String(data: data, encoding: .utf8) else {
      throw LinkError(description: "the token file cannot be read")
    }
    let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard (16...512).contains(value.count), !value.contains(where: { $0.isWhitespace }) else { throw LinkError(description: "the token has the wrong length") }
    if consume { unlink(tokenPath) }
    return value
  }

  /// The socket's directory: a mode-700 directory owned by this user.
  static func checkSocketDirectory(_ socketPath: String) throws {
    let dir = try status((socketPath as NSString).deletingLastPathComponent)
    guard (dir.st_mode & S_IFMT) == S_IFDIR, dir.st_uid == getuid(), (dir.st_mode & 0o077) == 0 else {
      throw LinkError(description: "the socket directory must be a mode-700 directory owned by this user")
    }
  }
}

/// One line link over a pair of file descriptors (the driver's Unix socket, or stdin and stdout for a dry run): one
/// blocking reader thread splitting lines, and a locked writer so replies and events from different queues never
/// interleave inside a line.
final class SocketLink: @unchecked Sendable {
  let readFD: Int32
  let writeFD: Int32
  private let writeLock = NSLock()
  private var onBroken: () -> Void = { exit(0) }

  init(readFD: Int32, writeFD: Int32) {
    self.readFD = readFD
    self.writeFD = writeFD
  }

  /// Connect to the driver's socket, retrying while it is not there yet, for at most `timeout` seconds (D-029 (b):
  /// no driver within the window, no run).
  static func connect(path: String, timeout: TimeInterval = 10) throws -> SocketLink {
    let bytes = Array(path.utf8)
    var address = sockaddr_un()
    guard bytes.count < MemoryLayout.size(ofValue: address.sun_path) else { throw LinkError(description: "the socket path is too long") }
    try RunFiles.checkSocketDirectory(path)
    address.sun_family = sa_family_t(AF_UNIX)
    withUnsafeMutableBytes(of: &address.sun_path) { buffer in
      buffer.copyBytes(from: bytes)
      buffer[bytes.count] = 0
    }
    address.sun_len = UInt8(MemoryLayout<sockaddr_un>.size)
    let deadline = Date().addingTimeInterval(timeout)
    while true {
      let fd = socket(AF_UNIX, SOCK_STREAM, 0)
      guard fd >= 0 else { throw LinkError(description: "no socket") }
      var on: Int32 = 1
      setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &on, socklen_t(MemoryLayout<Int32>.size))
      let connected = withUnsafePointer(to: &address) { pointer in
        pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.connect(fd, $0, socklen_t(MemoryLayout<sockaddr_un>.size)) }
      }
      if connected == 0 {
        var info = stat()
        guard lstat(path, &info) == 0, (info.st_mode & S_IFMT) == S_IFSOCK, info.st_uid == getuid() else {
          close(fd)
          throw LinkError(description: "the socket path must be a socket owned by this user")
        }
        return SocketLink(readFD: fd, writeFD: fd)
      }
      close(fd)
      if Date() >= deadline { throw LinkError(description: "no driver connected within \(Int(timeout)) s") }
      usleep(100_000)
    }
  }

  func onConnectionBroken(_ handler: @escaping () -> Void) {
    onBroken = handler
  }

  /// Write one message as one line; a failed write means the driver is gone, and without a driver the helper
  /// posts nothing, so it ends the run.
  func send(_ message: JSON) {
    let data = JSONCoding.line(message)
    writeLock.lock()
    let ok = data.withUnsafeBytes { (raw: UnsafeRawBufferPointer) -> Bool in
      guard var pointer = raw.baseAddress else { return true }
      var remaining = raw.count
      while remaining > 0 {
        let written = write(writeFD, pointer, remaining)
        if written < 0 && (errno == EINTR || errno == EAGAIN) { continue }
        if written <= 0 { return false }
        remaining -= written
        pointer += written
      }
      return true
    }
    writeLock.unlock()
    if !ok { onBroken() }
  }

  /// Read lines on a dedicated thread until the driver closes the connection.
  func startReading(onLine: @escaping (Data) -> Void, onClose: @escaping () -> Void) {
    let fd = readFD
    let thread = Thread {
      var splitter = LineSplitter()
      var buffer = [UInt8](repeating: 0, count: 64 * 1024)
      while true {
        let count = buffer.withUnsafeMutableBytes { read(fd, $0.baseAddress, $0.count) }
        if count < 0 && errno == EINTR { continue }
        if count <= 0 { break }
        do {
          for line in try splitter.push(Data(buffer[0..<count])) { onLine(line) }
        } catch {
          break
        }
      }
      onClose()
    }
    thread.name = "cu-helper-reader"
    thread.start()
  }

  func shutdown() {
    Darwin.shutdown(readFD, SHUT_RDWR)
  }
}

/// CU-227: every end but `bye` is bounded. The end arms this first; if the orderly end - releases posted, tap stopped -
/// has not exited within `bound`, `expire` runs on the watchdog's own thread, which takes no lock of the helper's (in
/// the helper: one log line, then `_exit(exitCode)`). What is still held then stays in the held-keys marker, released
/// first by the next helper (CU-64 G1), as for a killed helper. Arming twice is harmless: the first to expire ends it.
enum EndWatchdog {
  static let bound: TimeInterval = 5
  static let exitCode: Int32 = 70

  /// CU-227 (cu-researcher, cu-coordinator: required): before exit 70 the watchdog posts a tagged up for every key and
  /// button the copy says is held - a synthetic modifier left down would turn the owner's own keystrokes into shortcuts.
  /// Keys come up in reverse, then buttons, where the pointer is. Preflight only (nothing can prompt); returns how many
  /// ups were posted.
  static func releaseHeld(_ mirror: HeldMirror, progress: ReleaseProgress) {
    let snapshot = mirror.snapshot()
    let steps = HeldMirror.releaseSteps(keys: snapshot.keys, buttons: snapshot.buttons, dragged: snapshot.dragged, at: SystemCapabilities.pointerNow())
    SystemCapabilities.postReleaseNow(steps, progress: progress)
  }

  /// How long the watchdog waits for its release before it exits anyway: a wedged WindowServer can block a post.
  static let releaseBound: TimeInterval = 1

  /// Runs `release` on a second thread and returns, after it finished or after `timeout`, how many steps it posted.
  static func boundedRelease(timeout: TimeInterval = releaseBound, _ release: @escaping (ReleaseProgress) -> Void) -> Int {
    let progress = ReleaseProgress()
    let finished = DispatchSemaphore(value: 0)
    let thread = Thread {
      release(progress)
      finished.signal()
    }
    thread.name = "cu-helper-end-release"
    thread.start()
    _ = finished.wait(timeout: .now() + timeout)
    return progress.count
  }

  @discardableResult
  static func arm(after seconds: TimeInterval = bound, reason: String, expire: @escaping (String) -> Void) -> Thread {
    let thread = Thread {
      Thread.sleep(forTimeInterval: seconds)
      expire(reason)
    }
    thread.name = "cu-helper-end-watchdog"
    thread.start()
    return thread
  }
}

/// D-029 (b): one helper at a time. An exclusive lock on a per-user file, held for the process's life; a second
/// helper that can use a grant finds it taken and exits.
enum SingleInstance {
  private static var fd: Int32 = -1

  static var lockPath: String { "/tmp/cu-helper-\(getuid()).lock" }

  static func acquire(at path: String = lockPath) -> Bool {
    let descriptor = open(path, O_CREAT | O_RDWR | O_NOFOLLOW | O_CLOEXEC, 0o600)
    guard descriptor >= 0 else { return false }
    var info = stat()
    guard fstat(descriptor, &info) == 0, info.st_uid == getuid(), (info.st_mode & S_IFMT) == S_IFREG, flock(descriptor, LOCK_EX | LOCK_NB) == 0 else {
      close(descriptor)
      return false
    }
    fd = descriptor
    return true
  }
}

/// CU-227: a copy of what the helper's input holds down, kept beside the dispatcher's own record so the end watchdog
/// can release it without taking the dispatcher's locks. Its own lock is held only to copy a few codes, never across a
/// call. A key or button is added before its down is posted and dropped after its up is posted, so a hang right after a
/// down still knows to release it.
final class HeldMirror: @unchecked Sendable {
  private var lock = os_unfair_lock()
  private var keys: [UInt16] = []
  private var buttons: [MouseButton] = []
  /// A held button has moved since its down: a drag in flight, which a bare up would drop.
  private var dragged = false

  /// Before a step is posted: a down adds what it presses.
  func willPost(_ step: InputEvent) {
    os_unfair_lock_lock(&lock)
    switch step {
    case .keyDown(let code, _): if !keys.contains(code) { keys.append(code) }
    case .down(let button, _, _, _):
      if buttons.isEmpty { dragged = false }
      if !buttons.contains(button) { buttons.append(button) }
    case .drag: if !buttons.isEmpty { dragged = true }
    default: break
    }
    os_unfair_lock_unlock(&lock)
  }

  /// After a step was posted: an up drops what it releases.
  func didPost(_ step: InputEvent) {
    os_unfair_lock_lock(&lock)
    switch step {
    case .keyUp(let code, _): keys.removeAll { $0 == code }
    case .up(let button, _, _, _):
      buttons.removeAll { $0 == button }
      if buttons.isEmpty { dragged = false }
    default: break
    }
    os_unfair_lock_unlock(&lock)
  }

  func snapshot() -> (keys: [UInt16], buttons: [MouseButton], dragged: Bool) {
    os_unfair_lock_lock(&lock)
    defer { os_unfair_lock_unlock(&lock) }
    return (keys, buttons, dragged)
  }

  /// The Escape key, which cancels a drag in Finder and most AppKit drags.
  static let escapeKey: UInt16 = 53

  /// What releases a held set: a drag in flight is cancelled first (Escape down and up - a bare button-up would drop the
  /// item on an unjudged target; an app that ignores Escape still gets the drop, a named residual), then keys up in
  /// reverse order, then each button up at `point`.
  static func releaseSteps(keys: [UInt16], buttons: [MouseButton], dragged: Bool, at point: CGPoint) -> [InputEvent] {
    let cancel: [InputEvent] = dragged && !buttons.isEmpty ? [.keyDown(escapeKey, flags: 0), .keyUp(escapeKey, flags: 0)] : []
    return cancel + keys.reversed().map { .keyUp($0, flags: 0) } + buttons.map { .up($0, point, clickCount: 1, flags: 0) }
  }
}

/// CU-227: how many release steps the watchdog's release thread has posted so far.
final class ReleaseProgress: @unchecked Sendable {
  private var lock = os_unfair_lock()
  private var posted = 0
  func note() { os_unfair_lock_lock(&lock); posted += 1; os_unfair_lock_unlock(&lock) }
  var count: Int { os_unfair_lock_lock(&lock); defer { os_unfair_lock_unlock(&lock) }; return posted }
}

/// CU-227 (#130): what the end watchdog leaves for the driver before exit 70 - `stopped.json` beside the held-keys marker,
/// {reason, released, at}, since a helper LaunchServices started is not the driver's child and its exit code never
/// reaches it. Written like the marker: mode 600, through a temporary file and a rename.
enum StoppedMarker {
  static func path(besideHeldMarker marker: String) -> String {
    ((marker as NSString).deletingLastPathComponent as NSString).appendingPathComponent("stopped.json")
  }

  /// The end's reason in the driver's accepted class (#130: a letter, then letters, digits, space, '_' or '-', at most
  /// 64): other characters are dropped ("the run's wall-time cap" reads "the runs wall-time cap").
  static func phrase(_ reason: String) -> String {
    let kept = String(reason.unicodeScalars.filter { $0.isASCII && (CharacterSet.alphanumerics.contains($0) || " _-".unicodeScalars.contains($0)) }.map(Character.init))
    let trimmed = String(kept.drop { !($0.isASCII && $0.isLetter) }.prefix(64))
    return trimmed.isEmpty ? "unknown" : trimmed
  }

  static func object(reason: String, released: Int, at: Date) -> JSON {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return .object(["reason": .string(phrase(reason)), "released": .int(max(0, released)), "at": .string(formatter.string(from: at))])
  }

  static func write(reason: String, released: Int, besideHeldMarker marker: String, at: Date = Date()) {
    HeldMarker.write(object(reason: reason, released: released, at: at), to: path(besideHeldMarker: marker))
  }
}
