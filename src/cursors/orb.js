/* Cursor: glowing orb with a rainbow comet trail. */
CursorFX.registerCursor('orb', {
  label: 'Glow orb',
  icon: '✨',
  description: 'A soft glowing orb with a rainbow comet tail and a ring that pulses on click.',
  defaults: { length: 40, hueSpeed: 40, color: '180,230,255' },
  create(opts, api) {
    const { state, util } = api;
    const { TAU } = util;
    const N = Math.max(4, opts.length | 0);
    const tx = new Float32Array(N), ty = new Float32Array(N);
    const ring = { x: 0, y: 0, r: 16, pulse: 0 };
    return {
      onEnter() { tx.fill(state.x); ty.fill(state.y); ring.x = state.x; ring.y = state.y; },
      onDown() { ring.pulse = 1; },
      update(f) {
        const k0 = Math.min(1, 0.6 * f), k = Math.min(1, 0.45 * f);
        tx[0] += (state.x - tx[0]) * k0; ty[0] += (state.y - ty[0]) * k0;
        for (let i = 1; i < N; i++) { tx[i] += (tx[i - 1] - tx[i]) * k; ty[i] += (ty[i - 1] - ty[i]) * k; }
        const kr = Math.min(1, 0.4 * f);
        ring.x += (state.x - ring.x) * kr; ring.y += (state.y - ring.y) * kr;
        const targetR = state.down ? 10 : state.hover ? 24 : 16;
        ring.r += (targetR - ring.r) * Math.min(1, 0.25 * f);
        ring.pulse *= Math.pow(0.9, f);
      },
      render(g) {
        if (!state.seen) return;
        g.globalCompositeOperation = 'lighter';
        const hue = (state.time * opts.hueSpeed) % 360;
        for (let i = N - 1; i >= 0; i--) {
          const t = i / N;
          g.fillStyle = util.hsla((hue + i * 4) % 360, 95, 68, 0.55 * (1 - t) + 0.05);
          g.beginPath(); g.arc(tx[i], ty[i], (1 - t) * 4.5 + 0.6, 0, TAU); g.fill();
        }
        const glow = g.createRadialGradient(state.x, state.y, 0, state.x, state.y, 34);
        glow.addColorStop(0, 'rgba(' + opts.color + ',0.55)');
        glow.addColorStop(1, 'rgba(' + opts.color + ',0)');
        g.fillStyle = glow; g.beginPath(); g.arc(state.x, state.y, 34, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(220,240,255,0.9)'; g.lineWidth = 1.5;
        g.beginPath(); g.arc(ring.x, ring.y, ring.r, 0, TAU); g.stroke();
        if (ring.pulse > 0.01) {
          g.strokeStyle = 'rgba(200,235,255,' + (ring.pulse * 0.8).toFixed(3) + ')'; g.lineWidth = 2;
          g.beginPath(); g.arc(ring.x, ring.y, ring.r + (1 - ring.pulse) * 70, 0, TAU); g.stroke();
        }
        g.fillStyle = '#fff'; g.beginPath(); g.arc(state.x, state.y, 2.6, 0, TAU); g.fill();
      },
    };
  },
});
