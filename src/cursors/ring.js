/* Cursor: minimal dot + lagging ring, the modern portfolio-site cursor. */
CursorFX.registerCursor('ring', {
  label: 'Dot & ring',
  icon: '◎',
  description: 'A small dot with a lagging ring that expands over links and buttons and shrinks on click.',
  defaults: { color: '#ffffff', size: 18, dot: 4, lag: 0.22, blend: true },
  create(opts, api) {
    const { state, util } = api;
    const ring = { x: 0, y: 0, r: opts.size, a: 0 };
    return {
      onEnter() { ring.x = state.x; ring.y = state.y; },
      update(f) {
        const k = Math.min(1, opts.lag * f);
        ring.x += (state.x - ring.x) * k; ring.y += (state.y - ring.y) * k;
        const target = state.down ? opts.size * 0.6 : state.hover ? opts.size * 2.2 : opts.size + state.speed * 0.4;
        ring.r += (target - ring.r) * Math.min(1, 0.2 * f);
        ring.a += ((state.inside && state.seen ? 1 : 0) - ring.a) * Math.min(1, 0.15 * f);
      },
      render(g) {
        if (ring.a < 0.01) return;
        g.globalAlpha = ring.a;
        if (opts.blend) g.globalCompositeOperation = 'difference';
        g.strokeStyle = opts.color; g.lineWidth = state.hover ? 1 : 1.5;
        g.beginPath(); g.arc(ring.x, ring.y, ring.r, 0, util.TAU); g.stroke();
        if (state.hover) { g.globalAlpha = ring.a * 0.15; g.fillStyle = opts.color; g.fill(); g.globalAlpha = ring.a; }
        g.fillStyle = opts.color;
        g.beginPath(); g.arc(state.x, state.y, opts.dot * (state.down ? 1.6 : 1), 0, util.TAU); g.fill();
      },
    };
  },
});
