// ===== Conversation pies: one shared grey plate per conversation, with outlined slots filled by wooden pieces =====
// Pies(THREE, scene, opts) draws the conversation charts. A pie floats over the middle of its conversation (over the
// table, for people seated together), always faces the camera, and has n slots counted clockwise from the top like a
// clock. Each piece is one emotion (src/emotions.js): indifference is plain wood, the others painted wood.
//
// Calls:
//   create(key, n, where)  a new pie with n empty slots; where() -> [x, z] is where it hangs (it eases there)
//   destroy(key)           pop it away
//   put(key, slot, e)      drop a piece of emotion e into that (empty) slot
//   take(key, slot)        lift the piece out of that slot
//   update(dt, camera)     once per drawn frame; busy() is true while anything is still moving
// Events (for sound later): opts.onEvent(type, detail) and a window event 'agenda:pie' with { type, convo, slot, n, e },
// type one of 'show', 'hide', 'drop' (a piece starts falling), 'snap' (it clicks into its slot), 'full', 'take'.
//
// What makes the snap feel good, in order: the piece arrives fast and accelerating (no slow ease at the end), it sinks
// a hair too deep and springs back (the click), it squashes flat and rebounds, a short glint runs over its face, a few
// wood chips jump out of the joint, the plate takes the hit (dips, tilts away on that side, wobbles back), and the
// pieces already in the pie twitch outward from the impact like a ripple. Filling the last slot sends one wave round.
const Pies = (THREE, scene, opts = {}) => {
  const R = 2.5;          // the plate's radius (m): a little under a tile across
  const RIM = 0.14;       // width of the raised rim
  const HUB = 0.2;        // radius of the hub in the middle
  const DEPTH = 0.2;      // a piece's thickness (plus its bevels)
  const BEVEL = 0.04;
  const GAP = 0.05;       // space between neighbouring pieces (m)
  const REST_Z = BEVEL + 0.005; // a seated piece's back sits on the plate's floor (z = 0)
  const LIFT = 1.2;       // the pie's bottom edge hangs this far above the heads
  const TILT = -0.32;     // the pie leans back from the camera a little, so its thickness shows
  const FLY = 0.3;        // seconds from a piece appearing to it hitting the slot
  const DROP_H = 1.5;     // how far in front of the plate it starts
  const Y = (opts.height || 4) + LIFT + R;

  // ---------- materials ----------
  const std = (color, rough = 0.8) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
  const floorMat = std('#73787E'), plateMat = std('#8D9297'), lineMat = std('#C4C8CC', 0.7);
  // the wood: a painted canvas of long grain lines, a few knots and pores; the same picture bumps the surface a little
  const wood = (() => {
    const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    let sd = 777; const rr = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; };
    const grd = g.createLinearGradient(0, 0, 0, S);
    grd.addColorStop(0, '#C99358'); grd.addColorStop(0.5, '#D6A367'); grd.addColorStop(1, '#C48C51');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    for (let k = 0; k < 14; k++) { // broad soft bands of lighter and darker wood
      const y = rr() * S, h = 8 + rr() * 30;
      g.globalAlpha = 0.12 + rr() * 0.12; g.fillStyle = rr() < 0.5 ? '#A86F3A' : '#E4B579';
      g.beginPath(); for (let x = 0; x <= S; x += 8) { const yy = y + Math.sin(x * 0.012 + k) * 10; x ? g.lineTo(x, yy) : g.moveTo(x, yy); }
      for (let x = S; x >= 0; x -= 8) g.lineTo(x, y + h + Math.sin(x * 0.012 + k) * 10);
      g.fill();
    }
    for (let k = 0; k < 120; k++) { // the grain: long, gently wavy lines, darker and lighter
      const y = rr() * S, a = 2 + rr() * 6, f = 0.004 + rr() * 0.01, ph = rr() * 6, a2 = rr() * 2;
      g.globalAlpha = 0.18 + rr() * 0.35; g.strokeStyle = rr() < 0.75 ? '#8E5A2B' : '#EBC28A'; g.lineWidth = 0.6 + rr() * 2;
      g.beginPath(); for (let x = -4; x <= S + 4; x += 6) { const yy = y + Math.sin(x * f + ph) * a + Math.sin(x * 0.08 + ph) * a2; x > -4 ? g.lineTo(x, yy) : g.moveTo(x, yy); } g.stroke();
    }
    for (let n = 0; n < 2; n++) { // two knots, with grain rings round them
      const x = 80 + rr() * (S - 160), y = 80 + rr() * (S - 160);
      for (let r = 4; r < 34; r += 3.5) { g.globalAlpha = 0.35 - r / 120; g.strokeStyle = '#7A4A22'; g.lineWidth = 1.4; g.beginPath(); g.ellipse(x, y, r * 2.4, r * 0.9, 0, 0, Math.PI * 2); g.stroke(); }
      g.globalAlpha = 0.7; g.fillStyle = '#5E3818'; g.beginPath(); g.ellipse(x, y, 7, 3.5, 0, 0, Math.PI * 2); g.fill();
    }
    for (let k = 0; k < 1400; k++) { g.globalAlpha = 0.2 + rr() * 0.2; g.fillStyle = '#6E431F'; g.fillRect(rr() * S, rr() * S, 1 + rr() * 3, 0.8); } // pores
    g.globalAlpha = 1;
    return c;
  })();
  // painted wood: the same grain, pale, so a colour laid over it still shows the wood through the paint
  const painted = (() => {
    const c = document.createElement('canvas'); c.width = c.height = wood.width;
    const g = c.getContext('2d'); g.drawImage(wood, 0, 0);
    const im = g.getImageData(0, 0, c.width, c.height), d = im.data;
    for (let i = 0; i < d.length; i += 4) { const l = (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) / 255, v = 255 * (0.62 + 0.42 * Math.min(1, l / 0.8)); d[i] = d[i + 1] = d[i + 2] = Math.min(255, v); }
    g.putImageData(im, 0, 0);
    return c;
  })();
  const tex = (canvas, srgb) => { const t = new THREE.CanvasTexture(canvas); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; };
  const woodTex = tex(wood, true), paintTex = tex(painted, true), bumpTex = tex(wood, false);
  // each piece: the grain turned to run out from the middle along it, and (plain wood) a slightly different tone
  const TONES = ['#FFFFFF', '#F4E6D6', '#FFF3E2', '#EADBC8', '#FFF8EE', '#F0DCC2'];
  const mats = new Map();
  function woodMat(n, k, e) {
    const id = n + '|' + k + '|' + e; if (mats.has(id)) return mats.get(id);
    const angle = slotAngles(n, k)[2], plain = e === 'indifference';
    const map = (plain ? woodTex : paintTex).clone(), bump = bumpTex.clone();
    for (const t of [map, bump]) { t.repeat.set(0.55, 0.55); t.rotation = -angle; t.offset.set(k * 0.37, k * 0.21); t.needsUpdate = true; }
    const m = new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 0.9, color: plain ? TONES[k % TONES.length] : EMO[e].color, roughness: plain ? 0.55 : 0.45, metalness: 0 });
    mats.set(id, m); return m;
  }
  const chipMats = [std('#B98049', 0.6), std('#D9A86C', 0.6), std('#8E5A2B', 0.6)];
  const chipGeo = new THREE.BoxGeometry(1, 1, 1);

  // ---------- geometry ----------
  // the plate: a dark floor, a raised rim and hub, and a spoke between every two slots (the outlines of the empty spots)
  const floorGeo = new THREE.CylinderGeometry(R, R, 0.22, 64); floorGeo.rotateX(Math.PI / 2); floorGeo.translate(0, 0, -0.11);
  const rimShape = new THREE.Shape(); rimShape.absarc(0, 0, R, 0, Math.PI * 2, false);
  const rimHole = new THREE.Path(); rimHole.absarc(0, 0, R - RIM, 0, Math.PI * 2, true); rimShape.holes.push(rimHole);
  const rimGeo = new THREE.ExtrudeGeometry(rimShape, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.025, bevelSegments: 2, curveSegments: 64 });
  const hubGeo = new THREE.CylinderGeometry(HUB, HUB, 0.2, 24); hubGeo.rotateX(Math.PI / 2); hubGeo.translate(0, 0, 0.08);
  const backGeo = new THREE.CylinderGeometry(R * 0.98, R * 0.98, 0.04, 64); backGeo.rotateX(Math.PI / 2); backGeo.translate(0, 0, -0.24);
  // slot k runs clockwise from the top: from angle a0 down to a1 (m: its middle)
  function slotAngles(n, k) { const w = Math.PI * 2 / n, a0 = Math.PI / 2 - k * w; return [a0, a0 - w, a0 - w / 2]; }
  const r0 = HUB + 0.06 + BEVEL, r1 = R - RIM - 0.05 - BEVEL;
  // a wedge filling one slot, with gaps to its neighbours and rounded (bevelled) edges, centred on its own centroid
  // (so it squashes and turns about its middle)
  const wedges = new Map();
  function wedge(n, k) {
    const id = n + '|' + k; if (wedges.has(id)) return wedges.get(id);
    const [a0, a1, m] = slotAngles(n, k);
    const g0 = (GAP / 2 + BEVEL) / r0, g1 = (GAP / 2 + BEVEL) / r1; // the gap, as an angle at each end
    const s = new THREE.Shape();
    s.moveTo(r0 * Math.cos(a1 + g0), r0 * Math.sin(a1 + g0));
    s.lineTo(r1 * Math.cos(a1 + g1), r1 * Math.sin(a1 + g1));
    s.absarc(0, 0, r1, a1 + g1, a0 - g1, false);
    s.lineTo(r0 * Math.cos(a0 - g0), r0 * Math.sin(a0 - g0));
    s.absarc(0, 0, r0, a0 - g0, a1 + g0, true);
    const geo = new THREE.ExtrudeGeometry(s, { depth: DEPTH, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelSegments: 3, curveSegments: 20 });
    const th = a0 - a1, cr = (2 / 3) * (r1 ** 3 - r0 ** 3) / (r1 ** 2 - r0 ** 2) * Math.sin(th / 2) / (th / 2);
    const cx = cr * Math.cos(m), cy = cr * Math.sin(m);
    geo.translate(-cx, -cy, 0);
    const flat = new THREE.ShapeGeometry(s, 20); flat.translate(-cx, -cy, DEPTH + BEVEL + 0.01); // the glint over its face
    const w = { geo, flat, cx, cy, m }; wedges.set(id, w); return w;
  }

  // ---------- springs (a value pulled back to 0, overshooting a little) ----------
  const spring = (k, zeta) => ({ x: 0, v: 0, k, c: 2 * Math.sqrt(k) * zeta });
  function step(s, dt) { const n = Math.ceil(dt / (1 / 240)), h = dt / n; for (let i = 0; i < n; i++) { s.v += (-s.k * s.x - s.c * s.v) * h; s.x += s.v * h; } }
  const resting = (s) => Math.abs(s.x) < 1e-4 && Math.abs(s.v) < 1e-3;
  const ease = { outBack: (u) => 1 + 2.4 * (u - 1) ** 3 + 1.4 * (u - 1) ** 2, outCubic: (u) => 1 - (1 - u) ** 3, inCubic: (u) => u * u * u };
  const emit = (type, pie, slot, e) => {
    const detail = { type, convo: pie.key, slot, n: pie.n, e };
    if (opts.onEvent) opts.onEvent(type, detail);
    window.dispatchEvent(new CustomEvent('agenda:pie', { detail }));
  };

  // ---------- the pies ----------
  const tiltQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), TILT);
  const pies = new Map();
  function create(key, n, where) {
    if (pies.has(key)) return;
    const holder = new THREE.Group(), pop = new THREE.Group(), inner = new THREE.Group();
    holder.add(pop); pop.add(inner);
    const [x, z] = where(); holder.position.set(x, Y, z); holder.name = 'pie:' + key;
    const part = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; inner.add(m); return m; };
    part(floorGeo, floorMat); part(rimGeo, lineMat); part(hubGeo, lineMat); part(backGeo, plateMat);
    for (let k = 0; k < n; k++) { // the spokes: thin raised ridges between the slots
      const a = slotAngles(n, k)[0], len = R - RIM - HUB, sp = part(new THREE.BoxGeometry(len, 0.05, 0.12), lineMat);
      sp.position.set(Math.cos(a) * (HUB + len / 2), Math.sin(a) * (HUB + len / 2), 0.06); sp.rotation.z = a;
    }
    const pieces = [];
    for (let k = 0; k < n; k++) {
      const w = wedge(n, k), mesh = new THREE.Mesh(w.geo, woodMat(n, k, 'indifference'));
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.visible = false;
      const glint = new THREE.Mesh(w.flat, new THREE.MeshBasicMaterial({ color: '#FFF6E0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      mesh.add(glint); inner.add(mesh);
      pieces.push({ k, mesh, glint, cx: w.cx, cy: w.cy, m: w.m, e: null, state: 'empty', t: 0, z: spring(1500, 0.2), sq: spring(1100, 0.18), bump: null, flash: 0 });
    }
    scene.add(holder);
    const p = { key, n, where, holder, pop, inner, pieces, shown: true, popT: 0, popDir: 1, dead: false,
      s: spring(240, 0.26), tx: spring(200, 0.24), ty: spring(200, 0.24), chips: [], finale: -1 };
    pies.set(key, p); emit('show', p);
  }
  function destroy(key) { const p = pies.get(key); if (!p || p.dead) return; p.dead = true; p.shown = false; p.popDir = -1; p.popT = 0; emit('hide', p); }
  const filled = (p) => p.pieces.filter((pc) => pc.state === 'fly' || pc.state === 'seated').length;
  function put(key, slot, e) {
    const p = pies.get(key); if (!p || p.dead) return;
    const pc = p.pieces[slot]; if (!pc) return;
    pc.e = e; pc.mesh.material = woodMat(p.n, slot, e);
    pc.state = 'fly'; pc.t = 0; pc.mesh.visible = true; pc.bump = null; pc.z.x = pc.z.v = pc.sq.x = pc.sq.v = 0;
    emit('drop', p, slot, e);
  }
  function take(key, slot) {
    const p = pies.get(key); if (!p || p.dead) return;
    const pc = p.pieces[slot]; if (!pc || pc.state === 'empty' || pc.state === 'out') return;
    pc.state = 'out'; pc.t = 0; p.finale = -1;
    p.s.v += 0.6; // the plate lifts a little as the piece comes out
    emit('take', p, slot, pc.e);
  }

  // the impact of piece pc in pie p
  function snap(p, pc) {
    pc.state = 'seated';
    pc.z.x = -0.07; pc.z.v = 0;         // sunk a hair too deep: springs back up (the click)
    pc.sq.x = -0.3; pc.sq.v = 0;        // squashed flat: rebounds
    pc.flash = 1;                       // the glint
    const dx = Math.cos(pc.m), dy = Math.sin(pc.m);
    p.s.v -= 1.6;                       // the plate dips...
    p.tx.v += -dy * 1.5; p.ty.v += dx * 1.5; // ...and tilts away on the side that was hit
    for (const o of p.pieces) { // the pieces already in: a ripple running round from the impact
      if (o === pc || o.state !== 'seated') continue;
      const d = Math.min(Math.abs(o.k - pc.k), p.n - Math.abs(o.k - pc.k));
      o.bump = { t: -0.03 * d, h: 0.07 / d };
    }
    for (let i = 0; i < 7; i++) { // wood chips out of the joint: from the outer edge and the two sides
      const side = i % 3, w = Math.PI * 2 / p.n, a = pc.m + (side === 0 ? (Math.random() - 0.5) * w * 0.8 : (side === 1 ? 0.5 : -0.5) * w);
      const r = side === 0 ? r1 + 0.05 : r0 + Math.random() * (r1 - r0);
      const c = new THREE.Mesh(chipGeo, chipMats[i % 3]), s = 0.08 + Math.random() * 0.08;
      c.scale.set(s, s * 0.6, s * 0.4);
      c.position.set(Math.cos(a) * r, Math.sin(a) * r, REST_Z + DEPTH);
      const out = side === 0 ? 1 : 0.4, tg = side === 0 ? 0 : (side === 1 ? 1 : -1);
      const vx = Math.cos(pc.m) * out * 2.2 + -Math.sin(a) * tg * 1.6, vy = Math.sin(pc.m) * out * 2.2 + Math.cos(a) * tg * 1.6;
      c.userData.chip = { v: new THREE.Vector3(vx + (Math.random() - 0.5), vy + (Math.random() - 0.5) + 1.2, 1.5 + Math.random() * 1.5), spin: new THREE.Vector3(Math.random() * 20, Math.random() * 20, Math.random() * 20), life: 0, s };
      p.inner.add(c); p.chips.push(c);
    }
    emit('snap', p, pc.k, pc.e);
    if (p.pieces.every((o) => o.state === 'seated')) { p.finale = 0.14; emit('full', p); }
  }

  const tangent = new THREE.Vector3(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), zAxis = new THREE.Vector3(0, 0, 1);
  function update(dt, camera) {
    for (const p of pies.values()) {
      p.holder.quaternion.copy(camera.quaternion).multiply(tiltQ);
      // over the conversation's middle, easing there as it moves
      const [x, z] = p.dead ? [p.holder.position.x, p.holder.position.z] : p.where(), k = Math.min(1, dt * 6);
      p.holder.position.x += (x - p.holder.position.x) * k; p.holder.position.z += (z - p.holder.position.z) * k;
      if (p.popDir) { // popping up (or away)
        p.popT = Math.min(1, p.popT + dt / (p.popDir > 0 ? 0.38 : 0.22));
        const e = p.popDir > 0 ? ease.outBack(p.popT) : 1 - ease.inCubic(p.popT);
        p.pop.scale.setScalar(Math.max(0.001, e)); p.pop.rotation.z = (1 - e) * 0.5; p.pop.position.y = (1 - e) * -R * 0.6;
        if (p.popT >= 1) {
          if (p.popDir < 0) { scene.remove(p.holder); p.holder.traverse((m) => { if (m.isMesh && m.geometry.type === 'BoxGeometry' && m.geometry !== chipGeo) m.geometry.dispose(); }); pies.delete(p.key); continue; }
          p.popDir = 0;
        }
      }
      for (const s of [p.s, p.tx, p.ty]) step(s, dt); // the plate's own springs
      p.inner.scale.setScalar(1 + p.s.x * 0.12);
      p.inner.rotation.set(p.tx.x * 0.25, p.ty.x * 0.25, 0);
      if (p.finale >= 0) { // the full pie: one wave round, then a pop
        p.finale -= dt;
        if (p.finale < 0) { p.pieces.forEach((o, i) => { o.bump = { t: -0.045 * i, h: 0.13 }; }); p.s.v += 2.4; p.finale = -1; }
      }
      for (const pc of p.pieces) {
        const mesh = pc.mesh;
        if (pc.state === 'empty') continue;
        let z = REST_Z, off = 0, twist = 0, tilt = 0, sc = 1, sz = 1;
        if (pc.state === 'fly') {
          pc.t += dt;
          const u = Math.min(1, pc.t / FLY), back = (1 - u) * (1 - u);
          z += DROP_H * (1 - u * u);        // accelerating in: fastest at the moment it lands
          off = 0.55 * back; twist = 0.75 * back; tilt = 0.55 * back;
          sc = 0.55 + 0.45 * ease.outCubic(Math.min(1, u * 1.7));
          if (u >= 1) snap(p, pc);
        } else if (pc.state === 'out') { // lifted out: up, outward and away
          pc.t += dt;
          const u = Math.max(0, Math.min(1, pc.t / 0.3));
          z += 1.2 * ease.outCubic(u); off = 0.9 * ease.outCubic(u); sc = Math.max(0.001, 1 - ease.inCubic(u)); twist = -0.6 * u;
          if (u >= 1) { pc.state = 'empty'; mesh.visible = false; continue; }
        }
        if (pc.state === 'seated') {
          step(pc.z, dt); step(pc.sq, dt);
          z += pc.z.x; sz = 1 + pc.sq.x; sc = 1 - pc.sq.x * 0.3;
          if (pc.bump) {
            pc.bump.t += dt;
            const u = pc.bump.t / 0.17;
            if (u > 0 && u < 1) z += pc.bump.h * Math.sin(Math.PI * u); else if (u >= 1) pc.bump = null;
          }
        }
        const dx = Math.cos(pc.m), dy = Math.sin(pc.m);
        mesh.position.set(pc.cx + dx * off, pc.cy + dy * off, z);
        tangent.set(-dy, dx, 0);
        mesh.quaternion.copy(qa.setFromAxisAngle(zAxis, twist)).multiply(qb.setFromAxisAngle(tangent, -tilt));
        mesh.scale.set(sc, sc, sc * sz);
        if (pc.flash > 0) { pc.flash = Math.max(0, pc.flash - dt / 0.26); pc.glint.material.opacity = 0.55 * pc.flash ** 2; } // the glint
      }
      for (let i = p.chips.length - 1; i >= 0; i--) { // the chips: thrown out, falling, spinning, shrinking away
        const c = p.chips[i], d = c.userData.chip;
        d.life += dt; d.v.y -= 14 * dt; d.v.multiplyScalar(1 - 1.5 * dt);
        c.position.addScaledVector(d.v, dt);
        c.rotation.x += d.spin.x * dt; c.rotation.y += d.spin.y * dt; c.rotation.z += d.spin.z * dt;
        const q = Math.max(0, 1 - Math.max(0, d.life - 0.25) / 0.25);
        c.scale.set(d.s * q, d.s * 0.6 * q, d.s * 0.4 * q);
        if (d.life > 0.5) { p.inner.remove(c); p.chips.splice(i, 1); }
      }
    }
  }
  const moving = (p) => { const [x, z] = p.dead ? [0, 0] : p.where(); return !p.dead && Math.hypot(x - p.holder.position.x, z - p.holder.position.z) > 0.01; };
  const busy = () => [...pies.values()].some((p) => p.popDir || moving(p) || p.chips.length || p.finale >= 0 || ![p.s, p.tx, p.ty].every(resting)
    || p.pieces.some((pc) => pc.state === 'fly' || pc.state === 'out' || pc.bump || pc.flash > 0 || (pc.state === 'seated' && !(resting(pc.z) && resting(pc.sq)))));
  const state = (key) => { const p = pies.get(key); return p ? { n: p.n, filled: filled(p), shown: p.shown } : null; };
  return { create, destroy, put, take, update, busy, state, list: pies };
};
