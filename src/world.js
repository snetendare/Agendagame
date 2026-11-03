// ===== The world: the room (floor and walls), the characters and the camera =====
// World(THREE, el) builds the scene into el and draws it whenever something changed (the camera moving, a resize, the
// first frame, a pie animating). The board is BOARD.cols x BOARD.rows tiles of BOARD.tile metres, centred on the origin.
const BOARD = { cols: 20, rows: 8, tile: 6 }; // NML's tiles (6 m), on a wider board: 120 x 48 m

const World = (THREE, el, opts = {}) => {
  const T = BOARD.tile, BW = BOARD.cols * T, BD = BOARD.rows * T;

  // ---------- three.js basics, set up as on NML's 3D board ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  el.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = 'none';
  el.addEventListener('touchmove', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  const scene = new THREE.Scene();
  // indoors, in the evening: a dark house round the room, warm light from above (the chandeliers, later)
  scene.background = new THREE.Color('#15100D');
  scene.fog = new THREE.Fog('#15100D', 90, 220);
  const camera = new THREE.PerspectiveCamera(35, 1, 1, 600);
  scene.add(new THREE.HemisphereLight('#FFE6C7', '#2A1D15', 1.5));
  const sun = new THREE.DirectionalLight('#FFEBCF', 2.1);
  sun.position.set(-18, 60, 22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096); // NML: 2048 for its 72 x 96 m board; this one is wider
  Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 60, bottom: -60, near: 1, far: 180 });
  scene.add(sun);

  // ---------- the floor: polished parquet with the tile grid in its joints ----------
  const floorTex = new THREE.CanvasTexture(Floor.paint(BOARD.cols, BOARD.rows, 96));
  floorTex.colorSpace = THREE.SRGBColorSpace;
  floorTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(BW, BD), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.42, metalness: 0 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  // outside the room: dark
  const around = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshLambertMaterial({ color: '#0F0B09' }));
  around.rotation.x = -Math.PI / 2; around.position.y = -0.05;
  scene.add(around);
  // the walls (the one the camera looks in over drops low)
  const room = Room(THREE, scene, BW, BD);
  let dirty = true;

  // ---------- the people ----------
  const match = opts.match || Match();
  const furniture = Furniture(THREE, scene, BOARD);
  const people = Characters(THREE, scene, BOARD, match, new Set([...furniture.blocked, ...furniture.seatTiles]));
  const pies = Pies(THREE, scene, people, { onEvent: (type, detail) => opts.onPie && opts.onPie(type, detail) });
  const moves = Movement(THREE, scene, BOARD, people, furniture, { me: opts.me || 0 });

  // ---------- taps: on a person or a piece of furniture opens a popup over it; on a tile walks you there ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function personAt(cx, cy) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects([...people.list.map((n) => n.group), ...pies.targets()], true).find((h) => h.object.userData.who != null);
    return hit ? hit.object.userData.who : null;
  }
  function furnitureAt() { // (after personAt, which aimed the ray)
    const hit = ray.intersectObjects(furniture.targets(), true).find((h) => h.object.userData.furniture != null);
    return hit ? hit.object.userData.furniture : null;
  }

  // ---------- the popup: over a piece of furniture (sit down, get up), over a person (talk, join, listen, speak up,
  // pull aside, leave), or over someone asking you (accept) ----------
  const ui = opts.ui || {}, pop = ui.popup; // { el, name, info, go } (elements, from the page)
  let popFor = null; // { kind: 'furniture', f } | { kind: 'person', id } | { kind: 'ask', from, ask, answer }
  const meId = () => moves.mine().id;
  const mySeatAt = (f) => { const me = moves.mine(); return me.seat && me.seat.furniture === f.id ? me.seat : null; };
  // a white ring under the person the popup is about (gold is for you)
  const pick = new THREE.Mesh(new THREE.RingGeometry(people.radius * 1.3, people.radius * 1.3 + 0.28, 48),
    new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  pick.rotation.x = -Math.PI / 2; pick.position.y = 0.055; pick.renderOrder = 2; pick.visible = false; scene.add(pick);
  function openPop(p) {
    if (!pop) return;
    if (popFor && popFor.kind === 'ask' && p.kind !== 'ask') popFor.answer(false);
    popFor = p; refreshPop();
    furniture.highlight(p.kind === 'furniture' ? p.f.id : null);
    pop.el.hidden = false; placePop(); dirty = true;
  }
  function refreshPop() { // its text, again as things change
    const p = popFor;
    if (p.kind === 'furniture') {
      const f = p.f, mine = mySeatAt(f), free = furniture.free(f).length, n = f.seats.length;
      pop.name.textContent = f.name;
      pop.info.textContent = n === 1 ? (mine ? 'Your seat' : free ? 'Free' : 'Taken') : `${free} of ${n} ${f.kind === 'mingle' ? 'places' : 'seats'} free`;
      pop.go.textContent = mine ? (mine.pose === 'sit' ? 'Get up' : 'Leave table') : f.verb;
      pop.go.disabled = !mine && !free; pop.go.hidden = false;
    } else if (p.kind === 'person') {
      const o = social.options(meId(), p.id);
      pop.name.textContent = p.id === meId() ? 'You' : 'Guest';
      pop.info.textContent = o.info; p.act = o.act;
      pop.go.hidden = !o.label; pop.go.textContent = o.label || ''; pop.go.disabled = !!o.disabled;
    } else {
      pop.name.textContent = 'Guest';
      pop.info.textContent = p.ask === 'invite' ? 'Invites you to join them' : 'Wants to talk to you';
      pop.go.hidden = false; pop.go.textContent = 'Accept'; pop.go.disabled = false;
    }
  }
  function closePop() {
    if (pop) pop.el.hidden = true;
    if (popFor && popFor.kind === 'ask') popFor.answer(false);
    if (popFor) dirty = true;
    popFor = null; furniture.highlight(null);
  }
  const v3 = new THREE.Vector3();
  function placePop() {
    pick.visible = !!popFor && popFor.kind !== 'furniture';
    if (!popFor || !pop) return;
    let x, y, z;
    if (popFor.kind === 'furniture') { [x, z] = furniture.middle(popFor.f); y = popFor.f.top + 1.5; }
    else {
      const id = popFor.kind === 'person' ? popFor.id : popFor.from, g = people.list[id].group;
      x = g.position.x; z = g.position.z; y = people.height + (pies.state(id).shown ? 6.2 : 1.2);
      pick.position.x = x; pick.position.z = z;
    }
    const r = renderer.domElement.getBoundingClientRect();
    v3.set(x, y, z).project(camera);
    if (v3.z > 1) { pop.el.style.visibility = 'hidden'; return; }
    pop.el.style.visibility = '';
    const w = pop.el.offsetWidth, h = pop.el.offsetHeight;
    const px = Math.max(8, Math.min(r.width - w - 8, (v3.x + 1) / 2 * r.width - w / 2)), py = Math.max(8, Math.min(r.height - h - 8, (1 - v3.y) / 2 * r.height - h - 10));
    pop.el.style.transform = `translate(${px}px, ${py}px)`;
  }
  if (pop) pop.go.addEventListener('click', () => {
    const p = popFor; if (!p) return;
    const me = moves.mine();
    if (p.kind === 'furniture') {
      social.playerMoved(me.id);
      if (mySeatAt(p.f)) moves.leave(me.id);
      else {
        const pos = me.group.position, free = furniture.free(p.f).sort((a, b) => Math.hypot(a.x - pos.x, a.z - pos.z) - Math.hypot(b.x - pos.x, b.z - pos.z));
        for (const s of free) if (moves.sit(me.id, s)) break;
      }
    } else if (p.kind === 'person') { if (p.act) p.act(); }
    else { const a = p.answer; popFor = null; a(true); }
    closePop(); dirty = true;
  });
  // a short line about what just happened
  let toastT = 0;
  function toast(text) { if (!ui.toast) return; ui.toast.textContent = text; ui.toast.hidden = false; toastT = 3; }

  // ---------- the party's social life ----------
  const social = Social(people, furniture, moves, pies, match, BOARD, {
    me: meId, toast, onChange: () => { dirty = true; },
    askPlayer: (from, kind, answer) => {
      let over = false; const once = (ok) => { if (over) return; over = true; answer(ok); };
      if (popFor && popFor.kind !== 'ask') return; // busy with something else: no answer is an answer
      openPop({ kind: 'ask', from, ask: kind, answer: once });
    },
  });
  // what NPCs ask an accepted player: an invitation takes you there
  // (handled in Social: accepting an invite makes your figure walk to the group or the table)

  // ---------- dev labels: each person's type, what they're doing and their mood ----------
  let dev = false;
  const labels = people.list.map(() => { if (!ui.labels) return null; const d = document.createElement('div'); d.className = 'dev'; d.hidden = true; ui.labels.appendChild(d); return d; });
  function placeLabels() {
    if (!ui.labels) return;
    const r = renderer.domElement.getBoundingClientRect();
    people.list.forEach((p, i) => {
      const d = labels[i]; d.hidden = !dev; if (!dev) return;
      v3.set(p.group.position.x, people.height * 0.55, p.group.position.z).project(camera);
      d.textContent = social.debug(i);
      d.style.transform = `translate(${(v3.x + 1) / 2 * r.width}px, ${(1 - v3.y) / 2 * r.height}px) translate(-50%, -50%)`;
    });
  }
  // ---------- the camera: NML's controls, starting in (and going back to) the tilted view ----------
  const cam = Camera3D(THREE, camera, renderer.domElement, {
    width: BW, depth: BD, home: 1, farTop: room.height, tapsEverywhere: true,
    onInput: () => { dirty = true; },
    onTap: (point, cx, cy) => {
      const id = personAt(cx, cy);
      if (id != null) { openPop({ kind: 'person', id }); return; }
      const f = furnitureAt();
      if (f != null) { openPop({ kind: 'furniture', f: furniture.list[f] }); return; }
      closePop();
      const t = point && people.tileOf(point.x, point.z);
      if (t) { social.playerMoved(meId()); moves.moveTo(meId(), t.col, t.row); dirty = true; }
    },
  });

  function size() {
    const w = el.clientWidth || window.innerWidth, h = el.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
    cam.resize(w, h);
    dirty = true;
  }
  window.addEventListener('resize', size);
  size();

  let last = performance.now(), frozen = false; // freeze(true) stops drawing (for stepping frames by hand in tests)
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    social.update(dt);
    if (popFor) refreshPop();
    if (toastT > 0 && (toastT -= dt) <= 0) ui.toast.hidden = true;
    if (dev) dirty = true;
    if (!frozen && (dirty || cam.busy() || pies.busy() || moves.busy())) {
      dirty = false;
      cam.update(dt);
      room.update(camera);
      moves.update(dt);
      pies.update(dt, camera);
      // the fog and the far plane follow how far back the camera stands: a tall phone screen has to stand far
      // back to fit the wide board, further than NML's fog (90 to 220 m) reaches
      const d = camera.position.length();
      scene.fog.near = Math.max(90, d * 0.85); scene.fog.far = Math.max(220, d * 2.2);
      if (Math.abs(camera.far - Math.max(600, d * 3)) > 1) { camera.far = Math.max(600, d * 3); camera.updateProjectionMatrix(); }
      renderer.render(scene, camera);
      placePop(); placeLabels();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return { scene, camera: cam, cam3: camera, match, people, furniture, pies, moves, social, closePop, showTypes: (on) => { dev = on; dirty = true; if (!on) placeLabels(); }, setMe: (p) => { moves.setMe(p); dirty = true; }, renderer, render: () => { dirty = true; }, freeze: (on) => { frozen = on; dirty = true; } };
};
