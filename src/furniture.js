// ===== Furniture: the things people use (the dining table, standing tables, the bar, chairs by the walls) =====
// Furniture(THREE, scene, board) places the pieces on the tiles of the board and gives each its places to be:
//   the dining table, 3 x 1 tiles, 8 seats round it (3 on each long side, one at each end)
//   2 standing (mingle) tables, 1 tile each, 3 places to stand at each
//   the bar against the far wall, 2 tiles, 2 stools
//   4 single chairs against the walls
// Each piece: { id, kind, name, verb, tiles: [[col, row]], seats, group, top (height of its top, m) }.
// Each seat: { id, furniture, col, row, pose ('sit' or 'stand'), x, z (where the body goes), y (how high it sits),
// yaw (which way it faces), by (the character using it or walking to it, else null) }.
// The furniture's tiles can't be walked on, and neither can a seat's tile except by the one going to that seat
// (src/movement.js). Sized for the people: a figure is about 4 m tall (2.2 times a person), so is the furniture.
const Furniture = (THREE, scene, board) => {
  const T = board.tile, BW = board.cols * T, BD = board.rows * T;
  const K = 2.2; // people are drawn 2.2 times life size: so is everything they use
  const centre = (c, r) => [(c + 0.5) * T - BW / 2, (r + 0.5) * T - BD / 2];
  const std = (color, rough = 0.7, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  const M = { wood: std('#3B2416', 0.55), cloth: std('#F2EEE6', 0.9), brass: std('#C9A24A', 0.35, 0.6), marble: std('#E6E1D8', 0.3),
    velvet: std('#7A1F2B', 0.95), china: std('#FBFAF6', 0.35), candle: std('#FFF4DC', 0.6), glass: [std('#2F5A3A', 0.25), std('#6B1E24', 0.25), std('#C79A3B', 0.25), std('#3A3F6B', 0.25)] };
  const add = (g, geo, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (rt, rb, h, n = 20) => new THREE.CylinderGeometry(rt, rb, h, n);

  // ---------- the models (each built at the origin, its front toward -z) ----------
  // a dining chair: velvet seat and back, dark wood legs. The sitter sits over its middle, facing -z.
  const SEAT_Y = 0.46 * K;
  function chair() {
    const g = new THREE.Group(), s = 0.48 * K, legH = SEAT_Y - 0.08;
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(g, box(0.1, legH, 0.1), M.wood, x * (s / 2 - 0.08), legH / 2, z * (s / 2 - 0.08));
    add(g, box(s, 0.12, s), M.wood, 0, legH + 0.06, 0);
    add(g, box(s - 0.12, 0.12, s - 0.12), M.velvet, 0, legH + 0.18, 0);
    add(g, box(s, 0.5 * K, 0.12), M.wood, 0, SEAT_Y + 0.25 * K, s / 2 - 0.06);
    add(g, box(s - 0.2, 0.4 * K, 0.06), M.velvet, 0, SEAT_Y + 0.27 * K, s / 2 - 0.15);
    return g;
  }
  // a bar stool: brass pedestal, round velvet seat
  const STOOL_Y = 0.76 * K;
  function stool() {
    const g = new THREE.Group();
    add(g, cyl(0.45, 0.5, 0.08), M.brass, 0, 0.04, 0);
    add(g, cyl(0.07, 0.07, STOOL_Y - 0.2, 10), M.brass, 0, (STOOL_Y - 0.2) / 2, 0);
    add(g, new THREE.TorusGeometry(0.4, 0.04, 6, 20), M.brass, 0, STOOL_Y * 0.4, 0).rotation.x = Math.PI / 2;
    add(g, cyl(0.6, 0.55, 0.22), M.velvet, 0, STOOL_Y - 0.1, 0);
    return g;
  }

  // ---------- the pieces ----------
  const list = [], seats = [];
  // a seat on tile (col, row), its body pushed `inward` metres toward (fx, fz) (the direction it faces, a unit vector)
  function seat(f, col, row, pose, fx, fz, inward, y, model) {
    const [cx, cz] = centre(col, row), x = cx + fx * inward, z = cz + fz * inward, yaw = Math.atan2(-fx, -fz);
    const s = { id: seats.length, furniture: f.id, col, row, pose, x, z, y, yaw, by: null };
    if (model) { model.position.set(x, 0, z); model.rotation.y = yaw; tag(model, f.id); scene.add(model); f.parts.push(model); }
    seats.push(s); f.seats.push(s);
    return s;
  }
  function piece(kind, name, verb, tiles, top) {
    const f = { id: list.length, kind, name, verb, tiles, seats: [], group: new THREE.Group(), parts: [], top };
    tag(f.group, f.id); scene.add(f.group); list.push(f);
    return f;
  }
  const tag = (o, id) => o.traverse((m) => { m.userData.furniture = id; });

  // the dining table: cols 8 to 10, row 3, a white cloth, a plate and glass at every place, candlesticks down the middle
  {
    const TOP = 0.75 * K, c0 = 8, r = 3, L = 3 * T - 2.2, Wd = T - 1.6;
    const f = piece('dining', 'Dining table', 'Sit down', [[c0, r], [c0 + 1, r], [c0 + 2, r]], TOP);
    const [x0, z0] = centre(c0 + 1, r);
    const g = f.group; g.position.set(x0, 0, z0);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(g, box(0.25, TOP - 0.1, 0.25), M.wood, sx * (L / 2 - 0.6), (TOP - 0.1) / 2, sz * (Wd / 2 - 0.5));
    add(g, box(L, 0.12, Wd), M.wood, 0, TOP - 0.06, 0);
    add(g, box(L + 0.3, 0.06, Wd + 0.3), M.cloth, 0, TOP + 0.02, 0);
    for (const sz of [-1, 1]) add(g, box(L + 0.3, 0.7, 0.05), M.cloth, 0, TOP - 0.33, sz * (Wd / 2 + 0.15)); // the cloth hanging over the sides
    for (const sx of [-1, 1]) add(g, box(0.05, 0.7, Wd + 0.3), M.cloth, sx * (L / 2 + 0.15), TOP - 0.33, 0);
    for (const dx of [-T, 0, T]) { // candlesticks
      add(g, cyl(0.12, 0.28, 0.9, 12), M.brass, dx, TOP + 0.5, 0);
      add(g, cyl(0.07, 0.07, 0.6, 8), M.candle, dx, TOP + 1.25, 0);
    }
    const IN = 2.0;
    for (let k = 0; k < 3; k++) {
      seat(f, c0 + k, r - 1, 'sit', 0, 1, IN, SEAT_Y, chair());
      seat(f, c0 + k, r + 1, 'sit', 0, -1, IN, SEAT_Y, chair());
      for (const sz of [-1, 1]) { // a plate and a glass at each place on this side
        const px = (k - 1) * T, pz = sz * (Wd / 2 - 0.75);
        add(g, cyl(0.42, 0.34, 0.05, 20), M.china, px, TOP + 0.08, pz);
        add(g, cyl(0.1, 0.07, 0.45, 10), M.glass[(k + (sz > 0 ? 1 : 0)) % 4], px + 0.7, TOP + 0.28, pz - sz * 0.25);
      }
    }
    seat(f, c0 - 1, r, 'sit', 1, 0, IN, SEAT_Y, chair());
    seat(f, c0 + 3, r, 'sit', -1, 0, IN, SEAT_Y, chair());
    for (const sx of [-1, 1]) add(g, cyl(0.42, 0.34, 0.05, 20), M.china, sx * (L / 2 - 0.7), TOP + 0.08, 0);
  }

  // standing tables: a tall round table in a fitted white cover, three places round it
  for (const [c, r, spots] of [[4, 5, [[-1, 0], [1, 0], [0, 1]]], [15, 2, [[-1, 0], [1, 0], [0, 1]]]]) {
    const TOP = 1.1 * K;
    const f = piece('mingle', 'Standing table', 'Join table', [[c, r]], TOP);
    const [x0, z0] = centre(c, r), g = f.group; g.position.set(x0, 0, z0);
    add(g, cyl(1.5, 1.5, 0.12, 28), M.cloth, 0, TOP - 0.06, 0);
    add(g, cyl(1.45, 0.35, TOP * 0.55, 28), M.cloth, 0, TOP - 0.12 - TOP * 0.275, 0);  // the cover, drawn in at the waist
    add(g, cyl(0.35, 1.0, TOP * 0.33, 28), M.cloth, 0, TOP * 0.165, 0);                  // and flaring to the floor
    add(g, cyl(0.1, 0.07, 0.45, 10), M.glass[c % 4], 0.5, TOP + 0.22, 0.3);
    add(g, cyl(0.1, 0.07, 0.45, 10), M.glass[(c + 1) % 4], -0.4, TOP + 0.22, -0.4);
    for (const [dc, dr] of spots) seat(f, c + dc, r + dr, 'stand', -dc, -dr, 2.2, 0, null);
  }

  // the bar: a counter on the far wall's first row, cols 1 and 2, marble top and brass foot rail, bottles on the shelf
  {
    const TOP = 1.08 * K, c0 = 1, r = 0, L = 2 * T - 0.6, D = 2.4;
    const f = piece('bar', 'Bar', 'Sit down', [[c0, r], [c0 + 1, r]], TOP);
    const [xa] = centre(c0, r), [xb, z0] = centre(c0 + 1, r), g = f.group;
    g.position.set((xa + xb) / 2, 0, z0 + 0.6);
    add(g, box(L, TOP - 0.1, D), M.wood, 0, (TOP - 0.1) / 2, 0);
    add(g, box(L + 0.3, 0.14, D + 0.35), M.marble, 0, TOP - 0.03, 0.1);
    add(g, cyl(0.06, 0.06, L, 8), M.brass, 0, 0.45, D / 2 + 0.35).rotation.z = Math.PI / 2;
    // the back bar: a shelf on the wall behind, with bottles
    const zb = -BD / 2 - z0 - 0.6 + 0.6;
    add(g, box(L, 0.12, 0.9), M.wood, 0, 3.6, zb);
    for (let k = 0; k < 12; k++) {
      const bx = -L / 2 + 0.6 + k * (L - 1.2) / 11, h = 0.9 + (k * 7 % 5) * 0.12;
      add(g, cyl(0.16, 0.18, h, 10), M.glass[k % 4], bx, 3.66 + h / 2, zb);
    }
    for (let k = 0; k < 2; k++) seat(f, c0 + k, r + 1, 'sit', 0, -1, 2.2, STOOL_Y, stool());
  }

  // single chairs against the walls, facing into the room
  for (const [c, r, fx, fz] of [[0, 2, 1, 0], [19, 5, -1, 0], [13, 0, 0, 1], [6, 7, 0, -1]]) {
    const f = piece('chair', 'Chair', 'Sit down', [], SEAT_Y + 0.5 * K);
    seat(f, c, r, 'sit', fx, fz, -1.6, SEAT_Y, chair()); // pushed back against the wall
  }

  for (const f of list) tag(f.group, f.id); // (its parts were added after it was made)
  const key = (c, r) => c + ',' + r;
  const blocked = new Set(list.flatMap((f) => f.tiles.map(([c, r]) => key(c, r))));
  const seatTiles = new Set(seats.map((s) => key(s.col, s.row)));
  // where a piece stands (for the popup over it): the middle of its tiles, or of its seat
  const middle = (f) => { const pts = f.tiles.length ? f.tiles.map(([c, r]) => centre(c, r)) : f.seats.map((s) => [s.x, s.z]); return [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length]; };
  const targets = () => list.flatMap((f) => [f.group, ...f.parts]);
  const free = (f) => f.seats.filter((s) => s.by == null);
  // ---------- highlight: the piece you tapped glows warm and gets a gold outline on the floor round it ----------
  const HI = '#F2D16B';
  const hiMats = new Map(); // a material -> its glowing copy
  const glow = (m) => { if (!hiMats.has(m)) { const h = m.clone(); h.emissive.set(HI); h.emissiveIntensity = 0.3; hiMats.set(m, h); } return hiMats.get(m); };
  const outlineMat = new THREE.MeshBasicMaterial({ color: HI, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const outline = new THREE.Mesh(new THREE.BufferGeometry(), outlineMat); outline.rotation.x = -Math.PI / 2; outline.position.y = 0.06; outline.renderOrder = 2; outline.visible = false; scene.add(outline);
  const bb = new THREE.Box3(), part = new THREE.Box3();
  let lit = null;
  function highlight(id) {
    const f = id == null ? null : list[id];
    if (f === lit) return;
    const meshes = (p) => { const out = []; for (const o of [p.group, ...p.parts]) o.traverse((m) => { if (m.isMesh) out.push(m); }); return out; };
    if (lit) for (const m of meshes(lit)) { if (m.userData.plain) { m.material = m.userData.plain; delete m.userData.plain; } }
    lit = f; outline.visible = !!f;
    if (!f) return;
    for (const m of meshes(f)) { m.userData.plain = m.material; m.material = glow(m.material); }
    // the outline: a rounded rectangle round everything the piece is made of (its table and its chairs)
    bb.makeEmpty(); for (const o of [f.group, ...f.parts]) { part.setFromObject(o); bb.union(part); }
    const pad = 0.5, w = 0.28, x0 = bb.min.x - pad, x1 = bb.max.x + pad, z0 = bb.min.z - pad, z1 = bb.max.z + pad;
    const rect = (a0, a1, b0, b1, r, path) => { path.moveTo(a0 + r, b0); path.lineTo(a1 - r, b0); path.quadraticCurveTo(a1, b0, a1, b0 + r); path.lineTo(a1, b1 - r); path.quadraticCurveTo(a1, b1, a1 - r, b1);
      path.lineTo(a0 + r, b1); path.quadraticCurveTo(a0, b1, a0, b1 - r); path.lineTo(a0, b0 + r); path.quadraticCurveTo(a0, b0, a0 + r, b0); return path; };
    // (the shape is drawn in x, -z: it is laid flat by turning it a quarter round x)
    const shape = rect(x0, x1, -z1, -z0, 0.9, new THREE.Shape()), hole = rect(x0 + w, x1 - w, -z1 + w, -z0 - w, 0.9 - w, new THREE.Path());
    shape.holes.push(hole);
    outline.geometry.dispose(); outline.geometry = new THREE.ShapeGeometry(shape, 8);
  }
  return { list, seats, blocked, seatTiles, targets, middle, free, key, highlight };
};
