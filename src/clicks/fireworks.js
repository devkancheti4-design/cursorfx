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
