import AppKit
import WebKit

/// 'web-buttons' (CU-180, the desktop twin of CU-175/CU-176): web content inside a native window, where the system hit
/// test returns the deepest element - the label or icon inside a control, not the control. Four controls, each named
/// only by what is inside it: a button whose words are a <span>, an icon button named by aria-label, a link whose words
/// are a <span>, and a role-less clickable <div> - plus a plain paragraph <span> with no handler and no pointer, the
/// negative row (the walk to a control must not lift it, and its click stays allowed). The icon is an unnamed image
/// (role=img, not aria-hidden), so the hit test reaches it rather than the button (cu-verifier). A second plain
/// paragraph mentions 'delete' ('plain-delete'): reading text takes no name (the browser's rule), so it stays allowed. A click on a control records 'web-click' with its id and does nothing else. Their rects,
/// measured in the page once it has loaded, are targets 'web:<id>' in the window's coordinates.
final class WebButtons: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
  static let task = "web-buttons"
  static var shared: WebButtons?
  static let ids = ["delete-span", "delete-icon", "buy-link", "delete-div"]
  static let targetIds = ids + ["plain-text", "plain-delete"]

  static let html = """
    <!doctype html><html><head><meta charset="utf-8"><style>
    body { font: 15px -apple-system, sans-serif; margin: 18px; }
    .row { margin: 16px 0; }
    div.click { display: inline-block; padding: 6px 14px; border: 1px solid #888; border-radius: 5px; cursor: pointer; }
    </style></head><body>
    <h2>Project files</h2>
    <div class="row"><button id="delete-span" onclick="hit('delete-span')"><span>Delete</span></button></div>
    <div class="row"><button id="delete-icon" aria-label="Delete" onclick="hit('delete-icon')"><svg role="img" width="18" height="18" viewBox="0 0 16 16"><path d="M3 4h10M6 4V2h4v2M4 4l1 10h6l1-10" stroke="black" fill="none"/></svg></button></div>
    <div class="row"><a id="buy-link" href="#" onclick="hit('buy-link'); return false"><span>Buy now</span></a></div>
    <div class="row"><div class="click" id="delete-div" onclick="hit('delete-div')"><span>Delete</span></div></div>
    <p class="row"><span id="plain-text">Hello there</span></p>
    <p class="row"><span id="plain-delete">To delete your account, contact support</span></p>
    <script>
    function hit(id) { window.webkit.messageHandlers.cu.postMessage({ click: id }) }
    function rects() {
      const out = {}
      for (const id of \(targetIds)) { const r = document.getElementById(id).getBoundingClientRect(); out[id] = [r.left, r.top, r.width, r.height] }
      window.webkit.messageHandlers.cu.postMessage({ rects: out })
    }
    window.addEventListener('load', rects)
    </script></body></html>
    """

  let web: WKWebView
  var loaded = false
  var clicks: [String] = []
  var rects: [String: [Double]] = [:]

  override init() {
    let config = WKWebViewConfiguration()
    web = WKWebView(frame: NSRect(x: 20, y: 56, width: 560, height: 300), configuration: config)
    super.init()
    config.userContentController.add(self, name: "cu")
    web.navigationDelegate = self
  }

  static func open(title: String) -> Bool {
    shared?.web.configuration.userContentController.removeScriptMessageHandler(forName: "cu")
    let screen = WebButtons()
    shared = screen
    let content = FlippedView(frame: NSRect(x: 0, y: 0, width: 600, height: 380))
    let heading = Kit.label("Project files (web)", size: 18, bold: true)
    heading.frame = NSRect(x: 20, y: 16, width: 400, height: 24)
    content.addSubview(heading)
    content.addSubview(screen.web)
    _ = Windows.open("main", title: title, content: content)
    screen.web.loadHTMLString(html, baseURL: nil)
    return true
  }

  func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
    guard let body = message.body as? [String: Any] else { return }
    if let id = body["click"] as? String {
      clicks.append(id)
      Fixture.shared.record("web-click", ["id": id])
    }
    if let measured = body["rects"] as? [String: [Double]] {
      rects = measured
      loaded = true
    }
  }

  static func fields() -> [String: Any] {
    guard Screens.current == task, let screen = shared else { return [:] }
    return ["webLoaded": screen.loaded, "webClicks": screen.clicks]
  }

  /// Targets 'web:<id>' in the window's content coordinates, as Fixture.targets reports native controls.
  static func targets() -> [String: Any] {
    guard Screens.current == task, let screen = shared, let window = screen.web.window, let content = window.contentView else { return [:] }
    let frame = screen.web.convert(screen.web.bounds, to: content)
    let top = content.isFlipped ? frame.minY : content.bounds.height - frame.maxY
    var out: [String: Any] = [:]
    for (id, r) in screen.rects where r.count == 4 {
      let x = frame.minX + r[0], y = top + r[1]
      out["web:\(id)"] = ["window": window.identifier?.rawValue ?? "", "x": x, "y": y, "width": r[2], "height": r[3], "cx": x + r[2] / 2, "cy": y + r[3] / 2, "type": "web"]
    }
    return out
  }

  /// Seam: `webClick id` clicks the control in the page, as a click there would.
  static func act(_ step: [String: Any]) -> Bool {
    guard Screens.current == task, let screen = shared, let id = step["webClick"] as? String, ids.contains(id) else { return false }
    screen.web.evaluateJavaScript("document.getElementById('\(id)').click()", completionHandler: nil)
    return true
  }
}
