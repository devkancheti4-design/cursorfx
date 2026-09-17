/* Click: a burst of soap bubbles that rise and pop one by one. */
CursorFX.registerClick('bubbles', {
  label: 'Bubble burst',
  icon: '🫧',
  description: 'A cloud of soap bubbles bursts from the click, drifts upward and pops with tiny rings.',
  sound: true,
  defaults: { count: 18, color: '120,200,255' },
  create(opts, api) {
    const { state, util, audio } = api;
    const list = util.particleList();
    return {
      trigger(x, y) {
        const n = state.reduceMotion ? opts.count / 2 : opts.count;
        for (let i = 0; i < n; i++) {
          const a = util.rand(0, util.TAU), sp = util.rand(1, 4);
          list.add({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, r: util.rand(4, 14), ph: util.rand(0, 6), life: util.rand(50, 110), max: 110, popped: false });
        }
        list.cap(200);
        audio.tone({ freq: 500, slideTo: 1500, dur: 0.12, type: 'sine', peak: 0.12 });
      },
      update(f) {
        list.step(f, (p) => {
          const d = Math.pow(0.95, f); p.vx *= d; p.vy *= d; p.vy -= 0.02 * f;
          p.x += (p.vx + Math.sin(state.time * 3 + p.ph) * 0.4) * f; p.y += p.vy * f;
          if (p.life < 8 && !p.popped) { p.popped = true; audio.tone({ freq: util.rand(1200, 2600), dur: 0.05, type: 'sine', peak: 0.08 }); }
        });
      },
      render(g) {
        list.items.forEach((p) => {
          const t = p.life / p.max;
          if (t < 0.08) { g.strokeStyle = 'rgba(255,255,255,' + (t * 8).toFixed(2) + ')'; g.lineWidth = 1; g.beginPath(); g.arc(p.x, p.y, p.r * (1 + (0.08 - t) * 10), 0, util.TAU); g.stroke(); return; }
          g.fillStyle = 'rgba(' + opts.color + ',0.18)'; g.beginPath(); g.arc(p.x, p.y, p.r, 0, util.TAU); g.fill();
          g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 1; g.stroke();
          g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.2, 0, util.TAU); g.fill();
        });
      },
    };
  },
});
