/* Cursor: a little ghost that floats after the pointer, leaving fading echoes. */
CursorFX.registerCursor('ghost', {
  label: 'Ghost',
  icon: '👻',
  description: 'A friendly ghost floats after your pointer, wobbles as it moves and leaves fading echoes behind.',
  defaults: { color: 'rgba(240,244,255,0.92)', size: 26, echoes: 6 },
  create(opts, api) {
    const { state, util } = api;
    const { TAU } = util;
    const p = { x: 0, y: 0 };
    const echoes = [];
    let echoTimer = 0;
    function drawGhost(g, x, y, s, alpha, look, wob) {
      g.save();
      g.translate(x, y);
      g.globalAlpha = alpha;
      g.fillStyle = opts.color;
      g.beginPath();
      g.arc(0, -s * 0.15, s * 0.5, Math.PI, 0);
      g.lineTo(s * 0.5, s * 0.45);
      for (let i = 0; i < 4; i++) {
        const bx = s * 0.5 - (i + 0.5) * (s / 4);
        g.quadraticCurveTo(bx + s / 8, s * 0.45 + (i % 2 ? -1 : 1) * s * 0.12 + Math.sin(wob + i) * s * 0.05, bx, s * 0.45);
      }
      g.lineTo(-s * 0.5, s * 0.45);
      g.closePath();
      g.fill();
      g.fillStyle = '#1b1d2a';
      const ex = look.x * s * 0.08, ey = look.y * s * 0.06;
      g.beginPath(); g.ellipse(-s * 0.17 + ex, -s * 0.18 + ey, s * 0.07, s * 0.1, 0, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(s * 0.17 + ex, -s * 0.18 + ey, s * 0.07, s * 0.1, 0, 0, TAU); g.fill();
      g.restore();
    }
    return {
      onEnter() { p.x = state.x; p.y = state.y; },
      update(f, dt) {
        const k = Math.min(1, 0.14 * f);
        p.x += (state.x - p.x) * k; p.y += (state.y - p.y) * k;
        echoTimer += dt;
        if (echoTimer > 0.06 && state.speed > 1.5) {
          echoTimer = 0;
          echoes.push({ x: p.x, y: p.y, life: 1 });
          if (echoes.length > opts.echoes) echoes.shift();
        }
        for (let i = echoes.length - 1; i >= 0; i--) { echoes[i].life -= 0.035 * f; if (echoes[i].life <= 0) echoes.splice(i, 1); }
      },
      render(g) {
        if (!state.seen) return;
        const look = { x: util.clamp(state.vx / 12, -1, 1), y: util.clamp(state.vy / 12, -1, 1) };
        const wob = state.time * 6;
        echoes.forEach((e) => drawGhost(g, e.x, e.y, opts.size, e.life * 0.25, look, wob));
        const bob = Math.sin(state.time * 3) * 3;
        drawGhost(g, p.x, p.y + bob, opts.size * (state.down ? 0.85 : 1), 1, look, wob);
      },
    };
  },
});
