// ===== The people in the room: static NPCs =====
// NPCs(THREE, scene, board) stands about 20 figures on tiles of the board. Each is No Mans Land's Flame Wizard body
// (src/models3d.js) without the hat, the beard and the staff: a robe in its own colour and a head. They don't move yet.
// board: { cols, rows, tile }. The board is centred on the origin, x across it, z down it (your side toward +z).
// Returns { list }: one { id, col, row, robe, skin, facing, group } per NPC.
const NPCs = (THREE, scene, board, opts = {}) => {
  const COUNT = opts.count || 20;
  const SCALE = 2.2; // about 4 m tall on a 6 m tile: bigger than NML's units, so people read on the wide board
  // robes: muted, distinct colours, so each person can be told apart from any view
  const ROBES = ['#B5523B', '#3E7CB1', '#D9A441', '#6B8F3A', '#8E5A9B', '#2F8F83', '#C9744A', '#5A6CB8', '#A63D5A', '#7F8A94',
    '#D27FA0', '#4F6D3A', '#C2B280', '#7A4A33', '#49A0C9', '#9C2F2F', '#E0C95A', '#355C6E', '#B48ACB', '#E4E0D4'];
  const SKINS = ['#F1C8A6', '#D9A27A', '#B57A52', '#8A5636', '#5E3A24'];
  // the Flame Wizard's body, as in NML: a 7-sided robe 1.5 m tall and a faceted head (an icosahedron) on top
  const robeGeo = new THREE.ConeGeometry(0.6, 1.5, 7); robeGeo.translate(0, 0.75, 0);
  const headGeo = new THREE.IcosahedronGeometry(0.25, 0); headGeo.translate(0, 1.6, 0);
  const mat = (hex) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.85, metalness: 0, flatShading: true });
  const skinMats = SKINS.map(mat);

  // seeded, so the room is the same every time it opens
  let sd = 4242; const rr = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; };
  const tiles = [];
  for (let r = 0; r < board.rows; r++) for (let c = 0; c < board.cols; c++) tiles.push([c, r]);
  for (let i = tiles.length - 1; i > 0; i--) { const j = Math.floor(rr() * (i + 1)); [tiles[i], tiles[j]] = [tiles[j], tiles[i]]; }

  const T = board.tile, BW = board.cols * T, BD = board.rows * T;
  const list = [];
  for (let i = 0; i < Math.min(COUNT, tiles.length); i++) {
    const [col, row] = tiles[i], robe = ROBES[i % ROBES.length], skin = Math.floor(rr() * SKINS.length);
    const g = new THREE.Group();
    const body = new THREE.Mesh(robeGeo, mat(robe)), head = new THREE.Mesh(headGeo, skinMats[skin]);
    for (const m of [body, head]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
    const facing = rr() * Math.PI * 2;
    g.position.set((col + 0.5) * T - BW / 2, 0, (row + 0.5) * T - BD / 2);
    g.rotation.y = facing;
    g.scale.setScalar(SCALE);
    g.name = 'npc:' + i;
    scene.add(g);
    list.push({ id: i, col, row, robe, skin: SKINS[skin], facing, group: g });
  }
  return { list, height: 1.85 * SCALE };
};
