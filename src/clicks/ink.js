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
