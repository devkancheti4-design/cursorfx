# Contributing to CursorFX

## Request an effect and get credited

You do not need to write code to shape this library.

1. Open a [request issue](../../issues/new?template=effect_request.yml) (or reply on the Reddit/community thread): what kind of plugin, a name, what it should look, move and sound like, and any references.
2. Requests are built in the order that they are clear, doable on a 2D canvas, and fun. Anything that copies a trademarked character or asset is skipped.
3. When it ships, the plugin carries a `credits` field with your name. That name shows on the effect's card in the studio, in `CursorFX.list()`, and in [CREDITS.md](CREDITS.md). You are the creator of record for that effect.

Example of what the registered plugin looks like:

```js
CursorFX.registerClick('koi', {
  label: 'Koi fish', icon: '🐟',
  description: 'Koi swim out of the click and circle away.',
  credits: { requestedBy: 'u/pondlover', builtBy: 'CursorFX' },
  ...
});
```

## Build a plugin yourself

1. Copy any file in `src/cursors`, `src/trails` or `src/clicks` and rename it.
2. Register it with a unique name, a `label`, `icon`, `description`, `defaults`, and a `create(opts, api)` that returns `update` and `render` (plus `trigger` for click effects).
3. Run `./build.sh` (or `npm run build`) and open `index.html` through any static server. Your plugin appears in the studio automatically.
4. Keep motion scaled by `f` (frame factor) so it looks the same at 60 and 120 Hz, respect `state.reduceMotion`, and make sounds through `api.audio` so they obey the sound toggle.
5. Open a pull request with a short GIF or screenshot.

## Ground rules

- Zero dependencies, plain JavaScript, no build tooling beyond `build.sh`.
- Effects must not capture pointer events or block the page underneath.
- Nothing that phones home. No analytics, no remote assets.
