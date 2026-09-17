/* Trail: soap bubbles rise from the pointer and pop. */
CursorFX.registerTrail('bubbles', {
  label: 'Bubbles',
  icon: '🫧',
  description: 'Soap bubbles float up from the pointer, wobble, and pop.',
  defaults: { rate: 1, color: '120,200,255' },
  create(opts, api) {
    const { state, util } = api;
    const list = util.particleList();
    let acc = 0;
    return {
      update(f) {
        if (state.seen && !state.reduceMotion) {
          acc += (0.05 + state.speed * 0.08) * opts.rate * f;
          while (acc >= 1) { acc -= 1; list.add({ x: state.x, y: state.y, vx: util.rand(-0.5, 0.5), vy: util.rand(-1.4, -0.6), r: util.rand(3, 9), life: util.rand(60, 120), max: 120, ph: util.rand(0, 6) }); }
          list.cap(150);
        }
        list.step(f, (p) => { p.x += (p.vx + Math.sin(state.time * 3 + p.ph) * 0.4) * f; p.y += p.vy * f; p.r += 0.02 * f; });
      },
      render(g) {
        list.items.forEach((p) => {
          const t = p.life / p.max, a = Math.min(1, t * 4);
          if (t < 0.08) {
            g.strokeStyle = 'rgba(255,255,255,' + (t * 8).toFixed(2) + ')'; g.lineWidth = 1;
            g.beginPath(); g.arc(p.x, p.y, p.r * (1 + (0.08 - t) * 10), 0, util.TAU); g.stroke();
            return;
          }
          g.fillStyle = 'rgba(' + opts.color + ',' + (0.18 * a).toFixed(3) + ')';
          g.beginPath(); g.arc(p.x, p.y, p.r, 0, util.TAU); g.fill();
          g.strokeStyle = 'rgba(255,255,255,' + (0.7 * a).toFixed(3) + ')'; g.lineWidth = 1; g.stroke();
          g.fillStyle = 'rgba(255,255,255,' + (0.8 * a).toFixed(3) + ')';
          g.beginPath(); g.arc(p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.2, 0, util.TAU); g.fill();
        });
      },
    };
  },
});
