// Unit tests of the helper's Swift code, compiled with every helper source except main.swift and run by
// helper.test.mjs. No grant is needed: the dispatcher runs over DryRunCapabilities, CGEvents are built and read back,
// never posted. Prints one JSON line { passed, failed, failures } and exits 1 on any failure.
import CoreGraphics
import Foundation
import ScreenCaptureKit
import ImageIO

var passed = 0
var failures: [String] = []

func check(_ condition: Bool, _ name: String, line: Int = #line) {
  if condition { passed += 1 } else { failures.append("\(name) (UnitTests.swift:\(line))") }
}

// Literals and lookups for writing requests in tests; not part of the shipped helper.
extension JSON: ExpressibleByStringLiteral, ExpressibleByBooleanLiteral, ExpressibleByIntegerLiteral, ExpressibleByFloatLiteral,
  ExpressibleByArrayLiteral, ExpressibleByDictionaryLiteral, ExpressibleByNilLiteral {
  public init(stringLiteral value: String) { self = .string(value) }
  public init(booleanLiteral value: Bool) { self = .bool(value) }
  public init(integerLiteral value: Int) { self = .number(Double(value)) }
  public init(floatLiteral value: Double) { self = .number(value) }
  public init(arrayLiteral elements: JSON...) { self = .array(elements) }
  public init(dictionaryLiteral elements: (String, JSON)...) { self = .object(Dictionary(uniqueKeysWithValues: elements)) }
  public init(nilLiteral: ()) { self = .null }
  subscript(key: String) -> JSON? { object?[key] }
  var text: String { String(decoding: JSONCoding.line(self).dropLast(), as: UTF8.self) }
}

// MARK: - JSON and parsing

func testMenuKey() {
  // CU-235: the matching rule on what AppKit serves Accessibility, the values measured 2026-11-08 (CU-235 part 1).
  let cmd: UInt64 = 0x100000, shift: UInt64 = 0x20000, option: UInt64 = 0x80000, control: UInt64 = 0x40000
  func chord(_ code: Int, _ flags: UInt64) -> MenuKey.Chord {
    MenuKey.Chord(keyCode: code, flags: flags, unshifted: MenuKey.usLayout[code]?.0, shifted: MenuKey.usLayout[code]?.1)
  }
  func entry(_ char: String?, _ modifiers: Int?, vk: Int? = nil, glyph: Int? = nil, enabled: Bool = true) -> MenuKey.Entry {
    MenuKey.Entry(title: "item", path: ["Menu", "item"], enabled: enabled, cmdChar: char, cmdModifiers: modifiers, cmdVirtualKey: vk, cmdGlyph: glyph)
  }
  let clearLog = entry("K", 1), plainK = entry("K", 0)
  check(MenuKey.fires(clearLog, chord(40, cmd | shift)) && !MenuKey.fires(clearLog, chord(40, cmd)), "Clear Log (K, Shift bit) fires on Shift-Command-K only")
  check(MenuKey.fires(plainK, chord(40, cmd)) && !MenuKey.fires(plainK, chord(40, cmd | shift)), "a Command-K item (K, 0) fires on Command-K, not Shift-Command-K")
  check(MenuKey.fires(entry("k", 0), chord(40, cmd)), "a lower-case CmdChar matches too (case carries nothing)")
  check(MenuKey.fires(entry("D", 1), chord(2, cmd | shift)) && !MenuKey.fires(entry("D", 1), chord(2, cmd | shift | option)), "Send on Shift-Command-D, not with Option too")
  check(MenuKey.fires(entry("V", 3), chord(9, cmd | option | shift)) && !MenuKey.fires(entry("V", 3), chord(9, cmd | shift)), "Paste and Match Style (V, 3) needs Option and Shift")
  check(MenuKey.fires(entry("W", 2), chord(13, cmd | option)), "an Option alternate (Close All, W, 2) fires on Command-Option-W")
  check(MenuKey.fires(entry("\u{8}", 0, vk: 51, glyph: 23), chord(51, cmd)) && !MenuKey.fires(entry("\u{8}", 0, vk: 51, glyph: 23), chord(51, 0)),
        "Move to Trash (Backspace, VK 51) fires on Command-Backspace, not a plain Backspace")
  check(MenuKey.fires(entry("\u{8}", 8, vk: 51, glyph: 23), chord(51, 0)), "a plain-Backspace item (no-Command bit) fires on Backspace alone")
  check(MenuKey.fires(entry("\u{1B}", 8, vk: 53, glyph: 27), chord(53, 0)) && MenuKey.fires(entry("\u{F708}", 8, vk: 96, glyph: 115), chord(96, 0)),
        "Escape and F5 match by virtual key")
  check(MenuKey.fires(entry("A", 12), chord(0, control)) && !MenuKey.fires(entry("A", 12), chord(0, control | cmd)), "a Control-only item (bits 4 and 8) needs no Command")
  check(MenuKey.fires(entry("1", 1), chord(18, cmd | shift)) && MenuKey.fires(entry("!", 0), chord(18, cmd | shift)),
        "Shift-Command-1 reaches '1' with Shift and '!' without it")
  check(!MenuKey.fires(entry("!", 0), chord(18, cmd)) && !MenuKey.fires(entry("1", 1), chord(18, cmd)), "Command-1 reaches neither")
  check(MenuKey.fires(entry("D", 3, enabled: false), chord(2, cmd | shift | option)), "a disabled item still matches (agent core judges it)")
  check(!MenuKey.fires(entry(nil, nil), chord(2, cmd)) && !MenuKey.fires(entry("", 0), chord(2, cmd)), "an item without a key equivalent never matches")
  check(!MenuKey.fires(entry(",", 0), chord(43, cmd | shift)) && MenuKey.fires(entry(",", 0), chord(43, cmd)), "punctuation matches the layout's character")
  // The read: every match in menu order, capped; a lazily filled menu turns a miss into unreadable.
  let send = MenuKey.Entry(title: "Send", path: ["Message", "Send"], enabled: true, cmdChar: "D", cmdModifiers: 1, cmdVirtualKey: nil, cmdGlyph: nil)
  let other = MenuKey.Entry(title: "Duplicate", path: ["Edit", "Duplicate"], enabled: false, cmdChar: "D", cmdModifiers: 1, cmdVirtualKey: nil, cmdGlyph: nil)
  check(MenuKey.read(bundleId: "a.b", entries: [other, send, plainK], emptyMenus: [], chord: chord(2, cmd | shift)) == .items(bundleId: "a.b", items: [other, send], truncated: false, incomplete: false),
        "every matching item is answered, a disabled first match does not hide an enabled one")
  check(MenuKey.read(bundleId: "a.b", entries: [plainK], emptyMenus: [], chord: chord(2, cmd | shift)) == .none(bundleId: "a.b", incomplete: false), "no match: none")
  check(MenuKey.isEmptyMenu(role: "AXMenu", depth: 2, childCount: 0, underApple: false) && MenuKey.isEmptyMenu(role: "AXMenuBarItem", depth: 1, childCount: 0, underApple: false),
        "an empty top-level menu, and a menu-bar item with no menu until it opens, are empty menus")
  check(!MenuKey.isEmptyMenu(role: "AXMenuBarItem", depth: 1, childCount: 0, underApple: true) && !MenuKey.isEmptyMenu(role: "AXMenu", depth: 2, childCount: 0, underApple: true),
        "the Apple menu (the first, by position) never counts")
  check(!MenuKey.isEmptyMenu(role: "AXMenu", depth: 4, childCount: 0, underApple: false) && !MenuKey.isEmptyMenu(role: "AXMenu", depth: 2, childCount: 3, underApple: false),
        "a nested empty submenu (Services, Open Recent) and a filled menu do not count - the named limit")
  // Hidden duplicates (CU-238's measurement: AX serves Send Now, the later duplicate of Mark as Read's Option-Command-D,
  // with modifiers 2 and no character).
  let markRead = MenuKey.Entry(title: "Mark as Read", path: ["Message", "Mark as Read"], enabled: false, cmdChar: "D", cmdModifiers: 2, cmdVirtualKey: nil, cmdGlyph: nil)
  let sendNow = MenuKey.Entry(title: "Send Now", path: ["Message", "Send Now"], enabled: true, cmdChar: nil, cmdModifiers: 2, cmdVirtualKey: nil, cmdGlyph: nil)
  check(MenuKey.hiddenDuplicate(sendNow, chord(2, cmd | option)) && !MenuKey.hiddenDuplicate(sendNow, chord(2, cmd | shift)),
        "(b) a key-less item whose non-zero modifiers equal the chord's is a hidden duplicate, for that modifier set only")
  check(MenuKey.read(bundleId: "a.b", entries: [markRead, sendNow], emptyMenus: [], chord: chord(2, cmd | option)) == .unreadable("a hidden duplicate key equivalent"),
        "(b) the duplicate case reads unreadable, never the disabled benign match alone")
  check(MenuKey.read(bundleId: "a.b", entries: [sendNow], emptyMenus: [], chord: chord(9, cmd | option)) == .unreadable("a hidden duplicate key equivalent"),
        "(b) holds whatever the chord's key: the hidden item's character is unknown")
  let plainItem = MenuKey.Entry(title: "About", path: ["App", "About"], enabled: true, cmdChar: nil, cmdModifiers: 0, cmdVirtualKey: nil, cmdGlyph: nil)
  check(!MenuKey.hiddenDuplicate(plainItem, chord(2, cmd)), "an item with no key equivalent (modifiers 0) is not a hidden duplicate - the Command-only blind spot")
  check(MenuKey.read(bundleId: "a.b", entries: [MenuKey.Entry(title: "Duplicate", path: ["Edit", "Duplicate"], enabled: false, cmdChar: "D", cmdModifiers: 0, cmdVirtualKey: nil, cmdGlyph: nil), plainItem],
                     emptyMenus: [], chord: chord(2, cmd)) == .unreadable("only disabled items match; a later duplicate may fire"),
        "(a) every match disabled: unreadable (a hidden duplicate on Command alone may fire)")
  let benign = MenuKey.Entry(title: "Bookmark", path: ["Edit", "Bookmark"], enabled: true, cmdChar: "D", cmdModifiers: 0, cmdVirtualKey: nil, cmdGlyph: nil)
  check(MenuKey.read(bundleId: "a.b", entries: [benign, plainItem], emptyMenus: [], chord: chord(2, cmd)) == .items(bundleId: "a.b", items: [benign], truncated: false, incomplete: false),
        "the named residual: an enabled first match on Command alone answers as itself (a later Command-only duplicate stays unseen)")
  check(MenuKey.read(bundleId: "a.b", entries: [markRead, send], emptyMenus: [], chord: chord(2, cmd | option)) == .unreadable("only disabled items match; a later duplicate may fire"),
        "(a) applies to the chord's own matches only: Send (Shift) does not count for Option-Command-D")
  check(MenuKey.read(bundleId: "a.b", entries: [MenuKey.Entry(title: "Move to Trash", path: ["File", "Move to Trash"], enabled: true, cmdChar: "\u{8}", cmdModifiers: 0, cmdVirtualKey: 51, cmdGlyph: 23)],
                     emptyMenus: [], chord: MenuKey.Chord(keyCode: 51, flags: cmd, unshifted: nil, shifted: nil))
        == .items(bundleId: "a.b", items: [MenuKey.Entry(title: "Move to Trash", path: ["File", "Move to Trash"], enabled: true, cmdChar: "\u{8}", cmdModifiers: 0, cmdVirtualKey: 51, cmdGlyph: 23)], truncated: false, incomplete: false),
        "a non-character key (Backspace) with no layout character is not incomplete: it matches by virtual key")
  // A nil layout (no character for the key): a miss is unreadable, never none; a virtual-key item still matches, marked incomplete.
  let noLayout = MenuKey.Chord(keyCode: 2, flags: cmd | shift, unshifted: nil, shifted: nil)
  if case .unreadable = MenuKey.read(bundleId: "a.b", entries: [send], emptyMenus: [], chord: noLayout) {} else {
    check(false, "a nil layout with a character item answers unreadable, not none")
  }
  let f5 = MenuKey.Entry(title: "Refresh", path: ["View", "Refresh"], enabled: true, cmdChar: nil, cmdModifiers: 8, cmdVirtualKey: 96, cmdGlyph: 115)
  check(MenuKey.read(bundleId: "a.b", entries: [f5, send], emptyMenus: [], chord: MenuKey.Chord(keyCode: 2, flags: cmd | shift, unshifted: nil, shifted: nil))
        == .unreadable("the keyboard layout gives no character for this key"), "a nil layout for a character key: unreadable even beside virtual-key items")
  if case .unreadable = MenuKey.read(bundleId: "a.b", entries: [plainK], emptyMenus: ["Bookmarks"], chord: chord(2, cmd | shift)) {} else {
    check(false, "a miss with a lazily filled menu is unreadable")
  }
  check(MenuKey.read(bundleId: "a.b", entries: [send], emptyMenus: ["Bookmarks"], chord: chord(2, cmd | shift)) == .items(bundleId: "a.b", items: [send], truncated: false, incomplete: true),
        "a match beside a lazily filled menu is answered, marked incomplete")
  let many = Array(repeating: send, count: 10)
  if case .items(_, let items, let truncated, _) = MenuKey.read(bundleId: "a.b", entries: many, emptyMenus: [], chord: chord(2, cmd | shift)) {
    check(items.count == MenuKey.maxItems && truncated, "at most \(MenuKey.maxItems) items, then truncated")
  } else { check(false, "ten matches answer items") }
  let wire = MenuKey.json(MenuKey.Entry(title: "Move to Trash", path: ["File", "Move to Trash"], enabled: true, cmdChar: "\u{8}", cmdModifiers: 0, cmdVirtualKey: 51, cmdGlyph: 23))
  check(wire == .object(["title": "Move to Trash", "path": ["File", "Move to Trash"], "enabled": true, "keyEquivalent": ["char": .null, "modifiers": 0, "glyph": 23, "virtualKey": 51]]),
        "a non-character key goes by glyph and virtual key, no control character on the wire")
  check(MenuKey.json(send)["keyEquivalent"] == .object(["char": "D", "modifiers": 1]), "a letter goes as its character, modifiers as AX's raw integer (CU-154's shape)")
  check(MenuKey.json(send)["appleMenu"] == nil, "appleMenu only on the Apple menu's items")
  // Through the dispatcher on a dry-run world: scope first, the frontmost approved app's declared menu bar.
  let display: JSON = [["id": 1, "main": true, "originPt": ["x": 0, "y": 0], "sizePt": ["width": 800, "height": 600], "scale": 1]]
  let rect: JSON = ["x": 100, "y": 100, "width": 400, "height": 300]
  let menus: JSON = [["title": "Apple", "items": [["title": "Lock Screen", "char": "Q", "modifiers": 4]]],
                     ["title": "Message", "items": [["title": "Send", "char": "D", "modifiers": 1], ["title": "Reply", "char": "R", "modifiers": 0]]],
                     ["title": "Edit", "items": [["title": "Delete", "char": "\u{8}", "modifiers": 8, "virtualKey": 51, "glyph": 23]]]]
  let mail = Harness(["displays": display, "frontmost": "ai.reflection.cu.fixture", "apps": [["bundleId": "ai.reflection.cu.fixture", "pid": 501, "rect": rect]], "menuKeyBar": menus])
  check(mail.ask("menuKey", ["keyCode": 2, "flags": .int(Int(cmd | shift))])["code"] == "no_scope", "menuKey needs a scope")
  _ = mail.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  let fired = mail.ask("menuKey", ["keyCode": 2, "flags": .int(Int(cmd | shift))])
  check(fired["bundleId"] == "ai.reflection.cu.fixture" && fired["items"]?.array?.first?.object?["path"] == ["Message", "Send"], "Shift-Command-D names Message > Send")
  check(mail.ask("menuKey", ["keyCode": 51, "flags": 0])["items"]?.array?.first?.object?["title"] == "Delete", "a plain Backspace names Edit > Delete")
  check(mail.ask("menuKey", ["keyCode": 2, "flags": .int(Int(cmd))])["none"] == true, "Command-D names nothing")
  let lock = mail.ask("menuKey", ["keyCode": 12, "flags": .int(Int(cmd | control))])["items"]?.array?.first?.object
  check(lock?["appleMenu"] == true && lock?["path"] == ["Apple", "Lock Screen"], "an Apple-menu item (the menu bar's first) is marked appleMenu")
  check(fired["items"]?.array?.first?.object?["appleMenu"] == nil, "an app's own item is not")
  check(mail.ask("menuKey", ["keyCode": 2, "flags": 1])["code"] == "invalid_argument" && mail.ask("menuKey", ["keyCode": 128, "flags": 0])["code"] == "invalid_argument",
        "flags are modifier bits only and keyCode is 0 to 127")
  let blind = Harness(["displays": display, "frontmost": "ai.reflection.cu.fixture", "apps": [["bundleId": "ai.reflection.cu.fixture", "pid": 501, "rect": rect]], "menuKeyBar": menus, "menuKeyBarUnreadable": true])
  _ = blind.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  check(blind.ask("menuKey", ["keyCode": 2, "flags": .int(Int(cmd | shift))])["unreadable"] == true, "a failed menu-bar read is unreadable, never none")
  let lazyBar: JSON = [["title": "Apple", "items": []], ["title": "Message", "items": [["title": "Send", "char": "D", "modifiers": 1]]], ["title": "History", "items": []]]
  let lazy = Harness(["displays": display, "frontmost": "ai.reflection.cu.fixture", "apps": [["bundleId": "ai.reflection.cu.fixture", "pid": 501, "rect": rect]], "menuKeyBar": lazyBar])
  _ = lazy.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  check(lazy.ask("menuKey", ["keyCode": 40, "flags": .int(Int(cmd))])["unreadable"] == true, "a miss beside an empty non-first menu is unreadable")
  check(lazy.ask("menuKey", ["keyCode": 2, "flags": .int(Int(cmd | shift))])["incomplete"] == true, "a match beside it is marked incomplete")
  let appleOnly = Harness(["displays": display, "frontmost": "ai.reflection.cu.fixture", "apps": [["bundleId": "ai.reflection.cu.fixture", "pid": 501, "rect": rect]],
                           "menuKeyBar": [["title": "Pomme", "items": []], ["title": "Message", "items": [["title": "Send", "char": "D", "modifiers": 1]]]]])
  _ = appleOnly.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  check(appleOnly.ask("menuKey", ["keyCode": 40, "flags": .int(Int(cmd))])["none"] == true, "the first menu is the Apple menu by position, whatever its title: empty, it does not count")
  let elsewhere = Harness(["displays": display, "frontmost": "com.example.other", "apps": [["bundleId": "com.example.other", "pid": 600, "rect": rect]], "menuKeyBar": menus])
  _ = elsewhere.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  check(elsewhere.ask("menuKey", ["keyCode": 2, "flags": .int(Int(cmd | shift))])["unreadable"] == true, "another app in front: unreadable, its menus are not read")
}

func testServicesMenu() {
  // CU-250: a menu item says where it sits, and a submenu that is the Services menu flags every item under it.
  let english = ServicesMenu.english
  check(english.isServices(itemTitle: "Services", childTitles: []), "the Services item counts by its title")
  check(english.isServices(itemTitle: "Dienste", childTitles: ["Text", "Services Settings\u{2026}"]), "or by AppKit's marker item in its submenu, whatever the holder's title")
  check(!english.isServices(itemTitle: "Edit", childTitles: ["Copy", "Paste"]), "an ordinary submenu does not")
  let german = ServicesMenu(titles: ["Services", "Dienste"], markers: english.markers.union(["Dienste-Einstellungen\u{2026}"]))
  check(german.isServices(itemTitle: "Dienste", childTitles: []), "the current language's title, read from AppKit, counts too")
  let services = MenuContext.Level(holderTitle: "Services", childTitles: ["Make New Sticky Note", "Weekly Report Uploader", "Services Settings\u{2026}"])
  let inApp = MenuContext.of(itemTitle: "Weekly Report Uploader", levels: [services, MenuContext.Level(holderTitle: "CU Fixture", childTitles: ["About CU Fixture", "Services", "Quit CU Fixture"])], services: english)
  check(inApp == MenuContext(path: ["CU Fixture", "Services", "Weekly Report Uploader"], servicesMenu: true), "an owner-installed service under the app menu's Services: flagged, with its path")
  let inContext = MenuContext.of(itemTitle: "Make New Sticky Note", levels: [services, MenuContext.Level(holderTitle: nil, childTitles: ["Cut", "Copy", "Paste", "Services"])], services: english)
  check(inContext == MenuContext(path: ["Services", "Make New Sticky Note"], servicesMenu: true), "a context menu's Services item: flagged, its path from the context menu's top")
  let plain = MenuContext.of(itemTitle: "Copy", levels: [MenuContext.Level(holderTitle: "Edit", childTitles: ["Cut", "Copy", "Paste"])], services: english)
  check(plain == MenuContext(path: ["Edit", "Copy"], servicesMenu: false) && plain.json["servicesMenu"] == nil, "an ordinary item: its path, no flag")
  let deep = Array(repeating: MenuContext.Level(holderTitle: "More", childTitles: []), count: 14)
  check(MenuContext.of(itemTitle: "Leaf", levels: deep, services: english).path.count == MenuContext.maxDepth + 1, "the path is capped at \(MenuContext.maxDepth) levels")
  // Dry run: a declared menu item gets the same context on hitTest; menuKey items under Services are flagged.
  let display: JSON = [["id": 1, "main": true, "originPt": ["x": 0, "y": 0], "sizePt": ["width": 800, "height": 600], "scale": 1]]
  let rect: JSON = ["x": 100, "y": 100, "width": 400, "height": 300]
  let serviceItem: JSON = ["bundleId": "ai.reflection.cu.fixture", "pid": 501, "role": "AXMenuItem", "title": "Weekly Report Uploader",
                           "menuLevels": [["holderTitle": "Services", "childTitles": ["Weekly Report Uploader", "Services Settings\u{2026}"]], ["holderTitle": "CU Fixture", "childTitles": ["Services"]]]]
  let editItem: JSON = ["bundleId": "ai.reflection.cu.fixture", "pid": 501, "role": "AXMenuItem", "title": "Copy", "menuLevels": [["holderTitle": "Edit", "childTitles": ["Copy"]]]]
  let world: JSON = ["displays": display, "frontmost": "ai.reflection.cu.fixture", "apps": [["bundleId": "ai.reflection.cu.fixture", "pid": 501, "rect": rect]],
                     "elements": [["rect": ["x": 110, "y": 110, "width": 50, "height": 20], "element": serviceItem], ["rect": ["x": 200, "y": 110, "width": 50, "height": 20], "element": editItem]],
                     "menuKeyBar": [["title": "Apple", "items": []], ["title": "CU Fixture", "items": [["title": "Services", "items": [["title": "Search With Google", "char": "L", "modifiers": 1], ["title": "Services Settings\u{2026}"]]]]],
                                    ["title": "Edit", "items": [["title": "Copy", "char": "C", "modifiers": 0]]]]]
  let h = Harness(world)
  _ = h.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  let hit = h.ask("hitTest", ["xPt": 120, "yPt": 115])["element"]?.object
  check(hit?["servicesMenu"] == true && hit?["menuPath"] == ["CU Fixture", "Services", "Weekly Report Uploader"], "hitTest on a service: servicesMenu with its path")
  check(hit?["menuLevels"] == nil, "the declared levels never reach the wire")
  let copy = h.ask("hitTest", ["xPt": 210, "yPt": 115])["element"]?.object
  check(copy?["servicesMenu"] == nil && copy?["menuPath"] == ["Edit", "Copy"], "hitTest on Edit > Copy: its path, no flag")
  let cmd: UInt64 = 0x100000, shift: UInt64 = 0x20000
  let google = h.ask("menuKey", ["keyCode": 37, "flags": .int(Int(cmd | shift))])["items"]?.array?.first?.object
  check(google?["servicesMenu"] == true && google?["path"] == ["CU Fixture", "Services", "Search With Google"], "menuKey: a service's item carries servicesMenu")
  check(h.ask("menuKey", ["keyCode": 8, "flags": .int(Int(cmd))])["items"]?.array?.first?.object?["servicesMenu"] == nil, "menuKey: Edit > Copy does not")
}

func testSelectedItems() {
  // CU-262: the focused collection's selected items - names and kinds from Accessibility only, never a path.
  typealias Raw = SelectedItems.Raw
  check(SelectedItems.kind(url: "file:///tmp/sandbox/Payload.app/") == "folder" && SelectedItems.kind(url: "file:///tmp/sandbox/install.command") == "file"
        && SelectedItems.kind(url: nil) == "unknown" && SelectedItems.kind(url: "https://example.com/a") == "unknown", "kind from the URL string: folder slash, file, none")
  check(SelectedItems.name(Raw(filename: "notes.txt", url: "file:///tmp/sandbox/other.txt", text: "x")) == "notes.txt", "AXFilename first")
  check(SelectedItems.name(Raw(filename: nil, url: "file:///tmp/sandbox/Payload.app/", text: "Payload")) == "Payload.app", "else the URL's leaf - a hidden extension shows")
  check(SelectedItems.name(Raw(filename: nil, url: "file:///tmp/sandbox/my%20script.command", text: nil)) == "my script.command", "the leaf percent-decoded")
  check(SelectedItems.name(Raw(filename: nil, url: nil, text: "Recents item")) == "Recents item" && SelectedItems.name(Raw(filename: "", url: nil, text: nil)) == nil, "else the text; nothing gives no name")
  let script = Raw(filename: nil, url: "file:///tmp/sandbox/install.command", text: "install.command")
  check(SelectedItems.read(bundleId: "a.b", focusedRole: "AXOutline", selection: [script]) == .items(bundleId: "a.b", items: [SelectedItems.Item(name: "install.command", kind: "file")], truncated: false),
        "a list view's selected row: its name and kind")
  check(SelectedItems.read(bundleId: "a.b", focusedRole: "AXOutline", selection: []) == .none(bundleId: "a.b"), "nothing selected: none")
  check(SelectedItems.read(bundleId: "a.b", focusedRole: "AXTextArea", selection: [script]) == .notCollection(bundleId: "a.b"), "a focus that is no collection: notCollection")
  check(SelectedItems.read(bundleId: "a.b", focusedRole: nil, selection: nil) == .notCollection(bundleId: "a.b"), "no focused role: notCollection")
  check(SelectedItems.read(bundleId: "a.b", focusedRole: "AXGroup", selection: nil) == .unreadable("the selection could not be read"), "a selection that cannot be read: unreadable, never none")
  check(SelectedItems.read(bundleId: "a.b", focusedRole: "AXList", selection: [script, Raw(filename: nil, url: nil, text: nil)]) == .unreadable("a selected item has no name"),
        "an unnamed item: unreadable")
  if case .items(_, let items, let truncated) = SelectedItems.read(bundleId: "a.b", focusedRole: "AXTable", selection: Array(repeating: script, count: 33)) {
    check(items.count == SelectedItems.maxItems && truncated, "at most 32 items, then truncated (the driver reads it as unreadable)")
  } else { check(false, "33 selected items answer items, truncated") }
  check(SelectedItems.Read.items(bundleId: "a.b", items: [SelectedItems.Item(name: "Payload.app", kind: "folder")], truncated: false).json
        == ["bundleId": "a.b", "items": [["name": "Payload.app", "kind": "folder"]]], "the wire: names and kinds, no path, no URL")
  // Through the dispatcher on a dry-run world.
  let display: JSON = [["id": 1, "main": true, "originPt": ["x": 0, "y": 0], "sizePt": ["width": 800, "height": 600], "scale": 1]]
  let rect: JSON = ["x": 100, "y": 100, "width": 400, "height": 300]
  let apps: JSON = [["bundleId": "ai.reflection.cu.fixture", "pid": 501, "rect": rect]]
  let h = Harness(["displays": display, "frontmost": "ai.reflection.cu.fixture", "apps": apps,
                   "selectedItems": ["role": "AXOutline", "items": [["url": "file:///tmp/sandbox/install.command"], ["filename": "notes.txt", "url": "file:///tmp/sandbox/notes.txt"]]]])
  check(h.ask("selectedItems")["code"] == "no_scope", "selectedItems needs a scope")
  _ = h.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  let reply = h.ask("selectedItems")
  check(reply["items"] == [["name": "install.command", "kind": "file"], ["name": "notes.txt", "kind": "file"]] && reply["bundleId"] == "ai.reflection.cu.fixture",
        "the dry run answers the declared selection, names and kinds only")
  check(reply.object?.keys.contains("path") == false && reply.object?.keys.contains("url") == false, "no path or URL on the wire")
  let plain = Harness(["displays": display, "frontmost": "ai.reflection.cu.fixture", "apps": apps])
  _ = plain.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  check(plain.ask("selectedItems")["notCollection"] == true, "no declared collection: notCollection")
  // cu-verifier on #70: a row whose only text is its AXValue (a mail subject, a cell) gives no name - unreadable, never the value.
  let mailList = Harness(["displays": display, "frontmost": "ai.reflection.cu.fixture", "apps": apps,
                          "selectedItems": ["role": "AXTable", "items": [["value": "Quarterly numbers - private"]]]])
  _ = mailList.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  let mailReply = mailList.ask("selectedItems")
  check(mailReply["unreadable"] == true && mailReply["items"] == nil, "a row known only by its value: unreadable, the value never sent")
  let labelled = Harness(["displays": display, "frontmost": "ai.reflection.cu.fixture", "apps": apps,
                          "selectedItems": ["role": "AXList", "items": [["label": "Recents item", "value": "contents"]]]])
  _ = labelled.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  check(labelled.ask("selectedItems")["items"] == [["name": "Recents item", "kind": "unknown"]], "a label (AXTitle/AXDescription) names it, kind unknown")
  let blind = Harness(["displays": display, "frontmost": "ai.reflection.cu.fixture", "apps": apps, "selectedItems": ["role": "AXGroup", "unreadable": true]])
  _ = blind.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  check(blind.ask("selectedItems")["unreadable"] == true, "an unreadable selection: unreadable")
  let other = Harness(["displays": display, "frontmost": "com.example.other", "apps": [["bundleId": "com.example.other", "pid": 600, "rect": rect]],
                       "selectedItems": ["role": "AXOutline", "items": [["filename": "secret.txt"]]]])
  _ = other.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  check(other.ask("selectedItems")["unreadable"] == true, "another app in front: unreadable, its selection is not read")
}

func testGrantRecheck() {
  // CU-240: a grant read false is re-read (3 times, 100 ms apart) only if it read true earlier in this run.
  var sleeps: [TimeInterval] = []
  func reader(_ values: [Bool]) -> () -> Bool { var rest = values; return { rest.count > 1 ? rest.removeFirst() : rest[0] } }
  let sleep: (TimeInterval) -> Void = { sleeps.append($0) }
  check(GrantRecheck.check(seenTrue: false, read: reader([true]), sleep: sleep) == .init(granted: true, wasGranted: true, rechecks: 0) && sleeps.isEmpty, "a true needs no re-read")
  check(GrantRecheck.check(seenTrue: false, read: reader([false, true]), sleep: sleep) == .init(granted: false, wasGranted: false, rechecks: 0) && sleeps.isEmpty,
        "a grant never true in this run is refused at once, no re-read")
  check(GrantRecheck.check(seenTrue: true, read: reader([false, true]), sleep: sleep) == .init(granted: true, wasGranted: true, rechecks: 1) && sleeps == [0.1],
        "after an earlier true, a transient false re-reads once and goes ahead")
  sleeps = []
  check(GrantRecheck.check(seenTrue: true, read: reader([false]), sleep: sleep) == .init(granted: false, wasGranted: true, rechecks: 3) && sleeps == [0.1, 0.1, 0.1],
        "a grant lost mid-run is refused after 3 re-reads, about 300 ms")
  sleeps = []
  var reads: [Grants] = [Grants(screen: false, accessibility: true, postEvents: true, listenEvents: false), Grants(screen: true, accessibility: true, postEvents: true, listenEvents: false)]
  let settled = GrantRecheck.settled(read: { reads.count > 1 ? reads.removeFirst() : reads[0] }, sleep: sleep)
  check(settled.screen && settled.accessibility && sleeps.count == 1, "at launch a transient Screen Recording false beside other grants is re-read")
  sleeps = []
  check(GrantRecheck.settled(read: { .none }, sleep: sleep) == .none && sleeps.isEmpty, "a helper with no grant at all is not slowed at launch")
  sleeps = []
  let lost = GrantRecheck.settled(read: { Grants(screen: false, accessibility: true, postEvents: true, listenEvents: false) }, sleep: sleep)
  check(!lost.screen && sleeps.count == 3, "a Screen Recording grant that stays false after 3 re-reads is reported false")
  // CU-303: a start that cannot hold a grant (dry run, simulated ungranted) reads no TCC at all; a live start does.
  sleeps = []
  var startReads = 0
  let granted = Grants(screen: true, accessibility: true, postEvents: true, listenEvents: true)
  check(GrantRecheck.atStart(mayHoldGrants: false, read: { startReads += 1; return granted }, sleep: sleep) == .none && startReads == 0 && sleeps.isEmpty,
        "a dry or simulated start takes no grant and asks TCC nothing")
  check(GrantRecheck.atStart(mayHoldGrants: true, read: { startReads += 1; return granted }, sleep: sleep) == granted && startReads == 1,
        "a live start reads the grants once when they read true")
  for (flags, may) in [(["--dry-run"], false), (["--simulate-ungranted"], false), ([], true)] {
    let parsed = try? HelperArguments.parse(["--socket", "/tmp/s", "--token-file", "/tmp/t"] + flags)
    check(parsed?.mayHoldGrants == may, "mayHoldGrants is \(may) for \(flags)")
  }
  // Through the dispatcher on a dry-run world whose single reads of Screen Recording are scripted.
  let display: JSON = [["id": 1, "main": true, "originPt": ["x": 0, "y": 0], "sizePt": ["width": 800, "height": 600], "scale": 1]]
  let apps: JSON = [["bundleId": "ai.reflection.cu.fixture", "pid": 501, "rect": ["x": 100, "y": 100, "width": 400, "height": 300]]]
  let size: JSON = ["width": 800, "height": 600]
  let flicker = Harness(["displays": display, "frontmost": "ai.reflection.cu.fixture", "apps": apps, "grantReads": ["screen": [true, false, true]]])
  _ = flicker.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  check(flicker.ask("capture", ["maxSize": size])["ok"] == true, "a first capture reads Screen Recording true")
  check(flicker.ask("capture", ["maxSize": size])["ok"] == true, "a transient false after it is re-read and the capture goes ahead")
  let lostRun = Harness(["displays": display, "frontmost": "ai.reflection.cu.fixture", "apps": apps, "grantReads": ["screen": [true, false]]])
  _ = lostRun.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  _ = lostRun.ask("capture", ["maxSize": size])
  let refused = lostRun.ask("capture", ["maxSize": size])
  check(refused["code"] == "not_granted" && refused["grant"] == "screen" && refused["wasGranted"] == true && refused["rechecks"] == 3,
        "a grant lost mid-run: not_granted with the grant, wasGranted and the re-read count")
  let never = Harness(["displays": display, "frontmost": "ai.reflection.cu.fixture", "apps": apps, "grants": ["screen": false]])
  _ = never.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  let first = never.ask("capture", ["maxSize": size])
  check(first["code"] == "not_granted" && first["wasGranted"] == nil && first["rechecks"] == nil, "a grant never given: not_granted as before, no wasGranted")
  let inputLost = Harness(["displays": display, "frontmost": "ai.reflection.cu.fixture", "apps": apps, "grantReads": ["input": [true, false]]])
  _ = inputLost.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  _ = inputLost.ask("input", ["events": [["kind": "keyDown", "keyCode": 0, "flags": 0], ["kind": "keyUp", "keyCode": 0, "flags": 0]], "mode": "global"])
  let inputRefused = inputLost.ask("input", ["events": [["kind": "keyDown", "keyCode": 0, "flags": 0], ["kind": "keyUp", "keyCode": 0, "flags": 0]], "mode": "global"])
  check(inputRefused["code"] == "not_granted" && inputRefused["wasGranted"] == true, "input whose grant is lost mid-run is refused, marked wasGranted (the driver ends the run)")
}

func testEndWatchdog() {
  // CU-227: an end that cannot finish still ends - the watchdog fires once its bound has passed, on its own thread,
  // with the end's reason, and not before.
  let fired = DispatchSemaphore(value: 0)
  var seen: String?
  let thread = EndWatchdog.arm(after: 0.2, reason: "the driver closed the connection") { why in
    seen = why
    fired.signal()
  }
  check(fired.wait(timeout: .now() + 0.05) == .timedOut, "the end watchdog does not fire before its bound")
  check(fired.wait(timeout: .now() + 2) == .success && seen == "the driver closed the connection", "the end watchdog fires after its bound with the end's reason")
  check(thread !== Thread.current && thread.name == "cu-helper-end-watchdog", "the end watchdog runs on a thread of its own")
  check(EndWatchdog.bound == 5 && EndWatchdog.exitCode == 70, "the end watchdog's bound is 5 s and its exit code 70")
  // The held copy the watchdog releases from (cu-researcher's stuck-modifier case): a down is added before its post,
  // an up dropped after it; the release is keys up in reverse, then buttons up where the pointer is.
  let mirror = HeldMirror()
  mirror.willPost(.keyDown(56, flags: 0))
  mirror.willPost(.keyDown(0, flags: 0))
  mirror.willPost(.down(.left, CGPoint(x: 5, y: 5), clickCount: 1, flags: 0))
  check(mirror.snapshot().keys == [56, 0] && mirror.snapshot().buttons == [.left], "a down is in the copy as soon as it is about to be posted")
  mirror.didPost(.keyUp(0, flags: 0))
  check(mirror.snapshot().keys == [56], "an up leaves the copy once posted")
  check(!mirror.snapshot().dragged, "a pressed button that has not moved is no drag")
  check(HeldMirror.releaseSteps(keys: [56, 0], buttons: [.left], dragged: false, at: CGPoint(x: 9, y: 8))
        == [.keyUp(0, flags: 0), .keyUp(56, flags: 0), .up(.left, CGPoint(x: 9, y: 8), clickCount: 1, flags: 0)], "the watchdog's release: keys up in reverse, then buttons at the pointer")
  mirror.willPost(.drag(.left, CGPoint(x: 40, y: 40), flags: 0))
  check(mirror.snapshot().dragged, "a held button that moved is a drag in flight")
  check(HeldMirror.releaseSteps(keys: [], buttons: [.left], dragged: true, at: CGPoint(x: 9, y: 8))
        == [.keyDown(53, flags: 0), .keyUp(53, flags: 0), .up(.left, CGPoint(x: 9, y: 8), clickCount: 1, flags: 0)],
        "a drag in flight is cancelled with Escape before its button comes up (a bare up would drop it)")
  mirror.didPost(.up(.left, CGPoint(x: 40, y: 40), clickCount: 1, flags: 0))
  check(mirror.snapshot().buttons.isEmpty && !mirror.snapshot().dragged, "the button's up ends the drag in the copy")
  // cu-researcher: the watchdog only tries the copy's lock; busy past the timeout, it falls back to the held-keys marker.
  check(mirror.locked { mirror.trySnapshot(timeout: 0.05) } == nil, "a busy copy is not waited on past the try-lock's timeout")
  check(mirror.trySnapshot(timeout: 0.05) != nil, "a free copy is read at once")
  let markerFolder = NSTemporaryDirectory() + "cu-held-\(getpid())"
  try? FileManager.default.createDirectory(atPath: markerFolder, withIntermediateDirectories: true)
  HeldMarker.write(.object(["pid": .int(1), "keys": .array([.int(55)]), "buttons": .array([.string("left")])]), to: markerFolder + "/held-keys.json")
  let fallback = HeldMirror.fromMarker(markerFolder + "/held-keys.json")
  check(fallback.keys == [55] && fallback.buttons == [.left] && fallback.dragged, "the marker fallback names the held keys and buttons, a held button treated as a drag")
  check(HeldMirror.fromMarker(nil).keys.isEmpty && HeldMirror.fromMarker(markerFolder + "/none.json").buttons.isEmpty, "no marker: nothing to release")
  try? FileManager.default.removeItem(atPath: markerFolder)
  // The release runs on a second thread and is waited on for a bound only: a wedged post cannot keep the helper alive.
  let started = Date()
  let partial = EndWatchdog.boundedRelease(timeout: 0.2) { progress in
    progress.note()
    Thread.sleep(forTimeInterval: 3)
    progress.note()
  }
  check(partial == 1 && Date().timeIntervalSince(started) < 1, "a release that blocks is abandoned after its bound with what it posted so far")
  check(EndWatchdog.releaseBound == 1, "the watchdog waits about 1 s for its release")
  // stopped.json for the driver (#130): beside the held-keys marker, {reason, released, at}.
  let folder = NSTemporaryDirectory() + "cu-stopped-\(getpid())"
  try? FileManager.default.createDirectory(atPath: folder, withIntermediateDirectories: true)
  let marker = folder + "/held-keys.json"
  check(StoppedMarker.path(besideHeldMarker: marker) == folder + "/stopped.json", "stopped.json sits beside the held-keys marker")
  StoppedMarker.write(reason: "the driver closed the connection", released: 3, besideHeldMarker: marker, at: Date(timeIntervalSince1970: 1_800_000_000))
  let stopped = FileManager.default.contents(atPath: folder + "/stopped.json").flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
  check(stopped?["reason"] as? String == "the driver closed the connection" && stopped?["released"] as? Int == 3 && (stopped?["at"] as? String)?.hasPrefix("2027-01-15T") == true,
        "stopped.json says the end's reason, how many steps were released, and when")
  check(StoppedMarker.phrase("the run's wall-time cap") == "the runs wall-time cap" && StoppedMarker.phrase("signal 15") == "signal 15" && StoppedMarker.phrase("'") == "unknown",
        "the reason is written in the driver's accepted class: a letter first, then letters, digits, space, '_' or '-'")
  let mode = (try? FileManager.default.attributesOfItem(atPath: folder + "/stopped.json")[.posixPermissions] as? Int) ?? 0
  check(mode == 0o600, "stopped.json is private to the owner (mode 600)")
  try? FileManager.default.removeItem(atPath: folder)
  // Through the dispatcher: what an input request leaves held is in its copy; the ups take it out.
  let display: JSON = [["id": 1, "main": true, "originPt": ["x": 0, "y": 0], "sizePt": ["width": 800, "height": 600], "scale": 1]]
  let h = Harness(["displays": display, "frontmost": "ai.reflection.cu.fixture", "apps": [["bundleId": "ai.reflection.cu.fixture", "pid": 501, "rect": ["x": 100, "y": 100, "width": 400, "height": 300]]]])
  _ = h.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  _ = h.ask("pauseOnLocalInput", ["on": true])
  // A held modifier, read from another thread during the hold: the copy has it; after the request's end releases it, not.
  let done = DispatchSemaphore(value: 0)
  var holdReply: JSON = .null
  DispatchQueue.global().async {
    holdReply = h.ask("input", ["events": [["kind": "keyDown", "keyCode": 56, "flags": 0x20000], ["kind": "hold", "ms": 600], ["kind": "keyUp", "keyCode": 56, "flags": 0]], "mode": "global"])
    done.signal()
  }
  Thread.sleep(forTimeInterval: 0.25)
  check(h.dispatcher.heldMirror.snapshot().keys == [56], "during a hold the held modifier is in the dispatcher's copy")
  check(done.wait(timeout: .now() + 5) == .success && h.dispatcher.heldMirror.snapshot().keys.isEmpty, "its key-up takes it out")
  check(holdReply["done"] == true, "the held input request completes")
}

func testJSON() {
  let parsed = JSONCoding.decode(Data(#"{"a":true,"b":1,"c":1.5,"d":"x\ny","e":[null,false],"f":{"g":2}}"#.utf8))
  check(parsed?["a"] == .bool(true), "a boolean stays a boolean")
  check(parsed?["b"]?.integer == 1 && parsed?["c"]?.integer == nil && parsed?["a"]?.integer == nil, "integers are exact numbers only")
  let line = parsed!.text
  check(!line.contains("\n") && line.contains(#""b":1"#) && line.contains(#""c":1.5"#), "one line; whole numbers without a fraction")
  check(JSONCoding.decode(Data(line.utf8)) == parsed, "encoding round-trips")
  check(JSONCoding.decode(Data("not json".utf8)) == nil, "garbage does not parse")
}

func parse(_ request: JSON) -> (id: JSON?, result: Result<(type: String, request: Request), Refusal>) {
  RequestParser.parse(JSONCoding.line(request).dropLast())
}

func code(_ request: JSON) -> String? {
  if case .failure(let refusal) = parse(request).result { return refusal.code }
  return nil
}

func testParser() {
  check(code(["id": 1, "type": "nope"]) == "unknown_request", "an unknown request is refused by name")
  check(code(["id": 1, "type": "capture", "maxSize": ["width": 1, "height": 1], "zeta": 1]) == "unknown_field", "an unknown field is refused by name")
  check(code(["type": "focused"]) == "invalid_argument", "a request needs an id")
  check(code(["id": 1, "type": "simulateLocalInput", "kind": "key", "via": "idle"]) == nil, "the seam parses")
  check(code(["id": 1, "type": "simulateLocalInput", "via": "idle"]) == "invalid_argument", "the seam's kind is required, as the driver sends it")
  check(code(["id": 1, "type": "simulateLocalInput", "kind": "key", "via": "nose"]) == "invalid_argument", "the seam's via is checked")
  check(code(["id": 1, "type": "simulateLocalInput", "via": "tap", "kind": "voice"]) == "invalid_argument", "the seam's kind is checked")
  check(code(["id": 1, "type": "capture", "maxSize": ["width": 1, "height": 1], "simulateScale": 2]) == nil, "simulateScale 2 parses")
  check(code(["id": 1, "type": "capture", "maxSize": ["width": 1, "height": 1], "simulateScale": 1]) == "invalid_argument", "simulateScale is above 1")
  check(code(["id": 1, "type": "capture", "maxSize": ["width": 1, "height": 1], "simulateScale": 4.5]) == "invalid_argument", "simulateScale is at most 4")
  check(Set(HelperProtocol.fields.keys) == ["scope", "capture", "input", "hitTest", "focused", "selection", "cursor", "panelSelection", "menuKey", "selectedItems", "screenText", "watch", "unwatch", "pauseOnLocalInput", "simulateLocalInput", "confirmPhysical", "bye"], "the request set")
  // CU-64: the hold step - 1..10000 ms each, at most 10 s in one request, and allowed in pid (keyboard) mode.
  let down: JSON = ["kind": "keyDown", "keyCode": 56, "flags": 0]
  let up: JSON = ["kind": "keyUp", "keyCode": 56, "flags": 0]
  check(code(["id": 1, "type": "input", "mode": "global", "events": [down, ["kind": "hold", "ms": 1500], up]]) == nil, "a hold between a down and its up parses")
  check(code(["id": 1, "type": "input", "mode": "pid", "events": [down, ["kind": "hold", "ms": 500], up]]) == nil, "a key hold may go by pid")
  check(code(["id": 1, "type": "input", "mode": "global", "events": [down, ["kind": "hold", "ms": 0], up]]) == "invalid_argument", "a hold is at least 1 ms")
  check(code(["id": 1, "type": "input", "mode": "global", "events": [down, ["kind": "hold", "ms": 10001], up]]) == "invalid_argument", "a hold is at most 10 s")
  check(code(["id": 1, "type": "input", "mode": "global", "events": [down, ["kind": "hold", "ms": 6000], ["kind": "hold", "ms": 4001], up]]) == "invalid_argument", "a request holds at most 10 s in all")
  check(code(["id": 1, "type": "input", "mode": "global", "events": [["kind": "hold", "ms": 100, "x": 1]]]) == "unknown_field", "a hold has only ms")
  check(code(["id": 1, "type": "cursor"]) == nil && code(["id": 1, "type": "cursor", "x": 1]) == "unknown_field", "cursor takes no fields")
  check(HelperProtocol.codes.contains("secure_input"), "secure_input is a code")
  // CU-101: the blank frame is the asked size and black everywhere.
  if let blank = Frames.blank(width: 4, height: 3), let data = blank.dataProvider?.data, let bytes = CFDataGetBytePtr(data) {
    let length = CFDataGetLength(data)
    check(blank.width == 4 && blank.height == 3, "the blank frame is the asked size")
    check((0..<length).allSatisfy { index in index % 4 == 3 || bytes[index] == 0 }, "the blank frame is black")
  } else {
    check(false, "the blank frame is drawn")
  }
  check(Frames.blank(width: 0, height: 3) == nil, "no blank frame of no size")
  func event(_ value: JSON) -> InputEvent? { try? RequestParser.event(value, index: 0) }
  check(event(["kind": "move", "x": 1, "y": 2, "flags": 0]) == .move(CGPoint(x: 1, y: 2), flags: 0), "a move parses")
  check(event(["kind": "move", "x": 1, "y": 2]) == nil, "every event field is required")
  check(event(["kind": "down", "button": "left", "x": 1, "y": 2, "clickCount": 4, "flags": 0]) == nil, "click counts stop at 3")
  check(event(["kind": "keyDown", "keyCode": 0, "flags": 1]) == nil, "only modifier flags")
  check(event(["kind": "text", "text": .string(String(repeating: "a", count: 33))]) == nil, "text is chunked by the driver")
}

// MARK: - exclusions

func testExclusions() {
  let list = Exclusions()
  for entry in Exclusions.builtIn {
    let probe = entry.hasSuffix(".*") ? String(entry.dropLast(2)) + ".example" : entry
    check(list.isExcluded(probe), "\(entry) is excluded")
  }
  let design = ["com.apple.Terminal", "com.googlecode.iterm2", "dev.warp.Warp-Stable", "com.mitchellh.ghostty", "net.kovidgoyal.kitty", "org.alacritty",
                "co.zeit.hyper", "com.github.wez.wezterm", "com.apple.ScriptEditor2", "com.apple.Automator", "com.apple.shortcuts", "com.reflection.cu-helper",
                "com.openai.chat", "com.openai.codex", "com.1password.1password", "com.agilebits.onepassword7", "com.bitwarden.desktop", "org.keepassxc.keepassxc",
                "com.apple.Passwords", "com.apple.keychainaccess", "com.apple.systempreferences", "com.apple.SecurityAgent", "com.apple.LocalAuthentication.UIAgent",
                "com.apple.loginwindow", "com.apple.UserNotificationCenter"]
  check(design.allSatisfy(list.isExcluded), "every app of the design's table (app-policy.md, D-025) is excluded")
  check(list.isExcluded("com.openai") && !list.isExcluded("com.openaix.chat"), "a prefix entry matches the base and below only")
  check(list.isExcluded("com.apple.Terminal.helper") && list.isExcluded("com.bitwarden.desktop.safari") && !list.isExcluded("com.apple.TerminalX"), "every id also excludes its children (PR #187)")
  let added187 = ["com.anthropic.claudefordesktop", "com.google.Chrome.app.abcdef", "com.microsoft.edgemac.app.xyz", "com.apple.installer", "com.dashlane.dashlanephonefinal",
                  "com.lastpass.LastPass", "com.nordsec.nordpass", "org.p0deje.Maccy", "com.clipy-app.Clipy", "com.tapbots.Pastebot2Mac", "com.tapbots.Pastebot3Mac"]
  check(added187.allSatisfy(list.isExcluded), "agent core's additions of PR #187 are in the floor")
  check(!list.isExcluded("com.google.Chrome") && !list.isExcluded("com.microsoft.edgemac"), "the browsers themselves stay approvable")
  check(list.isExcluded("com.runningwithcrayons.Alfred") && list.isExcluded("com.raycast.macos"), "launchers are excluded (design 0.3.4)")
  // CU-264: whole-Mac tools, ids as read on macOS 27; Time Machine's menu-bar agent through com.apple.TimeMachine's children.
  let wholeMac = ["com.apple.DiskUtility", "com.apple.bootcampassistant", "com.apple.MigrateAssistant", "com.apple.backup.launcher", "com.apple.ActivityMonitor",
                  "com.apple.timemachine.HelperAgent"]
  check(wholeMac.allSatisfy(list.isExcluded), "Disk Utility, Boot Camp, Migration Assistant, Time Machine (launcher and agent) and Activity Monitor are excluded")
  check(!list.isExcluded("com.apple.Console"), "Console stays approvable (read-only, a named limit)")
  // CU-292: launchers, password managers, a clipboard manager and another AI app, with their public ids.
  let gaps292 = ["com.apple.Spotlight", "at.obdev.LaunchBar", "in.sinew.Enpass-Desktop.App", "in.sinew.Enpass-Desktop", "me.proton.pass.electron",
                 "com.keepersecurity.passwordmanager", "com.wiheads.paste", "com.wiheads.paste-direct", "ai.perplexity.macv3"]
  check(gaps292.allSatisfy(list.isExcluded), "Spotlight, LaunchBar, Enpass, Proton Pass, Keeper, Paste and Perplexity are in the floor (CU-292)")
  check(!list.isExcluded("at.obdev.littlesnitch") && !list.isExcluded("me.proton.mail") && !list.isExcluded("com.apple.spotlightd"),
        "their neighbours stay approvable: Little Snitch, Proton Mail, the Spotlight daemon id")
  check(list.isExcluded(" com.apple.Terminal\n"), "ids are trimmed before matching")
  check(list.isExcluded("COM.APPLE.TERMINAL"), "case is ignored")
  check(!list.isExcluded("ai.reflection.cu.fixture") && !list.isExcluded("ai.reflection.cu.ledger") && !list.isExcluded("com.apple.TextEdit"), "the fixture apps and ordinary apps are approvable")
  let added = Exclusions(additions: ["ai.reflection.cu.standin", "org.example.*"])
  check(added.isExcluded("ai.reflection.cu.standin") && added.isExcluded("org.example.app") && added.entries.count == list.entries.count + 2, "additions only add")
}

// MARK: - geometry, guard, events

func testGeometryAndGuard() {
  check(Dispatcher.captureSize(area: CGSize(width: 1920, height: 1080), scale: 1, maxSize: CGSize(width: 1920, height: 1080)) == (1920, 1080), "scale 1 at point size")
  check(Dispatcher.captureSize(area: CGSize(width: 1512, height: 982), scale: 2, maxSize: CGSize(width: 2380, height: 1546)) == (2380, 1546), "maxSize clamps each axis")
  check(Dispatcher.captureSize(area: CGSize(width: 50, height: 40), scale: 2, maxSize: CGSize(width: 1000, height: 1000)) == (100, 80), "never above the display's pixels")
  var guardState = LocalInputGuard(tolerance: 0.01, syntheticResetsIdle: false)
  check(!guardState.detects(hidIdle: 0, now: 100), "an unarmed guard sees nothing")
  guardState.arm(now: 100)
  check(!guardState.detects(hidIdle: 50, now: 101), "input older than the arm does not count")
  check(guardState.detects(hidIdle: 0.5, now: 101), "input after the arm is seen")
  guardState.notePosted(now: 100.9)
  check(guardState.detects(hidIdle: 0.05, now: 101), "with our posts invisible to the counter, input after a post is seen")
  guardState.latch(now: 101)
  check(!guardState.detects(hidIdle: 0.5, now: 101.2) && guardState.detects(hidIdle: 0.05, now: 101.2), "after a report only newer input counts")
  var resetting = LocalInputGuard(tolerance: 0.01, syntheticResetsIdle: true)
  resetting.arm(now: 200)
  resetting.notePosted(now: 201)
  check(!resetting.detects(hidIdle: 0.3, now: 201.3) && resetting.detects(hidIdle: 0.1, now: 201.3), "when our posts reset the counter, the baseline follows them")
  resetting.disarm()
  check(!resetting.armed && !resetting.detects(hidIdle: 0, now: 202), "disarmed")
  // Q-D1 (the Mac mini, 2026-11-05): our events reset the counter, and may reach it a little after the note.
  check(LocalInputGuard().syntheticResetsIdle && Dispatcher.Options().syntheticResetsIdle, "the guard follows our posts by default")
  var live = LocalInputGuard()
  live.arm(now: 300)
  live.notePosted(now: 300.5)
  check(!live.detects(hidIdle: 0, now: 300.53), "our own event, counted 30 ms after the note, is not a person's")
  check(live.detects(hidIdle: 0, now: 300.7), "a person's input 150 ms after our post is")
  check((try? HelperArguments.parse(["--socket", "/tmp/x.sock", "--token-file", "/tmp/t"]))?.idleSyntheticResets == true, "the helper follows our posts unless told otherwise")
  check((try? HelperArguments.parse(["--socket", "/tmp/x.sock", "--token-file", "/tmp/t", "--idle-synthetic-invisible"]))?.idleSyntheticResets == false, "--idle-synthetic-invisible turns it off, for measuring")
  check(!guardState.detects(hidIdle: .nan, now: 300), "a broken reading is ignored")
  check(localInputKind(keyIdle: 1, pointerIdle: 2) == "key" && localInputKind(keyIdle: 3, pointerIdle: 2) == "pointer", "the most recent kind")
}

/// The live reads that need no grant (and raise no prompt): displays, the pointer, the HID idle counter, secure input
/// and running apps, from the same SystemCapabilities a live run uses. Nothing gated is called.
func testLiveReadsWithoutGrant() {
  let live = SystemCapabilities()
  let displays = live.displays()
  check(!displays.isEmpty && displays.allSatisfy { $0.bounds.width > 0 && $0.bounds.height > 0 && $0.scale >= 1 }, "displays: at least one, with points and a scale")
  check(displays.filter(\.main).count == 1, "exactly one main display")
  // The pointer reads as finite global points. Where it lies is the Mac's state, not the helper's: a display unplugged
  // or asleep leaves it parked off every active display (seen 2026-11-07), so this pins the read, not the position.
  let pointer = live.pointerLocation()
  check(pointer.x.isFinite && pointer.y.isFinite && abs(pointer.x) < 100_000 && abs(pointer.y) < 100_000, "the pointer reads as finite global points")
  let idle = live.hidIdle()
  check([idle.any, idle.key, idle.pointer].allSatisfy { $0.isFinite && $0 >= 0 } && idle.any < HIDIdle.never.any, "the HID idle counter reads without a grant")
  _ = live.secureInputEnabled()
  let finder = live.running(["com.apple.finder"])
  check(finder.count >= 1 && finder.allSatisfy { $0.pid > 0 && $0.bundleId == "com.apple.finder" }, "running apps by bundle id, with pids")
  check(live.running(["com.example.not-installed"]).isEmpty, "an app that is not running is not listed")
}

func testMenuBarBlackOut() {
  // A white 200 x 100 px capture of a 100 x 50 pt area at scale 2; the menu bar strip is the top 10 pt.
  guard let space = CGColorSpace(name: CGColorSpace.sRGB),
        let white = CGContext(data: nil, width: 200, height: 100, bitsPerComponent: 8, bytesPerRow: 0, space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
    return check(false, "white canvas")
  }
  white.setFillColor(CGColor(srgbRed: 1, green: 1, blue: 1, alpha: 1))
  white.fill(CGRect(x: 0, y: 0, width: 200, height: 100))
  guard let image = white.makeImage(),
        let masked = Frames.blackOut(image, area: CGRect(x: 0, y: 0, width: 100, height: 50), strip: CGRect(x: 0, y: 0, width: 100, height: 10),
                                     keep: [CGRect(x: 10, y: 0, width: 20, height: 10), CGRect(x: 40, y: 0, width: 10, height: 10)]),
        let data = masked.dataProvider?.data, let bytes = CFDataGetBytePtr(data) else { return check(false, "masked image") }
  func red(_ x: Int, _ y: Int) -> UInt8 { bytes[y * masked.bytesPerRow + x * 4] }
  check(masked.width == 200 && masked.height == 100, "the size is kept")
  check(red(10, 10) == 0 && red(100, 10) == 0 && red(190, 10) == 0, "the strip outside the app's menu titles is black (status items, clock)")
  check(red(30, 10) == 255 && red(90, 10) == 255, "the app's own menu titles stay")
  check(red(10, 30) == 255 && red(150, 90) == 255, "below the strip nothing changes")
}

func testCaptureRefusals() {
  let declined = NSError(domain: SCStreamErrorDomain, code: SCStreamError.Code.userDeclined.rawValue)
  let refusal = SystemCapabilities.captureRefusal(declined, fallback: "x")
  check(refusal.code == "not_granted" && refusal.grant == "screen", "a declined screen-access alert is not_granted naming the screen (a pause, not helper_lost)")
  check(SystemCapabilities.captureRefusal(NSError(domain: SCStreamErrorDomain, code: -3802), fallback: "x").code == "failed", "other capture errors fail")
  check(SystemCapabilities.captureRefusal(nil, fallback: "no image").message == "no image", "no error: the fallback")
}

func testTextChunks() {
  check(Events.textChunks("hi") == ["hi"], "short text is one chunk")
  let long = String(repeating: "abcdefgh", count: 5)
  check(Events.textChunks(long).map(\.utf16.count) == [16, 16, 8], "40 units go as 16, 16, 8")
  let emoji = String(repeating: "😀", count: 9)
  check(Events.textChunks(emoji).allSatisfy { $0.utf16.count <= 16 } && Events.textChunks(emoji).joined() == emoji, "no character is split")
  check(Events.make(.text(long), source: Events.source())?.count == 6, "three chunks make three key pairs")
  let typed = (Events.make(.text(long), source: Events.source()) ?? []).enumerated().filter { $0.offset % 2 == 0 }.map { $0.element }
  let read = typed.map { event -> String in
    var length = 0
    var buffer = [UniChar](repeating: 0, count: 32)
    event.keyboardGetUnicodeString(maxStringLength: 32, actualStringLength: &length, unicodeString: &buffer)
    return String(utf16CodeUnits: buffer, count: length)
  }
  check(read.joined() == long, "the chunks carry the whole text, in order")
}

func testEvents() {
  let source = Events.source()
  check(source?.userData == HelperIdentity.eventTag && HelperIdentity.eventTag == 0x4355_5345, "the private source carries CUSE")
  let steps: [InputEvent] = [
    .move(CGPoint(x: 10, y: 20), flags: 0), .down(.left, CGPoint(x: 10, y: 20), clickCount: 2, flags: 0x10_0000), .up(.left, CGPoint(x: 10, y: 20), clickCount: 2, flags: 0),
    .down(.middle, CGPoint(x: 5, y: 6), clickCount: 1, flags: 0), .drag(.right, CGPoint(x: 11, y: 21), flags: 0), .scroll(CGPoint(x: 30, y: 40), deltaX: 7, deltaY: -120, flags: 0),
    .keyDown(0x24, flags: 0x2_0000), .keyUp(0x24, flags: 0), .text("hé😀"),
  ]
  let built = steps.map { Events.make($0, source: source) ?? [] }
  check(built.prefix(8).allSatisfy { $0.count == 1 } && built[8].count == 2, "one event per step, two for text")
  let read = built.flatMap { $0 }.map(Events.describe)
  check(read.allSatisfy { $0["tag"]?.integer == 0x4355_5345 }, "every synthetic event carries CUSE")
  check(read[0]["type"]?.integer == Int(CGEventType.mouseMoved.rawValue) && read[0]["x"] == 10 && read[0]["y"] == 20, "a move at its point")
  check(read[1]["type"]?.integer == Int(CGEventType.leftMouseDown.rawValue) && read[1]["clickState"] == 2 && read[1]["flags"]?.integer == 0x10_0000, "a down with click state and Command")
  check(read[3]["type"]?.integer == Int(CGEventType.otherMouseDown.rawValue) && read[3]["button"] == 2, "middle is other button 2")
  check(read[4]["type"]?.integer == Int(CGEventType.rightMouseDragged.rawValue), "a right drag")
  check(read[5]["deltaY"] == -120 && read[5]["deltaX"] == 7 && read[5]["x"] == 30, "a scroll keeps deltas and point")
  check(read[6]["keyCode"] == 0x24 && read[6]["flags"]?.integer == 0x2_0000 && read[7]["flags"] == 0, "keys keep code and flags")
  check(read[8]["text"] == "hé😀" && read[9]["text"] == "hé😀", "text rides on a key down and up")
  var held = HeldInput()
  held.note(.keyDown(0x38, flags: 0x2_0000))
  held.note(.down(.left, CGPoint(x: 1, y: 1), clickCount: 1, flags: 0x2_0000))
  held.note(.keyDown(0x00, flags: 0x2_0000))
  held.note(.keyUp(0x00, flags: 0x2_0000))
  held.note(.text("x"))
  check(held.keys == [0x38] && held.buttons == [.left], "held input tracks what is down")
  let release = held.releaseSteps(at: CGPoint(x: 7, y: 8))
  check(release == [.up(.left, CGPoint(x: 7, y: 8), clickCount: 1, flags: 0), .keyUp(0x38, flags: 0)], "release in reverse order of pressing: the button (where the pointer is), then Shift")
  held.clear()
  check(held.isEmpty && held.releaseSteps(at: .zero).isEmpty, "nothing held, nothing to release")
  var dragging = HeldInput()
  dragging.note(.down(.left, CGPoint(x: 1, y: 1), clickCount: 1, flags: 0))
  check(dragging.releaseSteps(at: CGPoint(x: 2, y: 2)) == [.up(.left, CGPoint(x: 2, y: 2), clickCount: 1, flags: 0)], "a press without a held move is released without Escape")
  dragging.note(.drag(.left, CGPoint(x: 5, y: 5), flags: 0))
  check(dragging.releaseSteps(at: CGPoint(x: 2, y: 2)) == [.keyDown(53, flags: 0), .keyUp(53, flags: 0), .up(.left, CGPoint(x: 2, y: 2), clickCount: 1, flags: 0)],
        "an aborted drag sends Escape before the button comes up, so nothing drops (Q-D12)")
  check(dragging.releaseSteps(at: CGPoint(x: 2, y: 2), returnToPress: true) == [.keyDown(53, flags: 0), .keyUp(53, flags: 0), .drag(.left, CGPoint(x: 1, y: 1), flags: 0), .up(.left, CGPoint(x: 1, y: 1), clickCount: 1, flags: 0)],
        "our own abort: Escape first (no destination sees the move back), then one held move to the press point, then the up there (CU-45)")
  dragging.note(.up(.left, CGPoint(x: 5, y: 5), clickCount: 1, flags: 0))
  dragging.note(.down(.left, CGPoint(x: 1, y: 1), clickCount: 1, flags: 0))
  check(dragging.releaseSteps(at: .zero).count == 1, "a finished drag leaves no Escape for the next press")
}

// MARK: - the dispatcher over a dry-run world

final class Recorder {
  private let lock = NSLock()
  private var lines: [JSON] = []
  func send(_ message: JSON) { lock.lock(); lines.append(message); lock.unlock() }
  func take() -> [JSON] { lock.lock(); defer { lines = []; lock.unlock() }; return lines }
}

final class ByeCounter {
  var count = 0
}

final class Harness {
  let dispatcher: Dispatcher
  let recorder = Recorder()
  let byeCounter = ByeCounter()
  var nextId = 1
  var byes: Int { byeCounter.count }

  init(_ world: JSON = .object([:]), ungranted: Bool = false, eventsOut: String? = nil, settleCap: Double = 60) {
    var options = Dispatcher.Options()
    options.simulateUngranted = ungranted
    options.settleCap = settleCap
    options.interEventDelay = 0
    options.pollInterval = 0.02
    let capabilities = try! DryRunCapabilities(world: world, eventsOutPath: eventsOut)
    let counter = byeCounter
    dispatcher = Dispatcher(capabilities: capabilities, options: options, send: recorder.send, onBye: { counter.count += 1 })
  }

  /// Send one request; return its reply (events stay in the recorder).
  func ask(_ type: String, _ fields: [String: JSON] = [:]) -> JSON {
    var object = fields
    let id = nextId
    nextId += 1
    object["id"] = .int(id)
    object["type"] = .string(type)
    dispatcher.handle(line: JSONCoding.line(.object(object)).dropLast())
    let lines = recorder.take()
    for line in lines where line["id"]?.integer != id { recorder.send(line) }
    return lines.last(where: { $0["id"]?.integer == id }) ?? .null
  }
}

let fixtureWorld: JSON = [
  "displays": [["id": 1, "main": true, "originPt": ["x": 0, "y": 0], "sizePt": ["width": 800, "height": 600], "scale": 1]],
  "apps": [
    ["bundleId": "com.example.other", "pid": 600, "rect": ["x": 600, "y": 0, "width": 200, "height": 100], "title": "Secret window"],
    ["bundleId": "ai.reflection.cu.fixture", "pid": 501, "rect": ["x": 0, "y": 0, "width": 800, "height": 600], "title": "CU Fixture"],
  ],
  "frontmost": "ai.reflection.cu.fixture",
  "elements": [
    ["rect": ["x": 10, "y": 10, "width": 100, "height": 20], "element": ["bundleId": "ai.reflection.cu.fixture", "pid": 501, "role": "AXButton", "title": "Save", "frame": ["x": 10, "y": 10, "width": 100, "height": 20]]],
    ["rect": ["x": 10, "y": 40, "width": 100, "height": 20], "element": ["bundleId": "ai.reflection.cu.fixture", "pid": 501, "role": "AXTextField", "subrole": "AXSecureTextField", "title": "Password"]],
    ["rect": ["x": 10, "y": 70, "width": 100, "height": 100], "element": ["bundleId": "ai.reflection.cu.fixture", "pid": 501, "role": "AXGroup"]],
    ["rect": ["x": 600, "y": 0, "width": 200, "height": 100], "element": ["bundleId": "com.example.other", "pid": 600, "role": "AXWindow", "title": "Secret window"]],
  ],
  "focused": ["bundleId": "ai.reflection.cu.fixture", "pid": 501, "role": "AXTextField", "title": "Name"],
  "screenText": "Hello fixture text",
]

let size800: JSON = ["width": 800, "height": 600]
func move(_ x: Int, _ y: Int) -> JSON { ["kind": "move", "x": .int(x), "y": .int(y), "flags": 0] }
func key(_ kind: String, _ code: Int) -> JSON { ["kind": .string(kind), "keyCode": .int(code), "flags": 0] }
func button(_ kind: String, _ x: Int, _ y: Int) -> JSON { ["kind": .string(kind), "button": "left", "x": .int(x), "y": .int(y), "clickCount": 1, "flags": 0] }

func testDispatcherBasics() {
  let h = Harness(fixtureWorld)
  let hello = h.dispatcher.hello(token: "t0k")
  check(hello["type"] == "hello" && hello["token"] == "t0k" && hello["protocol"] == 1 && hello["helperVersion"] == "0.2.65", "the hello opens the run")
  check(hello["mode"] == "dry-run" && hello["grants"] == ["screen": true, "accessibility": true, "postEvents": true, "listenEvents": false], "a dry-run hello says so, with all four grants")
  check(h.ask("capture", ["maxSize": size800])["code"] == "no_scope", "capture needs a scope")
  check(h.ask("input", ["events": [key("keyDown", 1)], "mode": "global"])["code"] == "no_scope", "input needs a scope")
  check(h.ask("watch", ["fps": 1])["code"] == "no_scope", "watch needs a scope")
  check(h.ask("screenText", ["maxChars": 10])["code"] == "no_scope", "screen text needs a scope")
  let excluded = h.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture", "com.apple.Terminal"]])
  check(excluded["code"] == "excluded" && excluded["bundleId"] == "com.apple.Terminal", "an excluded app is refused by bundle id")
  let scoped = h.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  check(scoped["ok"] == true && scoped["bundleIds"] == ["ai.reflection.cu.fixture"] && scoped["display"] == 1 && scoped["running"] == [["bundleId": "ai.reflection.cu.fixture", "pid": 501]], "scope names its apps, their pids and display")
  check(h.ask("input", ["events": [key("keyDown", 1)], "mode": "global"])["code"] == "pause_not_armed", "global input needs the pause")
  check(h.ask("input", ["events": [key("keyDown", 1)], "mode": "pid"])["code"] == "pause_not_armed", "pid input needs the pause too")
  // Q-D3 / design 0.4.5: pid mode is keyboard-only; a pointer event in it is refused before anything is posted.
  let click: JSON = ["kind": "down", "button": "left", "x": 20, "y": 15, "clickCount": 1, "flags": 0]
  let pidClick = h.ask("input", ["events": [key("keyDown", 1), click], "mode": "pid"])
  check(pidClick["code"] == "invalid_argument" && pidClick["field"] == "events" && (pidClick["message"]?.string ?? "").contains("step 1"), "a pointer event in pid mode is refused, naming the step")
  check(h.ask("pauseOnLocalInput", ["on": true])["via"] == ["idleCounter", "eventTap"], "the idle counter arms, and with Accessibility the pass-through tap too (human-control 0.3.2)")
  let other = h.ask("input", ["events": [move(700, 50)], "mode": "global"])
  check(other["code"] == "out_of_scope" && other["bundleId"] == "com.example.other", "a point over an unapproved app is refused before any step, naming it")
  check((other["message"]?.string ?? "").contains("covered by another app's window above an approved app") && !(other["message"]?.string ?? "").contains("com.example.other"),
        "a window over the approved app is said to cover it (Q-D11); the app is named in bundleId only, never in the text (CU-47)")
  check(!(other["message"]?.string ?? "").contains("600"), "no frame of the other app's window in the reply (trajectory privacy)")
  check(other["check"] == "covered", "CU-199: the refusal names its check (covered)")
  let nothing = h.ask("input", ["events": [move(900, 50)], "mode": "global"])
  check(nothing["code"] == "out_of_scope" && nothing["check"] == "window", "a point over nothing is refused (CU-199: check window)")
  let done = h.ask("input", ["events": [move(100, 100), button("down", 100, 100), button("up", 100, 100)], "mode": "global", "bundleId": "ai.reflection.cu.fixture"])
  check(done["done"] == true && done["frontmostBundleId"] == "ai.reflection.cu.fixture", "a click over the approved app is done")
  let gone = Harness(fixtureWorld)
  _ = gone.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  gone.dispatcher.abort()
  check(gone.ask("pauseOnLocalInput", ["on": true]) == .null, "after the driver is gone no queued request runs (B6)")
  check(h.ask("bye")["ok"] == true && h.byes == 1, "bye answers and ends the run")
  check(h.ask("capture", ["maxSize": size800])["code"] == "no_scope", "after bye the scope is gone")
}

func testDispatcherGrants() {
  let h = Harness(fixtureWorld, ungranted: true)
  check(h.dispatcher.hello(token: "x")["grants"] == ["screen": false, "accessibility": false, "postEvents": false, "listenEvents": false], "an ungranted hello says so")
  let gated: [(String, [String: JSON], String)] = [("capture", ["maxSize": size800], "screen"), ("watch", ["fps": 1], "screen"),
    ("input", ["events": [key("keyDown", 1)], "mode": "global"], "accessibility"), ("hitTest", ["xPt": 1, "yPt": 1], "accessibility"),
    ("focused", [:], "accessibility"), ("panelSelection", [:], "accessibility"), ("menuKey", ["keyCode": 2, "flags": 0x120000], "accessibility"), ("selectedItems", [:], "accessibility"),
    ("screenText", ["maxChars": 5], "accessibility")]
  for (type, fields, grant) in gated {
    let reply = h.ask(type, fields)
    check(reply["code"] == "not_granted" && reply["grant"] == .string(grant), "\(type) answers not_granted naming \(grant)")
  }
  check(h.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])["ok"] == true, "scope needs no grant")
  check(h.ask("pauseOnLocalInput", ["on": true])["armed"] == true, "the idle guard needs no grant")
  check(h.ask("simulateLocalInput", ["kind": "key", "via": "untagged"])["code"] == "not_granted", "a real untagged event needs the grant")
  let partial = Harness(["grants": ["screen": true, "accessibility": true, "postEvents": false]])
  check(partial.ask("input", ["events": [key("keyDown", 1)], "mode": "global"])["code"] == "not_granted", "Accessibility without post-event access is not enough for input")
}

func readEvents(_ path: String) -> [JSON] {
  ((try? String(contentsOfFile: path, encoding: .utf8)) ?? "").split(separator: "\n").compactMap { JSONCoding.decode(Data($0.utf8)) }
}

func testDispatcherInput() {
  let path = NSTemporaryDirectory() + "cu-helper-unit-\(getpid())-a.jsonl"
  try? FileManager.default.removeItem(atPath: path)
  var world = fixtureWorld.object!
  world["frontmost"] = "com.example.other"
  world["localInputAfter"] = 3
  let h = Harness(.object(world), eventsOut: path)
  _ = h.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  _ = h.ask("pauseOnLocalInput", ["on": true])
  let away = h.ask("input", ["events": [key("keyDown", 1)], "mode": "global"])
  check(away["code"] == "out_of_scope" && away["bundleId"] == "com.example.other", "an unapproved app in front, no target: refused, named")
  check(away["point"] == nil, "a frontmost refusal carries no point (CU-38: the driver tells the two apart)")
  // Shift down, mouse down, (person acts after the third step), mouse up, Shift up
  let steps: JSON = [key("keyDown", 0x38), button("down", 100, 100), move(120, 100), button("up", 120, 100), key("keyUp", 0x38)]
  let stopped = h.ask("input", ["events": steps, "mode": "global", "bundleId": "ai.reflection.cu.fixture"])
  check(stopped["ok"] == true && stopped["done"] == false && stopped["failedAt"] == 3 && stopped["code"] == "local_input", "a person mid-batch stops it at the next step")
  let events = readEvents(path)
  let types = events.compactMap { $0["event"]?["type"]?.integer }
  // A modifier key's down and up are flagsChanged events on macOS.
  let flags = Int(CGEventType.flagsChanged.rawValue)
  check(types == [flags, Int(CGEventType.leftMouseDown.rawValue), Int(CGEventType.mouseMoved.rawValue), Int(CGEventType.leftMouseUp.rawValue), flags],
        "the stop releases what is held: the button up, then Shift up (R86)")
  check(events.allSatisfy { $0["event"]?["tag"]?.integer == 0x4355_5345 }, "releases are tagged too")
  let buttonUp = events.last(where: { $0["event"]?["type"]?.integer == Int(CGEventType.leftMouseUp.rawValue) })
  check(buttonUp?["event"]?["x"] == 1 && buttonUp?["event"]?["y"] == 1, "the button comes up where the pointer is, not where we left it")
  let held = h.ask("input", ["events": [key("keyDown", 1)], "mode": "global"])
  check(held["done"] == false && held["failedAt"] == 0 && held["code"] == "local_input", "right after a stop, input is still held")
  _ = h.ask("pauseOnLocalInput", ["on": true])
  let resumed = h.ask("input", ["events": [key("keyDown", 1), key("keyUp", 1)], "mode": "pid"])
  check(resumed["done"] == true, "re-arming at a resume lets input run again")
  check(readEvents(path).last?["mode"] == "pid" && readEvents(path).last?["pid"] == 501, "pid mode targets the approved app's pid")
  try? FileManager.default.removeItem(atPath: path)
}

func testSecureInput() {
  let path = NSTemporaryDirectory() + "cu-helper-unit-\(getpid())-b.jsonl"
  try? FileManager.default.removeItem(atPath: path)
  var world = fixtureWorld.object!
  world["secureInputAfter"] = 2
  let h = Harness(.object(world), eventsOut: path)
  _ = h.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  _ = h.ask("pauseOnLocalInput", ["on": true])
  let reply = h.ask("input", ["events": [key("keyDown", 0x38), ["kind": "text", "text": "a"], ["kind": "text", "text": "b"], key("keyUp", 0x38)], "mode": "global"])
  check(reply["done"] == false && reply["failedAt"] == 2 && reply["code"] == "secure_input", "secure event input stops the next key step (R83)")
  let types = readEvents(path).compactMap { $0["event"]?["type"]?.integer }
  let flags = Int(CGEventType.flagsChanged.rawValue)
  check(types == [flags, Int(CGEventType.keyDown.rawValue), Int(CGEventType.keyUp.rawValue), flags], "the text before it went out; then Shift is released")
  try? FileManager.default.removeItem(atPath: path)
}

func testLocalInputEvents() {
  let h = Harness(fixtureWorld)
  check(h.ask("simulateLocalInput", ["kind": "key", "via": "idle"])["code"] == "pause_not_armed", "the seam needs the pause armed")
  _ = h.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  _ = h.ask("pauseOnLocalInput", ["on": true])
  let bare = Harness(["grants": ["accessibility": false, "postEvents": false, "screen": true]])
  _ = bare.ask("scope", ["bundleIds": ["com.example.fixture"]])
  check(bare.ask("pauseOnLocalInput", ["on": true])["via"] == ["idleCounter"], "without Accessibility or Input Monitoring only the idle counter runs")
  let noTap = bare.ask("simulateLocalInput", ["kind": "key", "via": "tap"])
  check(noTap["code"] == "not_granted" && noTap["grant"] == "accessibility", "no tap without its grant, named")
  _ = h.recorder.take()
  // The reply's own lines: the event comes before the reply.
  var object: [String: JSON] = ["id": 99, "type": "simulateLocalInput", "kind": "pointer", "via": "idle"]
  h.dispatcher.handle(line: JSONCoding.line(.object(object)).dropLast())
  let lines = h.recorder.take()
  check(lines.count == 2 && lines[0]["event"] == "localInput" && lines[0]["kind"] == "pointer" && lines[1]["detectedBy"] == "idle", "localInput, then the reply naming the guard")
  check(lines[0].object?.keys.sorted() == ["at", "event", "kind"], "a localInput event carries time and kind, nothing else")
  object["id"] = 100
  h.dispatcher.handle(line: JSONCoding.line(.object(object)).dropLast())
  check(h.recorder.take().first?["event"] == "localInput", "each seam call reports, however soon after the last")
  check(h.ask("input", ["events": [key("keyDown", 1)], "mode": "global"])["code"] == "local_input", "then input is held")
  let tapped = Harness(["grants": ["accessibility": false, "postEvents": false, "listenEvents": true]])
  _ = tapped.ask("scope", ["bundleIds": ["com.example.fixture"]])
  check(tapped.ask("pauseOnLocalInput", ["on": true])["via"] == ["idleCounter", "eventTap"], "with Input Monitoring alone a listen-only tap runs")
  check(tapped.ask("simulateLocalInput", ["kind": "key", "via": "tap"])["detectedBy"] == "tap", "the tap seam names the tap")
  check(tapped.ask("simulateLocalInput", ["kind": "key", "via": "untagged"])["code"] == "not_granted", "an untagged event needs Accessibility to be posted")
  let untagged = Harness(fixtureWorld)
  _ = untagged.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  _ = untagged.ask("pauseOnLocalInput", ["on": true])
  check(untagged.ask("simulateLocalInput", ["kind": "pointer", "via": "untagged"])["detectedBy"] == "tap", "with Accessibility the pass-through tap sees the untagged event")
  check(tapped.ask("pauseOnLocalInput", ["on": false])["armed"] == false, "disarming stops the guard")
}

func pixel(_ data: Data, _ x: Int, _ y: Int) -> (Int, Int, Int)? {
  guard let source = CGImageSourceCreateWithData(data as CFData, nil), let image = CGImageSourceCreateImageAtIndex(source, 0, nil),
        let space = CGColorSpace(name: CGColorSpace.sRGB),
        let context = CGContext(data: nil, width: image.width, height: image.height, bitsPerComponent: 8, bytesPerRow: 0, space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
  context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
  guard let buffer = context.data else { return nil }
  let bytes = buffer.assumingMemoryBound(to: UInt8.self)
  // Row 0 of a bitmap context's memory is the image's top row.
  let offset = y * context.bytesPerRow + x * 4
  return (Int(bytes[offset]), Int(bytes[offset + 1]), Int(bytes[offset + 2]))
}

func testCapture() {
  var world = fixtureWorld.object!
  world["displays"] = [["id": 9, "main": true, "originPt": ["x": 0, "y": 0], "sizePt": ["width": 800, "height": 600], "scale": 2]]
  let h = Harness(.object(world))
  _ = h.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  let shot = h.ask("capture", ["display": 9, "maxSize": ["width": 1200, "height": 900]])
  let png = shot["png"]?.string.flatMap { Data(base64Encoded: $0) }
  check(shot["widthPx"] == 1200 && shot["heightPx"] == 900 && shot["scale"] == 2 && shot["display"] == 9, "size, scale and display reported")
  check(shot["originPt"] == ["x": 0, "y": 0] && shot["sizePt"] == ["width": 800, "height": 600], "the area in points")
  check(shot["windows"]?.array?.count == 1 && !shot.text.contains("Secret window"), "only approved windows; no other title")
  if let png {
    check(pixel(png, 1050, 75).map { $0 == (0, 0, 0) } ?? false, "an unapproved app on top is black")
    check(pixel(png, 300, 600).map { $0.0 > 100 } ?? false, "the approved app is drawn")
  } else { check(false, "the capture has a PNG") }
  let region = h.ask("capture", ["region": ["x": 100, "y": 100, "width": 50, "height": 40], "maxSize": ["width": 1000, "height": 1000]])
  check(region["widthPx"] == 100 && region["heightPx"] == 80 && region["originPt"] == ["x": 100, "y": 100], "a region at the display's scale")
  check(h.ask("capture", ["region": ["x": 790, "y": 0, "width": 50, "height": 40], "maxSize": size800])["code"] == "invalid_argument", "a region off the display is refused")
  check(h.ask("capture", ["display": 77, "maxSize": size800])["code"] == "display_changed", "an unknown display is display_changed")
  let simulated = h.ask("capture", ["maxSize": ["width": 4000, "height": 4000], "simulateScale": 3])
  check(simulated["widthPx"] == 2400 && simulated["heightPx"] == 1800 && simulated["scale"] == 3 && simulated["sizePt"] == ["width": 800, "height": 600], "simulateScale renders at that scale; the points stay the display's")
  check(h.ask("watch", ["fps": 9])["code"] == "invalid_argument", "watch fps stops at 5")
  check(h.ask("watch", ["fps": 5, "maxSize": ["width": 80, "height": 60]])["ok"] == true, "watch starts")
  Thread.sleep(forTimeInterval: 0.5)
  let frames = h.recorder.take().filter { $0["event"] == "frame" }
  check(!frames.isEmpty && frames.allSatisfy { $0["widthPx"] == 80 && $0["heightPx"] == 60 }, "frames at the asked size")
  check(frames.allSatisfy { $0["windows"]?.array?.compactMap { $0["bundleId"]?.string } == ["ai.reflection.cu.fixture"] }, "each frame lists its shown windows by owner, like a capture reply (CU-12)")
  check(h.ask("unwatch")["ok"] == true, "unwatch")
  Thread.sleep(forTimeInterval: 0.3)
  _ = h.recorder.take()
  Thread.sleep(forTimeInterval: 0.3)
  check(h.recorder.take().isEmpty, "no frame after unwatch")
}

/// The dry run's menu bar (cu-verifier's ask): drawn whole, then masked as live - only the approved front app's own
/// item frames show; other apps' items, status items and the rest of the strip are black, and with an unapproved
/// app in front the strip is never drawn.
func testDryRunMenuBar() {
  let world: [String: JSON] = [
    "displays": [["id": 1, "main": true, "originPt": ["x": 0, "y": 0], "sizePt": ["width": 800, "height": 600], "scale": 1]],
    "apps": [["bundleId": "ai.reflection.cu.fixture", "pid": 501, "rect": ["x": 0, "y": 24, "width": 800, "height": 576]],
             ["bundleId": "com.example.notes", "pid": 700, "rect": ["x": 900, "y": 24, "width": 100, "height": 100]]],
    "frontmost": "ai.reflection.cu.fixture",
    "menuBar": [["bundleId": "ai.reflection.cu.fixture", "frame": ["x": 10, "y": 0, "width": 40, "height": 24], "title": "File"],
                ["bundleId": "com.example.notes", "frame": ["x": 60, "y": 0, "width": 40, "height": 24], "title": "Notes"]],
    "statusItems": [["frame": ["x": 700, "y": 0, "width": 30, "height": 24]]],
  ]
  let h = Harness(.object(world))
  _ = h.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  let shot = h.ask("capture", ["maxSize": ["width": 800, "height": 600]])
  guard let png = shot["png"]?.string.flatMap({ Data(base64Encoded: $0) }) else { return check(false, "the capture has a PNG") }
  check(pixel(png, 30, 12).map { $0.0 > 200 && $0.1 > 200 } ?? false, "the approved front app's own menu title shows")
  check(pixel(png, 80, 12).map { $0 == (0, 0, 0) } ?? false, "another app's menu item is black")
  check(pixel(png, 715, 12).map { $0 == (0, 0, 0) } ?? false, "a status item is black")
  check(pixel(png, 400, 12).map { $0 == (0, 0, 0) } ?? false, "the rest of the strip is black")
  check(pixel(png, 400, 300).map { $0.0 > 100 } ?? false, "the approved app below the strip is drawn")
  var unapproved = world
  unapproved["frontmost"] = "com.example.notes"
  let other = Harness(.object(unapproved))
  _ = other.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  let dark = other.ask("capture", ["maxSize": ["width": 800, "height": 600]])
  guard let darkPng = dark["png"]?.string.flatMap({ Data(base64Encoded: $0) }) else { return check(false, "the second capture has a PNG") }
  check([30, 80, 400, 715].allSatisfy { x in pixel(darkPng, x, 12).map { $0 == (0, 0, 0) } ?? false }, "with an unapproved app in front the whole strip is black")
  var broken = world
  broken["menuBar"] = [["frame": ["x": 1, "y": 0, "width": 1, "height": 1]]]
  check((try? DryRunCapabilities(world: .object(broken), eventsOutPath: nil)) == nil, "a menu bar item needs a bundle id")
}

/// The settle (helper-protocol-details.md 0.4.1): honoured only after local input the helper has seen since its last
/// posted step; then hands-off for settleMs before posting; past the cap local_input at failedAt 0.
func testSettle() {
  func settles(_ path: String) -> [JSON] {
    ((try? String(contentsOfFile: path, encoding: .utf8)) ?? "").split(separator: "\n").compactMap { JSONCoding.decode(Data($0.utf8)) }.compactMap { $0["settle"] }
  }
  let typed: JSON = ["events": [key("keyDown", 1), key("keyUp", 1)], "mode": "global"]
  func with(_ settleMs: Int) -> [String: JSON] { var fields = typed.object!; fields["settleMs"] = .int(settleMs); return fields }
  let elapsed = { (start: Double) in ProcessInfo.processInfo.systemUptime - start }
  // Lower time bounds only, each anchored before whatever it bounds, so a loaded machine cannot fail them.
  func sawLocalInput(_ harness: Harness) -> Bool {
    let deadline = ProcessInfo.processInfo.systemUptime + 3
    while ProcessInfo.processInfo.systemUptime < deadline {
      if harness.recorder.take().contains(where: { $0["event"] == "localInput" }) { return true }
      Thread.sleep(forTimeInterval: 0.01)
    }
    return false
  }

  let path = NSTemporaryDirectory() + "settle-\(UUID().uuidString).jsonl"
  let h = Harness(fixtureWorld, eventsOut: path)
  _ = h.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  _ = h.ask("pauseOnLocalInput", ["on": true])
  check(h.ask("input", with(500))["done"] == true, "with no local input seen, input with settleMs posts")
  check(settles(path).last?["outcome"] == "ignored" && settles(path).last?["waitedMs"] == 0, "the settle was ignored: no wait")
  _ = h.ask("simulateLocalInput", ["kind": "pointer", "via": "idle"])
  check(h.ask("input", typed.object!)["code"] == "local_input", "right after the person's input, input without a settle is held")
  var start = ProcessInfo.processInfo.systemUptime
  _ = h.ask("simulateLocalInput", ["kind": "pointer", "via": "idle"])
  let settled = h.ask("input", with(300))
  check(settled["done"] == true && elapsed(start) >= 0.29, "after local input, the settle waits settleMs of hands-off, then posts")
  check(settles(path).last?["outcome"] == "settled", "the dry run records the settle")
  check(h.ask("input", with(300))["done"] == true && settles(path).last?["outcome"] == "ignored",
        "a settle is spent: the next settleMs waits for new local input")
  _ = h.ask("simulateLocalInput", ["kind": "key", "via": "idle"])
  Thread.sleep(forTimeInterval: 1.05)
  check(h.ask("input", typed.object!)["done"] == true, "once the stop is no longer fresh, input posts again")
  check(h.ask("input", with(300))["done"] == true && settles(path).last?["outcome"] == "ignored",
        "local input from before the last posted step does not earn a settle")
  check(h.ask("input", with(0))["code"] == "invalid_argument" && h.ask("input", with(60_001))["code"] == "invalid_argument", "settleMs is 1 to 60000")
  var text = typed.object!
  text["settleMs"] = "soon"
  check(h.ask("input", text)["code"] == "invalid_argument", "settleMs is an integer")

  // The person still at the Mac: the guard keeps seeing them, so the settle ends at its cap.
  let busyPath = NSTemporaryDirectory() + "settle-\(UUID().uuidString).jsonl"
  var busyWorld = fixtureWorld.object!
  busyWorld["handsOnMs"] = 10_000
  let busy = Harness(.object(busyWorld), eventsOut: busyPath, settleCap: 0.3)
  _ = busy.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  _ = busy.ask("pauseOnLocalInput", ["on": true])
  check(sawLocalInput(busy), "the busy world's person is seen")
  start = ProcessInfo.processInfo.systemUptime
  let capped = busy.ask("input", with(200))
  check(capped["done"] == false && capped["failedAt"] == 0 && capped["code"] == "local_input" && elapsed(start) >= 0.28, "past the cap: local_input at failedAt 0, nothing posted")
  check(settles(busyPath).last?["outcome"] == "capped", "the dry run records the capped settle")

  // Hands on, then off: the settle waits for the person to stop, then for settleMs more.
  var briefWorld = fixtureWorld.object!
  briefWorld["handsOnMs"] = 400
  // Taken before the world starts its 400 ms, so setup time only lengthens the measured wait.
  start = ProcessInfo.processInfo.systemUptime
  let brief = Harness(.object(briefWorld), settleCap: 5)
  _ = brief.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  _ = brief.ask("pauseOnLocalInput", ["on": true])
  check(sawLocalInput(brief), "the brief world's person is seen")
  check(brief.ask("input", with(200))["done"] == true && elapsed(start) >= 0.59, "the settle outlasts the person's input by settleMs")
  check((try? HelperArguments.parse(["--socket", "/tmp/x.sock", "--token-file", "/tmp/t", "--settle-cap-ms", "500"])) == nil, "--settle-cap-ms only with --dry-run")
  // --request-grants: its own command, never combined with serving; the only path to a prompting call.
  check((try? HelperArguments.parse(["--request-grants"]))?.command == .requestGrants, "--request-grants is its own command")
  check((try? HelperArguments.parse(["--request-grants", "--out", "/tmp/g.json", "--wait-seconds", "60"]))?.waitSeconds == 60, "it takes --out and --wait-seconds")
  check((try? HelperArguments.parse(["--request-grants", "--socket", "/tmp/x.sock", "--token-file", "/tmp/t"])) == nil, "never while serving")
  check((try? HelperArguments.parse(["--request-grants", "--wait-seconds", "601"])) == nil, "a bounded wait")
  check((try? HelperArguments.parse(["--socket", "/tmp/x.sock", "--token-file", "/tmp/t", "--wait-seconds", "60"])) == nil, "--wait-seconds belongs to --request-grants")
  check((try? HelperArguments.parse(["--selftest"]))?.command == .selftest && (try? HelperArguments.parse(["--socket", "/tmp/x.sock", "--token-file", "/tmp/t"]))?.command == .serve, "the other commands are unchanged")
  check((try? HelperArguments.parse(["--stdio", "--token-file", "/tmp/t", "--dry-run", "--world", "/tmp/w", "--settle-cap-ms", "500"]))?.settleCapMs == 500, "a dry run takes a shorter cap")
  try? FileManager.default.removeItem(atPath: path)
  try? FileManager.default.removeItem(atPath: busyPath)
}

/// Frames are sRGB whatever the display's space (a wide-gamut monitor on the Mac mini, 2026-11-05): an image in
/// Display P3 is colour-matched, so sRGB magenta stays #FF00FF in the PNG instead of the display's own values.
func testFramesAreSRGB() {
  /// The PNG's stored values, as a reader without colour management (the model, a marker matcher) sees them.
  func stored(_ data: Data, _ x: Int, _ y: Int) -> (Int, Int, Int)? {
    guard let source = CGImageSourceCreateWithData(data as CFData, nil), let image = CGImageSourceCreateImageAtIndex(source, 0, nil),
          image.bitsPerPixel == 32, let bytes = image.dataProvider?.data, let base = CFDataGetBytePtr(bytes) else { return nil }
    let offset = y * image.bytesPerRow + x * 4
    return (Int(base[offset]), Int(base[offset + 1]), Int(base[offset + 2]))
  }
  guard let p3 = CGColorSpace(name: CGColorSpace.displayP3), let srgb = CGColorSpace(name: CGColorSpace.sRGB),
        let context = CGContext(data: nil, width: 4, height: 4, bitsPerComponent: 8, bytesPerRow: 0, space: p3, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
    return check(false, "a Display P3 bitmap")
  }
  context.setFillColor(CGColor(colorSpace: srgb, components: [1, 0, 1, 1])!)
  context.fill(CGRect(x: 0, y: 0, width: 4, height: 4))
  guard let image = context.makeImage(), let raw = Frames.png(image), let rawPixel = stored(raw, 1, 1) else { return check(false, "the P3 image") }
  check(!(rawPixel.0 > 250 && rawPixel.1 < 5 && rawPixel.2 > 250), "in P3, sRGB magenta is not stored as 255,0,255 (\(rawPixel))")
  guard let same = Frames.resized(image, width: 4, height: 4), let png = Frames.png(same), let shown = stored(png, 1, 1) else { return check(false, "the redrawn frame") }
  check(same.colorSpace?.name == CGColorSpace.sRGB, "a same-size frame in another space is redrawn in sRGB")
  check(shown.0 > 250 && shown.1 < 5 && shown.2 > 250, "and sRGB magenta reads 255,0,255 (\(shown))")
  guard let scaled = Frames.resized(image, width: 2, height: 2), let scaledPng = Frames.png(scaled), let small = stored(scaledPng, 0, 0) else { return check(false, "the resized frame") }
  check(small.0 > 250 && small.1 < 5 && small.2 > 250, "a resized frame is sRGB too")
}

/// Step 5's leak (2026-11-05): an unapproved app sharing an approved app's executable name. The capture's window rule
/// needs ScreenCaptureKit's and AppKit's bundle ids to agree and be approved (capture-and-scaling.md 0.4.6).
/// Q-D11: nothing approved beneath - the plain refusal, still naming the owner.
func drag(_ x: Int, _ y: Int) -> JSON { ["kind": "drag", "button": "left", "x": .int(x), "y": .int(y), "flags": 0] }

/// Q-D12 (CU-36): a drag's held moves may cross approved windows or bare desktop; never another app's window, a
/// desktop icon or a screen corner; press, release and plain moves keep every check.
func testDragPath() {
  let world: JSON = [
    "displays": [["id": 1, "main": true, "originPt": ["x": 0, "y": 0], "sizePt": ["width": 800, "height": 600], "scale": 1]],
    "apps": [
      ["bundleId": "ai.reflection.cu.fixture", "pid": 501, "rect": ["x": 20, "y": 100, "width": 280, "height": 300], "title": "Warehouse"],
      ["bundleId": "ai.reflection.cu.fixture", "pid": 501, "rect": ["x": 400, "y": 100, "width": 300, "height": 300], "title": "Shipping"],
      ["bundleId": "com.example.other", "pid": 600, "rect": ["x": 320, "y": 420, "width": 60, "height": 60]],
    ],
    "frontmost": "ai.reflection.cu.fixture",
    "desktopIcons": [["x": 330, "y": 300, "width": 40, "height": 40]],
  ]
  let h = Harness(world)
  _ = h.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  _ = h.ask("pauseOnLocalInput", ["on": true])
  let across = h.ask("input", ["events": [move(100, 200), button("down", 100, 200), drag(350, 200), drag(500, 200), button("up", 500, 200)], "mode": "global"])
  check(across["done"] == true, "a drag between two approved windows crosses the bare desktop between them")
  let other = h.ask("input", ["events": [move(100, 200), button("down", 100, 200), drag(350, 450), drag(500, 200), button("up", 500, 200)], "mode": "global"])
  check(other["code"] == "out_of_scope" && other["bundleId"] == "com.example.other", "a path across another app's window is refused before any step, naming it")
  check(other["point"] == ["x": 350, "y": 450], "a point refusal carries its point (CU-38)")
  let icon = h.ask("input", ["events": [move(100, 200), button("down", 100, 200), drag(350, 320), button("up", 500, 200)], "mode": "global"])
  check(icon["code"] == "out_of_scope" && (icon["message"]?.string ?? "").contains("desktop icon"), "a path across a desktop icon is refused and says so")
  let corner = h.ask("input", ["events": [move(100, 200), button("down", 100, 200), drag(3, 597), button("up", 100, 200)], "mode": "global"])
  check(corner["code"] == "out_of_scope" && (corner["message"]?.string ?? "").contains("screen corner"), "a path through a screen corner is refused, whatever owns it")
  let approvedCorner = h.ask("input", ["events": [move(100, 200), button("down", 100, 200), drag(25, 105), button("up", 100, 200)], "mode": "global"])
  check(approvedCorner["done"] == true, "a window's own corner away from the display's corners is fine")
  let press = h.ask("input", ["events": [move(350, 200), button("down", 350, 200), button("up", 350, 200)], "mode": "global"])
  check(press["code"] == "out_of_scope", "a press on bare desktop keeps the owner check")
  check(h.ask("input", ["events": [move(350, 200)], "mode": "global"])["code"] == "out_of_scope", "a plain move over bare desktop keeps the owner check")
  check(DragPath.nearCorner(CGPoint(x: 0, y: 0), displays: [DisplayInfo(id: 1, main: true, bounds: CGRect(x: 0, y: 0, width: 800, height: 600), scale: 1)])
        && !DragPath.nearCorner(CGPoint(x: 9, y: 0), displays: [DisplayInfo(id: 1, main: true, bounds: CGRect(x: 0, y: 0, width: 800, height: 600), scale: 1)]),
        "the corner is 8 pt on both axes")
  check(DragPath.classify(finderRole: "AXScrollArea") == .bare && DragPath.classify(finderRole: "AXImage") == .icon && DragPath.classify(finderRole: nil) == .icon,
        "Finder's desktop itself is bare; its icons, labels or an unknown role are not")
}

/// Q-D12: a drag stopped mid-path (the person acts) cancels with Escape before the button comes up.
func testAbortedDrag() {
  let path = NSTemporaryDirectory() + "cu-helper-unit-\(getpid())-drag.jsonl"
  try? FileManager.default.removeItem(atPath: path)
  var world = fixtureWorld.object!
  world["localInputAfter"] = 3
  let h = Harness(.object(world), eventsOut: path)
  _ = h.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  _ = h.ask("pauseOnLocalInput", ["on": true])
  let stopped = h.ask("input", ["events": [move(100, 100), button("down", 100, 100), drag(150, 120), drag(200, 140), button("up", 200, 140)], "mode": "global"])
  check(stopped["done"] == false && stopped["code"] == "local_input" && stopped["point"] == nil, "a person mid-drag stops it; a guard stop carries no point")
  let types = readEvents(path).compactMap { $0["event"]?["type"]?.integer }
  check(types == [Int(CGEventType.mouseMoved.rawValue), Int(CGEventType.leftMouseDown.rawValue), Int(CGEventType.leftMouseDragged.rawValue),
                  Int(CGEventType.keyDown.rawValue), Int(CGEventType.keyUp.rawValue), Int(CGEventType.leftMouseUp.rawValue)],
        "the aborted drag: Escape down and up, then the button up")
  check(readEvents(path).filter { $0["event"]?["type"]?.integer == Int(CGEventType.keyDown.rawValue) }.first?["event"]?["keyCode"] == 53, "the cancel is Escape")
  check(stopped["cancelledDrag"] == true, "the stop reply records that the drag was cancelled, not dropped")
  check((stopped["message"]?.string ?? "").contains("released at the person's pointer (1, 1)"), "after the person's takeover the reply says the release was at their pointer")
  try? FileManager.default.removeItem(atPath: path)
  // CU-44: a window appears in the path mid-drag; the next held move is refused there and nothing drops.
  let path2 = NSTemporaryDirectory() + "cu-helper-unit-\(getpid())-cover.jsonl"
  try? FileManager.default.removeItem(atPath: path2)
  var covered = fixtureWorld.object!
  covered["coverAfter"] = ["steps": 3, "bundleId": "com.example.cover", "pid": 700, "rect": ["x": 180, "y": 130, "width": 60, "height": 40]]
  let c = Harness(.object(covered), eventsOut: path2)
  _ = c.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  _ = c.ask("pauseOnLocalInput", ["on": true])
  let refused = c.ask("input", ["events": [move(100, 100), button("down", 100, 100), drag(150, 120), drag(200, 140), button("up", 200, 140)], "mode": "global"])
  check(refused["done"] == false && refused["failedAt"] == 3 && refused["code"] == "out_of_scope" && refused["bundleId"] == "com.example.cover"
        && refused["point"] == ["x": 200, "y": 140] && refused["cancelledDrag"] == true && refused["releasedAt"] == ["x": 100, "y": 100],
        "a held move refused mid-path: stopped there, named, with its point, the drag cancelled and released back at the press point")
  let coverEvents = readEvents(path2).compactMap { $0["event"] }
  let coverTypes = coverEvents.compactMap { $0["type"]?.integer }
  check(coverTypes == [Int(CGEventType.mouseMoved.rawValue), Int(CGEventType.leftMouseDown.rawValue), Int(CGEventType.leftMouseDragged.rawValue),
                       Int(CGEventType.keyDown.rawValue), Int(CGEventType.keyUp.rawValue), Int(CGEventType.leftMouseDragged.rawValue), Int(CGEventType.leftMouseUp.rawValue)],
        "no held move over the new window; Escape, back to the press point, then the button up")
  check(coverEvents[5]["x"] == 100 && coverEvents[5]["y"] == 100 && coverEvents[6]["x"] == 100 && coverEvents[6]["y"] == 100, "the return and the up are at the press point")
  try? FileManager.default.removeItem(atPath: path2)
  // CU-45: the release point itself is covered when the up comes - the drop must not complete there.
  let path3 = NSTemporaryDirectory() + "cu-helper-unit-\(getpid())-release.jsonl"
  try? FileManager.default.removeItem(atPath: path3)
  var atRelease = fixtureWorld.object!
  atRelease["coverAfter"] = ["steps": 4, "bundleId": "com.example.cover", "pid": 700, "rect": ["x": 180, "y": 130, "width": 60, "height": 40]]
  let r = Harness(.object(atRelease), eventsOut: path3)
  _ = r.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  _ = r.ask("pauseOnLocalInput", ["on": true])
  let releaseRefused = r.ask("input", ["events": [move(100, 100), button("down", 100, 100), drag(150, 120), drag(170, 125), button("up", 200, 140)], "mode": "global"])
  let releaseEvents = readEvents(path3).compactMap { $0["event"] }
  check(releaseRefused["failedAt"] == 4 && releaseRefused["code"] == "out_of_scope" && releaseRefused["releasedAt"] == ["x": 100, "y": 100]
        && releaseEvents.last?["type"]?.integer == Int(CGEventType.leftMouseUp.rawValue) && releaseEvents.last?["x"] == 100,
        "a refused release point: the button comes up back at the press point, not at the drop")
  check((releaseRefused["message"]?.string ?? "").contains("the drag was cancelled and its button released back where it went down (100, 100)")
        && !(releaseRefused["message"]?.string ?? "").contains("may have acted"),
        "back at the press point the reply says the drag was cancelled there - agent core owns any 'may have happened' (CU-47)")
  try? FileManager.default.removeItem(atPath: path3)
  let plain = Harness(fixtureWorld)
  _ = plain.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  _ = plain.ask("pauseOnLocalInput", ["on": true])
  check(plain.ask("input", ["events": [move(100, 100), button("down", 100, 100), drag(150, 120), button("up", 150, 120)], "mode": "global"])["cancelledDrag"] == nil, "a finished drag reports no cancel")
}

/// CU-39 (D-045): another process's content in an approved window is judged by that process; AppKit panels are marked.
func testForeignContentAndPanels() {
  check(OwnerRule.mismatchOwner(windowApproved: true, elementApproved: false) == .element
        && OwnerRule.mismatchOwner(windowApproved: false, elementApproved: true) == .window
        && OwnerRule.mismatchOwner(windowApproved: false, elementApproved: false) == .window
        && OwnerRule.mismatchOwner(windowApproved: true, elementApproved: true) == .window, "the unapproved one of window and element owns the point; both approved: the window")
  let leaf: (identifier: String?, role: String?) = (nil, "AXButton")
  check(PanelMarker.kind(path: [leaf, ("", "AXGroup"), ("save-panel", "AXSheet"), (nil, "AXWindow")], ending: .top) == "save"
        && PanelMarker.kind(path: [leaf, ("open-panel", "AXWindow")], ending: .top) == "open", "AppKit's panel identifiers mark a panel (sheet or modal window)")
  check(PanelMarker.kind(path: [leaf, ("Save", "AXGroup"), (nil, "AXWindow"), ("save-panel", "AXSheet")], ending: .top) == nil
        && PanelMarker.kind(path: [leaf, (nil, "AXMenu"), (nil, "AXApplication")], ending: .top) == nil, "a window or the app reached first: not a panel; a title never marks one")
  check(PanelMarker.kind(path: [leaf, (nil, "AXGroup")], ending: .error) == "unknown" && PanelMarker.kind(path: Array(repeating: (nil, "AXGroup"), count: 40), ending: .limit) == "unknown",
        "an Accessibility error or the depth limit before a window: unknown, asked each time - never 'not a panel'")
  let display: JSON = [["id": 1, "main": true, "originPt": ["x": 0, "y": 0], "sizePt": ["width": 800, "height": 600], "scale": 1]]
  let service: JSON = ["bundleId": "com.apple.appkit.xpc.openAndSavePanelService", "pid": 900, "rect": ["x": 799, "y": 599, "width": 1, "height": 1]]
  // (a) CU Fixture's window shows another process's content (a remote panel): refused naming that process.
  let foreign = Harness(["displays": display, "frontmost": "ai.reflection.cu.fixture",
                         "apps": [["bundleId": "ai.reflection.cu.fixture", "pid": 501, "rect": ["x": 0, "y": 0, "width": 800, "height": 600], "axOwner": "com.apple.appkit.xpc.openAndSavePanelService"], service]])
  _ = foreign.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  _ = foreign.ask("pauseOnLocalInput", ["on": true])
  let refused = foreign.ask("input", ["events": [move(300, 300), button("down", 300, 300), button("up", 300, 300)], "mode": "global"])
  check(refused["code"] == "out_of_scope" && refused["bundleId"] == "com.apple.appkit.xpc.openAndSavePanelService", "(a) foreign content in an approved window is refused, naming its process (fail closed)")
  let foreignHit = foreign.ask("hitTest", ["xPt": 300, "yPt": 300])["element"]
  check(foreignHit?["bundleId"] == "com.apple.appkit.xpc.openAndSavePanelService" && foreignHit?["role"] == .null
        && foreignHit?["elementOwner"]?["bundleId"] == "com.apple.appkit.xpc.openAndSavePanelService", "its hit test is owner-only and names the element's process")
  // (b) window and element both CU Fixture's (the in-process panel measured live): allowed, described.
  let own = Harness(["displays": display, "frontmost": "ai.reflection.cu.fixture",
                     "apps": [["bundleId": "ai.reflection.cu.fixture", "pid": 501, "rect": ["x": 0, "y": 0, "width": 800, "height": 600]]],
                     "elements": [["rect": ["x": 600, "y": 500, "width": 80, "height": 30],
                                   "element": ["bundleId": "ai.reflection.cu.fixture", "pid": 501, "role": "AXButton", "title": "Save", "panel": "open",
                                               "ancestors": [["role": "AXGroup"], ["role": "AXSheet", "identifier": "save-panel"], ["role": "AXWindow"]]]],
                                  ["rect": ["x": 600, "y": 300, "width": 80, "height": 30],
                                   "element": ["bundleId": "ai.reflection.cu.fixture", "pid": 501, "role": "AXButton", "title": "OK", "ancestors": [["role": "AXGroup"]], "ancestorsEnd": "error"]],
                                  ["rect": ["x": 600, "y": 100, "width": 80, "height": 30],
                                   "element": ["bundleId": "com.apple.appkit.xpc.openAndSavePanelService", "pid": 900, "role": "AXButton", "title": "Open"]]]])
  _ = own.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  _ = own.ask("pauseOnLocalInput", ["on": true])
  check(own.ask("input", ["events": [move(300, 300)], "mode": "global"])["done"] == true, "(b) the app's own content is allowed as before")
  let save = own.ask("hitTest", ["xPt": 640, "yPt": 515])["element"]
  check(save?["role"] == "AXButton" && save?["title"] == "Save" && save?["panel"] == "save" && save?["elementOwner"] == nil,
        "(c) an element whose ancestry reaches AppKit's save-panel is described with panel: save (a declared panel key is ignored)")
  check(own.ask("hitTest", ["xPt": 640, "yPt": 315])["element"]?["panel"] == "unknown", "an ancestry ending in an Accessibility error: panel unknown")
  let foreignButton = own.ask("hitTest", ["xPt": 640, "yPt": 115])["element"]
  check(foreignButton?["bundleId"] == "com.apple.appkit.xpc.openAndSavePanelService" && foreignButton?["role"] == .null && foreignButton?["elementOwner"]?["pid"] == 900,
        "a declared element of another process in CU Fixture's window: owner-only with elementOwner, by the live rule")
  // cu-verifier's R13 keys: apps[].panel and apps[].elementOwner.
  let panelWorld = Harness(["displays": display, "frontmost": "ai.reflection.cu.fixture",
                            "apps": [["bundleId": "ai.reflection.cu.fixture", "pid": 501, "rect": ["x": 0, "y": 0, "width": 800, "height": 600], "panel": "save"]],
                            "focused": ["bundleId": "ai.reflection.cu.fixture", "pid": 501, "role": "AXTextField", "title": "Save As:"]])
  _ = panelWorld.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  check(panelWorld.ask("hitTest", ["xPt": 300, "yPt": 300])["element"]?["panel"] == "save" && panelWorld.ask("focused")["element"]?["panel"] == "save",
        "apps[].panel: hitTest and focused carry the marker (Return in the name field is caught too)")
  check(own.ask("focused")["element"]?["panel"] == nil, "an ordinary window: no panel field")
  let declared = Harness(["displays": display, "frontmost": "ai.reflection.cu.fixture",
                          "apps": [["bundleId": "ai.reflection.cu.fixture", "pid": 501, "rect": ["x": 0, "y": 0, "width": 800, "height": 600], "elementOwner": "com.apple.appkit.xpc.openAndSavePanelService"], service]])
  _ = declared.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  check(declared.ask("hitTest", ["xPt": 300, "yPt": 300])["element"]?["elementOwner"]?["bundleId"] == "com.apple.appkit.xpc.openAndSavePanelService",
        "apps[].elementOwner declares another process's content, as axOwner does")
}

/// file-panels.md (#84): the remote case - the client's own attached sheet showing the panel service's content - and
/// panelSelection's canonical path for the frontmost approved app's panel.
func testFilePanels() {
  let service = PanelAttribution.serviceBundleId
  let sheet = CGRect(x: 100, y: 100, width: 400, height: 300)
  check(PanelAttribution.attributes(windowOwnerIsFrontmostClient: true, clientApproved: true, windowBounds: sheet, sheetFrames: [sheet.offsetBy(dx: 0.5, dy: 0)], aboveClientWindow: true, elementBundleId: service, elementIsSystem: true)
        && !PanelAttribution.attributes(windowOwnerIsFrontmostClient: true, clientApproved: true, windowBounds: sheet, sheetFrames: [sheet.offsetBy(dx: 4, dy: 0)], aboveClientWindow: true, elementBundleId: service, elementIsSystem: true)
        && !PanelAttribution.attributes(windowOwnerIsFrontmostClient: true, clientApproved: true, windowBounds: sheet, sheetFrames: [sheet], aboveClientWindow: false, elementBundleId: service, elementIsSystem: true)
        && !PanelAttribution.attributes(windowOwnerIsFrontmostClient: true, clientApproved: true, windowBounds: sheet, sheetFrames: [sheet], aboveClientWindow: true, elementBundleId: service, elementIsSystem: false)
        && !PanelAttribution.attributes(windowOwnerIsFrontmostClient: false, clientApproved: true, windowBounds: sheet, sheetFrames: [sheet], aboveClientWindow: true, elementBundleId: service, elementIsSystem: true)
        && !PanelAttribution.attributes(windowOwnerIsFrontmostClient: true, clientApproved: true, windowBounds: sheet, sheetFrames: [sheet], aboveClientWindow: true, elementBundleId: "com.example.panel", elementIsSystem: true),
        "attributed only with the sheet frame within a point, directly above a client window, the service on the system volume, the client frontmost")
  let display: JSON = [["id": 1, "main": true, "originPt": ["x": 0, "y": 0], "sizePt": ["width": 800, "height": 600], "scale": 1]]
  let rect: JSON = ["x": 100, "y": 100, "width": 400, "height": 300]
  func world(sheetWindow: [String: JSON], between: JSON? = nil, serviceExecutable: String? = nil, frontmost: String = "ai.reflection.cu.fixture") -> JSON {
    var serviceEntry: [String: JSON] = ["bundleId": .string(service), "pid": 900, "rect": ["x": 799, "y": 599, "width": 1, "height": 1]]
    if let serviceExecutable { serviceEntry["executable"] = .string(serviceExecutable) }
    var apps: [JSON] = [.object(sheetWindow)]
    if let between { apps.append(between) }
    apps += [["bundleId": "ai.reflection.cu.fixture", "pid": 501, "rect": ["x": 0, "y": 0, "width": 800, "height": 600], "title": "Report"], .object(serviceEntry)]
    return ["displays": display, "frontmost": .string(frontmost), "apps": .array(apps)]
  }
  let attachedSheet: [String: JSON] = ["bundleId": "ai.reflection.cu.fixture", "pid": 501, "rect": rect, "attachedSheet": true, "elementOwner": .string(service)]
  func probe(_ w: JSON) -> (click: JSON, hit: JSON?) {
    let h = Harness(w)
    _ = h.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
    _ = h.ask("pauseOnLocalInput", ["on": true])
    return (h.ask("input", ["events": [move(200, 200), button("down", 200, 200), button("up", 200, 200)], "mode": "global"]), h.ask("hitTest", ["xPt": 200, "yPt": 200])["element"])
  }
  let attributed = probe(world(sheetWindow: attachedSheet))
  check(attributed.click["done"] == true && attributed.hit?["bundleId"] == "ai.reflection.cu.fixture" && attributed.hit?["hostedBy"] == .string(service) && attributed.hit?["role"] == "AXSheet",
        "the client's attached sheet showing the service's content: the client's, with hostedBy; a click passes")
  var notSheet = attachedSheet
  notSheet["attachedSheet"] = false
  let foreign = probe(world(sheetWindow: notSheet))
  check(foreign.click["bundleId"] == .string(service) && foreign.hit?["elementOwner"]?["bundleId"] == .string(service) && foreign.hit?["hostedBy"] == nil,
        "the service's content in a window that is not the attached sheet: foreign, refused (D-045)")
  let between = probe(world(sheetWindow: attachedSheet, between: ["bundleId": "com.example.b", "pid": 600, "rect": ["x": 700, "y": 0, "width": 50, "height": 50]]))
  check(between.click["code"] == "out_of_scope", "another app's window between the sheet and the client's window: not attributed")
  let impostor = probe(world(sheetWindow: attachedSheet, serviceExecutable: "/Users/x/openAndSavePanelService"))
  check(impostor.click["bundleId"] == .string(service) && impostor.hit?["hostedBy"] == nil, "an impostor service off the system volume: not attributed")
  let over = probe(["displays": display, "frontmost": "ai.reflection.cu.fixture",
                    "apps": [["bundleId": "com.example.b", "pid": 600, "rect": rect], .object(attachedSheet),
                             ["bundleId": "ai.reflection.cu.fixture", "pid": 501, "rect": ["x": 0, "y": 0, "width": 800, "height": 600]]]])
  check(over.click["bundleId"] == "com.example.b", "another app's window over the sheet is that app's, refused by ownership")
  // panelSelection: the canonical path of what the frontmost approved app's panel would commit.
  let base = NSTemporaryDirectory() + "cu-helper-panel-\(getpid())"
  try? FileManager.default.removeItem(atPath: base)
  try? FileManager.default.createDirectory(atPath: base + "/real", withIntermediateDirectories: true)
  try? FileManager.default.createSymbolicLink(atPath: base + "/link", withDestinationPath: base + "/real")
  let realBase = PanelPath.realPath(base) ?? base
  let selecting = Harness(["displays": display, "frontmost": "ai.reflection.cu.fixture",
                           "apps": [["bundleId": "ai.reflection.cu.fixture", "pid": 501, "rect": rect, "panel": "save"], ["bundleId": "ai.reflection.cu.fixture", "pid": 501, "rect": ["x": 0, "y": 0, "width": 800, "height": 600]]],
                           "panelSelection": ["directory": .string(base + "/link"), "fileName": "report\u{202E}fdp.exe"]])
  check(selecting.ask("panelSelection")["code"] == "no_scope", "panelSelection needs a scope")
  _ = selecting.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  let chosen = selecting.ask("panelSelection")
  check(chosen["name"] == "report\u{202E}fdp.exe", "the raw name field travels beside the canonical path, unresolved")
  check(chosen["directory"] == .string(realBase + "/real") && chosen["path"] == .string(realBase + "/real/report\\u{202E}fdp.exe"),
        "an in-process panel in front: the folder's symlink resolved, the bidi override in the name escaped")
  let noPanel = Harness(["displays": display, "frontmost": "ai.reflection.cu.fixture", "apps": [["bundleId": "ai.reflection.cu.fixture", "pid": 501, "rect": rect]],
                         "panelSelection": ["directory": .string(base + "/real"), "fileName": "x.txt"]])
  _ = noPanel.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  check(noPanel.ask("panelSelection")["path"] == .null && noPanel.ask("panelSelection")["name"] == .null, "no panel in front: no path, no name")
  // CU-48 A: the shown folder's display name and the name field's focus travel as declared; absent, they are null.
  check(chosen["shownFolderName"] == .null && chosen["nameFieldFocused"] == .null, "a panel that declares neither: both null (an older world reads as no check)")
  let showing = Harness(["displays": display, "frontmost": "ai.reflection.cu.fixture",
                         "apps": [["bundleId": "ai.reflection.cu.fixture", "pid": 501, "rect": rect, "panel": "save"], ["bundleId": "ai.reflection.cu.fixture", "pid": 501, "rect": ["x": 0, "y": 0, "width": 800, "height": 600]]],
                         "panelSelection": ["directory": .string(base + "/real"), "fileName": "x.txt", "shownFolderName": "Reports", "nameFieldFocused": false]])
  _ = showing.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  let shown = showing.ask("panelSelection")
  check(shown["shownFolderName"] == "Reports" && shown["nameFieldFocused"] == false, "the pop-up's display name and the name field's focus (false) are reported as read")
  check(noPanel.ask("panelSelection")["shownFolderName"] == .null && noPanel.ask("panelSelection")["nameFieldFocused"] == .null, "no panel in front: neither field")
  check(PanelPath.canonical(directory: "relative/dir", fileName: "a").path == nil && PanelPath.canonical(directory: base + "/real", fileName: nil).path == nil,
        "a relative folder gives nothing; no name gives the folder only")
  check(PanelPath.escaped("a\\b\u{200B}c\nd") == "a\\\\b\\u{200B}c\\u{000A}d", "backslash, zero-width space and line break are escaped")
  // CU-151: the pasteboard change count beside both targets - a number from the world, null when it names none.
  let uncounted = Harness(fixtureWorld)
  _ = uncounted.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  check(uncounted.ask("focused")["changeCount"] == .null && uncounted.ask("hitTest", ["xPt": 20, "yPt": 15])["changeCount"] == .null, "CU-151: no declared change count: null beside both targets")
  var counted = fixtureWorld.object!
  counted["changeCount"] = 41
  let counting = Harness(.object(counted))
  _ = counting.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  check(counting.ask("focused")["changeCount"] == 41 && counting.ask("hitTest", ["xPt": 20, "yPt": 15])["changeCount"] == 41, "CU-151: the change count rides beside the focused and the hit-tested element")
  // CU-199: a click-through overlay's element does not own the point.
  func overlayWorld(_ withOverlay: Bool) -> JSON {
    var apps: [JSON] = [["bundleId": "ai.reflection.cu.fixture", "pid": 501, "rect": ["x": 0, "y": 0, "width": 800, "height": 600], "elementOwner": "com.example.dictation"]]
    if withOverlay { apps.insert(["bundleId": "com.example.dictation", "pid": 777, "rect": ["x": 0, "y": 0, "width": 800, "height": 600], "clickThrough": true, "layer": 4], at: 0) }
    else { apps.append(["bundleId": "com.example.dictation", "pid": 777, "rect": ["x": 900, "y": 0, "width": 10, "height": 10]]) }
    return ["displays": [["id": 1, "main": true, "originPt": ["x": 0, "y": 0], "sizePt": ["width": 1920, "height": 1080], "scale": 1]], "frontmost": "ai.reflection.cu.fixture", "apps": .array(apps)]
  }
  for withOverlay in [true, false] {
    let oh = Harness(overlayWorld(withOverlay))
    _ = oh.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
    _ = oh.ask("pauseOnLocalInput", ["on": true])
    let hit = oh.ask("hitTest", ["xPt": 330, "yPt": 517])["element"]
    if withOverlay {
      check(hit?["bundleId"] == "ai.reflection.cu.fixture" && hit?["elementOwner"] == nil && hit?["overlaySkipped"] == "com.example.dictation", "CU-199: hitTest under the overlay names the window's app, no elementOwner, the overlay in overlaySkipped (the driver's owner check agrees)")
    } else {
      check(hit?["elementOwner"]?["bundleId"] == "com.example.dictation" && hit?["overlaySkipped"] == nil, "CU-199: without an overlay hitTest keeps CU-39's elementOwner")
    }
    let reply = oh.ask("input", ["events": [move(330, 517), button("down", 330, 517), button("up", 330, 517)], "mode": "global", "bundleId": "ai.reflection.cu.fixture"])
    if withOverlay {
      check(reply["done"] == true && reply["overlaySkipped"] == ["com.example.dictation"], "CU-199: a click under a click-through overlay whose element Accessibility names goes to the approved window: done, the overlay named in overlaySkipped")
    } else {
      check(reply["code"] == "out_of_scope" && reply["check"] == "element" && reply["bundleId"] == "com.example.dictation", "CU-199: another process's element in the approved window with no overlay of its own: refused, check element (CU-39 kept)")
    }
  }
  let ovFixture = WindowOwners.Window(number: 10, pid: 100, layer: 0, alpha: 1, bounds: CGRect(x: 100, y: 100, width: 400, height: 600))
  let ovBubble = WindowOwners.Window(number: 20, pid: 200, layer: 4, alpha: 1, bounds: CGRect(x: 300, y: 500, width: 60, height: 40))
  let ovWide = WindowOwners.Window(number: 30, pid: 300, layer: 21, alpha: 1, bounds: CGRect(x: 0, y: 0, width: 1920, height: 1080))
  check(OwnerRule.clickThroughOverlay(elementPid: 200, hitNumber: 10, windows: [ovBubble, ovFixture], point: CGPoint(x: 330, y: 517)) != nil, "CU-199: an overlay above the hit window, containing the point, passed through: not the owner")
  check(OwnerRule.clickThroughOverlay(elementPid: 200, hitNumber: 10, windows: [ovBubble, ovFixture], point: CGPoint(x: 200, y: 200)) == nil, "CU-199: the overlay's window does not contain the point: the mismatch rule stands")
  check(OwnerRule.clickThroughOverlay(elementPid: 400, hitNumber: 10, windows: [ovBubble, ovFixture], point: CGPoint(x: 330, y: 517)) == nil, "CU-199: the element's process has no window above (a remote view, CU-39): the mismatch rule stands")
  check(OwnerRule.clickThroughOverlay(elementPid: 200, hitNumber: 10, windows: [ovFixture, ovBubble], point: CGPoint(x: 330, y: 517)) == nil, "CU-199: the element's window is below the hit window: the mismatch rule stands")
  check(OwnerRule.clickThroughOverlay(elementPid: 300, hitNumber: 10, windows: [ovWide, ovFixture], point: CGPoint(x: 330, y: 517)) != nil, "CU-199: a full-screen pass-through layer above (Notification Center's) is an overlay too")
  check(OwnerRule.clickThroughOverlay(elementPid: 200, hitNumber: 99, windows: [ovBubble, ovFixture], point: CGPoint(x: 330, y: 517)) == nil, "CU-199: a hit window not in the list: no overlay judgement")
  let ovSameLayer = WindowOwners.Window(number: 40, pid: 200, layer: 0, alpha: 1, bounds: CGRect(x: 300, y: 500, width: 60, height: 40))
  check(OwnerRule.clickThroughOverlay(elementPid: 200, hitNumber: 10, windows: [ovSameLayer, ovFixture], point: CGPoint(x: 330, y: 517)) == nil, "CU-199: a skipped window on the hit window's own layer is a contradiction - refused, not trusted (cu-researcher)")
  check(Refusal(code: "out_of_scope", message: "m", check: "gesture").reply(id: 1)["check"] == "gesture", "CU-199: a refusal carries its check")
  // cu-researcher / cu-verifier: under the overlay the DESCRIBED target is the approved app's element, so policy judges
  // 'Delete', not the bubble; and a window of another app that does take clicks still refuses.
  let deleteWorld: JSON = ["displays": [["id": 1, "main": true, "originPt": ["x": 0, "y": 0], "sizePt": ["width": 1920, "height": 1080], "scale": 1]], "frontmost": "ai.reflection.cu.fixture",
                           "apps": [["bundleId": "com.example.dictation", "pid": 777, "rect": ["x": 300, "y": 500, "width": 60, "height": 40], "clickThrough": true, "layer": 4],
                                    ["bundleId": "ai.reflection.cu.fixture", "pid": 501, "rect": ["x": 0, "y": 0, "width": 800, "height": 600]]],
                           "elements": [["rect": ["x": 300, "y": 500, "width": 60, "height": 40], "element": ["pid": 777, "bundleId": "com.example.dictation", "role": "AXGroup"]],
                                        ["rect": ["x": 280, "y": 490, "width": 120, "height": 50], "element": ["pid": 501, "bundleId": "ai.reflection.cu.fixture", "role": "AXButton", "title": "Delete"]]]]
  let dh = Harness(deleteWorld)
  _ = dh.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  let underBubble = dh.ask("hitTest", ["xPt": 330, "yPt": 517])["element"]
  check(underBubble?["role"] == "AXButton" && underBubble?["title"] == "Delete" && underBubble?["bundleId"] == "ai.reflection.cu.fixture" && underBubble?["overlaySkipped"] == "com.example.dictation",
        "CU-199: an unnamed overlay element over an approved 'Delete' button - the described target is AXButton 'Delete' (policy asks delete), the overlay named")
  var clickingWorld = deleteWorld.object!
  clickingWorld["apps"] = [["bundleId": "com.example.dictation", "pid": 777, "rect": ["x": 300, "y": 500, "width": 60, "height": 40], "layer": 4],
                           ["bundleId": "ai.reflection.cu.fixture", "pid": 501, "rect": ["x": 0, "y": 0, "width": 800, "height": 600]]]
  let ch = Harness(.object(clickingWorld))
  _ = ch.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  _ = ch.ask("pauseOnLocalInput", ["on": true])
  let blocked = ch.ask("input", ["events": [move(330, 517), button("down", 330, 517), button("up", 330, 517)], "mode": "global", "bundleId": "ai.reflection.cu.fixture"])
  check(blocked["code"] == "out_of_scope" && blocked["check"] == "covered" && blocked["bundleId"] == "com.example.dictation", "CU-199: a window of another app that takes clicks still refuses (check covered) - only click-through overlays are skipped")
  // CU-203: hardware means untagged, source pid 0 and the HID system's source state - nothing else.
  check(EventSource(tag: 0, pid: 0, state: EventSource.hidSystemState).isHardware, "CU-203: untagged, pid 0, HID state - hardware")
  check(!EventSource(tag: HelperIdentity.eventTag, pid: 0, state: EventSource.hidSystemState).isHardware, "CU-203: a CUSE-tagged event is never hardware")
  check(!EventSource(tag: 0, pid: 4242, state: EventSource.hidSystemState).isHardware, "CU-203: another process's posted event (its pid) is not hardware")
  check(!EventSource(tag: 0, pid: 0, state: -1).isHardware && !EventSource(tag: 0, pid: 0, state: 0).isHardware, "CU-203: a private or combined source state is not hardware")
  check(EventSource(tag: 0, pid: 0, state: 1).json["hardware"] == true && EventSource(tag: 0, pid: 9, state: 1).json["pid"] == 9, "CU-203: the source reads as pid, state, tagged, hardware - no position, no key")
  // cu-verifier's and cu-researcher's condition: no 'forged' seam beside confirmPhysical - a build answering it fails here.
  if case .failure(let refused) = RequestParser.parse(Data(#"{"id":1,"type":"simulateLocalInput","kind":"pointer","via":"forged"}"#.utf8)).result {
    check(refused.code == "invalid_argument", "CU-203: the forged seam is gone - via 'forged' is refused invalid_argument")
  } else { check(false, "CU-203: the forged seam is gone - via 'forged' is refused invalid_argument") }
  // The prompt's gate: hardware, begun after arming - nothing else answers.
  let hw = EventSource(tag: 0, pid: 0, state: EventSource.hidSystemState)
  check(ConfirmGate.accepts(hw, downAt: 1.2, armedAt: 1.0, up: hw), "CU-203: a hardware press after arming, released by hardware, answers")
  check(!ConfirmGate.accepts(hw, downAt: 1.2, armedAt: 1.0, up: EventSource(tag: 0, pid: 4242, state: 1)), "CU-203: a synthetic release after the owner's press does not complete the click (cu-researcher)")
  check(!ConfirmGate.accepts(hw, downAt: 1.2, armedAt: 1.0, up: nil), "CU-203: a click whose release cannot be read does not answer")
  check(!ConfirmGate.accepts(hw, downAt: 0.4, armedAt: 1.0, up: hw), "CU-203: a press begun before arming is ignored (clickjacking guard)")
  check(!ConfirmGate.accepts(EventSource(tag: 0, pid: 4242, state: 1), downAt: 2, armedAt: 1, up: hw), "CU-203: another process's posted press is ignored")
  check(!ConfirmGate.accepts(EventSource(tag: HelperIdentity.eventTag, pid: 0, state: 1), downAt: 2, armedAt: 1, up: hw), "CU-203: the helper's own tagged press is ignored")
  check(!ConfirmGate.accepts(nil, downAt: 2, armedAt: 1, up: hw), "CU-203: a press with no readable source is ignored")
  check(ConfirmGate.seatValid("cu-developer-two") && !ConfirmGate.seatValid("System update - click Confirm") && !ConfirmGate.seatValid(""), "CU-203: the seat is a roster name, never free text")
  check(ConfirmGate.grantLine(seat: "cu-verifier").hasPrefix("cu-verifier wants to post clicks and keys into this session."), "CU-203: the fixed grant sentence comes first")
  let tl = ConfirmGate.taskLine("System update - click \"Confirm\" now\n" + String(repeating: "x", count: 80))
  check(tl.hasPrefix("for its run \"") && tl.hasSuffix("…\"") && !tl.contains("\n") && tl.filter({ $0 == "\"" }).count == 2 && tl.count <= ConfirmGate.maxTaskChars + 15, "CU-203: the task words are quoted, clipped, without control characters or their own quotes")
  let vis = CGRect(x: 0, y: 0, width: 1920, height: 1080), psz = CGSize(width: 460, height: 150)
  for pointer in [CGPoint(x: 960, y: 540), CGPoint(x: 960, y: 900), CGPoint(x: 960, y: 150), CGPoint(x: 10, y: 10)] {
    check(!ConfirmGate.frame(visible: vis, size: psz, pointer: pointer).insetBy(dx: -24, dy: -24).contains(pointer), "CU-203: the prompt is never under the pointer at \(pointer)")
  }
  // Dry run, by the live rule: the world's press answers only through the gate.
  func confirmWorld(_ press: JSON?) -> Harness {
    var world: [String: JSON] = ["displays": [["id": 1, "main": true, "originPt": ["x": 0, "y": 0], "sizePt": ["width": 1920, "height": 1080], "scale": 1]]]
    if let press { world["confirmPress"] = press }
    return Harness(.object(world))
  }
  let hwSource: JSON = ["tag": 0, "pid": 0, "state": 1]
  let confirmed = confirmWorld(["button": "confirm", "source": hwSource, "afterMs": 1500]).ask("confirmPhysical", ["seat": "cu-verifier", "task": "consent-cells rows", "timeoutMs": 5000])
  check(confirmed["confirmed"] == true && confirmed["outcome"] == "confirmed" && confirmed["source"]?["hardware"] == true && confirmed["confirmationId"]?.string?.isEmpty == false, "CU-203: a hardware click after arming confirms, with its source and a confirmationId")
  check(confirmWorld(["button": "confirm", "source": hwSource, "afterMs": 300]).ask("confirmPhysical", ["seat": "cu-verifier", "task": "t"])["outcome"] == "timeout", "CU-203: a click within the arming delay does not confirm")
  check(confirmWorld(["button": "confirm", "source": ["tag": 0, "pid": 4242, "state": 1], "afterMs": 1500]).ask("confirmPhysical", ["seat": "cu-verifier", "task": "t"])["outcome"] == "timeout", "CU-203: a posted click (cliclick, osascript) does not confirm")
  check(confirmWorld(["button": "confirm", "source": hwSource, "upSource": ["tag": 0, "pid": 4242, "state": 1], "afterMs": 1500]).ask("confirmPhysical", ["seat": "cu-verifier", "task": "t"])["outcome"] == "timeout", "CU-203: the owner's press completed by a posted release does not confirm")
  let cancelled = confirmWorld(["button": "cancel", "source": hwSource, "afterMs": 200]).ask("confirmPhysical", ["seat": "cu-verifier", "task": "t"])
  check(cancelled["confirmed"] == false && cancelled["outcome"] == "cancelled", "CU-203: Cancel answers not confirmed, outcome cancelled")
  check(confirmWorld(nil).ask("confirmPhysical", ["seat": "cu-verifier", "task": "t", "timeoutMs": 1000])["outcome"] == "timeout", "CU-203: no press - not confirmed")
  let scopedConfirm = confirmWorld(["button": "confirm", "source": hwSource, "afterMs": 1500])
  _ = scopedConfirm.ask("scope", ["bundleIds": ["com.example.fixture"]])
  check(scopedConfirm.ask("confirmPhysical", ["seat": "cu-verifier", "task": "t"])["code"] == "unsupported", "CU-203: a scoped helper never asks - the lock launches an unscoped one")
  check(confirmWorld(nil).ask("confirmPhysical", ["seat": "Bad Seat!", "task": "t"])["code"] == "invalid_argument", "CU-203: a seat that is not a roster name is refused")
  check(HelperProtocol.codes.isSuperset(of: ["busy", "no_display"]), "CU-203: the lock's refusals busy and no_display are reply codes")
  // CU-209: a read-only text view is captioned like displayed text; an editable entry and a secure field never are.
  check(!Caption.isEntry(role: "AXTextArea", settable: false), "CU-209: a read-only text area is not an entry for the caption rule")
  check(Caption.isEntry(role: "AXTextArea", settable: true) && Caption.isEntry(role: "AXTextField", settable: true), "CU-209: an editable text area or field is an entry - no caption")
  check(Caption.isEntry(role: "AXSecureTextField", settable: false), "CU-209: a secure field is always an entry, settable or not")
  check(!Caption.isEntry(role: "AXStaticText", settable: false) && !Caption.isEntry(role: nil, settable: true), "CU-209: static text, or no role, is not an entry")
  // CU-194: windowOrigin - the window's origin, not the element's frame; null (present) when the window cannot be read.
  let originWorld: JSON = ["displays": [["id": 1, "main": true, "originPt": ["x": 0, "y": 0], "sizePt": ["width": 1920, "height": 1080], "scale": 1]], "frontmost": "ai.reflection.cu.fixture",
                           "apps": [["bundleId": "ai.reflection.cu.fixture", "pid": 501, "rect": ["x": 40, "y": 60, "width": 800, "height": 600]]],
                           "elements": [["rect": ["x": 280, "y": 490, "width": 120, "height": 50], "element": ["pid": 501, "bundleId": "ai.reflection.cu.fixture", "role": "AXTextField", "title": "Account"]],
                                        ["rect": ["x": 500, "y": 100, "width": 100, "height": 30], "element": ["pid": 501, "bundleId": "ai.reflection.cu.fixture", "role": "AXTextField", "title": "Other", "windowOrigin": .null]]]]
  let wo = Harness(originWorld)
  _ = wo.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  let inWindow = wo.ask("hitTest", ["xPt": 300, "yPt": 500])["element"]
  check(inWindow?["windowOrigin"]?["x"] == 40 && inWindow?["windowOrigin"]?["y"] == 60, "CU-194: windowOrigin is the window's top-left (40, 60), not the element's frame (280, 490)")
  let unreadable = wo.ask("hitTest", ["xPt": 520, "yPt": 110])["element"]
  check(unreadable?.object?.keys.contains("windowOrigin") == true && unreadable?["windowOrigin"] == .null, "CU-194: an unreadable window gives windowOrigin null - present, not absent, not (0, 0)")
  let woOther = Harness(originWorld)
  _ = woOther.ask("scope", ["bundleIds": ["com.example.other"]])
  check(woOther.ask("hitTest", ["xPt": 300, "yPt": 500])["element"]?.object?.keys.contains("windowOrigin") == false, "CU-194: another app's owner-only shape carries no windowOrigin (no unapproved window's position)")
  // CU-187: the caption of a non-entry element.
  check(Caption.pick(isEntry: false, titleElement: " IBAN ", columnHeader: "Account", rowFirstCell: "x") == "IBAN", "CU-187: the title element's text comes first")
  check(Caption.pick(isEntry: false, titleElement: nil, columnHeader: "Value", rowHeader: nil, rowFirstCell: "IBAN") == "Value · IBAN", "CU-187 (b): 'Field | Value' over 'IBAN | x' - the column header joined with the row's key")
  check(Caption.pick(isEntry: false, titleElement: nil, columnHeader: "IBAN", rowHeader: nil, rowFirstCell: "Ada") == "IBAN · Ada", "CU-187 (b): a two-column data table 'Name | IBAN' / 'Ada | x' keeps the IBAN class")
  check(Caption.pick(isEntry: false, titleElement: nil, columnHeader: "Balance", rowHeader: nil, rowFirstCell: nil) == "Balance", "CU-187 (b): a wide data table without row headers - the column header alone")
  check(Caption.pick(isEntry: false, titleElement: nil, columnHeader: "IBAN", rowHeader: nil, rowFirstCell: "iban") == "IBAN", "CU-187 (b): a key equal to its column header is said once (deduplicated, as the browser)")
  check(Caption.pick(isEntry: false, titleElement: nil, columnHeader: "Value", rowHeader: "Passport", rowFirstCell: "Ada") == "Value · Passport", "CU-187 (b): a row header is the row's key before a first cell")
  check(Caption.forTarget(own: nil, leaf: "IBAN") == "IBAN" && Caption.forTarget(own: "Card", leaf: "IBAN") == "IBAN" && Caption.forTarget(own: "Card", leaf: nil) == "Card", "CU-195: a lifted target takes the hit leaf's caption first, else its own")
  check(Caption.pick(isEntry: false, titleElement: nil, columnHeader: "Passport number", rowFirstCell: nil) == "Passport number", "CU-187: a data table (three cells: no key) - the column header")
  check(Caption.pick(isEntry: false, titleElement: nil, columnHeader: nil, rowHeader: "Passport", rowFirstCell: nil) == "Passport", "CU-187: else the table's row header")
  check(Caption.pick(isEntry: false, titleElement: "  ", columnHeader: nil, rowFirstCell: "Tax ID") == "Tax ID", "CU-187 (b): a headerless two-cell 'Tax ID | x' - the key alone")
  check(Caption.pick(isEntry: true, titleElement: "Password", columnHeader: nil, rowFirstCell: nil) == nil, "CU-187: a text entry has no caption (its name says)")
  check(Caption.pick(isEntry: false, titleElement: nil, columnHeader: nil, rowFirstCell: nil) == nil, "CU-187: none found: null")
  check(Caption.pick(isEntry: false, titleElement: String(repeating: "a", count: 120), columnHeader: nil, rowFirstCell: nil)?.count == 80, "CU-187: capped at 80 characters")
  var selWorld = fixtureWorld.object!
  selWorld["selection"] = ["role": "AXStaticText", "caption": "IBAN", "bundleId": "ai.reflection.cu.fixture", "pid": 7, "title": "ACCT-REF 7731", "value": "ACCT-REF 7731"]
  let selHarness = Harness(.object(selWorld))
  _ = selHarness.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  let sel = selHarness.ask("selection")["element"]
  check(sel?["role"] == "AXStaticText" && sel?["caption"] == "IBAN" && sel?["title"] == nil && sel?["value"] == nil, "CU-187: selection carries role and caption only - no title, no value")
  let selOther = Harness(.object(selWorld))
  _ = selOther.ask("scope", ["bundleIds": ["com.example.other"]])
  check(selOther.ask("selection")["element"] == .null, "CU-187: an unapproved app's selection is null")
  check(Harness(fixtureWorld).ask("selection")["code"] == "no_scope", "CU-187: selection needs a scope")
  // CU-190: whether the default button was read.
  check(AXRead.outcome(.success) == .value && AXRead.outcome(.noValue) == .none && AXRead.outcome(.attributeUnsupported) == .none, "CU-190: a value, or a positive none")
  check([AXError.cannotComplete, .apiDisabled, .notImplemented, .invalidUIElement, .illegalArgument, .failure].allSatisfy { AXRead.outcome($0) == .failed }, "CU-190: any other code is a failed read")
  var dbWorld = fixtureWorld.object!
  dbWorld["defaultButton"] = ["role": "AXButton", "title": "Send", "bundleId": "ai.reflection.cu.fixture"]
  let dbHarness = Harness(.object(dbWorld))
  _ = dbHarness.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  let dbReply = dbHarness.ask("focused")
  check(dbReply["defaultButtonRead"] == true && dbReply["defaultButton"]?["title"] == "Send", "CU-190: a declared button reads true beside it")
  dbWorld["defaultButtonRead"] = false
  let dbFailed = Harness(.object(dbWorld))
  _ = dbFailed.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  check(dbFailed.ask("focused")["defaultButtonRead"] == false && dbFailed.ask("focused")["defaultButton"] == .null, "CU-190: a failed read is false, with no button")
  let dbNone = Harness(fixtureWorld)
  _ = dbNone.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  check(dbNone.ask("focused")["defaultButtonRead"] == true && dbNone.ask("focused")["defaultButton"] == .null, "CU-190: an approved focus with no button is a positive none: read true")
  check(Harness(fixtureWorld).ask("focused")["defaultButtonRead"] == nil, "CU-190: no scope, no reply fields")
  // CU-180: the control a click activates.
  typealias AN = Actionable.Node
  let n = { (role: String?, actions: [String], titled: Bool) in AN(role: role, actions: actions, titled: titled) }
  check(Actionable.pick([n("AXStaticText", [], false), n("AXButton", ["AXPress"], true), n("AXWebArea", [], false)]) == 1, "CU-180: a label inside a web button -> the button")
  check(Actionable.pick([n("AXImage", [], false), n("AXLink", [], false), n("AXWebArea", [], false)]) == 1, "CU-180: an icon inside a link -> the link")
  check(Actionable.pick([n("AXStaticText", [], false), n("AXGroup", [], false), n("AXGroup", ["AXPress"], false), n("AXWebArea", [], false)]) == 2, "CU-180: text in a clickable group (a div with a handler) -> the pressable group")
  check(Actionable.pick([n("AXButton", ["AXPress"], true), n("AXWindow", [], true)]) == 0, "CU-180: a native button is its own target")
  check(Actionable.pick([n("AXTextField", [], false), n("AXButton", ["AXPress"], true)]) == 0, "CU-180: a text field is not a leaf - never lifted")
  check(Actionable.pick([n("AXStaticText", [], false), n("AXWebArea", [], false), n("AXButton", ["AXPress"], true)]) == 0, "CU-180: the walk stops at the web area")
  check(Actionable.pick([n("AXGroup", [], true), n("AXButton", ["AXPress"], true)]) == 0, "CU-180: a named group stays itself")
  check(TargetName.pick(own: "Save", role: "AXButton", actionable: true, displayText: { "x" }) == "Save", "CU-180: an own title wins")
  check(TargetName.pick(own: nil, role: "AXButton", actionable: true, displayText: { "Delete" }) == "Delete", "CU-180: an unnamed control takes its labels' text")
  check(TargetName.pick(own: nil, role: "AXStaticText", actionable: false, displayText: { "To delete your account, contact support" }) == nil, "CU-180: a bare paragraph stays unnamed - reading text never takes a name (browser parity)")
  check(TargetName.pick(own: nil, role: "AXTextField", actionable: false, displayText: { "secret" }) == nil, "CU-180: a text field is never named by content (D-060)")
  check(TargetName.pick(own: nil, role: "AXGroup", actionable: false, displayText: { "x" }) == nil, "CU-180: an unnamed group stays unnamed")
  check(Actionable.pick([n("AXStaticText", ["AXPress"], false), n("AXGroup", ["AXPress"], false), n("AXWebArea", [], false)]) == 1, "CU-180: pressable text in a pressable group still climbs to the group")
  check(Actionable.pick([n("AXStaticText", ["AXPress"], false), n("AXGroup", [], false), n("AXWebArea", [], false)]) == 0, "CU-180: pressable text with no control above stays itself")
  check(Actionable.pick([n("AXButton", ["AXPress"], true), n("AXGroup", ["AXPress"], false)]) == 0, "CU-180: a pressable button never climbs")
  check(TargetName.pick(own: nil, role: "AXStaticText", actionable: true, displayText: { nil }, staticValue: { " Delete " }) == "Delete", "CU-180: pressable text is named by its own words (delete-div)")
  check(TargetName.pick(own: nil, role: "AXStaticText", actionable: false, displayText: { nil }, staticValue: { "Hello there" }) == nil, "CU-180: plain reading text, no press, stays unnamed")
  // Root delegation (React attaches every listener to the page's top-level container).
  let page = CGRect(x: 0, y: 0, width: 1000, height: 800)
  let webArea = { (children: Int) in AN(role: "AXWebArea", actions: [], titled: false, frame: page, childCount: children) }
  let reactRoot = AN(role: "AXGroup", actions: ["AXPress"], titled: false, frame: CGRect(x: 0, y: 0, width: 1000, height: 640))
  let delegated = Actionable.choose([n("AXStaticText", ["AXPress"], false), n("AXGroup", ["AXPress"], false), reactRoot, webArea(1)])
  check(delegated == Actionable.Pick(index: 0, pressSignal: false), "CU-180: under root delegation a paragraph's press says nothing - no climb, no press (React)")
  check(Actionable.choose([n("AXStaticText", ["AXPress"], false), n("AXButton", ["AXPress"], true), reactRoot, webArea(1)]) == Actionable.Pick(index: 1, pressSignal: false), "CU-180: under root delegation a real button still takes the click")
  check(Actionable.rootDelegated([n("AXStaticText", ["AXPress"], false), reactRoot, webArea(3)]), "CU-180: a container covering the page is the page")
  let smallDiv = AN(role: "AXGroup", actions: ["AXPress"], titled: false, frame: CGRect(x: 20, y: 300, width: 90, height: 32))
  check(Actionable.choose([n("AXStaticText", ["AXPress"], false), smallDiv, webArea(6)]) == Actionable.Pick(index: 1, pressSignal: true), "CU-180: a small clickable div directly below the web area keeps its press (the fixture's delete-div)")
  check(!Actionable.rootDelegated([n("AXStaticText", [], false), AN(role: "AXGroup", actions: [], titled: false, frame: page), webArea(1)]), "CU-180: a page container without a press delegates nothing")
  let nextWrapper = AN(role: "AXGroup", actions: ["AXPress"], titled: false, frame: CGRect(x: 0, y: 0, width: 1000, height: 700))
  check(Actionable.choose([n("AXStaticText", ["AXPress"], false), n("AXGroup", ["AXPress"], false), nextWrapper, AN(role: "AXGroup", actions: ["AXPress"], titled: false, frame: page), webArea(1)]) == Actionable.Pick(index: 0, pressSignal: false), "CU-180: a pressable page-wide container deeper down delegates too (Next.js, Vue)")
  check(!Actionable.rootDelegated([n("AXStaticText", ["AXPress"], false), smallDiv, AN(role: "AXGroup", actions: [], titled: false, frame: page), webArea(1)]), "CU-180: a small pressable div under a page-wide container without a press keeps its press")
  check(!Actionable.rootDelegated([n("AXButton", ["AXPress"], true), n("AXWindow", [], true)]), "CU-180: native content (no web area) is never delegated")
  check(TargetName.pick(own: nil, role: "AXStaticText", actionable: Actionable.isActionable(n("AXStaticText", ["AXPress"], false), press: false), displayText: { nil }, staticValue: { "To delete your account, contact support" }) == nil, "CU-180: delegated pressable text stays unnamed ((b) holds in React content)")
  let deep = [n("AXStaticText", [], false)] + Array(repeating: n("AXGroup", [], false), count: Actionable.maxHops) + [n("AXButton", ["AXPress"], true)]
  check(Actionable.pick(deep) == 0, "CU-180: the walk is bounded")
  // CU-157: text entries judged by character counts alone.
  typealias TN = TextEntries.Node
  let leaf = { (role: String?, subrole: String?, count: Int?) in TN(role: role, subrole: subrole, count: count, children: []) }
  let win = { (kids: [TN]) in TN(role: "AXWindow", subrole: nil, count: nil, children: kids) }
  check(TextEntries.judge(win([leaf("AXTextField", nil, 0), TN(role: "AXSheet", subrole: nil, count: nil, children: [leaf("AXTextArea", nil, 0)])])) == false, "CU-157: every entry read and empty (sheets included): false")
  check(TextEntries.judge(win([leaf("AXTextField", nil, 0), TN(role: "AXGroup", subrole: nil, count: nil, children: [leaf("AXTextArea", nil, 5)])])) == true, "CU-157: a filled entry anywhere in the window: true (the decoy)")
  check(TextEntries.judge(win([leaf("AXTextField", nil, 0), leaf("AXTextField", "AXSecureTextField", nil)])) == nil, "CU-157: a secure field is unread: null")
  check(TextEntries.judge(win([leaf("AXTextField", nil, 0), leaf("AXTextField", "AXSecureTextField", 0)])) == nil, "CU-157: a secure field is unread even when it reports 0 (masked): null")
  let crowd = (0..<(TextEntries.limit + 5)).map { _ in TN(role: "AXGroup", subrole: nil, count: nil, children: []) }
  check(TextEntries.judge(win(crowd + [leaf("AXTextField", nil, 0)])) == nil, "CU-157: a window past the walk's cap is unread: null")
  check(TextEntries.judge(win([leaf("AXTextField", nil, 0)] + crowd + [leaf("AXTextArea", nil, 2)])) == true, "CU-157: text found before the cap still counts: true")
  check(TextEntries.afterCap(false, capped: true) == nil && TextEntries.afterCap(true, capped: true) == true && TextEntries.afterCap(false, capped: false) == false,
        "CU-157: the live scan's own cap - unread unless text was found")
  check(TextEntries.judge(win([leaf("AXTextField", nil, nil)])) == nil, "CU-157: an entry without a count is unread (never 0): null")
  check(TextEntries.judge(win([leaf("AXWebArea", nil, nil), leaf("AXTextField", nil, 0)])) == nil, "CU-157: web content in the window is unread: null")
  check(TextEntries.judge(win([leaf("AXWebArea", nil, nil), leaf("AXTextField", nil, 3)])) == true, "CU-157: text found wins over an unread part: true")
  check(TextEntries.judge(win([leaf("AXButton", nil, nil)])) == nil, "CU-157: no text entry at all (a custom-drawn editor exposes none): null")
  let untexted = Harness(fixtureWorld)
  _ = untexted.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  check(untexted.ask("focused")["textEntered"] == .null, "CU-157: no declared value: null (an older world, unknown asks)")
  var texted = fixtureWorld.object!
  texted["textEntered"] = false
  let textHarness = Harness(.object(texted))
  _ = textHarness.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  check(textHarness.ask("focused")["textEntered"] == false && textHarness.ask("hitTest", ["xPt": 20, "yPt": 15])["textEntered"] == false, "CU-157: textEntered rides beside both targets")
  // CU-154: a menu item's key equivalent, each part validated on its own.
  check(KeyEquivalent.shape(char: "V", modifiers: 0) == .object(["char": "V", "modifiers": 0]), "Command-V: char V, modifiers 0")
  check(KeyEquivalent.shape(char: "", modifiers: 3) == .object(["char": .null, "modifiers": 3]), "an empty char is null, the modifiers stand")
  check(KeyEquivalent.shape(char: "V", modifiers: 99) == .object(["char": "V", "modifiers": .null]), "modifiers outside 0-15 are null, the char stands")
  check(KeyEquivalent.shape(char: "\u{7}", modifiers: nil) == nil && KeyEquivalent.shape(char: nil, modifiers: nil) == nil, "nothing usable: no field")
  check(KeyEquivalent.shape(char: "ABCDE", modifiers: 0) == .object(["char": .null, "modifiers": 0]), "more than 4 characters is no char")

  // Names typed as paths (cu-researcher): '~/...', '/...' and '..' are the path they name, resolved as far as it exists.
  // A fake home under the test's own temporary folder - the owner's home is never touched.
  let fakeHome = base + "/home/user"
  try? FileManager.default.createDirectory(atPath: fakeHome + "/Library", withIntermediateDirectories: true)
  check(PanelPath.canonical(directory: base + "/real", fileName: "~/Library/LaunchAgents/x.plist", home: fakeHome).path == .some(realBase + "/home/user/Library/LaunchAgents/x.plist"),
        "a name starting with ~ is a path under the home, not a file in the folder")
  check(PanelPath.canonical(directory: nil, fileName: base + "/link/y.txt", home: fakeHome).path == .some(realBase + "/real/y.txt"),
        "an absolute name is that path, its symlinked folder resolved, even with no folder read")
  check(PanelPath.canonical(directory: base + "/real", fileName: "../link/z.txt", home: fakeHome).path == .some(realBase + "/real/z.txt"),
        "'..' segments are standardised before resolving")
  try? FileManager.default.removeItem(atPath: base)
}

/// The menu bar's owner is recognised on this Mac: WindowServer's executable path as proc_pidpath reports it (the
/// framework symlink resolved) - 0.2.24 compared with the unresolved path and never matched (cu-researcher, live).
/// CU-207: hermetic - WindowServer is found in the FULL window list by its system-given owner name, so a hidden menu
/// bar (a full-screen app, auto-hide, a Mac in use) cannot fail it; the name is independent of the path check under test.
func testWindowServerRecognised() {
  let list = (CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID) as? [[String: Any]]) ?? []
  func pid(_ window: [String: Any]) -> pid_t? { (window[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value }
  func owner(_ window: [String: Any]) -> String? { window[kCGWindowOwnerName as String] as? String }
  guard let server = list.first(where: { owner($0) == "Window Server" }).flatMap(pid) else {
    check(false, "WindowServer owns no window in the full list - not a screen state, a broken window server")
    return
  }
  check(WindowOwners.isWindowServer(server), "WindowServer (pid \(server), by its owner name in the full list) is recognised by its real executable path")
  check(!WindowOwners.isWindowServer(getpid()), "this process is not WindowServer")
  // Measured: layer 24 also lists MenuBarAgent's windows in the full list - another owner there is not WindowServer.
  if let other = list.first(where: { ($0[kCGWindowLayer as String] as? NSNumber)?.intValue == HitWindow.menuBarLayer && pid($0) != server }).flatMap(pid) {
    check(!WindowOwners.isWindowServer(other), "another layer-24 owner (pid \(other)) is not WindowServer")
  }
}

/// CU-51: a Retina main display at the origin, a scale-1 display to its left (negative x) and one above it (negative y).
/// CU-74: the live capture's ScreenCaptureKit configuration stretches the area to exactly the requested pixels.
func testCaptureConfig() {
  // A simulated scale 2 on this Mac's 1920 x 1080 scale-1 display, clamped to a 2000 px frame.
  let full = CaptureConfig.make(area: CGRect(x: 0, y: 0, width: 1920, height: 1080), displayBounds: CGRect(x: 0, y: 0, width: 1920, height: 1080), widthPx: 2000, heightPx: 1125)
  check(full.scalesToFit, "the capture scales the source to the requested size (CU-74: native pixels in a larger buffer put a window at 120 pt at 120 px of a 2000 px frame)")
  check(!full.preservesAspectRatio, "the capture stretches per axis, never letterboxes")
  check(full.width == 2000 && full.height == 1125, "the capture is exactly the requested pixels")
  check(full.sourceRect == CGRect(x: 0, y: 0, width: 1920, height: 1080), "the whole display's source rect")
  // The simulated 14-inch display: a 1512 x 982 region of the main display at x 2, clamped to 2000 px wide.
  let region = CaptureConfig.make(area: CGRect(x: 0, y: 0, width: 1512, height: 982), displayBounds: CGRect(x: 0, y: 0, width: 1920, height: 1080), widthPx: 2000, heightPx: 1298)
  check(region.scalesToFit && region.width == 2000 && region.height == 1298 && region.sourceRect == CGRect(x: 0, y: 0, width: 1512, height: 982), "a region is stretched to its frame too (factor 1.32)")
  // A display left of the main one: the source rect is display-local.
  let left = CaptureConfig.make(area: CGRect(x: -1920, y: 100, width: 800, height: 600), displayBounds: CGRect(x: -1920, y: 0, width: 1920, height: 1080), widthPx: 800, heightPx: 600)
  check(left.sourceRect == CGRect(x: 0, y: 100, width: 800, height: 600), "the source rect is local to its display")
}

/// CU-76: the structural rule for system prompts.
func testSystemPrompt() {
  check(SystemPrompt.marks(windowOwner: "com.apple.UserNotificationCenter", foreignBundleId: nil, foreignPath: nil, subroles: []), "a window of a system prompt process is a prompt")
  check(SystemPrompt.marks(windowOwner: "ai.reflection.cu.fixture", foreignBundleId: "com.apple.x.viewservice", foreignPath: "/System/Library/PrivateFrameworks/X.framework/XPCServices/V.xpc/Contents/MacOS/V", subroles: []), "a system view service inside an approved window is a prompt")
  check(!SystemPrompt.marks(windowOwner: "ai.reflection.cu.fixture", foreignBundleId: PanelAttribution.serviceBundleId, foreignPath: "/System/Library/Frameworks/AppKit.framework/Versions/C/XPCServices/com.apple.appkit.xpc.openAndSavePanelService.xpc/Contents/MacOS/com.apple.appkit.xpc.openAndSavePanelService", subroles: []), "the open/save panel service is not a prompt (CU-39 attributes it)")
  check(!SystemPrompt.marks(windowOwner: "ai.reflection.cu.fixture", foreignBundleId: "com.example.helper", foreignPath: "/Applications/Example.app/Contents/MacOS/Helper", subroles: []), "another app's content outside the system is not a prompt (the owner rule refuses it)")
  check(SystemPrompt.marks(windowOwner: "ai.reflection.cu.fixture", foreignBundleId: nil, foreignPath: nil, subroles: [nil, "AXSystemDialog", nil]), "an AXSystemDialog ancestor marks a prompt in the app's own process")
  check(!SystemPrompt.marks(windowOwner: "ai.reflection.cu.fixture", foreignBundleId: nil, foreignPath: nil, subroles: [nil, "AXDialog", "AXStandardWindow"]), "an ordinary dialog is not a prompt")
  check(SystemPrompt.isSystemPath("/usr/libexec/x") && !SystemPrompt.isSystemPath("/Applications/X.app/Contents/MacOS/X") && !SystemPrompt.isSystemPath(nil), "system paths")
  check(SystemPrompt.withMark(.object(["role": .string("AXButton")]), true).object?["systemPrompt"]?.bool == true && SystemPrompt.withMark(.object([:]), false).object?["systemPrompt"] == nil, "withMark adds the mark only when marked")
}

func testMultiDisplay() {
  let main = DisplayInfo(id: 1, main: true, bounds: CGRect(x: 0, y: 0, width: 1440, height: 900), scale: 2)
  let left = DisplayInfo(id: 2, main: false, bounds: CGRect(x: -1920, y: 0, width: 1920, height: 1080), scale: 1)
  let above = DisplayInfo(id: 3, main: false, bounds: CGRect(x: 0, y: -1440, width: 2560, height: 1440), scale: 2)
  let strip = CGRect(x: 0, y: 0, width: 1440, height: 24)
  check(MenuBarPlan.include(strip: strip, display: main.bounds), "the display holding the menu bar strip includes it")
  check(!MenuBarPlan.include(strip: strip, display: left.bounds) && !MenuBarPlan.include(strip: strip, display: above.bounds),
        "a display that does not hold the strip leaves its menu bar out (its status items would be unmasked)")
  check(MenuBarPlan.include(strip: CGRect(x: -1920, y: 0, width: 1920, height: 24), display: left.bounds), "a strip on the left display belongs to it")
  check(!MenuBarPlan.include(strip: .zero, display: main.bounds) && !MenuBarPlan.include(strip: .null, display: main.bounds), "no strip, no menu bar")
  // Q-D15's AppKit flip uses the primary display's height for points on any display.
  check(HitWindow.appKitPoint(CGPoint(x: -1500, y: 400), primaryHeight: 900) == CGPoint(x: -1500, y: 500), "left display: x kept, y flipped against the primary")
  check(HitWindow.appKitPoint(CGPoint(x: 100, y: -300), primaryHeight: 900) == CGPoint(x: 100, y: 1200), "a display above the primary maps above it in AppKit")
  check(HitWindow.appKitPoint(CGPoint(x: 100, y: 1000), primaryHeight: 900) == CGPoint(x: 100, y: -100), "a point below the primary maps below AppKit's origin")
  check(Dispatcher.captureSize(area: left.bounds.size, scale: left.scale, maxSize: CGSize(width: 1280, height: 720)) == (1280, 720), "the left display at scale 1 clamps to maxSize")
  check(Dispatcher.captureSize(area: main.bounds.size, scale: main.scale, maxSize: CGSize(width: 4000, height: 4000)) == (2880, 1800), "the Retina display at scale 2 is twice its points")
  check(Dispatcher.captureSize(area: CGSize(width: 300, height: 200), scale: above.scale, maxSize: CGSize(width: 4000, height: 4000)) == (600, 400), "a region on a scale-2 display is twice its points")
  let all = [main, left, above]
  check(DragPath.nearCorner(CGPoint(x: -1920, y: 0), displays: all) && DragPath.nearCorner(CGPoint(x: -1, y: 1079), displays: all), "the left display's own corners count")
  check(DragPath.nearCorner(CGPoint(x: 2559, y: -1440), displays: all), "the upper display's corner counts")
  check(!DragPath.nearCorner(CGPoint(x: -960, y: 540), displays: all) && !DragPath.nearCorner(CGPoint(x: 1000, y: 1000), displays: all),
        "the left display's middle and a point on no display are no corner")
  check(left.json.object?["originPt"] == .point(CGPoint(x: -1920, y: 0)) && left.json.object?["scale"] == .double(1) && main.json.object?["scale"] == .double(2),
        "a display reports its global origin and its scale")
}

func testNotTouchableMessages() {
  let world: JSON = [
    "displays": [["id": 1, "main": true, "originPt": ["x": 0, "y": 0], "sizePt": ["width": 800, "height": 600], "scale": 1]],
    "apps": [
      ["bundleId": "com.example.other", "pid": 600, "rect": ["x": 400, "y": 0, "width": 400, "height": 600]],
      ["bundleId": "ai.reflection.cu.fixture", "pid": 501, "rect": ["x": 0, "y": 0, "width": 400, "height": 600]],
    ],
    "frontmost": "ai.reflection.cu.fixture",
  ]
  let h = Harness(world)
  _ = h.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  _ = h.ask("pauseOnLocalInput", ["on": true])
  let beside = h.ask("input", ["events": [move(600, 100)], "mode": "global"])
  check(beside["code"] == "out_of_scope" && beside["bundleId"] == "com.example.other" && beside["message"] == "the point (600, 100) is not over an approved app",
        "a point beside the approved app: not over an approved app, owner named in bundleId")
  check(h.ask("input", ["events": [move(100, 100)], "mode": "global"])["done"] == true, "the approved app itself is still touchable")
}

/// Q-D15 (hit-window.md 0.4.18): WindowServer's mouse hit test names the window, HitWindow classifies it, and the
/// dry run models the hit test (click-through windows skipped, AppKit's drag image click-through) through the same code.
func testHitWindow() {
  // The coordinate flip near both edges of a 1080-point primary display.
  check(HitWindow.appKitPoint(CGPoint(x: 10, y: 2), primaryHeight: 1080) == CGPoint(x: 10, y: 1078)
        && HitWindow.appKitPoint(CGPoint(x: 10, y: 1078), primaryHeight: 1080) == CGPoint(x: 10, y: 2), "y is flipped against the primary display's height, at the top and the bottom")
  let menuBar = WindowOwners.Window(number: 1, pid: 46417, layer: 24, alpha: 1, bounds: CGRect(x: 0, y: 0, width: 1920, height: 30))
  let ledger = WindowOwners.Window(number: 2, pid: 600, layer: 3, alpha: 1, bounds: CGRect(x: 600, y: 90, width: 140, height: 362))
  let finderWindow = WindowOwners.Window(number: 3, pid: 300, layer: 0, alpha: 1, bounds: CGRect(x: 0, y: 0, width: 500, height: 500))
  let desktop = WindowOwners.Window(number: 4, pid: 300, layer: -2147483603, alpha: 1, bounds: CGRect(x: 0, y: 0, width: 1920, height: 1080))
  let helper = WindowOwners.Window(number: 5, pid: getpid(), layer: 3, alpha: 1, bounds: CGRect(x: 0, y: 0, width: 50, height: 50))
  let list = [menuBar, ledger, finderWindow, desktop, helper]
  let classify = { (number: Int) in HitWindow.classify(number: number, in: list, helperPid: getpid(), isWindowServer: { $0 == 46417 }, finderPid: 300) }
  check(classify(0) == .failClosed && classify(77) == .failClosed && classify(5) == .failClosed, "0, a number missing from the list and the helper's own window fail closed")
  check(classify(1) == .menuBar, "WindowServer's layer-24 window is the menu bar: the Accessibility rule decides there")
  check(HitWindow.classify(number: 1, in: list, helperPid: getpid(), isWindowServer: { _ in false }, finderPid: 300) == .window(menuBar),
        "another app's window at layer 24 is judged as a window, never by position")
  check(classify(4) == .desktop(pid: 300) && classify(3) == .window(finderWindow), "Finder's desktop window (below layer 0) is the desktop; a Finder window is a window")
  check(classify(2) == .window(ledger), "any other window: its owner decides")
  // The dry run's hit test, through the same classify.
  let display: JSON = [["id": 1, "main": true, "originPt": ["x": 0, "y": 0], "sizePt": ["width": 800, "height": 600], "scale": 1]]
  let fixture: JSON = ["bundleId": "ai.reflection.cu.fixture", "pid": 501, "rect": ["x": 0, "y": 0, "width": 800, "height": 600]]
  func overlay(clickThrough: Bool, layer: Int = 3) -> JSON {
    ["bundleId": "com.example.overlay", "pid": 700, "rect": ["x": 0, "y": 0, "width": 300, "height": 300], "layer": .int(layer), "clickThrough": .bool(clickThrough)]
  }
  func click(_ world: JSON, _ x: Int, _ y: Int) -> JSON {
    let h = Harness(world)
    _ = h.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
    _ = h.ask("pauseOnLocalInput", ["on": true])
    return h.ask("input", ["events": [move(x, y), button("down", x, y), button("up", x, y)], "mode": "global"])
  }
  check(click(["displays": display, "apps": [overlay(clickThrough: true), fixture], "frontmost": "ai.reflection.cu.fixture"], 100, 100)["done"] == true,
        "a click-through overlay (Typeless) no longer blocks: the click reaches the approved window beneath")
  check(click(["displays": display, "apps": [overlay(clickThrough: false), fixture], "frontmost": "ai.reflection.cu.fixture"], 100, 100)["bundleId"] == "com.example.overlay",
        "a clickable overlay at any alpha would receive the click: refused, named")
  check(click(["displays": display, "apps": [overlay(clickThrough: false, layer: DryRunCapabilities.draggingLayer), fixture], "frontmost": "ai.reflection.cu.fixture"], 100, 100)["bundleId"] == "com.example.overlay",
        "another app's clickable window at the dragging level is refused")
  // CU-46: AppKit's drag image is click-through, so a window that appears mid-drag is named.
  let w1 = Harness(["displays": display, "apps": [fixture], "frontmost": "ai.reflection.cu.fixture", "dragImage": true,
                    "coverAfter": ["steps": 3, "bundleId": "ai.reflection.cu.ledger", "pid": 600, "rect": ["x": 500, "y": 0, "width": 150, "height": 600]]])
  _ = w1.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  _ = w1.ask("pauseOnLocalInput", ["on": true])
  let r1 = w1.ask("input", ["events": [move(100, 300), button("down", 100, 300), drag(300, 300), drag(550, 300), button("up", 550, 300)], "mode": "global"])
  check(r1["code"] == "out_of_scope" && r1["bundleId"] == "ai.reflection.cu.ledger" && r1["failedAt"] == 3,
        "under the drag image, the window that appeared mid-drag is the hit window - the held move is refused")
  let w3 = Harness(["displays": display, "apps": [overlay(clickThrough: false, layer: DryRunCapabilities.draggingLayer), fixture], "frontmost": "ai.reflection.cu.fixture", "dragImage": true])
  _ = w3.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  _ = w3.ask("pauseOnLocalInput", ["on": true])
  let r3 = w3.ask("input", ["events": [move(500, 400), button("down", 500, 400), drag(400, 300), drag(100, 100), button("up", 100, 100)], "mode": "global"])
  check(r3["code"] == "out_of_scope" && r3["bundleId"] == "com.example.overlay", "another app's clickable window is refused during our drag too")
}

func testCaptureScope() {
  // The owner rule itself is the hit window now (testHitWindow); the system-volume test stays for open/save panels.
  check(WindowOwners.isSystemProcess(1) && !WindowOwners.isSystemProcess(getpid()), "launchd runs from the system volume; the unit tests do not")
  check(WindowOwners.isSystemPath("/System/Library/CoreServices/Dock.app/Contents/MacOS/Dock") && WindowOwners.isSystemPath("/System/Library/PrivateFrameworks/SkyLight.framework/Versions/A/Resources/WindowServer")
        && WindowOwners.isSystemPath("/usr/libexec/x") && WindowOwners.isSystemPath("/sbin/launchd"), "the SIP-protected volume")
  check(!WindowOwners.isSystemPath("/usr/local/bin/x") && !WindowOwners.isSystemPath("/opt/homebrew/bin/x") && !WindowOwners.isSystemPath("/Applications/X.app/Contents/MacOS/X")
        && !WindowOwners.isSystemPath("/Users/someone/System/x"), "not /usr/local, Homebrew, /Applications or a home folder")
  check(OwnerRule.overrides(axPid: 5628, topPid: 5636) && OwnerRule.overrides(axPid: 5628, topPid: 88), "WindowServer's owner wins whenever it is another process")
  check(!OwnerRule.overrides(axPid: 5628, topPid: 5628) && !OwnerRule.overrides(axPid: 5628, topPid: nil), "not when they agree, or with no window at the point")
  // The dry run declares both failures; the same rules keep CU Ledger black and refuse a click on it.
  let sameName: JSON = [
    "displays": [["id": 1, "main": true, "originPt": ["x": 0, "y": 0], "sizePt": ["width": 800, "height": 600], "scale": 1]],
    "apps": [
      ["bundleId": "ai.reflection.cu.ledger", "pid": 5636, "executable": "cu-fixture", "sckBundleId": "ai.reflection.cu.fixture", "axOwner": "ai.reflection.cu.fixture", "rect": ["x": 400, "y": 0, "width": 400, "height": 300]],
      ["bundleId": "ai.reflection.cu.fixture", "pid": 5628, "executable": "cu-fixture", "rect": ["x": 0, "y": 0, "width": 800, "height": 600]],
    ],
    "frontmost": "ai.reflection.cu.fixture",
  ]
  let h = Harness(sameName)
  _ = h.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  _ = h.ask("pauseOnLocalInput", ["on": true])
  let shot = h.ask("capture", ["maxSize": ["width": 800, "height": 600]])
  let png = shot["path"]?.string.flatMap { FileManager.default.contents(atPath: $0) } ?? shot["png"]?.string.flatMap { Data(base64Encoded: $0) }
  check(shot["windows"]?.array?.count == 1 && shot["windows"]?.array?.first?["bundleId"] == "ai.reflection.cu.fixture", "only CU Fixture's window is reported")
  if let png, let ledger = pixel(png, 600, 100), let fixture = pixel(png, 100, 100) {
    check(ledger == (0, 0, 0) && fixture != (0, 0, 0), "CU Ledger stays black although ScreenCaptureKit files it under CU Fixture (\(ledger), \(fixture))")
  } else { check(false, "the dry-run capture decodes") }
  let click = h.ask("input", ["events": [move(600, 100)], "mode": "global"])
  check(click["code"] == "out_of_scope" && click["bundleId"] == "ai.reflection.cu.ledger", "a click on CU Ledger is refused, naming it, although Accessibility names CU Fixture")
  let scope = ["ai.reflection.cu.fixture"]
  check(CaptureScope.approves(sckBundleId: "ai.reflection.cu.fixture", appKitBundleId: "ai.reflection.cu.fixture", scope: scope), "an approved app's window is shown")
  check(!CaptureScope.approves(sckBundleId: "ai.reflection.cu.fixture", appKitBundleId: "ai.reflection.cu.ledger", scope: scope), "a window ScreenCaptureKit files under the approved app but whose pid is another app's stays black")
  check(!CaptureScope.approves(sckBundleId: "ai.reflection.cu.ledger", appKitBundleId: "ai.reflection.cu.ledger", scope: scope), "an unapproved app's window stays black")
  check(!CaptureScope.approves(sckBundleId: "ai.reflection.cu.fixture", appKitBundleId: nil, scope: scope) && !CaptureScope.approves(sckBundleId: nil, appKitBundleId: "ai.reflection.cu.fixture", scope: scope), "an owner without a bundle id on either side stays black")
}

func testAccessibilityShapes() {
  let h = Harness(fixtureWorld)
  _ = h.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  let save = h.ask("hitTest", ["xPt": 20, "yPt": 15])["element"]
  check(save?["role"] == "AXButton" && save?["title"] == "Save" && save?["secure"] == false && save?["opaque"] == false, "an approved, named element")
  check(h.ask("hitTest", ["xPt": 20, "yPt": 45])["element"]?["secure"] == true, "a secure field is secure")
  check(h.ask("hitTest", ["xPt": 20, "yPt": 100])["element"]?["opaque"] == true, "an unnamed group is opaque (R92)")
  let other = h.ask("hitTest", ["xPt": 700, "yPt": 50])["element"]
  check(other?["bundleId"] == "com.example.other" && other?["title"] == .null && other?["role"] == .null && other?["frame"] == .null, "an unapproved element: bundle id only")
  check(h.ask("hitTest", ["xPt": 2000, "yPt": 2000])["element"] == .null, "outside every window: null")
  let blank = h.ask("hitTest", ["xPt": 400, "yPt": 400])["element"]
  check(blank?["bundleId"] == "ai.reflection.cu.fixture" && blank?["role"] == "AXWindow" && blank?["opaque"] == true, "empty space in a window is its owner, opaque (P13)")
  check(h.ask("focused")["element"]?["title"] == "Name", "the focused element")
  check(h.ask("focused")["defaultButton"] == .null, "CU-142: no declared default button - null (today's verdict)")
  var withDefault = fixtureWorld.object!
  withDefault["defaultButton"] = ["bundleId": "ai.reflection.cu.fixture", "role": "AXButton", "title": "Send"]
  let sending = Harness(.object(withDefault))
  _ = sending.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  let pressed = sending.ask("focused")["defaultButton"]
  check(pressed?["role"] == "AXButton" && pressed?["title"] == "Send", "CU-142: the button Return presses, described like any element")
  check(h.ask("focused")["sheet"] == false, "CU-148: no sheet or alert in front: sheet false")
  var withSheet = fixtureWorld.object!
  withSheet["sheet"] = true
  let sheeted = Harness(.object(withSheet))
  _ = sheeted.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  check(sheeted.ask("focused")["sheet"] == true, "CU-148: a sheet in front where the focus is: sheet true")
  var away148 = fixtureWorld.object!
  away148["sheet"] = true
  let noScope = Harness(.object(away148))
  _ = noScope.ask("scope", ["bundleIds": ["com.example.other"]])
  check(noScope.ask("focused")["sheet"] == .null, "CU-148: focus outside the approved apps: sheet null")
  var unfocused = fixtureWorld.object!
  unfocused["focused"] = .null
  unfocused["sheet"] = true
  let blind = Harness(.object(unfocused))
  _ = blind.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  let blindReply = blind.ask("focused")
  check(blindReply["element"] == .null && blindReply["sheet"] == true, "CU-148: no focused element (keyboard navigation off) - the frontmost approved app's sheet still reports true")
  var unfocusedDefault = fixtureWorld.object!
  unfocusedDefault["focused"] = .null
  unfocusedDefault["defaultButton"] = ["bundleId": "ai.reflection.cu.fixture", "role": "AXButton", "title": "Delete"]
  let noFocusDefault = Harness(.object(unfocusedDefault))
  _ = noFocusDefault.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  check(noFocusDefault.ask("focused")["defaultButton"]?["title"] == "Delete", "CU-142: with nothing focused, Return still presses the front window's default button - it is reported")
  check(blindReply["app"]?["bundleId"] == "ai.reflection.cu.fixture" && (blindReply["app"]?["pid"]?.integer ?? 0) > 0,
        "CU-148: with no focused element the reply names the app whose window was read (the driver's placeholder origin)")
  var foreignFront = fixtureWorld.object!
  foreignFront["focused"] = .null
  foreignFront["frontmost"] = "com.example.other"
  let foreign = Harness(.object(foreignFront))
  _ = foreign.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  let foreignReply = foreign.ask("focused")
  check(foreignReply["sheet"] == .null && foreignReply["app"] == .null, "CU-148: no focus and an unapproved app in front - nothing read: sheet and app null")
  let text = h.ask("screenText", ["maxChars": 5])
  check(text["text"] == "Hello" && text["truncated"] == true && text["bundleId"] == "ai.reflection.cu.fixture", "screen text cut at maxChars")
  var world = fixtureWorld.object!
  world["frontmost"] = "com.example.other"
  let away = Harness(.object(world))
  _ = away.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  check(away.ask("screenText", ["maxChars": 100])["code"] == "out_of_scope", "no text while an unapproved app is in front")
}

// MARK: - arguments and the peer check

func testArguments() {
  let live = try? HelperArguments.parse(["--socket", "/tmp/x.sock", "--token-file", "/tmp/t"])
  check(live?.mayHoldGrants == true, "a socket run may use grants")
  let granted = Grants(screen: true, accessibility: false, postEvents: false, listenEvents: false)
  check(live?.boundaryApplies(grantsAtStart: granted) == true && live?.boundaryApplies(grantsAtStart: .none) == false, "the boundary applies once a grant is held")
  check((try? HelperArguments.parse(["--socket", "/tmp/x.sock", "--token-file", "/tmp/t", "--enforce-boundary"]))?.boundaryApplies(grantsAtStart: .none) == true, "--enforce-boundary applies it without a grant")
  check((try? HelperArguments.parse(["--stdio", "--token-file", "/tmp/t"])) == nil, "stdio only without grants")
  check((try? HelperArguments.parse(["--stdio", "--token-file", "/tmp/t", "--dry-run", "--world", "/tmp/w"]))?.boundaryApplies(grantsAtStart: granted) == false, "a dry run holds no grant")
  check((try? HelperArguments.parse(["--stdio", "--token-file", "/tmp/t", "--simulate-ungranted"]))?.boundaryApplies(grantsAtStart: granted) == false, "ungranted holds no grant")
  check((try? HelperArguments.parse(["--socket", "relative", "--token-file", "/tmp/t"])) == nil, "paths are absolute")
  check((try? HelperArguments.parse(["--socket", "/tmp/s", "--token-file", "/tmp/t", "--world", "/tmp/w"])) == nil, "a world needs --dry-run")
  check((try? HelperArguments.parse(["--socket", "/tmp/s", "--token-file", "/tmp/t", "--grant-everything"])) == nil, "unknown arguments are refused")
  check((try? HelperArguments.parse(["--selftest", "-psn_0_42"]))?.command == .selftest, "LaunchServices' -psn is ignored")
  check((try? HelperArguments.parse(["--selftest", "--socket", "/tmp/s"])) == nil, "selftest serves nothing")
  check((try? HelperArguments.parse(["--socket", "/tmp/s", "--token-file", "/tmp/t", "--lock-path", "/tmp/l"])) == nil, "a private lock only with --enforce-boundary")
  check((try? HelperArguments.parse(["--socket", "/tmp/s", "--token-file", "/tmp/t", "--enforce-boundary", "--lock-path", "/tmp/l"]))?.lockPath == "/tmp/l", "--lock-path with --enforce-boundary")
}

func testPeerCheck() {
  let home = "/Users/someone"
  let cli = "\(home)/computer-use-wt/session-1/_tools_/agent-core/cli.mjs"
  let good = PeerCheck.Peer(pid: 42, uid: 501, executable: "/opt/node/bin/node", arguments: ["node", cli, "run"], environment: ["PATH=/usr/bin"], cwd: "/", nodeSigned: true)
  let resolve: (String) -> String? = { ($0 as NSString).standardizingPath }
  // CU-299: only configured checkouts are served - here a main checkout and a worktrees folder, as this Mac names them.
  let standard = [PeerCheck.Admitted(realBase: "\(home)/computer-use", parent: false), PeerCheck.Admitted(realBase: "\(home)/computer-use-wt", parent: true)]
  /// The pins default to what the peer runs, as the driver passes them; a test overrides one to see it refused.
  func refusal(_ peer: PeerCheck.Peer, node: String?? = .none, entry: String?? = .none, admitted: [PeerCheck.Admitted]? = nil) -> String? {
    let defaultEntry = peer.arguments.count > 1 ? (peer.arguments[1].hasPrefix("/") ? peer.arguments[1] : peer.cwd.map { ($0 as NSString).appendingPathComponent(peer.arguments[1]) }) : nil
    return PeerCheck.refusal(peer, ownUid: 501, home: home, expectedNode: node ?? peer.executable, expectedEntry: entry ?? defaultEntry, admitted: admitted ?? standard, resolve: resolve)
  }
  check(refusal(good) == nil, "genuine node on agent core's CLI in a configured worktree is accepted")
  check(refusal(good, admitted: []) != nil, "with no configured checkout every peer is refused (CU-299, fail closed)")
  for old in ["\(home)/computer-use--cu-developer-two/_tools_/agent-core/cli.mjs", "\(home)/computer-use--cu-verifier/_evaluators_/desktop-suite/run.mjs",
              "\(home)/computer-use--cu-verifier/_verifiers_/desktop-helper-boundary/stand-in-driver.mjs"] {
    var seat = good
    seat.arguments = ["node", old]
    check(refusal(seat) != nil, "an old seat path is refused unless configured (CU-299): \(old.dropFirst(home.count))")
  }
  // CU-295: further checkouts from the local config - an exact checkout and a parent of worktrees; nothing else widens.
  let configured = PeerCheck.checkouts(fromConfig: ["helperCheckouts": ["~/work/computer-use", "~/work/computer-use-wt/*", "/abs/path", "~/../escape", "~/a/*/b", "~/ok dir", 7]])
  check(configured == [PeerCheck.Checkout(path: "work/computer-use", parent: false), PeerCheck.Checkout(path: "work/computer-use-wt", parent: true)],
        "helperCheckouts keeps home-relative exact checkouts and worktree parents; absolute, '..', inner wildcards, spaces and non-strings are dropped")
  check(PeerCheck.checkouts(fromConfig: nil).isEmpty && PeerCheck.checkouts(fromConfig: ["other": 1]).isEmpty, "no config or no key: no further checkouts")
  // CU-295 acceptance (hd-coordinator, cu-researcher): each configured checkout resolves once - inside the home, not
  // world-writable (it or its parent) - and a script is admitted by its real path only, segment by segment.
  let links: [String: String] = ["\(home)/work/link": "/tmp/evil", "\(home)/work/to-home": home, "\(home)/work/computer-use-wt/escape": "/tmp/evil2"]
  let linkResolve: (String) -> String? = { path in
    let normal = (path as NSString).standardizingPath
    for (from, to) in links where normal == from || normal.hasPrefix(from + "/") { return to + normal.dropFirst(from.count) }
    return normal
  }
  let open777: Set<String> = ["\(home)/open", "\(home)/shared"]
  let admit = PeerCheck.admit(
    [PeerCheck.Checkout(path: "work/computer-use", parent: false), PeerCheck.Checkout(path: "work/computer-use-wt", parent: true),
     PeerCheck.Checkout(path: "work/link", parent: false), PeerCheck.Checkout(path: "work/to-home", parent: true),
     PeerCheck.Checkout(path: "open", parent: false), PeerCheck.Checkout(path: "shared/repo", parent: false)],
    home: home, resolve: linkResolve, worldWritable: { open777.contains($0) })
  check(admit.admitted == [PeerCheck.Admitted(realBase: "\(home)/work/computer-use", parent: false), PeerCheck.Admitted(realBase: "\(home)/work/computer-use-wt", parent: true)],
        "admitted: the two checkouts inside the home; refused: a symlink out of the home, one onto the home itself, a world-writable root and one under a world-writable parent")
  check(admit.refused.count == 4 && admit.refused[0].contains("outside the home") && admit.refused[1].contains("outside the home") && admit.refused[2].contains("world-writable") && admit.refused[3].contains("world-writable"),
        "each refusal says why (logged at start)")
  func configuredRefusal(_ script: String) -> String? {
    let peer = PeerCheck.Peer(pid: 42, uid: 501, executable: "/opt/node/bin/node", arguments: ["node", script], environment: [], cwd: "/", nodeSigned: true)
    return PeerCheck.refusal(peer, ownUid: 501, home: home, expectedNode: peer.executable, expectedEntry: script, admitted: admit.admitted, resolve: linkResolve)
  }
  check(configuredRefusal("\(home)/work/computer-use/_tools_/agent-core/cli.mjs") == nil, "the CLI in an admitted checkout is accepted")
  check(configuredRefusal("\(home)/work/computer-use-wt/session-1a2b/_tools_/agent-core/cli.mjs") == nil, "the CLI in a worktree under an admitted parent is accepted")
  check(configuredRefusal("\(home)/work/computer-use-wt/_tools_/agent-core/cli.mjs") != nil, "the parent itself is no checkout")
  check(configuredRefusal("\(home)/work/computer-use-wt/a/b/_tools_/agent-core/cli.mjs") != nil, "a worktree is one level under its parent, not two")
  check(configuredRefusal("\(home)/work/computer-use-wt-evil/x/_tools_/agent-core/cli.mjs") != nil, "a string prefix of the parent ('computer-use-wt-evil') is no match")
  check(configuredRefusal("\(home)/work/computer-use-wt/escape/_tools_/agent-core/cli.mjs") != nil, "a worktree name that is a symlink out of the home is refused (real path compared)")
  check(configuredRefusal("\(home)/work/link/_tools_/agent-core/cli.mjs") != nil, "a configured checkout that is a symlink out of the home serves nothing")
  check(configuredRefusal("\(home)/work/computer-use/_tools_/agent-core/other.mjs") != nil, "an admitted checkout still serves only the compiled entry points")
  check(configuredRefusal("\(home)/work/elsewhere/_tools_/agent-core/cli.mjs") != nil, "an unconfigured directory is refused")
  check(refusal(PeerCheck.Peer(pid: 42, uid: 501, executable: "/opt/node/bin/node", arguments: ["node", "\(home)/work/computer-use/_tools_/agent-core/cli.mjs"], environment: [], cwd: "/", nodeSigned: true)) != nil,
        "without the config entry the same path is refused")
  // (c): a malformed or unreadable config admits none - since CU-299 no checkout at all - and says so.
  let fakeHome = NSTemporaryDirectory() + "cu-home-\(getpid())"
  try? FileManager.default.createDirectory(atPath: fakeHome + "/.config/computer-use", withIntermediateDirectories: true)
  check(PeerCheck.configuredCheckouts(home: fakeHome).checkouts.isEmpty && PeerCheck.configuredCheckouts(home: fakeHome).note == nil, "no config file: no further checkouts, nothing to report")
  FileManager.default.createFile(atPath: fakeHome + "/.config/computer-use/config.json", contents: Data("{ not json".utf8))
  let malformed = PeerCheck.configuredCheckouts(home: fakeHome)
  check(malformed.checkouts.isEmpty && malformed.note?.contains("malformed") == true, "a malformed config: no checkout admitted, logged")
  FileManager.default.createFile(atPath: fakeHome + "/.config/computer-use/config.json", contents: Data(#"{"helperCheckouts": ["~/a/computer-use", "~/b/*"]}"#.utf8))
  check(PeerCheck.configuredCheckouts(home: fakeHome).checkouts == [PeerCheck.Checkout(path: "a/computer-use", parent: false), PeerCheck.Checkout(path: "b", parent: true)], "a well-formed config is read")
  // CU-299 (cu-researcher's check 1): the config file and its folder must be this user's alone, or nothing is admitted.
  let configFile = fakeHome + "/.config/computer-use/config.json"
  let configDir = fakeHome + "/.config/computer-use"
  chmod(configFile, 0o600); chmod(configDir, 0o700)
  check(PeerCheck.configuredCheckouts(home: fakeHome).checkouts.count == 2, "a 0600 config in a 0700 folder is read")
  check(PeerCheck.configuredCheckouts(home: fakeHome, ownUid: getuid() + 1).checkouts.isEmpty, "a config owned by another uid admits nothing")
  for (file, dir, why) in [(0o620, 0o700, "group-writable file"), (0o602, 0o700, "world-writable file"), (0o600, 0o770, "group-writable folder"), (0o600, 0o777, "world-writable folder")] {
    chmod(configFile, mode_t(file)); chmod(configDir, mode_t(dir))
    let read = PeerCheck.configuredCheckouts(home: fakeHome)
    check(read.checkouts.isEmpty && read.note?.contains("not this user's alone") == true, "a \(why) admits nothing, logged")
  }
  chmod(configFile, 0o600); chmod(configDir, 0o700)
  try? FileManager.default.removeItem(atPath: fakeHome)
  check(PeerCheck.isWorldWritable("/tmp") && !PeerCheck.isWorldWritable(NSHomeDirectory()), "the world-writable test: /tmp (1777) is, the home is not")
  var mcp = good
  mcp.arguments = ["node", "\(home)/computer-use/_tools_/computer-use-mcp/server.mjs"]
  check(refusal(mcp) == nil, "the MCP server in the shared checkout is accepted")
  var other = good
  other.uid = 502
  check(refusal(other) != nil, "another user is refused")
  var unsigned = good
  unsigned.nodeSigned = false
  check(refusal(unsigned) != nil, "a node that is not Node.js Foundation's is refused")
  var script = good
  script.arguments = ["node", "/tmp/evil.mjs", cli]
  check(refusal(script) != nil, "our entry point as a later argument does not count")
  var eval = good
  eval.arguments = ["node", "-e", "1", cli]
  check(refusal(eval) != nil, "-e is refused")
  var preload = good
  preload.arguments = ["node", cli, "--require=/tmp/x.js"]
  check(refusal(preload) != nil, "a --require anywhere is refused")
  for variable in ["NODE_OPTIONS=--import /tmp/x.mjs", "NODE_OPTIONS=", "DYLD_INSERT_LIBRARIES=/tmp/evil.dylib", "DYLD_LIBRARY_PATH=/tmp", "NODE_PATH=/tmp/mods", "LD_PRELOAD=/tmp/x.so"] {
    var loaded = good
    loaded.environment = ["PATH=/usr/bin", variable]
    check(refusal(loaded) != nil, "an environment with \(variable.prefix { $0 != "=" }) is refused (red team B1 a)")
  }
  var fake = good
  fake.arguments = ["node", "/tmp/x/computer-use/_tools_/agent-core/cli.mjs"]
  check(refusal(fake) != nil, "the entry point outside the owner's checkouts is refused")
  var dotted = good
  dotted.arguments = ["node", "\(home)/computer-use/../evil/_tools_/agent-core/cli.mjs"]
  check(refusal(dotted) != nil, "a path that climbs out of the checkout is refused")
  var relative = good
  relative.arguments = ["node", "_tools_/agent-core/cli.mjs"]
  relative.cwd = "\(home)/computer-use"
  check(refusal(relative) == nil, "a relative script resolves against the peer's working directory")
  check(refusal(good, node: "/usr/local/bin/node") != nil && refusal(good, node: "/opt/node/bin/node") == nil, "--driver-node pins the binary")
  check(refusal(good, entry: "\(home)/computer-use/x.mjs") != nil && refusal(good, entry: cli) == nil, "--driver-entry pins the script")
  check(refusal(good, node: .some(nil)) != nil && refusal(good, entry: .some(nil)) != nil, "both pins are required (design 0.3.3)")
  var runner = good
  runner.arguments = ["node", "\(home)/computer-use-wt/session-2/_verifiers_/desktop-boundary/check.mjs"]
  check(refusal(runner) != nil, "another .mjs of the project does not drive a granted helper (design 0.3.3)")
  var suite = good
  suite.arguments = ["node", "\(home)/computer-use-wt/session-2/_evaluators_/desktop-suite/run.mjs", "--model", "x"]
  check(refusal(suite) == nil, "the desktop evaluation suite's entry point does")
  var standIn = good
  standIn.arguments = ["node", "\(home)/computer-use-wt/session-2/_verifiers_/desktop-helper-boundary/stand-in-driver.mjs"]
  check(refusal(standIn) == nil, "cu-verifier's boundary stand-in does (design 0.3.5)")
  var otherVerifier = good
  otherVerifier.arguments = ["node", "\(home)/computer-use-wt/session-2/_verifiers_/desktop-helper-protocol/check.mjs"]
  check(refusal(otherVerifier) != nil, "no other verifier script does")
  var elsewhere = good
  elsewhere.arguments = ["node", "\(home)/computer-use-other/_tools_/agent-core/cli.mjs"]
  check(refusal(elsewhere) != nil, "a script of another project is refused")
  var notModule = good
  notModule.arguments = ["node", "\(home)/computer-use/_tools_/agent-core/cli.js"]
  check(refusal(notModule) != nil, "only .mjs scripts")
  for path in ["\(home)/computer-use/_tools_/agent-core/cli.mjs", "\(home)/computer-use-wt/session-1/_tools_/computer-use-mcp/server.mjs",
               "\(home)/computer-use-wt/session-2/_evaluators_/desktop-suite/run.mjs", "\(home)/computer-use-wt/session-2/_verifiers_/desktop-helper-boundary/stand-in-driver.mjs"] {
    var moved = good
    moved.arguments = ["node", path]
    check(refusal(moved) == nil, "an entry point in a configured checkout is accepted: \(path.dropFirst(home.count))")
  }
  // A shared checkout that is a symlink (~/computer-use -> ~/dtadpole/computer-use): both namings of its entry points.
  let linked: (String) -> String? = { path in
    let standard = (path as NSString).standardizingPath
    if standard == "\(home)/computer-use/_tools_/agent-core/cli.mjs" { return "/tmp/evil.mjs" }
    return standard.hasPrefix("\(home)/computer-use/") || standard == "\(home)/computer-use" ? "\(home)/dtadpole/computer-use" + standard.dropFirst("\(home)/computer-use".count) : standard
  }
  // CU-299: the configured main checkout is named by its real path; ~/computer-use is only a symlink into it.
  let linkedAdmitted = PeerCheck.admit([PeerCheck.Checkout(path: "dtadpole/computer-use", parent: false)], home: home, resolve: linked, worldWritable: { _ in false }).admitted
  check(linkedAdmitted == [PeerCheck.Admitted(realBase: "\(home)/dtadpole/computer-use", parent: false)], "the configured main checkout resolves to its real directory")
  func linkedRefusal(_ script: String) -> String? {
    var peer = good
    peer.arguments = ["node", script]
    return PeerCheck.refusal(peer, ownUid: 501, home: home, expectedNode: peer.executable, expectedEntry: script, admitted: linkedAdmitted, resolve: linked)
  }
  check(linkedRefusal("\(home)/computer-use/_tools_/computer-use-mcp/server.mjs") == nil, "an entry point reached through a symlinked ~/computer-use is accepted")
  check(linkedRefusal("\(home)/computer-use/_tools_/agent-core/cli.mjs") != nil, "an entry point that is itself a symlink leading out of the checkout is refused")
  check(linkedRefusal("\(home)/dtadpole/computer-use/_tools_/computer-use-mcp/server.mjs") == nil, "the shared checkout named by its real path is accepted too (realpath to realpath)")
  check(linkedRefusal("\(home)/dtadpole/computer-use/_verifiers_/desktop-helper-protocol/check.mjs") != nil && linkedRefusal("\(home)/dtadpole/other/_tools_/agent-core/cli.mjs") != nil,
        "but only its entry points, and nothing else beside it")
  // A symlinked home (pw_dir -> /System/Volumes/Data/Users/someone): both namings of a seat checkout's entry point.
  let movedHome: (String) -> String? = { path in
    let standard = (path as NSString).standardizingPath
    return standard.hasPrefix(home + "/") || standard == home ? "/System/Volumes/Data" + standard : standard
  }
  let movedAdmitted = PeerCheck.admit([PeerCheck.Checkout(path: "computer-use-wt", parent: true)], home: home, resolve: movedHome, worldWritable: { _ in false }).admitted
  for script in ["\(home)/computer-use-wt/session-2/_evaluators_/desktop-suite/run.mjs", "/System/Volumes/Data\(home)/computer-use-wt/session-2/_evaluators_/desktop-suite/run.mjs"] {
    var peer = good
    peer.arguments = ["node", script]
    check(PeerCheck.refusal(peer, ownUid: 501, home: home, expectedNode: peer.executable, expectedEntry: script, admitted: movedAdmitted, resolve: movedHome) == nil, "with a symlinked home: \(script.prefix(24))... is accepted")
  }
  check(linkedRefusal("\(home)/computer-use/_verifiers_/desktop-helper-protocol/check.mjs") != nil, "through the symlink, still only the entry points")
  for path in ["\(home)/computer-use/_projects_/heddle/_projects_/computer-use/_tools_/agent-core/cli.mjs", "\(home)/computer-use/_verifiers_/desktop-helper-protocol/check.mjs",
               "/tmp/computer-use/_tools_/agent-core/cli.mjs", "\(home)/computer-use/../evil/_tools_/agent-core/cli.mjs", "\(home)/reflection/_tools_/agent-core/cli.mjs",
               "\(home)/reflection/_projects_/computer-use/_tools_/agent-core/cli.mjs", "\(home)/reflection--cu-verifier/_projects_/heddle/_projects_/computer-use/_evaluators_/desktop-suite/run.mjs"] {
    var wrong = good
    wrong.arguments = ["node", path]
    check(refusal(wrong) != nil, "refused: \(path) (only the entry points of a configured checkout)")
  }
  let mine = PeerCheck.processArguments(getpid())
  check(mine?.0.first?.contains("unit-tests") ?? false, "KERN_PROCARGS2 reads argv")
  check(PeerCheck.executablePath(getpid())?.hasSuffix("unit-tests") ?? false, "proc_pidpath reads the executable")
  check(PeerCheck.workingDirectory(getpid()) == FileManager.default.currentDirectoryPath, "proc_pidinfo reads the working directory")
}

func testWebArea() {
  // CU-322 (D-089): an element that is, or descends from, an AXWebArea - the page of a browser that exposes it.
  let window: String? = "AXWindow"
  check(WebArea.contains(path: ["AXButton", "AXGroup", "AXWebArea", "AXScrollArea", window], ending: .top) == true, "a button inside the page is in the web area")
  check(WebArea.contains(path: ["AXWebArea", "AXScrollArea", window], ending: .top) == true, "the web area itself counts")
  check(WebArea.contains(path: ["AXTextField", "AXGroup", "AXWebArea"], ending: .error) == true, "found before an error: still in the web area")
  check(WebArea.contains(path: ["AXTextField", "AXToolbar", window], ending: .top) == false, "the address bar (browser chrome) is not")
  check(WebArea.contains(path: ["AXButton", window, "AXWebArea"], ending: .top) == false, "nothing above the window counts")
  check(WebArea.contains(path: ["AXButton", nil, "AXGroup"], ending: .top) == false, "a clean top without a web area: false")
  check(WebArea.contains(path: ["AXButton", "AXGroup"], ending: .error) == nil && WebArea.contains(path: ["AXButton"], ending: .limit) == nil,
        "a walk that ends at an Accessibility error or the depth limit is unknown (null), never false")
  check(WebArea.contains(path: Array(repeating: "AXGroup", count: PanelMarker.maxDepth) + ["AXWebArea"], ending: .top) == false,
        "past the walk's depth nothing is read (the live walk stops there and reports limit, so unknown)")
  // Through the dry run, by the live walk: hitTest and focused carry inWebArea from the declared ancestry.
  let display: JSON = [["id": 1, "main": true, "originPt": ["x": 0, "y": 0], "sizePt": ["width": 800, "height": 600], "scale": 1]]
  let page: JSON = [["role": "AXGroup"], ["role": "AXWebArea"], ["role": "AXScrollArea"], ["role": "AXWindow"]]
  let world = Harness(["displays": display, "frontmost": "ai.reflection.cu.fixture",
                       "apps": [["bundleId": "ai.reflection.cu.fixture", "pid": 501, "rect": ["x": 0, "y": 0, "width": 800, "height": 600]]],
                       "elements": [["rect": ["x": 100, "y": 300, "width": 80, "height": 30],
                                     "element": ["bundleId": "ai.reflection.cu.fixture", "pid": 501, "role": "AXButton", "title": "Buy now", "ancestors": page]],
                                    ["rect": ["x": 100, "y": 20, "width": 400, "height": 24],
                                     "element": ["bundleId": "ai.reflection.cu.fixture", "pid": 501, "role": "AXTextField", "title": "Address and Search",
                                                 "ancestors": [["role": "AXToolbar"], ["role": "AXWindow"]]]],
                                    ["rect": ["x": 100, "y": 400, "width": 300, "height": 100],
                                     "element": ["bundleId": "ai.reflection.cu.fixture", "pid": 501, "role": "AXWebArea"]],
                                    ["rect": ["x": 500, "y": 300, "width": 80, "height": 30],
                                     "element": ["bundleId": "ai.reflection.cu.fixture", "pid": 501, "role": "AXButton", "title": "Pay", "ancestors": [["role": "AXGroup"]], "ancestorsEnd": "error"]],
                                    ["rect": ["x": 500, "y": 100, "width": 80, "height": 30],
                                     "element": ["bundleId": "ai.reflection.cu.fixture", "pid": 501, "role": "AXButton", "title": "Plain", "inWebArea": true]]],
                       "focused": ["bundleId": "ai.reflection.cu.fixture", "pid": 501, "role": "AXTextField", "title": "Card number", "ancestors": page]])
  _ = world.ask("scope", ["bundleIds": ["ai.reflection.cu.fixture"]])
  check(world.ask("hitTest", ["xPt": 140, "yPt": 315])["element"]?["inWebArea"] == true, "a page button's hit test says inWebArea: true")
  check(world.ask("hitTest", ["xPt": 200, "yPt": 30])["element"]?["inWebArea"] == false, "the address bar's says false")
  check(world.ask("hitTest", ["xPt": 200, "yPt": 450])["element"]?["inWebArea"] == true, "the web area itself says true")
  let unknown = world.ask("hitTest", ["xPt": 540, "yPt": 315])["element"]
  check(unknown?.object?.keys.contains("inWebArea") == true && unknown?["inWebArea"] == .null, "an ancestry ending in an error: inWebArea null (present)")
  check(world.ask("hitTest", ["xPt": 540, "yPt": 115])["element"]?.object?.keys.contains("inWebArea") == false, "a declared inWebArea key is ignored; only ancestry decides")
  check(world.ask("focused")["element"]?["inWebArea"] == true, "keys: the focused field's chain says inWebArea: true")
}

func testManualAccessibilityRestore() {
  // CU-329: the helper's one Accessibility write is undone at the run's end, only where the helper made it.
  check(ManualAccessibilityRestore.shouldWrite(prior: .unset), "unset (false, no value, unsupported): write true and remember")
  check(!ManualAccessibilityRestore.shouldWrite(prior: .on), "already true (the user or another assistive app): leave it alone")
  check(!ManualAccessibilityRestore.shouldWrite(prior: .unreadable), "a failed read writes nothing (cu-developer-one)")
  _ = ManualAccessibilityRestore.restoreAll(write: { _ in }, isRunning: { _ in true })
  for pid: pid_t in [303, 101, 202] { ManualAccessibilityRestore.remember(pid) }
  ManualAccessibilityRestore.remember(101)
  var written: [pid_t] = []
  let restored = ManualAccessibilityRestore.restoreAll(write: { written.append($0) }, isRunning: { $0 != 202 })
  check(restored == [101, 303] && written == [101, 303], "every remembered pid still running gets false back, once, in order; a quit app is skipped")
  check(ManualAccessibilityRestore.restoreAll(write: { written.append($0) }, isRunning: { _ in true }).isEmpty && written.count == 2,
        "a second end (bye racing a broken link) writes nothing again")
  ManualAccessibilityRestore.clearReads()
  check(ManualAccessibilityRestore.readSummary() == nil, "no reads: no log line")
  for prior: ManualAccessibilityRestore.Prior in [.unset, .unset, .on, .unreadable] { ManualAccessibilityRestore.recordRead(prior) }
  check(ManualAccessibilityRestore.readSummary() == "unset 2, on 1, unreadable 1", "the end's log line counts the read outcomes, never a name")
  check(ManualAccessibilityRestore.processRuns(getpid()) && !ManualAccessibilityRestore.processRuns(99_999_999), "processRuns: this process yes, an impossible pid no")
}

func testPlaceholder() {
  // CU-349: an entry's placeholder, trimmed, at most 80 characters, entry roles only; never a value.
  check(Placeholder.pick(role: "AXTextField", raw: "  One-time code ") == "One-time code", "an entry's placeholder, trimmed")
  check(Placeholder.pick(role: "AXSecureTextField", raw: "PIN") == "PIN" && Placeholder.pick(role: "AXSearchField", raw: "Search") == "Search", "a secure field and a search field too")
  check(Placeholder.pick(role: "AXButton", raw: "CVV") == nil && Placeholder.pick(role: nil, raw: "CVV") == nil, "a non-entry role reports none")
  check(Placeholder.pick(role: "AXTextField", raw: String(repeating: "x", count: 80)) != nil && Placeholder.pick(role: "AXTextField", raw: String(repeating: "x", count: 81)) == nil, "over 80 characters reads as none, never cut")
  check(Placeholder.pick(role: "AXTextField", raw: "   ") == nil && Placeholder.pick(role: "AXTextField", raw: nil) == nil, "empty or absent reads as none")
}

func testNearbyLabel() {
  // CU-361: the static text beside an unnamed entry in layout - left on its row, else just above it; global top-left frames.
  let box = CGRect(x: 200, y: 100, width: 200, height: 24) // minX 200, maxX 400, minY 100, midY 112
  func text(_ words: String, _ x: CGFloat, _ y: CGFloat, _ width: CGFloat, _ height: CGFloat = 16) -> NearbyLabel.Candidate {
    NearbyLabel.Candidate(text: words, frame: CGRect(x: x, y: y, width: width, height: height))
  }
  let left = text("Password", 120, 104, 70)  // ends 10 pt left of the box, centred on its row
  let above = text("Email", 200, 80, 80)     // ends 4 pt above the box, over it
  check(NearbyLabel.pick(box: box, candidates: [left]) == "Password", "a static text left of the box on its row labels it")
  check(NearbyLabel.pick(box: box, candidates: [above]) == "Email", "a static text just above the box, overlapping it, labels it")
  check(NearbyLabel.pick(box: box, candidates: [text("Password", 0, 104, 70)]) == nil, "left but 130 pt away (over 120) is none")
  check(NearbyLabel.pick(box: box, candidates: [text("Password", 120, 130, 70)]) == nil, "left but on another row (centre 26 pt off, over half the height) is none")
  check(NearbyLabel.pick(box: box, candidates: [above, left]) == "Password", "left beats above, even when above is nearer")
  check(NearbyLabel.pick(box: box, candidates: [text("Name", 40, 104, 60), left]) == "Password", "of two left candidates the nearer wins")
  check(NearbyLabel.pick(box: box, candidates: [text("  Password \n", 120, 104, 70)]) == "Password", "the label is trimmed")
  check(NearbyLabel.pick(box: box, candidates: [text("   ", 120, 104, 70)]) == nil, "a whitespace text reads as none")
  check(NearbyLabel.pick(box: box, candidates: [text(String(repeating: "x", count: 80), 120, 104, 70)]) == String(repeating: "x", count: 80), "80 characters is kept")
  check(NearbyLabel.pick(box: box, candidates: [text(String(repeating: "x", count: 81), 120, 104, 70)]) == nil, "over 80 characters reads as none, never cut")
  check(NearbyLabel.pick(box: box, candidates: [text("Email", 420, 80, 60)]) == nil, "above but not overlapping the box horizontally is none")
  check(NearbyLabel.pick(box: box, candidates: [text("Email", 200, 56, 80)]) == nil, "above but 28 pt away (over 24) is none")
  check(NearbyLabel.pick(box: box, candidates: []) == nil, "no static text, no label")
}

func testPopUpItems() {
  // CU-372: a closed pop-up button's items as AX shows them - never an empty list for unknown.
  typealias Item = PopUpItems.Item
  let three = [Item(title: "Archive", enabled: true), Item(title: "", enabled: true), Item(title: " Delete ", enabled: nil), Item(title: "Keep", enabled: false)]
  let read = PopUpItems.shape(selected: "Archive", items: three)
  check(read["items"] == .array([.object(["title": .string("Archive"), "enabled": .bool(true)]), .object(["title": .string("Delete"), "enabled": .bool(true)]), .object(["title": .string("Keep"), "enabled": .bool(false)])]),
        "items in order: a separator (no title) skipped, titles trimmed, an unreadable AXEnabled counts as enabled")
  check(read["selected"] == "Archive" && read["selectedIndex"] == 0 && read["unread"] == nil, "the selected title and its index; no unread")
  check(PopUpItems.shape(selected: "Gone", items: three)["selectedIndex"] == .null, "a selected title matching no item gives index null")
  let none = PopUpItems.shape(selected: "1 GB", items: nil)
  check(none["unread"] == true && none["items"] == nil && none["selected"] == "1 GB", "no AXMenu child (a closed popup that exposes none, a failed read) is unread, never an empty list")
  check(PopUpItems.shape(selected: nil, items: [])["unread"] == true && PopUpItems.shape(selected: nil, items: [Item(title: " ", enabled: true)])["unread"] == true, "no titled item is unread")
  let fifty = (1...50).map { Item(title: "Item \($0)", enabled: true) }
  check(PopUpItems.shape(selected: nil, items: fifty)["unread"] == nil, "50 items are read")
  check(PopUpItems.shape(selected: nil, items: fifty + [Item(title: "Delete", enabled: true)])["unread"] == true, "over 50 items is unread")
  let long = String(repeating: "x", count: 90)
  let twins = [Item(title: "Custom…", enabled: true), Item(title: "Delete", enabled: true), Item(title: "Custom…", enabled: true)]
  check(PopUpItems.shape(selected: "Custom…", items: twins)["unread"] == true, "a selected title two items share is unread (the arrow's neighbour is unknown)")
  check(PopUpItems.shape(selected: "Delete", items: twins)["selectedIndex"] == 1, "a unique selected title among duplicates elsewhere is read")
  let pull = PopUpItems.shape(selected: "Actions", items: three, pullsDown: true)
  check(pull["pullsDown"] == true && pull["selectedIndex"] == .null && pull["items"] != nil, "a pull-down says so; its title is a label, so no selected index")
  check(PopUpItems.shape(selected: "Actions", items: nil, pullsDown: true)["pullsDown"] == true && PopUpItems.shape(selected: nil, items: nil)["pullsDown"] == nil, "unread keeps the pull-down mark; a pop-up has none")
  check(PopUpItems.shape(selected: long, items: [Item(title: long, enabled: true)])["items"] == .array([.object(["title": .string(String(repeating: "x", count: 80)), "enabled": .bool(true)])]), "a title is cut at 80 characters")
}

func testPasteboardTypes() {
  // CU-377: a file on the clipboard, from type names only.
  check(PasteboardTypes.hasFile(["public.utf8-plain-text", "public.file-url"]) == true, "a file URL type is a file")
  check(PasteboardTypes.hasFile(["NSFilenamesPboardType"]) == true, "the legacy filenames type is a file")
  check(PasteboardTypes.hasFile(["public.utf8-plain-text", "public.html"]) == false, "text alone is not a file")
  check(PasteboardTypes.hasFile([]) == false, "an empty pasteboard holds no file")
  check(PasteboardTypes.hasFile(nil) == nil, "unreadable types are unknown, never false")
}

@main
struct UnitTests {
  static func main() {
    testJSON()
    testParser()
    testExclusions()
    testGeometryAndGuard()
    testLiveReadsWithoutGrant()
    testMenuBarBlackOut()
    testCaptureRefusals()
    testTextChunks()
    testEvents()
    testDispatcherBasics()
    testDispatcherGrants()
    testDispatcherInput()
    testSecureInput()
    testLocalInputEvents()
    testCapture()
    testDryRunMenuBar()
    testSettle()
    testFramesAreSRGB()
    testCaptureScope()
    testHitWindow()
    testNotTouchableMessages()
    testMultiDisplay()
    testCaptureConfig()
    testSystemPrompt()
    testWindowServerRecognised()
    testFilePanels()
    testForeignContentAndPanels()
    testDragPath()
    testAbortedDrag()
    testAccessibilityShapes()
    testArguments()
    testPeerCheck()
    testMenuKey()
    testServicesMenu()
    testSelectedItems()
    testGrantRecheck()
    testWebArea()
    testManualAccessibilityRestore()
    testPlaceholder()
    testNearbyLabel()
    testPopUpItems()
    testPasteboardTypes()
    testEndWatchdog()
    // Informational: whether the process that ran these tests is genuine node (true for Node.js Foundation builds).
    let parentIsNode = PeerCheck.satisfiesNodeRequirement(pid: getppid(), token: nil)
    print(JSON.object(["passed": .int(passed), "failed": .int(failures.count), "failures": .array(failures.map { .string($0) }), "parentIsGenuineNode": .bool(parentIsNode)]).text)
    exit(failures.isEmpty ? 0 : 1)
  }
}
