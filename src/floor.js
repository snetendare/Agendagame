// ===== The painted floor: polished wood parquet, with the tile grid in its joints =====
// Floor.paint(cols, rows, tilePx) -> a canvas with the board's floor painted on it. Each tile is one square of
// basket-weave parquet: four blocks, each of four strips, the strips turning a quarter between neighbouring blocks.
// The joints between tiles are a little darker, so the grid still reads. Seeded, so it looks the same every time.
// (The theme is a high-society dinner party, indoors; the first version was No Mans Land's meadow.)
const Floor = (() => {
  const WOOD = ['#6B4128', '#73472C', '#7C4F31', '#633B24', '#815536', '#6F442A'];
  const GRAIN = ['#4E2C19', '#8E6140'];
  const GRID = 'rgba(18, 8, 3, 0.8)';
  function paint(cols, rows, t) {
    const W = cols * t, H = rows * t;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    let sd = 31337; const rr = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; };
    const b = t / 2, strip = b / 4, gap = Math.max(1, t / 96);
    for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) for (let by = 0; by < 2; by++) for (let bx = 0; bx < 2; bx++) {
      const x0 = tx * t + bx * b, y0 = ty * t + by * b, across = (bx + by + tx + ty) % 2 === 0;
      for (let s = 0; s < 4; s++) {
        const [x, y, w, h] = across ? [x0, y0 + s * strip, b, strip] : [x0 + s * strip, y0, strip, b];
        c.fillStyle = WOOD[Math.floor(rr() * WOOD.length)]; c.fillRect(x, y, w, h);
        // grain along the strip
        for (let k = 0; k < 5; k++) {
          c.globalAlpha = 0.18 + rr() * 0.2; c.strokeStyle = GRAIN[rr() < 0.7 ? 0 : 1]; c.lineWidth = 0.5 + rr() * 0.9;
          const o = (0.15 + rr() * 0.7) * (across ? h : w), wob = (rr() - 0.5) * 1.6;
          c.beginPath();
          if (across) { c.moveTo(x, y + o); c.quadraticCurveTo(x + w / 2, y + o + wob, x + w, y + o); }
          else { c.moveTo(x + o, y); c.quadraticCurveTo(x + o + wob, y + h / 2, x + o, y + h); }
          c.stroke();
        }
        c.globalAlpha = 1;
        // the hairline joint round each strip
        c.strokeStyle = 'rgba(30, 16, 8, 0.45)'; c.lineWidth = gap * 0.6; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      }
    }
    // a soft sheen: a few broad, faint highlights, as a polished floor catches the light
    for (let k = 0; k < Math.round(cols * rows / 12); k++) {
      const x = rr() * W, y = rr() * H, r = t * (1.5 + rr() * 2.5), g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255, 226, 190, 0.07)'); g.addColorStop(1, 'rgba(255, 226, 190, 0)');
      c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // the grid: the joints between tiles, darker and a little wider
    c.strokeStyle = GRID; c.lineWidth = gap * 2.4;
    for (let i = 1; i < cols; i++) { c.beginPath(); c.moveTo(i * t, 0); c.lineTo(i * t, H); c.stroke(); }
    for (let i = 1; i < rows; i++) { c.beginPath(); c.moveTo(0, i * t); c.lineTo(W, i * t); c.stroke(); }
    return cv;
  }
  return { paint };
})();
