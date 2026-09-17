# CursorFX

**Your cursor, but alive.** Mix and match a custom cursor model, a movement trail and a click effect, with optional synthesised sound, and drop it on any website with one script tag. Zero dependencies, plain JavaScript, one 2D canvas.

> 13 cursor models · 9 trails · 16 click effects · sound that is synthesised in the browser, no audio files

[Live studio](https://devkancheti4-design.github.io/cursorfx/) · [Browser extension](#browser-extension) · [Write a plugin](#write-your-own-plugin)

## Quick start

```html
<script src="https://cdn.jsdelivr.net/gh/devkancheti4-design/cursorfx@main/dist/cursorfx.js"></script>
<script>
  CursorFX.init({ cursor: 'f1car', trail: null, click: 'animals', sound: true });
</script>
```

Or download `dist/cursorfx.js` and serve it yourself. The studio page (`index.html`) lets you pick a combination, tweak options, and copies the exact snippet for you.

## Catalog

### Cursor models (what replaces the pointer)

| name | | what it does | sound |
| --- | --- | --- | --- |
| `f1car` | 🏎️ | An F1 car that steers with your pointer. Synthesised V10 engine with an 8-speed gearbox, upshift cracks, backfires, tyre smoke and exhaust flames. Hold to boost. | yes |
| `orb` | ✨ | Glowing orb with a rainbow comet tail and a ring that pulses on click. | |
| `ring` | ◎ | The modern dot-and-ring cursor. The ring lags, grows over links and shrinks on click. | |
| `ghost` | 👻 | A ghost floats after the pointer, its eyes follow your movement, and it leaves fading echoes. | |
| `emoji` | 🐱 | Any emoji on a spring: it bounces, tilts and stretches. | |
| `spotlight` | 🔦 | Dims the page except a soft circle of light around the pointer. | |
| `blob` | 🫧 | A gooey blob that stretches with velocity and drags droplets. | |
| `ribbon` | 🎀 | A silk ribbon that twists and narrows behind the pointer. | |
| `rocket` | 🚀 | A rocket that turns to follow movement, with a flame that grows with speed. | thruster |
| `crosshair` | ✚ | A shooting reticle with guide lines and live x/y coordinates. Blooms and kicks with recoil when you fire. | |
| `clock` | 🕰️ | A working analog clock follows the pointer. | |
| `textflag` | 🏁 | Your words trail behind the pointer and wave like a flag. | |
| `pixel` | 🕹️ | A chunky 8-bit arrow. | |

### Trails (emitted while the pointer moves)

| name | | what it does |
| --- | --- | --- |
| `sparkles` | ✨ | Fairy dust: twinkling four-point sparkles drift down. |
| `rainbow` | 🌈 | Seven-band rainbow ribbon. |
| `bubbles` | 🫧 | Soap bubbles rise and pop. |
| `emojirain` | 😂 | Your emoji tumble out and fall. |
| `snow` | ❄️ | Snowflakes drift and sway. |
| `petals` | 🌸 | Cherry-blossom petals flutter down. |
| `fire` | 🔥 | Flames lick behind the pointer, hotter as you speed up. |
| `stars` | ⭐ | Golden stars twinkle along the path. |
| `neon` | 💡 | A glowing neon tube traces your path and fades. |

### Click effects (burst on every click or tap)

| name | | what it does | sound |
| --- | --- | --- | --- |
| `animals` | 🦊 | Particles explode and reassemble into a different animal each click. Move through it to push the particles aside. | whoosh |
| `gunshot` | 🎯 | Fires a shot: muzzle flash, sparks, smoke, an ejected casing and a cracked bullet hole that fades away after a few seconds. Hold to keep firing. Pairs with the `crosshair` cursor, which blooms and kicks with recoil. | bang |
| `waves` | 🌊 | The page itself ripples: real content bends and refracts outward from the click (backdrop-filter displacement, Chromium; rings elsewhere). `style: 'jelly'` wobbles the whole page. | drip |
| `ripple` | 〰️ | Concentric water rings drawn on top. | drip |
| `butterflies` | 🦋 | A flock of butterflies flutters out and flies away. | flutter |
| `fireworks` | 🎆 | A rocket streaks up and bursts into sparks. | launch + bang |
| `hearts` | ❤️ | Hearts float up and sway. | blip |
| `confetti` | 🎉 | A confetti cannon with tumbling paper. | pop |
| `bubbles` | 🫧 | A cloud of bubbles rises and pops one by one. | pops |
| `stars` | 🌟 | Spinning golden stars with a chime. | chime |
| `ink` | 🖌️ | An ink splat that spreads and drips. | splat |
| `shockwave` | 💥 | A flash, an expanding ring and flying sparks. | boom |
| `emojiburst` | 🎊 | A burst of your chosen emoji. | pop |
| `textburst` | 💬 | Comic-book words: POW! BOOM! WOW! | zap |
| `birds` | 🐦 | A flock takes flight and scatters. | chirp |
| `notes` | 🎵 | Music notes float up; each click plays a pentatonic note, so clicking becomes a melody. | note |

Any layer can be `null` to turn it off. Sound is off unless you pass `sound: true`, and browsers only start audio after the first click or key press.

## Download

No npm needed. Grab `dist/cursorfx.js` (the whole library in one file) or `dist/cursorfx-extension.zip` (the browser extension) from the studio's Download row or from the Releases page, or clone the repo. The studio page works when opened straight from a downloaded folder, because everything is plain scripts.

## Request an effect, get credited

Open a [request issue](../../issues/new?template=effect_request.yml) describing the cursor, trail or click effect you want. When it is built, the plugin ships with a `credits` field carrying your name, which shows on its card in the studio and in [CREDITS.md](CREDITS.md). Details in [CONTRIBUTING.md](CONTRIBUTING.md).

## API

```js
CursorFX.init(config)     // start; safe to call before DOM is ready
CursorFX.set(config)      // change any part of the config on the fly
CursorFX.destroy()        // remove the canvas, listeners and audio
CursorFX.list()           // { cursor: [...], trail: [...], click: [...] } with labels, icons, descriptions, defaults
CursorFX.trigger(x, y)    // fire the click effect programmatically (defaults to the pointer position)
CursorFX.getConfig()
```

Config:

```js
{
  cursor: 'ring',           // cursor model name or null
  trail: 'sparkles',        // trail name or null
  click: 'ripple',          // click effect name or null
  sound: false,             // enable synthesised sound
  volume: 0.8,
  hideNative: true,         // hide the OS cursor while a cursor model is active
  zIndex: 2147483646,
  options: {                // per-plugin options, keyed by plugin name
    emoji: { emoji: '🦄', size: 44 },
    textflag: { text: 'HELLO WORLD' },
    animals: { animals: ['🐙', '🦕'], dissolveAfter: 0 },
  },
}
```

Add `data-cursorfx-ignore` to any element to stop clicks inside it from firing the click effect (the studio panel uses this). Add `data-cursor="pointer"` to make a non-interactive element count as hoverable for cursors that react to links and buttons.

## Write your own plugin

Every plugin is a small object with a `create` function that returns `update` and `render` hooks. Register it after loading the bundle, then use its name in the config.

```js
CursorFX.registerClick('smiley', {
  label: 'Smiley', icon: '🙂', description: 'A smiley pops out of every click.',
  defaults: { size: 40 },
  create(opts, api) {
    const { state, util, audio } = api;
    const list = util.particleList();
    return {
      trigger(x, y) {
        list.add({ x, y, vy: -3, life: 60, max: 60 });
        audio.tone({ freq: 880, dur: 0.2 });          // silently ignored when sound is off
      },
      update(f) { list.step(f, (p) => { p.y += p.vy * f; p.vy += 0.1 * f; }); },
      render(g) {
        list.items.forEach((p) => util.drawSprite(g, util.sprite('🙂', opts.size), p.x, p.y, 1, 0, p.life / p.max));
      },
    };
  },
});
CursorFX.set({ click: 'smiley' });
```

- `state` gives you the pointer: `x, y, vx, vy, speed, heading, down, hover, seen, inside, w, h, time, reduceMotion`.
- `util` has `rand, pick, clamp, lerp, hsla, rrect, star, heart, sprite, drawSprite, samplePoints, particleList`.
- `audio` has `pop, tone, whoosh` (all no-ops when sound is off or not yet unlocked), plus `get()` for a raw `AudioContext` and `bus()` to connect your own nodes.
- Frame values are in per-frame units at 60 fps; scale motion by `f` so it looks the same at 120 Hz.
- Cursors use `update/render` plus optional `onEnter`, `onDown`, `onUp`. Trails use `update/render`. Click effects add `trigger(x, y, event)`.

Optional metadata: `credits: { requestedBy: 'u/name', builtBy: 'you' }` is shown on the plugin's card and returned by `CursorFX.list()`.

Plugins live in `src/cursors`, `src/trails` and `src/clicks`. Run `npm run build` to rebundle `dist/cursorfx.js` and the extension zip.

## Browser extension

The `extension/` folder is a Manifest V3 extension that runs CursorFX on every page you visit. Load it unpacked from `chrome://extensions` (Chrome, Edge, Brave, Arc) and pick your cursor, trail, click effect and sound from the toolbar popup. Settings sync through your browser profile.

## Development

```bash
npm run build      # bundle src/ into dist/cursorfx.js and copy it into extension/
npm start          # serve the studio at http://localhost:8765
```

There is no build tooling to install. Plugins are plain scripts that register themselves, so you can also load `src/core.js` and individual plugin files directly.

## Accessibility and performance

- Respects `prefers-reduced-motion`: particle counts are halved and bursts softened.
- One overlay canvas with `pointer-events: none`, so the page underneath stays fully interactive.
- Particles are pooled and drawn with cached sprites; the animals effect batches thousands of dots per frame.
- Sound is synthesised with the Web Audio API and unlocked by the first user gesture, per browser policy.

## License

MIT.
