/* Shared helper for movement trails: a small particle list with a common update loop. */
CursorFX.util.particleList = function () {
  const items = [];
  return {
    items,
    add(p) { items.push(p); return p; },
    cap(n) { if (items.length > n) items.splice(0, items.length - n); },
    step(f, fn) {
      for (let i = items.length - 1; i >= 0; i--) {
        const p = items[i];
        p.life -= f;
        if (p.life <= 0) { items[i] = items[items.length - 1]; items.pop(); continue; }
        fn(p, f);
      }
    },
    clear() { items.length = 0; },
  };
};
CursorFX.util.star = function (g, x, y, r, points, inner, rot) {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? r : r * inner;
    const a = (i / (points * 2)) * Math.PI * 2 + (rot || 0) - Math.PI / 2;
    if (i === 0) g.moveTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    else g.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  g.closePath();
};
CursorFX.util.heart = function (g, x, y, s) {
  g.beginPath();
  g.moveTo(x, y + s * 0.35);
  g.bezierCurveTo(x, y, x - s * 0.5, y - s * 0.1, x - s * 0.5, y - s * 0.35);
  g.bezierCurveTo(x - s * 0.5, y - s * 0.6, x - s * 0.15, y - s * 0.65, x, y - s * 0.4);
  g.bezierCurveTo(x + s * 0.15, y - s * 0.65, x + s * 0.5, y - s * 0.6, x + s * 0.5, y - s * 0.35);
  g.bezierCurveTo(x + s * 0.5, y - s * 0.1, x, y, x, y + s * 0.35);
  g.closePath();
};
