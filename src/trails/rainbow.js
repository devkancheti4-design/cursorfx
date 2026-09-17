/* Trail: a classic seven-band rainbow ribbon. */
CursorFX.registerTrail('rainbow', {
  label: 'Rainbow',
  icon: '🌈',
  description: 'A seven-band rainbow streams behind the pointer and fades at the tail.',
  defaults: { length: 45, width: 22 },
  create(opts, api) {
    const { state } = api;
    const N = Math.max(6, opts.length | 0);
    const xs = new Float32Array(N), ys = new Float32Array(N);
    const BANDS = ['#ff0000', '#ff8a00', '#ffe600', '#22c55e', '#00b7ff', '#4f46e5', '#a855f7'];
    return {
      onEnter() { xs.fill(state.x); ys.fill(state.y); },
      update(f) {
        const k0 = Math.min(1, 0.8 * f), k = Math.min(1, 0.55 * f);
        xs[0] += (state.x - xs[0]) * k0; ys[0] += (state.y - ys[0]) * k0;
        for (let i = 1; i < N; i++) { xs[i] += (xs[i - 1] - xs[i]) * k; ys[i] += (ys[i - 1] - ys[i]) * k; }
      },
      render(g) {
        if (!state.seen) return;
        const bw = opts.width / BANDS.length;
        g.lineCap = 'round'; g.lineJoin = 'round';
        for (let i = 0; i < N - 1; i++) {
          const dx = xs[i + 1] - xs[i], dy = ys[i + 1] - ys[i], len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len, ny = dx / len;
          const taper = 1 - i / N;
          g.globalAlpha = 0.9 * taper;
          g.lineWidth = Math.max(0.5, bw * taper + 0.6);
          for (let b = 0; b < BANDS.length; b++) {
            const off = (b - (BANDS.length - 1) / 2) * bw * taper;
            g.strokeStyle = BANDS[b];
            g.beginPath(); g.moveTo(xs[i] + nx * off, ys[i] + ny * off); g.lineTo(xs[i + 1] + nx * off, ys[i + 1] + ny * off); g.stroke();
          }
        }
      },
    };
  },
});
