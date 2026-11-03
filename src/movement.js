// ===== Walking: the players move their figures tile to tile, and see their own figure and plan marked =====
// Movement(THREE, scene, board, people, opts) walks characters (src/characters.js) along paths over the tiles.
//   moveTo(id, col, row)  walk figure id to that tile, round anyone standing in the way (8 directions, no cutting past
//                         a corner that a figure fills); a tile someone stands on gives the nearest free tile instead.
//                         Returns false when there's no way there.
//   setMe(player)         whose view this is (0 or 1): only that player's figure gets the circle under it, and only that
//                         player's planned path is drawn. The other player's figure looks like any NPC.
//   update(dt), busy()    once per drawn frame; busy while anyone walks
// Everyone walks at SPEED: NML's move speed 2 (metres a second; the Flame Wizard's), so a tile takes 3 s.
// The path is a smooth curve through the tiles' middles; the arrow on the ground is that same curve, from the figure to
// the end, shrinking as it walks.
const Movement = (THREE, scene, board, people, opts = {}) => {
  const SPEED = 2;          // m/s, NML's move speed 2
  const TURN = 9;           // how fast a figure turns to face where it walks (per second)
  const ARROW_W = 0.9;      // the path arrow's width (m)
  const HEAD_L = 1.9, HEAD_W = 2.4; // its head
  const MINE = '#F2D16B';   // your marks: the circle, the arrow, the destination
  const T = board.tile;
  let me = opts.me || 0;

  // ---------- your marks ----------
  const markMat = (opacity) => new THREE.MeshBasicMaterial({ color: MINE, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const r0 = people.radius * 1.3;
  const ring = new THREE.Group();
  const ringLine = new THREE.Mesh(new THREE.RingGeometry(r0, r0 + 0.32, 56), markMat(0.95));
  const ringFill = new THREE.Mesh(new THREE.CircleGeometry(r0, 56), markMat(0.16));
  for (const m of [ringLine, ringFill]) { m.rotation.x = -Math.PI / 2; m.renderOrder = 2; ring.add(m); }
  ring.position.y = 0.05; scene.add(ring);
  const arrow = new THREE.Mesh(new THREE.BufferGeometry(), markMat(0.85)); arrow.renderOrder = 3; arrow.visible = false; scene.add(arrow);
  // the destination: a square just inside the tile
  const sq = (T / 2 - 0.35) * Math.SQRT2;
  const dest = new THREE.Mesh(new THREE.RingGeometry(sq - 0.3, sq, 4, 1, Math.PI / 4), markMat(0.9));
  dest.rotation.x = -Math.PI / 2; dest.position.y = 0.05; dest.renderOrder = 2; dest.visible = false; scene.add(dest);

  // ---------- paths over the tiles ----------
  const key = (c, r) => c + ',' + r;
  const inside = (c, r) => c >= 0 && c < board.cols && r >= 0 && r < board.rows;
  const walks = new Map(); // id -> { curve, len, s }
  // tiles taken by everyone but id: where they stand, and where they're walking to
  function taken(id) {
    const out = new Set();
    for (const p of people.list) {
      if (p.id === id) continue;
      out.add(key(p.col, p.row));
      const t = people.tileOf(p.group.position.x, p.group.position.z); if (t) out.add(key(t.col, t.row));
    }
    return out;
  }
  // A*: 8 directions, a diagonal step costs sqrt 2 and may not squeeze past a taken tile on either side
  function path(from, to, blocked) {
    const D = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    const h = (c, r) => { const dx = Math.abs(c - to.col), dy = Math.abs(r - to.row); return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy); };
    const g = new Map([[key(from.col, from.row), 0]]), prev = new Map(), open = [{ c: from.col, r: from.row, f: h(from.col, from.row) }], done = new Set();
    while (open.length) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      const { c, r } = open.splice(bi, 1)[0], k = key(c, r);
      if (done.has(k)) continue; done.add(k);
      if (c === to.col && r === to.row) { const out = [[c, r]]; let q = k; while (prev.has(q)) { q = prev.get(q); out.unshift(q.split(',').map(Number)); } return out; }
      for (const [dc, dr] of D) {
        const nc = c + dc, nr = r + dr, nk = key(nc, nr);
        if (!inside(nc, nr) || blocked.has(nk) || done.has(nk)) continue;
        if (dc && dr && (blocked.has(key(c + dc, r)) || blocked.has(key(c, r + dr)))) continue;
        const ng = g.get(k) + (dc && dr ? Math.SQRT2 : 1);
        if (ng < (g.has(nk) ? g.get(nk) : Infinity)) { g.set(nk, ng); prev.set(nk, k); open.push({ c: nc, r: nr, f: ng + h(nc, nr) }); }
      }
    }
    return null;
  }
  // can a figure walk straight from a to b (x, z) without its body crossing a taken tile?
  function clear(a, b, blocked) {
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), n = Math.ceil(L / 0.5), w = people.radius * 0.9;
    const px = L ? -dz / L * w : 0, pz = L ? dx / L * w : 0;
    for (let k = 0; k <= n; k++) {
      const x = a[0] + dx * k / n, z = a[1] + dz * k / n;
      for (const o of [-1, 0, 1]) { const t = people.tileOf(x + px * o, z + pz * o); if (!t || blocked.has(key(t.col, t.row))) return false; }
    }
    return true;
  }
  // the free tile nearest to (col, row), ties going to the one nearer the walker
  function nearestFree(col, row, blocked, from) {
    let best = null, bd = Infinity;
    for (let r = 0; r < board.rows; r++) for (let c = 0; c < board.cols; c++) {
      if (blocked.has(key(c, r))) continue;
      const d = Math.hypot(c - col, r - row) + 0.01 * Math.hypot(c - from.col, r - from.row);
      if (d < bd) { bd = d; best = { col: c, row: r }; }
    }
    return best;
  }
  function moveTo(id, col, row) {
    const who = people.list[id]; if (!who || !inside(col, row)) return false;
    const pos = who.group.position, blocked = taken(id), from = people.tileOf(pos.x, pos.z);
    let to = { col, row };
    if (blocked.has(key(col, row))) to = nearestFree(col, row, blocked, from);
    if (!to) return false;
    blocked.delete(key(from.col, from.row));
    const tiles = path(from, to, blocked);
    if (!tiles) return false;
    // from where the figure is now, through the middles of the tiles after the one it's on, pulled straight: a corner
    // is kept only where a straight line to a later tile would brush someone (A* zigzags between equally short routes)
    const mids = (tiles.length > 1 ? tiles.slice(1) : tiles).map(([c, r]) => people.centre(c, r));
    const pts = [new THREE.Vector3(pos.x, 0, pos.z)];
    let at = [pos.x, pos.z], i = 0;
    while (i < mids.length) {
      let j = mids.length - 1;
      while (j > i && !clear(at, mids[j], blocked)) j--;
      at = mids[j]; pts.push(new THREE.Vector3(at[0], 0, at[1])); i = j + 1;
    }
    if (pts[0].distanceTo(pts[pts.length - 1]) < 0.01 && pts.length === 2) { who.col = to.col; who.row = to.row; return true; }
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    walks.set(id, { curve, len: curve.getLength(), s: 0 });
    who.col = to.col; who.row = to.row;
    if (who.player === me) markDest(to);
    return true;
  }
  function markDest(to) { const [x, z] = people.centre(to.col, to.row); dest.position.x = x; dest.position.z = z; dest.visible = true; }

  // ---------- the arrow: a flat ribbon along the rest of the curve, with a head ----------
  const tmp = new THREE.Vector3(), tan = new THREE.Vector3();
  function drawArrow(w) {
    const left = w.len - w.s;
    if (left < 0.05) { arrow.visible = false; return; }
    const head = Math.min(HEAD_L, left), shaftEnd = w.len - head;
    const pos = [], idx = [];
    const at = (s) => { const u = Math.min(1, Math.max(0, s / w.len)); w.curve.getPointAt(u, tmp); w.curve.getTangentAt(u, tan); return [tmp.x, tmp.z, tan.x, tan.z]; };
    const n = Math.max(1, Math.ceil((shaftEnd - w.s) / 0.4));
    if (shaftEnd > w.s) for (let i = 0; i <= n; i++) {
      const [x, z, tx, tz] = at(w.s + (shaftEnd - w.s) * i / n), l = Math.hypot(tx, tz) || 1, px = -tz / l * ARROW_W / 2, pz = tx / l * ARROW_W / 2;
      pos.push(x + px, 0.06, z + pz, x - px, 0.06, z - pz);
      if (i) { const b = pos.length / 3 - 4; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
    const [hx, hz, tx, tz] = at(shaftEnd), l = Math.hypot(tx, tz) || 1, [ex, ez] = at(w.len), b = pos.length / 3;
    const k = HEAD_W / 2 * Math.min(1, head / HEAD_L);
    pos.push(hx - tz / l * k, 0.06, hz + tx / l * k, hx + tz / l * k, 0.06, hz - tx / l * k, ex, 0.06, ez);
    idx.push(b, b + 1, b + 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    arrow.geometry.dispose(); arrow.geometry = g; arrow.visible = true;
  }

  // ---------- walking ----------
  const turnTo = (g, yaw, dt) => { let d = yaw - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); g.rotation.y += d * Math.min(1, TURN * dt); };
  function update(dt) {
    for (const [id, w] of walks) {
      const g = people.list[id].group;
      w.s = Math.min(w.len, w.s + SPEED * dt);
      const u = w.s / w.len;
      w.curve.getPointAt(u, tmp); w.curve.getTangentAt(u, tan);
      g.position.x = tmp.x; g.position.z = tmp.z;
      turnTo(g, Math.atan2(-tan.x, -tan.z), dt); // the body faces -z
      if (w.s >= w.len) walks.delete(id);
    }
    const mine = people.list.find((p) => p.player === me);
    ring.position.x = mine.group.position.x; ring.position.z = mine.group.position.z;
    const w = walks.get(mine.id);
    if (w) drawArrow(w); else { arrow.visible = false; dest.visible = false; }
  }
  function setMe(p) { me = p; const w = walks.get(people.list.find((q) => q.player === me).id); dest.visible = false; if (w) { const who = people.list.find((q) => q.player === me); markDest(who); } }
  return { moveTo, setMe, update, busy: () => walks.size > 0, me: () => me, mine: () => people.list.find((p) => p.player === me), SPEED };
};
