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
