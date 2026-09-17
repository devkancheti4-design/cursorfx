/* Cursor: a working analog clock that follows the pointer. */
CursorFX.registerCursor('clock', {
  label: 'Clock',
  icon: '🕰️',
  description: 'A small analog clock showing the real time floats after your pointer.',
  defaults: { size: 44, color: '#ffffff', face: 'rgba(20,24,40,0.85)', accent: '#ff5252' },
  create(opts, api) {
    const { state, util } = api;
    const { TAU } = util;
    const p = { x: 0, y: 0 };
    return {
      onEnter() { p.x = state.x; p.y = state.y; },
      update(f) { const k = Math.min(1, 0.25 * f); p.x += (state.x - p.x) * k; p.y += (state.y - p.y) * k; },
      render(g) {
        if (!state.seen) return;
        const R = opts.size / 2, d = new Date();
        const s = d.getSeconds() + d.getMilliseconds() / 1000, m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60;
        g.translate(p.x + R + 8, p.y + R + 8);
        g.fillStyle = opts.face; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
        g.strokeStyle = opts.color; g.lineWidth = 2; g.stroke();
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * TAU, big = i % 3 === 0;
          g.lineWidth = big ? 2 : 1;
          g.beginPath(); g.moveTo(Math.cos(a) * (R - (big ? 7 : 4)), Math.sin(a) * (R - (big ? 7 : 4))); g.lineTo(Math.cos(a) * (R - 2), Math.sin(a) * (R - 2)); g.stroke();
        }
        const hand = (val, total, len, w, col) => {
          const a = (val / total) * TAU - Math.PI / 2;
          g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round';
          g.beginPath(); g.moveTo(-Math.cos(a) * 3, -Math.sin(a) * 3); g.lineTo(Math.cos(a) * len, Math.sin(a) * len); g.stroke();
        };
        hand(h, 12, R * 0.5, 3, opts.color); hand(m, 60, R * 0.72, 2, opts.color); hand(s, 60, R * 0.8, 1, opts.accent);
        g.fillStyle = opts.accent; g.beginPath(); g.arc(0, 0, 2, 0, TAU); g.fill();
        g.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
        g.fillStyle = opts.color; g.beginPath(); g.arc(state.x, state.y, 3, 0, TAU); g.fill();
      },
    };
  },
});
