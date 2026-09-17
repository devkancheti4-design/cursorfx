/* Trail: fairy dust — twinkling four-point sparkles drift from the pointer. */
CursorFX.registerTrail('sparkles', {
  label: 'Fairy dust',
  icon: '✨',
  description: 'Twinkling sparkles spill from the pointer as it moves and drift gently down.',
  defaults: { colors: ['#ff7ce5', '#ffd166', '#7cf5ff', '#c3ff7c', '#ffffff'], rate: 1, size: 7 },
  create(opts, api) {
    const { state, util } = api;
    const list = util.particleList();
    let acc = 0;
    return {
      update(f) {
        if (state.seen && !state.reduceMotion) {
          acc += (0.12 + state.speed * 0.25) * opts.rate * f;
          while (acc >= 1) {
            acc -= 1;
            list.add({ x: state.x + util.rand(-4, 4), y: state.y + util.rand(-4, 4), vx: util.rand(-0.8, 0.8) - state.vx * 0.1, vy: util.rand(-0.6, 0.4), rot: util.rand(0, 6), spin: util.rand(-0.1, 0.1), size: util.rand(0.5, 1.2) * opts.size, life: util.rand(35, 70), max: 70, color: util.pick(opts.colors), tw: util.rand(0, 6) });
          }
          list.cap(400);
        }
        list.step(f, (p) => { p.x += p.vx * f; p.y += p.vy * f; p.vy += 0.03 * f; p.rot += p.spin * f; });
      },
      render(g) {
        list.items.forEach((p) => {
          const t = p.life / p.max;
          const tw = 0.6 + 0.4 * Math.sin(state.time * 12 + p.tw);
          g.globalAlpha = Math.min(1, t * 1.5) * tw;
          g.fillStyle = p.color;
          util.star(g, p.x, p.y, p.size * (0.4 + t * 0.6), 4, 0.35, p.rot);
          g.fill();
        });
      },
    };
  },
});
