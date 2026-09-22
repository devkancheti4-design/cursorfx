// CursorFX Desktop for Windows: a click-through overlay on every display that renders the
// CursorFX plugins over the whole system, driven by the global pointer position.
const { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const isWindows = process.platform === 'win32';
const SETTINGS = path.join(app.getPath('userData'), 'settings.json');
const DEFAULTS = {
  enabled: true, cursor: 'f1car', trail: null, click: 'gunshot',
  sound: false, cursorScale: 0.5, fadeWhenTyping: true,
};

let settings = { ...DEFAULTS };
let overlays = [];          // { win, display }
let widget = null;
let tray = null;
let lists = null;
let watcher = null;
let poll = null;
let lastPoint = { x: -1, y: -1 };
let lastDown = false;
let lastMoveAt = 0;
let lastKeyAt = 0;
let faded = false;
let shownAt = 0;

function log(...a) { console.log('[cursorfx]', ...a); }

function loadSettings() {
  try {
    settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS, 'utf8')) };
  } catch (e) {
    settings = { ...DEFAULTS };
  }
  settings.openAtLogin = app.getLoginItemSettings().openAtLogin;
}

function saveSettings() {
  const { openAtLogin, ...rest } = settings;
  try {
    fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
    fs.writeFileSync(SETTINGS, JSON.stringify(rest, null, 2));
  } catch (e) {
    log('could not save settings:', e.message);
  }
}

function overlayConfig() {
  return {
    cursor: settings.enabled ? settings.cursor : null,
    trail: settings.enabled ? settings.trail : null,
    click: settings.enabled ? settings.click : null,
    sound: settings.sound,
    cursorScale: settings.cursorScale,
    hideNative: false,
  };
}

function createOverlays() {
  overlays.forEach((o) => o.win.destroy());
  overlays = screen.getAllDisplays().map((display) => {
    const { x, y, width, height } = display.bounds;
    const win = new BrowserWindow({
      x, y, width, height,
      frame: false, transparent: true, backgroundColor: '#00000000',
      hasShadow: false, resizable: false, movable: false, minimizable: false,
      maximizable: false, fullscreenable: false, focusable: false,
      skipTaskbar: true, show: false, type: isWindows ? 'toolbar' : undefined,
      webPreferences: { backgroundThrottling: false, contextIsolation: true },
    });
    win.setIgnoreMouseEvents(true, { forward: false });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.loadFile(path.join(__dirname, 'overlay.html'));
    win.webContents.once('did-finish-load', async () => {
      await send(win, `__native.set(${JSON.stringify(overlayConfig())})`);
      if (!lists) await fetchLists(win);
      if (settings.enabled) win.showInactive();
    });
    return { win, display };
  });
  log('overlays:', overlays.length);
}

async function send(win, js) {
  if (!win || win.isDestroyed()) return null;
  try {
    return await win.webContents.executeJavaScript(js, true);
  } catch (e) {
    log('overlay script error:', e.message);
    return null;
  }
}

async function fetchLists(win) {
  const raw = await send(win, '__native.lists()');
  if (!raw) return;
  try {
    lists = JSON.parse(raw);
    const n = Object.values(lists).reduce((s, l) => s + l.length, 0);
    log('plugins:', n);
    if (widget && !widget.isDestroyed()) widget.webContents.send('state', publicState());
  } catch (e) {
    log('could not read plugin list:', e.message);
  }
}

function broadcast(js) {
  overlays.forEach((o) => send(o.win, js));
}

function applySettings() {
  saveSettings();
  const cfg = JSON.stringify(overlayConfig());
  overlays.forEach((o) => {
    if (settings.enabled) o.win.showInactive(); else o.win.hide();
    send(o.win, `__native.set(${cfg})`);
  });
  if (!settings.fadeWhenTyping && faded) { faded = false; overlays.forEach((o) => o.win.setOpacity(1)); }
  if (widget && !widget.isDestroyed()) widget.webContents.send('state', publicState());
  updateTrayMenu();
}

// ---- global input ----

function startPolling() {
  if (poll) clearInterval(poll);
  poll = setInterval(() => {
    if (!settings.enabled) return;
    const p = screen.getCursorScreenPoint();
    if (p.x === lastPoint.x && p.y === lastPoint.y) { updateFade(); return; }
    lastPoint = p;
    lastMoveAt = Date.now();
    const target = overlays.find((o) => {
      const b = o.display.bounds;
      return p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
    }) || overlays[0];
    if (!target) return;
    const x = p.x - target.display.bounds.x;
    const y = p.y - target.display.bounds.y;
    overlays.forEach((o) => { if (o !== target) send(o.win, '__native.leave()'); });
    send(target.win, `__native.move(${x},${y})`);
    updateFade();
  }, 1000 / 60);
}

function currentOverlay() {
  const p = lastPoint;
  return overlays.find((o) => {
    const b = o.display.bounds;
    return p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
  }) || overlays[0];
}

function setButton(down) {
  if (down === lastDown) return;
  lastDown = down;
  lastMoveAt = Date.now();
  const target = currentOverlay();
  if (!target) return;
  const x = lastPoint.x - target.display.bounds.x;
  const y = lastPoint.y - target.display.bounds.y;
  send(target.win, `__native.${down ? 'down' : 'up'}(${x},${y})`);
}

function updateFade() {
  const typing = settings.fadeWhenTyping && settings.enabled && lastKeyAt > lastMoveAt;
  if (typing === faded) return;
  faded = typing;
  overlays.forEach((o) => o.win.setOpacity(typing ? 0 : 1));
}

// The watcher supplies what Electron cannot see: global button state and keystrokes.
function startWatcher() {
  if (!isWindows) { log('input watcher is Windows only; clicks and typing fade are inactive here'); return; }
  const script = path.join(__dirname, 'input-watch.ps1');
  const exe = process.env.SystemRoot
    ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : 'powershell.exe';
  watcher = spawn(exe, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], {
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let buf = '';
  watcher.stdout.on('data', (chunk) => {
    buf += chunk.toString();
    const lines = buf.split(/\r?\n/);
    buf = lines.pop();
    for (const line of lines) {
      const e = line.trim();
      if (e === 'B1') setButton(true);
      else if (e === 'B0') setButton(false);
      else if (e === 'K') { lastKeyAt = Date.now(); updateFade(); }
    }
  });
  watcher.stderr.on('data', (d) => log('watcher:', d.toString().trim().slice(0, 200)));
  watcher.on('exit', (code) => log('watcher exited', code));
}

// ---- tray and widget ----

function trayIcon() {
  const file = path.join(__dirname, 'assets', 'tray.png');
  const img = nativeImage.createFromPath(file);
  if (img.isEmpty()) return nativeImage.createEmpty();
  const small = img.resize({ width: 16, height: 16 });
  small.setTemplateImage(true);
  return small;
}

function updateTrayMenu() {
  if (!tray) return;
  tray.setToolTip(`CursorFX${settings.enabled ? '' : ' (off)'}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open CursorFX', click: showWidget },
    { type: 'separator' },
    { label: 'Enabled', type: 'checkbox', checked: settings.enabled, click: () => { settings.enabled = !settings.enabled; applySettings(); } },
    { label: 'Sound', type: 'checkbox', checked: settings.sound, click: () => { settings.sound = !settings.sound; applySettings(); } },
    { label: 'Open at login', type: 'checkbox', checked: settings.openAtLogin, click: () => setLogin(!settings.openAtLogin) },
    { type: 'separator' },
    { label: 'Web studio', click: () => shell.openExternal('https://devkancheti4-design.github.io/cursorfx/') },
    { label: 'Quit CursorFX', click: () => app.quit() },
  ]));
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.on('click', showWidget);
  updateTrayMenu();
}

function showWidget() {
  if (widget && !widget.isDestroyed()) { widget.isVisible() ? widget.hide() : positionWidget(); return; }
  widget = new BrowserWindow({
    width: 350, height: 470, show: false, frame: false, resizable: false,
    transparent: true, backgroundColor: '#00000000', skipTaskbar: true,
    alwaysOnTop: true, fullscreenable: false, maximizable: false, minimizable: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  widget.loadFile(path.join(__dirname, 'widget.html'));
  widget.once('ready-to-show', positionWidget);
  widget.on('blur', () => {
    if (!widget || widget.isDestroyed() || !widget.isVisible()) return;
    if (Date.now() - shownAt < 500) return;   // ignore the blur that arrives as it opens
    if (process.env.CURSORFX_KEEP_WIDGET) return;
    widget.hide();
  });
}

function positionWidget() {
  if (!widget || widget.isDestroyed()) return;
  const cursor = screen.getCursorScreenPoint();
  const area = screen.getDisplayNearestPoint(cursor).workArea;
  const [w, h] = widget.getSize();
  const x = Math.round(Math.min(Math.max(cursor.x - w / 2, area.x + 8), area.x + area.width - w - 8));
  // Below the tray when the taskbar is at the top, otherwise above it.
  const y = cursor.y < area.y + area.height / 2 ? area.y + 8 : area.y + area.height - h - 8;
  widget.setPosition(x, y, false);
  shownAt = Date.now();
  if (app.focus) app.focus({ steal: true });
  widget.show();
  widget.focus();
}

function setLogin(on) {
  app.setLoginItemSettings({ openAtLogin: on, path: process.execPath, args: [] });
  settings.openAtLogin = app.getLoginItemSettings().openAtLogin;
  applySettings();
}

function publicState() {
  return { settings, lists: lists || { cursor: [], trail: [], click: [] } };
}

ipcMain.handle('state', () => publicState());
ipcMain.handle('set', (_e, patch) => {
  if ('openAtLogin' in patch) { setLogin(!!patch.openAtLogin); delete patch.openAtLogin; }
  Object.assign(settings, patch);
  applySettings();
  return publicState();
});
ipcMain.on('quit', () => app.quit());
// The panel's height depends on the font and scaling Windows is using, so the window
// takes its size from the rendered content instead of a hard-coded guess.
ipcMain.on('resize', (_e, height) => {
  if (!widget || widget.isDestroyed()) return;
  const h = Math.round(Math.max(240, Math.min(760, height)));
  const [w] = widget.getSize();
  widget.setSize(w, h, false);
  if (widget.isVisible()) positionWidget();
});

// ---- lifecycle ----

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWidget);
  if (app.dock) app.dock.hide();

  app.whenReady().then(() => {
    loadSettings();
    createOverlays();
    createTray();
    startPolling();
    startWatcher();
    if (process.env.CURSORFX_SHOW_WIDGET) setTimeout(showWidget, 1500);
    screen.on('display-added', createOverlays);
    screen.on('display-removed', createOverlays);
    screen.on('display-metrics-changed', createOverlays);
  });

  app.on('window-all-closed', (e) => e.preventDefault());
  app.on('before-quit', () => {
    if (watcher) { try { watcher.kill(); } catch (e) {} }
    if (poll) clearInterval(poll);
  });
}
