/* Cursor: a silky rainbow ribbon that twists behind the pointer. */
CursorFX.registerCursor('ribbon', {
  label: 'Silk ribbon',
  icon: '🎀',
  description: 'A flowing silk ribbon that twists and narrows behind your pointer.',
  defaults: { length: 40, width: 16, colors: ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#c77dff'] },
  create(opts, api) {
    const { state, util } = api;
    const N = Math.max(6, opts.length | 0);
    const xs = new Float32Array(N), ys = new Float32Array(N);
    return {
      onEnter() { xs.fill(state.x); ys.fill(state.y); },
      update(f) {
        const k0 = Math.min(1, 0.7 * f), k = Math.min(1, 0.5 * f);
        xs[0] += (state.x - xs[0]) * k0; ys[0] += (state.y - ys[0]) * k0;
        for (let i = 1; i < N; i++) { xs[i] += (xs[i - 1] - xs[i]) * k; ys[i] += (ys[i - 1] - ys[i]) * k; }
      },
      render(g) {
        if (!state.seen) return;
        const cols = opts.colors;
        for (let i = 0; i < N - 1; i++) {
          const t = i / N;
          const w = opts.width * (1 - t) * (0.55 + 0.45 * Math.abs(Math.sin(state.time * 5 + i * 0.35)));
          const dx = xs[i + 1] - xs[i], dy = ys[i + 1] - ys[i];
          const len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len * w * 0.5, ny = dx / len * w * 0.5;
          const dx2 = (i + 2 < N ? xs[i + 2] : xs[i + 1]) - xs[i + 1], dy2 = (i + 2 < N ? ys[i + 2] : ys[i + 1]) - ys[i + 1];
          const len2 = Math.hypot(dx2, dy2) || 1;
          const w2 = opts.width * (1 - (i + 1) / N) * (0.55 + 0.45 * Math.abs(Math.sin(state.time * 5 + (i + 1) * 0.35)));
          const nx2 = -dy2 / len2 * w2 * 0.5, ny2 = dx2 / len2 * w2 * 0.5;
          g.fillStyle = cols[Math.floor((i / N) * cols.length + state.time * 2) % cols.length];
          g.globalAlpha = 0.9 * (1 - t);
          g.beginPath();
          g.moveTo(xs[i] + nx, ys[i] + ny);
          g.lineTo(xs[i + 1] + nx2, ys[i + 1] + ny2);
          g.lineTo(xs[i + 1] - nx2, ys[i + 1] - ny2);
          g.lineTo(xs[i] - nx, ys[i] - ny);
          g.closePath(); g.fill();
        }
        g.globalAlpha = 1;
        g.fillStyle = '#fff';
        g.beginPath(); g.arc(state.x, state.y, 3, 0, util.TAU); g.fill();
      },
    };
  },
});
