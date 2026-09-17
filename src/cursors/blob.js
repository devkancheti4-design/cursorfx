/* Cursor: a gooey blob that stretches with velocity and drags a few droplets. */
CursorFX.registerCursor('blob', {
  label: 'Gooey blob',
  icon: '🫧',
  description: 'A soft blob that stretches along your movement, grows over links and squashes when you click.',
  defaults: { color: '#7c5cff', size: 20, droplets: 4 },
  create(opts, api) {
    const { state, util } = api;
    const { TAU } = util;
    const pts = [];
    for (let i = 0; i <= opts.droplets; i++) pts.push({ x: 0, y: 0 });
    let size = opts.size;
    return {
      onEnter() { pts.forEach((p) => { p.x = state.x; p.y = state.y; }); },
      update(f) {
        const k0 = Math.min(1, 0.35 * f), k = Math.min(1, 0.3 * f);
        pts[0].x += (state.x - pts[0].x) * k0; pts[0].y += (state.y - pts[0].y) * k0;
        for (let i = 1; i < pts.length; i++) { pts[i].x += (pts[i - 1].x - pts[i].x) * k; pts[i].y += (pts[i - 1].y - pts[i].y) * k; }
        const target = opts.size * (state.hover ? 1.7 : 1) * (state.down ? 0.75 : 1);
        size += (target - size) * Math.min(1, 0.2 * f);
      },
      render(g) {
        if (!state.seen) return;
        g.fillStyle = opts.color;
        g.globalAlpha = state.hover ? 0.6 : 0.92;
        for (let i = pts.length - 1; i >= 1; i--) {
          const r = size * (1 - i / (pts.length + 1)) * 0.7;
          g.beginPath(); g.arc(pts[i].x, pts[i].y, r, 0, TAU); g.fill();
        }
        const stretch = 1 + util.clamp(state.speed * 0.03, 0, 0.6);
        g.translate(pts[0].x, pts[0].y);
        g.rotate(state.heading);
        g.beginPath(); g.ellipse(0, 0, size * stretch, size / Math.sqrt(stretch), 0, 0, TAU); g.fill();
        g.globalAlpha = 0.5;
        g.fillStyle = '#ffffff';
        g.beginPath(); g.ellipse(-size * 0.25, -size * 0.3, size * 0.28, size * 0.16, -0.5, 0, TAU); g.fill();
      },
    };
  },
});
