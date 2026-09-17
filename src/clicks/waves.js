/* Click: the page itself ripples — real content bends and refracts around the click.
   Uses backdrop-filter with an SVG displacement map (Chromium). Elsewhere it falls back to rings. */
CursorFX.registerClick('waves', {
  label: 'Page waves',
  icon: '🌊',
  description: 'The page itself ripples like water: text and images bend and refract outward from the click. Jelly mode wobbles the whole page. Needs a Chromium browser for the warp; other browsers see rings.',
  sound: true,
  defaults: { strength: 42, radius: 340, duration: 1.4, style: 'ripple', rings: true },
  create(opts, api) {
    const { state, util, audio, core } = api;
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const supported = !state.reduceMotion && typeof CSS !== 'undefined' && !!CSS.supports &&
      (CSS.supports('backdrop-filter', 'url(#a)') || CSS.supports('-webkit-backdrop-filter', 'url(#a)'));
    let root = null, svg = null, mapUrl = null, counter = 0;
    const waves = [];

    function el(name, attrs) {
      const e = document.createElementNS(SVG_NS, name);
      Object.keys(attrs).forEach((k) => e.setAttribute(k, attrs[k]));
      return e;
    }

    // Displacement map: one radial crest. R encodes x offset, G encodes y offset, 128 = none.
    function makeMap() {
      const S = 256, c = document.createElement('canvas');
      c.width = S; c.height = S;
      const g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data;
      const r0 = 0.72, w = 0.15;
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const dx = (x - S / 2) / (S / 2), dy = (y - S / 2) / (S / 2), r = Math.hypot(dx, dy);
          const env = Math.exp(-((r - r0) * (r - r0)) / (2 * w * w));
          const p = Math.sin(((r - r0) / w) * Math.PI) * env;
          const ux = r > 0 ? dx / r : 0, uy = r > 0 ? dy / r : 0;
          const i = (y * S + x) * 4;
          d[i] = 128 + ux * p * 127; d[i + 1] = 128 + uy * p * 127; d[i + 2] = 128; d[i + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
      return c.toDataURL('image/png');
    }

    function ensureDom() {
      if (root || !supported) return;
      root = document.createElement('div');
      root.setAttribute('data-cursorfx', '');
      root.setAttribute('aria-hidden', 'true');
      const z = (core.getConfig().zIndex || 2147483646) - 1;
      Object.assign(root.style, { position: 'fixed', left: '0', top: '0', width: '0', height: '0', pointerEvents: 'none', zIndex: String(z) });
      svg = el('svg', { width: '0', height: '0' });
      svg.style.position = 'absolute';
      root.appendChild(svg);
      document.body.appendChild(root);
      mapUrl = makeMap();
    }

    function spawn(x, y) {
      ensureDom();
      const wave = { x, y, t: 0 };
      if (supported) {
        const id = 'cursorfx-wave-' + (++counter);
        const filter = el('filter', { id, x: '0', y: '0', width: '100%', height: '100%', 'color-interpolation-filters': 'sRGB' });
        let disp;
        if (opts.style === 'jelly') {
          wave.turb = el('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.010', numOctaves: '2', seed: String(counter % 40), result: 'n' });
          disp = el('feDisplacementMap', { in: 'SourceGraphic', in2: 'n', scale: '0', xChannelSelector: 'R', yChannelSelector: 'G' });
          filter.appendChild(wave.turb);
        } else {
          const img = el('feImage', { href: mapUrl, preserveAspectRatio: 'none', x: '0', y: '0', width: '100%', height: '100%', result: 'm' });
          img.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', mapUrl);
          disp = el('feDisplacementMap', { in: 'SourceGraphic', in2: 'm', scale: '0', xChannelSelector: 'R', yChannelSelector: 'G' });
          filter.appendChild(img);
        }
        filter.appendChild(disp);
        svg.appendChild(filter);
        const div = document.createElement('div');
        Object.assign(div.style, { position: 'fixed', pointerEvents: 'none', left: '0px', top: '0px', width: '0px', height: '0px' });
        div.style.backdropFilter = 'url(#' + id + ')';
        div.style.webkitBackdropFilter = 'url(#' + id + ')';
        if (opts.style === 'jelly') { div.style.width = '100vw'; div.style.height = '100vh'; }
        root.appendChild(div);
        wave.filter = filter; wave.div = div; wave.disp = disp;
      }
      waves.push(wave);
      while (waves.length > 6) remove(waves.shift());
      audio.tone({ freq: 700, slideTo: 220, dur: 0.45, type: 'sine', peak: 0.2 });
    }

    function remove(w) {
      if (w.div) w.div.remove();
      if (w.filter) w.filter.remove();
    }

    return {
      trigger(x, y) { spawn(x, y); },
      update(f, dt) {
        for (let i = waves.length - 1; i >= 0; i--) {
          const w = waves[i];
          w.t += dt / opts.duration;
          if (w.t >= 1) { remove(w); waves.splice(i, 1); continue; }
          if (!w.div) continue;
          const e = w.t;
          if (opts.style === 'jelly') {
            const s = opts.strength * Math.exp(-3 * e) * Math.sin(e * Math.PI * 5);
            w.disp.setAttribute('scale', s.toFixed(2));
            w.turb.setAttribute('baseFrequency', (0.008 + 0.003 * Math.sin(e * 9)).toFixed(4));
          } else {
            const rad = 24 + opts.radius * Math.pow(e, 0.6);
            w.div.style.left = (w.x - rad) + 'px'; w.div.style.top = (w.y - rad) + 'px';
            w.div.style.width = (rad * 2) + 'px'; w.div.style.height = (rad * 2) + 'px';
            w.disp.setAttribute('scale', (opts.strength * Math.pow(1 - e, 1.5)).toFixed(2));
          }
        }
      },
      render(g) {
        if (!opts.rings && supported) return;
        g.globalCompositeOperation = 'lighter';
        waves.forEach((w) => {
          if (opts.style === 'jelly') return;
          const e = w.t, rad = 24 + opts.radius * Math.pow(e, 0.6);
          const a = (1 - e) * (supported ? 0.22 : 0.7);
          g.strokeStyle = 'rgba(200,230,255,' + a.toFixed(3) + ')';
          g.lineWidth = supported ? 6 * (1 - e) + 1 : 3 * (1 - e) + 0.5;
          g.beginPath(); g.arc(w.x, w.y, rad * 0.72, 0, util.TAU); g.stroke();
          if (!supported) { g.strokeStyle = 'rgba(255,255,255,' + (a * 0.4).toFixed(3) + ')'; g.lineWidth = 1; g.beginPath(); g.arc(w.x, w.y, rad * 0.55, 0, util.TAU); g.stroke(); }
        });
      },
      destroy() { waves.forEach(remove); waves.length = 0; if (root) root.remove(); root = null; svg = null; },
    };
  },
});
