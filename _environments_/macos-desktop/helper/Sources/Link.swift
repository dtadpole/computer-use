import Darwin
import Foundation

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
