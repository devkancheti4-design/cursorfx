/* Cursor: a chunky retro pixel-art arrow. */
CursorFX.registerCursor('pixel', {
  label: 'Retro pixel',
  icon: '🕹️',
  description: 'A chunky 8-bit arrow pointer that squashes when you click.',
  defaults: { fill: '#ffffff', outline: '#000000', scale: 3 },
  create(opts, api) {
    const { state } = api;
    const MAP = [
      'X...........', 'XX..........', 'XoX.........', 'XooX........', 'XoooX.......', 'XooooX......',
      'XoooooX.....', 'XooooooX....', 'XoooooooX...', 'XooooooooX..', 'XoooooooooX.', 'XoooooXXXXXX',
      'XooXooX.....', 'XoX.XooX....', 'XX..XooX....', 'X....XooX...', '.....XooX...', '......XX....',
    ];
    let squash = 1;
    return {
      update(f) { squash += ((state.down ? 0.8 : 1) - squash) * Math.min(1, 0.3 * f); },
      render(g) {
        if (!state.seen || !state.inside) return;
        const s = opts.scale;
        g.translate(state.x, state.y); g.scale(1 / squash, squash);
        for (let y = 0; y < MAP.length; y++) {
          const row = MAP[y];
          for (let x = 0; x < row.length; x++) {
            const c = row[x];
            if (c === '.') continue;
            g.fillStyle = c === 'X' ? opts.outline : opts.fill;
            g.fillRect(x * s, y * s, s, s);
          }
        }
      },
    };
  },
});
