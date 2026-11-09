import AppKit

// 'attach-upload' (CU-377's live row): a message window - meant for CU Ledger, the second approved app - with a drop zone
// that takes files dragged from CU Fixture's file browser (S6) and an 'Upload' button that sends what is attached. Each
// step records only counts: 'attached' with how many files arrived, 'uploaded' with how many went. Nothing leaves the
// window; the files are names in CU Fixture's model.

/// The drop zone: 'Drop files here to attach' - a named group, so a drop has a target.
final class AttachZone: NSView {
  var count = 0 { didSet { needsDisplay = true } }
  override var isFlipped: Bool { true }
  override func isAccessibilityElement() -> Bool { true }
  override func accessibilityRole() -> NSAccessibility.Role? { .group }
  override func accessibilityLabel() -> String? { "Drop files here to attach" }

  override init(frame: NSRect) {
    super.init(frame: frame)
    registerForDraggedTypes([Files.dragType, .fileURL, .string])
  }
  required init?(coder: NSCoder) { nil }

  override func draw(_ dirtyRect: NSRect) {
    NSColor(calibratedRed: 0.90, green: 0.94, blue: 1, alpha: 1).setFill()
    NSBezierPath(roundedRect: bounds.insetBy(dx: 1, dy: 1), xRadius: 8, yRadius: 8).fill()
    ("Drop files here to attach" as NSString).draw(at: NSPoint(x: 16, y: 16), withAttributes: [.font: NSFont.boldSystemFont(ofSize: 15)])
    ("\(count) attached" as NSString).draw(at: NSPoint(x: 16, y: 44), withAttributes: [.font: NSFont.systemFont(ofSize: 13)])
  }

  override func draggingEntered(_ sender: NSDraggingInfo) -> NSDragOperation { .copy }
  override func draggingUpdated(_ sender: NSDraggingInfo) -> NSDragOperation { .copy }

  override func performDragOperation(_ sender: NSDraggingInfo) -> Bool {
    let items = sender.draggingPasteboard.pasteboardItems ?? []
    let arrived = max(items.count, 1)
    count += arrived
    Fixture.shared.record("attached", ["count": arrived])
    return true
  }
}

enum AttachUpload {
  static let task = "attach-upload"
  static weak var zone: AttachZone?

  static func open(title: String) {
    let content = FlippedView(frame: NSRect(x: 0, y: 0, width: 460, height: 260))
    content.wantsLayer = true
    content.layer?.backgroundColor = NSColor.white.cgColor
    let heading = Kit.label("New message", size: 18, bold: true)
    heading.frame = NSRect(x: 20, y: 16, width: 400, height: 24)
    content.addSubview(heading)
    let drop = AttachZone(frame: NSRect(x: 20, y: 56, width: 420, height: 120))
    drop.identifier = NSUserInterfaceItemIdentifier("attach-zone")
    Fixture.shared.controls["attach-zone"] = drop
    content.addSubview(drop)
    zone = drop
    let upload = Kit.button("upload", "Upload")
    upload.frame = NSRect(x: 20, y: 196, width: 120, height: 32)
    content.addSubview(upload)
    _ = Windows.open("main", title: title, content: content)
  }

  static func upload() {
    Fixture.shared.record("uploaded", ["count": zone?.count ?? 0])
  }
}
