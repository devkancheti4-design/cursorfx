/* Trail: a glowing neon line that follows the pointer's path and fades away. */
CursorFX.registerTrail('neon', {
  label: 'Neon line',
  icon: '💡',
  description: 'A glowing neon tube traces your path and fades out behind you. Hue cycles over time.',
  defaults: { width: 4, life: 0.7, hueSpeed: 60, color: null },
  create(opts, api) {
    const { state, util } = api;
    const pts = [];
    return {
      update(f, dt) {
        if (state.seen && state.inside) {
          const lastP = pts[pts.length - 1];
          if (!lastP || Math.hypot(lastP.x - state.x, lastP.y - state.y) > 2) pts.push({ x: state.x, y: state.y, t: state.time });
        }
        while (pts.length && state.time - pts[0].t > opts.life) pts.shift();
        if (pts.length > 400) pts.splice(0, pts.length - 400);
      },
      render(g) {
        if (pts.length < 2) return;
        g.lineCap = 'round'; g.lineJoin = 'round';
        const hue = (state.time * opts.hueSpeed) % 360;
        for (let pass = 0; pass < 3; pass++) {
          const w = opts.width * (pass === 0 ? 5 : pass === 1 ? 2.2 : 1);
          const alpha = pass === 0 ? 0.12 : pass === 1 ? 0.35 : 1;
          for (let i = 1; i < pts.length; i++) {
            const age = (state.time - pts[i].t) / opts.life;
            const a = (1 - age) * alpha;
            if (a <= 0.01) continue;
            g.strokeStyle = opts.color ? opts.color : util.hsla((hue + i * 1.5) % 360, 100, pass === 2 ? 85 : 60, 1);
            g.globalAlpha = a; g.lineWidth = w * (1 - age * 0.6);
            g.beginPath(); g.moveTo(pts[i - 1].x, pts[i - 1].y); g.lineTo(pts[i].x, pts[i].y); g.stroke();
          }
        }
      },
    };
  },
});
