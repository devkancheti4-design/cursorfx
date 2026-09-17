/*! CursorFX 0.1.0 | MIT | https://github.com/devkancheti4-design/cursorfx */
/*! CursorFX core — transparent overlay canvas, pointer state, plugin registry, optional synth audio. MIT. */
(function (global) {
  'use strict';
  if (global.CursorFX) return;

  const TAU = Math.PI * 2;
  const reduceMotion = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ---------- utilities shared with plugins ----------

  const spriteCache = new Map();
  const util = {
    TAU,
    clamp: (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v),
    rand: (a, b) => a + Math.random() * (b - a),
    randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
    lerp: (a, b, t) => a + (b - a) * t,
    ease: (k, f) => Math.min(1, k * f),
    decay: (d, f) => Math.pow(d, f),
    hsla: (h, s, l, a) => 'hsla(' + h + ',' + s + '%,' + l + '%,' + (a == null ? 1 : a) + ')',
    rrect(g, x, y, w, h, r) {
      g.beginPath();
      g.moveTo(x + r, y);
      g.lineTo(x + w - r, y);
      g.quadraticCurveTo(x + w, y, x + w, y + r);
      g.lineTo(x + w, y + h - r);
      g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      g.lineTo(x + r, y + h);
      g.quadraticCurveTo(x, y + h, x, y + h - r);
      g.lineTo(x, y + r);
      g.quadraticCurveTo(x, y, x + r, y);
      g.closePath();
    },
    // Cached bitmap of an emoji or short text so particles can drawImage instead of fillText.
    sprite(text, size, opts) {
      opts = opts || {};
      const key = text + '|' + size + '|' + (opts.font || '') + '|' + (opts.color || '');
      let s = spriteCache.get(key);
      if (s) return s;
      const dpr = Math.min(global.devicePixelRatio || 1, 2);
      const pad = Math.ceil(size * 0.25);
      const c = document.createElement('canvas');
      const cg = c.getContext('2d');
      cg.font = (opts.font || (size + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'));
      const w = Math.ceil(cg.measureText(text).width) + pad * 2;
      const h = Math.ceil(size * 1.3) + pad * 2;
      c.width = Math.ceil(w * dpr);
      c.height = Math.ceil(h * dpr);
      cg.scale(dpr, dpr);
      cg.font = (opts.font || (size + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'));
      cg.textAlign = 'center';
      cg.textBaseline = 'middle';
      cg.fillStyle = opts.color || '#fff';
      cg.fillText(text, w / 2, h / 2);
      s = { canvas: c, w, h };
      spriteCache.set(key, s);
      return s;
    },
    drawSprite(g, sprite, x, y, scale, angle, alpha) {
      g.save();
      g.translate(x, y);
      if (angle) g.rotate(angle);
      if (scale !== 1) g.scale(scale, scale);
      if (alpha != null) g.globalAlpha = Math.max(0, Math.min(1, alpha));
      g.drawImage(sprite.canvas, -sprite.w / 2, -sprite.h / 2, sprite.w, sprite.h);
      g.restore();
    },
    // Sample the opaque pixels of an emoji/text glyph as points with colours (for particle shapes).
    samplePoints(text, size, step, opts) {
      opts = opts || {};
      const S = Math.ceil(size * 1.3);
      const c = document.createElement('canvas');
      c.width = S; c.height = S;
      const cg = c.getContext('2d', { willReadFrequently: true });
      cg.textAlign = 'center';
      cg.textBaseline = 'middle';
      cg.font = opts.font || (size + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif');
      if (opts.color) cg.fillStyle = opts.color;
      cg.fillText(text, S / 2, S / 2);
      const data = cg.getImageData(0, 0, S, S).data;
      const xs = [], ys = [], cols = [];
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let y = 0; y < S; y += step) {
        for (let x = 0; x < S; x += step) {
          const i = (y * S + x) * 4;
          if (data[i + 3] < 140) continue;
          xs.push(x); ys.push(y); cols.push([data[i], data[i + 1], data[i + 2]]);
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
      const n = xs.length;
      if (!n) return { count: 0, xs: [], ys: [], cols: [], halfW: 0, halfH: 0 };
      const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      for (let k = 0; k < n; k++) { xs[k] -= cx; ys[k] -= cy; }
      return { count: n, xs, ys, cols, halfW: (maxX - minX) / 2, halfH: (maxY - minY) / 2 };
    },
  };

  // ---------- pointer / frame state ----------

  const state = {
    x: -1000, y: -1000, lastX: -1000, lastY: -1000,
    vx: 0, vy: 0, speed: 0, heading: 0,
    down: false, downIgnored: false, seen: false, inside: true, hover: false,
    w: 0, h: 0, dpr: 1, time: 0, dt: 0, f: 1, idle: 0,
    reduceMotion,
  };

  // ---------- audio (optional, synthesised, unlocked by the first gesture) ----------

  const audio = {
    ctx: null, master: null, noise: null,
    enabled() { return !!config.sound; },
    // Returns a running AudioContext when sound is enabled and unlocked, otherwise null.
    get() { return config.sound && this.ctx && this.ctx.state === 'running' ? this.ctx : null; },
    bus() { return this.master; },
    unlock() {
      if (!config.sound) return;
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return;
      if (!this.ctx) {
        const c = new AC();
        const master = c.createGain();
        master.gain.value = 0;
        const comp = c.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.ratio.value = 4;
        comp.connect(master).connect(c.destination);
        this.ctx = c;
        this.master = comp;
        this._out = master;
        const len = Math.floor(c.sampleRate * 2);
        const buf = c.createBuffer(1, len, c.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.noise = buf;
      }
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
      this._out.gain.setTargetAtTime(config.volume == null ? 0.8 : config.volume, this.ctx.currentTime, 0.1);
    },
    mute() {
      if (this.ctx && this._out) this._out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    },
    // Short noise burst through a band-pass: pops, cracks, bubbles.
    pop(o) {
      const c = this.get(); if (!c) return;
      o = o || {};
      const t = c.currentTime;
      const src = c.createBufferSource();
      src.buffer = this.noise;
      const bp = c.createBiquadFilter();
      bp.type = o.type || 'bandpass';
      bp.frequency.value = o.freq || 1200;
      bp.Q.value = o.q == null ? 1.5 : o.q;
      const gn = c.createGain();
      const peak = o.peak == null ? 0.5 : o.peak;
      const dur = o.dur == null ? 0.1 : o.dur;
      gn.gain.setValueAtTime(0.0001, t);
      gn.gain.exponentialRampToValueAtTime(peak, t + (o.attack || 0.004));
      gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(bp).connect(gn).connect(this.master);
      src.start(t, Math.random() * 1.5);
      src.stop(t + dur + 0.1);
    },
    // Pitched tone with an envelope: chimes, blips, notes.
    tone(o) {
      const c = this.get(); if (!c) return;
      o = o || {};
      const t = c.currentTime;
      const osc = c.createOscillator();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(o.freq || 660, t);
      if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t + (o.dur || 0.3));
      const gn = c.createGain();
      const peak = o.peak == null ? 0.25 : o.peak;
      const dur = o.dur == null ? 0.3 : o.dur;
      gn.gain.setValueAtTime(0.0001, t);
      gn.gain.exponentialRampToValueAtTime(peak, t + (o.attack || 0.01));
      gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gn).connect(this.master);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    },
    // Filtered noise sweep: whooshes and swishes.
    whoosh(o) {
      const c = this.get(); if (!c) return;
      o = o || {};
      const t = c.currentTime;
      const src = c.createBufferSource();
      src.buffer = this.noise;
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = o.q == null ? 1.2 : o.q;
      bp.frequency.setValueAtTime(o.from || 250, t);
      bp.frequency.exponentialRampToValueAtTime(o.to || 3000, t + (o.dur || 0.35));
      const gn = c.createGain();
      const dur = o.dur == null ? 0.4 : o.dur;
      gn.gain.setValueAtTime(0.0001, t);
      gn.gain.exponentialRampToValueAtTime(o.peak == null ? 0.35 : o.peak, t + dur * 0.15);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(bp).connect(gn).connect(this.master);
      src.start(t, Math.random() * 1.5);
      src.stop(t + dur + 0.1);
    },
  };

  // ---------- registry ----------

  const registry = { cursor: new Map(), trail: new Map(), click: new Map() };

  function register(kind, name, def) {
    if (!registry[kind]) throw new Error('CursorFX: unknown plugin kind ' + kind);
    def = Object.assign({ name, kind }, def);
    registry[kind].set(name, def);
    return def;
  }

  function list(kind) {
    const out = {};
    Object.keys(registry).forEach((k) => {
      out[k] = Array.from(registry[k].values()).map((d) => ({
        name: d.name, label: d.label || d.name, icon: d.icon || '', description: d.description || '',
        sound: !!d.sound, keepNative: !!d.keepNative, defaults: Object.assign({}, d.defaults || {}),
        credits: d.credits ? Object.assign({}, d.credits) : null,
      }));
    });
    return kind ? out[kind] : out;
  }

  // ---------- engine ----------

  const config = {
    cursor: null, trail: null, click: null,
    sound: false, volume: 0.8, hideNative: true, zIndex: 2147483646, options: {},
  };
  const active = { cursor: null, trail: null, click: null };
  let canvas = null, g = null, styleEl = null, rafId = 0, last = 0, bound = false, started = false;

  function api(def, opts) {
    return { state, util, audio, config: opts, def, core: CursorFX };
  }

  function makeInstance(kind, name) {
    const def = registry[kind].get(name);
    if (!def) { console.warn('CursorFX: no ' + kind + ' plugin named "' + name + '"'); return null; }
    const opts = Object.assign({}, def.defaults || {}, config.options[name] || {});
    const inst = def.create(opts, api(def, opts)) || {};
    inst.__def = def;
    inst.__name = name;
    inst.__opts = opts;
    return inst;
  }

  function destroyInstance(kind) {
    const inst = active[kind];
    if (inst && inst.destroy) { try { inst.destroy(); } catch (e) { console.error(e); } }
    active[kind] = null;
  }

  function applyNativeCursor() {
    const cur = active.cursor;
    const hide = config.hideNative && cur && !cur.__def.keepNative;
    if (hide && !styleEl) {
      styleEl = document.createElement('style');
      styleEl.setAttribute('data-cursorfx', '');
      styleEl.textContent = 'html, html * { cursor: none !important; }';
      document.head.appendChild(styleEl);
    } else if (!hide && styleEl) {
      styleEl.remove();
      styleEl = null;
    }
  }

  function apply() {
    ['cursor', 'trail', 'click'].forEach((kind) => {
      destroyInstance(kind);
      if (config[kind]) active[kind] = makeInstance(kind, config[kind]);
    });
    applyNativeCursor();
    if (config.sound) audio.unlock(); else audio.mute();
  }

  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.setAttribute('data-cursorfx', '');
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, {
      position: 'fixed', left: '0', top: '0', width: '100vw', height: '100vh',
      pointerEvents: 'none', zIndex: String(config.zIndex), display: 'block',
    });
    document.body.appendChild(canvas);
    g = canvas.getContext('2d');
    resize();
  }

  function resize() {
    if (!canvas) return;
    state.dpr = Math.min(global.devicePixelRatio || 1, 2);
    state.w = Math.max(1, global.innerWidth);
    state.h = Math.max(1, global.innerHeight);
    canvas.width = Math.round(state.w * state.dpr);
    canvas.height = Math.round(state.h * state.dpr);
    canvas.style.width = state.w + 'px';
    canvas.style.height = state.h + 'px';
    g.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ['trail', 'click', 'cursor'].forEach((k) => { const i = active[k]; if (i && i.resize) i.resize(); });
  }

  function isInteractive(el) {
    return !!(el && el.closest && el.closest('a,button,[role="button"],input,select,textarea,label,summary,[data-cursor="pointer"]'));
  }

  function setPointer(e) {
    state.x = e.clientX;
    state.y = e.clientY;
    state.inside = true;
    if (!state.seen) {
      state.seen = true;
      state.lastX = state.x;
      state.lastY = state.y;
      ['trail', 'click', 'cursor'].forEach((k) => { const i = active[k]; if (i && i.onEnter) i.onEnter(); });
    }
    state.hover = isInteractive(e.target);
  }

  function onMove(e) { setPointer(e); }
  function onDown(e) {
    setPointer(e);
    state.down = true;
    state.downIgnored = !!(e.target && e.target.closest && e.target.closest('[data-cursorfx-ignore]'));
    audio.unlock();
    if (state.downIgnored) return;
    if (active.cursor && active.cursor.onDown) active.cursor.onDown(e);
    if (active.click && active.click.trigger) active.click.trigger(e.clientX, e.clientY, e);
  }
  function onUp(e) {
    state.down = false;
    state.downIgnored = false;
    if (active.cursor && active.cursor.onUp) active.cursor.onUp(e);
  }
  function onOut(e) { if (!e.relatedTarget) state.inside = false; }
  function onKey() { audio.unlock(); }
  function onVisibility() {
    if (!audio.ctx) return;
    if (document.hidden) audio.ctx.suspend().catch(() => {});
    else if (config.sound) audio.ctx.resume().catch(() => {});
  }

  function bind() {
    if (bound) return;
    bound = true;
    global.addEventListener('pointermove', onMove, { passive: true });
    global.addEventListener('pointerdown', onDown, { passive: true });
    global.addEventListener('pointerup', onUp, { passive: true });
    global.addEventListener('pointercancel', onUp, { passive: true });
    global.addEventListener('keydown', onKey, { passive: true });
    global.addEventListener('resize', resize);
    document.addEventListener('mouseout', onOut);
    document.addEventListener('visibilitychange', onVisibility);
  }

  function unbind() {
    if (!bound) return;
    bound = false;
    global.removeEventListener('pointermove', onMove);
    global.removeEventListener('pointerdown', onDown);
    global.removeEventListener('pointerup', onUp);
    global.removeEventListener('pointercancel', onUp);
    global.removeEventListener('keydown', onKey);
    global.removeEventListener('resize', resize);
    document.removeEventListener('mouseout', onOut);
    document.removeEventListener('visibilitychange', onVisibility);
  }

  function frame(now) {
    rafId = global.requestAnimationFrame(frame);
    if (!last) { last = now; return; }
    let dt = (now - last) / 1000;
    last = now;
    if (dt <= 0) return;
    if (dt > 1 / 20) dt = 1 / 20;
    const f = dt * 60;
    state.dt = dt;
    state.f = f;
    state.time += dt;

    const dx = state.x - state.lastX, dy = state.y - state.lastY;
    state.lastX = state.x;
    state.lastY = state.y;
    const inst = Math.hypot(dx, dy) / f;
    state.vx += (dx / f - state.vx) * Math.min(1, 0.5 * f);
    state.vy += (dy / f - state.vy) * Math.min(1, 0.5 * f);
    state.speed += (inst - state.speed) * Math.min(1, 0.3 * f);
    if (inst > 0.4) {
      const target = Math.atan2(dy, dx);
      let d = target - state.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      state.heading += d * Math.min(1, 0.3 * f);
    }
    state.idle = inst > 0.2 ? 0 : state.idle + dt;

    g.clearRect(0, 0, state.w, state.h);
    for (let k = 0; k < 3; k++) {
      const i = active[k === 0 ? 'trail' : k === 1 ? 'click' : 'cursor'];
      if (!i) continue;
      try {
        if (i.update) i.update(f, dt);
        if (i.render) { g.save(); i.render(g); g.restore(); }
      } catch (err) {
        console.error('CursorFX plugin error in ' + i.__name, err);
        destroyInstance(k === 0 ? 'trail' : k === 1 ? 'click' : 'cursor');
      }
    }
  }

  function start() {
    if (started) return;
    started = true;
    last = 0;
    rafId = global.requestAnimationFrame(frame);
  }

  // ---------- public API ----------

  function merge(cfg) {
    if (!cfg) return;
    Object.keys(cfg).forEach((k) => {
      if (k === 'options') config.options = Object.assign({}, config.options, cfg.options || {});
      else config[k] = cfg[k];
    });
  }

  const CursorFX = {
    version: '0.1.0',
    state, util, audio, register, list,
    registerCursor: (n, d) => register('cursor', n, d),
    registerTrail: (n, d) => register('trail', n, d),
    registerClick: (n, d) => register('click', n, d),
    init(cfg) {
      merge(cfg);
      const boot = () => { ensureCanvas(); bind(); apply(); start(); };
      if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot, { once: true });
      return CursorFX;
    },
    set(cfg) {
      merge(cfg);
      if (canvas) apply();
      return CursorFX;
    },
    getConfig() { return JSON.parse(JSON.stringify(config)); },
    trigger(x, y) {
      if (active.click && active.click.trigger) active.click.trigger(x == null ? state.x : x, y == null ? state.y : y, null);
    },
    destroy() {
      if (rafId) global.cancelAnimationFrame(rafId);
      rafId = 0; started = false;
      ['cursor', 'trail', 'click'].forEach(destroyInstance);
      unbind();
      if (canvas) { canvas.remove(); canvas = null; g = null; }
      if (styleEl) { styleEl.remove(); styleEl = null; }
      if (audio.ctx) { audio.ctx.close().catch(() => {}); audio.ctx = null; audio.master = null; }
    },
  };

  global.CursorFX = CursorFX;
})(window);
/* Shared helper for movement trails: a small particle list with a common update loop. */
CursorFX.util.particleList = function () {
  const items = [];
  return {
    items,
    add(p) { items.push(p); return p; },
    cap(n) { if (items.length > n) items.splice(0, items.length - n); },
    step(f, fn) {
      for (let i = items.length - 1; i >= 0; i--) {
        const p = items[i];
        p.life -= f;
        if (p.life <= 0) { items[i] = items[items.length - 1]; items.pop(); continue; }
        fn(p, f);
      }
    },
    clear() { items.length = 0; },
  };
};
CursorFX.util.star = function (g, x, y, r, points, inner, rot) {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? r : r * inner;
    const a = (i / (points * 2)) * Math.PI * 2 + (rot || 0) - Math.PI / 2;
    if (i === 0) g.moveTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    else g.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  g.closePath();
};
CursorFX.util.heart = function (g, x, y, s) {
  g.beginPath();
  g.moveTo(x, y + s * 0.35);
  g.bezierCurveTo(x, y, x - s * 0.5, y - s * 0.1, x - s * 0.5, y - s * 0.35);
  g.bezierCurveTo(x - s * 0.5, y - s * 0.6, x - s * 0.15, y - s * 0.65, x, y - s * 0.4);
  g.bezierCurveTo(x + s * 0.15, y - s * 0.65, x + s * 0.5, y - s * 0.6, x + s * 0.5, y - s * 0.35);
  g.bezierCurveTo(x + s * 0.5, y - s * 0.1, x, y, x, y + s * 0.35);
  g.closePath();
};

/* ---- src/cursors/blob.js ---- */
/* Cursor: a gooey blob that stretches with velocity and drags a few droplets. */
CursorFX.registerCursor('blob', {
  label: 'Gooey blob',
  icon: '🫧',
  description: 'A soft blob that stretches along your movement, grows over links and squashes when you click.',
  defaults: { color: '#7c5cff', size: 20, droplets: 4 },
  create(opts, api) {
    const { state, util } = api;
    const { TAU } = util;
    const pts = [];
    for (let i = 0; i <= opts.droplets; i++) pts.push({ x: 0, y: 0 });
    let size = opts.size;
    return {
      onEnter() { pts.forEach((p) => { p.x = state.x; p.y = state.y; }); },
      update(f) {
        const k0 = Math.min(1, 0.35 * f), k = Math.min(1, 0.3 * f);
        pts[0].x += (state.x - pts[0].x) * k0; pts[0].y += (state.y - pts[0].y) * k0;
        for (let i = 1; i < pts.length; i++) { pts[i].x += (pts[i - 1].x - pts[i].x) * k; pts[i].y += (pts[i - 1].y - pts[i].y) * k; }
        const target = opts.size * (state.hover ? 1.7 : 1) * (state.down ? 0.75 : 1);
        size += (target - size) * Math.min(1, 0.2 * f);
      },
      render(g) {
        if (!state.seen) return;
        g.fillStyle = opts.color;
        g.globalAlpha = state.hover ? 0.6 : 0.92;
        for (let i = pts.length - 1; i >= 1; i--) {
          const r = size * (1 - i / (pts.length + 1)) * 0.7;
          g.beginPath(); g.arc(pts[i].x, pts[i].y, r, 0, TAU); g.fill();
        }
        const stretch = 1 + util.clamp(state.speed * 0.03, 0, 0.6);
        g.translate(pts[0].x, pts[0].y);
        g.rotate(state.heading);
        g.beginPath(); g.ellipse(0, 0, size * stretch, size / Math.sqrt(stretch), 0, 0, TAU); g.fill();
        g.globalAlpha = 0.5;
        g.fillStyle = '#ffffff';
        g.beginPath(); g.ellipse(-size * 0.25, -size * 0.3, size * 0.28, size * 0.16, -0.5, 0, TAU); g.fill();
      },
    };
  },
});

/* ---- src/cursors/clock.js ---- */
/* Cursor: a working analog clock that follows the pointer. */
CursorFX.registerCursor('clock', {
  label: 'Clock',
  icon: '🕰️',
  description: 'A small analog clock showing the real time floats after your pointer.',
  defaults: { size: 44, color: '#ffffff', face: 'rgba(20,24,40,0.85)', accent: '#ff5252' },
  create(opts, api) {
    const { state, util } = api;
    const { TAU } = util;
    const p = { x: 0, y: 0 };
    return {
      onEnter() { p.x = state.x; p.y = state.y; },
      update(f) { const k = Math.min(1, 0.25 * f); p.x += (state.x - p.x) * k; p.y += (state.y - p.y) * k; },
      render(g) {
        if (!state.seen) return;
        const R = opts.size / 2, d = new Date();
        const s = d.getSeconds() + d.getMilliseconds() / 1000, m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60;
        g.translate(p.x + R + 8, p.y + R + 8);
        g.fillStyle = opts.face; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
        g.strokeStyle = opts.color; g.lineWidth = 2; g.stroke();
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * TAU, big = i % 3 === 0;
          g.lineWidth = big ? 2 : 1;
          g.beginPath(); g.moveTo(Math.cos(a) * (R - (big ? 7 : 4)), Math.sin(a) * (R - (big ? 7 : 4))); g.lineTo(Math.cos(a) * (R - 2), Math.sin(a) * (R - 2)); g.stroke();
        }
        const hand = (val, total, len, w, col) => {
          const a = (val / total) * TAU - Math.PI / 2;
          g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round';
          g.beginPath(); g.moveTo(-Math.cos(a) * 3, -Math.sin(a) * 3); g.lineTo(Math.cos(a) * len, Math.sin(a) * len); g.stroke();
        };
        hand(h, 12, R * 0.5, 3, opts.color); hand(m, 60, R * 0.72, 2, opts.color); hand(s, 60, R * 0.8, 1, opts.accent);
        g.fillStyle = opts.accent; g.beginPath(); g.arc(0, 0, 2, 0, TAU); g.fill();
        g.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
        g.fillStyle = opts.color; g.beginPath(); g.arc(state.x, state.y, 3, 0, TAU); g.fill();
      },
    };
  },
});

/* ---- src/cursors/crosshair.js ---- */
/* Cursor: full-screen crosshair with live coordinates, like a design or mapping tool. */
CursorFX.registerCursor('crosshair', {
  label: 'Crosshair',
  icon: '✚',
  description: 'A shooting reticle with full-width guide lines and live x/y coordinates. It blooms and kicks with recoil when you fire; pair it with the Gunshot click effect.',
  defaults: { color: '#00e5ff', coords: true, dashed: true, recoil: true },
  create(opts, api) {
    const { state, util } = api;
    let r = 12, kick = 0, sinceKick = 0;
    return {
      onDown() { if (opts.recoil) { kick = 1; sinceKick = 0; } },
      update(f, dt) {
        sinceKick += dt;
        if (opts.recoil && state.down && !state.downIgnored && sinceKick > 1 / 7) { kick = 1; sinceKick = 0; }
        kick *= Math.pow(0.82, f);
        const base = state.hover ? 18 : 12;
        r += ((base + kick * 14) - r) * Math.min(1, 0.35 * f);
      },
      render(g) {
        if (!state.seen || !state.inside) return;
        const x = state.x + (Math.random() - 0.5) * kick * 3, y = state.y - kick * 6 + (Math.random() - 0.5) * kick * 3;
        g.strokeStyle = opts.color; g.lineWidth = 1; g.globalAlpha = 0.55;
        if (opts.dashed) g.setLineDash([6, 6]);
        g.beginPath(); g.moveTo(0, y); g.lineTo(x - r - 6, y); g.moveTo(x + r + 6, y); g.lineTo(state.w, y);
        g.moveTo(x, 0); g.lineTo(x, y - r - 6); g.moveTo(x, y + r + 6); g.lineTo(x, state.h); g.stroke();
        g.setLineDash([]); g.globalAlpha = 1; g.lineWidth = 1.5;
        g.beginPath(); g.arc(x, y, r, 0, util.TAU); g.stroke();
        g.beginPath(); g.moveTo(x - r - 6, y); g.lineTo(x - r + 4, y); g.moveTo(x + r - 4, y); g.lineTo(x + r + 6, y);
        g.moveTo(x, y - r - 6); g.lineTo(x, y - r + 4); g.moveTo(x, y + r - 4); g.lineTo(x, y + r + 6); g.stroke();
        g.fillStyle = opts.color; g.beginPath(); g.arc(x, y, 1.6, 0, util.TAU); g.fill();
        if (opts.coords) {
          g.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
          const label = Math.round(x) + ', ' + Math.round(y);
          const w = g.measureText(label).width + 10;
          const lx = x + 14 + w > state.w ? x - 14 - w : x + 14, ly = y + 30 > state.h ? y - 30 : y + 12;
          g.fillStyle = 'rgba(0,0,0,0.6)'; util.rrect(g, lx, ly, w, 18, 4); g.fill();
          g.fillStyle = opts.color; g.textBaseline = 'middle'; g.fillText(label, lx + 5, ly + 9);
        }
      },
    };
  },
});

/* ---- src/cursors/emoji.js ---- */
/* Cursor: any emoji on a spring, tilting and stretching with movement. */
CursorFX.registerCursor('emoji', {
  label: 'Springy emoji',
  icon: '🐱',
  description: 'Any emoji as your pointer, attached with a spring so it bounces, tilts and stretches as you move.',
  defaults: { emoji: '🐱', size: 36, stiffness: 0.12, damping: 0.78 },
  create(opts, api) {
    const { state, util } = api;
    const p = { x: 0, y: 0, vx: 0, vy: 0 };
    return {
      onEnter() { p.x = state.x; p.y = state.y; p.vx = 0; p.vy = 0; },
      update(f) {
        p.vx += (state.x - p.x) * opts.stiffness * f;
        p.vy += (state.y - p.y) * opts.stiffness * f;
        const d = Math.pow(opts.damping, f);
        p.vx *= d; p.vy *= d;
        p.x += p.vx * f; p.y += p.vy * f;
      },
      render(g) {
        if (!state.seen) return;
        const sp = util.sprite(opts.emoji, opts.size);
        const v = Math.hypot(p.vx, p.vy);
        const h = Math.atan2(p.vy, p.vx);
        const stretch = 1 + util.clamp(v * 0.02, 0, 0.35);
        g.translate(p.x, p.y);
        g.rotate(h); g.scale(stretch, 1 / stretch); g.rotate(-h);
        g.rotate(util.clamp(p.vx * 0.03, -0.5, 0.5));
        if (state.down) g.scale(0.85, 0.85);
        g.drawImage(sp.canvas, -sp.w / 2, -sp.h / 2, sp.w, sp.h);
      },
    };
  },
});

/* ---- src/cursors/f1car.js ---- */
/* Cursor: F1 car with a synthesised V10 engine, 8-speed gearbox, tyre smoke and exhaust flames. */
CursorFX.registerCursor('f1car', {
  label: 'F1 car',
  icon: '🏎️',
  description: 'A Formula 1 car that steers with your pointer. Optional V10 engine sound with gear shifts, backfires and tyre screech.',
  sound: true,
  defaults: { livery: '#d4161f', accent: '#f5f5f7', scale: 1, boostOnHold: true, engine: true },
  create(opts, api) {
    const { state, util, audio } = api;
    const { TAU, clamp, rand } = util;
    const RPM_IDLE = 0.22, FIRING_HZ_MAX = 1500;
    const GEAR_TOP = [0.25, 0.30, 0.37, 0.45, 0.55, 0.67, 0.82, 1.0];
    const car = {
      x: state.x, y: state.y, heading: 0, speed: 0, s: 0, prevS: 0, throttle: 0,
      turn: 0, steer: 0, screech: 0, gear: 0, rpm: RPM_IDLE, shiftT: 0, scale: 1,
    };
    const fxs = [];
    let engine = null;

    function distortion(k) {
      const n = 1024, curve = new Float32Array(n);
      for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; curve[i] = ((Math.PI + k) * x) / (Math.PI + k * Math.abs(x)); }
      return curve;
    }

    function buildEngine(c) {
      const bus = audio.bus();
      const nH = 40, real = new Float32Array(nH + 1), imag = new Float32Array(nH + 1);
      for (let n = 1; n <= nH; n++) imag[n] = (1 / Math.pow(n, 0.75)) * (n % 2 === 0 ? 1 : 0.85);
      const oscA = c.createOscillator(); oscA.setPeriodicWave(c.createPeriodicWave(real, imag));
      const oscB = c.createOscillator(); oscB.type = 'sawtooth';
      const oscC = c.createOscillator(); oscC.type = 'sawtooth';
      oscA.frequency.value = RPM_IDLE * FIRING_HZ_MAX;
      oscB.frequency.value = RPM_IDLE * FIRING_HZ_MAX / 2;
      oscC.frequency.value = RPM_IDLE * FIRING_HZ_MAX / 4;
      const gA = c.createGain(); gA.gain.value = 0.7;
      const gB = c.createGain(); gB.gain.value = 0.22;
      const gC = c.createGain(); gC.gain.value = 0.09;
      const mix = c.createGain(); mix.gain.value = 0.6;
      oscA.connect(gA).connect(mix); oscB.connect(gB).connect(mix); oscC.connect(gC).connect(mix);
      const jitter = c.createBufferSource(); jitter.buffer = audio.noise; jitter.loop = true;
      const jLp = c.createBiquadFilter(); jLp.type = 'lowpass'; jLp.frequency.value = 22;
      const jG = c.createGain(); jG.gain.value = 28;
      jitter.connect(jLp).connect(jG);
      jG.connect(oscA.detune); jG.connect(oscB.detune); jG.connect(oscC.detune);
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 170;
      const r1 = c.createBiquadFilter(); r1.type = 'peaking'; r1.frequency.value = 1150; r1.Q.value = 1.8; r1.gain.value = 7;
      const r2 = c.createBiquadFilter(); r2.type = 'peaking'; r2.frequency.value = 2900; r2.Q.value = 2.4; r2.gain.value = 5;
      const sh = c.createWaveShaper(); sh.curve = distortion(48); sh.oversample = '4x';
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200; lp.Q.value = 1.2;
      const out = c.createGain(); out.gain.value = 0;
      mix.connect(hp).connect(r1).connect(r2).connect(sh).connect(lp).connect(out).connect(bus);
      const conv = c.createConvolver();
      const len = Math.floor(c.sampleRate * 1.1), ir = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.5); }
      conv.buffer = ir;
      const wet = c.createGain(); wet.gain.value = 0.16;
      out.connect(conv).connect(wet).connect(bus);
      const wind = c.createBufferSource(); wind.buffer = audio.noise; wind.loop = true;
      const wLp = c.createBiquadFilter(); wLp.type = 'lowpass'; wLp.frequency.value = 420;
      const wG = c.createGain(); wG.gain.value = 0;
      wind.connect(wLp).connect(wG).connect(bus);
      const scr = c.createBufferSource(); scr.buffer = audio.noise; scr.loop = true;
      const sBp = c.createBiquadFilter(); sBp.type = 'bandpass'; sBp.frequency.value = 1500; sBp.Q.value = 14;
      const sG = c.createGain(); sG.gain.value = 0;
      scr.connect(sBp).connect(sG).connect(bus);
      oscA.start(); oscB.start(); oscC.start();
      jitter.start(0, 0.3); wind.start(0, 0.9); scr.start(0, 1.4);
      const nodes = [oscA, oscB, oscC, jitter, wind, scr];
      return {
        update() {
          const t = c.currentTime;
          const f0 = car.rpm * FIRING_HZ_MAX;
          oscA.frequency.setTargetAtTime(f0, t, 0.02);
          oscB.frequency.setTargetAtTime(f0 / 2, t, 0.02);
          oscC.frequency.setTargetAtTime(f0 / 4, t, 0.02);
          lp.frequency.setTargetAtTime(1600 + car.rpm * 9000 + car.throttle * 1500, t, 0.03);
          r1.frequency.setTargetAtTime(900 + car.rpm * 700, t, 0.05);
          const cut = car.shiftT > 0 ? 0.12 : 1;
          const vol = (0.2 + 0.75 * car.rpm) * (0.62 + 0.38 * car.throttle) * cut;
          out.gain.setTargetAtTime(vol, t, car.shiftT > 0 ? 0.008 : 0.03);
          wG.gain.setTargetAtTime(car.s * car.s * 0.22, t, 0.08);
          sG.gain.setTargetAtTime(car.screech * 0.4, t, 0.05);
          sBp.frequency.setTargetAtTime(1300 + car.s * 900, t, 0.05);
        },
        stop() {
          out.gain.setTargetAtTime(0, c.currentTime, 0.02);
          setTimeout(() => { nodes.forEach((n) => { try { n.stop(); n.disconnect(); } catch (e) {} }); out.disconnect(); wG.disconnect(); sG.disconnect(); }, 150);
        },
      };
    }

    function crack(sharp) {
      audio.pop(sharp
        ? { freq: rand(1800, 3200), q: 1.2, peak: 0.9, dur: rand(0.05, 0.09) }
        : { freq: rand(500, 1400), q: 2, peak: rand(0.3, 0.6), dur: rand(0.08, 0.16) });
    }

    function emit(kind, x, y, vx, vy, size, life) {
      if (fxs.length >= 600) fxs.shift();
      fxs.push({ kind, x, y, vx, vy, size, life, max: life });
    }

    function exhaust(count, boost) {
      const ch = Math.cos(car.heading), sh = Math.sin(car.heading), sc = car.scale;
      for (let i = 0; i < count; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const lx = -37 * sc, ly = 6 * side * sc;
        const wx = car.x + lx * ch - ly * sh, wy = car.y + lx * sh + ly * ch;
        const sp = (2 + car.s * 5) * boost;
        emit('flame', wx, wy, -ch * sp + rand(-0.8, 0.8), -sh * sp + rand(-0.8, 0.8), rand(1.8, 3.4) * sc * boost, rand(8, 16));
      }
    }

    function update(f) {
      car.scale = opts.scale * clamp(Math.min(state.w, state.h) / 800, 0.8, 1.2);
      // The car is the cursor: it sits on the pointer, and drives (not teleports) when the pointer jumps.
      const gx = state.x - car.x, gy = state.y - car.y;
      const gap = Math.hypot(gx, gy);
      let nx = state.x, ny = state.y;
      if (gap > 1.5) {
        const maxStep = (22 + car.s * 40) * f;
        let step = gap * Math.min(1, 0.8 * f);
        if (step > maxStep) step = maxStep;
        if (step < gap) { nx = car.x + (gx / gap) * step; ny = car.y + (gy / gap) * step; }
      }
      const dx = nx - car.x, dy = ny - car.y;
      const dist = Math.hypot(dx, dy);
      car.speed += (dist / f - car.speed) * Math.min(1, 0.3 * f);
      car.x = nx; car.y = ny;
      let turn = 0;
      if (dist / f > 0.4) {
        let d = Math.atan2(dy, dx) - car.heading;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        const step = d * Math.min(1, 0.3 * f);
        car.heading += step;
        turn = step / f;
      }
      car.turn += (turn - car.turn) * Math.min(1, 0.3 * f);
      car.steer += (clamp(car.turn * 6, -0.55, 0.55) - car.steer) * Math.min(1, 0.3 * f);
      const boosting = opts.boostOnHold && state.down;
      let s = clamp(car.speed / 26, 0, 1);
      if (boosting) s = Math.min(1, s + 0.35);
      car.s += (s - car.s) * Math.min(1, 0.2 * f);
      const lat = Math.abs(car.turn) * car.speed;
      car.screech += (clamp((lat - 0.9) / 2.5, 0, 1) - car.screech) * Math.min(1, 0.25 * f);
      const accelerating = car.s > car.prevS - 0.001 && car.speed > 0.4;
      car.throttle += ((boosting || accelerating ? 1 : 0) - car.throttle) * Math.min(1, 0.2 * f);

      let rpmInGear = car.s / GEAR_TOP[car.gear];
      if (car.gear < GEAR_TOP.length - 1 && rpmInGear > 0.97) {
        car.gear++; car.shiftT = 0.07; rpmInGear = car.s / GEAR_TOP[car.gear];
        crack(true); exhaust(3, 1.3);
      } else if (car.gear > 0 && rpmInGear < 0.62) {
        car.gear--; rpmInGear = car.s / GEAR_TOP[car.gear];
        if (car.s > 0.15 && Math.random() < 0.6) crack(false);
      }
      let rpmTarget = clamp(Math.max(RPM_IDLE, rpmInGear), RPM_IDLE, 1);
      if (car.s < 0.02) rpmTarget = RPM_IDLE;
      car.rpm += (rpmTarget - car.rpm) * Math.min(1, (rpmTarget > car.rpm ? 0.4 : 0.14) * f);
      car.shiftT = Math.max(0, car.shiftT - f / 60);
      if (car.throttle < 0.5 && car.rpm > 0.45 && Math.random() < 0.12 * f) {
        crack(Math.random() < 0.3);
        if (Math.random() < 0.5) exhaust(4, 1.6);
      }
      car.prevS = car.s;

      const ch = Math.cos(car.heading), sh = Math.sin(car.heading), sc = car.scale;
      if (car.screech > 0.08 && !state.reduceMotion) {
        for (let side = -1; side <= 1; side += 2) {
          if (Math.random() > car.screech * 0.9) continue;
          const lx = -24 * sc, ly = 13 * side * sc;
          emit('smoke', car.x + lx * ch - ly * sh, car.y + lx * sh + ly * ch, rand(-0.4, 0.4) - ch * 0.6, rand(-0.4, 0.4) - sh * 0.6, rand(2, 4) * sc, rand(35, 60));
        }
      }
      if (car.s > 0.3 && !state.reduceMotion) exhaust(boosting ? 3 : car.s > 0.6 ? 2 : 1, 1);

      for (let i = fxs.length - 1; i >= 0; i--) {
        const p = fxs[i];
        p.life -= f;
        if (p.life <= 0) { fxs[i] = fxs[fxs.length - 1]; fxs.pop(); continue; }
        p.x += p.vx * f; p.y += p.vy * f;
        const d = Math.pow(p.kind === 'smoke' ? 0.93 : 0.9, f);
        p.vx *= d; p.vy *= d;
        if (p.kind === 'smoke') p.size += 0.45 * f;
      }

      if (opts.engine) {
        if (!engine && audio.get()) engine = buildEngine(audio.get());
        if (engine) engine.update();
      }
      state.meta = { kmh: Math.round(car.s * 340), gear: car.s < 0.02 ? 'N' : String(car.gear + 1), rpm: car.rpm };
    }

    function wheel(g, x, y, w, h, steer) {
      g.save(); g.translate(x, y); if (steer) g.rotate(steer);
      g.fillStyle = '#15161c'; util.rrect(g, -w / 2, -h / 2, w, h, 2.5); g.fill();
      g.fillStyle = '#3a3d48'; g.fillRect(-1.2, -h / 2, 2.4, h);
      g.restore();
    }

    function render(g) {
      if (!state.seen) return;
      // Effects first, under the car.
      for (let i = 0; i < fxs.length; i++) {
        const p = fxs[i];
        if (p.kind !== 'smoke') continue;
        g.fillStyle = 'rgba(175,178,190,' + ((p.life / p.max) * 0.32).toFixed(3) + ')';
        g.beginPath(); g.arc(p.x, p.y, p.size, 0, TAU); g.fill();
      }
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < fxs.length; i++) {
        const p = fxs[i];
        if (p.kind !== 'flame') continue;
        const t = p.life / p.max;
        g.fillStyle = (t > 0.6 ? 'rgba(255,240,150,' : t > 0.3 ? 'rgba(255,150,40,' : 'rgba(255,60,20,') + t.toFixed(3) + ')';
        g.beginPath(); g.arc(p.x, p.y, p.size * (0.4 + t), 0, TAU); g.fill();
      }
      g.globalCompositeOperation = 'source-over';

      g.translate(car.x, car.y);
      g.rotate(car.heading);
      g.scale(car.scale, car.scale);
      if (car.s > 0.55) {
        const a = (car.s - 0.55) / 0.45;
        g.strokeStyle = 'rgba(180,220,255,' + (a * 0.35).toFixed(3) + ')';
        g.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
          const y = -22 + i * 11 + Math.sin(state.time * 30 + i) * 3;
          g.beginPath(); g.moveTo(-40, y); g.lineTo(-40 - 30 * a - i * 6, y); g.stroke();
        }
      }
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.beginPath(); g.ellipse(-2, 3, 36, 18, 0, 0, TAU); g.fill();
      g.fillStyle = '#1a1b22'; util.rrect(g, -38, -16, 6, 32, 1.5); g.fill();
      g.fillStyle = opts.livery; g.fillRect(-36.5, -13, 2, 26);
      g.fillStyle = '#e0e4ec'; g.fillRect(-39, -18, 8, 2.5); g.fillRect(-39, 15.5, 8, 2.5);
      wheel(g, -24, -13, 15, 10, 0); wheel(g, -24, 13, 15, 10, 0);
      wheel(g, 18, -14.5, 13, 9, car.steer); wheel(g, 18, 14.5, 13, 9, car.steer);
      g.fillStyle = '#e6e8ee'; util.rrect(g, 27, -19, 6, 38, 1.5); g.fill();
      g.fillStyle = opts.livery; g.fillRect(29, -17, 2.5, 34); g.fillRect(26, -20, 8, 2); g.fillRect(26, 18, 8, 2);
      const grad = g.createLinearGradient(0, -12, 0, 12);
      grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.08, opts.livery); grad.addColorStop(1, '#000000');
      g.fillStyle = opts.livery;
      g.beginPath();
      g.moveTo(-31, -6); g.lineTo(-16, -12); g.lineTo(-2, -12); g.lineTo(8, -6); g.lineTo(33, -2.2);
      g.lineTo(33, 2.2); g.lineTo(8, 6); g.lineTo(-2, 12); g.lineTo(-16, 12); g.lineTo(-31, 6);
      g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.beginPath(); g.moveTo(-31, -6); g.lineTo(-16, -12); g.lineTo(-2, -12); g.lineTo(8, -6); g.lineTo(33, -2.2); g.lineTo(33, 0); g.lineTo(-31, 0); g.closePath(); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.beginPath(); g.moveTo(-16, -12); g.lineTo(-2, -12); g.lineTo(6, -7); g.lineTo(-16, -8); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(-16, 12); g.lineTo(-2, 12); g.lineTo(6, 7); g.lineTo(-16, 8); g.closePath(); g.fill();
      g.fillStyle = opts.accent; g.globalAlpha = 0.9;
      g.fillRect(-30, -1.5, 22, 3); g.fillRect(12, -1.2, 18, 2.4);
      g.globalAlpha = 1;
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.arc(-13, 0, 3.6, 0, TAU); g.fill();
      g.strokeStyle = '#2a2d36'; g.lineWidth = 2; g.beginPath(); g.arc(-5, 0, 6, 0, TAU); g.stroke();
      g.fillStyle = '#0b0c10'; g.beginPath(); g.ellipse(-6, 0, 5, 3.6, 0, 0, TAU); g.fill();
      g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(-7, 0, 2.8, 0, TAU); g.fill();
      g.fillStyle = '#20232c'; g.beginPath(); g.arc(-7, 0, 2.8, -0.9, 0.9); g.lineTo(-7, 0); g.closePath(); g.fill();
    }

    return {
      update, render,
      onEnter() { car.x = state.x; car.y = state.y; },
      destroy() { if (engine) engine.stop(); engine = null; state.meta = null; },
    };
  },
});

/* ---- src/cursors/ghost.js ---- */
/* Cursor: a little ghost that floats after the pointer, leaving fading echoes. */
CursorFX.registerCursor('ghost', {
  label: 'Ghost',
  icon: '👻',
  description: 'A friendly ghost floats after your pointer, wobbles as it moves and leaves fading echoes behind.',
  defaults: { color: 'rgba(240,244,255,0.92)', size: 26, echoes: 6 },
  create(opts, api) {
    const { state, util } = api;
    const { TAU } = util;
    const p = { x: 0, y: 0 };
    const echoes = [];
    let echoTimer = 0;
    function drawGhost(g, x, y, s, alpha, look, wob) {
      g.save();
      g.translate(x, y);
      g.globalAlpha = alpha;
      g.fillStyle = opts.color;
      g.beginPath();
      g.arc(0, -s * 0.15, s * 0.5, Math.PI, 0);
      g.lineTo(s * 0.5, s * 0.45);
      for (let i = 0; i < 4; i++) {
        const bx = s * 0.5 - (i + 0.5) * (s / 4);
        g.quadraticCurveTo(bx + s / 8, s * 0.45 + (i % 2 ? -1 : 1) * s * 0.12 + Math.sin(wob + i) * s * 0.05, bx, s * 0.45);
      }
      g.lineTo(-s * 0.5, s * 0.45);
      g.closePath();
      g.fill();
      g.fillStyle = '#1b1d2a';
      const ex = look.x * s * 0.08, ey = look.y * s * 0.06;
      g.beginPath(); g.ellipse(-s * 0.17 + ex, -s * 0.18 + ey, s * 0.07, s * 0.1, 0, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(s * 0.17 + ex, -s * 0.18 + ey, s * 0.07, s * 0.1, 0, 0, TAU); g.fill();
      g.restore();
    }
    return {
      onEnter() { p.x = state.x; p.y = state.y; },
      update(f, dt) {
        const k = Math.min(1, 0.14 * f);
        p.x += (state.x - p.x) * k; p.y += (state.y - p.y) * k;
        echoTimer += dt;
        if (echoTimer > 0.06 && state.speed > 1.5) {
          echoTimer = 0;
          echoes.push({ x: p.x, y: p.y, life: 1 });
          if (echoes.length > opts.echoes) echoes.shift();
        }
        for (let i = echoes.length - 1; i >= 0; i--) { echoes[i].life -= 0.035 * f; if (echoes[i].life <= 0) echoes.splice(i, 1); }
      },
      render(g) {
        if (!state.seen) return;
        const look = { x: util.clamp(state.vx / 12, -1, 1), y: util.clamp(state.vy / 12, -1, 1) };
        const wob = state.time * 6;
        echoes.forEach((e) => drawGhost(g, e.x, e.y, opts.size, e.life * 0.25, look, wob));
        const bob = Math.sin(state.time * 3) * 3;
        drawGhost(g, p.x, p.y + bob, opts.size * (state.down ? 0.85 : 1), 1, look, wob);
      },
    };
  },
});

/* ---- src/cursors/orb.js ---- */
/* Cursor: glowing orb with a rainbow comet trail. */
CursorFX.registerCursor('orb', {
  label: 'Glow orb',
  icon: '✨',
  description: 'A soft glowing orb with a rainbow comet tail and a ring that pulses on click.',
  defaults: { length: 40, hueSpeed: 40, color: '180,230,255' },
  create(opts, api) {
    const { state, util } = api;
    const { TAU } = util;
    const N = Math.max(4, opts.length | 0);
    const tx = new Float32Array(N), ty = new Float32Array(N);
    const ring = { x: 0, y: 0, r: 16, pulse: 0 };
    return {
      onEnter() { tx.fill(state.x); ty.fill(state.y); ring.x = state.x; ring.y = state.y; },
      onDown() { ring.pulse = 1; },
      update(f) {
        const k0 = Math.min(1, 0.6 * f), k = Math.min(1, 0.45 * f);
        tx[0] += (state.x - tx[0]) * k0; ty[0] += (state.y - ty[0]) * k0;
        for (let i = 1; i < N; i++) { tx[i] += (tx[i - 1] - tx[i]) * k; ty[i] += (ty[i - 1] - ty[i]) * k; }
        const kr = Math.min(1, 0.4 * f);
        ring.x += (state.x - ring.x) * kr; ring.y += (state.y - ring.y) * kr;
        const targetR = state.down ? 10 : state.hover ? 24 : 16;
        ring.r += (targetR - ring.r) * Math.min(1, 0.25 * f);
        ring.pulse *= Math.pow(0.9, f);
      },
      render(g) {
        if (!state.seen) return;
        g.globalCompositeOperation = 'lighter';
        const hue = (state.time * opts.hueSpeed) % 360;
        for (let i = N - 1; i >= 0; i--) {
          const t = i / N;
          g.fillStyle = util.hsla((hue + i * 4) % 360, 95, 68, 0.55 * (1 - t) + 0.05);
          g.beginPath(); g.arc(tx[i], ty[i], (1 - t) * 4.5 + 0.6, 0, TAU); g.fill();
        }
        const glow = g.createRadialGradient(state.x, state.y, 0, state.x, state.y, 34);
        glow.addColorStop(0, 'rgba(' + opts.color + ',0.55)');
        glow.addColorStop(1, 'rgba(' + opts.color + ',0)');
        g.fillStyle = glow; g.beginPath(); g.arc(state.x, state.y, 34, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(220,240,255,0.9)'; g.lineWidth = 1.5;
        g.beginPath(); g.arc(ring.x, ring.y, ring.r, 0, TAU); g.stroke();
        if (ring.pulse > 0.01) {
          g.strokeStyle = 'rgba(200,235,255,' + (ring.pulse * 0.8).toFixed(3) + ')'; g.lineWidth = 2;
          g.beginPath(); g.arc(ring.x, ring.y, ring.r + (1 - ring.pulse) * 70, 0, TAU); g.stroke();
        }
        g.fillStyle = '#fff'; g.beginPath(); g.arc(state.x, state.y, 2.6, 0, TAU); g.fill();
      },
    };
  },
});

/* ---- src/cursors/pixel.js ---- */
/* Cursor: a chunky retro pixel-art arrow. */
CursorFX.registerCursor('pixel', {
  label: 'Retro pixel',
  icon: '🕹️',
  description: 'A chunky 8-bit arrow pointer that squashes when you click.',
  defaults: { fill: '#ffffff', outline: '#000000', scale: 3 },
  create(opts, api) {
    const { state } = api;
    const MAP = [
      'X...........', 'XX..........', 'XoX.........', 'XooX........', 'XoooX.......', 'XooooX......',
      'XoooooX.....', 'XooooooX....', 'XoooooooX...', 'XooooooooX..', 'XoooooooooX.', 'XoooooXXXXXX',
      'XooXooX.....', 'XoX.XooX....', 'XX..XooX....', 'X....XooX...', '.....XooX...', '......XX....',
    ];
    let squash = 1;
    return {
      update(f) { squash += ((state.down ? 0.8 : 1) - squash) * Math.min(1, 0.3 * f); },
      render(g) {
        if (!state.seen || !state.inside) return;
        const s = opts.scale;
        g.translate(state.x, state.y); g.scale(1 / squash, squash);
        for (let y = 0; y < MAP.length; y++) {
          const row = MAP[y];
          for (let x = 0; x < row.length; x++) {
            const c = row[x];
            if (c === '.') continue;
            g.fillStyle = c === 'X' ? opts.outline : opts.fill;
            g.fillRect(x * s, y * s, s, s);
          }
        }
      },
    };
  },
});

/* ---- src/cursors/ribbon.js ---- */
/* Cursor: a silky rainbow ribbon that twists behind the pointer. */
CursorFX.registerCursor('ribbon', {
  label: 'Silk ribbon',
  icon: '🎀',
  description: 'A flowing silk ribbon that twists and narrows behind your pointer.',
  defaults: { length: 40, width: 16, colors: ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#c77dff'] },
  create(opts, api) {
    const { state, util } = api;
    const N = Math.max(6, opts.length | 0);
    const xs = new Float32Array(N), ys = new Float32Array(N);
    return {
      onEnter() { xs.fill(state.x); ys.fill(state.y); },
      update(f) {
        const k0 = Math.min(1, 0.7 * f), k = Math.min(1, 0.5 * f);
        xs[0] += (state.x - xs[0]) * k0; ys[0] += (state.y - ys[0]) * k0;
        for (let i = 1; i < N; i++) { xs[i] += (xs[i - 1] - xs[i]) * k; ys[i] += (ys[i - 1] - ys[i]) * k; }
      },
      render(g) {
        if (!state.seen) return;
        const cols = opts.colors;
        for (let i = 0; i < N - 1; i++) {
          const t = i / N;
          const w = opts.width * (1 - t) * (0.55 + 0.45 * Math.abs(Math.sin(state.time * 5 + i * 0.35)));
          const dx = xs[i + 1] - xs[i], dy = ys[i + 1] - ys[i];
          const len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len * w * 0.5, ny = dx / len * w * 0.5;
          const dx2 = (i + 2 < N ? xs[i + 2] : xs[i + 1]) - xs[i + 1], dy2 = (i + 2 < N ? ys[i + 2] : ys[i + 1]) - ys[i + 1];
          const len2 = Math.hypot(dx2, dy2) || 1;
          const w2 = opts.width * (1 - (i + 1) / N) * (0.55 + 0.45 * Math.abs(Math.sin(state.time * 5 + (i + 1) * 0.35)));
          const nx2 = -dy2 / len2 * w2 * 0.5, ny2 = dx2 / len2 * w2 * 0.5;
          g.fillStyle = cols[Math.floor((i / N) * cols.length + state.time * 2) % cols.length];
          g.globalAlpha = 0.9 * (1 - t);
          g.beginPath();
          g.moveTo(xs[i] + nx, ys[i] + ny);
          g.lineTo(xs[i + 1] + nx2, ys[i + 1] + ny2);
          g.lineTo(xs[i + 1] - nx2, ys[i + 1] - ny2);
          g.lineTo(xs[i] - nx, ys[i] - ny);
          g.closePath(); g.fill();
        }
        g.globalAlpha = 1;
        g.fillStyle = '#fff';
        g.beginPath(); g.arc(state.x, state.y, 3, 0, util.TAU); g.fill();
      },
    };
  },
});

/* ---- src/cursors/ring.js ---- */
/* Cursor: minimal dot + lagging ring, the modern portfolio-site cursor. */
CursorFX.registerCursor('ring', {
  label: 'Dot & ring',
  icon: '◎',
  description: 'A small dot with a lagging ring that expands over links and buttons and shrinks on click.',
  defaults: { color: '#ffffff', size: 18, dot: 4, lag: 0.22, blend: true },
  create(opts, api) {
    const { state, util } = api;
    const ring = { x: 0, y: 0, r: opts.size, a: 0 };
    return {
      onEnter() { ring.x = state.x; ring.y = state.y; },
      update(f) {
        const k = Math.min(1, opts.lag * f);
        ring.x += (state.x - ring.x) * k; ring.y += (state.y - ring.y) * k;
        const target = state.down ? opts.size * 0.6 : state.hover ? opts.size * 2.2 : opts.size + state.speed * 0.4;
        ring.r += (target - ring.r) * Math.min(1, 0.2 * f);
        ring.a += ((state.inside && state.seen ? 1 : 0) - ring.a) * Math.min(1, 0.15 * f);
      },
      render(g) {
        if (ring.a < 0.01) return;
        g.globalAlpha = ring.a;
        if (opts.blend) g.globalCompositeOperation = 'difference';
        g.strokeStyle = opts.color; g.lineWidth = state.hover ? 1 : 1.5;
        g.beginPath(); g.arc(ring.x, ring.y, ring.r, 0, util.TAU); g.stroke();
        if (state.hover) { g.globalAlpha = ring.a * 0.15; g.fillStyle = opts.color; g.fill(); g.globalAlpha = ring.a; }
        g.fillStyle = opts.color;
        g.beginPath(); g.arc(state.x, state.y, opts.dot * (state.down ? 1.6 : 1), 0, util.TAU); g.fill();
      },
    };
  },
});

/* ---- src/cursors/rocket.js ---- */
/* Cursor: a rocket that points where you move, with a flickering exhaust flame. */
CursorFX.registerCursor('rocket', {
  label: 'Rocket',
  icon: '🚀',
  description: 'A rocket that turns to follow your movement, with a flame that grows with speed. Optional thruster sound.',
  sound: true,
  defaults: { color: '#eef1f6', accent: '#ff5252', scale: 1, thruster: true },
  create(opts, api) {
    const { state, util, audio } = api;
    const { TAU, rand } = util;
    const r = { x: state.x, y: state.y, heading: -Math.PI / 2, s: 0 };
    const sparks = [];
    let thr = null;
    function ensureThruster() {
      const c = audio.get(); if (!c || thr || !opts.thruster) return;
      const src = c.createBufferSource(); src.buffer = audio.noise; src.loop = true;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.Q.value = 0.8;
      const gn = c.createGain(); gn.gain.value = 0;
      src.connect(lp).connect(gn).connect(audio.bus()); src.start(0, 0.5);
      thr = { src, lp, gn, c };
    }
    return {
      onEnter() { r.x = state.x; r.y = state.y; },
      update(f) {
        const gx = state.x - r.x, gy = state.y - r.y, gap = Math.hypot(gx, gy);
        let nx = state.x, ny = state.y;
        if (gap > 1.5) {
          const maxStep = (20 + r.s * 40) * f;
          let step = gap * Math.min(1, 0.8 * f);
          if (step > maxStep) step = maxStep;
          if (step < gap) { nx = r.x + gx / gap * step; ny = r.y + gy / gap * step; }
        }
        const dx = nx - r.x, dy = ny - r.y, d = Math.hypot(dx, dy);
        r.x = nx; r.y = ny;
        if (d / f > 0.4) { let a = Math.atan2(dy, dx) - r.heading; a = Math.atan2(Math.sin(a), Math.cos(a)); r.heading += a * Math.min(1, 0.25 * f); }
        r.s += (util.clamp(d / f / 24, 0, 1) - r.s) * Math.min(1, 0.2 * f);
        const boost = state.down ? 1 : 0;
        const sc = opts.scale * util.clamp(Math.min(state.w, state.h) / 800, 0.8, 1.2);
        if (!state.reduceMotion && (r.s > 0.05 || boost)) {
          const n = 1 + Math.round(r.s * 2 + boost * 2);
          for (let i = 0; i < n; i++) {
            const ch = Math.cos(r.heading), sh = Math.sin(r.heading);
            const sp = 2 + r.s * 4 + boost * 2;
            sparks.push({ x: r.x - ch * 20 * sc, y: r.y - sh * 20 * sc, vx: -ch * sp + rand(-1, 1), vy: -sh * sp + rand(-1, 1), life: rand(10, 20), max: 20, size: rand(2, 4) * sc });
          }
          if (sparks.length > 300) sparks.splice(0, sparks.length - 300);
        }
        for (let i = sparks.length - 1; i >= 0; i--) {
          const p = sparks[i]; p.life -= f;
          if (p.life <= 0) { sparks[i] = sparks[sparks.length - 1]; sparks.pop(); continue; }
          p.x += p.vx * f; p.y += p.vy * f; const dd = Math.pow(0.92, f); p.vx *= dd; p.vy *= dd;
        }
        ensureThruster();
        if (thr) {
          const t = thr.c.currentTime;
          thr.gn.gain.setTargetAtTime((0.05 + r.s * 0.35 + boost * 0.25), t, 0.06);
          thr.lp.frequency.setTargetAtTime(300 + r.s * 1800 + boost * 800, t, 0.08);
        }
      },
      render(g) {
        if (!state.seen) return;
        g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < sparks.length; i++) {
          const p = sparks[i], t = p.life / p.max;
          g.fillStyle = (t > 0.6 ? 'rgba(255,240,150,' : t > 0.3 ? 'rgba(255,150,40,' : 'rgba(255,60,20,') + t.toFixed(3) + ')';
          g.beginPath(); g.arc(p.x, p.y, p.size * (0.4 + t), 0, TAU); g.fill();
        }
        g.globalCompositeOperation = 'source-over';
        const sc = opts.scale * util.clamp(Math.min(state.w, state.h) / 800, 0.8, 1.2);
        g.translate(r.x, r.y); g.rotate(r.heading); g.scale(sc, sc);
        const flame = 8 + r.s * 26 + (state.down ? 14 : 0);
        const flick = Math.sin(state.time * 40) * 3;
        g.fillStyle = 'rgba(255,170,60,0.9)';
        g.beginPath(); g.moveTo(-18, -5); g.lineTo(-18 - flame - flick, 0); g.lineTo(-18, 5); g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,240,180,0.95)';
        g.beginPath(); g.moveTo(-18, -2.5); g.lineTo(-18 - flame * 0.55, 0); g.lineTo(-18, 2.5); g.closePath(); g.fill();
        g.fillStyle = opts.accent;
        g.beginPath(); g.moveTo(-14, -6); g.lineTo(-24, -13); g.lineTo(-18, 0); g.lineTo(-24, 13); g.lineTo(-14, 6); g.closePath(); g.fill();
        g.fillStyle = opts.color;
        g.beginPath(); g.moveTo(-18, -7); g.lineTo(10, -7); g.quadraticCurveTo(24, -4, 26, 0); g.quadraticCurveTo(24, 4, 10, 7); g.lineTo(-18, 7); g.closePath(); g.fill();
        g.fillStyle = opts.accent;
        g.beginPath(); g.moveTo(12, -7); g.quadraticCurveTo(24, -4, 26, 0); g.quadraticCurveTo(24, 4, 12, 7); g.closePath(); g.fill();
        g.fillStyle = '#5ad1ff'; g.beginPath(); g.arc(2, 0, 3.8, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.2; g.beginPath(); g.arc(2, 0, 3.8, 0, TAU); g.stroke();
      },
      destroy() {
        const t = thr; thr = null;
        if (!t) return;
        try { t.gn.gain.setTargetAtTime(0, t.c.currentTime, 0.02); } catch (e) {}
        setTimeout(() => { try { t.src.stop(); t.src.disconnect(); t.gn.disconnect(); } catch (e) {} }, 100);
      },
    };
  },
});

/* ---- src/cursors/spotlight.js ---- */
/* Cursor: darkens the page except a soft circle of light around the pointer. */
CursorFX.registerCursor('spotlight', {
  label: 'Spotlight',
  icon: '🔦',
  description: 'Dims the whole page and lights only a soft circle around your pointer. Hold to widen the beam.',
  defaults: { radius: 170, darkness: 0.82, softness: 0.5, color: '0,0,0' },
  create(opts, api) {
    const { state, util } = api;
    const p = { x: 0, y: 0, r: opts.radius, a: 0 };
    return {
      onEnter() { p.x = state.x; p.y = state.y; },
      update(f) {
        const k = Math.min(1, 0.35 * f);
        p.x += (state.x - p.x) * k; p.y += (state.y - p.y) * k;
        const target = opts.radius * (state.down ? 1.6 : state.hover ? 1.25 : 1) + state.speed * 2;
        p.r += (target - p.r) * Math.min(1, 0.15 * f);
        p.a += ((state.seen && state.inside ? 1 : 0) - p.a) * Math.min(1, 0.08 * f);
      },
      render(g) {
        if (p.a < 0.01) return;
        g.fillStyle = 'rgba(' + opts.color + ',' + (opts.darkness * p.a).toFixed(3) + ')';
        g.fillRect(0, 0, state.w, state.h);
        g.globalCompositeOperation = 'destination-out';
        const grad = g.createRadialGradient(p.x, p.y, p.r * opts.softness, p.x, p.y, p.r);
        grad.addColorStop(0, 'rgba(0,0,0,1)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad;
        g.beginPath(); g.arc(p.x, p.y, p.r, 0, util.TAU); g.fill();
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = 'rgba(255,255,255,0.9)';
        g.beginPath(); g.arc(state.x, state.y, 3, 0, util.TAU); g.fill();
      },
    };
  },
});

/* ---- src/cursors/textflag.js ---- */
/* Cursor: text that waves behind the pointer like a flag on a rope. */
CursorFX.registerCursor('textflag', {
  label: 'Text flag',
  icon: '🏁',
  description: 'Your own words trail behind the pointer and wave like a flag.',
  defaults: { text: 'CURSORFX', color: '#ffd23f', font: '700 16px system-ui, -apple-system, sans-serif', gap: 12 },
  create(opts, api) {
    const { state } = api;
    const chars = Array.from(opts.text || 'HELLO');
    const N = chars.length + 1;
    const xs = new Float32Array(N), ys = new Float32Array(N);
    return {
      onEnter() { xs.fill(state.x); ys.fill(state.y); },
      update(f) {
        const k0 = Math.min(1, 0.7 * f), k = Math.min(1, 0.4 * f);
        xs[0] += (state.x - xs[0]) * k0; ys[0] += (state.y - ys[0]) * k0;
        for (let i = 1; i < N; i++) {
          xs[i] += (xs[i - 1] - xs[i]) * k; ys[i] += (ys[i - 1] - ys[i]) * k;
          const dx = xs[i] - xs[i - 1], dy = ys[i] - ys[i - 1], d = Math.hypot(dx, dy) || 1;
          if (d < opts.gap) { xs[i] = xs[i - 1] + dx / d * opts.gap; ys[i] = ys[i - 1] + dy / d * opts.gap; }
        }
      },
      render(g) {
        if (!state.seen) return;
        g.font = opts.font; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = opts.color; g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 3; g.lineJoin = 'round';
        for (let i = 1; i < N; i++) {
          const dx = xs[i - 1] - xs[i], dy = ys[i - 1] - ys[i];
          const a = Math.atan2(dy, dx);
          const wave = Math.sin(state.time * 8 - i * 0.6) * (2 + i * 0.4);
          g.save(); g.translate(xs[i] - Math.sin(a) * wave, ys[i] + Math.cos(a) * wave); g.rotate(a);
          const ch = chars[i - 1];
          g.strokeText(ch, 0, 0); g.fillText(ch, 0, 0);
          g.restore();
        }
        g.fillStyle = '#fff'; g.beginPath(); g.arc(state.x, state.y, 3, 0, Math.PI * 2); g.fill();
      },
    };
  },
});

/* ---- src/trails/bubbles.js ---- */
/* Trail: soap bubbles rise from the pointer and pop. */
CursorFX.registerTrail('bubbles', {
  label: 'Bubbles',
  icon: '🫧',
  description: 'Soap bubbles float up from the pointer, wobble, and pop.',
  defaults: { rate: 1, color: '120,200,255' },
  create(opts, api) {
    const { state, util } = api;
    const list = util.particleList();
    let acc = 0;
    return {
      update(f) {
        if (state.seen && !state.reduceMotion) {
          acc += (0.05 + state.speed * 0.08) * opts.rate * f;
          while (acc >= 1) { acc -= 1; list.add({ x: state.x, y: state.y, vx: util.rand(-0.5, 0.5), vy: util.rand(-1.4, -0.6), r: util.rand(3, 9), life: util.rand(60, 120), max: 120, ph: util.rand(0, 6) }); }
          list.cap(150);
        }
        list.step(f, (p) => { p.x += (p.vx + Math.sin(state.time * 3 + p.ph) * 0.4) * f; p.y += p.vy * f; p.r += 0.02 * f; });
      },
      render(g) {
        list.items.forEach((p) => {
          const t = p.life / p.max, a = Math.min(1, t * 4);
          if (t < 0.08) {
            g.strokeStyle = 'rgba(255,255,255,' + (t * 8).toFixed(2) + ')'; g.lineWidth = 1;
            g.beginPath(); g.arc(p.x, p.y, p.r * (1 + (0.08 - t) * 10), 0, util.TAU); g.stroke();
            return;
          }
          g.fillStyle = 'rgba(' + opts.color + ',' + (0.18 * a).toFixed(3) + ')';
          g.beginPath(); g.arc(p.x, p.y, p.r, 0, util.TAU); g.fill();
          g.strokeStyle = 'rgba(255,255,255,' + (0.7 * a).toFixed(3) + ')'; g.lineWidth = 1; g.stroke();
          g.fillStyle = 'rgba(255,255,255,' + (0.8 * a).toFixed(3) + ')';
          g.beginPath(); g.arc(p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.2, 0, util.TAU); g.fill();
        });
      },
    };
  },
});

/* ---- src/trails/emojirain.js ---- */
/* Trail: emoji tumble out of the pointer and fall with gravity. Snow and petals reuse it. */
(function () {
  function make(name, label, icon, description, defaults, physics) {
    CursorFX.registerTrail(name, {
      label, icon, description, defaults,
      create(opts, api) {
        const { state, util } = api;
        const list = util.particleList();
        let acc = 0;
        return {
          update(f) {
            if (state.seen && !state.reduceMotion) {
              acc += (physics.idle + state.speed * physics.perSpeed) * opts.rate * f;
              while (acc >= 1) {
                acc -= 1;
                list.add({ x: state.x, y: state.y, vx: util.rand(-physics.spread, physics.spread) + state.vx * 0.15, vy: util.rand(physics.vy0, physics.vy1), rot: util.rand(0, 6), spin: util.rand(-physics.spin, physics.spin), size: util.rand(0.7, 1.2), life: util.rand(physics.life0, physics.life1), max: physics.life1, emoji: util.pick(opts.emoji), ph: util.rand(0, 6) });
              }
              list.cap(160);
            }
            list.step(f, (p) => {
              p.vy += physics.gravity * f;
              p.x += (p.vx + Math.sin(state.time * 2 + p.ph) * physics.sway) * f;
              p.y += p.vy * f; p.rot += p.spin * f;
              if (physics.drag) { p.vx *= Math.pow(physics.drag, f); }
            });
          },
          render(g) {
            list.items.forEach((p) => {
              const sp = util.sprite(p.emoji, opts.size);
              util.drawSprite(g, sp, p.x, p.y, p.size, p.rot, Math.min(1, (p.life / p.max) * 3));
            });
          },
        };
      },
    });
  }
  make('emojirain', 'Emoji rain', '😂', 'Your favourite emoji tumble out of the pointer and rain down.',
    { emoji: ['😀', '😂', '😍', '🥳', '🔥', '💯'], rate: 1, size: 22 },
    { idle: 0.02, perSpeed: 0.06, spread: 2.5, vy0: -3, vy1: 0, spin: 0.15, gravity: 0.18, sway: 0, drag: 0.97, life0: 50, life1: 80 });
  make('snow', 'Snowflakes', '❄️', 'Soft snowflakes drift down from the pointer and sway in the breeze.',
    { emoji: ['❄️', '❅', '❆'], rate: 1, size: 16 },
    { idle: 0.05, perSpeed: 0.05, spread: 0.6, vy0: 0.4, vy1: 1.2, spin: 0.04, gravity: 0.004, sway: 0.5, drag: 0.99, life0: 90, life1: 150 });
  make('petals', 'Sakura petals', '🌸', 'Cherry-blossom petals flutter down behind the pointer.',
    { emoji: ['🌸', '🌸', '💮'], rate: 1, size: 16 },
    { idle: 0.04, perSpeed: 0.05, spread: 1, vy0: 0.3, vy1: 1, spin: 0.08, gravity: 0.01, sway: 0.7, drag: 0.98, life0: 80, life1: 140 });
})();

/* ---- src/trails/fire.js ---- */
/* Trail: the pointer leaves a licking flame behind it. */
CursorFX.registerTrail('fire', {
  label: 'Fire',
  icon: '🔥',
  description: 'The pointer burns: flames rise and flicker behind it, growing hotter as you move faster.',
  defaults: { rate: 1, hue: 20 },
  create(opts, api) {
    const { state, util } = api;
    const list = util.particleList();
    let acc = 0;
    return {
      update(f) {
        if (state.seen && !state.reduceMotion) {
          acc += (0.9 + state.speed * 0.35) * opts.rate * f;
          while (acc >= 1) { acc -= 1; list.add({ x: state.x + util.rand(-5, 5), y: state.y + util.rand(-3, 3), vx: util.rand(-0.5, 0.5) - state.vx * 0.05, vy: util.rand(-2.2, -0.8), size: util.rand(5, 11), life: util.rand(18, 34), max: 34, ph: util.rand(0, 6) }); }
          list.cap(500);
        }
        list.step(f, (p) => { p.x += (p.vx + Math.sin(state.time * 20 + p.ph) * 0.5) * f; p.y += p.vy * f; p.size *= Math.pow(0.95, f); });
      },
      render(g) {
        g.globalCompositeOperation = 'lighter';
        list.items.forEach((p) => {
          const t = p.life / p.max;
          const l = 45 + t * 35, hue = opts.hue + (1 - t) * -15 + t * 30;
          g.fillStyle = util.hsla(hue, 100, l, 0.55 * t + 0.05);
          g.beginPath(); g.arc(p.x, p.y, p.size * (0.5 + t * 0.6), 0, util.TAU); g.fill();
        });
      },
    };
  },
});

/* ---- src/trails/neon.js ---- */
/* Trail: a glowing neon line that follows the pointer's path and fades away. */
CursorFX.registerTrail('neon', {
  label: 'Neon line',
  icon: '💡',
  description: 'A glowing neon tube traces your path and fades out behind you. Hue cycles over time.',
  defaults: { width: 4, life: 0.7, hueSpeed: 60, color: null },
  create(opts, api) {
    const { state, util } = api;
    const pts = [];
    return {
      update(f, dt) {
        if (state.seen && state.inside) {
          const lastP = pts[pts.length - 1];
          if (!lastP || Math.hypot(lastP.x - state.x, lastP.y - state.y) > 2) pts.push({ x: state.x, y: state.y, t: state.time });
        }
        while (pts.length && state.time - pts[0].t > opts.life) pts.shift();
        if (pts.length > 400) pts.splice(0, pts.length - 400);
      },
      render(g) {
        if (pts.length < 2) return;
        g.lineCap = 'round'; g.lineJoin = 'round';
        const hue = (state.time * opts.hueSpeed) % 360;
        for (let pass = 0; pass < 3; pass++) {
          const w = opts.width * (pass === 0 ? 5 : pass === 1 ? 2.2 : 1);
          const alpha = pass === 0 ? 0.12 : pass === 1 ? 0.35 : 1;
          for (let i = 1; i < pts.length; i++) {
            const age = (state.time - pts[i].t) / opts.life;
            const a = (1 - age) * alpha;
            if (a <= 0.01) continue;
            g.strokeStyle = opts.color ? opts.color : util.hsla((hue + i * 1.5) % 360, 100, pass === 2 ? 85 : 60, 1);
            g.globalAlpha = a; g.lineWidth = w * (1 - age * 0.6);
            g.beginPath(); g.moveTo(pts[i - 1].x, pts[i - 1].y); g.lineTo(pts[i].x, pts[i].y); g.stroke();
          }
        }
      },
    };
  },
});

/* ---- src/trails/rainbow.js ---- */
/* Trail: a classic seven-band rainbow ribbon. */
CursorFX.registerTrail('rainbow', {
  label: 'Rainbow',
  icon: '🌈',
  description: 'A seven-band rainbow streams behind the pointer and fades at the tail.',
  defaults: { length: 45, width: 22 },
  create(opts, api) {
    const { state } = api;
    const N = Math.max(6, opts.length | 0);
    const xs = new Float32Array(N), ys = new Float32Array(N);
    const BANDS = ['#ff0000', '#ff8a00', '#ffe600', '#22c55e', '#00b7ff', '#4f46e5', '#a855f7'];
    return {
      onEnter() { xs.fill(state.x); ys.fill(state.y); },
      update(f) {
        const k0 = Math.min(1, 0.8 * f), k = Math.min(1, 0.55 * f);
        xs[0] += (state.x - xs[0]) * k0; ys[0] += (state.y - ys[0]) * k0;
        for (let i = 1; i < N; i++) { xs[i] += (xs[i - 1] - xs[i]) * k; ys[i] += (ys[i - 1] - ys[i]) * k; }
      },
      render(g) {
        if (!state.seen) return;
        const bw = opts.width / BANDS.length;
        g.lineCap = 'round'; g.lineJoin = 'round';
        for (let i = 0; i < N - 1; i++) {
          const dx = xs[i + 1] - xs[i], dy = ys[i + 1] - ys[i], len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len, ny = dx / len;
          const taper = 1 - i / N;
          g.globalAlpha = 0.9 * taper;
          g.lineWidth = Math.max(0.5, bw * taper + 0.6);
          for (let b = 0; b < BANDS.length; b++) {
            const off = (b - (BANDS.length - 1) / 2) * bw * taper;
            g.strokeStyle = BANDS[b];
            g.beginPath(); g.moveTo(xs[i] + nx * off, ys[i] + ny * off); g.lineTo(xs[i + 1] + nx * off, ys[i + 1] + ny * off); g.stroke();
          }
        }
      },
    };
  },
});

/* ---- src/trails/sparkles.js ---- */
/* Trail: fairy dust — twinkling four-point sparkles drift from the pointer. */
CursorFX.registerTrail('sparkles', {
  label: 'Fairy dust',
  icon: '✨',
  description: 'Twinkling sparkles spill from the pointer as it moves and drift gently down.',
  defaults: { colors: ['#ff7ce5', '#ffd166', '#7cf5ff', '#c3ff7c', '#ffffff'], rate: 1, size: 7 },
  create(opts, api) {
    const { state, util } = api;
    const list = util.particleList();
    let acc = 0;
    return {
      update(f) {
        if (state.seen && !state.reduceMotion) {
          acc += (0.12 + state.speed * 0.25) * opts.rate * f;
          while (acc >= 1) {
            acc -= 1;
            list.add({ x: state.x + util.rand(-4, 4), y: state.y + util.rand(-4, 4), vx: util.rand(-0.8, 0.8) - state.vx * 0.1, vy: util.rand(-0.6, 0.4), rot: util.rand(0, 6), spin: util.rand(-0.1, 0.1), size: util.rand(0.5, 1.2) * opts.size, life: util.rand(35, 70), max: 70, color: util.pick(opts.colors), tw: util.rand(0, 6) });
          }
          list.cap(400);
        }
        list.step(f, (p) => { p.x += p.vx * f; p.y += p.vy * f; p.vy += 0.03 * f; p.rot += p.spin * f; });
      },
      render(g) {
        list.items.forEach((p) => {
          const t = p.life / p.max;
          const tw = 0.6 + 0.4 * Math.sin(state.time * 12 + p.tw);
          g.globalAlpha = Math.min(1, t * 1.5) * tw;
          g.fillStyle = p.color;
          util.star(g, p.x, p.y, p.size * (0.4 + t * 0.6), 4, 0.35, p.rot);
          g.fill();
        });
      },
    };
  },
});

/* ---- src/trails/stars.js ---- */
/* Trail: five-point stars twinkle into life along the pointer's path. */
CursorFX.registerTrail('stars', {
  label: 'Twinkle stars',
  icon: '⭐',
  description: 'Golden stars pop into life along the path, spin, twinkle and fade.',
  defaults: { colors: ['#ffd700', '#fff1a8', '#ffffff', '#ffb347'], rate: 1, size: 9 },
  create(opts, api) {
    const { state, util } = api;
    const list = util.particleList();
    let acc = 0;
    return {
      update(f) {
        if (state.seen && !state.reduceMotion) {
          acc += (0.06 + state.speed * 0.18) * opts.rate * f;
          while (acc >= 1) { acc -= 1; list.add({ x: state.x + util.rand(-6, 6), y: state.y + util.rand(-6, 6), vx: util.rand(-0.4, 0.4), vy: util.rand(-0.4, 0.4), rot: util.rand(0, 6), spin: util.rand(-0.08, 0.08), size: util.rand(0.6, 1.3) * opts.size, life: util.rand(40, 70), max: 70, color: util.pick(opts.colors) }); }
          list.cap(300);
        }
        list.step(f, (p) => { p.x += p.vx * f; p.y += p.vy * f; p.rot += p.spin * f; });
      },
      render(g) {
        list.items.forEach((p) => {
          const t = p.life / p.max, grow = t > 0.85 ? (1 - t) / 0.15 : 1;
          g.globalAlpha = Math.min(1, t * 2) * (0.7 + 0.3 * Math.sin(state.time * 10 + p.rot * 5));
          g.fillStyle = p.color;
          util.star(g, p.x, p.y, p.size * grow * (0.5 + t * 0.5), 5, 0.45, p.rot); g.fill();
        });
      },
    };
  },
});

/* ---- src/clicks/animals.js ---- */
/* Click: particles explode from the click and reassemble into a different animal each time. */
CursorFX.registerClick('animals', {
  label: 'Particle animals',
  icon: '🦊',
  description: 'Every click bursts a cloud of particles that reassemble into a different animal. Move through it to push the particles aside.',
  sound: true,
  defaults: {
    animals: ['🦊', '🐱', '🦋', '🐠', '🐰', '🦉', '🐶', '🐸', '🦁', '🐼', '🐘', '🦜', '🐢', '🦄'],
    count: 0, size: 0.55, dissolveAfter: 8, repel: 90,
  },
  create(opts, api) {
    const { state, util, audio } = api;
    const { TAU, clamp, rand } = util;
    let N = 0, px, py, vx, vy, tx, ty, sz, cols, alpha;
    let mode = 'off', modeT = 0, idx = -1, hold = 0;
    const cache = new Map();

    function alloc() {
      const wanted = opts.count || clamp(Math.round((state.w * state.h) / 600), 1000, 3600);
      if (wanted === N) return;
      N = state.reduceMotion ? Math.round(wanted / 2) : wanted;
      px = new Float32Array(N); py = new Float32Array(N); vx = new Float32Array(N); vy = new Float32Array(N);
      tx = new Float32Array(N); ty = new Float32Array(N); sz = new Float32Array(N); cols = new Array(N); alpha = new Float32Array(N);
      for (let i = 0; i < N; i++) { px[i] = state.x; py[i] = state.y; sz[i] = rand(1.5, 2.5); cols[i] = '#fff'; }
    }

    function shape(emoji) {
      const S = Math.round(clamp(Math.min(state.w, state.h) * opts.size, 120, 700));
      const key = emoji + '@' + S;
      if (cache.has(key)) return cache.get(key);
      let s = util.samplePoints(emoji, S, 2);
      if (s.count < 200) { s = util.samplePoints(emoji, S, 1, { font: '700 ' + Math.round(S * 0.6) + 'px system-ui, sans-serif', color: '#ffffff' }); }
      cache.set(key, s);
      return s;
    }

    function trigger(x, y) {
      alloc();
      idx = (idx + 1) % opts.animals.length;
      const s = shape(opts.animals[idx]);
      if (!s.count) return;
      const cx = clamp(x, s.halfW + 10, Math.max(s.halfW + 10, state.w - s.halfW - 10));
      const cy = clamp(y, s.halfH + 10, Math.max(s.halfH + 10, state.h - s.halfH - 10));
      const first = mode === 'off';
      const step = s.count / N;
      for (let i = 0; i < N; i++) {
        if (first) { px[i] = x + rand(-6, 6); py[i] = y + rand(-6, 6); }
        let dx = px[i] - x, dy = py[i] - y; const d = Math.hypot(dx, dy);
        const a = rand(0, TAU);
        if (d < 1) { dx = Math.cos(a); dy = Math.sin(a); } else { dx /= d; dy /= d; }
        const sp = rand(4, 16) * (state.reduceMotion ? 0.25 : 1);
        vx[i] = (dx * 0.7 + Math.cos(a) * 0.3) * sp; vy[i] = (dy * 0.7 + Math.sin(a) * 0.3) * sp;
        const j = s.count >= N ? Math.min(s.count - 1, Math.floor(i * step + Math.random() * step)) : Math.floor(Math.random() * s.count);
        tx[i] = cx + s.xs[j] + rand(-0.8, 0.8); ty[i] = cy + s.ys[j] + rand(-0.8, 0.8);
        const c = s.cols[j];
        cols[i] = 'rgb(' + (40 + c[0] * 0.84 | 0) + ',' + (40 + c[1] * 0.84 | 0) + ',' + (40 + c[2] * 0.84 | 0) + ')';
        alpha[i] = 1;
      }
      mode = 'burst'; modeT = 0; hold = 0;
      audio.whoosh({ from: 220, to: 3800, dur: 0.45, peak: 0.4 });
    }

    function update(f, dt) {
      if (mode === 'off') return;
      modeT += dt;
      if (mode === 'burst' && modeT > (state.reduceMotion ? 0.12 : 0.42)) { mode = 'assemble'; modeT = 0; }
      if (mode === 'assemble' && opts.dissolveAfter > 0) {
        hold += dt;
        if (hold > opts.dissolveAfter) { mode = 'dissolve'; modeT = 0; for (let i = 0; i < N; i++) { vx[i] += rand(-2, 2); vy[i] += rand(-3, 1); } }
      }
      const R = mode === 'assemble' ? Math.max(opts.repel, 50 + state.speed * 4) : 0, R2 = R * R;
      const fr = Math.pow(mode === 'burst' ? 0.955 : mode === 'assemble' ? 0.82 : 0.98, f);
      let visible = false;
      for (let i = 0; i < N; i++) {
        if (mode === 'assemble') {
          vx[i] += (tx[i] - px[i]) * 0.06 * f; vy[i] += (ty[i] - py[i]) * 0.06 * f;
          const dx = px[i] - state.x, dy = py[i] - state.y, d2 = dx * dx + dy * dy;
          if (d2 < R2) { const d = Math.sqrt(d2) || 1, force = ((R - d) / R) * 2.4 * f; vx[i] += dx / d * force; vy[i] += dy / d * force; }
        } else if (mode === 'dissolve') {
          vy[i] -= 0.02 * f; alpha[i] = Math.max(0, alpha[i] - 0.012 * f);
        }
        vx[i] *= fr; vy[i] *= fr; px[i] += vx[i] * f; py[i] += vy[i] * f;
        if (alpha[i] > 0.01) visible = true;
      }
      if (mode === 'dissolve' && !visible) mode = 'off';
    }

    function render(g) {
      if (mode === 'off') return;
      const breathe = mode === 'assemble' ? 1 + 0.12 * Math.sin(state.time * 2.2) : 1;
      for (let i = 0; i < N; i++) {
        if (alpha[i] <= 0.01) continue;
        g.globalAlpha = alpha[i];
        g.fillStyle = cols[i];
        const r = sz[i] * breathe;
        g.beginPath(); g.moveTo(px[i] + r, py[i]); g.arc(px[i], py[i], r, 0, TAU); g.fill();
      }
    }

    return { trigger, update, render, resize() { cache.clear(); }, clear() { mode = 'off'; } };
  },
});

/* ---- src/clicks/birds.js ---- */
/* Click: a flock of birds takes off from the click and flies away. */
CursorFX.registerClick('birds', {
  label: 'Flock of birds',
  icon: '🐦',
  description: 'A flock of birds takes flight from the click, flapping and scattering across the page.',
  sound: true,
  defaults: { count: 9, color: '#f4f6ff' },
  create(opts, api) {
    const { state, util, audio } = api;
    const list = util.particleList();
    return {
      trigger(x, y) {
        const base = util.rand(-2.6, -0.5);
        const n = state.reduceMotion ? opts.count / 2 : opts.count;
        for (let i = 0; i < n; i++) {
          const a = base + util.rand(-0.5, 0.5), sp = util.rand(2.5, 4.5);
          list.add({ x: x + util.rand(-10, 10), y: y + util.rand(-10, 10), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, flap: util.rand(0, 6), fs: util.rand(0.35, 0.5), size: util.rand(6, 12), life: util.rand(120, 200), max: 200 });
        }
        list.cap(100);
        audio.tone({ freq: 1800, slideTo: 2600, dur: 0.08, type: 'sine', peak: 0.08 });
        setTimeout(() => audio.tone({ freq: 2200, slideTo: 1700, dur: 0.08, type: 'sine', peak: 0.06 }), 120);
      },
      update(f) { list.step(f, (p) => { p.x += p.vx * f; p.y += p.vy * f; p.flap += p.fs * f; p.vy += Math.sin(p.flap) * 0.02 * f; }); },
      render(g) {
        g.strokeStyle = opts.color; g.lineCap = 'round'; g.lineJoin = 'round';
        list.items.forEach((p) => {
          const t = p.life / p.max, w = Math.sin(p.flap);
          g.save(); g.translate(p.x, p.y); g.rotate(Math.atan2(p.vy, p.vx)); g.globalAlpha = Math.min(1, t * 3); g.lineWidth = 2;
          g.beginPath(); g.moveTo(-p.size, -w * p.size * 0.9); g.quadraticCurveTo(-p.size * 0.4, 0, 0, 0); g.quadraticCurveTo(p.size * 0.4, 0, p.size, -w * p.size * 0.9); g.stroke();
          g.restore();
        });
      },
    };
  },
});

/* ---- src/clicks/bubbles.js ---- */
/* Click: a burst of soap bubbles that rise and pop one by one. */
CursorFX.registerClick('bubbles', {
  label: 'Bubble burst',
  icon: '🫧',
  description: 'A cloud of soap bubbles bursts from the click, drifts upward and pops with tiny rings.',
  sound: true,
  defaults: { count: 18, color: '120,200,255' },
  create(opts, api) {
    const { state, util, audio } = api;
    const list = util.particleList();
    return {
      trigger(x, y) {
        const n = state.reduceMotion ? opts.count / 2 : opts.count;
        for (let i = 0; i < n; i++) {
          const a = util.rand(0, util.TAU), sp = util.rand(1, 4);
          list.add({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, r: util.rand(4, 14), ph: util.rand(0, 6), life: util.rand(50, 110), max: 110, popped: false });
        }
        list.cap(200);
        audio.tone({ freq: 500, slideTo: 1500, dur: 0.12, type: 'sine', peak: 0.12 });
      },
      update(f) {
        list.step(f, (p) => {
          const d = Math.pow(0.95, f); p.vx *= d; p.vy *= d; p.vy -= 0.02 * f;
          p.x += (p.vx + Math.sin(state.time * 3 + p.ph) * 0.4) * f; p.y += p.vy * f;
          if (p.life < 8 && !p.popped) { p.popped = true; audio.tone({ freq: util.rand(1200, 2600), dur: 0.05, type: 'sine', peak: 0.08 }); }
        });
      },
      render(g) {
        list.items.forEach((p) => {
          const t = p.life / p.max;
          if (t < 0.08) { g.strokeStyle = 'rgba(255,255,255,' + (t * 8).toFixed(2) + ')'; g.lineWidth = 1; g.beginPath(); g.arc(p.x, p.y, p.r * (1 + (0.08 - t) * 10), 0, util.TAU); g.stroke(); return; }
          g.fillStyle = 'rgba(' + opts.color + ',0.18)'; g.beginPath(); g.arc(p.x, p.y, p.r, 0, util.TAU); g.fill();
          g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 1; g.stroke();
          g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.2, 0, util.TAU); g.fill();
        });
      },
    };
  },
});

/* ---- src/clicks/butterflies.js ---- */
/* Click: a kaleidoscope of butterflies flutters out from the click and flies away. */
CursorFX.registerClick('butterflies', {
  label: 'Butterflies',
  icon: '🦋',
  description: 'A flock of butterflies bursts from the click, flaps its wings and flutters away in every direction.',
  sound: true,
  defaults: { count: 10, colors: ['#ff8fab', '#ffd166', '#8ecae6', '#c77dff', '#80ed99', '#ffb703'], size: 14 },
  create(opts, api) {
    const { state, util, audio } = api;
    const { TAU, rand } = util;
    const list = util.particleList();
    function wing(g, s, flap, up) {
      g.beginPath();
      g.moveTo(0, 0);
      g.bezierCurveTo(s * 0.6 * flap, -s * 0.9 * (up ? 1 : -0.5), s * 1.4 * flap, -s * 0.4 * (up ? 1 : -0.6), s * 1.2 * flap, s * 0.25 * (up ? 1 : 1.6));
      g.bezierCurveTo(s * 0.9 * flap, s * 0.55 * (up ? 1 : 1.5), s * 0.3 * flap, s * 0.4, 0, 0);
      g.closePath();
    }
    return {
      trigger(x, y) {
        const n = state.reduceMotion ? Math.ceil(opts.count / 2) : opts.count;
        for (let i = 0; i < n; i++) {
          const a = rand(0, TAU), sp = rand(1.5, 4);
          list.add({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, a, size: rand(0.7, 1.3) * opts.size, color: util.pick(opts.colors), edge: 'rgba(0,0,0,0.35)', flap: rand(0, 6), fs: rand(0.35, 0.6), wander: rand(0, 6), life: rand(150, 260), max: 260 });
        }
        list.cap(120);
        audio.whoosh({ from: 600, to: 2400, dur: 0.25, peak: 0.12, q: 2 });
      },
      update(f) {
        list.step(f, (p) => {
          p.wander += 0.05 * f;
          p.vx += Math.cos(p.wander * 1.7) * 0.12 * f; p.vy += (Math.sin(p.wander * 1.3) * 0.12 - 0.02) * f;
          const d = Math.pow(0.985, f); p.vx *= d; p.vy *= d;
          p.x += p.vx * f; p.y += p.vy * f;
          p.flap += p.fs * f;
          p.a = Math.atan2(p.vy, p.vx) + Math.PI / 2;
        });
      },
      render(g) {
        list.items.forEach((p) => {
          const t = p.life / p.max, a = Math.min(1, t * 3);
          const flap = 0.35 + 0.65 * Math.abs(Math.cos(p.flap));
          g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.globalAlpha = a;
          g.fillStyle = p.color; g.strokeStyle = p.edge; g.lineWidth = 1;
          for (const side of [-1, 1]) {
            g.save(); g.scale(side, 1);
            wing(g, p.size, flap, true); g.fill(); g.stroke();
            wing(g, p.size * 0.75, flap, false); g.fill(); g.stroke();
            g.fillStyle = 'rgba(255,255,255,0.45)';
            g.beginPath(); g.arc(p.size * 0.7 * flap, -p.size * 0.3, p.size * 0.14, 0, TAU); g.fill();
            g.fillStyle = p.color;
            g.restore();
          }
          g.fillStyle = '#2b2b3a';
          g.beginPath(); g.ellipse(0, 0, p.size * 0.12, p.size * 0.55, 0, 0, TAU); g.fill();
          g.strokeStyle = '#2b2b3a'; g.lineWidth = 1;
          g.beginPath(); g.moveTo(0, -p.size * 0.5); g.lineTo(-p.size * 0.3, -p.size * 0.95); g.moveTo(0, -p.size * 0.5); g.lineTo(p.size * 0.3, -p.size * 0.95); g.stroke();
          g.restore();
        });
      },
    };
  },
});

/* ---- src/clicks/confetti.js ---- */
/* Click: a cannon of paper confetti with tumbling pieces and gravity. */
CursorFX.registerClick('confetti', {
  label: 'Confetti',
  icon: '🎉',
  description: 'A confetti cannon fires paper pieces that tumble, flutter and fall from every click.',
  sound: true,
  defaults: { count: 60, colors: ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ffffff'], spread: 1.1 },
  create(opts, api) {
    const { state, util, audio } = api;
    const list = util.particleList();
    return {
      trigger(x, y) {
        const n = state.reduceMotion ? opts.count / 2 : opts.count;
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + util.rand(-opts.spread, opts.spread), sp = util.rand(4, 13);
          list.add({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, w: util.rand(5, 10), h: util.rand(3, 6), rot: util.rand(0, 6), spin: util.rand(-0.3, 0.3), tilt: util.rand(0, 6), ts: util.rand(0.1, 0.3), color: util.pick(opts.colors), life: util.rand(90, 150), max: 150 });
        }
        list.cap(600);
        audio.pop({ freq: 1500, q: 0.8, peak: 0.6, dur: 0.12 });
        audio.pop({ freq: 200, q: 0.7, peak: 0.5, dur: 0.2, type: 'lowpass' });
      },
      update(f) {
        list.step(f, (p) => {
          p.vy += 0.16 * f; const d = Math.pow(0.95, f); p.vx *= d; p.vy *= d;
          p.x += (p.vx + Math.sin(p.tilt) * 0.6) * f; p.y += p.vy * f;
          p.rot += p.spin * f; p.tilt += p.ts * f;
        });
      },
      render(g) {
        list.items.forEach((p) => {
          const t = p.life / p.max;
          g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.scale(1, Math.max(0.15, Math.abs(Math.cos(p.tilt))));
          g.globalAlpha = Math.min(1, t * 4); g.fillStyle = p.color;
          g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          g.restore();
        });
      },
    };
  },
});

/* ---- src/clicks/emojiburst.js ---- */
/* Click: a burst of emoji (or comic-book words) that pop out and tumble. */
(function () {
  function make(name, def, spriteOpts, sound) {
    CursorFX.registerClick(name, Object.assign({
      sound: true,
      create(opts, api) {
        const { state, util, audio } = api;
        const list = util.particleList();
        return {
          trigger(x, y) {
            const n = state.reduceMotion ? opts.count / 2 : opts.count;
            for (let i = 0; i < n; i++) {
              const a = util.rand(0, util.TAU), sp = util.rand(opts.speed * 0.4, opts.speed);
              list.add({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - opts.lift, rot: util.rand(-0.4, 0.4), spin: util.rand(-0.15, 0.15), scale: 0, target: util.rand(0.7, 1.2), item: util.pick(opts.items), color: opts.colors ? util.pick(opts.colors) : null, life: util.rand(50, 90), max: 90 });
            }
            list.cap(200);
            sound(audio, util);
          },
          update(f) {
            list.step(f, (p) => {
              p.vy += opts.gravity * f; const d = Math.pow(0.95, f); p.vx *= d; p.vy *= d;
              p.x += p.vx * f; p.y += p.vy * f; p.rot += p.spin * f;
              p.scale += (p.target - p.scale) * Math.min(1, 0.25 * f);
            });
          },
          render(g) {
            list.items.forEach((p) => {
              const sp = util.sprite(p.item, opts.size, p.color ? Object.assign({}, spriteOpts, { color: p.color }) : spriteOpts);
              util.drawSprite(g, sp, p.x, p.y, p.scale, p.rot, Math.min(1, (p.life / p.max) * 3));
            });
          },
        };
      },
    }, def));
  }
  make('emojiburst', {
    label: 'Emoji burst', icon: '🎊',
    description: 'A burst of your chosen emoji pops out of the click and tumbles down.',
    defaults: { items: ['🎉', '✨', '💖', '🌈', '⭐', '🔥', '😍'], count: 14, size: 26, speed: 9, lift: 3, gravity: 0.25 },
  }, {}, (audio) => audio.pop({ freq: 1400, q: 0.9, peak: 0.5, dur: 0.1 }));
  make('textburst', {
    label: 'Comic words', icon: '💬',
    description: 'Comic-book words like POW! and BOOM! leap out of every click.',
    defaults: { items: ['POW!', 'BOOM!', 'WOW!', 'ZAP!', 'BAM!', 'YES!'], colors: ['#ffe600', '#ff3b3b', '#3bd1ff', '#7cff5a', '#ff7cf0'], count: 5, size: 28, speed: 6, lift: 4, gravity: 0.2 },
  }, { font: '900 28px Impact, "Arial Black", system-ui, sans-serif' }, (audio) => audio.tone({ freq: 220, slideTo: 880, dur: 0.15, type: 'square', peak: 0.12 }));
})();

/* ---- src/clicks/fireworks.js ---- */
/* Click: a rocket streaks up to the click point and bursts into a shower of sparks. */
CursorFX.registerClick('fireworks', {
  label: 'Fireworks',
  icon: '🎆',
  description: 'A rocket streaks up from below and explodes at the click point in a shower of coloured sparks.',
  sound: true,
  defaults: { sparks: 80, hue: null },
  create(opts, api) {
    const { state, util, audio } = api;
    const { TAU, rand } = util;
    const rockets = [], sparks = [];
    function burst(x, y, hue) {
      const n = state.reduceMotion ? opts.sparks / 2 : opts.sparks;
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU), sp = rand(1, 7);
        sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(40, 80), max: 80, hue: hue + rand(-20, 20), trail: [] });
      }
      if (sparks.length > 900) sparks.splice(0, sparks.length - 900);
      audio.pop({ freq: 120, q: 0.7, peak: 0.8, dur: 0.35, type: 'lowpass' });
      audio.pop({ freq: 2500, q: 0.8, peak: 0.4, dur: 0.2 });
    }
    return {
      trigger(x, y) {
        const hue = opts.hue == null ? rand(0, 360) : opts.hue;
        const startY = Math.min(state.h + 10, y + rand(180, 320));
        rockets.push({ x: x + rand(-40, 40), y: startY, tx: x, ty: y, sx: x + rand(-40, 40), sy: startY, t: 0, hue });
        audio.whoosh({ from: 300, to: 1800, dur: 0.45, peak: 0.25 });
      },
      update(f) {
        for (let i = rockets.length - 1; i >= 0; i--) {
          const r = rockets[i];
          r.t += 0.035 * f;
          const e = 1 - Math.pow(1 - Math.min(1, r.t), 2);
          r.x = r.sx + (r.tx - r.sx) * e; r.y = r.sy + (r.ty - r.sy) * e;
          sparks.push({ x: r.x + rand(-2, 2), y: r.y + rand(-2, 2), vx: rand(-0.4, 0.4), vy: rand(0.5, 1.5), life: rand(10, 20), max: 20, hue: 40, trail: [] });
          if (r.t >= 1) { burst(r.tx, r.ty, r.hue); rockets.splice(i, 1); }
        }
        for (let i = sparks.length - 1; i >= 0; i--) {
          const p = sparks[i]; p.life -= f;
          if (p.life <= 0) { sparks[i] = sparks[sparks.length - 1]; sparks.pop(); continue; }
          p.trail.push(p.x, p.y); if (p.trail.length > 8) p.trail.splice(0, 2);
          p.vy += 0.06 * f; const d = Math.pow(0.96, f); p.vx *= d; p.vy *= d;
          p.x += p.vx * f; p.y += p.vy * f;
        }
      },
      render(g) {
        g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
        rockets.forEach((r) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(r.x, r.y, 2.5, 0, TAU); g.fill(); });
        sparks.forEach((p) => {
          const t = p.life / p.max;
          g.strokeStyle = util.hsla(p.hue, 100, 60 + t * 25, t); g.lineWidth = 2 * t + 0.5;
          if (p.trail.length >= 4) { g.beginPath(); g.moveTo(p.trail[0], p.trail[1]); g.lineTo(p.x, p.y); g.stroke(); }
          g.fillStyle = util.hsla(p.hue, 100, 80, t);
          g.beginPath(); g.arc(p.x, p.y, 1.6, 0, TAU); g.fill();
        });
      },
    };
  },
});

/* ---- src/clicks/gunshot.js ---- */
/* Click: gunshot — muzzle flash, sparks, smoke, a cracked bullet hole that fades, and an ejected casing. */
CursorFX.registerClick('gunshot', {
  label: 'Gunshot',
  icon: '🎯',
  description: 'Every click fires a shot: a flash, sparks, a puff of smoke and a cracked bullet hole that fades away. Hold to keep firing.',
  sound: true,
  defaults: { holdFor: 6, cracks: true, auto: true, fireRate: 7, casings: true },
  create(opts, api) {
    const { state, util, audio } = api;
    const { TAU, rand } = util;
    const holes = [], sparks = [], smoke = [], flashes = [], casings = [];
    let sinceShot = 999;

    function bang() {
      audio.pop({ freq: 3200, q: 0.9, peak: 1, dur: 0.05, attack: 0.001 });
      audio.pop({ freq: 160, q: 0.6, peak: 1, dur: 0.28, type: 'lowpass', attack: 0.002 });
      audio.whoosh({ from: 2200, to: 180, dur: 0.45, peak: 0.22, q: 0.8 });
    }

    function shoot(x, y) {
      sinceShot = 0;
      flashes.push({ x, y, life: 5, max: 5, rot: rand(0, TAU) });
      const n = state.reduceMotion ? 6 : 14;
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU), sp = rand(2, 9);
        sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, life: rand(10, 26), max: 26, len: rand(3, 9) });
      }
      for (let i = 0; i < (state.reduceMotion ? 2 : 5); i++) {
        smoke.push({ x: x + rand(-4, 4), y: y + rand(-4, 4), vx: rand(-0.4, 0.4), vy: rand(-1.2, -0.4), r: rand(3, 6), life: rand(50, 90), max: 90 });
      }
      const cracks = [];
      if (opts.cracks) {
        const count = util.randInt(4, 8);
        for (let i = 0; i < count; i++) {
          const a = (i / count) * TAU + rand(-0.3, 0.3), len = rand(10, 34);
          const pts = [];
          let px = 0, py = 0;
          const segs = util.randInt(2, 4);
          for (let s = 1; s <= segs; s++) {
            const d = (len / segs) * s, wob = rand(-0.25, 0.25);
            px = Math.cos(a + wob) * d; py = Math.sin(a + wob) * d;
            pts.push(px, py);
          }
          cracks.push({ pts, w: rand(0.6, 1.4) });
        }
      }
      holes.push({ x, y, r: rand(4.5, 7), cracks, life: opts.holdFor * 60 + 90, max: opts.holdFor * 60 + 90, seed: rand(0, TAU) });
      if (holes.length > 60) holes.shift();
      if (opts.casings) casings.push({ x, y, vx: rand(2, 4.5), vy: rand(-5, -3), rot: rand(0, TAU), spin: rand(0.2, 0.5), life: 60, max: 60 });
      bang();
      if (state.reduceMotion) return;
      if (sparks.length > 500) sparks.splice(0, sparks.length - 500);
    }

    function tick(list, f, fn) {
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.life -= f;
        if (p.life <= 0) { list.splice(i, 1); continue; }
        fn(p);
      }
    }

    return {
      trigger(x, y) { shoot(x, y); },
      update(f, dt) {
        sinceShot += dt;
        if (opts.auto && state.down && !state.downIgnored && state.seen && sinceShot > 1 / opts.fireRate) shoot(state.x, state.y);
        tick(flashes, f, () => {});
        tick(sparks, f, (p) => { p.vy += 0.25 * f; const d = Math.pow(0.9, f); p.vx *= d; p.vy *= d; p.x += p.vx * f; p.y += p.vy * f; });
        tick(smoke, f, (p) => { p.x += p.vx * f; p.y += p.vy * f; p.r += 0.35 * f; p.vy *= Math.pow(0.98, f); });
        tick(holes, f, () => {});
        tick(casings, f, (p) => { p.vy += 0.35 * f; p.x += p.vx * f; p.y += p.vy * f; p.rot += p.spin * f; });
      },
      render(g) {
        // Bullet holes: a dark crater with a light rim and glass cracks; fade over the last 1.5 s.
        holes.forEach((h) => {
          const a = Math.min(1, h.life / 90);
          g.globalAlpha = a;
          if (h.cracks.length) {
            g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineCap = 'round';
            h.cracks.forEach((c) => {
              g.lineWidth = c.w; g.beginPath(); g.moveTo(h.x, h.y);
              for (let i = 0; i < c.pts.length; i += 2) g.lineTo(h.x + c.pts[i], h.y + c.pts[i + 1]);
              g.stroke();
            });
            g.strokeStyle = 'rgba(0,0,0,0.35)';
            h.cracks.forEach((c) => {
              g.lineWidth = c.w * 0.5; g.beginPath(); g.moveTo(h.x + 0.6, h.y + 0.6);
              for (let i = 0; i < c.pts.length; i += 2) g.lineTo(h.x + c.pts[i] + 0.6, h.y + c.pts[i + 1] + 0.6);
              g.stroke();
            });
          }
          g.fillStyle = 'rgba(200,205,215,0.45)';
          g.beginPath(); g.arc(h.x, h.y, h.r * 1.9, 0, TAU); g.fill();
          g.fillStyle = 'rgba(70,72,80,0.9)';
          g.beginPath(); g.arc(h.x, h.y, h.r * 1.25, 0, TAU); g.fill();
          g.fillStyle = '#07070a';
          g.beginPath();
          for (let i = 0; i < 9; i++) { const ang = (i / 9) * TAU, rr = h.r * (0.8 + 0.25 * Math.sin(h.seed + i * 2.1)); if (i === 0) g.moveTo(h.x + Math.cos(ang) * rr, h.y + Math.sin(ang) * rr); else g.lineTo(h.x + Math.cos(ang) * rr, h.y + Math.sin(ang) * rr); }
          g.closePath(); g.fill();
        });
        g.globalAlpha = 1;
        // Smoke.
        smoke.forEach((p) => { g.fillStyle = 'rgba(150,150,160,' + ((p.life / p.max) * 0.35).toFixed(3) + ')'; g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill(); });
        // Casings.
        casings.forEach((p) => {
          g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.globalAlpha = Math.min(1, p.life / 15);
          g.fillStyle = '#d4a53a'; g.fillRect(-4, -1.5, 8, 3); g.fillStyle = '#8a6a1e'; g.fillRect(-4, -1.5, 1.5, 3);
          g.restore();
        });
        // Flash and sparks on top, additive.
        g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
        flashes.forEach((p) => {
          const t = p.life / p.max;
          const grad = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, 40 * t + 10);
          grad.addColorStop(0, 'rgba(255,250,220,' + t.toFixed(2) + ')'); grad.addColorStop(0.4, 'rgba(255,190,80,' + (t * 0.6).toFixed(2) + ')'); grad.addColorStop(1, 'rgba(255,120,30,0)');
          g.fillStyle = grad; g.beginPath(); g.arc(p.x, p.y, 40 * t + 10, 0, TAU); g.fill();
          g.strokeStyle = 'rgba(255,240,200,' + t.toFixed(2) + ')'; g.lineWidth = 2;
          for (let i = 0; i < 4; i++) { const a = p.rot + i * (TAU / 4); g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + Math.cos(a) * 26 * t, p.y + Math.sin(a) * 26 * t); g.stroke(); }
        });
        sparks.forEach((p) => {
          const t = p.life / p.max, v = Math.hypot(p.vx, p.vy) || 1;
          g.strokeStyle = 'rgba(255,' + (150 + 100 * t | 0) + ',60,' + t.toFixed(2) + ')'; g.lineWidth = 1.5;
          g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx / v * p.len, p.y - p.vy / v * p.len); g.stroke();
        });
      },
    };
  },
});

/* ---- src/clicks/hearts.js ---- */
/* Click: hearts float up from the click and drift away. */
CursorFX.registerClick('hearts', {
  label: 'Hearts',
  icon: '❤️',
  description: 'A flurry of hearts floats up from the click, swaying and fading as they rise.',
  sound: true,
  defaults: { count: 12, colors: ['#ff4d6d', '#ff8fab', '#ff5c8a', '#ffb3c6', '#e63946'] },
  create(opts, api) {
    const { state, util, audio } = api;
    const list = util.particleList();
    return {
      trigger(x, y) {
        const n = state.reduceMotion ? opts.count / 2 : opts.count;
        for (let i = 0; i < n; i++) list.add({ x: x + util.rand(-10, 10), y: y + util.rand(-6, 6), vx: util.rand(-1.5, 1.5), vy: util.rand(-3.5, -1.2), s: util.rand(8, 20), color: util.pick(opts.colors), rot: util.rand(-0.5, 0.5), ph: util.rand(0, 6), life: util.rand(60, 110), max: 110 });
        list.cap(200);
        audio.tone({ freq: 660, slideTo: 990, dur: 0.18, type: 'triangle', peak: 0.15 });
      },
      update(f) { list.step(f, (p) => { p.x += (p.vx + Math.sin(state.time * 4 + p.ph) * 0.6) * f; p.y += p.vy * f; p.vy += 0.01 * f; p.vx *= Math.pow(0.98, f); }); },
      render(g) {
        list.items.forEach((p) => {
          const t = p.life / p.max;
          g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.globalAlpha = Math.min(1, t * 2);
          const s = p.s * (t > 0.85 ? 1 + (t - 0.85) * 2 : 1);
          g.fillStyle = p.color; util.heart(g, 0, 0, s); g.fill();
          g.restore();
        });
      },
    };
  },
});

/* ---- src/clicks/ink.js ---- */
/* Click: an ink splat with drips. */
CursorFX.registerClick('ink', {
  label: 'Ink splash',
  icon: '🖌️',
  description: 'A splat of ink hits the page at the click, spreads into blobs and drips before fading.',
  sound: true,
  defaults: { color: '#1b1b2f', blobs: 14, size: 26 },
  create(opts, api) {
    const { state, util, audio } = api;
    const list = util.particleList();
    return {
      trigger(x, y) {
        list.add({ x, y, r: 0, target: opts.size * util.rand(0.8, 1.2), life: 120, max: 120, drip: false });
        for (let i = 0; i < opts.blobs; i++) {
          const a = util.rand(0, util.TAU), d = util.rand(0.3, 1.4) * opts.size;
          list.add({ x, y, tx: x + Math.cos(a) * d, ty: y + Math.sin(a) * d, r: 0, target: util.rand(2, 9), life: util.rand(90, 120), max: 120, drip: Math.random() < 0.3, dy: 0 });
        }
        list.cap(300);
        audio.pop({ freq: 380, q: 0.9, peak: 0.6, dur: 0.16, type: 'lowpass' });
      },
      update(f) {
        list.step(f, (p) => {
          p.r += (p.target - p.r) * Math.min(1, 0.25 * f);
          if (p.tx != null) { p.x += (p.tx - p.x) * Math.min(1, 0.2 * f); p.y += (p.ty - p.y) * Math.min(1, 0.2 * f); }
          if (p.drip) { p.dy += 0.08 * f; }
        });
      },
      render(g) {
        g.fillStyle = opts.color;
        list.items.forEach((p) => {
          const t = p.life / p.max;
          g.globalAlpha = Math.min(1, t * 3) * 0.92;
          g.beginPath(); g.arc(p.x, p.y, p.r, 0, util.TAU); g.fill();
          if (p.drip && p.dy > 0) { g.beginPath(); g.ellipse(p.x, p.y + p.dy * 0.6, p.r * 0.45, p.r * 0.45 + p.dy * 0.4, 0, 0, util.TAU); g.fill(); }
        });
      },
    };
  },
});

/* ---- src/clicks/notes.js ---- */
/* Click: music notes float up, and each click plays a note from a pentatonic scale. */
CursorFX.registerClick('notes', {
  label: 'Music notes',
  icon: '🎵',
  description: 'Music notes float up from the click, and each click plays a pentatonic note so clicking becomes a melody.',
  sound: true,
  defaults: { count: 6, colors: ['#ffd166', '#8ecae6', '#ff8fab', '#c77dff', '#80ed99'], size: 26 },
  create(opts, api) {
    const { state, util, audio } = api;
    const list = util.particleList();
    const SCALE = [261.6, 293.7, 329.6, 392, 440, 523.3, 587.3, 659.3, 784, 880];
    return {
      trigger(x, y) {
        const n = state.reduceMotion ? opts.count / 2 : opts.count;
        for (let i = 0; i < n; i++) list.add({ x: x + util.rand(-8, 8), y, vx: util.rand(-0.8, 0.8), vy: util.rand(-2.5, -1), rot: util.rand(-0.3, 0.3), sym: util.pick(['♪', '♫', '♬', '♩']), color: util.pick(opts.colors), ph: util.rand(0, 6), life: util.rand(70, 110), max: 110 });
        list.cap(120);
        const note = SCALE[Math.floor(util.clamp(1 - y / state.h, 0, 0.999) * SCALE.length)];
        audio.tone({ freq: note, dur: 0.6, type: 'triangle', peak: 0.2 });
        audio.tone({ freq: note * 2, dur: 0.4, type: 'sine', peak: 0.06 });
      },
      update(f) { list.step(f, (p) => { p.x += (p.vx + Math.sin(state.time * 3 + p.ph) * 0.8) * f; p.y += p.vy * f; }); },
      render(g) {
        list.items.forEach((p) => {
          const sp = util.sprite(p.sym, opts.size, { font: '700 ' + opts.size + 'px system-ui, "Segoe UI Symbol", sans-serif', color: p.color });
          util.drawSprite(g, sp, p.x, p.y, 1, p.rot + Math.sin(state.time * 3 + p.ph) * 0.15, Math.min(1, (p.life / p.max) * 3));
        });
      },
    };
  },
});

/* ---- src/clicks/ripple.js ---- */
/* Click: water-like rings ripple outward from the click. */
CursorFX.registerClick('ripple', {
  label: 'Ripple waves',
  icon: '🌊',
  description: 'Concentric rings ripple out from every click like a drop on water.',
  sound: true,
  defaults: { color: '120,200,255', rings: 3, size: 120, speed: 1 },
  create(opts, api) {
    const { state, util, audio } = api;
    const list = util.particleList();
    return {
      trigger(x, y) {
        for (let i = 0; i < opts.rings; i++) list.add({ x, y, life: 60 + i * 12, max: 60 + i * 12, delay: i * 6 });
        audio.tone({ freq: 900, slideTo: 300, dur: 0.35, type: 'sine', peak: 0.2 });
      },
      update(f) { list.step(f, (p) => { p.delay -= f; }); },
      render(g) {
        list.items.forEach((p) => {
          if (p.delay > 0) return;
          const t = 1 - p.life / p.max;
          const r = opts.size * Math.pow(t, 0.6) * opts.speed;
          const a = (1 - t) * 0.9;
          g.strokeStyle = 'rgba(' + opts.color + ',' + a.toFixed(3) + ')';
          g.lineWidth = 3 * (1 - t) + 0.5;
          g.beginPath(); g.arc(p.x, p.y, r, 0, util.TAU); g.stroke();
          g.strokeStyle = 'rgba(255,255,255,' + (a * 0.35).toFixed(3) + ')'; g.lineWidth = 1;
          g.beginPath(); g.arc(p.x, p.y, r * 0.8, 0, util.TAU); g.stroke();
        });
      },
    };
  },
});

/* ---- src/clicks/shockwave.js ---- */
/* Click: an explosive shockwave ring with flying sparks and a flash. */
CursorFX.registerClick('shockwave', {
  label: 'Shockwave',
  icon: '💥',
  description: 'A bright flash, an expanding shockwave ring and a spray of sparks blast out from the click.',
  sound: true,
  defaults: { color: '255,200,120', sparks: 30 },
  create(opts, api) {
    const { state, util, audio } = api;
    const { TAU, rand } = util;
    const rings = [], sparks = [];
    return {
      trigger(x, y) {
        rings.push({ x, y, life: 40, max: 40 });
        const n = state.reduceMotion ? opts.sparks / 2 : opts.sparks;
        for (let i = 0; i < n; i++) { const a = rand(0, TAU), sp = rand(3, 12); sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(20, 45), max: 45, len: rand(4, 12) }); }
        if (sparks.length > 400) sparks.splice(0, sparks.length - 400);
        audio.pop({ freq: 90, q: 0.6, peak: 1, dur: 0.4, type: 'lowpass' });
        audio.whoosh({ from: 4000, to: 200, dur: 0.3, peak: 0.3 });
      },
      update(f) {
        for (let i = rings.length - 1; i >= 0; i--) { rings[i].life -= f; if (rings[i].life <= 0) rings.splice(i, 1); }
        for (let i = sparks.length - 1; i >= 0; i--) {
          const p = sparks[i]; p.life -= f;
          if (p.life <= 0) { sparks[i] = sparks[sparks.length - 1]; sparks.pop(); continue; }
          const d = Math.pow(0.9, f); p.vx *= d; p.vy *= d; p.x += p.vx * f; p.y += p.vy * f;
        }
      },
      render(g) {
        g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
        rings.forEach((r) => {
          const t = 1 - r.life / r.max;
          const rad = 10 + t * 160;
          g.strokeStyle = 'rgba(' + opts.color + ',' + (1 - t).toFixed(3) + ')'; g.lineWidth = 14 * (1 - t) + 1;
          g.beginPath(); g.arc(r.x, r.y, rad, 0, TAU); g.stroke();
          if (t < 0.3) {
            const flash = g.createRadialGradient(r.x, r.y, 0, r.x, r.y, 90);
            flash.addColorStop(0, 'rgba(255,255,255,' + ((0.3 - t) * 2).toFixed(3) + ')'); flash.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = flash; g.beginPath(); g.arc(r.x, r.y, 90, 0, TAU); g.fill();
          }
        });
        sparks.forEach((p) => {
          const t = p.life / p.max, v = Math.hypot(p.vx, p.vy) || 1;
          g.strokeStyle = 'rgba(' + opts.color + ',' + t.toFixed(3) + ')'; g.lineWidth = 2 * t + 0.5;
          g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx / v * p.len, p.y - p.vy / v * p.len); g.stroke();
        });
      },
    };
  },
});

/* ---- src/clicks/stars.js ---- */
/* Click: a burst of spinning golden stars with a chime. */
CursorFX.registerClick('stars', {
  label: 'Star burst',
  icon: '🌟',
  description: 'Golden stars shoot out from the click, spin, twinkle and fade with a soft chime.',
  sound: true,
  defaults: { count: 16, colors: ['#ffd700', '#fff1a8', '#ffffff', '#ffb347'] },
  create(opts, api) {
    const { state, util, audio } = api;
    const list = util.particleList();
    return {
      trigger(x, y) {
        const n = state.reduceMotion ? opts.count / 2 : opts.count;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * util.TAU + util.rand(-0.2, 0.2), sp = util.rand(3, 8);
          list.add({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: util.rand(0, 6), spin: util.rand(-0.2, 0.2), size: util.rand(6, 13), color: util.pick(opts.colors), life: util.rand(45, 75), max: 75 });
        }
        list.cap(300);
        [880, 1108, 1318, 1760].forEach((fq, i) => setTimeout(() => audio.tone({ freq: fq, dur: 0.5, type: 'sine', peak: 0.12 }), i * 50));
      },
      update(f) { list.step(f, (p) => { const d = Math.pow(0.93, f); p.vx *= d; p.vy *= d; p.x += p.vx * f; p.y += p.vy * f; p.rot += p.spin * f; }); },
      render(g) {
        list.items.forEach((p) => {
          const t = p.life / p.max;
          g.globalAlpha = Math.min(1, t * 2) * (0.7 + 0.3 * Math.sin(state.time * 14 + p.rot * 3));
          g.fillStyle = p.color; util.star(g, p.x, p.y, p.size * (0.4 + t * 0.6), 5, 0.45, p.rot); g.fill();
        });
      },
    };
  },
});

/* ---- src/clicks/waves.js ---- */
/* Click: the page itself ripples — real content bends and refracts around the click.
   Uses backdrop-filter with an SVG displacement map (Chromium). Elsewhere it falls back to rings. */
CursorFX.registerClick('waves', {
  label: 'Page waves',
  icon: '🌊',
  description: 'The page itself ripples like water: text and images bend and refract outward from the click. Jelly mode wobbles the whole page. Needs a Chromium browser for the warp; other browsers see rings.',
  sound: true,
  defaults: { strength: 42, radius: 340, duration: 1.4, style: 'ripple', rings: true },
  create(opts, api) {
    const { state, util, audio, core } = api;
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const supported = !state.reduceMotion && typeof CSS !== 'undefined' && !!CSS.supports &&
      (CSS.supports('backdrop-filter', 'url(#a)') || CSS.supports('-webkit-backdrop-filter', 'url(#a)'));
    let root = null, svg = null, mapUrl = null, counter = 0;
    const waves = [];

    function el(name, attrs) {
      const e = document.createElementNS(SVG_NS, name);
      Object.keys(attrs).forEach((k) => e.setAttribute(k, attrs[k]));
      return e;
    }

    // Displacement map: one radial crest. R encodes x offset, G encodes y offset, 128 = none.
    function makeMap() {
      const S = 256, c = document.createElement('canvas');
      c.width = S; c.height = S;
      const g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data;
      const r0 = 0.72, w = 0.15;
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const dx = (x - S / 2) / (S / 2), dy = (y - S / 2) / (S / 2), r = Math.hypot(dx, dy);
          const env = Math.exp(-((r - r0) * (r - r0)) / (2 * w * w));
          const p = Math.sin(((r - r0) / w) * Math.PI) * env;
          const ux = r > 0 ? dx / r : 0, uy = r > 0 ? dy / r : 0;
          const i = (y * S + x) * 4;
          d[i] = 128 + ux * p * 127; d[i + 1] = 128 + uy * p * 127; d[i + 2] = 128; d[i + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
      return c.toDataURL('image/png');
    }

    function ensureDom() {
      if (root || !supported) return;
      root = document.createElement('div');
      root.setAttribute('data-cursorfx', '');
      root.setAttribute('aria-hidden', 'true');
      const z = (core.getConfig().zIndex || 2147483646) - 1;
      Object.assign(root.style, { position: 'fixed', left: '0', top: '0', width: '0', height: '0', pointerEvents: 'none', zIndex: String(z) });
      svg = el('svg', { width: '0', height: '0' });
      svg.style.position = 'absolute';
      root.appendChild(svg);
      document.body.appendChild(root);
      mapUrl = makeMap();
    }

    function spawn(x, y) {
      ensureDom();
      const wave = { x, y, t: 0 };
      if (supported) {
        const id = 'cursorfx-wave-' + (++counter);
        const filter = el('filter', { id, x: '0', y: '0', width: '100%', height: '100%', 'color-interpolation-filters': 'sRGB' });
        let disp;
        if (opts.style === 'jelly') {
          wave.turb = el('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.010', numOctaves: '2', seed: String(counter % 40), result: 'n' });
          disp = el('feDisplacementMap', { in: 'SourceGraphic', in2: 'n', scale: '0', xChannelSelector: 'R', yChannelSelector: 'G' });
          filter.appendChild(wave.turb);
        } else {
          const img = el('feImage', { href: mapUrl, preserveAspectRatio: 'none', x: '0', y: '0', width: '100%', height: '100%', result: 'm' });
          img.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', mapUrl);
          disp = el('feDisplacementMap', { in: 'SourceGraphic', in2: 'm', scale: '0', xChannelSelector: 'R', yChannelSelector: 'G' });
          filter.appendChild(img);
        }
        filter.appendChild(disp);
        svg.appendChild(filter);
        const div = document.createElement('div');
        Object.assign(div.style, { position: 'fixed', pointerEvents: 'none', left: '0px', top: '0px', width: '0px', height: '0px' });
        div.style.backdropFilter = 'url(#' + id + ')';
        div.style.webkitBackdropFilter = 'url(#' + id + ')';
        if (opts.style === 'jelly') { div.style.width = '100vw'; div.style.height = '100vh'; }
        root.appendChild(div);
        wave.filter = filter; wave.div = div; wave.disp = disp;
      }
      waves.push(wave);
      while (waves.length > 6) remove(waves.shift());
      audio.tone({ freq: 700, slideTo: 220, dur: 0.45, type: 'sine', peak: 0.2 });
    }

    function remove(w) {
      if (w.div) w.div.remove();
      if (w.filter) w.filter.remove();
    }

    return {
      trigger(x, y) { spawn(x, y); },
      update(f, dt) {
        for (let i = waves.length - 1; i >= 0; i--) {
          const w = waves[i];
          w.t += dt / opts.duration;
          if (w.t >= 1) { remove(w); waves.splice(i, 1); continue; }
          if (!w.div) continue;
          const e = w.t;
          if (opts.style === 'jelly') {
            const s = opts.strength * Math.exp(-3 * e) * Math.sin(e * Math.PI * 5);
            w.disp.setAttribute('scale', s.toFixed(2));
            w.turb.setAttribute('baseFrequency', (0.008 + 0.003 * Math.sin(e * 9)).toFixed(4));
          } else {
            const rad = 24 + opts.radius * Math.pow(e, 0.6);
            w.div.style.left = (w.x - rad) + 'px'; w.div.style.top = (w.y - rad) + 'px';
            w.div.style.width = (rad * 2) + 'px'; w.div.style.height = (rad * 2) + 'px';
            w.disp.setAttribute('scale', (opts.strength * Math.pow(1 - e, 1.5)).toFixed(2));
          }
        }
      },
      render(g) {
        if (!opts.rings && supported) return;
        g.globalCompositeOperation = 'lighter';
        waves.forEach((w) => {
          if (opts.style === 'jelly') return;
          const e = w.t, rad = 24 + opts.radius * Math.pow(e, 0.6);
          const a = (1 - e) * (supported ? 0.22 : 0.7);
          g.strokeStyle = 'rgba(200,230,255,' + a.toFixed(3) + ')';
          g.lineWidth = supported ? 6 * (1 - e) + 1 : 3 * (1 - e) + 0.5;
          g.beginPath(); g.arc(w.x, w.y, rad * 0.72, 0, util.TAU); g.stroke();
          if (!supported) { g.strokeStyle = 'rgba(255,255,255,' + (a * 0.4).toFixed(3) + ')'; g.lineWidth = 1; g.beginPath(); g.arc(w.x, w.y, rad * 0.55, 0, util.TAU); g.stroke(); }
        });
      },
      destroy() { waves.forEach(remove); waves.length = 0; if (root) root.remove(); root = null; svg = null; },
    };
  },
});
