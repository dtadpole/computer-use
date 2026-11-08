import AppKit

// S5 clipboard screens (CU-62, cu-coordinator's ruling 2026-11-06 04:09Z): the text copied and pasted is the fixture's
// own; the owner's pasteboard is saved in this process's memory only for the run and written back after it, also when
// the app ends; a pasteboard holding concealed or transient items is not read at all and the item is skipped. Nothing
// of the owner's pasteboard is logged, written to disk or sent over the channel - only counts.

/// The owner's pasteboard for the length of a run. The pasteboard is injected, so tests use a private named one and
/// never touch the owner's.
///
/// The board must end as it began (cu-coordinator, 2026-11-06 07:07Z). macOS 15.4 and later ask the owner before a
/// programmatic read of the general pasteboard. The first guarded runs read nothing that way, and save then cleared the
/// board, so the owner's clipboard may have been erased. Now:
/// - nothing is read unless this app may read without asking (Always Allow, chosen by the owner in System Settings);
/// - a board that does not read back in full is skipped, not cleared;
/// - save clears only after every item was copied;
/// - restore after an empty save clears the fixture's text, so an empty board ends empty.
final class ClipboardStash {
  static let shared = ClipboardStash(pasteboard: .general)
  /// The nspasteboard.org markers for passwords and one-time content: when present, nothing is read.
  static let concealed = [NSPasteboard.PasteboardType("org.nspasteboard.ConcealedType"), NSPasteboard.PasteboardType("org.nspasteboard.TransientType")]

  /// Whether this app may read `pasteboard` without the owner being asked, and the behaviour's name. Reads the
  /// setting only, never the content. Before macOS 15.4 there is no such prompt.
  static func systemAccess(_ pasteboard: NSPasteboard) -> (allowed: Bool, behavior: String) {
    guard #available(macOS 15.4, *) else { return (true, "unrestricted") }
    return allows(pasteboard.accessBehavior)
  }

  /// The rule itself, as a pure function of the behaviour (cu-verifier on #157): only Always Allow reads without the
  /// owner being asked; ask, deny, never-asked and anything unknown fail closed.
  @available(macOS 15.4, *)
  static func allows(_ behavior: NSPasteboard.AccessBehavior) -> (allowed: Bool, behavior: String) {
    switch behavior {
    case .alwaysAllow: return (true, "alwaysAllow")
    case .ask: return (false, "ask")
    case .alwaysDeny: return (false, "alwaysDeny")
    case .default: return (false, "default")
    @unknown default: return (false, "unknown")
    }
  }

  let pasteboard: NSPasteboard
  let access: (NSPasteboard) -> (allowed: Bool, behavior: String)
  private var saved: [[(NSPasteboard.PasteboardType, Data)]]?

  init(pasteboard: NSPasteboard, access: @escaping (NSPasteboard) -> (allowed: Bool, behavior: String) = ClipboardStash.systemAccess) {
    self.pasteboard = pasteboard
    self.access = access
  }

  var holding: Bool { saved != nil }

  /// Keep every item's data in memory and clear the board. Nothing is read without access, nothing is read with a
  /// concealed or transient marker, and nothing is cleared unless every listed type read back.
  func save() -> [String: Any] {
    if holding { return ["saved": saved?.count ?? 0, "already": true] }
    let permission = access(pasteboard)
    guard permission.allowed else { return ["skipped": "pasteboard access needs the owner", "behavior": permission.behavior] }
    // The board's type names only (no data) decide whether it may be read.
    let types = Set(pasteboard.types ?? [])
    if Self.concealed.contains(where: { types.contains($0) }) { return ["skipped": "concealed"] }
    let listed = pasteboard.pasteboardItems ?? []
    if listed.isEmpty && !types.isEmpty { return ["skipped": "clipboard unreadable"] }
    var copied: [[(NSPasteboard.PasteboardType, Data)]] = []
    for item in listed {
      var pairs: [(NSPasteboard.PasteboardType, Data)] = []
      for type in item.types {
        guard let data = item.data(forType: type) else { return ["skipped": "clipboard unreadable"] }
        pairs.append((type, data))
      }
      copied.append(pairs)
    }
    saved = copied
    if !copied.isEmpty { pasteboard.clearContents() }
    return ["saved": copied.count]
  }

  /// Write the saved items back and forget them. After an empty save the board is cleared (it began empty); with no
  /// save at all it is left as it is.
  func restore() -> [String: Any] {
    guard let items = saved else { return ["restored": 0] }
    saved = nil
    pasteboard.clearContents()
    let written = items.map { pairs -> NSPasteboardItem in
      let item = NSPasteboardItem()
      for (type, data) in pairs { item.setData(data, forType: type) }
      return item
    }
    if !written.isEmpty { pasteboard.writeObjects(written) }
    return ["restored": written.count, "cleared": written.isEmpty]
  }
}

/// A field editor that tells a paste from typing. `paste:` reads the board through `readSelection(from:)` and keeps
/// the text that paste inserted (from the field before and after, never by reading the board itself). A typed
/// insertion or deletion after it marks typing. The field records `paste` when its final value is exactly the text of
/// its last paste with no keystroke edit after it - a select-all and paste over earlier content is still a paste
/// (cu-researcher's Ask 1, 2026-11-06).
final class PasteMarkingEditor: NSTextView {
  private(set) var edits: [String] = []
  private var lastPasted: String?
  private var typedAfterPaste = false

  override func paste(_ sender: Any?) { paste(from: .general) }

  /// The same path as `paste:`, from a given board (the self-test's private one).
  func paste(from pasteboard: NSPasteboard) {
    // The length as a number now: `string` bridges to the text storage's live string, which the paste mutates.
    let beforeLength = (string as NSString).length
    let range = selectedRange()
    edits.append("paste")
    _ = readSelection(from: pasteboard)
    let after = NSString(string: string)
    let inserted = after.length - (beforeLength - range.length)
    lastPasted = inserted >= 0 && range.location + inserted <= after.length ? after.substring(with: NSRange(location: range.location, length: inserted)) : nil
    typedAfterPaste = false
  }

  private func typed() {
    edits.append("typing")
    typedAfterPaste = true
  }

  override func insertText(_ string: Any, replacementRange: NSRange) {
    typed()
    super.insertText(string, replacementRange: replacementRange)
  }

  override func deleteBackward(_ sender: Any?) {
    typed()
    super.deleteBackward(sender)
  }

  override func deleteForward(_ sender: Any?) {
    typed()
    super.deleteForward(sender)
  }

  func resetEdits() {
    edits = []
    lastPasted = nil
    typedAfterPaste = false
  }

  /// How the field's value arrived: `paste` when it is exactly the last paste's text with no keystroke edit after it.
  func via(final value: String) -> String {
    guard let pasted = lastPasted, !typedAfterPaste, value == pasted, !value.isEmpty else { return "typing" }
    return "paste"
  }
}

/// A text field cell whose field editor is its own `PasteMarkingEditor`.
final class PasteMarkingCell: NSTextFieldCell {
  let editor: PasteMarkingEditor = {
    let editor = PasteMarkingEditor()
    editor.isFieldEditor = true
    return editor
  }()

  override func fieldEditor(for controlView: NSView) -> NSTextView? { editor }
}

enum Clipboard {
  /// Open a clipboard screen; false when the task is not one of these.
  static func open(_ task: String, title: String) -> Bool {
    let fixture = Fixture.shared
    let p = Screens.string
    switch task {
    case "ledger-invoice-copy":
      // The number sits in a selectable, non-editable field: select it, copy it.
      let number = NSTextField(labelWithString: p("invoice"))
      number.isSelectable = true
      number.font = NSFont.monospacedSystemFont(ofSize: 18, weight: .regular)
      number.identifier = NSUserInterfaceItemIdentifier("invoice-number")
      fixture.controls["invoice-number"] = number
      // A compact page (420 x 260), so it fits beside the owner's alerts when Placement has to move it.
      _ = Windows.open("main", title: title, content: Kit.page([Kit.label("CU Ledger", size: 20, bold: true), Kit.label("Invoice \u{2013} \(p("vendor"))", size: 16), Kit.label("Invoice number"), number, Kit.label("Amount due: \(p("amount"))")], width: 420, height: 260))
    case "payment-paste":
      let field = NSTextField()
      field.cell = PasteMarkingCell(textCell: "")
      field.isEditable = true
      field.isBezeled = true
      field.bezelStyle = .squareBezel
      field.drawsBackground = true
      field.identifier = NSUserInterfaceItemIdentifier("invoice")
      field.font = NSFont.systemFont(ofSize: 14)
      fixture.controls["invoice"] = field
      let status = Kit.label("")
      fixture.controls["record-status"] = status
      _ = Windows.open("main", title: title, content: Kit.page([Kit.label("Payments", size: 20, bold: true), Kit.label("Invoice number"), field, Kit.button("record", "Record payment"), status]))
    default:
      return Keypad.open(task, title: title)
    }
    return true
  }

  static func press(_ name: String) -> Bool {
    let fixture = Fixture.shared
    switch (Screens.current, name) {
    case ("payment-paste", "record"):
      guard let field = fixture.controls["invoice"] as? NSTextField else { return true }
      let via = (field.cell as? PasteMarkingCell)?.editor.via(final: field.stringValue) ?? "typing"
      fixture.record("recorded", ["invoice": field.stringValue, "via": via])
      (fixture.controls["record-status"] as? NSTextField)?.stringValue = "Recorded a payment for \(field.stringValue)."
    default:
      return Keypad.press(name)
    }
    return true
  }

  /// Oracle and self-test steps: `pasteInto` pastes text through the field editor's paste path from a private board,
  /// `typeInto` types it; neither touches the owner's pasteboard.
  static func act(_ step: [String: Any]) -> Bool {
    let fixture = Fixture.shared
    let name = (step["pasteInto"] ?? step["typeInto"]) as? String
    guard let name, let field = fixture.controls[name] as? NSTextField, let cell = field.cell as? PasteMarkingCell else { return Grid.act(step) }
    let text = step["text"] as? String ?? ""
    field.window?.makeFirstResponder(field)
    let editor = cell.editor
    // Offscreen windows never become key, so the field may not have taken its editor: give it the editor directly.
    if field.currentEditor() == nil { cell.edit(withFrame: field.bounds, in: field, editor: editor, delegate: field, event: nil) }
    // As after a click at the end of the text: the caret after what is there, nothing selected - or, with
    // `selectAll`, everything selected (Command-A before the paste).
    if step["selectAll"] as? Bool == true { editor.selectAll(nil) }
    else { editor.setSelectedRange(NSRange(location: (editor.string as NSString).length, length: 0)) }
    if step["pasteInto"] != nil {
      let board = NSPasteboard(name: NSPasteboard.Name("cu-fixture-selftest-\(ProcessInfo.processInfo.processIdentifier)"))
      board.clearContents()
      board.setString(text, forType: .string)
      editor.paste(from: board)
      board.releaseGlobally()
    } else {
      for character in text { editor.insertText(String(character), replacementRange: editor.selectedRange()) }
    }
    field.stringValue = editor.string
    return true
  }

  /// Restore the owner's pasteboard when the app ends, however the run ended.
  static func installTerminationRestore() {
    NotificationCenter.default.addObserver(forName: NSApplication.willTerminateNotification, object: nil, queue: nil) { _ in
      _ = ClipboardStash.shared.restore()
    }
  }
}

/// A data provider that never provides: the item lists a type that cannot be read back.
final class SilentProvider: NSObject, NSPasteboardItemDataProvider {
  func pasteboard(_ pasteboard: NSPasteboard?, item: NSPasteboardItem, provideDataForType type: NSPasteboard.PasteboardType) {}
}

/// The stash's own check on a private named pasteboard (never the owner's): a round trip of two items with several
/// types; a concealed board left unread; a refused access, and a board that does not read back, both left as they
/// are; an empty board that ends empty; a restore with nothing saved leaving the board alone; and the general
/// pasteboard's change count untouched throughout.
enum ClipboardSelfTest {
  static func run() -> [String: Any] {
    let generalBefore = NSPasteboard.general.changeCount
    let board = NSPasteboard(name: NSPasteboard.Name("cu-fixture-stash-selftest-\(ProcessInfo.processInfo.processIdentifier)"))
    defer { board.releaseGlobally() }
    // Round trip.
    board.clearContents()
    let first = NSPasteboardItem(), second = NSPasteboardItem()
    first.setString("first item", forType: .string)
    first.setData(Data([1, 2, 3]), forType: NSPasteboard.PasteboardType("ai.reflection.cu.selftest"))
    second.setString("<b>second</b>", forType: .html)
    board.writeObjects([first, second])
    let stash = ClipboardStash(pasteboard: board)
    let saved = stash.save()
    let clearedAfterSave = (board.pasteboardItems ?? []).isEmpty
    board.setString("fixture text", forType: .string)
    let restored = stash.restore()
    let items = board.pasteboardItems ?? []
    let roundTrip = items.count == 2 && items[0].string(forType: .string) == "first item"
      && items[0].data(forType: NSPasteboard.PasteboardType("ai.reflection.cu.selftest")) == Data([1, 2, 3])
      && items[1].string(forType: .html) == "<b>second</b>"
    // Concealed: nothing read, nothing cleared.
    board.clearContents()
    let secret = NSPasteboardItem()
    secret.setString("hunter2", forType: .string)
    secret.setData(Data(), forType: ClipboardStash.concealed[0])
    board.writeObjects([secret])
    let concealedStash = ClipboardStash(pasteboard: board)
    let concealed = concealedStash.save()
    let concealedKept = board.string(forType: .string) == "hunter2" && !concealedStash.holding
    // Restore with nothing saved leaves the board as it is.
    let emptyRestore = concealedStash.restore()
    let leftAlone = board.string(forType: .string) == "hunter2"
    // Access not confirmed (the general board's default on macOS 15.4+ is to ask): for ask, deny and default nothing
    // is read and nothing cleared; an explicit allow round-trips.
    func refusedFor(_ behavior: String) -> (skipped: String, kept: Bool) {
      board.clearContents()
      board.setString("owner text", forType: .string)
      let stash = ClipboardStash(pasteboard: board, access: { _ in (false, behavior) })
      let reply = stash.save()
      return (reply["skipped"] as? String ?? "", board.string(forType: .string) == "owner text" && !stash.holding && reply["behavior"] as? String == behavior)
    }
    let ask = refusedFor("ask"), deny = refusedFor("alwaysDeny"), never = refusedFor("default")
    let refused = ask.skipped
    let refusedKept = ask.kept && deny.kept && never.kept && deny.skipped == refused && never.skipped == refused
    board.clearContents()
    board.setString("owner text", forType: .string)
    let allowStash = ClipboardStash(pasteboard: board, access: { _ in (true, "alwaysAllow") })
    let allowSaved = allowStash.save()
    board.setString("fixture text", forType: .string)
    _ = allowStash.restore()
    let allowRoundTrip = allowSaved["saved"] as? Int == 1 && board.string(forType: .string) == "owner text"
    // A listed type that does not read back: skipped, nothing cleared.
    board.clearContents()
    let provider = SilentProvider()
    let lazy = NSPasteboardItem()
    lazy.setString("readable", forType: .string)
    lazy.setDataProvider(provider, forTypes: [NSPasteboard.PasteboardType("ai.reflection.cu.never")])
    board.writeObjects([lazy])
    let unreadableStash = ClipboardStash(pasteboard: board)
    let unreadable = unreadableStash.save()
    let unreadableKept = board.string(forType: .string) == "readable" && !unreadableStash.holding
    // An empty board ends empty: the fixture's text is cleared by the restore.
    board.clearContents()
    let emptyStash = ClipboardStash(pasteboard: board)
    let emptySave = emptyStash.save()
    board.setString("INV-44752", forType: .string)
    let emptyEnd = emptyStash.restore()
    let endsEmpty = (board.pasteboardItems ?? []).isEmpty
    return [
      "saved": saved["saved"] ?? -1, "clearedAfterSave": clearedAfterSave, "restored": restored["restored"] ?? -1, "roundTrip": roundTrip,
      "concealed": concealed["skipped"] ?? "", "concealedKept": concealedKept, "emptyRestore": emptyRestore["restored"] ?? -1, "leftAlone": leftAlone,
      "privateBoardAccess": ClipboardStash.systemAccess(board).behavior,
      "refused": refused, "refusedKept": refusedKept, "allowRoundTrip": allowRoundTrip,
      "unreadable": unreadable["skipped"] ?? "", "unreadableKept": unreadableKept,
      "emptySaved": emptySave["saved"] ?? -1, "emptyCleared": emptyEnd["cleared"] ?? false, "endsEmpty": endsEmpty,
      "accessRules": accessRules(),
      "generalUntouched": NSPasteboard.general.changeCount == generalBefore,
    ]
  }

  /// Every access behaviour through the pure rule: only alwaysAllow reads (empty before macOS 15.4, where no prompt exists).
  static func accessRules() -> [String: Bool] {
    guard #available(macOS 15.4, *) else { return [:] }
    let cases: [(String, NSPasteboard.AccessBehavior)] = [("alwaysAllow", .alwaysAllow), ("ask", .ask), ("alwaysDeny", .alwaysDeny), ("default", .default)]
    var out: [String: Bool] = [:]
    for (name, behavior) in cases {
      let rule = ClipboardStash.allows(behavior)
      out[name] = rule.allowed && rule.behavior == name ? true : (rule.behavior == name ? false : nil)
    }
    return out
  }
}

/// The live-board check of the guard (cu-verifier's reviewed plan, 2026-11-06): the production save and restore on the
/// real general pasteboard, with fixture-made sentinel items only. It runs only when CU Fixture may read without
/// asking and the owner's board is empty - judged by type names and item count, no data - so the owner's content is
/// never held and nothing of theirs can be lost. It replies with booleans and counts only, and leaves the board empty.
/// Called by cu-verifier's announced live check only; no test calls it.
enum ClipboardLiveCheck {
  /// Raised when the board's change count moved by anything but the check's own writes (the owner copied something):
  /// the check stops at once and clears nothing more (cu-verifier's required change).
  struct OwnerWrote: Error {}

  static func run() -> [String: Any] {
    let board = NSPasteboard.general
    let access = ClipboardStash.systemAccess(board)
    guard access.allowed else { return ["skipped": "pasteboard access needs the owner", "behavior": access.behavior] }
    guard (board.types ?? []).isEmpty, (board.pasteboardItems ?? []).isEmpty else { return ["skipped": "owner board not empty"] }
    let startCount = board.changeCount
    var expected = startCount
    var ownWrites = 0
    /// One of the check's own writes or clears: only when the board is still as the check left it, and the count it
    /// leaves is the next expected one.
    func ours<T>(_ step: () -> T) throws -> T {
      guard board.changeCount == expected else { throw OwnerWrote() }
      let result = step()
      ownWrites += board.changeCount - expected
      expected = board.changeCount
      return result
    }
    let probeType = NSPasteboard.PasteboardType("ai.reflection.cu.livecheck")
    do {
      // (1) Non-empty round trip: two sentinel items, three types.
      try ours { board.clearContents() }
      let a = NSPasteboardItem(), b = NSPasteboardItem()
      a.setString("CU sentinel one", forType: .string)
      a.setData(Data([7, 8, 9]), forType: probeType)
      b.setString("<i>CU sentinel two</i>", forType: .html)
      try ours { _ = board.writeObjects([a, b]) }
      let roundStash = ClipboardStash(pasteboard: board)
      let roundSaved = try ours { roundStash.save() }
      let emptiedBySave = (board.pasteboardItems ?? []).isEmpty
      try ours { board.clearContents() }
      try ours { _ = board.setString("fixture text", forType: .string) }
      let roundRestored = try ours { roundStash.restore() }
      let back = board.pasteboardItems ?? []
      let roundTrip = roundSaved["saved"] as? Int == 2 && emptiedBySave && roundRestored["restored"] as? Int == 2 && back.count == 2
        && back[0].string(forType: .string) == "CU sentinel one" && back[0].data(forType: probeType) == Data([7, 8, 9])
        && back[1].string(forType: .html) == "<i>CU sentinel two</i>"
      // (2) An empty board ends empty.
      try ours { board.clearContents() }
      let emptyStash = ClipboardStash(pasteboard: board)
      let emptySaved = try ours { emptyStash.save() }
      try ours { board.clearContents() }
      try ours { _ = board.setString("INV-44752", forType: .string) }
      let emptyRestored = try ours { emptyStash.restore() }
      let endsEmpty = emptySaved["saved"] as? Int == 0 && emptyRestored["cleared"] as? Bool == true && (board.pasteboardItems ?? []).isEmpty
      // (3) Concealed: skipped, board unchanged, not holding.
      try ours { board.clearContents() }
      let secret = NSPasteboardItem()
      secret.setString("CU sentinel secret", forType: .string)
      secret.setData(Data(), forType: ClipboardStash.concealed[0])
      try ours { _ = board.writeObjects([secret]) }
      let concealedStash = ClipboardStash(pasteboard: board)
      let concealedReply = try ours { concealedStash.save() }
      let concealed = concealedReply["skipped"] as? String == "concealed" && board.string(forType: .string) == "CU sentinel secret" && !concealedStash.holding
      // (4) Unreadable: skipped, nothing cleared.
      try ours { board.clearContents() }
      let provider = SilentProvider()
      let lazy = NSPasteboardItem()
      lazy.setString("CU sentinel readable", forType: .string)
      lazy.setDataProvider(provider, forTypes: [NSPasteboard.PasteboardType("ai.reflection.cu.never")])
      try ours { _ = board.writeObjects([lazy]) }
      let unreadableStash = ClipboardStash(pasteboard: board)
      let unreadableReply = try ours { unreadableStash.save() }
      let unreadable = unreadableReply["skipped"] as? String == "clipboard unreadable" && board.string(forType: .string) == "CU sentinel readable" && !unreadableStash.holding
      // The board ends as it began: empty.
      try ours { board.clearContents() }
      let endEmpty = (board.types ?? []).isEmpty && (board.pasteboardItems ?? []).isEmpty
      return [
        "roundTrip": roundTrip, "endsEmpty": endsEmpty, "concealed": concealed, "unreadable": unreadable, "boardEmptyAtEnd": endEmpty,
        "behavior": access.behavior, "changeCountDelta": board.changeCount - startCount, "ownWrites": ownWrites,
      ]
    } catch {
      // Something else wrote: leave the board exactly as it is now.
      return ["stopped": "owner wrote during the check", "changeCountDelta": board.changeCount - startCount, "ownWrites": ownWrites]
    }
  }
}
