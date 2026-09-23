# CursorFX Desktop for Windows

The same cursors, trails and click effects as the library, drawn over your whole desktop and every app rather than a single web page. It is an Electron app: one transparent click-through window per display, hosting the CursorFX bundle, fed by the global pointer position.

![the widget](../../docs/demo.gif)

## Install

Download `CursorFX-Windows.zip` from the [Releases page](../../../releases), unzip it anywhere, and run `CursorFX.exe`. Nothing is installed and nothing is written outside your user profile. SmartScreen will warn that the publisher is unknown, because the build is not code-signed: choose **More info**, then **Run anyway**.

## Using it

A cursor icon appears in the notification area, next to the clock. You may have to drag it out of the hidden-icons flyout the first time.

- **Left-click the icon** for the panel: a master switch, swipeable strips of cursors, trails and click effects, a size slider, and switches for sound, hiding the real arrow, fading while you type, and opening at login. Picking one of the guns adds a row of skins under the cursors.
- **Open at login** is greyed out when you run from source with `npm start`, so a development run never registers a copy of Electron that disappears when `node_modules` is reinstalled.
- **Right-click the icon** for the same controls as a plain menu.
- **Open at login** registers the app with Windows the normal way, so you can also turn it off later under Settings, Apps, Startup.

Your choices are saved to `%APPDATA%\CursorFX\settings.json` and come back on the next run.

## Building it yourself

```
npm install
npm start          # run it from source
npm run dist       # build CursorFX.exe into dist/
```

`npm run bundle` copies `dist/cursorfx.js` from the repository root, so every plugin you add to the library appears in the panel with no other changes. Building the installer must happen on Windows: electron-builder needs Windows tooling for the portable and NSIS targets.

## Performance

Both apps were measured on the same Mac, running the same effects, with the pointer driven
along an identical path so they saw identical work. The figure is percentage of one core,
counting every process each app spawns, including its GPU and renderer helpers.

| | macOS app | this app |
|---|---|---|
| Pointer moving, car cursor | 15.4 | 33.7 |
| Pointer moving, car cursor and fire trail | 15.3 | 37.4 |
| Idle, before the change below | 11.5 | 34.2 |
| **Idle, now** | **7.3** | **12.5** |

Redrawing a full-screen overlay costs the same whether or not anything is happening, and an
overlay spends almost all of its life doing nothing. The shared engine now eases off to a low
frame rate once the pointer has been still for a moment and snaps back to full speed the instant
anything moves, which cut the idle cost of this app by nearly two thirds and brought the two
apps much closer together. `CURSORFX_SELFTEST=1 npm start` drives the real overlay with
synthetic input and reports that it still draws while moving, stays visible at rest, and wakes up.

While the pointer is actually moving this app still costs roughly twice the Mac app. That gap is
architectural: Chromium composites a full-screen transparent window across several processes,
where the Mac app hands one layer to AppKit. Two things were measured and rejected rather than
assumed. Turning off hardware acceleration made it five times worse, at 205 percent of a core.
Forcing a device scale factor of 1 changed nothing, so the cost is compositing rather than the
number of pixels being filled.

## How it works, and what is different from the Mac app

| | Windows | macOS |
|---|---|---|
| Overlay | Electron, one transparent click-through window per display | AppKit window per screen hosting a web view |
| Pointer | `screen.getCursorScreenPoint()` polled at 60 Hz | `NSEvent.mouseLocation` polled at 60 Hz |
| Clicks and typing | `input-watch.ps1`, a small PowerShell helper | `NSEvent.pressedMouseButtons` and the input clock |
| Hiding the real arrow | `cursor-visibility.ps1` swaps the system cursors | private window-server call |

Electron cannot see mouse buttons or keystrokes that land in other applications, so `input-watch.ps1` supplies them. It runs through the PowerShell that ships with Windows, needs no modules and no administrator rights, and prints one short line per event: `B1` and `B0` for the left button, `K` for a keystroke.

Keyboard activity is inferred rather than hooked, which is what keeps the app free of drivers and special privileges. Windows reports the time of the last input of any kind, so when that time moves forward while the pointer is still and no button changed, the input must have come from the keyboard. Clicks also advance that clock, which is why the check excludes them; `input-watch.tests.ps1` covers that case and seven others:

```
pwsh -NoProfile -File input-watch.tests.ps1
```

## Hiding the real arrow

Windows has no way for one application to hide the pointer everywhere, so `cursor-visibility.ps1` replaces all fourteen system cursors with a blank one, covering the arrow, the text beam, the busy cursor and the resize handles. `SystemParametersInfo` reloads them from the registry, so putting them back is a single call.

Because a stuck invisible pointer would be miserable, every path restores it:

- Turning the switch off, or turning CursorFX off, closes the helper's input, and its `finally` block restores the cursors.
- Quitting restores them again, synchronously, before the process exits.
- Starting up restores them once before anything else, which clears the state left behind if a previous run was killed outright.

If it ever does stick, signing out and back in fixes it, as does running this:

```
powershell -NoProfile -ExecutionPolicy Bypass -File cursor-visibility.ps1 -Restore
```

The switch is off by default. It is greyed out when you run the app anywhere other than Windows.
