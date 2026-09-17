/* Cursor: full-screen crosshair with live coordinates, like a design or mapping tool. */
CursorFX.registerCursor('crosshair', {
  label: 'Crosshair',
  icon: '✚',
  description: 'A shooting reticle with full-width guide lines and live x/y coordinates. It blooms and kicks with recoil when you fire; pair it with the Gunshot click effect.',
  defaults: { color: '#00e5ff', coords: true, dashed: true, recoil: true },
  create(opts, api) {
    const { state, util } = api;
    let r = 12, kick = 0, sinceKick = 0;
    return {
      onDown() { if (opts.recoil) { kick = 1; sinceKick = 0; } },
      update(f, dt) {
        sinceKick += dt;
        if (opts.recoil && state.down && !state.downIgnored && sinceKick > 1 / 7) { kick = 1; sinceKick = 0; }
        kick *= Math.pow(0.82, f);
        const base = state.hover ? 18 : 12;
        r += ((base + kick * 14) - r) * Math.min(1, 0.35 * f);
      },
      render(g) {
        if (!state.seen || !state.inside) return;
        const x = state.x + (Math.random() - 0.5) * kick * 3, y = state.y - kick * 6 + (Math.random() - 0.5) * kick * 3;
        g.strokeStyle = opts.color; g.lineWidth = 1; g.globalAlpha = 0.55;
        if (opts.dashed) g.setLineDash([6, 6]);
        g.beginPath(); g.moveTo(0, y); g.lineTo(x - r - 6, y); g.moveTo(x + r + 6, y); g.lineTo(state.w, y);
        g.moveTo(x, 0); g.lineTo(x, y - r - 6); g.moveTo(x, y + r + 6); g.lineTo(x, state.h); g.stroke();
        g.setLineDash([]); g.globalAlpha = 1; g.lineWidth = 1.5;
        g.beginPath(); g.arc(x, y, r, 0, util.TAU); g.stroke();
        g.beginPath(); g.moveTo(x - r - 6, y); g.lineTo(x - r + 4, y); g.moveTo(x + r - 4, y); g.lineTo(x + r + 6, y);
        g.moveTo(x, y - r - 6); g.lineTo(x, y - r + 4); g.moveTo(x, y + r - 4); g.lineTo(x, y + r + 6); g.stroke();
        g.fillStyle = opts.color; g.beginPath(); g.arc(x, y, 1.6, 0, util.TAU); g.fill();
        if (opts.coords) {
          g.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
          const label = Math.round(x) + ', ' + Math.round(y);
          const w = g.measureText(label).width + 10;
          const lx = x + 14 + w > state.w ? x - 14 - w : x + 14, ly = y + 30 > state.h ? y - 30 : y + 12;
          g.fillStyle = 'rgba(0,0,0,0.6)'; util.rrect(g, lx, ly, w, 18, 4); g.fill();
          g.fillStyle = opts.color; g.textBaseline = 'middle'; g.fillText(label, lx + 5, ly + 9);
        }
      },
    };
  },
});
