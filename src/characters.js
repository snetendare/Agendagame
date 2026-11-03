// ===== The people in the room: 20 NPCs and the 2 players' characters, all alike =====
// Characters(THREE, scene, board, match) stands 22 figures on tiles of the board. Each is No Mans Land's Flame Wizard
// body (src/models3d.js) without the hat, the beard and the staff: a robe and a head. Nothing about a player's figure
// tells it apart from the NPCs: the robe and skin colours, the tile and the facing are drawn from the match's random
// numbers the same way for everyone, and the two players' figures get random places in the list (so not even the ids
// give them away). Only the player's own view marks their figure (src/movement.js draws the circle under it).
// board: { cols, rows, tile }. The board is centred on the origin, x across it, z down it.
// Returns { list, height, players: [id of player 0's figure, id of player 1's], tileOf(x, z), centre(col, row) }.
// Each in list: { id, player (0, 1 or null for an NPC), col, row, robe, skin, group }. col / row is the tile it stands on
// (or is walking to: src/movement.js keeps them up to date).
const Characters = (THREE, scene, board, match) => {
  const NPCS = 20, PLAYERS = 2, COUNT = NPCS + PLAYERS;
  const SCALE = 2.2; // about 4 m tall on a 6 m tile: bigger than NML's units, so people read on the wide board
  // robes: muted, distinct colours, so each person can be told apart from any view (more than there are people, so
  // which colours appear changes from match to match too)
  const ROBES = ['#B5523B', '#3E7CB1', '#D9A441', '#6B8F3A', '#8E5A9B', '#2F8F83', '#C9744A', '#5A6CB8', '#A63D5A', '#7F8A94',
    '#D27FA0', '#4F6D3A', '#C2B280', '#7A4A33', '#49A0C9', '#9C2F2F', '#E0C95A', '#355C6E', '#B48ACB', '#E4E0D4',
    '#3B3F46', '#E08A3C', '#78B8A0', '#6A3E7C', '#A9B84A', '#5C8FD6'];
  const SKINS = ['#F1C8A6', '#D9A27A', '#B57A52', '#8A5636', '#5E3A24'];
  // the Flame Wizard's body, as in NML: a 7-sided robe 1.5 m tall and a faceted head (an icosahedron) on top
  const robeGeo = new THREE.ConeGeometry(0.6, 1.5, 7); robeGeo.translate(0, 0.75, 0);
  const headGeo = new THREE.IcosahedronGeometry(0.25, 0); headGeo.translate(0, 1.6, 0);
  const mat = (hex) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.85, metalness: 0, flatShading: true });
  const skinMats = SKINS.map(mat);

  const rr = match.rng;
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rr() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const tiles = [];
  for (let r = 0; r < board.rows; r++) for (let c = 0; c < board.cols; c++) tiles.push([c, r]);
  shuffle(tiles);
  const robes = shuffle(ROBES.slice());
  const playerIds = shuffle([...Array(COUNT).keys()]).slice(0, PLAYERS);

  const T = board.tile, BW = board.cols * T, BD = board.rows * T;
  const centre = (col, row) => [(col + 0.5) * T - BW / 2, (row + 0.5) * T - BD / 2];
  const tileOf = (x, z) => { const col = Math.floor((x + BW / 2) / T), row = Math.floor((z + BD / 2) / T); return col >= 0 && col < board.cols && row >= 0 && row < board.rows ? { col, row } : null; };
  const list = [];
  for (let i = 0; i < COUNT; i++) {
    const [col, row] = tiles[i], robe = robes[i], skin = Math.floor(rr() * SKINS.length), facing = rr() * Math.PI * 2;
    const g = new THREE.Group();
    const body = new THREE.Mesh(robeGeo, mat(robe)), head = new THREE.Mesh(headGeo, skinMats[skin]);
    for (const m of [body, head]) { m.castShadow = true; m.receiveShadow = true; m.userData.who = i; g.add(m); }
    const [x, z] = centre(col, row);
    g.position.set(x, 0, z);
    g.rotation.y = facing;
    g.scale.setScalar(SCALE);
    g.name = 'who:' + i;
    scene.add(g);
    const p = playerIds.indexOf(i);
    list.push({ id: i, player: p < 0 ? null : p, col, row, robe, skin: SKINS[skin], group: g });
  }
  return { list, height: 1.85 * SCALE, radius: 0.6 * SCALE, players: playerIds, tileOf, centre };
};
