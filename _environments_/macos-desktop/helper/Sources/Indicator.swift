import AppKit
import Foundation

/// D-029 (c), helper-boundary.md: while a driver is connected to a helper that can use a grant, a small always-visible
/// panel says so in the top-right corner of every display, on every Space. It is on screen before the first request
/// is served. It belongs to the helper, whose bundle id is a hard
/// exclusion, so it is never in scope: never captured (ScreenCaptureKit includes approved apps only) and never a
/// target (a point over it is out of scope). It ignores the mouse and never takes focus.
enum Indicator {
  static let text = "● Computer use active"
  private static var panels: [NSPanel] = []

  /// Show one panel per display and let them draw; call on the main thread before any request is served.
  static func show() {
    let app = NSApplication.shared
    app.setActivationPolicy(.accessory)
    app.finishLaunching()
    let screens = NSScreen.screens.isEmpty ? [nil] : NSScreen.screens.map { Optional($0) }
    panels = screens.map(panel(on:))
    // Draw before anything else happens.
    RunLoop.main.run(until: Date().addingTimeInterval(0.15))
  }

  private static func panel(on screen: NSScreen?) -> NSPanel {
    let size = NSSize(width: 176, height: 22)
    let visible = screen?.visibleFrame ?? NSRect(x: 0, y: 0, width: 800, height: 600)
    let origin = NSPoint(x: visible.maxX - size.width - 8, y: visible.maxY - size.height - 6)
    let panel = NSPanel(contentRect: NSRect(origin: origin, size: size), styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
    panel.level = .statusBar
    panel.isOpaque = false
    panel.backgroundColor = .clear
    panel.hasShadow = false
    panel.ignoresMouseEvents = true
    panel.hidesOnDeactivate = false
    panel.isReleasedWhenClosed = false
    panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary, .ignoresCycle]
    panel.title = "CU Helper indicator"
    let label = NSTextField(labelWithString: text)
    label.font = NSFont.systemFont(ofSize: 12, weight: .semibold)
    label.textColor = .white
    label.alignment = .center
    label.frame = NSRect(x: 0, y: 3, width: size.width, height: 16)
    let background = NSView(frame: NSRect(origin: .zero, size: size))
    background.wantsLayer = true
    background.layer?.backgroundColor = NSColor.systemRed.withAlphaComponent(0.9).cgColor
    background.layer?.cornerRadius = 6
    background.addSubview(label)
    panel.contentView = background
    panel.orderFrontRegardless()
    return panel
  }

  /// Whether every panel is on screen.
  static var visible: Bool { !panels.isEmpty && panels.allSatisfy { $0.isVisible } }

  static func hide() {
    panels.forEach { $0.orderOut(nil) }
    panels = []
  }
}
