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
