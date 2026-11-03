// ===== The room: four walls round the board =====
// Room(THREE, scene, BW, BD) walls in the board (BW x BD metres, centred on the origin): wood panelling up to a
// chair rail, plaster above, a skirting at the foot and a cornice at the top. No furniture or other dressing yet.
// Like a doll's house, a wall the camera is outside of drops to its low panelling, so it never hides the room:
// update(camera) once per drawn frame picks which. Rotating the view (Q / E) swaps which walls are low.
const Room = (THREE, scene, BW, BD) => {
  const H = 8;            // wall height (m): above the people (4 m), below most of their pies when held up
  const LOW = 1.1;        // a cut-away wall: its panelling, up to the rail
  const TH = 0.5;         // wall thickness
  const PANEL = 1.4;      // the panelling's height in a full wall
  const std = (color, rough) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
  const plaster = std('#2E4A43', 0.9), panel = std('#4A2E1E', 0.6), trim = std('#D8CBAE', 0.55);
  const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; };
  // a wall along x (length L), its room side toward +z, built at the origin; full or low
  function wall(L, full) {
    const g = new THREE.Group(), top = full ? H : LOW, pH = full ? PANEL : LOW - 0.12;
    g.add(box(L, pH, TH, panel, 0, pH / 2, 0));
    g.add(box(L, 0.25, TH + 0.08, trim, 0, 0.125, 0.04));            // skirting
    g.add(box(L, 0.1, TH + 0.12, trim, 0, pH + 0.05, 0.06));        // chair rail
    if (full) {
      g.add(box(L, H - pH - 0.1, TH, plaster, 0, pH + 0.1 + (H - pH - 0.1) / 2, 0));
      g.add(box(L, 0.35, TH + 0.25, trim, 0, H - 0.175, 0.125));    // cornice
    } else g.add(box(L, 0.08, TH + 0.12, trim, 0, top, 0.06));      // cap on the cut
    return g;
  }
  // each side: where it stands, which way the room is from it (its inward normal), and both versions of its wall
  const sides = [
    { x: 0, z: -BD / 2 - TH / 2, ry: 0, n: [0, 1], L: BW + TH * 2 },          // far
    { x: 0, z: BD / 2 + TH / 2, ry: Math.PI, n: [0, -1], L: BW + TH * 2 },    // near
    { x: -BW / 2 - TH / 2, z: 0, ry: Math.PI / 2, n: [1, 0], L: BD },         // left
    { x: BW / 2 + TH / 2, z: 0, ry: -Math.PI / 2, n: [-1, 0], L: BD },        // right
  ].map((s) => {
    const full = wall(s.L, true), low = wall(s.L, false);
    for (const w of [full, low]) { w.position.set(s.x, 0, s.z); w.rotation.y = s.ry; scene.add(w); }
    return { ...s, full, low };
  });
  // the camera outside a wall's line (on the far side of it from the room) sees the low version
  function update(camera) {
    const p = camera.position;
    for (const s of sides) {
      const outside = (p.x - s.x) * s.n[0] + (p.z - s.z) * s.n[1] < 0;
      s.full.visible = !outside; s.low.visible = outside;
    }
  }
  return { update, height: H };
};
