// CursorFX Desktop for Windows: a click-through overlay on every display that renders the
// CursorFX plugins over the whole system, driven by the global pointer position.
const { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage, shell } = require('electron');
const { spawn, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const isWindows = process.platform === 'win32';

const SETTINGS = path.join(app.getPath('userData'), 'settings.json');
const DEFAULTS = {
  enabled: true, cursor: 'f1car', trail: null, click: 'gunshot',
  sound: false, cursorScale: 0.5, fadeWhenTyping: true, hideCursor: false,
};

let settings = { ...DEFAULTS };
let overlays = [];          // { win, display }
let widget = null;
let tray = null;
let lists = null;
let watcher = null;
let hider = null;
let poll = null;
let lastPoint = { x: -1, y: -1 };
let lastDown = false;
let lastMoveAt = 0;
let activeOverlay = null;
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
  activeOverlay = null;
  overlays = screen.getAllDisplays().map((display) => {
    const { x, y, width, height } = display.bounds;
    const win = new BrowserWindow({
      x, y, width, height,
      frame: false, transparent: true, backgroundColor: '#00000000',
      hasShadow: false, resizable: false, movable: false, minimizable: false,
      maximizable: false, fullscreenable: false, focusable: false,
      skipTaskbar: true, show: false, type: isWindows ? 'toolbar' : undefined,
      webPreferences: {
        backgroundThrottling: false, contextIsolation: true,
        preload: path.join(__dirname, 'overlay-preload.js'),
      },
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

function post(win, message) {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('cfx', message);
}

function applySettings() {
  saveSettings();
  const cfg = JSON.stringify(overlayConfig());
  overlays.forEach((o) => {
    if (settings.enabled) o.win.showInactive(); else o.win.hide();
    send(o.win, `__native.set(${cfg})`);
  });
  if (!settings.fadeWhenTyping && faded) { faded = false; overlays.forEach((o) => o.win.setOpacity(1)); }
  applyCursorVisibility();
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
    // Only the display the pointer just left needs telling, and only once.
    if (activeOverlay && activeOverlay !== target) post(activeOverlay.win, { t: 'l' });
    activeOverlay = target;
    post(target.win, { t: 'm', x: p.x - target.display.bounds.x, y: p.y - target.display.bounds.y });
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
  post(target.win, {
    t: down ? 'd' : 'u',
    x: lastPoint.x - target.display.bounds.x,
    y: lastPoint.y - target.display.bounds.y,
  });
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

// ---- hiding the real Windows pointer ----
//
// Windows has no per-app way to hide the pointer everywhere, so the system cursors are
// swapped for a blank one and put back on exit. Every path that can end the app restores
// them: closing the helper's stdin, quitting, and a one-shot restore on the next start in
// case the app was killed outright.

function powershellPath() {
  return process.env.SystemRoot
    ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : 'powershell.exe';
}

function cursorScriptArgs(extra) {
  return ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', path.join(__dirname, 'cursor-visibility.ps1')].concat(extra || []);
}

function restoreCursorNow() {
  if (!isWindows) return;
  try {
    execFileSync(powershellPath(), cursorScriptArgs(['-Restore']), { timeout: 8000, windowsHide: true });
    log('system cursors restored');
  } catch (e) {
    log('could not restore the system cursor:', e.message);
  }
}

function startHider() {
  if (!isWindows || hider) return;
  hider = spawn(powershellPath(), cursorScriptArgs(), { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  hider.stdout.on('data', (d) => log('cursor:', d.toString().trim()));
  hider.stderr.on('data', (d) => log('cursor helper:', d.toString().trim().slice(0, 200)));
  hider.on('exit', () => { hider = null; });
}

function stopHider() {
  if (!hider) return;
  const h = hider;
  hider = null;
  try { h.stdin.write('show\n'); h.stdin.end(); } catch (e) {}
  setTimeout(() => { try { h.kill(); } catch (e) {} }, 1500);
}

function applyCursorVisibility() {
  const hide = isWindows && settings.enabled && settings.hideCursor;
  if (hide) startHider(); else stopHider();
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
    { label: 'Hide the real arrow', type: 'checkbox', checked: settings.hideCursor, enabled: isWindows, click: () => { settings.hideCursor = !settings.hideCursor; applySettings(); } },
    { label: 'Fade while typing', type: 'checkbox', checked: settings.fadeWhenTyping, click: () => { settings.fadeWhenTyping = !settings.fadeWhenTyping; applySettings(); } },
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
  return { settings, platform: process.platform, lists: lists || { cursor: [], trail: [], click: [] } };
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

// ---- self test ----
//
// Drives the real overlay window with synthetic pointer input and reports what it drew.
// Browsers pause their animation loop when a window is not on screen, so this has to run
// against the live overlay rather than a headless page.  CURSORFX_SELFTEST=1 npm start

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function selfTest() {
  const ov = overlays[0];
  const probe = (js) => ov.win.webContents.executeJavaScript(js, true);
  await probe(`window.__probe = {
    frames: 0,
    ink() {
      const cv = document.querySelector('canvas[data-cursorfx]');
      const g = cv.getContext('2d');
      const d = g.getImageData(0, 0, cv.width, cv.height).data;
      let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 10) n++;
      return n;
    },
  };
  (function count() { window.__probe.frames++; requestAnimationFrame(count); })();
  'ready'`);

  const frames = () => probe('window.__probe.frames');
  const ink = () => probe('window.__probe.ink()');
  const idle = () => probe('CursorFX.state.idle');

  const f0 = await frames(); await sleep(1000);
  const rafHz = (await frames()) - f0;

  for (let i = 0; i < 25; i++) { post(ov.win, { t: 'm', x: 300 + i * 8, y: 300 }); await sleep(16); }
  await sleep(100);
  const movingInk = await ink();

  await sleep(2200);                     // settle into the resting state
  const restingIdle = await idle();
  const restingInk = await ink();
  const f1 = await frames(); await sleep(1000);
  const restingHz = (await frames()) - f1;

  post(ov.win, { t: 'm', x: 700, y: 500 }); await sleep(80);
  const wokeInk = await ink();
  const wokeIdle = await idle();

  console.log(JSON.stringify({
    rafHz, movingInk, restingIdle: +restingIdle.toFixed(2), restingInk, restingHz,
    wokeInk, wokeIdle: +wokeIdle.toFixed(3),
    drawsWhileMoving: movingInk > 0,
    stillVisibleAtRest: restingInk > 0,
    wakesUp: wokeInk > 0,
  }, null, 2));
  app.quit();
}

// ---- lifecycle ----

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWidget);
  if (app.dock) app.dock.hide();

  app.whenReady().then(() => {
    loadSettings();
    restoreCursorNow();   // clears a hidden pointer left behind if a previous run was killed
    createOverlays();
    createTray();
    startPolling();
    startWatcher();
    applyCursorVisibility();
    if (process.env.CURSORFX_SHOW_WIDGET) setTimeout(showWidget, 1500);
    if (process.env.CURSORFX_SELFTEST) setTimeout(selfTest, 2500);
    screen.on('display-added', createOverlays);
    screen.on('display-removed', createOverlays);
    screen.on('display-metrics-changed', createOverlays);
  });

  app.on('window-all-closed', (e) => e.preventDefault());
  app.on('before-quit', () => {
    if (watcher) { try { watcher.kill(); } catch (e) {} }
    stopHider();
    restoreCursorNow();
    if (poll) clearInterval(poll);
  });
  // A crash or a forced stop must not leave the pointer invisible.
  process.on('exit', restoreCursorNow);
  process.on('SIGTERM', () => app.quit());
  process.on('SIGINT', () => app.quit());
}
