/* Click: water-like rings ripple outward from the click. */
CursorFX.registerClick('ripple', {
  label: 'Ripple waves',
  icon: '🌊',
  description: 'Concentric rings ripple out from every click like a drop on water.',
  sound: true,
  defaults: { color: '120,200,255', rings: 3, size: 120, speed: 1 },
  create(opts, api) {
    const { state, util, audio } = api;
    const list = util.particleList();
    return {
      trigger(x, y) {
        for (let i = 0; i < opts.rings; i++) list.add({ x, y, life: 60 + i * 12, max: 60 + i * 12, delay: i * 6 });
        audio.tone({ freq: 900, slideTo: 300, dur: 0.35, type: 'sine', peak: 0.2 });
      },
      update(f) { list.step(f, (p) => { p.delay -= f; }); },
      render(g) {
        list.items.forEach((p) => {
          if (p.delay > 0) return;
          const t = 1 - p.life / p.max;
          const r = opts.size * Math.pow(t, 0.6) * opts.speed;
          const a = (1 - t) * 0.9;
          g.strokeStyle = 'rgba(' + opts.color + ',' + a.toFixed(3) + ')';
          g.lineWidth = 3 * (1 - t) + 0.5;
          g.beginPath(); g.arc(p.x, p.y, r, 0, util.TAU); g.stroke();
          g.strokeStyle = 'rgba(255,255,255,' + (a * 0.35).toFixed(3) + ')'; g.lineWidth = 1;
          g.beginPath(); g.arc(p.x, p.y, r * 0.8, 0, util.TAU); g.stroke();
        });
      },
    };
  },
});
