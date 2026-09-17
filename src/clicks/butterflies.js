/* Click: a kaleidoscope of butterflies flutters out from the click and flies away. */
CursorFX.registerClick('butterflies', {
  label: 'Butterflies',
  icon: '🦋',
  description: 'A flock of butterflies bursts from the click, flaps its wings and flutters away in every direction.',
  sound: true,
  defaults: { count: 10, colors: ['#ff8fab', '#ffd166', '#8ecae6', '#c77dff', '#80ed99', '#ffb703'], size: 14 },
  create(opts, api) {
    const { state, util, audio } = api;
    const { TAU, rand } = util;
    const list = util.particleList();
    function wing(g, s, flap, up) {
      g.beginPath();
      g.moveTo(0, 0);
      g.bezierCurveTo(s * 0.6 * flap, -s * 0.9 * (up ? 1 : -0.5), s * 1.4 * flap, -s * 0.4 * (up ? 1 : -0.6), s * 1.2 * flap, s * 0.25 * (up ? 1 : 1.6));
      g.bezierCurveTo(s * 0.9 * flap, s * 0.55 * (up ? 1 : 1.5), s * 0.3 * flap, s * 0.4, 0, 0);
      g.closePath();
    }
    return {
      trigger(x, y) {
        const n = state.reduceMotion ? Math.ceil(opts.count / 2) : opts.count;
        for (let i = 0; i < n; i++) {
          const a = rand(0, TAU), sp = rand(1.5, 4);
          list.add({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, a, size: rand(0.7, 1.3) * opts.size, color: util.pick(opts.colors), edge: 'rgba(0,0,0,0.35)', flap: rand(0, 6), fs: rand(0.35, 0.6), wander: rand(0, 6), life: rand(150, 260), max: 260 });
        }
        list.cap(120);
        audio.whoosh({ from: 600, to: 2400, dur: 0.25, peak: 0.12, q: 2 });
      },
      update(f) {
        list.step(f, (p) => {
          p.wander += 0.05 * f;
          p.vx += Math.cos(p.wander * 1.7) * 0.12 * f; p.vy += (Math.sin(p.wander * 1.3) * 0.12 - 0.02) * f;
          const d = Math.pow(0.985, f); p.vx *= d; p.vy *= d;
          p.x += p.vx * f; p.y += p.vy * f;
          p.flap += p.fs * f;
          p.a = Math.atan2(p.vy, p.vx) + Math.PI / 2;
        });
      },
      render(g) {
        list.items.forEach((p) => {
          const t = p.life / p.max, a = Math.min(1, t * 3);
          const flap = 0.35 + 0.65 * Math.abs(Math.cos(p.flap));
          g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.globalAlpha = a;
          g.fillStyle = p.color; g.strokeStyle = p.edge; g.lineWidth = 1;
          for (const side of [-1, 1]) {
            g.save(); g.scale(side, 1);
            wing(g, p.size, flap, true); g.fill(); g.stroke();
            wing(g, p.size * 0.75, flap, false); g.fill(); g.stroke();
            g.fillStyle = 'rgba(255,255,255,0.45)';
            g.beginPath(); g.arc(p.size * 0.7 * flap, -p.size * 0.3, p.size * 0.14, 0, TAU); g.fill();
            g.fillStyle = p.color;
            g.restore();
          }
          g.fillStyle = '#2b2b3a';
          g.beginPath(); g.ellipse(0, 0, p.size * 0.12, p.size * 0.55, 0, 0, TAU); g.fill();
          g.strokeStyle = '#2b2b3a'; g.lineWidth = 1;
          g.beginPath(); g.moveTo(0, -p.size * 0.5); g.lineTo(-p.size * 0.3, -p.size * 0.95); g.moveTo(0, -p.size * 0.5); g.lineTo(p.size * 0.3, -p.size * 0.95); g.stroke();
          g.restore();
        });
      },
    };
  },
});
