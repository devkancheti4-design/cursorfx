/* Click: a burst of emoji (or comic-book words) that pop out and tumble. */
(function () {
  function make(name, def, spriteOpts, sound) {
    CursorFX.registerClick(name, Object.assign({
      sound: true,
      create(opts, api) {
        const { state, util, audio } = api;
        const list = util.particleList();
        return {
          trigger(x, y) {
            const n = state.reduceMotion ? opts.count / 2 : opts.count;
            for (let i = 0; i < n; i++) {
              const a = util.rand(0, util.TAU), sp = util.rand(opts.speed * 0.4, opts.speed);
              list.add({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - opts.lift, rot: util.rand(-0.4, 0.4), spin: util.rand(-0.15, 0.15), scale: 0, target: util.rand(0.7, 1.2), item: util.pick(opts.items), color: opts.colors ? util.pick(opts.colors) : null, life: util.rand(50, 90), max: 90 });
            }
            list.cap(200);
            sound(audio, util);
          },
          update(f) {
            list.step(f, (p) => {
              p.vy += opts.gravity * f; const d = Math.pow(0.95, f); p.vx *= d; p.vy *= d;
              p.x += p.vx * f; p.y += p.vy * f; p.rot += p.spin * f;
              p.scale += (p.target - p.scale) * Math.min(1, 0.25 * f);
            });
          },
          render(g) {
            list.items.forEach((p) => {
              const sp = util.sprite(p.item, opts.size, p.color ? Object.assign({}, spriteOpts, { color: p.color }) : spriteOpts);
              util.drawSprite(g, sp, p.x, p.y, p.scale, p.rot, Math.min(1, (p.life / p.max) * 3));
            });
          },
        };
      },
    }, def));
  }
  make('emojiburst', {
    label: 'Emoji burst', icon: '🎊',
    description: 'A burst of your chosen emoji pops out of the click and tumbles down.',
    defaults: { items: ['🎉', '✨', '💖', '🌈', '⭐', '🔥', '😍'], count: 14, size: 26, speed: 9, lift: 3, gravity: 0.25 },
  }, {}, (audio) => audio.pop({ freq: 1400, q: 0.9, peak: 0.5, dur: 0.1 }));
  make('textburst', {
    label: 'Comic words', icon: '💬',
    description: 'Comic-book words like POW! and BOOM! leap out of every click.',
    defaults: { items: ['POW!', 'BOOM!', 'WOW!', 'ZAP!', 'BAM!', 'YES!'], colors: ['#ffe600', '#ff3b3b', '#3bd1ff', '#7cff5a', '#ff7cf0'], count: 5, size: 28, speed: 6, lift: 4, gravity: 0.2 },
  }, { font: '900 28px Impact, "Arial Black", system-ui, sans-serif' }, (audio) => audio.tone({ freq: 220, slideTo: 880, dur: 0.15, type: 'square', peak: 0.12 }));
})();
