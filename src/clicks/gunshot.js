/* Click: gunshot — muzzle flash, sparks, smoke, a cracked bullet hole that fades, and an ejected casing. */
CursorFX.registerClick('gunshot', {
  label: 'Gunshot',
  icon: '🎯',
  description: 'Every click fires a shot: a flash, sparks, a puff of smoke and a cracked bullet hole that fades away. Hold to keep firing.',
  sound: true,
  defaults: { holdFor: 6, cracks: true, auto: true, fireRate: 7, casings: true },
  create(opts, api) {
    const { state, util, audio } = api;
    const { TAU, rand } = util;
    const holes = [], sparks = [], smoke = [], flashes = [], casings = [];
    let sinceShot = 999;

    function bang() {
      audio.pop({ freq: 3200, q: 0.9, peak: 1, dur: 0.05, attack: 0.001 });
      audio.pop({ freq: 160, q: 0.6, peak: 1, dur: 0.28, type: 'lowpass', attack: 0.002 });
      audio.whoosh({ from: 2200, to: 180, dur: 0.45, peak: 0.22, q: 0.8 });
    }

    function shoot(x, y) {
      sinceShot = 0;
      state.shots = (state.shots || 0) + 1;   // lets a gun cursor kick on every shot, including held fire
      flashes.push({ x, y, life: 5, max: 5, rot: rand(0, TAU) });
      const n = state.reduceMotion ? 6 : 14;
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU), sp = rand(2, 9);
        sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, life: rand(10, 26), max: 26, len: rand(3, 9) });
      }
      for (let i = 0; i < (state.reduceMotion ? 2 : 5); i++) {
        smoke.push({ x: x + rand(-4, 4), y: y + rand(-4, 4), vx: rand(-0.4, 0.4), vy: rand(-1.2, -0.4), r: rand(3, 6), life: rand(50, 90), max: 90 });
      }
      const cracks = [];
      if (opts.cracks) {
        const count = util.randInt(4, 8);
        for (let i = 0; i < count; i++) {
          const a = (i / count) * TAU + rand(-0.3, 0.3), len = rand(10, 34);
          const pts = [];
          let px = 0, py = 0;
          const segs = util.randInt(2, 4);
          for (let s = 1; s <= segs; s++) {
            const d = (len / segs) * s, wob = rand(-0.25, 0.25);
            px = Math.cos(a + wob) * d; py = Math.sin(a + wob) * d;
            pts.push(px, py);
          }
          cracks.push({ pts, w: rand(0.6, 1.4) });
        }
      }
      holes.push({ x, y, r: rand(4.5, 7), cracks, life: opts.holdFor * 60 + 90, max: opts.holdFor * 60 + 90, seed: rand(0, TAU) });
      if (holes.length > 60) holes.shift();
      if (opts.casings && !state.gunEjects) casings.push({ x, y, vx: rand(2, 4.5), vy: rand(-5, -3), rot: rand(0, TAU), spin: rand(0.2, 0.5), life: 60, max: 60 });
      bang();
      if (state.reduceMotion) return;
      if (sparks.length > 500) sparks.splice(0, sparks.length - 500);
    }

    function tick(list, f, fn) {
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.life -= f;
        if (p.life <= 0) { list.splice(i, 1); continue; }
        fn(p);
      }
    }

    return {
      trigger(x, y) { shoot(x, y); },
      update(f, dt) {
        sinceShot += dt;
        if (opts.auto && state.down && !state.downIgnored && state.seen && sinceShot > 1 / opts.fireRate) shoot(state.x, state.y);
        tick(flashes, f, () => {});
        tick(sparks, f, (p) => { p.vy += 0.25 * f; const d = Math.pow(0.9, f); p.vx *= d; p.vy *= d; p.x += p.vx * f; p.y += p.vy * f; });
        tick(smoke, f, (p) => { p.x += p.vx * f; p.y += p.vy * f; p.r += 0.35 * f; p.vy *= Math.pow(0.98, f); });
        tick(holes, f, () => {});
        tick(casings, f, (p) => { p.vy += 0.35 * f; p.x += p.vx * f; p.y += p.vy * f; p.rot += p.spin * f; });
      },
      render(g) {
        // Bullet holes: a dark crater with a light rim and glass cracks; fade over the last 1.5 s.
        holes.forEach((h) => {
          const a = Math.min(1, h.life / 90);
          g.globalAlpha = a;
          if (h.cracks.length) {
            g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineCap = 'round';
            h.cracks.forEach((c) => {
              g.lineWidth = c.w; g.beginPath(); g.moveTo(h.x, h.y);
              for (let i = 0; i < c.pts.length; i += 2) g.lineTo(h.x + c.pts[i], h.y + c.pts[i + 1]);
              g.stroke();
            });
            g.strokeStyle = 'rgba(0,0,0,0.35)';
            h.cracks.forEach((c) => {
              g.lineWidth = c.w * 0.5; g.beginPath(); g.moveTo(h.x + 0.6, h.y + 0.6);
              for (let i = 0; i < c.pts.length; i += 2) g.lineTo(h.x + c.pts[i] + 0.6, h.y + c.pts[i + 1] + 0.6);
              g.stroke();
            });
          }
          g.fillStyle = 'rgba(200,205,215,0.45)';
          g.beginPath(); g.arc(h.x, h.y, h.r * 1.9, 0, TAU); g.fill();
          g.fillStyle = 'rgba(70,72,80,0.9)';
          g.beginPath(); g.arc(h.x, h.y, h.r * 1.25, 0, TAU); g.fill();
          g.fillStyle = '#07070a';
          g.beginPath();
          for (let i = 0; i < 9; i++) { const ang = (i / 9) * TAU, rr = h.r * (0.8 + 0.25 * Math.sin(h.seed + i * 2.1)); if (i === 0) g.moveTo(h.x + Math.cos(ang) * rr, h.y + Math.sin(ang) * rr); else g.lineTo(h.x + Math.cos(ang) * rr, h.y + Math.sin(ang) * rr); }
          g.closePath(); g.fill();
        });
        g.globalAlpha = 1;
        // Smoke.
        smoke.forEach((p) => { g.fillStyle = 'rgba(150,150,160,' + ((p.life / p.max) * 0.35).toFixed(3) + ')'; g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill(); });
        // Casings.
        casings.forEach((p) => {
          g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.globalAlpha = Math.min(1, p.life / 15);
          g.fillStyle = '#d4a53a'; g.fillRect(-4, -1.5, 8, 3); g.fillStyle = '#8a6a1e'; g.fillRect(-4, -1.5, 1.5, 3);
          g.restore();
        });
        // Flash and sparks on top, additive.
        g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
        flashes.forEach((p) => {
          const t = p.life / p.max;
          const grad = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, 40 * t + 10);
          grad.addColorStop(0, 'rgba(255,250,220,' + t.toFixed(2) + ')'); grad.addColorStop(0.4, 'rgba(255,190,80,' + (t * 0.6).toFixed(2) + ')'); grad.addColorStop(1, 'rgba(255,120,30,0)');
          g.fillStyle = grad; g.beginPath(); g.arc(p.x, p.y, 40 * t + 10, 0, TAU); g.fill();
          g.strokeStyle = 'rgba(255,240,200,' + t.toFixed(2) + ')'; g.lineWidth = 2;
          for (let i = 0; i < 4; i++) { const a = p.rot + i * (TAU / 4); g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + Math.cos(a) * 26 * t, p.y + Math.sin(a) * 26 * t); g.stroke(); }
        });
        sparks.forEach((p) => {
          const t = p.life / p.max, v = Math.hypot(p.vx, p.vy) || 1;
          g.strokeStyle = 'rgba(255,' + (150 + 100 * t | 0) + ',60,' + t.toFixed(2) + ')'; g.lineWidth = 1.5;
          g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx / v * p.len, p.y - p.vy / v * p.len); g.stroke();
        });
      },
    };
  },
});
