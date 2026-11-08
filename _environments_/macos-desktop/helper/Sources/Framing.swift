import Foundation

/// Splits the socket's byte stream into protocol lines. A line longer than `maxBytes` is an error rather than an
/// ever-growing buffer: the driver never sends one, so a long line means a broken or hostile peer.
struct LineSplitter {
  let maxBytes: Int
  private var pending = Data()

  init(maxBytes: Int = 8 * 1024 * 1024) {
    self.maxBytes = maxBytes
  }

  struct LineTooLong: Error {}

  mutating func push(_ chunk: Data) throws -> [Data] {
    var lines: [Data] = []
    var rest = chunk[chunk.startIndex...]
    while let newline = rest.firstIndex(of: 0x0A) {
      let head = rest[rest.startIndex..<newline]
      if pending.count + head.count > maxBytes { throw LineTooLong() }
      pending.append(contentsOf: head)
      lines.append(pending)
      pending = Data()
      rest = rest[rest.index(after: newline)...]
    }
    if pending.count + rest.count > maxBytes { throw LineTooLong() }
    pending.append(contentsOf: rest)
    return lines
  }
}
