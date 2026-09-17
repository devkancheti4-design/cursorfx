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
