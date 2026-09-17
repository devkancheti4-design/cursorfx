/* Applies the CursorFX settings chosen in the popup to the current page. */
(function () {
  const DEFAULTS = { enabled: true, cursor: 'ring', trail: null, click: 'ripple', sound: false };
  let started = false;
  function apply(settings) {
    const s = Object.assign({}, DEFAULTS, settings || {});
    if (!s.enabled) { if (started) { CursorFX.destroy(); started = false; } return; }
    const cfg = { cursor: s.cursor || null, trail: s.trail || null, click: s.click || null, sound: !!s.sound };
    if (!started) { CursorFX.init(cfg); started = true; } else CursorFX.set(cfg);
  }
  chrome.storage.sync.get('cursorfx', (data) => apply(data.cursorfx));
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'sync' && changes.cursorfx) apply(changes.cursorfx.newValue); });
})();
