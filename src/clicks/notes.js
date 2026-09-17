/* Click: music notes float up, and each click plays a note from a pentatonic scale. */
CursorFX.registerClick('notes', {
  label: 'Music notes',
  icon: '🎵',
  description: 'Music notes float up from the click, and each click plays a pentatonic note so clicking becomes a melody.',
  sound: true,
  defaults: { count: 6, colors: ['#ffd166', '#8ecae6', '#ff8fab', '#c77dff', '#80ed99'], size: 26 },
  create(opts, api) {
    const { state, util, audio } = api;
    const list = util.particleList();
    const SCALE = [261.6, 293.7, 329.6, 392, 440, 523.3, 587.3, 659.3, 784, 880];
    return {
      trigger(x, y) {
        const n = state.reduceMotion ? opts.count / 2 : opts.count;
        for (let i = 0; i < n; i++) list.add({ x: x + util.rand(-8, 8), y, vx: util.rand(-0.8, 0.8), vy: util.rand(-2.5, -1), rot: util.rand(-0.3, 0.3), sym: util.pick(['♪', '♫', '♬', '♩']), color: util.pick(opts.colors), ph: util.rand(0, 6), life: util.rand(70, 110), max: 110 });
        list.cap(120);
        const note = SCALE[Math.floor(util.clamp(1 - y / state.h, 0, 0.999) * SCALE.length)];
        audio.tone({ freq: note, dur: 0.6, type: 'triangle', peak: 0.2 });
        audio.tone({ freq: note * 2, dur: 0.4, type: 'sine', peak: 0.06 });
      },
      update(f) { list.step(f, (p) => { p.x += (p.vx + Math.sin(state.time * 3 + p.ph) * 0.8) * f; p.y += p.vy * f; }); },
      render(g) {
        list.items.forEach((p) => {
          const sp = util.sprite(p.sym, opts.size, { font: '700 ' + opts.size + 'px system-ui, "Segoe UI Symbol", sans-serif', color: p.color });
          util.drawSprite(g, sp, p.x, p.y, 1, p.rot + Math.sin(state.time * 3 + p.ph) * 0.15, Math.min(1, (p.life / p.max) * 3));
        });
      },
    };
  },
});
