/* Trail: emoji tumble out of the pointer and fall with gravity. Snow and petals reuse it. */
(function () {
  function make(name, label, icon, description, defaults, physics) {
    CursorFX.registerTrail(name, {
      label, icon, description, defaults,
      create(opts, api) {
        const { state, util } = api;
        const list = util.particleList();
        let acc = 0;
        return {
          update(f) {
            if (state.seen && !state.reduceMotion) {
              acc += (physics.idle + state.speed * physics.perSpeed) * opts.rate * f;
              while (acc >= 1) {
                acc -= 1;
                list.add({ x: state.x, y: state.y, vx: util.rand(-physics.spread, physics.spread) + state.vx * 0.15, vy: util.rand(physics.vy0, physics.vy1), rot: util.rand(0, 6), spin: util.rand(-physics.spin, physics.spin), size: util.rand(0.7, 1.2), life: util.rand(physics.life0, physics.life1), max: physics.life1, emoji: util.pick(opts.emoji), ph: util.rand(0, 6) });
              }
              list.cap(160);
            }
            list.step(f, (p) => {
              p.vy += physics.gravity * f;
              p.x += (p.vx + Math.sin(state.time * 2 + p.ph) * physics.sway) * f;
              p.y += p.vy * f; p.rot += p.spin * f;
              if (physics.drag) { p.vx *= Math.pow(physics.drag, f); }
            });
          },
          render(g) {
            list.items.forEach((p) => {
              const sp = util.sprite(p.emoji, opts.size);
              util.drawSprite(g, sp, p.x, p.y, p.size, p.rot, Math.min(1, (p.life / p.max) * 3));
            });
          },
        };
      },
    });
  }
  make('emojirain', 'Emoji rain', '😂', 'Your favourite emoji tumble out of the pointer and rain down.',
    { emoji: ['😀', '😂', '😍', '🥳', '🔥', '💯'], rate: 1, size: 22 },
    { idle: 0.02, perSpeed: 0.06, spread: 2.5, vy0: -3, vy1: 0, spin: 0.15, gravity: 0.18, sway: 0, drag: 0.97, life0: 50, life1: 80 });
  make('snow', 'Snowflakes', '❄️', 'Soft snowflakes drift down from the pointer and sway in the breeze.',
    { emoji: ['❄️', '❅', '❆'], rate: 1, size: 16 },
    { idle: 0.05, perSpeed: 0.05, spread: 0.6, vy0: 0.4, vy1: 1.2, spin: 0.04, gravity: 0.004, sway: 0.5, drag: 0.99, life0: 90, life1: 150 });
  make('petals', 'Sakura petals', '🌸', 'Cherry-blossom petals flutter down behind the pointer.',
    { emoji: ['🌸', '🌸', '💮'], rate: 1, size: 16 },
    { idle: 0.04, perSpeed: 0.05, spread: 1, vy0: 0.3, vy1: 1, spin: 0.08, gravity: 0.01, sway: 0.7, drag: 0.98, life0: 80, life1: 140 });
})();
