import AppKit
import Foundation

/// CU-203, physical-confirmation.md: the helper-owned prompt that only the owner's deliberate hardware click answers.
/// It belongs to the helper (a hard exclusion), so it is never in scope, never a target, and `sharingType = .none`
/// keeps it out of every capture. It never takes key focus and has no key equivalents: Return does nothing. Confirm
/// arms after ConfirmGate.armDelay; a press must be hardware input (EventSource.isHardware) that began after arming.
/// Any other press - another process's posted click, an early one - is ignored, never read as an answer.
final class ConfirmPrompt: NSObject {
  private static let lock = NSLock()
  private static var showing = false

  private let seat: String
  private let task: String
  private let id = UUID().uuidString
  private var panel: NSPanel?
  private var confirm: PressButton?
  private var armedAt: TimeInterval = .infinity
  private var result: ConfirmResult?
  private let done = DispatchSemaphore(value: 0)

  private init(seat: String, task: String) {
    self.seat = seat
    self.task = task
  }

  /// Show the prompt and wait for an answer or the timeout; nil when another prompt is on screen (one at a time).
  /// Call off the main thread: the panel lives on it.
  static func ask(seat: String, task: String, timeoutMs: Int) -> ConfirmResult? {
    lock.lock()
    if showing { lock.unlock(); return nil }
    showing = true
    lock.unlock()
    defer { lock.lock(); showing = false; lock.unlock() }
    let prompt = ConfirmPrompt(seat: seat, task: task)
    DispatchQueue.main.sync { prompt.show() }
    let answered = prompt.done.wait(timeout: .now() + .milliseconds(timeoutMs)) == .success
    DispatchQueue.main.sync { prompt.close() }
    let result = answered ? (prompt.result ?? ConfirmResult(outcome: "timeout", source: nil, id: prompt.id)) : ConfirmResult(outcome: "timeout", source: nil, id: prompt.id)
    FileHandle.standardError.write(Data("cu-helper: confirmPhysical id=\(result.id) seat=\(seat) outcome=\(result.outcome) source=\(result.source.map { "pid \($0.pid) state \($0.state) hardware \($0.isHardware)" } ?? "none")\n".utf8))
    return result
  }

  private func show() {
    let size = NSSize(width: 460, height: 150)
    let screen = NSScreen.main ?? NSScreen.screens.first
    let visible = screen?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1280, height: 800)
    let frame = ConfirmGate.frame(visible: visible, size: size, pointer: NSEvent.mouseLocation)
    let panel = PromptPanel(contentRect: frame, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
    panel.level = .modalPanel
    panel.sharingType = .none
    panel.hidesOnDeactivate = false
    panel.isReleasedWhenClosed = false
    panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary, .ignoresCycle]
    panel.title = "CU Helper confirmation"
    let content = NSView(frame: NSRect(origin: .zero, size: size))
    content.wantsLayer = true
    content.layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor
    content.layer?.cornerRadius = 10
    content.layer?.borderColor = NSColor.systemRed.cgColor
    content.layer?.borderWidth = 2
    let grant = NSTextField(wrappingLabelWithString: ConfirmGate.grantLine(seat: seat))
    grant.font = NSFont.systemFont(ofSize: 13, weight: .semibold)
    grant.frame = NSRect(x: 16, y: 82, width: size.width - 32, height: 52)
    let taskLabel = NSTextField(labelWithString: ConfirmGate.taskLine(task))
    taskLabel.font = NSFont.systemFont(ofSize: 12)
    taskLabel.textColor = .secondaryLabelColor
    taskLabel.lineBreakMode = .byTruncatingTail
    taskLabel.frame = NSRect(x: 16, y: 58, width: size.width - 32, height: 18)
    let cancel = PressButton(title: "Cancel", target: self, action: #selector(cancelPressed(_:)))
    cancel.frame = NSRect(x: size.width - 216, y: 14, width: 96, height: 30)
    let confirm = PressButton(title: "Confirm", target: self, action: #selector(confirmPressed(_:)))
    confirm.frame = NSRect(x: size.width - 112, y: 14, width: 96, height: 30)
    confirm.isEnabled = false
    for button in [cancel, confirm] { button.keyEquivalent = ""; button.bezelStyle = .rounded }
    [grant, taskLabel, cancel, confirm].forEach(content.addSubview)
    panel.contentView = content
    panel.orderFrontRegardless()
    self.panel = panel
    self.confirm = confirm
    armedAt = ProcessInfo.processInfo.systemUptime + ConfirmGate.armDelay
    DispatchQueue.main.asyncAfter(deadline: .now() + ConfirmGate.armDelay) { [weak self] in self?.confirm?.isEnabled = true }
  }

  private func close() {
    panel?.orderOut(nil)
    panel = nil
  }

  @objc private func confirmPressed(_ sender: PressButton) { answer("confirmed", sender) }
  @objc private func cancelPressed(_ sender: PressButton) { answer("cancelled", sender) }

  private func answer(_ outcome: String, _ button: PressButton) {
    // The action fires inside AppKit's tracking, on the release: the current event is that mouseUp.
    let release = NSApp.currentEvent.flatMap { $0.type == .leftMouseUp ? $0.cgEvent : nil }.map(EventSource.init(cgEvent:))
    guard result == nil, ConfirmGate.accepts(button.pressSource, downAt: button.pressAt, armedAt: outcome == "confirmed" ? armedAt : 0, up: release) else { return }
    result = ConfirmResult(outcome: outcome, source: button.pressSource, id: id)
    done.signal()
  }
}

/// Never key, never main: the prompt cannot take the keyboard, so a Return typed elsewhere never reaches it.
private final class PromptPanel: NSPanel {
  override var canBecomeKey: Bool { false }
  override var canBecomeMain: Bool { false }
}

/// A button that records where its press came from and when it began, before AppKit's tracking sends the action.
final class PressButton: NSButton {
  private(set) var pressSource: EventSource?
  private(set) var pressAt: TimeInterval = 0

  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

  override func mouseDown(with event: NSEvent) {
    // The press's OWN event (cu-researcher): never a separately tapped one that could pair with another press.
    pressSource = event.cgEvent.map(EventSource.init(cgEvent:))
    pressAt = event.timestamp
    super.mouseDown(with: event)
  }

  override func performKeyEquivalent(with event: NSEvent) -> Bool { false }
}

extension EventSource {
  init(cgEvent event: CGEvent) {
    self.init(tag: event.getIntegerValueField(.eventSourceUserData), pid: event.getIntegerValueField(.eventSourceUnixProcessID),
              state: event.getIntegerValueField(.eventSourceStateID))
  }
}
