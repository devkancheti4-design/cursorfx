/* Cursor: text that waves behind the pointer like a flag on a rope. */
CursorFX.registerCursor('textflag', {
  label: 'Text flag',
  icon: '🏁',
  description: 'Your own words trail behind the pointer and wave like a flag.',
  defaults: { text: 'CURSORFX', color: '#ffd23f', font: '700 16px system-ui, -apple-system, sans-serif', gap: 12 },
  create(opts, api) {
    const { state } = api;
    const chars = Array.from(opts.text || 'HELLO');
    const N = chars.length + 1;
    const xs = new Float32Array(N), ys = new Float32Array(N);
    return {
      onEnter() { xs.fill(state.x); ys.fill(state.y); },
      update(f) {
        const k0 = Math.min(1, 0.7 * f), k = Math.min(1, 0.4 * f);
        xs[0] += (state.x - xs[0]) * k0; ys[0] += (state.y - ys[0]) * k0;
        for (let i = 1; i < N; i++) {
          xs[i] += (xs[i - 1] - xs[i]) * k; ys[i] += (ys[i - 1] - ys[i]) * k;
          const dx = xs[i] - xs[i - 1], dy = ys[i] - ys[i - 1], d = Math.hypot(dx, dy) || 1;
          if (d < opts.gap) { xs[i] = xs[i - 1] + dx / d * opts.gap; ys[i] = ys[i - 1] + dy / d * opts.gap; }
        }
      },
      render(g) {
        if (!state.seen) return;
        g.font = opts.font; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = opts.color; g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 3; g.lineJoin = 'round';
        for (let i = 1; i < N; i++) {
          const dx = xs[i - 1] - xs[i], dy = ys[i - 1] - ys[i];
          const a = Math.atan2(dy, dx);
          const wave = Math.sin(state.time * 8 - i * 0.6) * (2 + i * 0.4);
          g.save(); g.translate(xs[i] - Math.sin(a) * wave, ys[i] + Math.cos(a) * wave); g.rotate(a);
          const ch = chars[i - 1];
          g.strokeText(ch, 0, 0); g.fillText(ch, 0, 0);
          g.restore();
        }
        g.fillStyle = '#fff'; g.beginPath(); g.arc(state.x, state.y, 3, 0, Math.PI * 2); g.fill();
      },
    };
  },
});
