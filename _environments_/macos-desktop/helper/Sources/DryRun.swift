import CoreGraphics
import Foundation

/// The dry run (`--dry-run --world <json> [--events-out <path>]`): the real helper - framing, validation, every rule
/// of the dispatcher, event building, frame composition - over a declared world instead of the live Mac, so
/// cu-verifier and the tests drive it before any grant. Nothing is captured from the screen, no event is posted, no
/// other app's accessibility is read. Each built event is written, read back field by field, to the events file.
///
/// The world mirrors fake-helper.mjs's config: `grants`, `displays`, `apps` (top-most first, `{bundleId, pid, rect,
/// title?, image?}` - `image` a PNG drawn into the app's rect, such as CU Fixture's own offscreen render),
/// `frontmost`, `elements` (`[{rect, element}]`), `focused`, `screenText`, `activationWorks`, `localInputAfter` (a
/// person acts after that many steps of the next input) and `secureInputAfter` (secure input turns on after that
/// many steps). The menu bar: `menuBar` (`[{bundleId, frame, title?}]`, each app's own AXMenuBarItems), `statusItems`
/// (`[{frame, image?}]`, other apps' extras, the clock) and `menuBarStrip` (default the main display's top 24 pt);
/// a capture draws them and then applies the live helper's mask (design 0.3.8). `handsOnMs`: the person keeps using the
/// Mac for that long after the helper starts (the idle counter reads 0), then stops - for the settle (0.4.1).
/// `dragImage: true` puts the frontmost app's full-display, click-through dragging-level window on top while our button
/// is held; an app's `layer` places it in WindowServer's order, `clickThrough` makes the hit test skip it (Q-D15). `coverAfter` (`{steps, bundleId, pid, rect}`): that app's window appears on top after that many steps of the next
/// input - a held move refused mid-path (CU-44). `desktopIcons` (`[rect]`): Finder's desktop icons; any other point on a display that no app, menu bar or status item
/// covers is bare desktop, which a drag's held moves may cross (Q-D12).
final class DryRunCapabilities: Capabilities {
  let mode = "dry-run"

  struct WorldError: Error, CustomStringConvertible {
    let description: String
  }

  private struct App {
    var bundleId: String
    var pid: pid_t
    var rect: CGRect
    var title: String?
    var image: CGImage?
    /// The live failure modes of 2026-11-05, declared: the owner ScreenCaptureKit reports for this app's windows and
    /// the app Accessibility's hit test names over them (both default to the app itself); `executable` is descriptive.
    var executable: String?
    var sckBundleId: String
    var axOwner: String
    /// `panel`: the window is an AppKit open/save panel ('save' | 'open' | 'unknown'), as its AXIdentifier says (CU-39).
    var panel: String? = nil
    /// `attachedSheet`: the window is its app's attached sheet - an AXSheet of the app's focused window with the same
    /// frame (file-panels.md, the remote case; the next window in the stack should be one of the app's own).
    var attachedSheet: Bool = false
    /// WindowServer's layer for the app's window (default 0): another app's window at the dragging level, say.
    var layer: Int = 0
    /// `clickThrough`: the window ignores mouse events, so WindowServer's hit test skips it (Typeless's overlay).
    var clickThrough: Bool = false
    /// `subrole`: the window's AXSubrole - AXSystemDialog declares a system prompt drawn in the app's own process (CU-76).
    var subrole: String? = nil
  }

  /// `dragImage: true`: while a button of ours is held, the frontmost app owns a full-display, click-through window at
  /// the dragging level - AppKit's drag image during a dragging session (CU-46, measured live).
  private let dragImageWorld: Bool
  /// Whether a mouse button the helper pressed is down, from the events posted here.
  private var buttonHeld = false

  /// The dragging level (500), where AppKit draws its drag image.
  static let draggingLayer = Int(CGWindowLevelForKey(.draggingWindow))

  /// The world's windows in WindowServer's order - the drag image when there is one, then the apps by layer (stable).
  private func windowStack() -> [(window: WindowOwners.Window, app: App)] {
    lock.lock()
    let held = buttonHeld
    lock.unlock()
    var stack: [(window: WindowOwners.Window, app: App)] = []
    if dragImageWorld, held, let source = apps.first(where: { $0.bundleId == front }) {
      var image = source
      image.clickThrough = true
      for display in declaredDisplays {
        stack.append((WindowOwners.Window(number: 9_000, pid: source.pid, layer: Self.draggingLayer, alpha: 1, bounds: display.bounds), image))
      }
    }
    let ordered = apps.enumerated().sorted { $0.element.layer != $1.element.layer ? $0.element.layer > $1.element.layer : $0.offset < $1.offset }
    stack += ordered.map { (WindowOwners.Window(number: CGWindowID($0.offset + 1), pid: $0.element.pid, layer: $0.element.layer, alpha: 1, bounds: $0.element.rect), $0.element) }
    return stack
  }

  /// The app whose window WindowServer's mouse hit test names at a point (Q-D15): the first window there that takes
  /// mouse events, classified by the same HitWindow code as live (0 or nothing -> fail closed).
  private func topApp(at point: CGPoint) -> App? {
    let stack = windowStack()
    let number = stack.first(where: { $0.window.bounds.contains(point) && !$0.app.clickThrough }).map { Int($0.window.number) } ?? 0
    guard case .window(let hit) = HitWindow.classify(number: number, in: stack.map(\.window), helperPid: getpid(), isWindowServer: { _ in false }, finderPid: nil) else { return nil }
    return stack.first(where: { $0.window.number == hit.number && $0.window.pid == hit.pid })?.app
  }

  private let lock = NSLock()
  private let declaredGrants: Grants
  private let declaredDisplays: [DisplayInfo]
  /// Top-most first. Changed only by `coverAfter`, from `post`, on the input request's own thread.
  private var apps: [App]
  private var pendingCover: (after: Int, app: App)?
  private var front: String?
  private let elements: [(CGRect, JSON)]
  private let focusedElement: JSON?
  /// CU-142: the declared default button where the focus is (`defaultButton`, an element), if any.
  private let declaredDefaultButton: JSON?
  /// CU-190: the declared `defaultButtonRead` - false makes the read fail; absent, an approved focus reads true.
  private let declaredDefaultButtonRead: Bool?
  /// CU-148: the declared `sheet` (a sheet or alert in front where the focus is), if the world says.
  private let declaredSheet: Bool?
  /// CU-151: the declared pasteboard change count (`changeCount`), if the world says.
  private let declaredChangeCount: Int?
  /// CU-235: the frontmost app's menu bar as Accessibility would report it - `menuKeyBar: [{title, items: [{title, char,
  /// modifiers (AX bits), virtualKey, glyph, enabled, items}]}]`; `menuKeyBarUnreadable: true` makes the read fail.
  /// (`menuBar` is the menu-bar strip of CU-51.)
  private let declaredMenuBar: [JSON]?
  private let declaredMenuBarUnreadable: Bool
  /// CU-157: the declared `textEntered`, if the world says.
  private let declaredTextEntered: Bool?
  /// CU-187: the declared selection source (`selection`: {role, caption, bundleId, pid}), if the world says.
  private let declaredSelection: JSON?
  /// CU-262: the focused collection's selection - `selectedItems: {role, items: [{filename?, url?, label?, value?}], unreadable?}`
  /// (`selection` is the text selection's).
  private let declaredSelectedItems: JSON?
  /// CU-203: the declared `confirmPress` - the press the owner would make on the confirmation prompt.
  private let declaredConfirmPress: [String: JSON]?
  private let declaredPanelSelection: PanelFields?
  private let text: String
  private let activationWorks: Bool
  /// `activationLagMs`: an activated app comes to the front only this long after the call (CU-82: macOS settling).
  private let activationLag: Double
  /// `activationFlip`: once an activated app is in front, the input's first step finds the previous app in front again
  /// on exactly one read (macOS settling), and the activated one on every read after it. Counted in reads, not time
  /// (CU-103): an 80 or 150 ms flip raced the first step's 300 ms settle against the scheduler - a test run's usleep
  /// overshooting past the flip and the deadline made it refuse (1 of 2 whole-file runs on a gate). With one read, the
  /// settle's first look already sees the target, so the outcome no longer depends on timing.
  private let activationFlip: Bool
  private var pendingFront: (bundleId: String, at: Double, previous: String?)?
  private var flip: (back: String?, armed: Bool, then: String)?
  private var frontAfterFlip: String?
  /// Set by `beginInput`: from then on each front read is logged to stderr (`dry-run: front read <id>`), so a test can
  /// see what the input's checks found - the CU-82 flip test asserts its first read found the previous app (CU-103).
  private var inputStarted = false
  /// `activationBlinkMs`: the activated app is in front for exactly one read, then the previous app until N ms after
  /// the call, then the activated one for good (CU-82: a single read must not count as settled).
  private let activationBlink: Double
  private var blink: (target: String, previous: String?, until: Double, readOnce: Bool)?
  private var localInputAfter: Int?
  /// `localInputAfterMs`: a person acts this many milliseconds after the next input's first posted step - inside a
  /// hold, say (CU-64 R4).
  private var localInputAfterMs: Double?
  private var firstPostAt: Double?
  /// `frontmostAfter` ({steps, bundleId}): another app comes to the front after that many posted steps (CU-64 G3).
  private var frontmostAfter: (steps: Int, bundleId: String)?
  private var secureInputAfter: Int?
  private var secure = false
  private var posted = 0
  private var pendingPersonInput: String?
  private var tapCallback: ((String) -> Void)?
  private let eventsOut: FileHandle?
  private let menuBarItems: [(bundleId: String, frame: CGRect)]
  private let statusItems: [(frame: CGRect, image: CGImage?)]
  private let menuBarStrip: CGRect?
  private let desktopIcons: [CGRect]
  private let handsOnUntil: Double?

  private static func rect(_ value: JSON?) -> CGRect? {
    guard let object = value?.object, let x = object["x"]?.number, let y = object["y"]?.number,
          let width = object["width"]?.number, let height = object["height"]?.number else { return nil }
    return CGRect(x: x, y: y, width: width, height: height)
  }

  init(world: JSON, eventsOutPath: String?) throws {
    let grants = world.object?["grants"]?.object ?? [:]
    declaredConfirmPress = world.object?["confirmPress"]?.object
    declaredGrants = Grants(screen: grants["screen"]?.bool ?? true, accessibility: grants["accessibility"]?.bool ?? true,
                            postEvents: grants["postEvents"]?.bool ?? true, listenEvents: grants["listenEvents"]?.bool ?? false)
    var displays: [DisplayInfo] = []
    for (index, item) in (world.object?["displays"]?.array ?? []).enumerated() {
      guard let object = item.object, let id = object["id"]?.integer, id >= 0,
            let x = object["originPt"]?.object?["x"]?.number, let y = object["originPt"]?.object?["y"]?.number,
            let width = object["sizePt"]?.object?["width"]?.number, let height = object["sizePt"]?.object?["height"]?.number,
            width > 0, height > 0, let scale = object["scale"]?.number, scale > 0 else {
        throw WorldError(description: "displays[\(index)] needs id, originPt, sizePt and scale")
      }
      displays.append(DisplayInfo(id: UInt32(id), main: object["main"]?.bool ?? (index == 0), bounds: CGRect(x: x, y: y, width: width, height: height), scale: scale))
    }
    if displays.isEmpty { displays = [DisplayInfo(id: 1, main: true, bounds: CGRect(x: 0, y: 0, width: 800, height: 600), scale: 1)] }
    declaredDisplays = displays
    let defaultApps: JSON = .array([.object(["bundleId": .string("com.example.fixture"), "pid": .int(501), "rect": .rect(CGRect(x: 0, y: 0, width: 800, height: 600))])])
    var apps: [App] = []
    let appList = (world.object?["apps"] ?? defaultApps).array ?? []
    for (index, item) in appList.enumerated() {
      guard let object = item.object, let bundleId = object["bundleId"]?.string, let pid = object["pid"]?.integer, let rect = Self.rect(object["rect"]) else {
        throw WorldError(description: "apps[\(index)] needs bundleId, pid and rect")
      }
      var image: CGImage?
      if let path = object["image"]?.string {
        guard let loaded = Frames.load(path: path) else { throw WorldError(description: "apps[\(index)].image is not a readable image") }
        image = loaded
      }
      for key in ["sckBundleId", "axOwner"] where object[key] != nil {
        guard let id = object[key]?.string, BundleIdentifier.isValid(id) else { throw WorldError(description: "apps[\(index)].\(key) is a bundle id") }
      }
      if object["executable"] != nil, object["executable"]?.string == nil { throw WorldError(description: "apps[\(index)].executable is a string") }
      if object["layer"] != nil, object["layer"]?.integer == nil { throw WorldError(description: "apps[\(index)].layer is an integer") }
      if object["subrole"] != nil, object["subrole"]?.string == nil { throw WorldError(description: "apps[\(index)].subrole is a string") }
      for key in ["elementOwner"] where object[key] != nil {
        guard let id = object[key]?.string, BundleIdentifier.isValid(id) else { throw WorldError(description: "apps[\(index)].\(key) is a bundle id") }
      }
      if let panel = object["panel"], !["save", "open", "unknown"].contains(panel.string ?? "") { throw WorldError(description: "apps[\(index)].panel is save, open or unknown") }
      apps.append(App(bundleId: bundleId, pid: pid_t(pid), rect: rect, title: object["title"]?.string, image: image, executable: object["executable"]?.string,
                      sckBundleId: object["sckBundleId"]?.string ?? bundleId, axOwner: object["axOwner"]?.string ?? object["elementOwner"]?.string ?? bundleId,
                      panel: object["panel"]?.string, attachedSheet: object["attachedSheet"]?.bool ?? false, layer: object["layer"]?.integer ?? 0,
                      clickThrough: object["clickThrough"]?.bool ?? false, subrole: object["subrole"]?.string))
    }
    self.apps = apps
    dragImageWorld = world.object?["dragImage"]?.bool ?? false
    if let cover = world.object?["coverAfter"]?.object {
      guard let steps = cover["steps"]?.integer, let bundleId = cover["bundleId"]?.string, let pid = cover["pid"]?.integer, let rect = Self.rect(cover["rect"]) else {
        throw WorldError(description: "coverAfter needs steps, bundleId, pid and rect")
      }
      pendingCover = (steps, App(bundleId: bundleId, pid: pid_t(pid), rect: rect, title: nil, image: nil, executable: nil, sckBundleId: bundleId, axOwner: bundleId))
    }
    front = world.object?["frontmost"]?.string ?? apps.first?.bundleId
    elements = (world.object?["elements"]?.array ?? []).compactMap { entry in
      guard let rect = Self.rect(entry.object?["rect"]), let element = entry.object?["element"] else { return nil }
      return (rect, element)
    }
    focusedElement = world.object?["focused"]
    declaredDefaultButton = world.object?["defaultButton"]
    declaredDefaultButtonRead = world.object?["defaultButtonRead"]?.bool
    declaredSheet = world.object?["sheet"]?.bool
    declaredChangeCount = world.object?["changeCount"]?.integer
    declaredMenuBar = world.object?["menuKeyBar"]?.array
    declaredMenuBarUnreadable = world.object?["menuKeyBarUnreadable"]?.bool ?? false
    declaredTextEntered = world.object?["textEntered"]?.bool
    declaredSelection = world.object?["selection"]
    declaredSelectedItems = world.object?["selectedItems"]
    if let selection = world.object?["panelSelection"]?.object {
      declaredPanelSelection = PanelFields(directory: selection["directory"]?.string, fileName: selection["fileName"]?.string,
                                           shownFolderName: selection["shownFolderName"]?.string, nameFieldFocused: selection["nameFieldFocused"]?.bool)
    } else {
      declaredPanelSelection = nil
    }
    text = world.object?["screenText"]?.string ?? ""
    activationWorks = world.object?["activationWorks"]?.bool ?? true
    activationLag = (world.object?["activationLagMs"]?.number ?? 0) / 1000
    activationFlip = world.object?["activationFlip"]?.bool ?? false
    activationBlink = (world.object?["activationBlinkMs"]?.number ?? 0) / 1000
    if world.object?["handsOnMs"] != nil {
      guard let ms = world.object?["handsOnMs"]?.integer, (0...600_000).contains(ms) else { throw WorldError(description: "handsOnMs is 0 to 600000") }
      handsOnUntil = ProcessInfo.processInfo.systemUptime + Double(ms) / 1000
    } else {
      handsOnUntil = nil
    }
    var items: [(bundleId: String, frame: CGRect)] = []
    for (index, item) in (world.object?["menuBar"]?.array ?? []).enumerated() {
      guard let bundleId = item.object?["bundleId"]?.string, let frame = Self.rect(item.object?["frame"]) else {
        throw WorldError(description: "menuBar[\(index)] needs bundleId and frame")
      }
      items.append((bundleId, frame))
    }
    menuBarItems = items
    var extras: [(frame: CGRect, image: CGImage?)] = []
    for (index, item) in (world.object?["statusItems"]?.array ?? []).enumerated() {
      guard let frame = Self.rect(item.object?["frame"]) else { throw WorldError(description: "statusItems[\(index)] needs a frame") }
      var image: CGImage?
      if let path = item.object?["image"]?.string {
        guard let loaded = Frames.load(path: path) else { throw WorldError(description: "statusItems[\(index)].image is not a readable image") }
        image = loaded
      }
      extras.append((frame, image))
    }
    statusItems = extras
    var icons: [CGRect] = []
    for (index, item) in (world.object?["desktopIcons"]?.array ?? []).enumerated() {
      guard let rect = Self.rect(item) else { throw WorldError(description: "desktopIcons[\(index)] needs x, y, width and height") }
      icons.append(rect)
    }
    desktopIcons = icons
    if world.object?["menuBarStrip"] != nil {
      guard let strip = Self.rect(world.object?["menuBarStrip"]) else { throw WorldError(description: "menuBarStrip needs x, y, width and height") }
      menuBarStrip = strip
    } else if !items.isEmpty || !extras.isEmpty {
      let main = displays.first(where: { $0.main }) ?? displays[0]
      menuBarStrip = CGRect(x: main.bounds.minX, y: main.bounds.minY, width: main.bounds.width, height: 24)
    } else {
      menuBarStrip = nil
    }
    localInputAfter = world.object?["localInputAfter"]?.integer
    localInputAfterMs = world.object?["localInputAfterMs"]?.number
    if let after = world.object?["frontmostAfter"]?.object, let steps = after["steps"]?.integer, let bundle = after["bundleId"]?.string {
      frontmostAfter = (steps, bundle)
    }
    secureInputAfter = world.object?["secureInputAfter"]?.integer
    if let path = eventsOutPath {
      guard path.hasPrefix("/"), !FileManager.default.fileExists(atPath: path),
            FileManager.default.createFile(atPath: path, contents: nil, attributes: [.posixPermissions: 0o600]),
            let handle = FileHandle(forWritingAtPath: path) else { throw WorldError(description: "the events file cannot be created (absolute, new path)") }
      eventsOut = handle
    } else {
      eventsOut = nil
    }
  }

  func grants() -> Grants { declaredGrants }
  func displays() -> [DisplayInfo] { declaredDisplays }

  func running(_ bundleIds: [String]) -> [AppRef] {
    bundleIds.flatMap { id in apps.filter { $0.bundleId == id }.map { AppRef(bundleId: $0.bundleId, pid: $0.pid) } }
  }

  func scopeDisplay(_ bundleIds: [String], grants: Grants) -> UInt32? {
    guard let app = apps.first(where: { bundleIds.contains($0.bundleId) }) else { return nil }
    // As live: the display containing the window's centre (CGGetDisplaysWithPoint at the frame's mid point).
    let centre = CGPoint(x: app.rect.midX, y: app.rect.midY)
    return declaredDisplays.first(where: { $0.bounds.contains(centre) })?.id
  }

  func frontmost() -> AppRef? {
    lock.lock(); defer { lock.unlock() }
    applyPendingFront()
    if inputStarted { FileHandle.standardError.write(Data("cu-helper: dry-run: front read \(front ?? "none")\n".utf8)) }
    guard let front else { return nil }
    return AppRef(bundleId: front, pid: apps.first(where: { $0.bundleId == front })?.pid ?? 0)
  }

  func desktop(at point: CGPoint, scope: [String]) -> DesktopPoint {
    guard declaredDisplays.contains(where: { $0.bounds.contains(point) }),
          !apps.contains(where: { $0.rect.contains(point) }),
          !(menuBarStrip?.contains(point) ?? false),
          !statusItems.contains(where: { $0.frame.contains(point) }) else { return .other }
    return desktopIcons.contains(where: { $0.contains(point) }) ? .icon : .bare
  }

  /// Any app below the first one containing the point that is approved: the top one then covers it.
  func approvedBeneath(_ point: CGPoint, scope: [String]) -> Bool {
    apps.filter { $0.rect.contains(point) }.dropFirst().contains { scope.contains($0.bundleId) }
  }

  /// The first app containing the point is WindowServer's topmost window; `axOwner` is what Accessibility would name.
  func owner(at point: CGPoint, scope: [String]) -> (app: AppRef, windowTitle: String?, byElement: Bool, overlay: String?)? {
    guard let top = topApp(at: point) else { return nil }
    let ax = apps.first(where: { $0.bundleId == top.axOwner }) ?? top
    if OwnerRule.overrides(axPid: ax.pid, topPid: top.pid) {
      if let client = remoteClient(window: top, elementBundleId: ax.bundleId, elementExecutable: ax.executable, scope: scope) { return (client, nil, false, nil) }
      // CU-199: an element of a click-through overlay (the element's app has a window over the point that WindowServer's
      // hit test passed through, declared `clickThrough`) does not own the point: the click goes to the window.
      if apps.contains(where: { $0.bundleId == ax.bundleId && $0.clickThrough && $0.layer > top.layer && $0.rect.contains(point) }) {
        return (AppRef(bundleId: top.bundleId, pid: top.pid), scope.contains(top.bundleId) ? top.title : nil, false, ax.bundleId)
      }
      // CU-39: the same fail-closed choice as live - the unapproved one of window and element owns the point.
      let side = OwnerRule.mismatchOwner(windowApproved: scope.contains(top.bundleId), elementApproved: scope.contains(ax.bundleId))
      return side == .window ? (AppRef(bundleId: top.bundleId, pid: top.pid), nil, false, nil) : (AppRef(bundleId: ax.bundleId, pid: ax.pid), nil, true, nil)
    }
    return (AppRef(bundleId: ax.bundleId, pid: ax.pid), scope.contains(ax.bundleId) ? ax.title : nil, false, nil)
  }

  func activate(pid: pid_t) -> Bool {
    lock.lock(); defer { lock.unlock() }
    guard activationWorks, let app = apps.first(where: { $0.pid == pid }) else { return false }
    if activationFlip { flip = (front, false, app.bundleId) }
    if activationBlink > 0 {
      blink = (app.bundleId, front, ProcessInfo.processInfo.systemUptime + activationBlink, false)
      return false
    }
    if activationLag > 0 {
      pendingFront = (app.bundleId, ProcessInfo.processInfo.systemUptime + activationLag, front)
      // As the live call: it waits at most 0.5 s and answers whether the app is in front by then.
      return activationLag <= 0.5
    }
    front = app.bundleId
    return true
  }

  /// The front a pending activation or flip gives at this moment.
  private func applyPendingFront() {
    let now = ProcessInfo.processInfo.systemUptime
    if var pending = blink {
      if now >= pending.until { front = pending.target; blink = nil }
      else if !pending.readOnce { front = pending.target; pending.readOnce = true; blink = pending }
      else { front = pending.previous }
    }
    if let pending = pendingFront, now >= pending.at {
      front = pending.bundleId
      pendingFront = nil
    }
    // CU-103: an armed flip shows the previous app on this one read; the next read shows the activated app.
    if let pending = flip, pending.armed {
      front = pending.back
      flip = nil
      frontAfterFlip = pending.then
    } else if let then = frontAfterFlip {
      front = then
      frontAfterFlip = nil
    }
  }

  func capture(_ request: CaptureRequest, completion: @escaping (Result<CaptureShot, Refusal>) -> Void) {
    let palette: [(Double, Double, Double)] = [(0.85, 0.85, 0.85), (0.55, 0.75, 0.95), (0.95, 0.80, 0.55), (0.70, 0.90, 0.70)]
    // Top-most first; an app outside the scope above an approved one hides it (drawn black).
    // As live: an app's windows are shown only if ScreenCaptureKit's owner and AppKit's (the declared bundle id) agree.
    let shown = { (app: App) in CaptureScope.approves(sckBundleId: app.sckBundleId, appKitBundleId: app.bundleId, scope: request.scope) }
    // CU-101, as live: no approved window at all - a blank frame, marked, with no windows; nothing else is drawn.
    if !apps.contains(where: shown) {
      guard let blank = Frames.blank(width: request.widthPx, height: request.heightPx), let png = Frames.png(blank) else {
        return completion(.failure(Refusal(code: "failed", message: "the blank frame could not be drawn")))
      }
      return completion(.success(CaptureShot(png: png, widthPx: blank.width, heightPx: blank.height, windows: [], noAppWindow: true)))
    }
    var pieces = apps.enumerated().map { index, app in
      shown(app)
        ? Frames.Piece(frame: app.rect, image: app.image, colour: palette[index % palette.count])
        : Frames.Piece(frame: app.rect, image: nil, colour: (0, 0, 0))
    }
    // As live: the menu bar is drawn only with an approved app in front - the screen's whole strip, status items
    // included - and then everything but that app's own item frames is blacked out by the same mask.
    lock.lock()
    let frontId = front
    lock.unlock()
    var keep: [CGRect]?
    if let strip = menuBarStrip, let frontId, request.scope.contains(frontId), MenuBarPlan.include(strip: strip, display: request.display.bounds) {
      let own = menuBarItems.filter { $0.bundleId == frontId }.map(\.frame)
      let others = menuBarItems.filter { $0.bundleId != frontId }.map { Frames.Piece(frame: $0.frame, image: nil, colour: (0.95, 0.30, 0.30)) }
      let extras = statusItems.map { Frames.Piece(frame: $0.frame, image: $0.image, colour: (0.30, 0.95, 0.30)) }
      let titles = own.map { Frames.Piece(frame: $0, image: nil, colour: (0.97, 0.97, 0.97)) }
      pieces = extras + titles + others + [Frames.Piece(frame: strip, image: nil, colour: (0.80, 0.80, 0.80))] + pieces
      keep = own
    }
    guard var image = Frames.compose(area: request.area, width: request.widthPx, height: request.heightPx, pieces: pieces) else {
      return completion(.failure(Refusal(code: "failed", message: "the dry-run frame could not be drawn")))
    }
    if let keep, let strip = menuBarStrip, let masked = Frames.blackOut(image, area: request.area, strip: strip, keep: keep) {
      image = masked
    }
    guard let png = Frames.png(image) else {
      return completion(.failure(Refusal(code: "failed", message: "the dry-run frame could not be drawn")))
    }
    let windows = apps.filter(shown).map { app -> JSON in
      .object(["bundleId": .string(app.bundleId), "pid": .int(Int(app.pid)), "title": .optionalString(app.title), "frame": .rect(app.rect)])
    }
    completion(.success(CaptureShot(png: png, widthPx: image.width, heightPx: image.height, windows: windows)))
  }

  func beginInput() {
    // CU-82's flip, armed here: the first step's check (the first front read after this) finds the previous app.
    lock.lock(); defer { lock.unlock() }
    inputStarted = true
    if let pending = flip, !pending.armed { flip = (pending.back, true, pending.then) }
  }

  func post(_ events: [CGEvent], mode: String, pid: pid_t) -> Bool {
    lock.lock(); defer { lock.unlock() }
    for event in events {
      eventsOut?.write(JSONCoding.line(.object(["mode": .string(mode), "pid": .int(Int(pid)), "event": Events.describe(event)])))
    }
    posted += 1
    if localInputAfterMs != nil && firstPostAt == nil { firstPostAt = ProcessInfo.processInfo.systemUptime }
    for event in events {
      switch event.type {
      case .leftMouseDown, .rightMouseDown, .otherMouseDown: buttonHeld = true
      case .leftMouseUp, .rightMouseUp, .otherMouseUp: buttonHeld = false
      default: break
      }
    }
    if let after = frontmostAfter, posted >= after.steps {
      frontmostAfter = nil
      front = after.bundleId
    }
    if let after = localInputAfter, posted >= after {
      localInputAfter = nil
      pendingPersonInput = "key"
    }
    if let after = secureInputAfter, posted >= after {
      secureInputAfter = nil
      secure = true
    }
    if let cover = pendingCover, posted >= cover.after {
      pendingCover = nil
      apps.insert(cover.app, at: 0)
    }
    return true
  }

  func pointerLocation() -> CGPoint { CGPoint(x: 1, y: 1) }

  func secureInputEnabled() -> Bool {
    lock.lock(); defer { lock.unlock() }
    return secure
  }

  func takePendingPersonInput() -> String? {
    lock.lock(); defer { lock.unlock() }
    if let ms = localInputAfterMs, let first = firstPostAt, (ProcessInfo.processInfo.systemUptime - first) * 1000 >= ms {
      localInputAfterMs = nil
      return "key"
    }
    let kind = pendingPersonInput
    pendingPersonInput = nil
    return kind
  }

  func hidIdle() -> HIDIdle {
    guard let handsOnUntil else { return .never }
    let idle = max(0, ProcessInfo.processInfo.systemUptime - handsOnUntil)
    return HIDIdle(any: idle, key: idle + 1, pointer: idle)
  }

  func noteSettle(_ info: JSON) {
    lock.lock(); defer { lock.unlock() }
    eventsOut?.write(JSONCoding.line(.object(["settle": info])))
  }

  func startTap(_ onLocalInput: @escaping (String) -> Void) -> Bool {
    guard declaredGrants.accessibility || declaredGrants.listenEvents else { return false }
    lock.lock(); defer { lock.unlock() }
    tapCallback = onLocalInput
    return true
  }

  func stopTap() {
    lock.lock(); defer { lock.unlock() }
    tapCallback = nil
  }

  /// CU-203, by the live rule: the world's `confirmPress` is the press the owner would make - {button, source: {tag, pid,
  /// state}, afterMs (since the panel showed)}; it answers only through ConfirmGate, otherwise the prompt times out.
  func confirmPhysical(seat: String, task: String, timeoutMs: Int) -> Result<ConfirmResult, Refusal> {
    let id = "dry-" + seat
    guard let press = declaredConfirmPress, let button = press["button"]?.string, ["confirm", "cancel"].contains(button),
          let source = press["source"]?.object else { return .success(ConfirmResult(outcome: "timeout", source: nil, id: id)) }
    let pressed = EventSource(tag: Int64(source["tag"]?.integer ?? 0), pid: Int64(source["pid"]?.integer ?? -1), state: Int64(source["state"]?.integer ?? 0))
    let afterMs = press["afterMs"]?.integer ?? 0
    let armed = button == "confirm" ? ConfirmGate.armDelay : 0
    // `upSource`: the release completing the click (default: the press's own source).
    let upObject = press["upSource"]?.object ?? source
    let released = EventSource(tag: Int64(upObject["tag"]?.integer ?? 0), pid: Int64(upObject["pid"]?.integer ?? -1), state: Int64(upObject["state"]?.integer ?? 0))
    guard afterMs <= timeoutMs, ConfirmGate.accepts(pressed, downAt: Double(afterMs) / 1000, armedAt: armed, up: released) else { return .success(ConfirmResult(outcome: "timeout", source: nil, id: id)) }
    return .success(ConfirmResult(outcome: button == "confirm" ? "confirmed" : "cancelled", source: pressed, id: id))
  }

  func lastLocalInputSource() -> EventSource? { nil }

  func postUntaggedMove() -> Bool {
    lock.lock()
    eventsOut?.write(JSONCoding.line(.object(["mode": .string("global"), "pid": .null, "event": .object(["type": .int(Int(CGEventType.mouseMoved.rawValue)), "tag": .int(0)])])))
    let tap = tapCallback
    if tap == nil { pendingPersonInput = "pointer" }
    lock.unlock()
    tap?("pointer")
    return true
  }

  private func element(_ value: JSON) -> (bundleId: String?, json: [String: JSON]) {
    var object = value.object ?? [:]
    let subrole = object["subrole"]?.string
    if object["secure"] == nil { object["secure"] = .bool(subrole == Accessibility.secureSubrole) }
    if object["opaque"] == nil {
      let title = object["title"]?.string
      object["opaque"] = .bool((title ?? "").isEmpty && Accessibility.genericRoles.contains(object["role"]?.string ?? "AXUnknown"))
    }
    // CU-250, by the live rule: a menu item declared with `menuLevels: [{holderTitle?, childTitles}]`, nearest first,
    // gets its menuPath and servicesMenu from the same MenuContext (English strings - the dry run reads no AppKit table).
    if object["role"]?.string == "AXMenuItem", let levels = object.removeValue(forKey: "menuLevels")?.array {
      let parsed = levels.compactMap { level -> MenuContext.Level? in
        guard let entry = level.object else { return nil }
        return MenuContext.Level(holderTitle: entry["holderTitle"]?.string, childTitles: (entry["childTitles"]?.array ?? []).compactMap { $0.string })
      }
      for (key, value) in MenuContext.of(itemTitle: object["title"]?.string, levels: parsed, services: .english).json { object[key] = value }
    }
    return (object["bundleId"]?.string, object)
  }

  private func shaped(_ value: JSON?, scope: [String]) -> JSON {
    guard let value, value != .null else { return .null }
    let (bundleId, object) = element(value)
    if let bundleId, scope.contains(bundleId) { return .object(object) }
    return .object(["bundleId": .optionalString(bundleId), "pid": object["pid"] ?? .null, "role": .null, "subrole": .null, "title": .null,
                    "frame": .null, "secure": .bool(false), "opaque": .bool(false), "editable": .null])
  }

  /// The hit test, by the live rules (CU-39): an element whose process differs from the hit window's owner is answered
  /// owner-only with elementOwner (OwnerRule.foreignContent); an approved element gets `panel` from its declared
  /// ancestry through PanelMarker - `ancestors: [{role, identifier}]`, nearest first, and `ancestorsEnd` ('error' or
  /// 'limit') - or, for a window declared with apps[].panel, from a save/open sheet ancestry.
  func hitTest(_ point: CGPoint, scope: [String]) -> JSON {
    let app = topApp(at: point)
    var element = elements.first(where: { $0.0.contains(point) })?.1.object
    if element == nil, let app, let ax = apps.first(where: { $0.bundleId == app.axOwner }), ax.pid != app.pid {
      element = ["pid": .int(Int(ax.pid)), "bundleId": .string(ax.bundleId)]
    }
    return withWindowOrigin(SystemPrompt.withMark(hitTestShape(point, scope: scope), promptMark(window: app, element: element)), at: point, scope: scope)
  }

  /// CU-194, by the live rule: a described element carries its window's top-left origin - the declared element's
  /// `windowOrigin` when the world gives one (null: an unreadable AXWindow), else the window under the point - never the
  /// element's own frame. Only an approved app's element: the owner-only shape of another app's gives nothing more, as live.
  private func withWindowOrigin(_ value: JSON, at point: CGPoint, scope: [String]) -> JSON {
    guard case .object(var fields) = value, fields["windowOrigin"] == nil, let bundle = fields["bundleId"]?.string, scope.contains(bundle) else { return value }
    if let declared = elements.first(where: { $0.0.contains(point) })?.1.object, let origin = declared["windowOrigin"] {
      fields["windowOrigin"] = origin
    } else {
      fields["windowOrigin"] = topApp(at: point).map { .object(["x": .double(Double($0.rect.minX)), "y": .double(Double($0.rect.minY))]) } ?? .null
    }
    return .object(fields)
  }

  /// CU-76, by the live rule: the hit window's owner, another process's content (its bundle and declared executable),
  /// or an AXSystemDialog subrole on the element, its declared ancestors (`ancestors[].subrole`) or the window.
  private func promptMark(window app: App?, element: [String: JSON]?) -> Bool {
    var foreignBundle: String?
    var foreignPath: String?
    var subroles: [String?] = []
    if let element, let app, let pid = element["pid"]?.integer, pid_t(pid) != app.pid {
      foreignBundle = element["bundleId"]?.string
      foreignPath = apps.first(where: { $0.pid == pid_t(pid) })?.executable
    } else {
      subroles.append(element?["subrole"]?.string)
      for ancestor in element?["ancestors"]?.array ?? [] { subroles.append(ancestor.object?["subrole"]?.string) }
      subroles.append(app?.subrole)
    }
    return SystemPrompt.marks(windowOwner: app?.bundleId, foreignBundleId: foreignBundle, foreignPath: foreignPath, subroles: subroles)
  }

  /// CU-76, by the live rule: a prompt that can take keys - the frontmost app is a system prompt process, or the
  /// frontmost approved app's window is an AXSystemDialog.
  func systemPromptPresent(scope: [String]) -> Bool {
    guard let bundle = frontmost()?.bundleId else { return false }
    if SystemPrompt.isOwner(bundle) { return true }
    return scope.contains(bundle) && apps.contains { $0.bundleId == bundle && $0.subrole == SystemPrompt.dialogSubrole }
  }

  private func hitTestShape(_ point: CGPoint, scope: [String]) -> JSON {
    let app = topApp(at: point)
    if let hit = elements.first(where: { $0.0.contains(point) }) {
      let object = hit.1.object ?? [:]
      // CU-199, by the live rule: an element of a click-through overlay (its app has a clickThrough window over the point
      // on a higher layer) is skipped - the hit window's app's own element beneath is described, the overlay named.
      if let app, let pid = object["pid"]?.integer, pid_t(pid) != app.pid,
         let overlayApp = apps.first(where: { $0.pid == pid_t(pid) && $0.clickThrough && $0.layer > app.layer && $0.rect.contains(point) }) {
        let beneath = elements.first(where: { $0.0.contains(point) && $0.1.object?["pid"]?.integer.map { pid_t($0) == app.pid } == true })?.1
          ?? .object(["bundleId": .string(app.bundleId), "pid": .int(Int(app.pid)), "role": .string("AXWindow"), "frame": .rect(app.rect)])
        guard case .object(var fields) = marked(beneath, scope: scope, windowPanel: app.panel) else { return .null }
        fields["overlaySkipped"] = .string(overlayApp.bundleId)
        return .object(fields)
      }
      if let app, let pid = object["pid"]?.integer, pid_t(pid) != app.pid {
        let elementApp = apps.first(where: { $0.pid == pid_t(pid) })
        if let client = remoteClient(window: app, elementBundleId: object["bundleId"]?.string, elementExecutable: elementApp?.executable, scope: scope) {
          var attributed = object
          attributed["bundleId"] = .optionalString(client.bundleId)
          attributed["pid"] = .int(Int(client.pid))
          return withHostedBy(marked(.object(attributed), scope: scope, windowPanel: app.panel))
        }
        return OwnerRule.foreignContent(window: AppRef(bundleId: app.bundleId, pid: app.pid), element: AppRef(bundleId: object["bundleId"]?.string, pid: pid_t(pid)), scope: scope)
      }
      return marked(hit.1, scope: scope, windowPanel: app?.panel)
    }
    // Empty space in a window is the window's owner, unnamed and opaque (red team P13), never null.
    guard let app else { return .null }
    let ax = apps.first(where: { $0.bundleId == app.axOwner }) ?? app
    // CU-199, by the live rule: the element's app has a click-through window over the point on a higher layer - its
    // element is the overlay's, so the window is described and the overlay named.
    if ax.pid != app.pid, apps.contains(where: { $0.bundleId == ax.bundleId && $0.clickThrough && $0.layer > app.layer && $0.rect.contains(point) }) {
      guard case .object(var fields) = marked(.object(["bundleId": .string(app.bundleId), "pid": .int(Int(app.pid)), "role": .string("AXWindow"), "frame": .rect(app.rect)]), scope: scope, windowPanel: app.panel) else { return .null }
      fields["overlaySkipped"] = .string(ax.bundleId)
      return .object(fields)
    }
    if ax.pid != app.pid {
      if let client = remoteClient(window: app, elementBundleId: ax.bundleId, elementExecutable: ax.executable, scope: scope) {
        return withHostedBy(marked(.object(["bundleId": .optionalString(client.bundleId), "pid": .int(Int(client.pid)), "role": .string("AXSheet"), "frame": .rect(app.rect)]),
                                   scope: scope, windowPanel: app.panel))
      }
      return OwnerRule.foreignContent(window: AppRef(bundleId: app.bundleId, pid: app.pid), element: AppRef(bundleId: ax.bundleId, pid: ax.pid), scope: scope)
    }
    return marked(.object(["bundleId": .string(app.bundleId), "pid": .int(Int(app.pid)), "role": .string("AXWindow"), "frame": .rect(app.rect)]), scope: scope, windowPanel: app.panel)
  }

  static let servicePath = "/System/Library/Frameworks/AppKit.framework/Versions/C/XPCServices/com.apple.appkit.xpc.openAndSavePanelService.xpc/Contents/MacOS/com.apple.appkit.xpc.openAndSavePanelService"

  /// The remote case of file-panels.md, by the same PanelAttribution rule as live: the window is the frontmost approved
  /// app's attached sheet, directly above one of its own windows, and the element is the panel service's on the system
  /// volume (its declared executable, by default the service's real path).
  private func remoteClient(window: App, elementBundleId: String?, elementExecutable: String?, scope: [String]) -> AppRef? {
    let stack = windowStack()
    let index = stack.firstIndex(where: { $0.app.pid == window.pid && $0.app.rect == window.rect })
    let aboveClient = index.map { $0 + 1 < stack.count && stack[$0 + 1].app.pid == window.pid } ?? false
    let attached = PanelAttribution.attributes(windowOwnerIsFrontmostClient: window.bundleId == front, clientApproved: scope.contains(window.bundleId),
                                               windowBounds: window.rect, sheetFrames: window.attachedSheet ? [window.rect] : [], aboveClientWindow: aboveClient,
                                               elementBundleId: elementBundleId, elementIsSystem: WindowOwners.isSystemPath(elementExecutable ?? Self.servicePath))
    return attached ? AppRef(bundleId: window.bundleId, pid: window.pid) : nil
  }

  private func withHostedBy(_ shape: JSON) -> JSON {
    guard case .object(var fields) = shape else { return shape }
    fields["hostedBy"] = .string(PanelAttribution.serviceBundleId)
    return .object(fields)
  }

  /// `panelSelection` ({directory, fileName, shownFolderName?, nameFieldFocused?}): what the frontmost approved app's
  /// panel reads, when one is in front - a window declared as an AppKit panel ('save' | 'open') or an attached sheet.
  func panelSelection(scope: [String]) -> PanelFields? {
    guard let front, scope.contains(front), apps.contains(where: { $0.bundleId == front && (["save", "open"].contains($0.panel ?? "") || $0.attachedSheet) }) else { return nil }
    return declaredPanelSelection
  }

  /// The declared default button, marked like any element, while an approved app has the focus; null otherwise.
  func defaultButton(scope: [String]) -> DefaultButtonRead {
    // No declared focus: the frontmost app stands in, as the system read does (CU-142's no-focus limit). CU-190: read
    // where an approved app has the focus (a declared button or a positive none), unless the world says the read failed.
    guard let id = focusedElement?.object?["bundleId"]?.string ?? front, scope.contains(id) else { return .failed }
    if declaredDefaultButtonRead == false { return .failed }
    guard let declared = declaredDefaultButton, declared != .null else { return DefaultButtonRead(button: .null, read: true) }
    return DefaultButtonRead(button: marked(declared, scope: scope, windowPanel: apps.first(where: { $0.bundleId == id && $0.panel != nil })?.panel), read: true)
  }

  /// The declared selection source while its app is approved; only role, caption, bundleId and pid pass.
  func selectionSource(scope: [String]) -> JSON {
    guard let declared = declaredSelection?.object, let id = declared["bundleId"]?.string, scope.contains(id) else { return .null }
    return .object(declared.filter { ["role", "caption", "bundleId", "pid"].contains($0.key) })
  }

  /// The declared `textEntered` while an approved app is the target's (or, with no focus, the front) app; else null.
  func textEntered(at point: CGPoint?, scope: [String]) -> Bool? {
    guard let declared = declaredTextEntered else { return nil }
    let id = point.flatMap { hitTest($0, scope: scope).object?["bundleId"]?.string } ?? focusedElement?.object?["bundleId"]?.string ?? front
    guard let id, scope.contains(id) else { return nil }
    return declared
  }

  /// The declared pasteboard change count; null when the world names none.
  func pasteboardChangeCount() -> Int? { declaredChangeCount }

  /// CU-235, by the live rule: the declared menu bar of the frontmost approved app, matched through MenuKey with a US
  /// layout (the dry run never reads the Mac's layout).
  /// CU-262, by the live rule: the world's `selectedItems` is the frontmost approved app's focused collection (role
  /// default AXOutline); absent, the focus is not a collection.
  func selectedItems(scope: [String]) -> SelectedItems.Read {
    guard let front = frontmost(), let bundleId = front.bundleId else { return .unreadable("no frontmost app") }
    guard scope.contains(bundleId) else { return .unreadable("the frontmost app is not an approved app of this run") }
    guard let declared = declaredSelectedItems?.object else { return .notCollection(bundleId: bundleId) }
    let role = declared["role"]?.string ?? "AXOutline"
    let items = declared["unreadable"]?.bool == true ? nil : (declared["items"]?.array ?? []).map { item in
      // As live: `label` is an AXTitle/AXDescription; a declared `value` (an AXValue, owner content) is never a name.
      SelectedItems.Raw(filename: item.object?["filename"]?.string, url: item.object?["url"]?.string, text: item.object?["label"]?.string)
    }
    return SelectedItems.read(bundleId: bundleId, focusedRole: role, selection: items)
  }

  func menuKey(keyCode: Int, flags: UInt64, scope: [String]) -> MenuKey.Read {
    guard let front = frontmost(), let bundleId = front.bundleId else { return .unreadable("no frontmost app") }
    guard scope.contains(bundleId) else { return .unreadable("the frontmost app is not an approved app of this run") }
    guard !declaredMenuBarUnreadable, let menus = declaredMenuBar else { return .unreadable("the app's menu bar could not be read") }
    var entries: [MenuKey.Entry] = []
    var empty: [String] = []
    func add(_ items: [JSON], path: [String], apple: Bool) {
      for item in items {
        guard let object = item.object else { continue }
        let title = object["title"]?.string
        let here = path + [title ?? ""]
        entries.append(MenuKey.Entry(title: title, path: here, enabled: object["enabled"]?.bool ?? true, cmdChar: object["char"]?.string,
                                     cmdModifiers: object["modifiers"]?.integer, cmdVirtualKey: object["virtualKey"]?.integer, cmdGlyph: object["glyph"]?.integer,
                                     appleMenu: apple))
        let start = entries.count
        add(object["items"]?.array ?? [], path: here, apple: apple)
        MenuKey.markServices(&entries, from: start, holderTitle: title, depth: here.count + 1, services: .english)
      }
    }
    for (index, menu) in menus.enumerated() {
      let title = menu.object?["title"]?.string ?? ""
      let items = menu.object?["items"]?.array ?? []
      // As live: an empty menu other than the first (the Apple menu, by position) makes a miss untrustworthy.
      if items.isEmpty, index > 0 { empty.append(title) }
      // As live: the menu bar's first item is the Apple menu.
      add(items, path: [title], apple: index == 0)
    }
    let chars = MenuKey.usLayout[keyCode]
    return MenuKey.read(bundleId: bundleId, entries: entries, emptyMenus: empty, chord: MenuKey.Chord(keyCode: keyCode, flags: flags, unshifted: chars?.0, shifted: chars?.1))
  }

  /// The declared `sheet`, else whether the focused (or, with no focus, the frontmost) app has an attached sheet; null
  /// while no approved app has the focus.
  func sheetPresent(scope: [String]) -> SheetRead? {
    // No declared focused element: the frontmost app stands in, as the system read does.
    guard let id = focusedElement?.object?["bundleId"]?.string ?? front, scope.contains(id) else { return nil }
    let pid = apps.first(where: { $0.bundleId == id })?.pid ?? 0
    return SheetRead(sheet: declaredSheet ?? apps.contains { $0.bundleId == id && $0.attachedSheet }, bundleId: id, pid: pid_t(pid))
  }

  /// The declared focused element, marked by the same ancestry rule (Return in a panel's name field is caught too).
  func focused(scope: [String]) -> JSON {
    let id = focusedElement?.object?["bundleId"]?.string
    let shape = marked(focusedElement, scope: scope, windowPanel: apps.first(where: { $0.bundleId == id && $0.panel != nil })?.panel)
    let object = focusedElement?.object
    var subroles: [String?] = [object?["subrole"]?.string]
    for ancestor in object?["ancestors"]?.array ?? [] { subroles.append(ancestor.object?["subrole"]?.string) }
    // Focus in another process's view inside the front window: `foreignExecutable` declares that process's path.
    let mark = SystemPrompt.marks(windowOwner: id, foreignBundleId: object?["foreignExecutable"] != nil ? id : nil, foreignPath: object?["foreignExecutable"]?.string, subroles: subroles)
    return SystemPrompt.withMark(shape, mark)
  }

  /// `shaped`, plus `panel` for an approved element, computed by PanelMarker from the declared ancestry.
  private func marked(_ value: JSON?, scope: [String], windowPanel: String?) -> JSON {
    guard case .object(var fields) = shaped(value, scope: scope) else { return .null }
    // Only the declared ancestry marks a panel, never a declared `panel` key (so R13's mutants meet real code).
    fields["panel"] = nil
    let shape = JSON.object(fields)
    guard fields["role"] != .null || fields["frame"] != .null, let object = value?.object else { return shape }
    var path: [(identifier: String?, role: String?)] = [(object["identifier"]?.string, object["role"]?.string)]
    for ancestor in object["ancestors"]?.array ?? [] { path.append((ancestor.object?["identifier"]?.string, ancestor.object?["role"]?.string)) }
    var ending: PanelMarker.Ending = object["ancestorsEnd"]?.string == "error" ? .error : object["ancestorsEnd"]?.string == "limit" ? .limit : .top
    if path.count >= PanelMarker.maxDepth { ending = .limit }
    if object["ancestors"] == nil, let windowPanel {
      // A window declared as an AppKit panel: its sheet carries the identifier, or the walk failed ('unknown'). A hit
      // on the window's empty space is the sheet itself.
      if object["role"]?.string == "AXWindow" { path = [] }
      if windowPanel == "unknown" { ending = .error } else { path.append((windowPanel + "-panel", "AXSheet")) }
      if windowPanel != "unknown" { path.append((nil, "AXWindow")) }
    }
    if path.last?.role != "AXWindow", path.last?.role != "AXApplication", ending == .top, object["ancestors"] == nil, windowPanel == nil { return shape }
    if let kind = PanelMarker.kind(path: path, ending: ending) { fields["panel"] = .string(kind) }
    return .object(fields)
  }

  func screenText(pid: pid_t, maxChars: Int) -> (text: String, truncated: Bool) {
    let units = Array(text.utf16)
    if units.count <= maxChars { return (text, false) }
    return (String(decoding: units.prefix(maxChars), as: UTF16.self), true)
  }
}
