/* Click: a cannon of paper confetti with tumbling pieces and gravity. */
CursorFX.registerClick('confetti', {
  label: 'Confetti',
  icon: '🎉',
  description: 'A confetti cannon fires paper pieces that tumble, flutter and fall from every click.',
  sound: true,
  defaults: { count: 60, colors: ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ffffff'], spread: 1.1 },
  create(opts, api) {
    const { state, util, audio } = api;
    const list = util.particleList();
    return {
      trigger(x, y) {
        const n = state.reduceMotion ? opts.count / 2 : opts.count;
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + util.rand(-opts.spread, opts.spread), sp = util.rand(4, 13);
          list.add({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, w: util.rand(5, 10), h: util.rand(3, 6), rot: util.rand(0, 6), spin: util.rand(-0.3, 0.3), tilt: util.rand(0, 6), ts: util.rand(0.1, 0.3), color: util.pick(opts.colors), life: util.rand(90, 150), max: 150 });
        }
        list.cap(600);
        audio.pop({ freq: 1500, q: 0.8, peak: 0.6, dur: 0.12 });
        audio.pop({ freq: 200, q: 0.7, peak: 0.5, dur: 0.2, type: 'lowpass' });
      },
      update(f) {
        list.step(f, (p) => {
          p.vy += 0.16 * f; const d = Math.pow(0.95, f); p.vx *= d; p.vy *= d;
          p.x += (p.vx + Math.sin(p.tilt) * 0.6) * f; p.y += p.vy * f;
          p.rot += p.spin * f; p.tilt += p.ts * f;
        });
      },
      render(g) {
        list.items.forEach((p) => {
          const t = p.life / p.max;
          g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.scale(1, Math.max(0.15, Math.abs(Math.cos(p.tilt))));
          g.globalAlpha = Math.min(1, t * 4); g.fillStyle = p.color;
          g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          g.restore();
        });
      },
    };
  },
});
