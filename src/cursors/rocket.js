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
