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
