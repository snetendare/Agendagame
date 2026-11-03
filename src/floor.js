// ===== The painted floor: No Mans Land's meadow, with darker grid lines and no zones =====
// Floor.paint(cols, rows, tilePx) -> a canvas with the board's ground painted on it: patches of dusty green, grass
// strokes and the grid between tiles. Seeded, so it looks the same every time.
// Taken from No Mans Land (src/floors.js, the meadow look, and the 3D board's grid from src/render2d.js) on 2026-11-03,
// without the zones and no man's land.
const Floor = (() => {
  const MEADOW = { base: '#5F714C', patch: ['#6A7D53', '#556944', '#718156', '#506343'], strokes: ['#76895C', '#485B3C'] };
  const GRID = 'rgba(20, 28, 16, 0.22)';
  function paint(cols, rows, t) {
    const W = cols * t, H = rows * t, L = MEADOW;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    let sd = 99991; const rr = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; };
    c.fillStyle = L.base; c.fillRect(0, 0, W, H);
    const blob = (x, y, rx, ry, col, a) => { const g = c.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry)); g.addColorStop(0, col); g.addColorStop(1, col + '00');
      c.globalAlpha = a; c.fillStyle = g; c.beginPath(); c.ellipse(x, y, rx, ry, rr() * 3, 0, Math.PI * 2); c.fill(); };
    // NML paints 70 patches on its 12 x 16 board: the same density here
    const patches = Math.round(70 * cols * rows / 192);
    for (let k = 0; k < patches; k++) blob(rr() * W, rr() * H, t * (0.8 + rr() * 2.2), t * (0.6 + rr() * 1.6), L.patch[k % 4], 0.55);
    c.lineCap = 'round';
    for (let k = 0; k < cols * rows * 14; k++) { // painted grass strokes
      const x = rr() * W, y = rr() * H, l = t * (0.06 + rr() * 0.1);
      c.globalAlpha = 0.25 + rr() * 0.25; c.strokeStyle = rr() < 0.5 ? L.strokes[0] : L.strokes[1]; c.lineWidth = (0.8 + rr() * 0.8) * t / 60;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + (rr() - 0.5) * l * 0.6, y - l); c.stroke();
    }
    c.globalAlpha = 1;
    // the grid: as wide as NML's (1 px on a 60 px tile)
    c.strokeStyle = GRID; c.lineWidth = t / 60;
    for (let i = 1; i < cols; i++) { c.beginPath(); c.moveTo(i * t, 0); c.lineTo(i * t, H); c.stroke(); }
    for (let i = 1; i < rows; i++) { c.beginPath(); c.moveTo(0, i * t); c.lineTo(W, i * t); c.stroke(); }
    return cv;
  }
  return { paint, MEADOW };
})();
