/* Click: particles explode from the click and reassemble into a different animal each time. */
CursorFX.registerClick('animals', {
  label: 'Particle animals',
  icon: '🦊',
  description: 'Every click bursts a cloud of particles that reassemble into a different animal. Move through it to push the particles aside. Set placement to "corner" to keep it out of the way of your content.',
  sound: true,
  defaults: {
    animals: ['🦊', '🐱', '🦋', '🐠', '🐰', '🦉', '🐶', '🐸', '🦁', '🐼', '🐘', '🦜', '🐢', '🦄'],
    count: 0, size: 0.55, dissolveAfter: 8, repel: 90, placement: 'click', opacity: 1,
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
      const frac = opts.placement === 'corner' ? Math.min(opts.size, 0.32) : opts.size;
      const S = Math.round(clamp(Math.min(state.w, state.h) * frac, 120, 700));
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
      let cx, cy;
      if (opts.placement === 'corner') {
        // Nearest corner to the click, tucked in with a margin, so the animal never sits on the content.
        cx = x < state.w / 2 ? s.halfW + 24 : state.w - s.halfW - 24;
        cy = y < state.h / 2 ? s.halfH + 24 : state.h - s.halfH - 24;
      } else {
        cx = clamp(x, s.halfW + 10, Math.max(s.halfW + 10, state.w - s.halfW - 10));
        cy = clamp(y, s.halfH + 10, Math.max(s.halfH + 10, state.h - s.halfH - 10));
      }
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
        g.globalAlpha = alpha[i] * opts.opacity;
        g.fillStyle = cols[i];
        const r = sz[i] * breathe;
        g.beginPath(); g.moveTo(px[i] + r, py[i]); g.arc(px[i], py[i], r, 0, TAU); g.fill();
      }
    }

    return { trigger, update, render, resize() { cache.clear(); }, clear() { mode = 'off'; } };
  },
});
