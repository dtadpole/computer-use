import AppKit

// CU-66 S7 'text-editor' (cu-researcher's spec): one rich-text view, a Format menu (Bold, Italic) and Undo/Redo in the
// Edit menu. A span pasted at open goes through the text view's undo manager, so a task can ask for it to be undone;
// bold is read back from the text's own font attributes, as ranges a judge can compare.

/// The editor: a rich-text view whose Bold and Italic toggle on the selection.
final class EditorTextView: NSTextView {
  @objc func toggleBold(_ sender: Any?) { toggle(.boldFontMask, name: "bold") }
  @objc func toggleItalic(_ sender: Any?) { toggle(.italicFontMask, name: "italic") }

  /// Adds the trait to the selection, or removes it if the whole selection already has it - through the undo manager,
  /// so Undo reverses a format as it reverses typing.
  private func toggle(_ trait: NSFontTraitMask, name: String) {
    let range = selectedRange()
    guard range.length > 0, let storage = textStorage else { return }
    let manager = NSFontManager.shared
    var all = true
    storage.enumerateAttribute(.font, in: range) { value, _, _ in
      if let font = value as? NSFont, !manager.traits(of: font).contains(trait) { all = false }
    }
    guard shouldChangeText(in: range, replacementString: nil) else { return }
    storage.beginEditing()
    storage.enumerateAttribute(.font, in: range) { value, sub, _ in
      let font = (value as? NSFont) ?? NSFont.systemFont(ofSize: 15)
      let changed = all ? manager.convert(font, toNotHaveTrait: trait) : manager.convert(font, toHaveTrait: trait)
      storage.addAttribute(.font, value: changed, range: sub)
    }
    storage.endEditing()
    didChangeText()
    Fixture.shared.record("formatted", ["style": name, "on": !all, "start": range.location, "length": range.length])
  }
}

final class TextEditorScreen {
  static var shared: TextEditorScreen?
  static let task = "text-editor"
  let scroll = NSScrollView(frame: NSRect(x: 12, y: 44, width: 676, height: 404))
  var editor: EditorTextView!
  private var installedMenu: NSMenuItem?
  private var addedEditItems: [NSMenuItem] = []

  static func open(_ task: String, title: String) -> Bool {
    guard task == Self.task else { return ChatThread.open(task, title: title) }
    let screen = TextEditorScreen()
    shared = screen
    screen.build(title: title)
    return true
  }

  private func build(title: String) {
    let fixture = Fixture.shared
    let params = Screens.params
    let content = FlippedView(frame: NSRect(x: 0, y: 0, width: 700, height: 460))
    content.wantsLayer = true
    content.layer?.backgroundColor = NSColor.white.cgColor
    let heading = Kit.label(params["heading"] as? String ?? "Draft", size: 15, bold: true)
    heading.frame = NSRect(x: 14, y: 14, width: 600, height: 22)
    content.addSubview(heading)

    let editor = EditorTextView(frame: NSRect(x: 0, y: 0, width: 676, height: 404))
    editor.isRichText = true
    editor.allowsUndo = true
    editor.font = NSFont.systemFont(ofSize: 15)
    editor.textColor = .black
    editor.textContainerInset = NSSize(width: 8, height: 8)
    editor.isAutomaticQuoteSubstitutionEnabled = false
    editor.isAutomaticSpellingCorrectionEnabled = false
    editor.isAutomaticTextReplacementEnabled = false
    editor.isAutomaticDashSubstitutionEnabled = false
    editor.string = params["text"] as? String ?? "Quarterly update\n\nRevenue grew in every region this quarter. The new pricing went live in March, and support tickets fell by a fifth."
    editor.typingAttributes = [.font: NSFont.systemFont(ofSize: 15), .foregroundColor: NSColor.black]
    editor.textStorage?.addAttributes([.font: NSFont.systemFont(ofSize: 15), .foregroundColor: NSColor.black], range: NSRange(location: 0, length: (editor.string as NSString).length))
    editor.identifier = NSUserInterfaceItemIdentifier("editor")
    self.editor = editor
    scroll.documentView = editor
    scroll.hasVerticalScroller = true
    scroll.scrollerStyle = .legacy
    scroll.borderType = .bezelBorder
    content.addSubview(scroll)
    fixture.controls["editor"] = editor
    installMenus()
    let window = Windows.open("main", title: params["title"] as? String ?? title, content: content)
    window.makeFirstResponder(editor)

    // params.pasteOnOpen {at, text}: inserted through the undo manager, so Undo takes it out again.
    if let paste = params["pasteOnOpen"] as? [String: Any], let text = paste["text"] as? String {
      let length = (editor.string as NSString).length
      let at = max(0, min(length, (paste["at"] as? NSNumber)?.intValue ?? length))
      let range = NSRange(location: at, length: 0)
      if editor.shouldChangeText(in: range, replacementString: text) {
        editor.textStorage?.replaceCharacters(in: range, with: NSAttributedString(string: text, attributes: editor.typingAttributes))
        editor.didChangeText()
        editor.undoManager?.setActionName("Paste")
      }
    }
  }

  /// The Format menu, and Undo/Redo in Edit, only while this screen is open: other screens' menu bars stay as they were.
  private func installMenus() {
    guard let main = NSApp.mainMenu else { return }
    let formatItem = NSMenuItem()
    let format = NSMenu(title: "Format")
    let bold = NSMenuItem(title: "Bold", action: #selector(EditorTextView.toggleBold(_:)), keyEquivalent: "b")
    let italic = NSMenuItem(title: "Italic", action: #selector(EditorTextView.toggleItalic(_:)), keyEquivalent: "i")
    format.addItem(bold)
    format.addItem(italic)
    formatItem.submenu = format
    main.addItem(formatItem)
    installedMenu = formatItem
    if let edit = main.items.first(where: { $0.submenu?.title == "Edit" })?.submenu, !edit.items.contains(where: { $0.title == "Undo" }) {
      let undo = NSMenuItem(title: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
      let redo = NSMenuItem(title: "Redo", action: Selector(("redo:")), keyEquivalent: "z")
      redo.keyEquivalentModifierMask = [.command, .shift]
      edit.insertItem(undo, at: 0)
      edit.insertItem(redo, at: 1)
      edit.insertItem(NSMenuItem.separator(), at: 2)
      addedEditItems = [undo, redo, edit.item(at: 2)!]
    }
  }

  /// Leaving the screen (a reset) takes the menus back out.
  static func uninstallMenus() {
    guard let screen = shared, let main = NSApp.mainMenu else { return }
    if let item = screen.installedMenu, main.items.contains(item) { main.removeItem(item) }
    for item in screen.addedEditItems { item.menu?.removeItem(item) }
    screen.installedMenu = nil
    screen.addedEditItems = []
  }

  /// Bold runs of the text, merged, as [start, length] in UTF-16 offsets.
  func boldRanges() -> [[Int]] {
    guard let storage = editor.textStorage else { return [] }
    var out: [[Int]] = []
    storage.enumerateAttribute(.font, in: NSRange(location: 0, length: storage.length)) { value, range, _ in
      guard let font = value as? NSFont, NSFontManager.shared.traits(of: font).contains(.boldFontMask) else { return }
      if let last = out.last, last[0] + last[1] == range.location { out[out.count - 1][1] += range.length } else { out.append([range.location, range.length]) }
    }
    return out
  }

  static func fields() -> [String: Any] {
    guard Screens.current == task, let screen = shared else { return [:] }
    let selected = screen.editor.selectedRange()
    return ["text": screen.editor.string, "boldRanges": screen.boldRanges(), "selection": [selected.location, selected.length],
            "canUndo": screen.editor.undoManager?.canUndo ?? false]
  }

  /// Seams: `selectText {start, length}`; `key {key: 'cmd+b'}` performs the menu item that key equivalent reaches, as
  /// the keystroke would.
  static func act(_ step: [String: Any]) -> Bool {
    guard Screens.current == task, let screen = shared else { return ChatThread.act(step) }
    if let spec = step["selectText"] as? [String: Any], let start = (spec["start"] as? NSNumber)?.intValue, let length = (spec["length"] as? NSNumber)?.intValue {
      screen.editor.window?.makeFirstResponder(screen.editor)
      screen.editor.setSelectedRange(NSRange(location: start, length: length))
      return true
    }
    if let spec = step["key"] as? [String: Any], let key = spec["key"] as? String, let item = Menus.itemForKey(key), let action = item.action {
      screen.editor.window?.makeFirstResponder(screen.editor)
      // From the editor up its responder chain (the window answers Undo/Redo): an offscreen window is never key, so
      // the app-level dispatch would find no target.
      if let target = item.target { return NSApp.sendAction(action, to: target, from: item) }
      return screen.editor.tryToPerform(action, with: item)
    }
    return false
  }
}
