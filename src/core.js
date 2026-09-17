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
    cursorScale: 1,           // scales any cursor model around the pointer (0.5 = half size)
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
        if (i.render) {
          g.save();
          const cs = k === 2 && !i.__def.noScale ? Number(config.cursorScale) || 1 : 1;
          if (cs !== 1) { g.translate(state.x, state.y); g.scale(cs, cs); g.translate(-state.x, -state.y); }
          i.render(g);
          g.restore();
        }
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
