// CursorFX Desktop for macOS: a click-through overlay on every screen that renders the CursorFX
// plugins over the whole system (desktop, every app), driven by the global mouse position.
import Cocoa
import WebKit

// Private window-server calls that let a background app hide the system cursor (used by cursor-hiding utilities).
@_silgen_name("_CGSDefaultConnection") func _CGSDefaultConnection() -> Int32
@_silgen_name("CGSSetConnectionProperty") func CGSSetConnectionProperty(_ cid: Int32, _ ownerCid: Int32, _ key: CFString, _ value: CFTypeRef) -> Int32
@_silgen_name("CGCursorIsVisible") func cgCursorIsVisible() -> UInt32

final class CursorHider {
    private var hideCount = 0
    var wanted = false
    init() {
        let cid = _CGSDefaultConnection()
        _ = CGSSetConnectionProperty(cid, cid, "SetsCursorInBackground" as CFString, kCFBooleanTrue)
    }
    func hide() { _ = CGDisplayHideCursor(CGMainDisplayID()); hideCount += 1 }
    func show() { while hideCount > 0 { _ = CGDisplayShowCursor(CGMainDisplayID()); hideCount -= 1 } }
    // Some apps re-show the cursor when they change it; call this often to keep it hidden.
    func reassert() { if wanted && cgCursorIsVisible() != 0 { hide() } }
}

let logURL = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/CursorFX.log")
func log(_ s: String) {
    let line = "[\(ISO8601DateFormatter().string(from: Date()))] \(s)\n"
    if let h = try? FileHandle(forWritingTo: logURL) {
        h.seekToEndOfFile(); h.write(line.data(using: .utf8)!); h.closeFile()
    } else {
        try? line.write(to: logURL, atomically: true, encoding: .utf8)
    }
}

final class OverlayWindow: NSWindow {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

final class Overlay: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    let screen: NSScreen
    let window: OverlayWindow
    let web: WKWebView
    var ready = false
    var onReady: (() -> Void)?

    init(screen: NSScreen, resources: URL) {
        self.screen = screen
        let frame = screen.frame
        window = OverlayWindow(contentRect: frame, styleMask: [.borderless], backing: .buffered, defer: false, screen: screen)
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = false
        window.ignoresMouseEvents = true
        window.level = .screenSaver
        window.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary, .ignoresCycle]
        window.isReleasedWhenClosed = false

        let config = WKWebViewConfiguration()
        config.mediaTypesRequiringUserActionForPlayback = []
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        let ucc = WKUserContentController()
        config.userContentController = ucc
        web = WKWebView(frame: NSRect(origin: .zero, size: frame.size), configuration: config)
        web.setValue(false, forKey: "drawsBackground")
        if #available(macOS 12.0, *) { web.underPageBackgroundColor = .clear }
        web.autoresizingMask = [.width, .height]
        super.init()
        ucc.add(self, name: "native")
        web.navigationDelegate = self
        window.contentView = web
        web.loadFileURL(resources.appendingPathComponent("overlay.html"), allowingReadAccessTo: resources)
        window.orderFrontRegardless()
    }

    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
        let body = "\(m.body)"
        log("js[\(Int(screen.frame.width))x\(Int(screen.frame.height))]: \(body)")
        if body.hasPrefix("ready") { ready = true; onReady?() }
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { log("nav fail: \(error)") }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { log("nav provisional fail: \(error)") }

    func send(_ js: String) {
        guard ready else { return }
        web.evaluateJavaScript(js) { _, err in if let err = err { log("js error: \(err.localizedDescription)") } }
    }
    func close() { window.orderOut(nil); window.close() }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    var overlays: [Overlay] = []
    var current: Overlay?
    var statusItem: NSStatusItem!
    var timer: Timer?
    var lastDown = false
    var lastX = -1.0, lastY = -1.0
    var lists: [String: [[String: Any]]] = [:]
    var config: [String: Any] = ["cursor": "f1car", "trail": NSNull(), "click": "gunshot", "sound": true, "cursorScale": 0.5]
    let sizes: [(String, Double)] = [("Small", 0.35), ("Medium", 0.5), ("Large", 0.75), ("Full", 1.0)]
    var cursorHidden = true
    let hider = CursorHider()
    let defaults = UserDefaults.standard
    var reassertTick = 0

    var resources: URL { Bundle.main.resourceURL ?? URL(fileURLWithPath: ".") }

    func applicationDidFinishLaunching(_ n: Notification) {
        NSApp.setActivationPolicy(.accessory)
        log("launch; resources=\(resources.path)")
        if let raw = defaults.string(forKey: "config"), let d = raw.data(using: .utf8),
           let obj = try? JSONSerialization.jsonObject(with: d) as? [String: Any] { config = obj }
        if config["cursorScale"] == nil { config["cursorScale"] = 0.5 }
        cursorHidden = defaults.object(forKey: "hideCursor") == nil ? true : defaults.bool(forKey: "hideCursor")
        buildOverlays()
        buildStatusItem()
        let t = Timer(timeInterval: 1.0 / 60.0, repeats: true) { [weak self] _ in self?.tick() }
        RunLoop.main.add(t, forMode: .common)
        timer = t
        NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main) { [weak self] _ in self?.buildOverlays() }
        hider.wanted = cursorHidden
        if cursorHidden { hider.hide() }
        log("cursor hidden: \(cursorHidden), visible now: \(cgCursorIsVisible())")
    }

    func applicationWillTerminate(_ n: Notification) {
        hider.wanted = false
        hider.show()
    }

    func buildOverlays() {
        overlays.forEach { $0.close() }
        overlays = NSScreen.screens.map { screen in
            let ov = Overlay(screen: screen, resources: resources)
            ov.onReady = { [weak self, weak ov] in
                guard let self = self, let ov = ov else { return }
                ov.send("__native.set(\(self.configJSON()))")
                if self.lists.isEmpty { self.fetchLists(from: ov) }
            }
            return ov
        }
        current = nil
        log("overlays: \(overlays.count)")
    }

    func configJSON() -> String {
        let d = try? JSONSerialization.data(withJSONObject: config)
        return String(data: d ?? Data("{}".utf8), encoding: .utf8) ?? "{}"
    }

    func fetchLists(from ov: Overlay) {
        ov.web.evaluateJavaScript("__native.lists()") { [weak self] result, err in
            guard let self = self, let s = result as? String, let d = s.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: d) as? [String: [[String: Any]]] else {
                log("lists failed: \(String(describing: err))"); return
            }
            self.lists = obj
            self.buildMenu()
            log("lists: cursor=\(obj["cursor"]?.count ?? 0) trail=\(obj["trail"]?.count ?? 0) click=\(obj["click"]?.count ?? 0)")
        }
    }

    func tick() {
        reassertTick += 1
        if reassertTick % 30 == 0 { hider.reassert() }
        let loc = NSEvent.mouseLocation
        guard let ov = overlays.first(where: { NSMouseInRect(loc, $0.screen.frame, false) }) ?? overlays.first else { return }
        if ov !== current { current?.send("__native.leave()"); current = ov }
        let f = ov.screen.frame
        let x = loc.x - f.minX, y = f.maxY - loc.y
        let down = (NSEvent.pressedMouseButtons & 1) != 0
        var js = ""
        if x != lastX || y != lastY { js += "__native.move(\(x),\(y));"; lastX = x; lastY = y }
        if down != lastDown { js += down ? "__native.down(\(x),\(y));" : "__native.up(\(x),\(y));"; lastDown = down }
        if !js.isEmpty { ov.send(js) }
    }

    func buildStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.title = "🏎️"
        buildMenu()
    }

    func buildMenu() {
        let menu = NSMenu()
        let header = NSMenuItem(title: "CursorFX Desktop", action: nil, keyEquivalent: "")
        header.isEnabled = false
        menu.addItem(header)
        for (kind, title) in [("cursor", "Cursor"), ("trail", "Trail"), ("click", "Click effect")] {
            let sub = NSMenu()
            let none = NSMenuItem(title: "None", action: #selector(pick(_:)), keyEquivalent: "")
            none.target = self
            none.representedObject = ["kind": kind, "name": ""]
            none.state = (config[kind] as? String ?? "").isEmpty ? .on : .off
            sub.addItem(none)
            for item in lists[kind] ?? [] {
                let name = item["name"] as? String ?? ""
                let label = "\(item["icon"] as? String ?? "") \(item["label"] as? String ?? name)"
                let mi = NSMenuItem(title: label, action: #selector(pick(_:)), keyEquivalent: "")
                mi.target = self
                mi.representedObject = ["kind": kind, "name": name]
                mi.state = (config[kind] as? String) == name ? .on : .off
                sub.addItem(mi)
            }
            let parent = NSMenuItem(title: title, action: nil, keyEquivalent: "")
            parent.submenu = sub
            menu.addItem(parent)
        }
        let sizeMenu = NSMenu()
        let currentScale = (config["cursorScale"] as? NSNumber)?.doubleValue ?? 0.5
        for (label, s) in sizes {
            let mi = NSMenuItem(title: label, action: #selector(pickSize(_:)), keyEquivalent: "")
            mi.target = self
            mi.representedObject = NSNumber(value: s)
            mi.state = abs(currentScale - s) < 0.01 ? .on : .off
            sizeMenu.addItem(mi)
        }
        let sizeParent = NSMenuItem(title: "Cursor size", action: nil, keyEquivalent: "")
        sizeParent.submenu = sizeMenu
        menu.addItem(sizeParent)
        menu.addItem(.separator())
        let sound = NSMenuItem(title: "Sound", action: #selector(toggleSound), keyEquivalent: "")
        sound.target = self
        sound.state = (config["sound"] as? Bool ?? false) ? .on : .off
        menu.addItem(sound)
        let hide = NSMenuItem(title: "Hide system cursor", action: #selector(toggleCursor), keyEquivalent: "")
        hide.target = self
        hide.state = cursorHidden ? .on : .off
        menu.addItem(hide)
        menu.addItem(.separator())
        let studio = NSMenuItem(title: "Open web studio", action: #selector(openStudio), keyEquivalent: "")
        studio.target = self
        menu.addItem(studio)
        let quit = NSMenuItem(title: "Quit CursorFX", action: #selector(quitApp), keyEquivalent: "q")
        quit.target = self
        menu.addItem(quit)
        statusItem.menu = menu
    }

    @objc func pick(_ sender: NSMenuItem) {
        guard let info = sender.representedObject as? [String: String], let kind = info["kind"] else { return }
        let name = info["name"] ?? ""
        config[kind] = name.isEmpty ? NSNull() : name
        apply()
    }
    @objc func pickSize(_ sender: NSMenuItem) {
        config["cursorScale"] = (sender.representedObject as? NSNumber)?.doubleValue ?? 0.5
        apply()
    }
    @objc func toggleSound() { config["sound"] = !(config["sound"] as? Bool ?? false); apply() }
    @objc func toggleCursor() {
        cursorHidden.toggle()
        hider.wanted = cursorHidden
        if cursorHidden { hider.hide() } else { hider.show() }
        defaults.set(cursorHidden, forKey: "hideCursor")
        buildMenu()
    }
    @objc func openStudio() { NSWorkspace.shared.open(URL(string: "https://devkancheti4-design.github.io/cursorfx/")!) }
    @objc func quitApp() { NSApp.terminate(nil) }

    func apply() {
        defaults.set(configJSON(), forKey: "config")
        overlays.forEach { $0.send("__native.set(\(configJSON()))") }
        buildMenu()
        log("apply \(configJSON())")
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
