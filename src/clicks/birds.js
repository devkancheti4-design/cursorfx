/* Click: a flock of birds takes off from the click and flies away. */
CursorFX.registerClick('birds', {
  label: 'Flock of birds',
  icon: '🐦',
  description: 'A flock of birds takes flight from the click, flapping and scattering across the page.',
  sound: true,
  defaults: { count: 9, color: '#f4f6ff' },
  create(opts, api) {
    const { state, util, audio } = api;
    const list = util.particleList();
    return {
      trigger(x, y) {
        const base = util.rand(-2.6, -0.5);
        const n = state.reduceMotion ? opts.count / 2 : opts.count;
        for (let i = 0; i < n; i++) {
          const a = base + util.rand(-0.5, 0.5), sp = util.rand(2.5, 4.5);
          list.add({ x: x + util.rand(-10, 10), y: y + util.rand(-10, 10), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, flap: util.rand(0, 6), fs: util.rand(0.35, 0.5), size: util.rand(6, 12), life: util.rand(120, 200), max: 200 });
        }
        list.cap(100);
        audio.tone({ freq: 1800, slideTo: 2600, dur: 0.08, type: 'sine', peak: 0.08 });
        setTimeout(() => audio.tone({ freq: 2200, slideTo: 1700, dur: 0.08, type: 'sine', peak: 0.06 }), 120);
      },
      update(f) { list.step(f, (p) => { p.x += p.vx * f; p.y += p.vy * f; p.flap += p.fs * f; p.vy += Math.sin(p.flap) * 0.02 * f; }); },
      render(g) {
        g.strokeStyle = opts.color; g.lineCap = 'round'; g.lineJoin = 'round';
        list.items.forEach((p) => {
          const t = p.life / p.max, w = Math.sin(p.flap);
          g.save(); g.translate(p.x, p.y); g.rotate(Math.atan2(p.vy, p.vx)); g.globalAlpha = Math.min(1, t * 3); g.lineWidth = 2;
          g.beginPath(); g.moveTo(-p.size, -w * p.size * 0.9); g.quadraticCurveTo(-p.size * 0.4, 0, 0, 0); g.quadraticCurveTo(p.size * 0.4, 0, p.size, -w * p.size * 0.9); g.stroke();
          g.restore();
        });
      },
    };
  },
});
