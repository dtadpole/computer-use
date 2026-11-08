import AppKit

// A fixture window must not open under another app's floating window: the helper rightly refuses input there, so a
// covered control changes the task (S5's first live run: CU Ledger's invoice number under the owner's notification
// alert at 849,209, refused excluded:os_security). The default place is kept when it is free; otherwise the window
// moves to the first free spot, along its own row first, then lower rows.

enum Placement {
  /// Other apps' floating windows on screen - layer 1 to 19: alerts, panels, overlays; not the Dock or the menu bar -
  /// and the other fixture app's windows (CU Fixture for CU Ledger and back), so a move never covers the other half of
  /// a two-app task; in AppKit coordinates. Bounds, layer and owner need no Screen Recording.
  static func obstacles() -> [(rect: NSRect, owner: String)] {
    guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return [] }
    let me = ProcessInfo.processInfo.processIdentifier
    let primaryHeight = NSScreen.screens.first?.frame.height ?? 0
    return list.compactMap { info -> (rect: NSRect, owner: String)? in
      guard let pid = (info[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value, pid != me,
            let layer = (info[kCGWindowLayer as String] as? NSNumber)?.intValue,
            (1...19).contains(layer) || (layer == 0 && isFixture(pid)),
            let bounds = info[kCGWindowBounds as String] as? NSDictionary, let rect = CGRect(dictionaryRepresentation: bounds),
            rect.width > 1, rect.height > 1 else { return nil }
      let owner = NSRunningApplication(processIdentifier: pid)?.bundleIdentifier ?? (info[kCGWindowOwnerName as String] as? String) ?? "pid \(pid)"
      return (NSRect(x: rect.minX, y: primaryHeight - rect.maxY, width: rect.width, height: rect.height), owner)
    }
  }

  static func isFixture(_ pid: pid_t) -> Bool {
    NSRunningApplication(processIdentifier: pid)?.bundleIdentifier?.hasPrefix("ai.reflection.cu.") ?? false
  }

  /// The frame to use: `frame` itself when no block touches it, else the first free frame of its size inside
  /// `visible` - along its own row rightwards (20 pt steps), then each lower row, never left of the default - or nil
  /// when none is free (the caller keeps the default). Never leftwards: each fixture app keeps its own side, so CU Ledger
  /// opening before CU Fixture's window exists cannot move onto CU Fixture's home (multi-app-transfer, cu-verifier
  /// 2026-11-06: the Ledger moved to x 200 and covered the payment form).
  static func spot(for frame: NSRect, avoiding blocks: [NSRect], in visible: NSRect) -> NSRect? {
    let free = { (candidate: NSRect) in visible.contains(candidate) && !blocks.contains(where: { $0.intersects(candidate) }) }
    if !blocks.contains(where: { $0.intersects(frame) }) { return frame }
    let step: CGFloat = 20
    var y = min(frame.minY, visible.maxY - frame.height)
    while y >= visible.minY {
      for x in stride(from: frame.minX, through: visible.maxX - frame.width, by: step) {
        let candidate = NSRect(x: x, y: y, width: frame.width, height: frame.height)
        if free(candidate) { return candidate }
      }
      y -= step
    }
    return nil
  }

  /// A window on screen, front to back as CGWindowList gives them, in AppKit coordinates.
  struct Shown { var number: Int; var pid: pid_t; var layer: Int; var rect: NSRect; var owner: String }

  static func shown() -> [Shown] {
    guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return [] }
    let primaryHeight = NSScreen.screens.first?.frame.height ?? 0
    return list.compactMap { info in
      guard let number = (info[kCGWindowNumber as String] as? NSNumber)?.intValue, let pid = (info[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value,
            let layer = (info[kCGWindowLayer as String] as? NSNumber)?.intValue,
            let bounds = info[kCGWindowBounds as String] as? NSDictionary, let rect = CGRect(dictionaryRepresentation: bounds) else { return nil }
      let owner = NSRunningApplication(processIdentifier: pid)?.bundleIdentifier ?? (info[kCGWindowOwnerName as String] as? String) ?? "pid \(pid)"
      return Shown(number: number, pid: pid, layer: layer, rect: NSRect(x: rect.minX, y: primaryHeight - rect.maxY, width: rect.width, height: rect.height), owner: owner)
    }
  }

  /// What covers a window: other processes' windows listed in front of it (layers 0 to 19 - normal windows, alerts,
  /// overlays; not the Dock or the menu bar) that intersect it, by owner. Pure, over a given list (cu-verifier: so the
  /// 'another app's window in front' branch has a test).
  static func covering(_ frame: NSRect, number: Int, me: pid_t, in list: [Shown]) -> [String] {
    var owners = Set<String>()
    for window in list {
      if window.number == number { break }
      guard window.pid != me, (0...19).contains(window.layer), window.rect.width > 1, window.rect.height > 1, window.rect.intersects(frame) else { continue }
      owners.insert(window.owner)
    }
    return owners.sorted()
  }

  /// What covers `window` now (live).
  static func inFront(of window: NSWindow) -> [String] {
    guard window.isVisible else { return [] }
    return covering(window.frame, number: window.windowNumber, me: ProcessInfo.processInfo.processIdentifier, in: shown())
  }

  /// The `windows` reply's placement: how the window opened, turned `covered` when another app's window lies in front of
  /// it now (the suite marks such a row harness-affected; cu-verifier saw CU Fixture open behind the owner's browser).
  static func now(_ window: NSWindow, opened: [String: Any]) -> [String: Any] {
    let front = inFront(of: window)
    guard !front.isEmpty else { return opened }
    let earlier = opened["by"] as? [String] ?? []
    return ["state": "covered", "by": Array(Set(earlier + front)).sorted(), "opened": opened["state"] ?? "unknown"]
  }

  /// A window the task placed itself (keypad origin, Details below the form): never moved, only reported -
  /// `explicit`, or `covered` with what covers it.
  static func check(_ window: NSWindow) -> [String: Any] {
    let by = Array(Set(obstacles().filter { $0.rect.intersects(window.frame) }.map(\.owner))).sorted()
    return by.isEmpty ? ["state": "explicit"] : ["state": "covered", "by": by]
  }

  /// Move a just-opened window off other apps' floating windows, if it can, and say what happened: `default` (nothing
  /// in the way), `moved`, or `covered` (no free spot: the default overlaps `by`) - reported by the `windows` reply, so
  /// the suite can mark a row harness-affected without a separate overlap pass (cu-verifier's suggestion on #150).
  static func place(_ window: NSWindow) -> [String: Any] {
    let blocks = obstacles()
    let covering = { (frame: NSRect) in Array(Set(blocks.filter { $0.rect.intersects(frame) }.map(\.owner))).sorted() }
    guard let visible = (window.screen ?? NSScreen.screens.first)?.visibleFrame, !covering(window.frame).isEmpty else { return ["state": "default"] }
    guard let frame = spot(for: window.frame, avoiding: blocks.map(\.rect), in: visible) else { return ["state": "covered", "by": covering(window.frame)] }
    window.setFrame(frame, display: true)
    return ["state": "moved"]
  }
}
