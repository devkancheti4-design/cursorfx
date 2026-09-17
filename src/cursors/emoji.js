/* Cursor: any emoji on a spring, tilting and stretching with movement. */
CursorFX.registerCursor('emoji', {
  label: 'Springy emoji',
  icon: '🐱',
  description: 'Any emoji as your pointer, attached with a spring so it bounces, tilts and stretches as you move.',
  defaults: { emoji: '🐱', size: 36, stiffness: 0.12, damping: 0.78 },
  create(opts, api) {
    const { state, util } = api;
    const p = { x: 0, y: 0, vx: 0, vy: 0 };
    return {
      onEnter() { p.x = state.x; p.y = state.y; p.vx = 0; p.vy = 0; },
      update(f) {
        p.vx += (state.x - p.x) * opts.stiffness * f;
        p.vy += (state.y - p.y) * opts.stiffness * f;
        const d = Math.pow(opts.damping, f);
        p.vx *= d; p.vy *= d;
        p.x += p.vx * f; p.y += p.vy * f;
      },
      render(g) {
        if (!state.seen) return;
        const sp = util.sprite(opts.emoji, opts.size);
        const v = Math.hypot(p.vx, p.vy);
        const h = Math.atan2(p.vy, p.vx);
        const stretch = 1 + util.clamp(v * 0.02, 0, 0.35);
        g.translate(p.x, p.y);
        g.rotate(h); g.scale(stretch, 1 / stretch); g.rotate(-h);
        g.rotate(util.clamp(p.vx * 0.03, -0.5, 0.5));
        if (state.down) g.scale(0.85, 0.85);
        g.drawImage(sp.canvas, -sp.w / 2, -sp.h / 2, sp.w, sp.h);
      },
    };
  },
});
