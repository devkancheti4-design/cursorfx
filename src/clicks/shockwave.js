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
