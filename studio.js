/* CursorFX Studio: the gallery/configurator page. Uses only the public CursorFX API. */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const lists = CursorFX.list();
  const STORAGE = 'cursorfx.studio';

  const PRESETS = [
    { label: '🏎️ F1 Menagerie', config: { cursor: 'f1car', trail: null, click: 'animals', sound: true } },
    { label: '🧚 Fairy', config: { cursor: 'orb', trail: 'sparkles', click: 'butterflies', sound: false } },
    { label: '🕹️ Retro', config: { cursor: 'pixel', trail: 'rainbow', click: 'emojiburst', sound: false } },
    { label: '🎯 Shooter', config: { cursor: 'crosshair', trail: null, click: 'gunshot', sound: true } },
    { label: '🎨 Studio', config: { cursor: 'ring', trail: 'neon', click: 'ripple', sound: false } },
    { label: '🎉 Party', config: { cursor: 'emoji', trail: 'emojirain', click: 'confetti', sound: true } },
    { label: '🌸 Zen', config: { cursor: 'blob', trail: 'petals', click: 'notes', sound: true } },
    { label: '🚀 Space', config: { cursor: 'rocket', trail: 'stars', click: 'fireworks', sound: true } },
    { label: '🔦 Night', config: { cursor: 'spotlight', trail: null, click: 'shockwave', sound: false } },
    { label: '💧 Liquid', config: { cursor: 'blob', trail: null, click: 'waves', sound: true } },
  ];

  let cfg = load() || Object.assign({ options: {} }, PRESETS[0].config);
  if (!cfg.options) cfg.options = {};

  function load() {
    try { const raw = localStorage.getItem(STORAGE); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function save() {
    try { localStorage.setItem(STORAGE, JSON.stringify(cfg)); } catch (e) { /* private mode */ }
  }

  function card(kind, item) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'card';
    b.dataset.kind = kind;
    b.dataset.name = item ? item.name : '';
    b.title = item ? item.description : 'Turn this layer off';
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const by = item && item.credits && item.credits.requestedBy ? '<span class="snd">by ' + esc(item.credits.requestedBy) + '</span>' : '';
    b.innerHTML = '<span class="icon">' + (item ? item.icon : '∅') + '</span><span>' + (item ? esc(item.label) : 'None') + '</span>' + (item && item.sound ? '<span class="snd">🔊 sound</span>' : '') + by;
    if (item && item.credits && item.credits.requestedBy) b.title += ' — requested by ' + item.credits.requestedBy + (item.credits.builtBy ? ', built by ' + item.credits.builtBy : '');
    b.addEventListener('click', () => { cfg[kind] = item ? item.name : null; apply(); });
    return b;
  }

  function renderGrids() {
    [['cursor', '#cursors'], ['trail', '#trails'], ['click', '#clicks']].forEach(([kind, sel]) => {
      const el = $(sel);
      el.innerHTML = '';
      el.appendChild(card(kind, null));
      lists[kind].forEach((item) => el.appendChild(card(kind, item)));
    });
    const p = $('#presets');
    p.innerHTML = '';
    PRESETS.forEach((pr) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.textContent = pr.label;
      b.addEventListener('click', () => { cfg = Object.assign({ options: cfg.options }, pr.config); apply(); });
      p.appendChild(b);
    });
  }

  function markActive() {
    document.querySelectorAll('.card').forEach((c) => {
      c.classList.toggle('active', (cfg[c.dataset.kind] || '') === c.dataset.name);
    });
    $('#sound').checked = !!cfg.sound;
  }

  function optionInput(name, key, value) {
    const wrap = document.createElement('div');
    wrap.className = 'opt';
    const label = document.createElement('label');
    label.textContent = key;
    label.title = key;
    let input;
    const current = cfg.options[name] && cfg.options[name][key] !== undefined ? cfg.options[name][key] : value;
    if (typeof value === 'boolean') {
      input = document.createElement('input'); input.type = 'checkbox'; input.checked = !!current;
    } else if (typeof value === 'number') {
      input = document.createElement('input'); input.type = 'number'; input.step = 'any'; input.value = current;
    } else if (Array.isArray(value)) {
      input = document.createElement('input'); input.type = 'text'; input.value = current.join(' ');
      input.placeholder = 'space separated';
    } else if (typeof value === 'string' || value === null) {
      input = document.createElement('input'); input.type = 'text'; input.value = current == null ? '' : current;
    } else {
      return null;
    }
    input.addEventListener('change', () => {
      let v;
      if (input.type === 'checkbox') v = input.checked;
      else if (input.type === 'number') v = input.value === '' ? value : Number(input.value);
      else if (Array.isArray(value)) v = input.value.trim() ? Array.from(input.value.trim().split(/\s+/)) : value;
      else v = input.value === '' ? value : input.value;
      cfg.options[name] = Object.assign({}, cfg.options[name] || {}, { [key]: v });
      apply();
    });
    wrap.appendChild(label);
    wrap.appendChild(input);
    return wrap;
  }

  function renderOptions() {
    const el = $('#options');
    el.innerHTML = '';
    let any = false;
    ['cursor', 'trail', 'click'].forEach((kind) => {
      const name = cfg[kind];
      if (!name) return;
      const def = lists[kind].find((d) => d.name === name);
      if (!def) return;
      const keys = Object.keys(def.defaults || {}).filter((k) => typeof def.defaults[k] !== 'object' || Array.isArray(def.defaults[k]) || def.defaults[k] === null);
      if (!keys.length) return;
      const title = document.createElement('div');
      title.className = 'opt-group';
      title.textContent = def.icon + ' ' + def.label;
      el.appendChild(title);
      keys.forEach((k) => { const row = optionInput(name, k, def.defaults[k]); if (row) { el.appendChild(row); any = true; } });
    });
    if (!any) { const p = document.createElement('div'); p.className = 'opt-empty'; p.textContent = 'Nothing to tweak for this combination.'; el.appendChild(p); }
  }

  function embedSnippet() {
    const c = { cursor: cfg.cursor, trail: cfg.trail, click: cfg.click, sound: !!cfg.sound };
    const opts = {};
    [cfg.cursor, cfg.trail, cfg.click].forEach((n) => { if (n && cfg.options[n] && Object.keys(cfg.options[n]).length) opts[n] = cfg.options[n]; });
    if (Object.keys(opts).length) c.options = opts;
    return '<script src="https://cdn.jsdelivr.net/gh/devkancheti4-design/cursorfx@main/dist/cursorfx.js"></' + 'script>\n<script>CursorFX.init(' + JSON.stringify(c) + ');</' + 'script>';
  }

  function apply() {
    CursorFX.set({ cursor: cfg.cursor, trail: cfg.trail, click: cfg.click, sound: !!cfg.sound, options: cfg.options });
    save();
    markActive();
    renderOptions();
    $('#embed').textContent = embedSnippet();
  }

  function shuffle(kind) {
    const pool = lists[kind].map((d) => d.name).filter((n) => n !== cfg[kind]);
    cfg[kind] = pool[Math.floor(Math.random() * pool.length)];
    apply();
  }

  $('#sound').addEventListener('change', (e) => { cfg.sound = e.target.checked; apply(); });
  $('#rand-cursor').addEventListener('click', () => shuffle('cursor'));
  $('#rand-trail').addEventListener('click', () => shuffle('trail'));
  $('#rand-click').addEventListener('click', () => shuffle('click'));
  $('#random').addEventListener('click', () => { shuffle('cursor'); shuffle('trail'); shuffle('click'); });
  $('#reset').addEventListener('click', () => { cfg = Object.assign({ options: {} }, PRESETS[0].config); apply(); });
  $('#copy').addEventListener('click', () => {
    const text = $('#embed').textContent;
    const done = () => { $('#copy').textContent = 'copied!'; setTimeout(() => { $('#copy').textContent = 'copy'; }, 1200); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, done); else done();
  });

  const panel = $('#panel'), toggle = $('#toggle');
  function setPanel(open) {
    panel.classList.toggle('hidden', !open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.textContent = open ? 'Hide' : 'Studio';
  }
  toggle.addEventListener('click', () => setPanel(panel.classList.contains('hidden')));
  window.addEventListener('keydown', (e) => {
    if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.key === 'h' || e.key === 'H') setPanel(panel.classList.contains('hidden'));
    if (e.key === ' ' || e.key === 'Enter') { if (e.target && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'A') { e.preventDefault(); CursorFX.trigger(); } }
  });
  document.querySelectorAll('.actions a[href="#"]').forEach((a) => a.addEventListener('click', (e) => e.preventDefault()));

  // Live readout for cursors that publish telemetry (the F1 car).
  const meta = $('#meta');
  (function tick() {
    const m = CursorFX.state.meta;
    if (m) { meta.hidden = false; $('#kmh').textContent = m.kmh; $('#gear').textContent = m.gear; } else meta.hidden = true;
    requestAnimationFrame(tick);
  })();

  renderGrids();
  CursorFX.init({ cursor: cfg.cursor, trail: cfg.trail, click: cfg.click, sound: !!cfg.sound, options: cfg.options });
  markActive();
  renderOptions();
  $('#embed').textContent = embedSnippet();
  if (window.innerWidth < 900) setPanel(false);
})();
