// ===== Emotions: the six kinds of wooden piece, and the 2D personal chart =====
// Every piece in a chart is one emotion. Indifference is plain wood; the others are painted wood.
// chartSVG(pieces, known, size) draws a personal chart as an SVG string: one equal slice per piece (so the share of
// each emotion is the chance it gets given), starting pieces first. A piece the viewer hasn't seen yet is grey with a
// question mark; a starting piece the viewer has seen carries a small pin (it can never leave the chart).
const EMOTIONS = [
  { key: 'indifference', name: 'Indifference', color: '#C9A06A' },
  { key: 'happiness', name: 'Happiness', color: '#E9C23A' },
  { key: 'anger', name: 'Anger', color: '#C8432F' },
  { key: 'doubt', name: 'Doubt', color: '#7D52A8' },
  { key: 'anxiety', name: 'Anxiety', color: '#A4A8AD' },
  { key: 'sadness', name: 'Sadness', color: '#3E6FB8' },
];
const EMO = Object.fromEntries(EMOTIONS.map((e) => [e.key, e]));

function chartSVG(pieces, known, size = 96) {
  const c = size / 2, r = size / 2 - 3, n = pieces.length, f = (v) => v.toFixed(2);
  let out = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">`;
  out += `<circle cx="${c}" cy="${c}" r="${r + 2}" fill="#1C1612"/>`;
  if (!n) out += `<circle cx="${c}" cy="${c}" r="${r}" fill="#3A322B"/>`;
  pieces.forEach((p, i) => {
    const show = known(p), fill = show ? EMO[p.e].color : '#5C534B';
    const a0 = -Math.PI / 2 + i * 2 * Math.PI / n, a1 = a0 + 2 * Math.PI / n, am = (a0 + a1) / 2;
    if (n === 1) out += `<circle cx="${c}" cy="${c}" r="${r}" fill="${fill}" stroke="#1C1612" stroke-width="1.5"/>`;
    else out += `<path d="M${c} ${c}L${f(c + r * Math.cos(a0))} ${f(c + r * Math.sin(a0))}A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${f(c + r * Math.cos(a1))} ${f(c + r * Math.sin(a1))}Z" fill="${fill}" stroke="#1C1612" stroke-width="1.5"/>`;
    const mr = n === 1 ? 0 : r * 0.6, mx = c + mr * Math.cos(am), my = c + mr * Math.sin(am);
    if (!show) out += `<text x="${f(mx)}" y="${f(my)}" text-anchor="middle" dominant-baseline="central" font-family="system-ui,sans-serif" font-weight="700" font-size="${f(Math.max(9, size * (n > 8 ? 0.11 : 0.16)))}" fill="#CFC3B4">?</text>`;
    else if (p.start) out += `<circle cx="${f(mx)}" cy="${f(my)}" r="${f(size * 0.045)}" fill="#F4EADC" stroke="#1C1612" stroke-width="1.2"/>`;
  });
  return out + '</svg>';
}
