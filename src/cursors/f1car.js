/* Cursor: F1 car with a synthesised V10 engine, 8-speed gearbox, tyre smoke and exhaust flames. */
CursorFX.registerCursor('f1car', {
  label: 'F1 car',
  icon: '🏎️',
  description: 'A Formula 1 car that steers with your pointer. Optional V10 engine sound with gear shifts, backfires and tyre screech.',
  sound: true,
  defaults: { livery: '#d4161f', accent: '#f5f5f7', scale: 1, boostOnHold: true, engine: true },
  create(opts, api) {
    const { state, util, audio } = api;
    const { TAU, clamp, rand } = util;
    const RPM_IDLE = 0.22, FIRING_HZ_MAX = 1500;
    const GEAR_TOP = [0.25, 0.30, 0.37, 0.45, 0.55, 0.67, 0.82, 1.0];
    const car = {
      x: state.x, y: state.y, heading: 0, speed: 0, s: 0, prevS: 0, throttle: 0,
      turn: 0, steer: 0, screech: 0, gear: 0, rpm: RPM_IDLE, shiftT: 0, scale: 1,
    };
    const fxs = [];
    let engine = null;

    function distortion(k) {
      const n = 1024, curve = new Float32Array(n);
      for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; curve[i] = ((Math.PI + k) * x) / (Math.PI + k * Math.abs(x)); }
      return curve;
    }

    function buildEngine(c) {
      const bus = audio.bus();
      const nH = 40, real = new Float32Array(nH + 1), imag = new Float32Array(nH + 1);
      for (let n = 1; n <= nH; n++) imag[n] = (1 / Math.pow(n, 0.75)) * (n % 2 === 0 ? 1 : 0.85);
      const oscA = c.createOscillator(); oscA.setPeriodicWave(c.createPeriodicWave(real, imag));
      const oscB = c.createOscillator(); oscB.type = 'sawtooth';
      const oscC = c.createOscillator(); oscC.type = 'sawtooth';
      oscA.frequency.value = RPM_IDLE * FIRING_HZ_MAX;
      oscB.frequency.value = RPM_IDLE * FIRING_HZ_MAX / 2;
      oscC.frequency.value = RPM_IDLE * FIRING_HZ_MAX / 4;
      const gA = c.createGain(); gA.gain.value = 0.7;
      const gB = c.createGain(); gB.gain.value = 0.22;
      const gC = c.createGain(); gC.gain.value = 0.09;
      const mix = c.createGain(); mix.gain.value = 0.6;
      oscA.connect(gA).connect(mix); oscB.connect(gB).connect(mix); oscC.connect(gC).connect(mix);
      const jitter = c.createBufferSource(); jitter.buffer = audio.noise; jitter.loop = true;
      const jLp = c.createBiquadFilter(); jLp.type = 'lowpass'; jLp.frequency.value = 22;
      const jG = c.createGain(); jG.gain.value = 28;
      jitter.connect(jLp).connect(jG);
      jG.connect(oscA.detune); jG.connect(oscB.detune); jG.connect(oscC.detune);
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 170;
      const r1 = c.createBiquadFilter(); r1.type = 'peaking'; r1.frequency.value = 1150; r1.Q.value = 1.8; r1.gain.value = 7;
      const r2 = c.createBiquadFilter(); r2.type = 'peaking'; r2.frequency.value = 2900; r2.Q.value = 2.4; r2.gain.value = 5;
      const sh = c.createWaveShaper(); sh.curve = distortion(48); sh.oversample = '4x';
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200; lp.Q.value = 1.2;
      const out = c.createGain(); out.gain.value = 0;
      mix.connect(hp).connect(r1).connect(r2).connect(sh).connect(lp).connect(out).connect(bus);
      const conv = c.createConvolver();
      const len = Math.floor(c.sampleRate * 1.1), ir = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.5); }
      conv.buffer = ir;
      const wet = c.createGain(); wet.gain.value = 0.16;
      out.connect(conv).connect(wet).connect(bus);
      const wind = c.createBufferSource(); wind.buffer = audio.noise; wind.loop = true;
      const wLp = c.createBiquadFilter(); wLp.type = 'lowpass'; wLp.frequency.value = 420;
      const wG = c.createGain(); wG.gain.value = 0;
      wind.connect(wLp).connect(wG).connect(bus);
      const scr = c.createBufferSource(); scr.buffer = audio.noise; scr.loop = true;
      const sBp = c.createBiquadFilter(); sBp.type = 'bandpass'; sBp.frequency.value = 1500; sBp.Q.value = 14;
      const sG = c.createGain(); sG.gain.value = 0;
      scr.connect(sBp).connect(sG).connect(bus);
      oscA.start(); oscB.start(); oscC.start();
      jitter.start(0, 0.3); wind.start(0, 0.9); scr.start(0, 1.4);
      const nodes = [oscA, oscB, oscC, jitter, wind, scr];
      return {
        update() {
          const t = c.currentTime;
          const f0 = car.rpm * FIRING_HZ_MAX;
          oscA.frequency.setTargetAtTime(f0, t, 0.02);
          oscB.frequency.setTargetAtTime(f0 / 2, t, 0.02);
          oscC.frequency.setTargetAtTime(f0 / 4, t, 0.02);
          lp.frequency.setTargetAtTime(1600 + car.rpm * 9000 + car.throttle * 1500, t, 0.03);
          r1.frequency.setTargetAtTime(900 + car.rpm * 700, t, 0.05);
          const cut = car.shiftT > 0 ? 0.12 : 1;
          const vol = (0.2 + 0.75 * car.rpm) * (0.62 + 0.38 * car.throttle) * cut;
          out.gain.setTargetAtTime(vol, t, car.shiftT > 0 ? 0.008 : 0.03);
          wG.gain.setTargetAtTime(car.s * car.s * 0.22, t, 0.08);
          sG.gain.setTargetAtTime(car.screech * 0.4, t, 0.05);
          sBp.frequency.setTargetAtTime(1300 + car.s * 900, t, 0.05);
        },
        stop() {
          out.gain.setTargetAtTime(0, c.currentTime, 0.02);
          setTimeout(() => { nodes.forEach((n) => { try { n.stop(); n.disconnect(); } catch (e) {} }); out.disconnect(); wG.disconnect(); sG.disconnect(); }, 150);
        },
      };
    }

    function crack(sharp) {
      audio.pop(sharp
        ? { freq: rand(1800, 3200), q: 1.2, peak: 0.9, dur: rand(0.05, 0.09) }
        : { freq: rand(500, 1400), q: 2, peak: rand(0.3, 0.6), dur: rand(0.08, 0.16) });
    }

    function emit(kind, x, y, vx, vy, size, life) {
      if (fxs.length >= 600) fxs.shift();
      fxs.push({ kind, x, y, vx, vy, size, life, max: life });
    }

    function exhaust(count, boost) {
      const ch = Math.cos(car.heading), sh = Math.sin(car.heading), sc = car.scale;
      for (let i = 0; i < count; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const lx = -37 * sc, ly = 6 * side * sc;
        const wx = car.x + lx * ch - ly * sh, wy = car.y + lx * sh + ly * ch;
        const sp = (2 + car.s * 5) * boost;
        emit('flame', wx, wy, -ch * sp + rand(-0.8, 0.8), -sh * sp + rand(-0.8, 0.8), rand(1.8, 3.4) * sc * boost, rand(8, 16));
      }
    }

    function update(f) {
      car.scale = opts.scale * clamp(Math.min(state.w, state.h) / 800, 0.8, 1.2);
      // The car is the cursor: it sits on the pointer, and drives (not teleports) when the pointer jumps.
      const gx = state.x - car.x, gy = state.y - car.y;
      const gap = Math.hypot(gx, gy);
      let nx = state.x, ny = state.y;
      if (gap > 1.5) {
        const maxStep = (22 + car.s * 40) * f;
        let step = gap * Math.min(1, 0.8 * f);
        if (step > maxStep) step = maxStep;
        if (step < gap) { nx = car.x + (gx / gap) * step; ny = car.y + (gy / gap) * step; }
      }
      const dx = nx - car.x, dy = ny - car.y;
      const dist = Math.hypot(dx, dy);
      car.speed += (dist / f - car.speed) * Math.min(1, 0.3 * f);
      car.x = nx; car.y = ny;
      let turn = 0;
      if (dist / f > 0.4) {
        let d = Math.atan2(dy, dx) - car.heading;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        const step = d * Math.min(1, 0.3 * f);
        car.heading += step;
        turn = step / f;
      }
      car.turn += (turn - car.turn) * Math.min(1, 0.3 * f);
      car.steer += (clamp(car.turn * 6, -0.55, 0.55) - car.steer) * Math.min(1, 0.3 * f);
      const boosting = opts.boostOnHold && state.down;
      let s = clamp(car.speed / 26, 0, 1);
      if (boosting) s = Math.min(1, s + 0.35);
      car.s += (s - car.s) * Math.min(1, 0.2 * f);
      const lat = Math.abs(car.turn) * car.speed;
      car.screech += (clamp((lat - 0.9) / 2.5, 0, 1) - car.screech) * Math.min(1, 0.25 * f);
      const accelerating = car.s > car.prevS - 0.001 && car.speed > 0.4;
      car.throttle += ((boosting || accelerating ? 1 : 0) - car.throttle) * Math.min(1, 0.2 * f);

      let rpmInGear = car.s / GEAR_TOP[car.gear];
      if (car.gear < GEAR_TOP.length - 1 && rpmInGear > 0.97) {
        car.gear++; car.shiftT = 0.07; rpmInGear = car.s / GEAR_TOP[car.gear];
        crack(true); exhaust(3, 1.3);
      } else if (car.gear > 0 && rpmInGear < 0.62) {
        car.gear--; rpmInGear = car.s / GEAR_TOP[car.gear];
        if (car.s > 0.15 && Math.random() < 0.6) crack(false);
      }
      let rpmTarget = clamp(Math.max(RPM_IDLE, rpmInGear), RPM_IDLE, 1);
      if (car.s < 0.02) rpmTarget = RPM_IDLE;
      car.rpm += (rpmTarget - car.rpm) * Math.min(1, (rpmTarget > car.rpm ? 0.4 : 0.14) * f);
      car.shiftT = Math.max(0, car.shiftT - f / 60);
      if (car.throttle < 0.5 && car.rpm > 0.45 && Math.random() < 0.12 * f) {
        crack(Math.random() < 0.3);
        if (Math.random() < 0.5) exhaust(4, 1.6);
      }
      car.prevS = car.s;

      const ch = Math.cos(car.heading), sh = Math.sin(car.heading), sc = car.scale;
      if (car.screech > 0.08 && !state.reduceMotion) {
        for (let side = -1; side <= 1; side += 2) {
          if (Math.random() > car.screech * 0.9) continue;
          const lx = -24 * sc, ly = 13 * side * sc;
          emit('smoke', car.x + lx * ch - ly * sh, car.y + lx * sh + ly * ch, rand(-0.4, 0.4) - ch * 0.6, rand(-0.4, 0.4) - sh * 0.6, rand(2, 4) * sc, rand(35, 60));
        }
      }
      if (car.s > 0.3 && !state.reduceMotion) exhaust(boosting ? 3 : car.s > 0.6 ? 2 : 1, 1);

      for (let i = fxs.length - 1; i >= 0; i--) {
        const p = fxs[i];
        p.life -= f;
        if (p.life <= 0) { fxs[i] = fxs[fxs.length - 1]; fxs.pop(); continue; }
        p.x += p.vx * f; p.y += p.vy * f;
        const d = Math.pow(p.kind === 'smoke' ? 0.93 : 0.9, f);
        p.vx *= d; p.vy *= d;
        if (p.kind === 'smoke') p.size += 0.45 * f;
      }

      if (opts.engine) {
        if (!engine && audio.get()) engine = buildEngine(audio.get());
        if (engine) engine.update();
      }
      state.meta = { kmh: Math.round(car.s * 340), gear: car.s < 0.02 ? 'N' : String(car.gear + 1), rpm: car.rpm };
    }

    function wheel(g, x, y, w, h, steer) {
      g.save(); g.translate(x, y); if (steer) g.rotate(steer);
      g.fillStyle = '#15161c'; util.rrect(g, -w / 2, -h / 2, w, h, 2.5); g.fill();
      g.fillStyle = '#3a3d48'; g.fillRect(-1.2, -h / 2, 2.4, h);
      g.restore();
    }

    function render(g) {
      if (!state.seen) return;
      // Effects first, under the car.
      for (let i = 0; i < fxs.length; i++) {
        const p = fxs[i];
        if (p.kind !== 'smoke') continue;
        g.fillStyle = 'rgba(175,178,190,' + ((p.life / p.max) * 0.32).toFixed(3) + ')';
        g.beginPath(); g.arc(p.x, p.y, p.size, 0, TAU); g.fill();
      }
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < fxs.length; i++) {
        const p = fxs[i];
        if (p.kind !== 'flame') continue;
        const t = p.life / p.max;
        g.fillStyle = (t > 0.6 ? 'rgba(255,240,150,' : t > 0.3 ? 'rgba(255,150,40,' : 'rgba(255,60,20,') + t.toFixed(3) + ')';
        g.beginPath(); g.arc(p.x, p.y, p.size * (0.4 + t), 0, TAU); g.fill();
      }
      g.globalCompositeOperation = 'source-over';

      g.translate(car.x, car.y);
      g.rotate(car.heading);
      g.scale(car.scale, car.scale);
      if (car.s > 0.55) {
        const a = (car.s - 0.55) / 0.45;
        g.strokeStyle = 'rgba(180,220,255,' + (a * 0.35).toFixed(3) + ')';
        g.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
          const y = -22 + i * 11 + Math.sin(state.time * 30 + i) * 3;
          g.beginPath(); g.moveTo(-40, y); g.lineTo(-40 - 30 * a - i * 6, y); g.stroke();
        }
      }
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.beginPath(); g.ellipse(-2, 3, 36, 18, 0, 0, TAU); g.fill();
      g.fillStyle = '#1a1b22'; util.rrect(g, -38, -16, 6, 32, 1.5); g.fill();
      g.fillStyle = opts.livery; g.fillRect(-36.5, -13, 2, 26);
      g.fillStyle = '#e0e4ec'; g.fillRect(-39, -18, 8, 2.5); g.fillRect(-39, 15.5, 8, 2.5);
      wheel(g, -24, -13, 15, 10, 0); wheel(g, -24, 13, 15, 10, 0);
      wheel(g, 18, -14.5, 13, 9, car.steer); wheel(g, 18, 14.5, 13, 9, car.steer);
      g.fillStyle = '#e6e8ee'; util.rrect(g, 27, -19, 6, 38, 1.5); g.fill();
      g.fillStyle = opts.livery; g.fillRect(29, -17, 2.5, 34); g.fillRect(26, -20, 8, 2); g.fillRect(26, 18, 8, 2);
      const grad = g.createLinearGradient(0, -12, 0, 12);
      grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.08, opts.livery); grad.addColorStop(1, '#000000');
      g.fillStyle = opts.livery;
      g.beginPath();
      g.moveTo(-31, -6); g.lineTo(-16, -12); g.lineTo(-2, -12); g.lineTo(8, -6); g.lineTo(33, -2.2);
      g.lineTo(33, 2.2); g.lineTo(8, 6); g.lineTo(-2, 12); g.lineTo(-16, 12); g.lineTo(-31, 6);
      g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.beginPath(); g.moveTo(-31, -6); g.lineTo(-16, -12); g.lineTo(-2, -12); g.lineTo(8, -6); g.lineTo(33, -2.2); g.lineTo(33, 0); g.lineTo(-31, 0); g.closePath(); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.beginPath(); g.moveTo(-16, -12); g.lineTo(-2, -12); g.lineTo(6, -7); g.lineTo(-16, -8); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(-16, 12); g.lineTo(-2, 12); g.lineTo(6, 7); g.lineTo(-16, 8); g.closePath(); g.fill();
      g.fillStyle = opts.accent; g.globalAlpha = 0.9;
      g.fillRect(-30, -1.5, 22, 3); g.fillRect(12, -1.2, 18, 2.4);
      g.globalAlpha = 1;
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.arc(-13, 0, 3.6, 0, TAU); g.fill();
      g.strokeStyle = '#2a2d36'; g.lineWidth = 2; g.beginPath(); g.arc(-5, 0, 6, 0, TAU); g.stroke();
      g.fillStyle = '#0b0c10'; g.beginPath(); g.ellipse(-6, 0, 5, 3.6, 0, 0, TAU); g.fill();
      g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(-7, 0, 2.8, 0, TAU); g.fill();
      g.fillStyle = '#20232c'; g.beginPath(); g.arc(-7, 0, 2.8, -0.9, 0.9); g.lineTo(-7, 0); g.closePath(); g.fill();
    }

    return {
      update, render,
      onEnter() { car.x = state.x; car.y = state.y; },
      destroy() { if (engine) engine.stop(); engine = null; state.meta = null; },
    };
  },
});
