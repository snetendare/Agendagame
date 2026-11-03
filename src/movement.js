// ===== Walking: the players move their figures tile to tile, and see their own figure and plan marked =====
// Movement(THREE, scene, board, people, opts) walks characters (src/characters.js) along paths over the tiles.
//   moveTo(id, col, row)  walk figure id to that tile, round anyone standing in the way (8 directions, no cutting past
//                         a corner that a figure fills); a tile someone stands on gives the nearest free tile instead.
//                         Returns false when there's no way there.
//   sit(id, seat)        walk to a seat (src/furniture.js) and sit down at it (or stand at it, at a standing table),
//                         facing the table; the seat is held for id from now. Walking anywhere else gets up first.
//   leave(id)            get up and step to the nearest free tile
//   stand(id, x, z, fx, fz)  standing still, step to the point (x, z) near its tile (into a conversation's circle, or
//                         back to the tile's middle) and face (fx, fz) if given. The tile stays its place for paths.
//   setMe(player)         whose view this is (0 or 1): only that player's figure gets the circle under it, and only that
//                         player's planned path is drawn. The other player's figure looks like any NPC.
//   update(dt), busy()    once per drawn frame; busy while anyone walks
//   inReach(id, col, row)  is that tile within REACH tiles of where the figure is now (8 directions, so a 7 x 7 square)
//   preview(col, row)     mark where your queued walk goes (null clears it); it starts on the next tick
// Nobody walks more than REACH tiles at a time: a longer route is cut after REACH steps (moveTo then returns 'leg',
// and a seat at the far end isn't taken yet). The player has to steer leg by leg, and the NPCs walk the same way, so
// how far someone goes in one go gives nothing away. The player sees their reach as a square on the floor.
//   tick()                on every game tick, before anything else happens on it: every walker takes its next step
// Walking keeps to the ticks: everyone moves one tile a tick (a diagonal one too), the step drawn smoothly over the
// tick's length (opts.tickS() seconds), so a figure arrives at the end of a tick and whatever it does next happens on
// a tick, in step with everyone else. A faster or slower tick walks everyone faster or slower.
// The path is a smooth curve through the tiles' middles; the arrow on the ground is that same curve, from the figure to
// the end, shrinking as it walks.
const Movement = (THREE, scene, board, people, furniture, opts = {}) => {
  const tickS = opts.tickS || (() => 2);
  const TURN = 9;           // how fast a figure turns to face where it walks (per second)
  const POSE_S = 0.32;      // seconds to sit down or get up
  const SIT_SQUASH = 0.3;   // a sitting figure is this much shorter (the robe folds over the seat)
  const STEP_SPEED = 1.6;   // m/s: stepping in to a conversation, a little slower than walking
  const ARROW_W = 0.9;      // the path arrow's width (m)
  const HEAD_L = 1.9, HEAD_W = 2.4; // its head
  const MINE = '#F2D16B';   // your marks: the circle, the arrow, the destination
  const REACH = 3;          // tiles: the furthest anyone walks in one go
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
  const ghostArrow = new THREE.Mesh(new THREE.BufferGeometry(), markMat(0.4)); ghostArrow.renderOrder = 3; ghostArrow.visible = false; scene.add(ghostArrow);
  // the destination: a square just inside the tile
  const sq = (T / 2 - 0.35) * Math.SQRT2;
  const dest = new THREE.Mesh(new THREE.RingGeometry(sq - 0.3, sq, 4, 1, Math.PI / 4), markMat(0.9));
  dest.rotation.x = -Math.PI / 2; dest.position.y = 0.05; dest.renderOrder = 2; dest.visible = false; scene.add(dest);
  let pending = false; // a walk is queued for the next tick: its destination stays marked until it starts
  // your reach: a faint square round the tiles you can walk to in one go
  const reachMat = markMat(0.5), reachFill = markMat(0.05);
  const reach = new THREE.Group(), reachLine = new THREE.Mesh(new THREE.BufferGeometry(), reachMat), reachIn = new THREE.Mesh(new THREE.BufferGeometry(), reachFill);
  for (const m of [reachLine, reachIn]) { m.rotation.x = -Math.PI / 2; m.renderOrder = 1; reach.add(m); }
  reach.position.y = 0.045; scene.add(reach);
  let reachAt = '';
  function drawReach(t) {
    const k = t.col + ',' + t.row; if (k === reachAt) return; reachAt = k;
    const c0 = Math.max(0, t.col - REACH), c1 = Math.min(board.cols - 1, t.col + REACH), r0_ = Math.max(0, t.row - REACH), r1_ = Math.min(board.rows - 1, t.row + REACH);
    const BW = board.cols * T, BD = board.rows * T, x0 = c0 * T - BW / 2 + 0.2, x1 = (c1 + 1) * T - BW / 2 - 0.2, z0 = r0_ * T - BD / 2 + 0.2, z1 = (r1_ + 1) * T - BD / 2 - 0.2, w = 0.22;
    // (drawn in x, -z: laid flat by a quarter turn round x)
    const rect = (a0, a1, b0, b1, p) => { p.moveTo(a0, b0); p.lineTo(a1, b0); p.lineTo(a1, b1); p.lineTo(a0, b1); p.lineTo(a0, b0); return p; };
    const outer = rect(x0, x1, -z1, -z0, new THREE.Shape()); outer.holes.push(rect(x0 + w, x1 - w, -z1 + w, -z0 - w, new THREE.Path()));
    reachLine.geometry.dispose(); reachLine.geometry = new THREE.ShapeGeometry(outer);
    reachIn.geometry.dispose(); reachIn.geometry = new THREE.ShapeGeometry(rect(x0 + w, x1 - w, -z1 + w, -z0 - w, new THREE.Shape()));
  }

  // ---------- paths over the tiles ----------
  const key = (c, r) => c + ',' + r;
  const inside = (c, r) => c >= 0 && c < board.cols && r >= 0 && r < board.rows;
  const walks = new Map(); // id -> { curve, len, s }
  // tiles taken for id: furniture, every chair or stool but the one it's going to, and everyone else (where they
  // stand and where they're walking to). A standing table's empty places are open floor.
  function taken(id, seat) {
    const out = new Set([...furniture.blocked, ...furniture.chairTiles]);
    if (seat) out.delete(key(seat.col, seat.row));
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
  // give up a seat (and get up, if sitting)
  function release(who) { if (who.seat && who.seat.by === who.id) who.seat.by = null; who.seat = null; who.seated = false; }
  // the way id would walk to (col, row) (or to seat) starting from the point (x, z): null if there's no way there
  function plan(id, col, row, seat, x, z) {
    if (!inside(col, row) || (seat && seat.by != null && seat.by !== id)) return null;
    const blocked = taken(id, seat), from = people.tileOf(x, z); if (!from) return null;
    let to = { col, row };
    if (!seat && blocked.has(key(col, row))) to = nearestFree(col, row, blocked, from);
    if (!to) return null;
    blocked.delete(key(from.col, from.row));
    let tiles = path(from, to, blocked);
    if (!tiles) return null;
    let full = true;
    if (tiles.length - 1 > REACH) { // too far for one go: walk the first REACH steps of the way
      tiles = tiles.slice(0, REACH + 1); full = false; seat = null;
      const [c, r] = tiles[tiles.length - 1]; to = { col: c, row: r };
    }
    // from the start point, through the middles of the tiles after the one it's on, pulled straight: a corner is kept
    // only where a straight line to a later tile would brush someone (A* zigzags between equally short routes)
    const mids = (tiles.length > 1 ? tiles.slice(1) : tiles).map(([c, r]) => people.centre(c, r));
    const pts = [new THREE.Vector3(x, 0, z)];
    let at = [x, z], i = 0;
    while (i < mids.length) {
      let j = mids.length - 1;
      while (j > i && !clear(at, mids[j], blocked)) j--;
      at = mids[j]; pts.push(new THREE.Vector3(at[0], 0, at[1])); i = j + 1;
    }
    if (seat) pts[pts.length - 1].set(seat.x, 0, seat.z); // a seat's place isn't the tile's middle: it's pulled to its table
    return { to, mids, pts, full, seat };
  }
  // where id will be when the next tick comes: the end of the step it's taking, or where it stands
  function nextPoint(id) {
    const w = walks.get(id), g = people.list[id].group.position;
    if (!w) return [g.x, g.z];
    w.curve.getPointAt(Math.min(1, w.marks[w.k] / w.len), tmp); return [tmp.x, tmp.z];
  }
  // A walk already under way can be changed at any time: the new way starts from where the figure is when it's ordered
  // (a tick, so at a tile's middle).
  function moveTo(id, col, row, seat = null) {
    const who = people.list[id]; if (!who) return false;
    const pos = who.group.position, pl = plan(id, col, row, seat, pos.x, pos.z);
    if (!pl) return false;
    const { to, mids, pts, full } = pl; seat = pl.seat;
    release(who); who.faceAt = null; who.spot = null;
    if (seat) { seat.by = id; who.seat = seat; }
    if (who.player === me) clearPreview();
    if (pts[0].distanceTo(pts[pts.length - 1]) < 0.05) { walks.delete(id); who.col = to.col; who.row = to.row; if (seat) who.seated = true; return full || 'leg'; }
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal'), len = curve.getLength();
    // how far along the curve each tile's middle is: one of these a tick (the last is the end, at a seat its place)
    const N = Math.max(16, Math.ceil(len / 0.2)), samp = curve.getSpacedPoints(N), marks = [];
    let j = 0;
    for (const [x, z] of mids) {
      let best = j, bd = Infinity;
      for (let q = j; q <= N; q++) { const d = Math.hypot(samp[q].x - x, samp[q].z - z); if (d < bd) { bd = d; best = q; } }
      j = best; marks.push(best / N * len);
    }
    marks[marks.length - 1] = len;
    walks.set(id, { curve, len, s: 0, marks, k: 0, from: 0 });
    who.col = to.col; who.row = to.row;
    if (who.player === me) markDest(to);
    return full || 'leg';
  }
  const posTile = (id) => { const g = people.list[id].group.position; return people.tileOf(g.x, g.z); };
  function inReach(id, col, row) { const t = posTile(id); return !!t && Math.max(Math.abs(t.col - col), Math.abs(t.row - row)) <= REACH; }
  // preview(col, row): a walk you've ordered for the next tick. Its destination shows at once, and so does the way
  // there, fainter, from where you'll be when the tick comes; the arrow of a walk under way stops at that point.
  let ghost = null; // { curve, len, s }
  function clearPreview() { pending = false; ghost = null; ghostArrow.visible = false; }
  function preview(col, row) {
    if (col == null) { clearPreview(); return; }
    const who = people.list.find((p) => p.player === me), [x, z] = nextPoint(who.id), pl = plan(who.id, col, row, null, x, z);
    pending = true; markDest(pl ? pl.to : { col, row });
    ghost = null; ghostArrow.visible = false;
    if (pl && pl.pts.length > 1 && pl.pts[0].distanceTo(pl.pts[pl.pts.length - 1]) > 0.05) {
      const curve = new THREE.CatmullRomCurve3(pl.pts, false, 'centripetal');
      ghost = { curve, len: curve.getLength(), s: 0 }; drawArrow(ghostArrow, ghost, ghost.len);
    }
  }
  function sit(id, s) { return !!s && moveTo(id, s.col, s.row, s); }
  function leave(id) {
    const who = people.list[id], blocked = taken(id), t = people.tileOf(who.group.position.x, who.group.position.z);
    const to = nearestFree(t.col, t.row, blocked, t);
    return to ? moveTo(id, to.col, to.row) : false;
  }
  function markDest(to) { const [x, z] = people.centre(to.col, to.row); dest.position.x = x; dest.position.z = z; dest.visible = true; }

  // ---------- the arrow: a flat ribbon along the rest of the curve, with a head ----------
  const tmp = new THREE.Vector3(), tan = new THREE.Vector3();
  // the arrow mesh along w's curve from where it is (w.s) to end; with no head when it stops short of the curve's end
  function drawArrow(mesh, w, end = w.len) {
    const left = end - w.s;
    if (left < 0.05) { mesh.visible = false; return; }
    const tip = end >= w.len - 0.01, head = tip ? Math.min(HEAD_L, left) : 0, shaftEnd = end - head;
    const pos = [], idx = [];
    const at = (s) => { const u = Math.min(1, Math.max(0, s / w.len)); w.curve.getPointAt(u, tmp); w.curve.getTangentAt(u, tan); return [tmp.x, tmp.z, tan.x, tan.z]; };
    const n = Math.max(1, Math.ceil((shaftEnd - w.s) / 0.4));
    if (shaftEnd > w.s) for (let i = 0; i <= n; i++) {
      const [x, z, tx, tz] = at(w.s + (shaftEnd - w.s) * i / n), l = Math.hypot(tx, tz) || 1, px = -tz / l * ARROW_W / 2, pz = tx / l * ARROW_W / 2;
      pos.push(x + px, 0.06, z + pz, x - px, 0.06, z - pz);
      if (i) { const b = pos.length / 3 - 4; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
    if (tip) {
      const [hx, hz, tx, tz] = at(shaftEnd), l = Math.hypot(tx, tz) || 1, [ex, ez] = at(w.len), b = pos.length / 3;
      const k = HEAD_W / 2 * Math.min(1, head / HEAD_L);
      pos.push(hx - tz / l * k, 0.06, hz + tx / l * k, hx + tz / l * k, 0.06, hz - tx / l * k, ex, 0.06, ez);
      idx.push(b, b + 1, b + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    mesh.geometry.dispose(); mesh.geometry = g; mesh.visible = true;
  }

  // ---------- walking ----------
  const faceYaw = (w) => Math.atan2(-(w.faceAt[0] - w.group.position.x), -(w.faceAt[1] - w.group.position.z));
  const turnTo = (g, yaw, dt) => { let d = yaw - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); g.rotation.y += d * Math.min(1, TURN * dt); };
  const arrive = (id) => { walks.delete(id); const who = people.list[id]; if (who.seat) who.seated = true; };
  // a tick: whoever is between tiles finishes that step at once, then everyone starts the next one
  function tick() {
    for (const [id, w] of walks) {
      w.s = w.marks[w.k];
      const g = people.list[id].group; w.curve.getPointAt(Math.min(1, w.s / w.len), tmp); g.position.x = tmp.x; g.position.z = tmp.z;
      if (w.k >= w.marks.length - 1) { arrive(id); continue; }
      w.from = w.s; w.k++;
    }
  }
  function update(dt) {
    for (const [id, w] of walks) {
      const g = people.list[id].group, goal = w.marks[w.k];
      w.s = Math.min(goal, w.s + (goal - w.from) * dt / tickS());
      const u = w.s / w.len;
      w.curve.getPointAt(u, tmp); w.curve.getTangentAt(u, tan);
      g.position.x = tmp.x; g.position.z = tmp.z;
      turnTo(g, Math.atan2(-tan.x, -tan.z), dt); // the body faces -z
      if (w.s >= w.len) arrive(id);
    }
    // stepping in to a conversation's circle (or back to the tile's middle)
    for (const who of people.list) {
      if (!who.spot || walks.has(who.id) || who.seated) continue;
      const g = who.group, dx = who.spot[0] - g.position.x, dz = who.spot[1] - g.position.z, d = Math.hypot(dx, dz);
      if (d < 0.005) { g.position.x = who.spot[0]; g.position.z = who.spot[1]; continue; }
      const k = Math.min(1, STEP_SPEED * dt / d), e = d < 0.6 ? Math.max(0.35, d / 0.6) : 1; // eases in over the last half metre
      g.position.x += dx * Math.min(1, k * e); g.position.z += dz * Math.min(1, k * e);
    }
    // sitting down and getting up, and turning to face the table once there
    for (const who of people.list) {
      const g = who.group, want = who.seated && who.seat.pose === 'sit' ? 1 : 0;
      if (who.seated && !walks.has(who.id)) turnTo(g, who.seat.yaw, dt);
      else if (who.faceAt && !walks.has(who.id)) turnTo(g, faceYaw(who), dt);
      if (who.pose !== want) who.pose = want > who.pose ? Math.min(1, who.pose + dt / POSE_S) : Math.max(0, who.pose - dt / POSE_S);
      if (who.seated) who.sitY = who.seat.y; // kept while getting up, so it sinks back down from the same height
      const k = who.pose * who.pose * (3 - 2 * who.pose), y = who.sitY || 0;
      g.position.y = y * k;
      g.scale.y = who.base * (1 - SIT_SQUASH * k);
    }
    const mine = people.list.find((p) => p.player === me);
    ring.position.x = mine.group.position.x; ring.position.z = mine.group.position.z;
    const w = walks.get(mine.id);
    if (w) drawArrow(arrow, w, ghost ? w.marks[w.k] : w.len); else { arrow.visible = false; dest.visible = pending; }
    drawReach(posTile(mine.id) || mine);
  }
  function setMe(p) { me = p; clearPreview(); reachAt = ''; const w = walks.get(people.list.find((q) => q.player === me).id); dest.visible = false; if (w) { const who = people.list.find((q) => q.player === me); markDest(who); } }
  const off = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  // face(id, x, z): standing still, turn to look at that point (someone you talk to, the middle of a group)
  function face(id, x, z) { const who = people.list[id]; who.faceAt = [x, z]; }
  function stand(id, x, z, fx, fz) { const who = people.list[id]; who.spot = [x, z]; who.faceAt = fx == null ? null : [fx, fz]; }
  const settling = () => people.list.some((w) => (w.seated && !walks.has(w.id) && off(w.seat.yaw, w.group.rotation.y) > 0.01)
    || (!w.seated && w.faceAt && !walks.has(w.id) && off(faceYaw(w), w.group.rotation.y) > 0.01)
    || (!w.seated && w.spot && !walks.has(w.id) && Math.hypot(w.spot[0] - w.group.position.x, w.spot[1] - w.group.position.z) > 0.005)
    || w.pose !== (w.seated && w.seat.pose === 'sit' ? 1 : 0));
  return { moveTo, sit, leave, face, stand, setMe, update, tick, inReach, preview, REACH, busy: () => walks.size > 0 || settling(), walking: (id) => walks.has(id), me: () => me, mine: () => people.list.find((p) => p.player === me) };
};
