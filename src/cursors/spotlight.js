/* Cursor: darkens the page except a soft circle of light around the pointer. */
CursorFX.registerCursor('spotlight', {
  label: 'Spotlight',
  icon: '🔦',
  description: 'Dims the whole page and lights only a soft circle around your pointer. Hold to widen the beam.',
  defaults: { radius: 170, darkness: 0.82, softness: 0.5, color: '0,0,0' },
  create(opts, api) {
    const { state, util } = api;
    const p = { x: 0, y: 0, r: opts.radius, a: 0 };
    return {
      onEnter() { p.x = state.x; p.y = state.y; },
      update(f) {
        const k = Math.min(1, 0.35 * f);
        p.x += (state.x - p.x) * k; p.y += (state.y - p.y) * k;
        const target = opts.radius * (state.down ? 1.6 : state.hover ? 1.25 : 1) + state.speed * 2;
        p.r += (target - p.r) * Math.min(1, 0.15 * f);
        p.a += ((state.seen && state.inside ? 1 : 0) - p.a) * Math.min(1, 0.08 * f);
      },
      render(g) {
        if (p.a < 0.01) return;
        g.fillStyle = 'rgba(' + opts.color + ',' + (opts.darkness * p.a).toFixed(3) + ')';
        g.fillRect(0, 0, state.w, state.h);
        g.globalCompositeOperation = 'destination-out';
        const grad = g.createRadialGradient(p.x, p.y, p.r * opts.softness, p.x, p.y, p.r);
        grad.addColorStop(0, 'rgba(0,0,0,1)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad;
        g.beginPath(); g.arc(p.x, p.y, p.r, 0, util.TAU); g.fill();
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = 'rgba(255,255,255,0.9)';
        g.beginPath(); g.arc(state.x, state.y, 3, 0, util.TAU); g.fill();
      },
    };
  },
});
