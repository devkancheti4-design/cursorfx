/* Cursors: a battle-royale style gun collection. Four models, six skins, recoil, muzzle flash
   and ejected casings. The muzzle tip is the hotspot, so shots land exactly where it points. */
(function () {
  const TAU = Math.PI * 2;

  const SKINS = {
    gold:    { label: 'Gold',    color: '#f5c542', stops: ['#fff6cf', '#f7cf4a', '#c9901a', '#6f4a08'], ink: '#4a3204', accent: '#fff3b0', shine: true, engrave: true },
    neon:    { label: 'Neon',    color: '#27f3ff', stops: ['#2a3044', '#171b28', '#0e111a', '#07080d'], ink: '#27f3ff', accent: '#ff3df2', glow: '#27f3ff' },
    crimson: { label: 'Crimson', color: '#e11d48', stops: ['#ff8a95', '#e11d48', '#9f1239', '#4c0519'], ink: '#2a0610', accent: '#ffffff', shine: true, stripe: true },
    camo:    { label: 'Camo',    color: '#5b6b3a', stops: ['#8a975c', '#5b6b3a', '#46552b', '#2f3a1c'], ink: '#1c2311', accent: '#d8c99a', blotches: ['#3d4a26', '#8a7a4a', '#2b2f1e', '#6f7f45'] },
    frost:   { label: 'Frost',   color: '#bfe9ff', stops: ['#ffffff', '#dff4ff', '#9fd8ff', '#4f8fc4'], ink: '#1d4a73', accent: '#5bd1ff', shine: true, sparkle: true },
    carbon:  { label: 'Carbon',  color: '#3a3d45', stops: ['#5a5e68', '#2c2f36', '#1a1c21', '#0b0c0f'], ink: '#000000', accent: '#ff7a1a', shine: true, weave: true },
  };
  const SKIN_CHOICES = Object.keys(SKINS).map((k) => ({ value: k, label: SKINS[k].label, color: SKINS[k].color }));

  // Every part is a clockwise polygon so the union fills cleanly under the nonzero rule.
  function poly(p, pts) {
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      area += a[0] * b[1] - b[0] * a[1];
    }
    const list = area < 0 ? pts.slice().reverse() : pts;
    p.moveTo(list[0][0], list[0][1]);
    for (let i = 1; i < list.length; i++) p.lineTo(list[i][0], list[i][1]);
    p.closePath();
  }
  function box(p, x, y, w, h) { poly(p, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]); }
  function line(g, x1, y1, x2, y2) { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }

  // Models face right in their own coordinates, with the muzzle tip at the origin and the grip
  // hanging down. `size` evens out their on-screen length; `grip` is the recoil pivot.
  const MODELS = {
    rifle: {
      size: 1, bounds: [-99, -12, 0, 23], grip: [-68, 9], port: [-57, -3],
      build(p) {
        box(p, -7, -2.6, 7, 5.2);                                  // muzzle brake
        box(p, -28, -1.7, 22, 3.4);                                // barrel
        box(p, -31, -9, 2, 5.5);                                   // front sight post
        box(p, -34, -5, 6.5, 1.6);
        poly(p, [[-48, -4.5], [-26, -3.8], [-26, 3.8], [-48, 4.5]]); // handguard
        poly(p, [[-73, -6], [-47, -6], [-47, 4.5], [-73, 5]]);       // receiver
        box(p, -67, -8.5, 20, 2.6);                                // top rail
        box(p, -68, -11, 3, 2.8);                                  // rear sight
        poly(p, [[-57, 4.5], [-49, 4.5], [-45, 12], [-43, 20], [-50, 22], [-52, 13]]); // magazine
        poly(p, [[-72, 4.5], [-64, 4.5], [-66, 16], [-74, 17]]);    // pistol grip
        poly(p, [[-96, -5], [-73, -4.2], [-73, 5], [-96, 10]]);     // stock
        box(p, -99, -5.5, 3, 16);                                  // butt pad
      },
      details(g, c) {
        g.fillStyle = c.ink;
        g.fillRect(-62, -3.8, 9, 2.6);                             // ejection port
        for (let i = 0; i < 4; i++) g.fillRect(-45 + i * 4.6, -1, 2.4, 2);
        g.beginPath(); g.arc(-50, -7.3, 1.3, 0, TAU); g.fill();
        g.strokeStyle = c.ink; g.lineWidth = c.lw * 0.75;
        g.beginPath(); g.moveTo(-64, 5); g.quadraticCurveTo(-62, 10.5, -56, 9.6); g.lineTo(-55, 5); g.stroke();
        line(g, -60, 5, -61, 8);
        g.globalAlpha = 0.5;
        line(g, -47, -6, -47, 4.5); line(g, -73, -6, -73, 5);
        line(g, -52, 9, -46.5, 8.5); line(g, -51, 14, -45, 13.5); line(g, -50, 19, -44, 18.5);
        g.globalAlpha = 0.9; g.fillStyle = c.accent;
        poly(g, [[-92, -1.2], [-79, -0.8], [-79, 1], [-92, 2]]); g.fill();
        g.globalAlpha = 1;
      },
    },

    sniper: {
      size: 0.78, bounds: [-141, -18, 0, 17], grip: [-102, 10], port: [-92, -3],
      build(p) {
        box(p, -9, -3, 9, 6);                                      // muzzle brake
        box(p, -60, -1.6, 52, 3.2);                                // long barrel
        poly(p, [[-84, -3.6], [-58, -3.2], [-58, 3.2], [-84, 4.2]]); // forend
        poly(p, [[-104, -5], [-82, -5], [-82, 4], [-104, 4.5]]);     // receiver
        box(p, -100, -14, 32, 5);                                  // scope tube
        poly(p, [[-72, -15.6], [-62, -16.6], [-62, -6.4], [-72, -7.4]]); // objective bell
        poly(p, [[-106, -14.6], [-99, -14], [-99, -9], [-106, -8.4]]);   // eyepiece
        box(p, -95, -9.2, 4, 4.4); box(p, -79, -9.2, 4, 4.4);      // mounts
        box(p, -88, -17.4, 5, 3.6);                                // turret
        poly(p, [[-97, 4], [-88, 4], [-88, 11], [-97, 11]]);         // magazine
        poly(p, [[-106, 4], [-99, 4], [-101, 15], [-108, 16]]);      // grip
        poly(p, [[-138, -5], [-104, -5], [-104, 4.5], [-116, 6], [-120, 12.5], [-138, 13.5]]); // stock
        poly(p, [[-134, -8], [-114, -7.2], [-114, -5], [-134, -5]]); // cheek rest
        box(p, -141, -5.5, 3, 19.5);                               // butt pad
      },
      details(g, c) {
        g.fillStyle = c.ink;
        g.fillRect(-96, -3.6, 9, 2.4);                             // ejection port
        g.beginPath(); g.arc(-89, 6.5, 1.8, 0, TAU); g.fill();       // bolt knob
        g.fillRect(-89.6, 3.5, 1.2, 3);
        g.globalAlpha = 0.85; g.fillStyle = c.accent;
        g.beginPath(); g.ellipse(-62.6, -11.5, 1.2, 4.2, 0, 0, TAU); g.fill();   // lens glint
        g.globalAlpha = 0.5; g.strokeStyle = c.ink; g.lineWidth = c.lw * 0.7;
        line(g, -82, -5, -82, 4); line(g, -104, -5, -104, 4.5);
        line(g, -80, 1, -60, 1); line(g, -126, 0, -110, 0);
        g.beginPath(); g.moveTo(-99, 5); g.quadraticCurveTo(-97, 10, -92, 9.4); g.stroke();
        g.globalAlpha = 0.9; g.fillStyle = c.accent;
        poly(g, [[-134, 3], [-122, 3.4], [-122, 5], [-134, 5.4]]); g.fill();
        g.globalAlpha = 1;
      },
    },

    shotgun: {
      size: 0.95, bounds: [-101, -6, 0, 20], grip: [-70, 8], port: [-58, -2],
      build(p) {
        box(p, -50, -3.4, 50, 3.4);                                // barrel
        box(p, -46, 0.4, 42, 3.2);                                 // tube magazine
        box(p, -8, -3.9, 3, 7.9);                                  // barrel band
        poly(p, [[-44, -1], [-29, -1], [-29, 5.6], [-44, 6.2]]);     // forend
        poly(p, [[-66, -5], [-48, -4.4], [-48, 5], [-66, 5.6]]);     // receiver
        poly(p, [[-98, -4], [-66, -4], [-66, 5.2], [-74, 6.4], [-98, 14.5]]); // stock
        box(p, -101, -4.6, 3, 19.6);                               // butt pad
      },
      details(g, c) {
        // The lever loop is drawn as a skinned ring on top of a dark outline.
        g.strokeStyle = c.ink; g.lineWidth = c.lw * 1.9;
        g.beginPath(); g.ellipse(-59, 10.5, 7.5, 5.2, 0, 0, TAU); g.stroke();
        g.strokeStyle = c.mid; g.lineWidth = c.lw * 0.95;
        g.beginPath(); g.ellipse(-59, 10.5, 7.5, 5.2, 0, 0, TAU); g.stroke();
        g.fillStyle = c.ink;
        g.fillRect(-63, -3.4, 10, 2.4);                            // loading gate
        g.beginPath(); g.arc(-51, 1, 1.1, 0, TAU); g.fill();
        g.globalAlpha = 0.45; g.strokeStyle = c.ink; g.lineWidth = c.lw * 0.6;
        for (let i = 0; i < 5; i++) line(g, -42 + i * 3, -0.6, -42 + i * 3, 5.6);   // forend grooves
        line(g, -48, -4.4, -48, 5); line(g, -66, -5, -66, 5.6);
        g.globalAlpha = 0.9; g.fillStyle = c.accent;
        poly(g, [[-93, 0], [-78, 0.4], [-78, 2.2], [-93, 3]]); g.fill();
        g.globalAlpha = 1;
      },
    },

    pistol: {
      size: 1.55, bounds: [-43, -10, 0, 21], grip: [-33, 12], port: [-20, -5],
      build(p) {
        poly(p, [[-39, -7], [-3, -7], [0, -4.6], [0, -0.5], [-39, -0.5]]); // slide
        poly(p, [[-35, -0.5], [-6, -0.5], [-6, 3], [-35, 3.6]]);     // frame
        poly(p, [[-40, 1], [-27, 1], [-30, 20.5], [-43, 20.5]]);     // grip
        box(p, -41, -9.3, 3.2, 3);                                 // hammer
        box(p, -36, -8.6, 3, 1.8);                                 // rear sight
        box(p, -5.5, -8.6, 2, 1.8);                                // front sight
      },
      details(g, c) {
        g.fillStyle = c.ink;
        g.fillRect(-24, -6.3, 8, 2.4);                             // ejection port
        g.fillRect(-1.2, -4.4, 1.4, 3);                            // bore
        g.strokeStyle = c.ink; g.lineWidth = c.lw * 0.75;
        g.beginPath(); g.moveTo(-27, 3); g.lineTo(-26, 9); g.lineTo(-17, 9); g.lineTo(-15.5, 3); g.stroke();
        line(g, -22, 3.2, -23, 6.8);                               // trigger
        g.globalAlpha = 0.55; g.lineWidth = c.lw * 0.5;
        for (let i = 0; i < 6; i++) line(g, -37 + i * 1.6, -6.4, -37 + i * 1.6, -1.2);  // serrations
        for (let i = 0; i < 4; i++) line(g, -39 + i * 0.7, 6 + i * 3.2, -30 + i * 0.7, 6 + i * 3.2); // grip texture
        g.globalAlpha = 0.9; g.fillStyle = c.accent;
        g.fillRect(-30, -5.8, 4, 1.2);
        g.globalAlpha = 1;
      },
    },
  };

  // Deterministic scatter, so a skin's pattern does not shimmer from frame to frame.
  function scatter(seed, n) {
    let s = seed >>> 0;
    const next = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const out = [];
    for (let i = 0; i < n; i++) out.push([next(), next(), next(), next()]);
    return out;
  }

  function makeGun(model, opts, api) {
    const { state, util } = api;
    const skin = SKINS[opts.skin] || SKINS.gold;
    const body = new Path2D();
    model.build(body);
    const [minX, minY, maxX, maxY] = model.bounds;
    const bw = maxX - minX, bh = maxY - minY;
    const blots = scatter(minX * -977 + 13, 14);
    const glints = scatter(minX * -331 + 7, 6);
    const casings = [];
    let kick = 0, sway = 0, lastFire = -1;
    let lastShots = state.shots || 0;
    state.gunEjects = true;   // the gunshot effect leaves the casings to the gun

    function totalScale() {
      return opts.scale * 0.85 * model.size * util.clamp(Math.min(state.w, state.h) / 800, 0.8, 1.2);
    }

    // Built the same way as the drawing transform, so points on the gun can be found on screen.
    function matrix(k) {
      const m = new DOMMatrix();
      const mirror = opts.aim === 'right' ? 1 : -1;
      const aim = opts.aim === 'right' ? -0.42 : 0.42;
      const s = totalScale();
      m.translateSelf(state.x, state.y);
      m.rotateSelf((aim + sway) * 180 / Math.PI);
      m.scaleSelf(mirror * s, s);
      m.translateSelf(model.grip[0], model.grip[1]);
      m.rotateSelf(-k * 0.22 * 180 / Math.PI);
      m.translateSelf(-model.grip[0], -model.grip[1]);
      m.translateSelf(-k * 6, 0);
      return m;
    }

    function fire() {
      if (state.time - lastFire < 0.045) return;   // the click and the shot it causes are one event
      lastFire = state.time;
      kick = 1;
      if (state.reduceMotion || casings.length > 30) return;
      const m = matrix(0.4);
      const port = m.transformPoint({ x: model.port[0], y: model.port[1] });
      const out = m.transformPoint({ x: model.port[0] - 5, y: model.port[1] - 8 });
      let dx = out.x - port.x, dy = out.y - port.y;
      const d = Math.hypot(dx, dy) || 1;
      const sp = util.rand(2.6, 4.2);
      casings.push({ x: port.x, y: port.y, vx: dx / d * sp, vy: dy / d * sp - 1, rot: util.rand(0, TAU), spin: util.rand(-0.5, 0.5), life: 48 });
    }

    function paintSkin(g, lw) {
      const grad = g.createLinearGradient(0, minY, 0, maxY);
      skin.stops.forEach((c, i) => grad.addColorStop(i / (skin.stops.length - 1), c));
      g.lineJoin = 'round';
      if (skin.glow) {
        g.shadowColor = skin.glow;
        g.shadowBlur = 6 + 4 * Math.sin(state.time * 4);
      }
      g.strokeStyle = skin.glow || skin.ink;
      g.lineWidth = lw * 2;
      g.stroke(body);
      g.shadowBlur = 0;
      g.fillStyle = grad;
      g.fill(body);

      g.save();
      g.clip(body);
      if (skin.engrave) {
        g.strokeStyle = skin.ink; g.globalAlpha = 0.16; g.lineWidth = lw * 0.5;
        for (let x = minX - bh; x < maxX; x += 4) line(g, x, maxY, x + bh, minY);
      }
      if (skin.blotches) {
        blots.forEach((b, i) => {
          g.fillStyle = skin.blotches[i % skin.blotches.length];
          g.globalAlpha = 0.85;
          g.beginPath();
          g.ellipse(minX + b[0] * bw, minY + b[1] * bh, 4 + b[2] * 9, 2.5 + b[3] * 5, b[2] * 3, 0, TAU);
          g.fill();
        });
      }
      if (skin.weave) {
        g.fillStyle = '#ffffff'; g.globalAlpha = 0.07;
        for (let x = minX; x < maxX; x += 3) for (let y = minY; y < maxY; y += 3) {
          if (((x - minX) / 3 + (y - minY) / 3) % 2 < 1) g.fillRect(x, y, 1.5, 3);
          else g.fillRect(x, y, 3, 1.5);
        }
      }
      if (skin.stripe) {
        g.globalAlpha = 0.9; g.fillStyle = skin.accent;
        g.fillRect(minX, -1.1, bw, 2.2);
        g.fillStyle = skin.ink; g.globalAlpha = 0.6;
        g.fillRect(minX, -1.6, bw, 0.5); g.fillRect(minX, 1.1, bw, 0.5);
      }
      if (skin.glow) {
        g.strokeStyle = skin.accent; g.globalAlpha = 0.55 + 0.35 * Math.sin(state.time * 3);
        g.lineWidth = lw * 0.8;
        line(g, minX, 0.5, maxX, 0.5);
      }
      if (skin.shine) {
        // A band of light sweeps down the gun every few seconds, like a showcased skin.
        const t = (state.time * 0.55) % 1.8 - 0.4;
        const cx = minX + t * bw;
        const band = g.createLinearGradient(cx - 10, 0, cx + 10, 0);
        band.addColorStop(0, 'rgba(255,255,255,0)');
        band.addColorStop(0.5, 'rgba(255,255,255,0.6)');
        band.addColorStop(1, 'rgba(255,255,255,0)');
        g.globalAlpha = 1; g.fillStyle = band;
        g.beginPath();
        g.moveTo(cx - 12, maxY); g.lineTo(cx + 2, minY); g.lineTo(cx + 14, minY); g.lineTo(cx, maxY);
        g.closePath(); g.fill();
      }
      if (skin.sparkle) {
        g.fillStyle = '#ffffff';
        glints.forEach((s, i) => {
          const a = Math.max(0, Math.sin(state.time * 3 + i * 1.7));
          if (a < 0.2) return;
          g.globalAlpha = a;
          util.star(g, minX + s[0] * bw, minY + s[1] * bh, 1.2 + a * 1.6, 4, 0.3, 0);
          g.fill();
        });
      }
      g.restore();
      g.globalAlpha = 1;
    }

    function muzzleFlash(g) {
      if (kick < 0.2) return;
      const k = kick;
      g.globalCompositeOperation = 'lighter';
      const glow = g.createRadialGradient(4, 0, 0, 4, 0, 14 * k + 4);
      glow.addColorStop(0, 'rgba(255,250,220,0.95)');
      glow.addColorStop(0.4, 'rgba(255,190,70,0.6)');
      glow.addColorStop(1, 'rgba(255,110,20,0)');
      g.fillStyle = glow;
      g.beginPath(); g.arc(4, 0, 14 * k + 4, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,230,140,' + (0.9 * k).toFixed(2) + ')';
      g.beginPath(); g.moveTo(0, -2.2); g.lineTo(22 * k + 6, 0); g.lineTo(0, 2.2); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(0, -1); g.lineTo(11 * k, -8 * k); g.lineTo(3, 0); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(0, 1); g.lineTo(11 * k, 8 * k); g.lineTo(3, 0); g.closePath(); g.fill();
      g.globalCompositeOperation = 'source-over';
    }

    return {
      onDown() { fire(); },
      update(f) {
        if ((state.shots || 0) !== lastShots) { lastShots = state.shots || 0; fire(); }
        kick *= Math.pow(0.78, f);
        const target = util.clamp(state.vx * 0.012, -0.25, 0.25);
        sway += (target - sway) * Math.min(1, 0.15 * f);
        for (let i = casings.length - 1; i >= 0; i--) {
          const c = casings[i];
          c.life -= f;
          if (c.life <= 0) { casings.splice(i, 1); continue; }
          c.vy += 0.35 * f;
          c.x += c.vx * f; c.y += c.vy * f;
          c.rot += c.spin * f;
        }
      },
      render(g) {
        if (!state.seen) return;
        const s = totalScale();
        const lw = util.clamp(1.1 / s, 0.8, 3);
        g.save();
        g.setTransform(g.getTransform().multiply(matrix(kick)));
        paintSkin(g, lw);
        model.details(g, { ink: skin.ink, accent: skin.accent, mid: skin.stops[1], lw });
        muzzleFlash(g);
        g.restore();

        casings.forEach((c) => {
          g.save();
          g.translate(c.x, c.y); g.rotate(c.rot);
          g.globalAlpha = Math.min(1, c.life / 15);
          g.fillStyle = '#d9a93c'; g.fillRect(-3.5, -1.3, 7, 2.6);
          g.fillStyle = '#8a6a1e'; g.fillRect(-3.5, -1.3, 1.6, 2.6);
          g.restore();
        });

        if (opts.reticle) {
          // Drawn twice, dark then light, so the aim point reads on white pages and dark ones.
          const inv = 1 / (state.cursorScale || 1);
          const r = (5 + kick * 4) * inv, t = 3 * inv;
          const ticks = () => {
            line(g, state.x - r - t, state.y, state.x - r, state.y); line(g, state.x + r, state.y, state.x + r + t, state.y);
            line(g, state.x, state.y - r - t, state.x, state.y - r); line(g, state.x, state.y + r, state.x, state.y + r + t);
          };
          g.lineCap = 'round';
          g.globalAlpha = 0.75; g.strokeStyle = '#000000'; g.lineWidth = 3.2 * inv; ticks();
          g.fillStyle = '#000000'; g.beginPath(); g.arc(state.x, state.y, 2.3 * inv, 0, TAU); g.fill();
          g.globalAlpha = 1; g.strokeStyle = skin.glow || '#ffffff'; g.lineWidth = 1.3 * inv; ticks();
          g.fillStyle = g.strokeStyle; g.beginPath(); g.arc(state.x, state.y, 1.2 * inv, 0, TAU); g.fill();
        }
      },
      destroy() { state.gunEjects = false; },
    };
  }

  const AIM_CHOICES = [{ value: 'left', label: 'Aim left' }, { value: 'right', label: 'Aim right' }];
  [
    ['gun-rifle', 'rifle', 'Rifle', '🎯', 'gold', 'An assault rifle with a curved magazine. Kicks, flashes and ejects a casing on every shot.'],
    ['gun-sniper', 'sniper', 'Sniper', '🔭', 'frost', 'A scoped long rifle with a thumbhole stock and a glinting lens.'],
    ['gun-shotgun', 'shotgun', 'Shotgun', '💥', 'crimson', 'A lever-action shotgun with a tube magazine and a big recoil.'],
    ['gun-pistol', 'pistol', 'Pistol', '🔫', 'neon', 'A heavy pistol with a serrated slide and a sharp snap on each shot.'],
  ].forEach(([name, model, label, icon, skin, description]) => {
    CursorFX.registerCursor(name, {
      label, icon,
      description: description + ' Six skins. Pair it with the Gunshot click effect.',
      choices: { skin: SKIN_CHOICES, aim: AIM_CHOICES },
      defaults: { skin, aim: 'left', scale: 1, reticle: true },
      create(opts, api) { return makeGun(MODELS[model], opts, api); },
    });
  });
})();
