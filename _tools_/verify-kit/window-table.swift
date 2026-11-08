// The on-screen windows owned by one process, from the window server's table: layer, bounds, alpha. Window titles and
// images need Screen Recording; owner pid and geometry do not, so this raises no TCC prompt.
// Usage: window-table <pid>   -> one JSON array on stdout.
import CoreGraphics
import Foundation

guard CommandLine.arguments.count == 2, let pid = Int(CommandLine.arguments[1]) else {
  FileHandle.standardError.write("usage: window-table <pid>\n".data(using: .utf8)!)
  exit(64)
}
let list = (CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]]) ?? []
let mine = list.filter { ($0[kCGWindowOwnerPID as String] as? Int) == pid }.map { window -> [String: Any] in
  let bounds = window[kCGWindowBounds as String] as? [String: Any] ?? [:]
  return ["layer": window[kCGWindowLayer as String] as? Int ?? 0, "alpha": window[kCGWindowAlpha as String] as? Double ?? 0, "bounds": bounds]
}
let data = try JSONSerialization.data(withJSONObject: mine, options: [.sortedKeys])
print(String(data: data, encoding: .utf8)!)
